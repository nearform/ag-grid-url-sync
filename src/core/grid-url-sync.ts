import type { FilterModel, GridApi } from 'ag-grid-community'
import type {
  ApplyResult,
  FilterState,
  GridUrlSync,
  GridUrlSyncOptions,
  GridUrlSyncSnapshot,
  IssueCode,
  IssueSource,
  ResolvedOptions,
  SyncStatus
} from './types.js'
import { URLSyncError } from './types.js'
import { DEFAULT_CONFIG } from './options.js'
import { codecOptions, individual } from './codecs.js'
import { reportIssue, rethrowIfThrown, toIssue } from './issues.js'
import { toError } from './to-error.js'
import { parseUrlFilters } from './url-parser.js'
import { generateUrl } from './url-generator.js'
import { resolveParamPrefix } from './individual-params.js'
import {
  fromGridModel,
  getFilterModel,
  toGridModel
} from './grid-integration.js'
import type { GridView } from './view-storage.js'
import type { Classified, Columns, OwnWrite, WriteKind } from './own-write.js'
import {
  classifyEvent,
  modelKey,
  settleWrite,
  startWrite
} from './own-write.js'

// createGridUrlSync (#221): the framework-free sync. It owns its grid
// listeners and keeps one snapshot for useSyncExternalStore. Nothing here
// reads window when the module loads.

const NO_ISSUES: readonly URLSyncError[] = Object.freeze([])
const NO_VIEWS: readonly GridView[] = Object.freeze([])

/** The snapshot when there is no sync yet, for the React hook (#222) */
export const IDLE_SNAPSHOT: GridUrlSyncSnapshot = Object.freeze({
  status: 'idle',
  url: '',
  hasFilters: false,
  issues: NO_ISSUES,
  views: NO_VIEWS,
  activeViewId: null
})

/**
 * How a call treats its issues. `'collect'`: keep them only. `'report'`: keep
 * them and send each to onIssue. `'throw'`: as `'report'`, and throwOnError
 * can throw one (only in methods that the app calls).
 */
type IssueMode = 'collect' | 'report' | 'throw'

/** The write kinds with keys in the model form. A URL write has its own path. */
type ModelWriteKind = Exclude<WriteKind, 'url'>

interface Call {
  source: IssueSource
  options: ResolvedOptions
  issues: URLSyncError[]
}

function hasWindow(): boolean {
  return typeof window !== 'undefined'
}

/** Two issue lists with the same code, column and message in each place */
function sameIssues(
  a: readonly URLSyncError[],
  b: readonly URLSyncError[]
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (issue, index) =>
        issue.code === b[index]?.code &&
        issue.column === b[index]?.column &&
        issue.message === b[index]?.message
    )
  )
}

/**
 * Makes a sync between one grid and the URL. It applies the address bar's
 * filters to the grid (a URL with no filters keeps the grid's filters), then
 * follows the grid's filter changes.
 *
 * @example
 * ```ts
 * const sync = createGridUrlSync({ api: gridApi, history: 'replace' })
 * sync.subscribe(() => render(sync.getSnapshot()))
 * ```
 */
export function createGridUrlSync(options: GridUrlSyncOptions): GridUrlSync {
  const { api, onIssue, views } = options
  const codec = codecOptions(options.codec ?? individual())
  const maxValueLength = options.maxValueLength ?? DEFAULT_CONFIG.maxValueLength

  const listeners = new Set<() => void>()
  let status: SyncStatus = 'active'
  let state: FilterState = {}
  let url = ''
  let applyIssues: readonly URLSyncError[] = NO_ISSUES
  let readIssues: readonly URLSyncError[] = NO_ISSUES
  let writeIssues: readonly URLSyncError[] = NO_ISSUES
  const historyMode = options.history ?? 'none'
  // The sync's own latest grid write. The filterChanged events that it causes
  // must not be written to history (#273).
  let own: OwnWrite | null = null
  // The issue source of the call that made the own write, for its landing
  // in a later event
  let ownSource: IssueSource = 'grid'
  const listensToPopstate = options.popstate ?? historyMode === 'push'
  // The tracked saved view. `model` is its landed model, null while pending.
  let active: { id: string; model: FilterModel | null } | null = null
  let viewList: readonly GridView[] = NO_VIEWS
  let snapshot: GridUrlSyncSnapshot = IDLE_SNAPSHOT

  /**
   * Sends an issue to onIssue. An error from the app's handler is reported
   * out of band, so it cannot stop the sync's own work (a create that throws
   * would leak its listeners).
   */
  function emit(issue: URLSyncError, source: IssueSource): void {
    try {
      onIssue?.({ issue, source })
    } catch (error) {
      reportLater(toError(error))
    }
  }

  function startCall(source: IssueSource, mode: IssueMode): Call {
    const issues: URLSyncError[] = []

    return {
      source,
      issues,
      options: {
        ...codec,
        maxValueLength,
        onParseError: error => {
          // reportIssue only sends URLSyncError here
          if (!(error instanceof URLSyncError)) return

          issues.push(error)

          if (mode !== 'collect') emit(error, source)
        },
        throwOnError: mode === 'throw' ? (options.throwOnError ?? false) : false
      }
    }
  }

  /** Reports a caught error as an issue of the call */
  function fail(call: Call, cause: unknown, code: IssueCode) {
    rethrowIfThrown(cause)
    reportIssue(call.options, toIssue(cause, code))
  }

  /** Reads the store's list. The old array stays when nothing changed. */
  function refreshViews(): void {
    if (!views) return

    const next = views.listViews()

    if (!sameViews(viewList, next)) viewList = Object.freeze(next)
  }

  /** Reports NOT_READY for a method that needs an active sync */
  function notReady(): void {
    const call = startCall('api', 'throw')

    fail(
      call,
      new URLSyncError('The sync is destroyed', undefined, {
        code: 'NOT_READY'
      }),
      'NOT_READY'
    )
  }

  /** Builds a new snapshot, and tells the listeners, when something changed */
  function publish(): void {
    const list = [...applyIssues, ...readIssues, ...writeIssues]
    const hasFilters = Object.keys(state).length > 0
    const sameList = sameIssues(snapshot.issues, list)
    const activeViewId = active?.id ?? null

    if (
      snapshot.status === status &&
      snapshot.url === url &&
      snapshot.hasFilters === hasFilters &&
      snapshot.views === viewList &&
      snapshot.activeViewId === activeViewId &&
      sameList
    ) {
      return
    }

    // The same issues keep the same array, so a URL change alone does not
    // give React a new issues value (#222)
    const issues = sameList
      ? snapshot.issues
      : list.length
        ? Object.freeze(list)
        : NO_ISSUES

    snapshot = Object.freeze({
      status,
      url,
      hasFilters,
      issues,
      views: viewList,
      activeViewId
    })

    // A copy, so a listener that unsubscribes during notify stops no other
    // one. A listener's error is reported out of band, so it stops neither
    // the other listeners nor AG Grid's other filterChanged listeners.
    for (const listener of Array.from(listeners)) {
      try {
        listener()
      } catch (error) {
        reportLater(toError(error))
      }
    }
  }

  /**
   * Reads the grid's filters and the URL for them. Only the issues that the
   * last read did not have go to onIssue, so a read after an apply and the
   * late filterChanged do not report the same issue twice.
   */
  function readGrid(): void {
    const call = startCall('grid', 'collect')

    try {
      state = getFilterModel(api, call.options)
    } catch (cause) {
      fail(call, cause, 'GRID_ERROR')
    }

    url = hasWindow()
      ? generateUrl(window.location.href, state, call.options)
      : ''

    const known = new Set(readIssues.map(issueKey))

    for (const issue of call.issues) {
      if (!known.has(issueKey(issue))) emit(issue, 'grid')
    }

    readIssues = call.issues.length ? call.issues : NO_ISSUES
  }

  /**
   * Applies the filters of a URL. On create, a URL that gives no filters
   * keeps the grid's filters.
   */
  function apply(
    target: string,
    source: IssueSource,
    mode: IssueMode,
    onCreate: boolean
  ): ApplyResult {
    const call = startCall(source, mode)
    let filters: FilterState | undefined

    try {
      filters = parseUrlFilters(target, call.options)
    } catch (cause) {
      fail(call, cause, 'INVALID_URL')
    }

    const applies = filters && !(onCreate && Object.keys(filters).length === 0)
    const before = applies ? liveState() : null

    let failed = false

    if (filters && applies) {
      let model: FilterModel | undefined

      try {
        model = toGridModel(filters, api, call.options)
      } catch (cause) {
        own = null
        failed = true
        fail(call, cause, 'GRID_ERROR')
      }

      if (model) failed = !setModel(model, 'url', call)
    }

    applyIssues = call.issues.length ? call.issues : NO_ISSUES
    readGrid()

    if (filters && applies && settleUrlWrite(filters, before, failed)) {
      followActiveView('url')
    }

    publish()

    return { issues: call.issues }
  }

  /**
   * Calls setFilterModel as the sync's own write of the kind. False when the
   * grid threw: the call gets GRID_ERROR.
   */
  function setModel(model: FilterModel, kind: WriteKind, call: Call): boolean {
    // Before the call, so an event inside it is known as ours (#273). A
    // pending write stays known: a deferred grid lands it first.
    own = startWrite(own, kind)
    ownSource = call.source

    // Only the grid call is in the try. An issue report runs outside it, so
    // a handler that throws gets its own error back (#220).
    try {
      api.setFilterModel(model)

      return true
    } catch (cause) {
      own = null
      fail(call, cause, 'GRID_ERROR')

      return false
    }
  }

  /**
   * Writes a model to the grid as the sync's own write, with keys in the
   * model form. Reads the grid after the call, and at a landing applies the
   * active-view rule. False when the grid threw.
   */
  function writeModel(
    model: FilterModel,
    kind: ModelWriteKind,
    call: Call
  ): boolean {
    const before = liveModel()

    if (!setModel(model, kind, call)) return false

    const accepted = acceptedPart(model)
    const after = liveModel()

    const settled = settleWrite(own, {
      kind,
      failed: false,
      afterKey: after ? modelKey(after) : null,
      before,
      beforeKey: before ? modelKey(before) : null,
      accepted,
      acceptedKey: modelKey(accepted),
      acceptedUrlKey: urlKey(accepted)
    })

    own = settled.own
    readGrid()

    if (settled.landed) {
      followActiveView(kind)
      writeLanding(kind, call.source)
    }

    return true
  }

  /** The grid's filters now, or null when the grid cannot be read */
  function liveState(): FilterState | null {
    try {
      return getFilterModel(api, startCall('grid', 'collect').options)
    } catch {
      return null
    }
  }

  /** The grid's AG Grid model now, or null when the grid cannot be read */
  function liveModel(): FilterModel | null {
    try {
      // AG Grid can hand back null despite the declared return type
      return api.getFilterModel() ?? {}
    } catch {
      return null
    }
  }

  /** The key of the grid's columns now, in the form of the write kind */
  function liveKey(kind: WriteKind): string | null {
    if (kind === 'url') {
      const live = liveState()

      return live ? filtersKey(live) : null
    }

    const live = liveModel()

    return live ? modelKey(live) : null
  }

  /** The key of a model's URL form: the filters that the codec makes of it */
  function urlKey(model: Columns): string {
    return filtersKey(
      fromGridModel(model, startCall('grid', 'collect').options)
    )
  }

  /** Whether the grid shows this model now */
  function shows(model: FilterModel | null): boolean {
    if (model === null) return false

    const live = liveModel()

    return live !== null && modelKey(live) === modelKey(model)
  }

  /**
   * The active-view rule (D2), after each landing and each change. A view
   * write that lands keeps the model that the grid made of it. Any other
   * grid model clears the active view and its stored pointer.
   */
  function followActiveView(landing: WriteKind | null): void {
    if (!active) return

    if (landing === 'view' || landing === 'restore') {
      active = { id: active.id, model: liveModel() }

      return
    }

    if (shows(active.model)) return

    active = null
    persistPointer(null, startCall('grid', 'report'))
  }

  /** Writes the stored pointer. A storage error is an issue of the call. */
  function persistPointer(id: string | null, call: Call): void {
    try {
      views?.persistActiveViewId(id)
    } catch (cause) {
      fail(call, cause, 'STORAGE_WRITE_FAILED')
    }
  }

  /**
   * After the sync's own setFilterModel returns: did the write land, or does
   * the grid take it later? `state` is the grid's filters after the call.
   * True when the write landed.
   */
  function settleUrlWrite(
    filters: FilterState,
    before: FilterState | null,
    failed: boolean
  ): boolean {
    const accepted = acceptedPart(filters)

    const settled = settleWrite(own, {
      kind: 'url',
      failed,
      afterKey: filtersKey(state),
      before,
      beforeKey: before ? filtersKey(before) : null,
      accepted,
      acceptedKey: filtersKey(accepted)
    })

    own = settled.own

    return settled.landed
  }

  /** The filters of the columns that the grid has */
  function acceptedPart(filters: Columns): Columns {
    // A test double or an old AG Grid version can lack getColumn
    if (!('getColumn' in api)) return filters

    return Object.fromEntries(
      Object.entries(filters).filter(([colId]) => {
        try {
          return api.getColumn(colId) !== null
        } catch {
          return true
        }
      })
    )
  }

  /**
   * What a filterChanged is: an echo or the landing of the sync's own write,
   * or a change. The key has the form of the write's kind: `state` (the URL
   * form) for a URL write, the grid's model for the others (and its URL form
   * while the write is pending). A change ends the own write.
   */
  function classify(source: string | undefined): Classified {
    const modelForm = own !== null && own.kind !== 'url'
    const live = modelForm ? (liveModel() ?? {}) : state

    const result = classifyEvent(own, {
      key: modelForm ? modelKey(live) : filtersKey(state),
      live,
      source,
      // Only a pending model write needs the URL form
      urlKey: modelForm && own?.phase === 'pending' ? urlKey(live) : undefined
    })

    own = result.own

    return result
  }

  /** Whether a URL has a param that the codec reads, even one that is bad */
  function hasFilterParams(target: string): boolean {
    const prefix = resolveParamPrefix(codec.paramPrefix)

    try {
      return Array.from(new URL(target).searchParams.keys()).some(
        key => key.startsWith(prefix) || key === codec.groupedParam
      )
    } catch {
      return false
    }
  }

  /**
   * A key for a filter state that does not depend on the order of the
   * filters or of the page's params
   */
  function filtersKey(filters: FilterState): string {
    const sorted = Object.fromEntries(Object.entries(filters).sort(byColumnId))

    return generateUrl(
      'http://key.invalid/',
      sorted,
      startCall('grid', 'collect').options
    )
  }

  /** Writes the snapshot's URL to the address bar, or gives it to the router */
  function write(source: IssueSource, replace: boolean): void {
    try {
      if (historyMode instanceof Function) {
        historyMode(url)
      } else if (replace || historyMode === 'replace') {
        window.history.replaceState(window.history.state, '', url)
      } else {
        window.history.pushState(window.history.state, '', url)
      }

      writeIssues = NO_ISSUES
    } catch (cause) {
      const issue = toIssue(cause, 'HISTORY_WRITE_FAILED')
      writeIssues = [issue]
      emit(issue, source)
    }
  }

  /** Writes a filter change, unless the address bar has the same filters */
  function writeChange(source: IssueSource, replace: boolean): void {
    if (historyMode === 'none' || !hasWindow()) return

    const key = filtersKey(state)

    const current = parseUrlFilters(
      window.location.href,
      startCall('grid', 'collect').options
    )

    if (key === filtersKey(current)) return

    write(source, replace)
  }

  /**
   * At an own write's landing: a view or app write goes to history as a user
   * edit does (D3), and the restore on create replaces the entry. A URL
   * write does not, because the URL holds those filters already (#273).
   */
  function writeLanding(kind: WriteKind, source: IssueSource): void {
    if (kind !== 'url') writeChange(source, kind === 'restore')
  }

  function onFilterChanged(event?: { source?: string }): void {
    if (status !== 'active') return

    // Inside the sync's own setFilterModel: the write lands. The writer
    // reads the grid and publishes after the call.
    if (own?.phase === 'writing') {
      const key = liveKey(own.kind)
      own = key === null ? null : { phase: 'landed', kind: own.kind, key }

      return
    }

    readGrid()

    const result = classify(event?.source)

    if (result.kind !== 'echo') {
      followActiveView(result.kind === 'landing' ? result.write : null)
    }

    if (result.kind === 'change') writeChange('grid', false)

    if (result.kind === 'landing' && result.write !== null) {
      writeLanding(result.write, ownSource)
    }

    publish()
  }

  /** The back or forward button: apply the new address bar */
  function onPopstate(): void {
    if (status !== 'active') return

    apply(window.location.href, 'url', 'report', false)
  }

  function destroy(): void {
    if (status === 'destroyed') return

    status = 'destroyed'

    if (listensToPopstate && hasWindow()) {
      window.removeEventListener('popstate', onPopstate)
    }

    api.removeEventListener('filterChanged', onFilterChanged)
    api.removeEventListener('gridPreDestroyed', destroy)
    publish()
  }

  const sync: GridUrlSync = {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },

    applyUrl(target) {
      if (status !== 'active') {
        notReady()

        return { issues: NO_ISSUES }
      }

      const href = target ?? (hasWindow() ? window.location.href : undefined)

      if (href === undefined) return { issues: NO_ISSUES }

      return apply(href, 'api', 'throw', false)
    },

    applyFilters(filters) {
      if (status !== 'active') {
        notReady()

        return { issues: NO_ISSUES }
      }

      const call = startCall('api', 'throw')
      let model: FilterModel | undefined

      try {
        model = toGridModel(filters, api, call.options)
      } catch (cause) {
        fail(call, cause, 'GRID_ERROR')
      }

      if (model) writeModel(model, 'app', call)

      applyIssues = call.issues.length ? call.issues : NO_ISSUES
      publish()

      return { issues: call.issues }
    },

    getUrl(baseUrl) {
      const base = baseUrl ?? (hasWindow() ? window.location.href : undefined)

      if (base === undefined) return ''

      const call = startCall('api', 'throw')
      let filters = state

      if (status === 'active') {
        try {
          filters = getFilterModel(api, call.options)
        } catch (cause) {
          fail(call, cause, 'GRID_ERROR')
        }
      }

      try {
        return generateUrl(base, filters, call.options)
      } catch (cause) {
        fail(call, cause, 'INVALID_URL')

        return ''
      }
    },

    saveView(name) {
      if (!views) return null

      if (status !== 'active') {
        notReady()

        return null
      }

      const call = startCall('api', 'throw')
      let model: FilterModel

      try {
        // AG Grid can hand back null despite the declared return type
        model = api.getFilterModel() ?? {}
      } catch (cause) {
        fail(call, cause, 'GRID_ERROR')

        return null
      }

      let view: GridView

      try {
        view = views.saveView(name, model)
      } catch (cause) {
        fail(call, cause, 'STORAGE_WRITE_FAILED')

        return null
      }

      active = { id: view.id, model }
      refreshViews()
      publish()

      return view
    },

    loadView(id) {
      if (!views) return

      if (status !== 'active') {
        notReady()

        return
      }

      const call = startCall('api', 'throw')

      // null clears the filters. A JavaScript caller can also pass undefined.
      const wanted = id ?? null

      const view =
        wanted === null
          ? null
          : views.listViews().find(candidate => candidate.id === wanted)

      if (view === undefined) {
        // Another tab can have deleted it: read the list again
        refreshViews()
        publish()
        fail(
          call,
          new URLSyncError(`No saved view with id "${wanted}"`, undefined, {
            code: 'VIEW_NOT_FOUND'
          }),
          'VIEW_NOT_FOUND'
        )

        return
      }

      const previous = active

      // Before the write, so no snapshot shows null while a deferred write
      // is pending (D2)
      active = view ? { id: view.id, model: null } : null

      let wrote = false

      try {
        wrote = writeModel(view?.filterModel ?? {}, 'view', call)
      } finally {
        // The grid threw (GRID_ERROR): the old active view stays (D2)
        if (!wrote) active = previous
      }

      if (!wrote) return

      // The grid no longer shows an applied URL
      applyIssues = NO_ISSUES
      publish()

      if ((active?.id ?? null) === wanted) persistPointer(wanted, call)
    },

    deleteView(id) {
      if (!views) return

      const call = startCall('api', 'throw')

      try {
        views.deleteView(id)
      } catch (cause) {
        fail(call, cause, 'STORAGE_WRITE_FAILED')

        return
      }

      // The grid still shows the deleted view: clear it, as loadView(null)
      // does. After a hand edit, the grid's model is the user's.
      const clears =
        status === 'active' && active?.id === id && shows(active.model)

      if (active?.id === id) active = null

      refreshViews()

      try {
        if (clears) writeModel({}, 'view', call)
      } finally {
        publish()
      }
    },

    destroy
  }

  if (isDestroyed(api)) {
    status = 'destroyed'
    emit(
      new URLSyncError('The grid is already destroyed', undefined, {
        code: 'NOT_READY'
      }),
      'api'
    )
    publish()

    return sync
  }

  refreshViews()

  api.addEventListener('filterChanged', onFilterChanged)
  api.addEventListener('gridPreDestroyed', destroy)

  if (listensToPopstate && hasWindow()) {
    window.addEventListener('popstate', onPopstate)
  }

  if (options.applyUrlOnCreate !== false && hasWindow()) {
    const href = window.location.href
    apply(href, 'url', 'report', true)

    // The URL has no filter params, so the grid's own filters stay: show them
    // in the address bar too, with no new history entry. A URL with only bad
    // filter params is left as it is until the user changes a filter.
    if (
      !hasFilterParams(href) &&
      historyMode !== 'none' &&
      Object.keys(state).length > 0
    ) {
      write('url', true)
      publish()
    }
  } else {
    readGrid()
    publish()
  }

  return sync
}

/** Two view lists with the same ids, names, times and models */
function sameViews(a: readonly GridView[], b: readonly GridView[]): boolean {
  return (
    a.length === b.length &&
    a.every((view, index) => {
      const other = b[index]

      return (
        other !== undefined &&
        view.id === other.id &&
        view.name === other.name &&
        view.updatedAt === other.updatedAt &&
        JSON.stringify(view.filterModel) === JSON.stringify(other.filterModel)
      )
    })
  )
}

/** Sorts entries by column id */
function byColumnId([a]: [string, unknown], [b]: [string, unknown]): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** The key of an issue's content */
function issueKey(issue: URLSyncError): string {
  return `${issue.code}\u0000${issue.column ?? ''}\u0000${issue.message}`
}

/**
 * Reports an error from app code (onIssue, a subscriber) out of band, as the
 * browser does for an event listener's error
 */
function reportLater(error: Error): void {
  if ('reportError' in globalThis) {
    globalThis.reportError(error)

    return
  }

  setTimeout(() => {
    throw error
  })
}

/** AG Grid before v31 has no isDestroyed */
function isDestroyed(api: GridApi): boolean {
  return 'isDestroyed' in api && api.isDestroyed()
}

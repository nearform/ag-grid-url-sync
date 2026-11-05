import type { FilterModel, GridApi } from 'ag-grid-community'
import type {
  ApplyResult,
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
import { readUrlFilters } from './url-parser.js'
import { gridColumnType, gridColumnTypes } from './column-types.js'
import { writeUrlFilters } from './url-generator.js'
import { resolveParamPrefix } from './individual-params.js'
import { checkColumnTypes } from './grid-integration.js'
import { keyForm, mergeUrlModel, urlForm as urlFormOf } from './model-form.js'
import type { GridView } from './view-storage.js'
import type {
  Classified,
  ColumnUrlKeys,
  Columns,
  OwnWrite,
  WriteKind
} from './own-write.js'
import {
  classifyEvent,
  modelKey,
  settleWrite,
  startWrite,
  takeOver
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
  return createSync(options)
}

/**
 * The own write of a sync, as it hands it to the next sync on the same grid
 * (#276). `keys` names the options that the record's keys were made with.
 */
export interface Handover {
  /** The latest own write, or null (none, or inside a call) */
  readonly own: OwnWrite | null
  readonly source: IssueSource
  readonly keys: string
  /** The issues of the latest apply (#271 review) */
  readonly applyIssues: readonly URLSyncError[]
  /**
   * A URL apply that waits for the row data (#224). The old sync called no
   * setFilterModel for it, so the grid does not hold it: the next sync must.
   */
  readonly parked: ParkedApply | null
}

/** The handover of each sync that createSync made. Not public. */
const handovers = new WeakMap<GridUrlSync, () => Handover | null>()

/**
 * Not public: the state of a sync that the next sync on the same grid can
 * take (#276). Null for a sync that createSync did not make.
 */
export function handOver(sync: GridUrlSync): Handover | null {
  return handovers.get(sync)?.() ?? null
}

/** How the next sync on the same grid starts (#270, #276). Not public. */
export interface SyncStart {
  /**
   * The saved view that an earlier sync on the same grid tracked. With
   * `applyUrlOnCreate: false`, the sync restores it as it restores a stored
   * view on create: an own write of its full model, and a URL write that
   * replaces the entry. So a new sync adds no history entry for it.
   */
  readonly keptViewId?: string | null | undefined
  /**
   * The own write of the earlier sync. With the same codec and
   * maxValueLength, the sync takes it as its own: a late filterChanged of
   * that write is its landing or its echo, not a user edit. With other
   * options, the keys do not match, and the sync does not take it.
   */
  readonly handover?: Handover | null | undefined
  /**
   * Show the earlier sync's apply issues until this sync's own next apply,
   * as one sync would (the 0.6.0 hook, #271 review). An apply on create
   * replaces them.
   */
  readonly keepApplyIssues?: boolean | undefined
}

/**
 * Not public: createGridUrlSync, and the React hook's sync (#270), which
 * starts a new sync on the same grid from the earlier one
 */
export function createSync(
  options: GridUrlSyncOptions,
  start: SyncStart = {}
): GridUrlSync {
  const { api, onIssue, views } = options
  const codec = codecOptions(options.codec ?? individual())
  const maxValueLength = options.maxValueLength ?? DEFAULT_CONFIG.maxValueLength
  // The options that the keys of an own write depend on
  const keys = JSON.stringify({ ...codec, maxValueLength })

  const listeners = new Set<() => void>()
  let status: SyncStatus = 'active'
  // The URL form of the grid's model: the part that the codec holds (#225)
  let state: FilterModel = {}
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
  let active: ActiveView | null = null
  let viewList: readonly GridView[] = NO_VIEWS
  let snapshot: GridUrlSyncSnapshot = IDLE_SNAPSHOT
  // The column types of the grid, for a shared operation in a URL (#224)
  const columnTypes = gridColumnTypes(api)
  // A URL apply that waits for AG Grid to infer a column type (#224)
  let parked: ParkedApply | null = null

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
        columnTypes,
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
    let model: FilterModel | null = null

    try {
      // AG Grid can hand back null despite the declared return type
      model = api.getFilterModel()
    } catch (cause) {
      fail(call, cause, 'GRID_ERROR')
    }

    // A column that the codec cannot hold is an issue of the read (#225)
    state = urlFormOf(model, call.options)

    url = hasWindow()
      ? writeUrlFilters(window.location.href, state, call.options)
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
    if (waitsForTypes(target)) {
      park({ target, source, mode, onCreate })

      return { issues: NO_ISSUES }
    }

    unpark()

    const call = startCall(source, mode)
    let filters: FilterModel | undefined

    try {
      filters = readUrlFilters(target, call.options)
    } catch (cause) {
      fail(call, cause, 'INVALID_URL')
    }

    const applies = filters && !(onCreate && Object.keys(filters).length === 0)
    const before = applies ? liveState() : null

    let failed = false

    if (filters && applies) {
      let model: FilterModel | undefined

      try {
        // The URL changes only the columns that the codec holds (#225)
        model = mergeUrlModel(
          liveModel(),
          checkColumnTypes(filters, api, call.options),
          call.options
        )
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
   * Whether a URL has a filter on a column whose type AG Grid has not
   * inferred yet (#224). A shared operation's value would be read as text,
   * and a text value on what becomes a number column filters out every row.
   * A filter of one type cannot be checked against the column yet.
   */
  function waitsForTypes(target: string): boolean {
    try {
      const filters = readUrlFilters(
        target,
        startCall('url', 'collect').options
      )

      return Object.keys(filters).some(
        column => gridColumnType(api, column) === 'pending'
      )
    } catch {
      // The apply reports a URL that cannot be read
      return false
    }
  }

  /**
   * Keeps the apply until the row data comes. AG Grid applies a filter model
   * only then too, so the user sees the same. The last apply wins.
   */
  function park(next: ParkedApply): void {
    if (!parked) api.addEventListener('rowDataUpdated', onRowData)

    parked = next
    // The URL replaces the claim of the earlier apply
    applyIssues = NO_ISSUES
    readGrid()
    publish()
  }

  /** Drops the waiting apply: a newer write, a user change, or destroy */
  function unpark(): void {
    if (!parked) return

    parked = null
    api.removeEventListener('rowDataUpdated', onRowData)
  }

  /** The row data came: run the waiting apply once the types are known */
  function onRowData(): void {
    const waiting = parked

    if (status !== 'active' || !waiting || waitsForTypes(waiting.target)) {
      return
    }

    unpark()

    // An event listener must not throw: the issues go to onIssue
    apply(
      waiting.target,
      waiting.source,
      waiting.mode === 'throw' ? 'report' : waiting.mode,
      waiting.onCreate
    )
  }

  /**
   * Calls setFilterModel as the sync's own write of the kind. False when the
   * grid threw: the call gets GRID_ERROR.
   */
  function setModel(model: FilterModel, kind: WriteKind, call: Call): boolean {
    // A newer write wins over a URL that waits for the row data
    unpark()

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
      acceptedUrlKey: urlKey(accepted),
      acceptedColumnUrlKeys: columnUrlKeys(accepted)
    })

    own = settled.own
    readGrid()

    if (settled.landed) {
      followActiveView(kind)
      writeLanding(kind, call.source)
    }

    return true
  }

  /** The URL form of the grid's filters now, or null when the grid cannot be read */
  function liveState(): FilterModel | null {
    const live = liveModel()

    return live === null ? null : urlForm(live)
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

  /**
   * The keys of the grid now in the form of the write kind, and for a model
   * write its URL form. Null when the grid cannot be read.
   */
  function liveKeys(kind: WriteKind): { key: string; urlKey?: string } | null {
    const key = liveKey(kind)

    if (key === null) return null

    if (kind === 'url') return { key }

    return { key, urlKey: urlKey(liveModel() ?? {}) }
  }

  /** The key of a model's URL form: the filters that the codec makes of it */
  function urlKey(model: Columns): string {
    return filtersKey(urlForm(model))
  }

  /** The filters that the codec makes of a model */
  function urlForm(model: Columns): FilterModel {
    return urlFormOf(model, startCall('grid', 'collect').options)
  }

  /** The URL form of each column that the URL can hold */
  function columnUrlKeys(model: Columns): ColumnUrlKeys {
    const keys = new Map<string, string>()

    for (const [colId, column] of Object.entries(model)) {
      const filters = urlForm(Object.fromEntries([[colId, column]]))

      if (Object.keys(filters).length > 0) keys.set(colId, filtersKey(filters))
    }

    return keys
  }

  /**
   * The active view for a view that is not on the grid yet. It keeps the
   * keys that its landing must have, in the model form and the URL form.
   */
  function pendingView(id: string, model: FilterModel): ActiveView {
    const accepted = acceptedPart(model)
    const filters = urlForm(accepted)

    return {
      id,
      model: null,
      key: modelKey(accepted),
      urlKey: Object.keys(filters).length > 0 ? filtersKey(filters) : null
    }
  }

  /**
   * Whether the grid shows the pending active view: its model, or (for the
   * grid's own change, source 'api') a model with the same URL form, which
   * the grid rebuilt. In a queued echo, an earlier write with the same URL
   * form can put its model into the view for one event. The view's own
   * landing then writes its model over it.
   */
  function landsActive(
    view: ActiveView,
    live: FilterModel,
    api: boolean
  ): boolean {
    return (
      modelKey(live) === view.key ||
      (api && view.urlKey !== null && urlKey(live) === view.urlKey)
    )
  }

  /** Whether the grid shows this model now */
  function shows(model: FilterModel | null): boolean {
    if (model === null) return false

    const live = liveModel()

    return live !== null && modelKey(live) === modelKey(model)
  }

  /**
   * The active-view rule (D2), after each own write and each filterChanged,
   * echoes included. A view write that lands keeps the model that the grid
   * made of it. A pending view also lands when the grid shows its model: a
   * later own write can have taken the place of the view's record. Any other
   * grid model clears the active view and its stored pointer, except in an
   * echo while the view is pending, and in a queued echo, where the grid
   * passes through an earlier write.
   */
  function followActiveView(
    landing: WriteKind | null,
    seen: Seen = 'call',
    api = true
  ): void {
    if (!active) return

    if (landing === 'view' || landing === 'restore') {
      active = { ...active, model: liveModel() }

      return
    }

    if (active.model === null) {
      const live = liveModel()

      if (live !== null && landsActive(active, live, api)) {
        active = { ...active, model: live }

        return
      }

      if (seen === 'echo') return
    }

    if (seen === 'queued' || shows(active.model)) return

    const { id } = active
    active = null
    clearPointer(id, startCall('grid', 'report'))
  }

  /**
   * Clears the stored pointer while it names this view: another tab can
   * have moved it to another view. A storage error is an issue of the call.
   */
  function clearPointer(id: string, call: Call): void {
    try {
      if (views?.getActiveViewId() === id) views.persistActiveViewId(null)
    } catch (cause) {
      fail(call, cause, 'STORAGE_WRITE_FAILED')
    }
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
    filters: FilterModel,
    before: FilterModel | null,
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

    // Only a pending model write needs the URL forms
    const pendingModel = modelForm && own?.phase === 'pending'

    const result = classifyEvent(own, {
      key: modelForm ? modelKey(live) : filtersKey(state),
      live,
      source,
      urlKey: pendingModel ? urlKey(live) : undefined,
      columnUrlKeys: pendingModel ? columnUrlKeys(live) : undefined
    })

    own = result.own

    return result
  }

  /**
   * Whether a URL gives at least one filter. A param that gives none (a bad
   * value, a grouped value that does not decode) is not a claim on the grid,
   * as in the 0.5.1 hook. Collect mode: the apply reports the issues.
   */
  function givesFilters(target: string): boolean {
    try {
      const filters = readUrlFilters(
        target,
        startCall('url', 'collect').options
      )

      return Object.keys(filters).length > 0
    } catch {
      return false
    }
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
  function filtersKey(filters: FilterModel): string {
    const { options } = startCall('grid', 'collect')
    // The json form compares in a normal form, as the individual form does
    const normal = keyForm(filters, options)
    const sorted = Object.fromEntries(Object.entries(normal).sort(byColumnId))

    return writeUrlFilters('http://key.invalid/', sorted, options)
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

    const current = readUrlFilters(
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

  /**
   * Whether the filters of a URL are the URL form of a view (D7). The
   * compare is in the URL form, so the order of the params has no effect.
   */
  function holdsView(target: string, view: GridView): boolean {
    try {
      const filters = readUrlFilters(
        target,
        startCall('url', 'collect').options
      )

      return filtersKey(filters) === urlKey(view.filterModel)
    } catch {
      return false
    }
  }

  /**
   * Restores the stored view on create: an own write of its full model. The
   * pointer stays. With history on, the URL write replaces the entry.
   */
  function restore(view: GridView): void {
    // Before the write, so no snapshot shows null while a deferred write is
    // pending (D2)
    active = pendingView(view.id, view.filterModel)

    if (!writeModel(view.filterModel, 'restore', startCall('url', 'report'))) {
      active = null
    }

    publish()
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

    // On each event, echoes too: a pending view can land in an echo of a
    // later own write. The rule is the same for the same grid model.
    followActiveView(
      result.kind === 'landing' ? result.write : null,
      result.kind !== 'echo' ? 'change' : result.queued ? 'queued' : 'echo',
      event?.source === 'api'
    )

    if (result.kind === 'change') {
      // The user's change wins over a URL that waits for the row data
      unpark()
      writeChange('grid', false)
    }

    if (result.kind === 'landing' && result.write !== null) {
      writeLanding(result.write, ownSource)
    }

    if (result.queued && shownWhilePending(own)) {
      // The record stays pending. A return to the old state is a change now.
      own = { ...own, before: null, beforeKey: null }
      writeLanding(own.kind, ownSource)
    }

    publish()
  }

  /**
   * Whether a pending model write has no earlier write left to wait for, and
   * the grid shows its URL form. Then a queued echo writes the URL: a grid
   * that rebuilds the model sends no event for a write that changes nothing,
   * so the write's own event can never come. The record stays pending. If
   * the event does come, the address bar has the URL already: no new entry.
   */
  function shownWhilePending(
    record: OwnWrite | null
  ): record is Extract<OwnWrite, { phase: 'pending' }> {
    return (
      record?.phase === 'pending' &&
      record.kind !== 'url' &&
      (record.waits?.length ?? 0) === 0 &&
      record.acceptedUrlKey !== undefined &&
      urlKey(liveModel() ?? {}) === record.acceptedUrlKey
    )
  }

  /** The back or forward button: apply the new address bar */
  function onPopstate(): void {
    if (status !== 'active') return

    apply(window.location.href, 'url', 'report', false)
  }

  function destroy(): void {
    if (status === 'destroyed') return

    status = 'destroyed'
    unpark()

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
      let checked: FilterModel | undefined

      try {
        checked = checkColumnTypes(filters, api, call.options)
      } catch (cause) {
        fail(call, cause, 'GRID_ERROR')
      }

      if (checked) writeModel(checked, 'app', call)

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
          // The read reports its issues (#225), so this call does not
          filters = urlForm(api.getFilterModel())
        } catch (cause) {
          fail(call, cause, 'GRID_ERROR')
        }
      }

      try {
        return writeUrlFilters(base, filters, call.options)
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

      // A pending view load or restore is no longer the active view's write.
      // Its landing is a change against the saved view. A pending URL write
      // stays known, so its landing writes no history (#273).
      if (
        own?.phase === 'pending' &&
        (own.kind === 'view' || own.kind === 'restore')
      ) {
        own = null
      }

      active = { ...pendingView(view.id, model), model }
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
      active = view ? pendingView(view.id, view.filterModel) : null

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

  // The earlier sync's own write is this sync's own now (#276), while the
  // grid agrees with it. Before the create's writes, so a write that it
  // makes waits for that one.
  const handed = start.handover

  if (handed?.own && handed.keys === keys) {
    own = takeOver(handed.own, liveKeys(handed.own.kind))
    ownSource = handed.source
  }

  if (handed && start.keepApplyIssues) applyIssues = handed.applyIssues

  handovers.set(sync, () => ({
    own: own?.phase === 'writing' ? null : own,
    source: ownSource,
    keys,
    applyIssues,
    parked
  }))

  // The view that the stored pointer names. A pointer to a missing view is
  // the same as no pointer. Read before the listeners, so a store that
  // throws leaks none.
  const pointer = views?.getActiveViewId()

  const stored = pointer
    ? viewList.find(view => view.id === pointer)
    : undefined

  api.addEventListener('filterChanged', onFilterChanged)
  api.addEventListener('gridPreDestroyed', destroy)

  if (listensToPopstate && hasWindow()) {
    window.addEventListener('popstate', onPopstate)
  }

  if (options.applyUrlOnCreate !== false && hasWindow()) {
    const href = window.location.href
    const hasParams = hasFilterParams(href)
    // A URL wins over the stored view only with a filter that it gives
    const claims = hasParams && givesFilters(href)

    // A URL that holds the stored view (D7), or a URL that gives no
    // filters: restore the view with its full model
    if (stored && (!claims || holdsView(href, stored))) {
      restore(stored)
    } else if (views && !claims) {
      // With views, a URL that gives no filters says nothing: the grid stays
      // and its bad params are not reported, as in the 0.5.1 hook
      readGrid()
      publish()
    } else {
      apply(href, 'url', 'report', true)

      // The URL wins over the stored view: clear the pointer, or the next
      // load restores a view that the user did not choose here
      if (claims && pointer) persistPointer(null, startCall('url', 'report'))
    }

    // The URL has no filter params, so the grid's own filters stay: show them
    // in the address bar too, with no new history entry. A URL with only bad
    // filter params is left as it is until the user changes a filter.
    if (
      !stored &&
      !hasParams &&
      historyMode !== 'none' &&
      Object.keys(state).length > 0
    ) {
      write('url', true)
      publish()
    }
  } else {
    const keptViewId = start.keptViewId ?? null

    const kept =
      keptViewId === null
        ? undefined
        : viewList.find(view => view.id === keptViewId)

    if (handed?.parked) {
      // The earlier sync's URL still waits for the row data. It is newer
      // than a kept view: an apply drops the view's pending write.
      const { target, source, mode, onCreate } = handed.parked

      apply(target, source, mode, onCreate)
    } else if (kept) {
      restore(kept)
    } else {
      readGrid()
      publish()
    }
  }

  return sync
}

/** A URL apply that waits for AG Grid to infer a column type (#224) */
export interface ParkedApply {
  target: string
  source: IssueSource
  mode: IssueMode
  onCreate: boolean
}

/**
 * What the active-view rule runs after: an own write's call, a change or
 * landing event, an echo, or an echo that lands a queued earlier write
 */
type Seen = 'call' | 'change' | 'echo' | 'queued'

/**
 * The tracked saved view. `model` is the model that the grid landed, null
 * while the write is pending. `key` and `urlKey` are the keys that the
 * landing must have: the model form, and the URL form (null when the URL
 * cannot hold the view).
 */
interface ActiveView {
  id: string
  model: FilterModel | null
  key: string
  urlKey: string | null
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

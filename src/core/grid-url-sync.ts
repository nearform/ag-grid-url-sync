import type { GridApi } from 'ag-grid-community'
import type {
  ApplyResult,
  FilterState,
  GridUrlSync,
  GridUrlSyncOptions,
  GridUrlSyncSnapshot,
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
import { getFilterModel, applyFilterModel } from './grid-integration.js'

// createGridUrlSync (#221): the framework-free sync. It owns its grid
// listeners and keeps one snapshot for useSyncExternalStore. Nothing here
// reads window when the module loads.

const NO_ISSUES: readonly URLSyncError[] = Object.freeze([])

/** The snapshot when there is no sync yet, for the React hook (#222) */
export const IDLE_SNAPSHOT: GridUrlSyncSnapshot = Object.freeze({
  status: 'idle',
  url: '',
  hasFilters: false,
  issues: NO_ISSUES
})

/**
 * How a call treats its issues. `'collect'`: keep them only. `'report'`: keep
 * them and send each to onIssue. `'throw'`: as `'report'`, and throwOnError
 * can throw one (only in methods that the app calls).
 */
type IssueMode = 'collect' | 'report' | 'throw'

/**
 * The sync's own latest grid write: the history loop guard (#273). It is set
 * before setFilterModel, because AG Grid can send filterChanged inside the
 * call, after it, or one tick later with the model.
 * - `writing`: inside the call, so an event is the write landing.
 * - `pending`: the grid did not take the model yet (deferred). `before` is
 *   the grid's model before the write, and `accepted` the part of the
 *   filters that the grid has columns for.
 * - `landed`: the grid shows the model with this key. An event with the
 *   same model is the write's echo: one write can cause more than one event.
 */
type OwnWrite =
  | { readonly phase: 'writing' }
  | {
      readonly phase: 'pending'
      readonly before: FilterState | null
      readonly accepted: FilterState
      readonly acceptedKey: string
    }
  | { readonly phase: 'landed'; readonly key: string }

interface Call {
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
  const { api, onIssue } = options
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
  const listensToPopstate = options.popstate ?? historyMode === 'push'
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
  function fail(
    call: Call,
    cause: unknown,
    code: 'INVALID_URL' | 'GRID_ERROR'
  ) {
    rethrowIfThrown(cause)
    reportIssue(call.options, toIssue(cause, code))
  }

  /** Builds a new snapshot, and tells the listeners, when something changed */
  function publish(): void {
    const list = [...applyIssues, ...readIssues, ...writeIssues]
    const hasFilters = Object.keys(state).length > 0
    const sameList = sameIssues(snapshot.issues, list)

    if (
      snapshot.status === status &&
      snapshot.url === url &&
      snapshot.hasFilters === hasFilters &&
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

    snapshot = Object.freeze({ status, url, hasFilters, issues })

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

    if (filters && applies) {
      // Before the call, so an event inside it is known as ours (#273)
      own = { phase: 'writing' }

      try {
        applyFilterModel(filters, api, call.options)
      } catch (cause) {
        own = null
        fail(call, cause, 'GRID_ERROR')
      }
    }

    applyIssues = call.issues.length ? call.issues : NO_ISSUES
    readGrid()

    if (filters && applies) settleWrite(filters, before, call)

    publish()

    return { issues: call.issues }
  }

  /** The grid's filters now, or null when the grid cannot be read */
  function liveState(): FilterState | null {
    try {
      return getFilterModel(api, startCall('grid', 'collect').options)
    } catch {
      return null
    }
  }

  /**
   * After the sync's own setFilterModel returns: did the write land, or does
   * the grid take it later? `state` is the grid's filters after the call.
   */
  function settleWrite(
    filters: FilterState,
    before: FilterState | null,
    call: Call
  ): void {
    // The grid threw, so nothing was written
    if (call.issues.some(issue => issue.code === 'GRID_ERROR')) {
      own = null

      return
    }

    const after = filtersKey(state)
    const accepted = acceptedPart(filters)
    const acceptedKey = filtersKey(accepted)

    // An event inside the call landed it, or the grid shows the filters now
    // (also a write that changed nothing, for which AG Grid sends no event),
    // or the grid took them in a form of its own
    if (
      own?.phase === 'landed' ||
      after === acceptedKey ||
      (before !== null && after !== filtersKey(before))
    ) {
      own = { phase: 'landed', key: after }

      return
    }

    own = { phase: 'pending', before, accepted, acceptedKey }
  }

  /** The filters of the columns that the grid has */
  function acceptedPart(filters: FilterState): FilterState {
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
   * Whether a filterChanged comes from the sync's own write. `state` is the
   * grid's filters at the event. Any other event ends the own write.
   */
  function isOwnEvent(source: string | undefined): boolean {
    if (!own) return false

    const key = filtersKey(state)

    if (own.phase === 'landed') {
      if (key === own.key) return true
    } else if (own.phase === 'pending') {
      const { before, accepted, acceptedKey } = own

      // The grid still shows the model from before the write
      if (before && key === filtersKey(before)) return true

      // The write lands. An API change that filters only columns of the
      // write is the landing in a form of the grid's own. A user's edit in
      // the grid's UI has another source.
      if (
        key === acceptedKey ||
        (source === 'api' && couldBeLanding(state, accepted, before))
      ) {
        own = { phase: 'landed', key }

        return true
      }
    }

    own = null

    return false
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
    const sorted = Object.fromEntries(
      Object.entries(filters).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    )

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

  /**
   * Writes a filter change, unless the sync's own apply caused it or the
   * address bar already has the same filters
   */
  function writeChange(source: string | undefined): void {
    if (isOwnEvent(source) || historyMode === 'none' || !hasWindow()) return

    const key = filtersKey(state)

    const current = parseUrlFilters(
      window.location.href,
      startCall('grid', 'collect').options
    )

    if (key === filtersKey(current)) return

    write('grid', false)
  }

  function onFilterChanged(event?: { source?: string }): void {
    if (status !== 'active') return

    // Inside the sync's own setFilterModel: the write lands. The apply reads
    // the grid and publishes after the call.
    if (own?.phase === 'writing') {
      const live = liveState()
      own = live ? { phase: 'landed', key: filtersKey(live) } : null

      return
    }

    readGrid()
    writeChange(event?.source)
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
      if (status !== 'active') return { issues: NO_ISSUES }

      const href = target ?? (hasWindow() ? window.location.href : undefined)

      if (href === undefined) return { issues: NO_ISSUES }

      return apply(href, 'api', 'throw', false)
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

/**
 * Whether the grid's filters could be a write landing: each column is one of
 * the write's, or a column that the grid had before with the same filter
 */
function couldBeLanding(
  live: FilterState,
  accepted: FilterState,
  before: FilterState | null
): boolean {
  return Object.keys(live).every(
    colId =>
      Object.hasOwn(accepted, colId) ||
      (before !== null &&
        Object.hasOwn(before, colId) &&
        JSON.stringify(live[colId]) === JSON.stringify(before[colId]))
  )
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

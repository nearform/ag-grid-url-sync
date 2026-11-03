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
import { parseUrlFilters } from './url-parser.js'
import { generateUrl } from './url-generator.js'
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
  let snapshot: GridUrlSyncSnapshot = IDLE_SNAPSHOT

  function emit(issue: URLSyncError, source: IssueSource): void {
    onIssue?.({ issue, source })
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
    const issues = [...applyIssues, ...readIssues]
    const hasFilters = Object.keys(state).length > 0

    if (
      snapshot.status === status &&
      snapshot.url === url &&
      snapshot.hasFilters === hasFilters &&
      sameIssues(snapshot.issues, issues)
    ) {
      return
    }

    snapshot = Object.freeze({
      status,
      url,
      hasFilters,
      issues: issues.length ? Object.freeze(issues) : NO_ISSUES
    })

    let firstError: unknown
    let failed = false

    // A copy, so a listener that unsubscribes during notify stops no other one
    for (const listener of Array.from(listeners)) {
      try {
        listener()
      } catch (error) {
        if (!failed) firstError = error
        failed = true
      }
    }

    if (failed) throw firstError
  }

  /**
   * Reads the grid's filters and the URL for them. The issues go to onIssue
   * only when they differ from the last read, so a read after an apply and
   * the late filterChanged do not report the same issue twice.
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

    if (!sameIssues(readIssues, call.issues)) {
      for (const issue of call.issues) emit(issue, 'grid')
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

    if (filters && !(onCreate && Object.keys(filters).length === 0)) {
      try {
        applyFilterModel(filters, api, call.options)
      } catch (cause) {
        fail(call, cause, 'GRID_ERROR')
      }
    }

    applyIssues = call.issues.length ? call.issues : NO_ISSUES
    readGrid()
    publish()

    return { issues: call.issues }
  }

  function onFilterChanged(): void {
    if (status !== 'active') return

    readGrid()
    publish()
  }

  function destroy(): void {
    if (status === 'destroyed') return

    status = 'destroyed'
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

  if (options.applyUrlOnCreate !== false && hasWindow()) {
    apply(window.location.href, 'url', 'report', true)
  } else {
    readGrid()
    publish()
  }

  return sync
}

/** AG Grid before v31 has no isDestroyed */
function isDestroyed(api: GridApi): boolean {
  return 'isDestroyed' in api && api.isDestroyed()
}

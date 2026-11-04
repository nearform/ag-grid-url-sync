import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { GridApi } from 'ag-grid-community'
import { useSyncExternalStore } from 'use-sync-external-store/shim'
import {
  createSync,
  handOver,
  IDLE_SNAPSHOT,
  type Handover
} from '../core/grid-url-sync.js'
import { parseUrlFilters as parseFilters } from '../core/url-parser.js'
import { gridColumnTypes } from '../core/column-types.js'
import { generateUrl } from '../core/url-generator.js'
import { getFilterModel } from '../core/grid-integration.js'
import { serializeGrouped } from '../core/serialization/grouped.js'
import {
  createViewStore,
  type GridView,
  type ViewStore
} from '../core/view-storage.js'
import { DEFAULT_CONFIG, resolveOptions } from '../core/options.js'
import { toError } from '../core/to-error.js'
import { isDataIssue, shouldThrow } from '../core/issues.js'
import { URLSyncError } from '../core/types.js'
import type {
  AGGridUrlSyncConfig,
  FilterState,
  GridUrlSync,
  GridUrlSyncSnapshot,
  IssueCode,
  IssueEvent,
  ResolvedOptions,
  SerializationFormat,
  SerializationMode
} from '../core/types.js'
import type {
  UseAGGridUrlSyncOptions,
  UseAGGridUrlSyncReturn
} from './types.js'
import { createSyncHolder } from './sync-holder.js'
import { gridUrlSyncOptions, type AddressBarOptions } from './sync-options.js'

/** The empty list, one object so that an empty state keeps its identity */
const NO_ISSUES: readonly URLSyncError[] = []

/** The snapshot of a server render: no grid and no sync yet (#222) */
const getServerSnapshot = (): GridUrlSyncSnapshot => IDLE_SNAPSHOT

/**
 * The codes of a write that fails after a grid change: the stored pointer,
 * or the address bar (#270)
 */
const WRITE_CODES: ReadonlySet<IssueCode> = new Set([
  'STORAGE_WRITE_FAILED',
  'STORAGE_FULL',
  'STORAGE_UNAVAILABLE',
  'HISTORY_WRITE_FAILED'
])

/** The codes that stop a view load before it changes the grid */
const LOAD_STOP_CODES: ReadonlySet<IssueCode> = new Set([
  'VIEW_NOT_FOUND',
  'GRID_ERROR'
])

/**
 * What the hook knows about the grid it syncs. A new grid (or none) starts a
 * new session. A new sync on the same grid (a new option or storageKey) keeps
 * the session.
 */
interface Session {
  grid: GridApi | null
  storageKey: string | undefined
  /** Auto-apply ran on this grid, or on this storageKey */
  autoApplied: boolean
  /** The URL had its one chance to win over a stored view on this grid */
  urlApplied: boolean
  /** The active view of the last sync, for the next sync on this grid */
  activeViewId: string | null
  /**
   * The data issues of the last apply, view load or clear on this grid. A
   * new sync on this grid shows them until its own next one, as in 0.5.1.
   */
  applyIssues: readonly URLSyncError[]
  /**
   * The own write of the last sync, for the next sync on this grid (#276).
   * Its late filterChanged is then not a user edit.
   */
  handover: Handover | null
}

/**
 * The live sync, the options and store that it was made for, and the removal
 * of the hook's popstate listeners
 */
interface LiveSync {
  sync: GridUrlSync
  urlOptions: AGGridUrlSyncConfig
  addressBar: AddressBarOptions
  viewStore: ViewStore | null
  stopPopstate: () => void
}

function newSession(
  grid: GridApi | null,
  storageKey: string | undefined
): Session {
  return {
    grid,
    storageKey,
    autoApplied: false,
    urlApplied: false,
    activeViewId: null,
    applyIssues: NO_ISSUES,
    handover: null
  }
}

/** Only the data issues, or the empty list */
function dataIssues(issues: readonly URLSyncError[]): readonly URLSyncError[] {
  const data = issues.filter(isDataIssue)

  return data.length ? data : NO_ISSUES
}

/**
 * Whether the page URL gives a filter. Then the sync's landing on create
 * applies the URL. The sync reports the URL's issues itself.
 */
function pageGivesFilters(options: AGGridUrlSyncConfig): boolean {
  try {
    const filters = parseFilters(pageUrl(), {
      ...options,
      onParseError: () => {}
    })

    return Object.keys(filters).length > 0
  } catch {
    return false
  }
}

/**
 * The page URL with the grid's filters, as the class made it for shareUrl and
 * getQueryParams. A data issue goes to the options' onParseError.
 */
function urlWithFilters(
  api: GridApi,
  base: string,
  options: ResolvedOptions
): string {
  return generateUrl(base, getFilterModel(api, options), options)
}

/** The grid's filters in a grouped format, as the class gave them */
function filtersAsFormat(
  api: GridApi,
  format: SerializationFormat,
  options: ResolvedOptions
): string {
  const filters = getFilterModel(api, options)

  return serializeGrouped(filters, {
    ...options,
    format,
    serialization: 'grouped'
  }).value
}

function hasWindow(): boolean {
  return typeof window !== 'undefined'
}

function pageUrl(): string {
  return hasWindow() ? window.location.href : ''
}

/**
 * React hook for AG Grid URL synchronization
 *
 * @deprecated Use `useGridUrlSync({ api, ...options })` (#271). This hook
 * will be removed in 0.6.0.
 *
 * @param gridApi - AG Grid API instance (can be null during initialization)
 * @param options - Configuration options for the hook
 * @returns Hook API for URL synchronization
 */
export function useAGGridUrlSync(
  gridApi: GridApi | null,
  options: UseAGGridUrlSyncOptions = {}
): UseAGGridUrlSyncReturn {
  const {
    autoApplyOnMount = false,
    enabledWhenReady = true,
    onError,
    storageKey,
    history = 'none',
    popstate,
    // Only decides whether the hook throws in render (#229). The core and the
    // hook's own parse calls never get it, so they always report and keep the
    // valid filters.
    throwOnError,
    ...coreOptions
  } = options

  // The URL-format options, after defaults. The memo keys on the five plain
  // values, so a new options object with the same values makes no new sync,
  // and a changed value makes one (#222).
  const resolved = resolveOptions(coreOptions)

  const { paramPrefix, maxValueLength, serialization, groupedParam, format } =
    resolved

  const urlOptions = useMemo(
    (): AGGridUrlSyncConfig => ({
      paramPrefix,
      maxValueLength,
      serialization,
      groupedParam,
      format
    }),
    [paramPrefix, maxValueLength, serialization, groupedParam, format]
  )

  // All the state comes from the sync (#222, #223). The holder exists before
  // the sync, which the effect makes, so React always has a store to read.
  const [holder] = useState(createSyncHolder)

  const snapshot = useSyncExternalStore(
    holder.subscribe,
    holder.getSnapshot,
    getServerSnapshot
  )

  const isReady = snapshot.status === 'active'
  const currentUrl = isReady ? snapshot.url : ''
  const hasFilters = isReady && snapshot.hasFilters

  // Saved views. The presence of storageKey is what enables the feature, so
  // there is no separate flag to keep in sync.
  const viewStore = useMemo(
    () => (storageKey ? createViewStore(storageKey) : null),
    [storageKey]
  )

  // The latest callbacks. The sync is made one time per grid, and it reads
  // them through this ref, so a new callback on a later render is used.
  const callbacksRef = useRef({
    onError,
    onParseError: coreOptions.onParseError,
    history
  })

  useEffect(() => {
    callbacksRef.current = {
      onError,
      onParseError: coreOptions.onParseError,
      history
    }
  })

  // The address-bar options (#270). The memo keys on the mode, so a new
  // function on each render makes no new sync: the sync calls the latest one.
  const historyKind = history instanceof Function ? 'function' : history
  const followsPopstate = popstate ?? historyKind === 'push'

  const addressBar = useMemo(
    (): AddressBarOptions => ({
      history:
        historyKind === 'function'
          ? url => {
              const write = callbacksRef.current.history

              if (write instanceof Function) write(url)
            }
          : historyKind,
      popstate: followsPopstate
    }),
    [historyKind, followsPopstate]
  )

  // The hook operation that is calling the sync. An issue that the sync
  // reports for that call gets it as its context.
  const contextRef = useRef('initialization')

  const sessionRef = useRef<Session>(newSession(null, undefined))

  // The live sync, with the URL options and the store that it was made for
  const liveSyncRef = useRef<LiveSync | null>(null)

  // Set when the sync reports an issue that stops a view load
  const loadStoppedRef = useRef(false)

  // Each failure goes to exactly one callback, by its kind (#220). A data issue
  // (a filter that is dropped or not valid) goes to onParseError. Any other
  // failure goes to onError with its context. The library never writes to the
  // console.
  const reportFailure = useCallback(
    // `cause` is the caught value, which can be anything a callee threw
    (cause: unknown, context: string) => {
      const error = toError(cause)
      const callbacks = callbacksRef.current

      if (isDataIssue(error)) {
        callbacks.onParseError?.(error)
      } else {
        callbacks.onError?.(error, context)
      }
    },
    []
  )

  // A grid that has not resolved yet is a timing problem that the caller wants
  // to hear about (see the saved view operations below)
  const reportNotReady = useCallback(
    (operation: string, context: string): void => {
      reportFailure(
        new URLSyncError(
          `${operation} called while the hook is not ready.`,
          undefined,
          { code: 'NOT_READY' }
        ),
        context
      )
    },
    [reportFailure]
  )

  /**
   * Destroys the live sync. Its active view stays in the session, for the
   * next sync on the same grid.
   */
  const dropSync = useCallback(
    (current: LiveSync): void => {
      sessionRef.current.activeViewId = current.sync.getSnapshot().activeViewId
      sessionRef.current.handover = handOver(current.sync)
      current.stopPopstate()
      current.sync.destroy()
      holder.set(null)
      liveSyncRef.current = null
    },
    [holder]
  )

  /** The sync, while it is active */
  const activeSync = useCallback((): GridUrlSync | null => {
    const sync = holder.get()

    return sync?.getSnapshot().status === 'active' ? sync : null
  }, [holder])

  /**
   * After an apply, a view load or a clear of the live sync: its issues are
   * the grid's apply issues now. The sync shows them, so the issues of an
   * earlier sync go.
   */
  const keepApplyIssues = useCallback(
    (issues: readonly URLSyncError[]): void => {
      sessionRef.current.applyIssues = dataIssues(issues)
      holder.setCarriedIssues(NO_ISSUES)
    },
    [holder]
  )

  /** Loads a view. A load that changes the grid ends the apply issues. */
  const loadAndKeep = useCallback(
    (sync: GridUrlSync, id: string | null): void => {
      loadStoppedRef.current = false
      sync.loadView(id)

      if (!loadStoppedRef.current) keepApplyIssues(NO_ISSUES)
    },
    [keepApplyIssues]
  )

  // Make the sync for each grid, each set of URL-format options and each
  // storageKey. A new grid starts a new session. A new option or storageKey
  // on the same grid does not apply the URL again (#222). autoApplyOnMount
  // makes a new sync only when an auto-apply is due on this grid: from false
  // to true before any auto-apply, as in 0.5.1.
  useEffect(() => {
    const live = gridApi && enabledWhenReady ? gridApi : null
    const current = liveSyncRef.current
    const newGrid = live !== sessionRef.current.grid

    // A new grid (or none) starts a new session. The old sync goes first, so
    // its active view stays in the old session.
    if (newGrid) {
      if (current) dropSync(current)

      sessionRef.current = newSession(live, storageKey)
    }

    const session = sessionRef.current
    const sameKey = session.storageKey === storageKey

    // A new namespace auto-applies again. Not when the store went away: with
    // no views, auto-apply clears the grid on a URL with no filters.
    const autoApply =
      autoApplyOnMount &&
      (!session.autoApplied || (!sameKey && viewStore !== null))

    if (
      current &&
      !newGrid &&
      current.urlOptions === urlOptions &&
      current.addressBar === addressBar &&
      current.viewStore === viewStore &&
      !autoApply
    ) {
      return
    }

    if (current && !newGrid) dropSync(current)

    if (!live) {
      // No sync: `views` still shows what is in storage
      holder.setIdleViews(viewStore?.listViews() ?? [])

      return
    }

    // The active view of the last sync on this grid. A new namespace has none.
    const kept = sameKey ? session.activeViewId : null
    session.storageKey = storageKey
    session.activeViewId = null

    // A new namespace is armed again, also while autoApplyOnMount is false
    if (!sameKey && viewStore) session.autoApplied = false

    // With views, the core lands the URL or the stored view, one time per grid
    const landsOnCreate = autoApply && viewStore !== null && !session.urlApplied

    // Before the work, so a failure is not tried again on each render
    if (autoApply) session.autoApplied = true

    if (landsOnCreate) session.urlApplied = true

    // The data issues of the landing on create, then of each back-button
    // apply
    let urlIssues: URLSyncError[] = []

    // What the sync's 'url' issues come from: the landing on create, a
    // back-button apply, or a later landing of the create's write
    let urlPhase: 'create' | 'popstate' | 'live' = 'create'

    // The grid still shows the last sync's view: the new sync restores it, so
    // its write replaces the history entry (#270). Not a view that another
    // tab deleted: 0.5.1 made no call to the store here.
    const keptView = autoApply ? null : kept

    // The context of the create's 'url' issues: an auto-apply, or the
    // restore of the kept view, which is part of the new sync's start
    const createContext =
      keptView === null ? 'auto-apply-filters' : 'initialization'

    // A grid-read issue gets the context of the state update, as before. A
    // pointer or address-bar write that fails after a grid change gets
    // 'filter-change', as in 0.5.1.
    const onIssue = ({ issue, source }: IssueEvent): void => {
      if (source === 'api' && LOAD_STOP_CODES.has(issue.code)) {
        loadStoppedRef.current = true
      }

      if (source === 'url' && urlPhase !== 'live' && isDataIssue(issue)) {
        urlIssues.push(issue)
      }

      // An address-bar write that fails is a filter-change failure, also
      // at a landing of the sync's own write (#270)
      const urlContext =
        urlPhase === 'popstate'
          ? 'popstate'
          : issue.code === 'HISTORY_WRITE_FAILED'
            ? 'filter-change'
            : createContext

      reportFailure(
        issue,
        source === 'grid'
          ? WRITE_CODES.has(issue.code)
            ? 'filter-change'
            : 'update-state'
          : source === 'url'
            ? urlContext
            : contextRef.current
      )
    }

    // The sync applies the URL on back and forward. The hook's listeners
    // run before and after it (in the order they were added), so the issues
    // of that apply get their context and become the grid's apply issues.
    const beforePopstate = (): void => {
      urlPhase = 'popstate'
      urlIssues = []
    }

    const afterPopstate = (): void => {
      urlPhase = 'live'
      keepApplyIssues(urlIssues)
    }

    const listens = addressBar.popstate && hasWindow()

    if (listens) window.addEventListener('popstate', beforePopstate)

    const stopPopstate = (): void => {
      if (!listens) return

      window.removeEventListener('popstate', beforePopstate)
      window.removeEventListener('popstate', afterPopstate)
    }

    let sync: GridUrlSync

    // A grid that is already destroyed is an initialization failure
    contextRef.current = 'initialization'

    // The new sync shows the apply issues of the last one on this grid
    holder.setCarriedIssues(session.applyIssues)

    // The last sync's own write goes to this sync only (#276)
    const { handover } = session
    session.handover = null

    try {
      sync = createSync(
        gridUrlSyncOptions(
          live,
          urlOptions,
          onIssue,
          viewStore ?? undefined,
          landsOnCreate,
          addressBar
        ),
        { keptViewId: keptView, handover }
      )
    } catch (error) {
      stopPopstate()
      reportFailure(error, 'initialization')

      return
    }

    // A grid that is already destroyed follows no back button
    if (sync.getSnapshot().status !== 'active') {
      stopPopstate()
    } else if (listens) {
      window.addEventListener('popstate', afterPopstate)
    }

    holder.set(sync)
    liveSyncRef.current = {
      sync,
      urlOptions,
      addressBar,
      viewStore,
      stopPopstate
    }

    if (sync.getSnapshot().status === 'active') {
      if (autoApply) contextRef.current = 'auto-apply-filters'

      if (
        landsOnCreate &&
        (sync.getSnapshot().activeViewId !== null ||
          pageGivesFilters(urlOptions))
      ) {
        // The landing restored the stored view or applied the URL. A landing
        // that applies nothing keeps the apply issues.
        keepApplyIssues(urlIssues)
      } else if (autoApply && !viewStore) {
        // No saved views: the URL is the only source, so apply it always. An
        // empty URL clears the grid, as in 0.5.1 (D4).
        keepApplyIssues(sync.applyUrl().issues)
      } else if (autoApply && viewStore && !landsOnCreate) {
        // The URL had its chance on this grid: restore the new namespace's
        // stored view
        const pointer = viewStore.getActiveViewId()

        if (sync.getSnapshot().views.some(view => view.id === pointer)) {
          loadAndKeep(sync, pointer)
        }
      }
    }

    // The create is done: a later 'url' issue is from a landing of its write
    urlPhase = 'live'
  }, [
    gridApi,
    enabledWhenReady,
    urlOptions,
    addressBar,
    viewStore,
    storageKey,
    autoApplyOnMount,
    holder,
    reportFailure,
    dropSync,
    keepApplyIssues,
    loadAndKeep
  ])

  // Unmount: the sync goes with the hook
  useEffect(
    () => () => {
      const current = liveSyncRef.current

      if (current) dropSync(current)
    },
    [dropSync]
  )

  /** The read options, with data issues reported in the context */
  const readOptions = useCallback(
    (context: string): ResolvedOptions =>
      resolveOptions({
        ...urlOptions,
        onParseError: issue => reportFailure(issue, context)
      }),
    [urlOptions, reportFailure]
  )

  const shareUrl = useCallback(
    (baseUrl?: string): string => {
      const fallback = baseUrl ?? pageUrl()

      if (!gridApi || !activeSync()) return fallback

      try {
        return urlWithFilters(
          gridApi,
          fallback,
          readOptions('generate-share-url')
        )
      } catch (error) {
        reportFailure(error, 'generate-share-url')

        return fallback
      }
    },
    [gridApi, activeSync, readOptions, reportFailure]
  )

  const getQueryParams = useCallback((): string => {
    if (!gridApi || !activeSync()) return ''

    try {
      const url = urlWithFilters(
        gridApi,
        pageUrl(),
        readOptions('get-query-params')
      )

      return new URL(url).search
    } catch (error) {
      reportFailure(error, 'get-query-params')

      return ''
    }
  }, [gridApi, activeSync, readOptions, reportFailure])

  const applyUrlFilters = useCallback(
    (url?: string): void => {
      const sync = activeSync()

      if (!sync) {
        reportNotReady('applyUrlFilters', 'apply-url-filters')

        return
      }

      contextRef.current = 'apply-url-filters'
      keepApplyIssues(sync.applyUrl(url).issues)
    },
    [activeSync, reportNotReady, keepApplyIssues]
  )

  const clearFilters = useCallback((): void => {
    const sync = activeSync()

    if (!sync) {
      reportNotReady('clearFilters', 'clear-filters')

      return
    }

    contextRef.current = 'clear-filters'
    keepApplyIssues(sync.applyFilters({}).issues)
  }, [activeSync, reportNotReady, keepApplyIssues])

  const parseUrlFilters = useCallback(
    (url: string): FilterState => {
      if (!gridApi) {
        return {} // Silently return empty state if grid API not available
      }

      try {
        // The parser fills in the defaults of the options that are not set
        return parseFilters(url, {
          ...urlOptions,
          // A shared operation takes its type from the grid's column (#224)
          columnTypes: gridColumnTypes(gridApi),
          // The latest callback, so a new one on each render keeps this
          // function stable (#222)
          onParseError: issue => callbacksRef.current.onParseError?.(issue)
        })
      } catch (error) {
        reportFailure(error, 'parse-url-filters')

        return {}
      }
    },
    [urlOptions, gridApi, reportFailure]
  )

  const applyFilters = useCallback(
    (filters: FilterState): void => {
      const sync = activeSync()

      if (!sync) {
        reportNotReady('applyFilters', 'apply-filters')

        return
      }

      contextRef.current = 'apply-filters'
      keepApplyIssues(sync.applyFilters(filters).issues)
    },
    [activeSync, reportNotReady, keepApplyIssues]
  )

  const getFiltersAsFormat = useCallback(
    (asFormat: SerializationFormat): string => {
      if (!gridApi || !activeSync()) return ''

      try {
        return filtersAsFormat(
          gridApi,
          asFormat,
          readOptions('get-filters-as-format')
        )
      } catch (error) {
        reportFailure(error, 'get-filters-as-format')

        return ''
      }
    },
    [gridApi, activeSync, readOptions, reportFailure]
  )

  const getSerializationMode = useCallback(
    (): SerializationMode =>
      activeSync() ? serialization : DEFAULT_CONFIG.serialization,
    [activeSync, serialization]
  )

  // Deprecated: the old name of getSerializationMode (#222)
  const getCurrentFormat = getSerializationMode

  // Saved view operations. All no-op when storageKey is unset, and when the
  // hook is disabled: the feature was switched off by configuration, so
  // silence is the contract. A grid that has not resolved yet is a timing
  // problem the caller does want to hear about.

  const saveView = useCallback(
    (name: string): GridView | null => {
      if (!viewStore || !enabledWhenReady) return null

      const sync = activeSync()

      if (!sync) {
        reportNotReady('saveView', 'save-view')

        return null
      }

      contextRef.current = 'save-view'

      return sync.saveView(name)
    },
    [viewStore, enabledWhenReady, activeSync, reportNotReady]
  )

  const loadView = useCallback(
    (id: string | null): void => {
      if (!viewStore || !enabledWhenReady) return

      const sync = activeSync()

      if (!sync) {
        reportNotReady('loadView', 'load-view')

        return
      }

      contextRef.current = 'load-view'
      loadAndKeep(sync, id)
    },
    [viewStore, enabledWhenReady, activeSync, reportNotReady, loadAndKeep]
  )

  const deleteView = useCallback(
    (id: string): void => {
      if (!viewStore || !enabledWhenReady) return

      // Deleting only touches storage, so it works with no grid: the sync
      // does it when there is one, else the store directly
      const sync = holder.get()

      if (sync) {
        contextRef.current = 'delete-view'
        sync.deleteView(id)

        return
      }

      try {
        viewStore.deleteView(id)
      } catch (error) {
        reportFailure(error, 'delete-view')
      }

      holder.setIdleViews(viewStore.listViews())
    },
    [viewStore, enabledWhenReady, holder, reportFailure]
  )

  // A copy for the 0.5.1 type (a mutable array). The memo keeps its identity
  // while the snapshot keeps its list.
  const views = useMemo(() => [...snapshot.views], [snapshot.views])
  const { activeViewId } = snapshot

  // The data issues of the latest apply and grid read (#229), with the apply
  // issues of an earlier sync on this grid first. Operation failures go to
  // onError. The snapshot keeps its issues array while the content is the
  // same, so this changes only with it.
  const issues = useMemo(() => {
    const data = isReady ? snapshot.issues.filter(isDataIssue) : NO_ISSUES

    return data.length ? data : NO_ISSUES
  }, [isReady, snapshot.issues])

  // Return the hook API
  const hookApi = useMemo(
    () => ({
      shareUrl,
      getQueryParams,
      applyUrlFilters,
      clearFilters,
      isReady,
      currentUrl,
      hasFilters,
      issues,
      parseUrlFilters,
      applyFilters,
      getFiltersAsFormat,
      getSerializationMode,
      getCurrentFormat,
      views,
      activeViewId,
      saveView,
      loadView,
      deleteView
    }),
    [
      shareUrl,
      getQueryParams,
      applyUrlFilters,
      clearFilters,
      isReady,
      currentUrl,
      hasFilters,
      issues,
      parseUrlFilters,
      applyFilters,
      getFiltersAsFormat,
      getSerializationMode,
      getCurrentFormat,
      views,
      activeViewId,
      saveView,
      loadView,
      deleteView
    ]
  )

  // throwOnError, as in TanStack Query: the issue is thrown during render, so
  // a React error boundary catches it (#229). It is also sent to onParseError
  // one time, when it is found.
  const thrownIssue = issues.find(issue => shouldThrow(throwOnError, issue))

  if (thrownIssue) throw thrownIssue

  return hookApi
}

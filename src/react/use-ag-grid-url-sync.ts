import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { GridApi } from 'ag-grid-community'
import { useSyncExternalStore } from 'use-sync-external-store/shim'
import { createGridUrlSync, IDLE_SNAPSHOT } from '../core/grid-url-sync.js'
import { parseUrlFilters as parseFilters } from '../core/url-parser.js'
import { generateUrl } from '../core/url-generator.js'
import { getFilterModel } from '../core/grid-integration.js'
import { serializeGrouped } from '../core/serialization/grouped.js'
import { createViewStore, type GridView } from '../core/view-storage.js'
import { DEFAULT_CONFIG, resolveOptions } from '../core/options.js'
import { toError } from '../core/to-error.js'
import { isDataIssue, shouldThrow } from '../core/issues.js'
import { URLSyncError } from '../core/types.js'
import type {
  AGGridUrlSyncConfig,
  FilterState,
  GridUrlSync,
  GridUrlSyncSnapshot,
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
import { gridUrlSyncOptions } from './sync-options.js'

/** The empty list, one object so that an empty state keeps its identity */
const NO_ISSUES: readonly URLSyncError[] = []

/** The snapshot of a server render: no grid and no sync yet (#222) */
const getServerSnapshot = (): GridUrlSyncSnapshot => IDLE_SNAPSHOT

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
    activeViewId: null
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

function pageUrl(): string {
  return typeof window === 'undefined' ? '' : window.location.href
}

/**
 * React hook for AG Grid URL synchronization
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
    onParseError: coreOptions.onParseError
  })

  // Read only when a sync is made, so a new value alone makes no new sync
  const autoApplyRef = useRef(autoApplyOnMount)

  useEffect(() => {
    callbacksRef.current = { onError, onParseError: coreOptions.onParseError }
    autoApplyRef.current = autoApplyOnMount
  })

  // The hook operation that is calling the sync. An issue that the sync
  // reports for that call gets it as its context.
  const contextRef = useRef('initialization')

  const sessionRef = useRef<Session>(newSession(null, undefined))

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

  /** The sync, while it is active */
  const activeSync = useCallback((): GridUrlSync | null => {
    const sync = holder.get()

    return sync?.getSnapshot().status === 'active' ? sync : null
  }, [holder])

  // Make the sync for each grid, each set of URL-format options and each
  // storageKey. A new grid starts a new session. A new option or storageKey
  // on the same grid does not apply the URL again (#222).
  useEffect(() => {
    const live = gridApi && enabledWhenReady ? gridApi : null

    if (live !== sessionRef.current.grid) {
      sessionRef.current = newSession(live, storageKey)
    }

    const session = sessionRef.current

    if (!live) {
      // No sync: `views` still shows what is in storage
      holder.setIdleViews(viewStore?.listViews() ?? [])

      return
    }

    const sameKey = session.storageKey === storageKey
    // The active view of the last sync on this grid. A new namespace has none.
    const kept = sameKey ? session.activeViewId : null
    session.storageKey = storageKey
    session.activeViewId = null

    // A new namespace auto-applies again. Not when the store went away: with
    // no views, auto-apply clears the grid on a URL with no filters.
    if (!sameKey && viewStore) session.autoApplied = false

    const autoApply = autoApplyRef.current && !session.autoApplied
    // With views, the core lands the URL or the stored view, one time per grid
    const landsOnCreate = autoApply && viewStore !== null && !session.urlApplied

    // Before the work, so a failure is not tried again on each render
    if (autoApply) session.autoApplied = true

    if (landsOnCreate) session.urlApplied = true

    // A grid-read issue gets the context of the state update, as before. The
    // hook's sync gets a 'url' issue only from its landing on create.
    const onIssue = ({ issue, source }: IssueEvent): void =>
      reportFailure(
        issue,
        source === 'grid'
          ? 'update-state'
          : source === 'url'
            ? 'auto-apply-filters'
            : contextRef.current
      )

    let sync: GridUrlSync

    // A grid that is already destroyed is an initialization failure
    contextRef.current = 'initialization'

    try {
      sync = createGridUrlSync(
        gridUrlSyncOptions(
          live,
          urlOptions,
          onIssue,
          viewStore ?? undefined,
          landsOnCreate
        )
      )
    } catch (error) {
      reportFailure(error, 'initialization')

      return
    }

    holder.set(sync)

    if (sync.getSnapshot().status === 'active') {
      if (autoApply) contextRef.current = 'auto-apply-filters'

      if (autoApply && !viewStore) {
        // No saved views: the URL is the only source, so apply it always. An
        // empty URL clears the grid, as in 0.5.1 (D4).
        sync.applyUrl()
      } else if (autoApply && viewStore && !landsOnCreate) {
        // The URL had its chance on this grid: restore the new namespace's
        // stored view
        const pointer = viewStore.getActiveViewId()

        if (sync.getSnapshot().views.some(view => view.id === pointer)) {
          sync.loadView(pointer)
        }
      } else if (
        kept !== null &&
        !autoApply &&
        sync.getSnapshot().views.some(view => view.id === kept)
      ) {
        // The grid still shows the view: the new sync tracks it too. Not a
        // view that another tab deleted: 0.5.1 made no call to the store here.
        sync.loadView(kept)
      }
    }

    return () => {
      session.activeViewId = sync.getSnapshot().activeViewId
      sync.destroy()
      holder.set(null)
    }
  }, [
    gridApi,
    enabledWhenReady,
    urlOptions,
    viewStore,
    storageKey,
    holder,
    reportFailure
  ])

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
      sync.applyUrl(url)
    },
    [activeSync, reportNotReady]
  )

  const clearFilters = useCallback((): void => {
    const sync = activeSync()

    if (!sync) {
      reportNotReady('clearFilters', 'clear-filters')

      return
    }

    contextRef.current = 'clear-filters'
    sync.applyFilters({})
  }, [activeSync, reportNotReady])

  const parseUrlFilters = useCallback(
    (url: string): FilterState => {
      if (!gridApi) {
        return {} // Silently return empty state if grid API not available
      }

      try {
        // The parser fills in the defaults of the options that are not set
        return parseFilters(url, {
          ...urlOptions,
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
      sync.applyFilters(filters)
    },
    [activeSync, reportNotReady]
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
      sync.loadView(id)
    },
    [viewStore, enabledWhenReady, activeSync, reportNotReady]
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

  // The data issues of the latest apply and grid read (#229). Operation
  // failures go to onError. The snapshot keeps its issues array while the
  // content is the same, so this changes only with it.
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

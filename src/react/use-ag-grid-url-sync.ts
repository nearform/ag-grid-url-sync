import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { GridApi } from 'ag-grid-community'
import { AGGridUrlSync } from '../core/ag-grid-url-sync.js'
import { parseUrlFilters as parseFilters } from '../core/url-parser.js'
import { createViewStore, type GridView } from '../core/view-storage.js'
import { DEFAULT_CONFIG } from '../core/validation.js'
import type {
  FilterState,
  InternalConfig,
  SerializationFormat,
  SerializationMode
} from '../core/types.js'
import type {
  UseAGGridUrlSyncOptions,
  UseAGGridUrlSyncReturn
} from './types.js'

/**
 * Content equality for view lists, used to skip no-op re-renders.
 *
 * Must compare contents, not id/updatedAt: an in-place overwrite reuses the id,
 * and Date.now() collides within a millisecond. Key order is stable since both
 * sides come from parsing the same stored document.
 */
function sameViews(a: GridView[], b: GridView[]): boolean {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Whether the grid's filter model still matches a saved view's.
 *
 * Compared per column, so key order does not matter. The grid rebuilds its model
 * as filters are edited. Any doubt resolves to "different", which errs towards
 * leaving the user's filters alone.
 */
function sameFilterModel(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every(key => JSON.stringify(a[key]) === JSON.stringify(b[key]))
  )
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
    ...coreOptions
  } = options

  // Internal state
  const [isReady, setIsReady] = useState(false)
  const [currentUrl, setCurrentUrl] = useState('')
  const [hasFilters, setHasFilters] = useState(false)

  // Saved views. The presence of storageKey is what enables the feature, so
  // there is no separate flag to keep in sync.
  const viewStore = useMemo(
    () => (storageKey ? createViewStore(storageKey) : null),
    [storageKey]
  )
  // `views` mirrors the store. `activeViewId` deliberately does not: the store's
  // activeId is a persistence pointer recording which view the user last loaded,
  // whereas this reports which view is applied to *this* grid right now. Mirroring
  // the pointer would claim a view is loaded before anything applied it.
  //
  // Neither is seeded from storage in a useState initialiser: that reads
  // localStorage during the first render, which makes a server render produce []
  // and the first client render produce the stored views: a hydration mismatch.
  // The effect below does the initial read instead.
  const [views, setViews] = useState<GridView[]>([])
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  // The same marker in a form callbacks can read. State is a render behind, and
  // deleteView needs to know what saveView or loadView did earlier in the same
  // tick, so it reads the ref while consumers read the state. Every write goes
  // through commitActiveViewId below to keep the two from drifting.
  const activeViewIdRef = useRef<string | null>(null)
  const commitActiveViewId = useCallback((id: string | null): void => {
    activeViewIdRef.current = id
    setActiveViewId(id)
  }, [])

  /**
   * Refreshes the mirrored view list from the store, or empties it when views are
   * disabled.
   *
   * localStorage has no same-tab change event to subscribe to, so this stands in
   * for the invalidation that `filterChanged` provides on the filter side: call
   * it after every store mutation that changes the list.
   */
  const syncViewsFromStore = useCallback((): void => {
    const nextViews = viewStore ? viewStore.listViews() : []

    // listViews() returns a fresh array every call, so setting it
    // unconditionally would re-render on every sync. Compare contents and hand
    // back the previous array to let React bail out.
    setViews(prev => (sameViews(prev, nextViews) ? prev : nextViews))
  }, [viewStore])

  // Refs to track state and prevent memory leaks
  const urlSyncRef = useRef<AGGridUrlSync | null>(null)
  const autoAppliedRef = useRef(false)
  const lastGridApiRef = useRef<GridApi | null>(null)

  // Mirror the list on mount and whenever storageKey swaps the store for a
  // different namespace. Without this, switching key leaves the previous
  // namespace's views on screen until the next mutation happens to resync them.
  //
  // The active marker resets here too: on a fresh mount nothing has been applied
  // yet, and a new namespace's view certainly has not been.
  //
  // Auto-apply re-arms for the same reason: a storageKey resolving after the
  // first render would otherwise have burned the guard on the keyless pass. Safe
  // because storageKey is a primitive, so this fires on a real key change only.
  //
  // Only when a store still exists, though. storageKey dropping to undefined
  // also runs this effect, and re-arming there would send the auto-apply effect
  // down its !viewStore branch: applyFromUrl() against a URL carrying no filter
  // params clears the grid. A store that has gone away has no namespace left to
  // apply, so there is nothing to re-arm for.
  useEffect(() => {
    syncViewsFromStore()
    commitActiveViewId(null)
    if (viewStore) {
      autoAppliedRef.current = false
    }
  }, [syncViewsFromStore, viewStore, commitActiveViewId])

  // Helper function to handle errors consistently
  const handleError = useCallback(
    (error: unknown, context: string) => {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      if (onError) {
        onError(errorObj, context)
      } else if (process.env.NODE_ENV === 'development') {
        console.error(`AG Grid URL Sync Error [${context}]:`, errorObj)
      }
    },
    [onError]
  )

  // Initialize or update URL sync instance when grid API changes
  useEffect(() => {
    if (gridApi && enabledWhenReady) {
      // Clean up previous instance if grid API changed
      if (lastGridApiRef.current && lastGridApiRef.current !== gridApi) {
        urlSyncRef.current?.destroy()
        urlSyncRef.current = null
        autoAppliedRef.current = false
      }

      // Create new instance if needed
      if (!urlSyncRef.current) {
        try {
          urlSyncRef.current = new AGGridUrlSync(gridApi, coreOptions)
          setIsReady(true)
          lastGridApiRef.current = gridApi
        } catch (error) {
          handleError(error, 'initialization')
          setIsReady(false)
        }
      }
    } else {
      // Clean up when grid API is null or disabled
      if (urlSyncRef.current) {
        urlSyncRef.current.destroy()
        urlSyncRef.current = null
        autoAppliedRef.current = false
      }
      setIsReady(false)
      lastGridApiRef.current = null
    }
  }, [gridApi, enabledWhenReady, coreOptions, handleError])

  /**
   * Whether the current URL carries any filter parameters.
   *
   * A key scan settles the prefixed case, since a prefixed param names a column
   * and an operation and so is a claim on its own. A grouped param needs its
   * value decoded before it counts, so that case falls through to a parse.
   * Neither path depends on a grid API being available.
   */
  const urlHasFilterParams = useCallback((): boolean => {
    if (typeof window === 'undefined') return false

    // Normalised the same way url-parser.ts does: an empty string falls back to
    // the default rather than passing through (startsWith('') matches every
    // param), and a missing trailing underscore is added so 'filter' cannot
    // match 'filterMode'. Without this a stray ?page=2 reads as a filter claim,
    // takes the URL-wins branch, and clears the user's stored view.
    const rawPrefix = coreOptions.paramPrefix || DEFAULT_CONFIG.paramPrefix
    const prefix = rawPrefix.endsWith('_') ? rawPrefix : `${rawPrefix}_`

    const groupedParams = new Set([
      coreOptions.groupedParam ?? DEFAULT_CONFIG.groupedParam,
      'grid_filters',
      'filters'
    ])

    const search = window.location.search
    const params = new URLSearchParams(search)
    let hasGroupedParam = false
    for (const key of params.keys()) {
      if (key.startsWith(prefix)) return true
      if (groupedParams.has(key)) hasGroupedParam = true
    }

    if (!hasGroupedParam) return false

    // Presence is not a claim for a grouped param. Two of the three names are
    // guesses at what a payload might be called, and 'filters' is just as
    // plausible a name for a host app's own quick-filter chips; a value written
    // under an older format can also stop decoding. Either way the param holds
    // nothing for this grid, but counting it as a claim takes the URL-wins
    // branch below, writes an empty model over the filters the user is looking
    // at, and clears the stored view pointer permanently.
    //
    // detectGroupedSerialization cannot distinguish these: detectFormat falls
    // back to 'querystring' for anything it does not recognise
    // (src/core/serialization/grouped.ts:139-151), so ?filters=recent comes back
    // isGrouped with both a value and a format, exactly like a real payload.
    // What separates them is what the decode yields, so decode and look.
    const probeConfig: InternalConfig = {
      // Nothing on the parsing path reads gridApi, and this has to stay callable
      // before the grid resolves, so there is none to hand over.
      gridApi: null as unknown as InternalConfig['gridApi'],
      // The raw option rather than the normalised `prefix` above: the grouped
      // querystring format decodes against config.paramPrefix, so the probe has
      // to use the value the real parse in applyFromUrl will use.
      paramPrefix: coreOptions.paramPrefix ?? DEFAULT_CONFIG.paramPrefix,
      maxValueLength:
        coreOptions.maxValueLength ?? DEFAULT_CONFIG.maxValueLength,
      // Silent by design. This is a probe, and applyFromUrl parses again and
      // reports for itself. A URL this call is about to dismiss must not raise.
      onParseError: () => {},
      serialization: coreOptions.serialization ?? DEFAULT_CONFIG.serialization,
      groupedParam: coreOptions.groupedParam ?? DEFAULT_CONFIG.groupedParam,
      format: coreOptions.format ?? DEFAULT_CONFIG.format
    }

    try {
      // The query string, not href, so the decode reads exactly the params the
      // scan above walked. url-parser.ts handles a leading '?' directly.
      return Object.keys(parseFilters(search, probeConfig)).length > 0
    } catch {
      // A URL the parser cannot even read is not a claim on the grid. The real
      // parse reports it if it is reached; here it just means "no".
      return false
    }
  }, [coreOptions])

  // Auto-apply on mount. URL filters win over a stored view: a shared link
  // should show the sender's filters, not the recipient's saved default.
  useEffect(() => {
    if (
      isReady &&
      autoApplyOnMount &&
      !autoAppliedRef.current &&
      urlSyncRef.current
    ) {
      // Armed before any work, not after it. This effect's dependencies are
      // fresh objects on every render, so it re-runs constantly; if a throw in
      // the body could leave the guard unset, the whole path would re-run and
      // re-report forever, and a consumer whose onError sets state would make
      // that self-sustaining. The guard means "auto-apply was attempted".
      autoAppliedRef.current = true

      try {
        // Without saved views the URL is the only source, so apply it
        // unconditionally. An empty URL clearing filters is the long-standing
        // behaviour and stays that way.
        if (!viewStore || !gridApi || urlHasFilterParams()) {
          urlSyncRef.current.applyFromUrl()

          // The URL won, so no saved view is active. Clear the stored pointer
          // too, or the next mount would restore a view the user never chose
          // here. State first, same as loadView.
          commitActiveViewId(null)
          try {
            // No-ops in the store when the pointer is already null, so a
            // blocked-storage user is not told a write failed that never needed
            // to happen.
            viewStore?.persistActiveViewId(null)
          } catch (error) {
            // Storage failing is not the URL failing: applyFromUrl already
            // succeeded, so this must not reach onParseError below.
            handleError(error, 'auto-apply-filters')
          }
          return
        }

        // Views are enabled and the URL makes no claim, so restore the stored
        // active view instead of clearing.
        const storedId = viewStore.getActiveViewId()
        const stored = storedId
          ? viewStore.listViews().find(view => view.id === storedId)
          : undefined

        if (stored) {
          gridApi.setFilterModel(stored.filterModel)
          // Applied, so the marker is now true of the live grid.
          commitActiveViewId(stored.id)
        } else {
          urlSyncRef.current.applyFromUrl()
        }
      } catch (error) {
        handleError(error, 'auto-apply-filters')
        coreOptions.onParseError?.(error as Error)
      }
    }
  }, [
    isReady,
    autoApplyOnMount,
    coreOptions,
    handleError,
    urlHasFilterParams,
    viewStore,
    gridApi,
    commitActiveViewId
  ])

  // Update current URL and filter state on filter changes
  useEffect(() => {
    if (!isReady || !urlSyncRef.current || !gridApi) {
      setCurrentUrl('')
      setHasFilters(false)
      return
    }

    const updateState = () => {
      try {
        const newUrl = urlSyncRef.current!.generateUrl()
        setCurrentUrl(newUrl)

        // Check if there are active filters by comparing query params
        const queryParams = urlSyncRef.current!.getQueryParams()
        const searchParams = new URLSearchParams(queryParams)
        setHasFilters([...searchParams.entries()].length > 0)
      } catch (error) {
        handleError(error, 'update-state')
      }
    }

    // Attach event listener for filter changes
    const onFilterChanged = () => updateState()
    gridApi.addEventListener('filterChanged', onFilterChanged)

    // Initial state update
    updateState()

    // Cleanup event listener on unmount or gridApi change
    return () => {
      gridApi.removeEventListener('filterChanged', onFilterChanged)
    }
  }, [isReady, gridApi, handleError])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (urlSyncRef.current) {
        urlSyncRef.current.destroy()
        urlSyncRef.current = null
      }
    }
  }, [])

  // Memoized API methods
  const shareUrl = useCallback(
    (baseUrl?: string): string => {
      if (!urlSyncRef.current) {
        return (
          baseUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
        )
      }
      try {
        return urlSyncRef.current.generateUrl(baseUrl)
      } catch (error) {
        handleError(error, 'generate-share-url')
        return (
          baseUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
        )
      }
    },
    [handleError]
  )

  const getQueryParams = useCallback((): string => {
    if (!urlSyncRef.current) {
      return ''
    }
    try {
      return urlSyncRef.current.getQueryParams()
    } catch (error) {
      handleError(error, 'get-query-params')
      return ''
    }
  }, [handleError])

  const applyUrlFilters = useCallback(
    (url?: string): void => {
      if (!urlSyncRef.current) {
        const warningMessage =
          'applyUrlFilters called while the hook is not ready.'
        console.warn(warningMessage)
        coreOptions.onParseError?.(new Error(warningMessage))
        return
      }
      try {
        urlSyncRef.current.applyFromUrl(url)
      } catch (error) {
        handleError(error, 'apply-url-filters')
        coreOptions.onParseError?.(error as Error)
      }
    },
    [coreOptions, handleError]
  )

  const clearFilters = useCallback((): void => {
    if (!urlSyncRef.current) {
      const warningMessage = 'clearFilters called while the hook is not ready.'
      console.warn(warningMessage)
      coreOptions.onParseError?.(new Error(warningMessage))
      return
    }
    try {
      urlSyncRef.current.clearFilters()
    } catch (error) {
      handleError(error, 'clear-filters')
    }
  }, [handleError, coreOptions])

  const parseUrlFilters = useCallback(
    (url: string): FilterState => {
      if (!gridApi) {
        return {} // Silently return empty state if grid API not available
      }
      try {
        const config = {
          gridApi,
          paramPrefix: coreOptions.paramPrefix ?? DEFAULT_CONFIG.paramPrefix,
          maxValueLength:
            coreOptions.maxValueLength ?? DEFAULT_CONFIG.maxValueLength,
          onParseError: coreOptions.onParseError ?? (() => {}),
          serialization:
            coreOptions.serialization ?? DEFAULT_CONFIG.serialization,
          groupedParam: coreOptions.groupedParam ?? DEFAULT_CONFIG.groupedParam,
          format: coreOptions.format ?? DEFAULT_CONFIG.format
        }
        return parseFilters(url, config)
      } catch (error) {
        handleError(error, 'parse-url-filters')
        coreOptions.onParseError?.(error as Error)
        return {}
      }
    },
    [coreOptions, gridApi, handleError]
  )

  const applyFilters = useCallback(
    (filters: FilterState): void => {
      if (!urlSyncRef.current) {
        const warningMessage =
          'applyFilters called while the hook is not ready.'
        console.warn(warningMessage)
        coreOptions.onParseError?.(new Error(warningMessage))
        return
      }
      try {
        urlSyncRef.current.applyFilters(filters)
      } catch (error) {
        handleError(error, 'apply-filters')
      }
    },
    [handleError, coreOptions]
  )

  const getFiltersAsFormat = useCallback(
    (format: SerializationFormat): string => {
      if (!urlSyncRef.current) {
        return ''
      }
      try {
        return urlSyncRef.current.getFiltersAsFormat(format)
      } catch (error) {
        handleError(error, 'get-filters-as-format')
        return ''
      }
    },
    [handleError]
  )

  const getCurrentFormat = useCallback((): SerializationMode => {
    if (!urlSyncRef.current) {
      return DEFAULT_CONFIG.serialization
    }
    try {
      return urlSyncRef.current.getSerializationMode()
    } catch (error) {
      handleError(error, 'get-current-format')
      return DEFAULT_CONFIG.serialization
    }
  }, [handleError])

  // Saved view operations. All no-op when storageKey is unset, and when the hook
  // is disabled: urlSyncRef is null on the init effect's disabled branch, which
  // is what every pre-existing mutator guards on, so views go inert with the
  // rest of the hook rather than staying live behind a feature flag.
  //
  // The reasons are reported differently on purpose. No storageKey, or a hook
  // deliberately disabled, means the feature was switched off by configuration:
  // silence is the contract, and "not ready" would be misleading when nothing is
  // pending. A grid that has not resolved yet is a timing problem the caller does
  // want to hear about: without it, clicking Save before the grid resolves does
  // nothing and says nothing, which is why the example had to hand-roll an
  // isReady check.
  const reportNotReady = useCallback(
    (operation: string, context: string): void => {
      handleError(
        new Error(`${operation} called while the hook is not ready.`),
        context
      )
    },
    [handleError]
  )

  const saveView = useCallback(
    (name: string): GridView | null => {
      if (!viewStore || !enabledWhenReady) {
        return null
      }
      if (!urlSyncRef.current || !gridApi) {
        reportNotReady('saveView', 'save-view')
        return null
      }

      try {
        // saveView records the new view as active inside the store.
        const view = viewStore.saveView(name, gridApi.getFilterModel())
        syncViewsFromStore()
        // The grid holds exactly these filters, so this view really is loaded.
        commitActiveViewId(view.id)
        return view
      } catch (error) {
        handleError(error, 'save-view')
        return null
      }
    },
    [
      viewStore,
      gridApi,
      handleError,
      syncViewsFromStore,
      reportNotReady,
      enabledWhenReady,
      commitActiveViewId
    ]
  )

  const loadView = useCallback(
    (id: string | null): void => {
      // Guard on the store as well as the grid, matching saveView and
      // deleteView. Without this, loadView(null) resets the grid even with views
      // disabled, which contradicts the documented contract. clearFilters
      // is already the API for that, independently of saved views.
      if (!viewStore || !enabledWhenReady) {
        return
      }
      if (!urlSyncRef.current || !gridApi) {
        reportNotReady('loadView', 'load-view')
        return
      }

      try {
        // Applying the model fires filterChanged, which refreshes currentUrl and
        // hasFilters through the existing listener.
        // Loose comparison so a JavaScript caller passing nothing gets the reset
        // they intended, rather than a lookup for a view whose id is undefined.
        // Mirror state before the durable write in both branches. The write can
        // throw, and the grid has already been changed by then. Losing the
        // pointer across a reload is a fair trade, but leaving the marker naming
        // a different view than the grid shows is not. The throw still reports.
        if (id == null) {
          gridApi.setFilterModel({})
          commitActiveViewId(null)
          viewStore.persistActiveViewId(null)
          return
        }

        const view = viewStore
          .listViews()
          .find(candidate => candidate.id === id)

        if (!view) {
          // The store just disagreed with the mirror, so trust the store. Another
          // tab may have deleted this view; without a resync its button stays on
          // screen and every click reports the same miss.
          syncViewsFromStore()
          handleError(new Error(`No saved view with id "${id}"`), 'load-view')
          return
        }

        gridApi.setFilterModel(view.filterModel)
        commitActiveViewId(view.id)
        viewStore.persistActiveViewId(view.id)
      } catch (error) {
        handleError(error, 'load-view')
      }
    },
    [
      gridApi,
      viewStore,
      handleError,
      reportNotReady,
      syncViewsFromStore,
      enabledWhenReady,
      commitActiveViewId
    ]
  )

  const deleteView = useCallback(
    (id: string): void => {
      // Guarded on configuration rather than readiness, unlike saveView and
      // loadView. Those need the grid: one reads its filter model, the other
      // writes it. Deleting only touches storage, and the body below already
      // handles a null grid, so a view-management panel beside an unresolved grid
      // can still delete. urlSyncRef would have implied a grid requirement,
      // because it is only ever assigned when gridApi is present.
      if (!viewStore || !enabledWhenReady) {
        return
      }

      try {
        // The session marker, not the store's pointer: only this says the view
        // was actually applied to the live grid. Capture the view before
        // deleting, since the store drops it.
        //
        // Read from the ref rather than the state. A handler can save, load and
        // delete in one tick, and the state would still hold the value from the
        // last committed render: wasActive would come out false against a view
        // the same tick just made active, leaving the marker naming a deleted
        // view and the grid filtered by it.
        const wasActive = activeViewIdRef.current === id
        const view = viewStore.listViews().find(entry => entry.id === id)

        // Delete first: it is what was asked for, so it must not be gated behind
        // the grid inspection below, which can throw.
        viewStore.deleteView(id)
        syncViewsFromStore()

        if (wasActive) {
          commitActiveViewId(null)
        }

        // Clearing the grid is cosmetic by comparison, so best-effort. Only when
        // the grid still shows exactly this view. After a hand-edit the model is
        // the user's, not the view's. getFilterModel throws on a destroyed grid
        // and can return null despite its type.
        if (wasActive && view !== undefined && gridApi !== null) {
          try {
            const current = gridApi.getFilterModel()
            if (current && sameFilterModel(current, view.filterModel)) {
              gridApi.setFilterModel({})
            }
          } catch (error) {
            handleError(error, 'delete-view')
          }
        }
      } catch (error) {
        handleError(error, 'delete-view')
      }
    },
    [
      viewStore,
      gridApi,
      handleError,
      syncViewsFromStore,
      enabledWhenReady,
      commitActiveViewId
    ]
  )

  // Return the hook API
  return useMemo(
    () => ({
      shareUrl,
      getQueryParams,
      applyUrlFilters,
      clearFilters,
      isReady,
      currentUrl,
      hasFilters,
      parseUrlFilters,
      applyFilters,
      getFiltersAsFormat,
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
      parseUrlFilters,
      applyFilters,
      getFiltersAsFormat,
      getCurrentFormat,
      views,
      activeViewId,
      saveView,
      loadView,
      deleteView
    ]
  )
}

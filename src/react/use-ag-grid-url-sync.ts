import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { GridApi } from 'ag-grid-community'
import { AGGridUrlSync } from '../core/ag-grid-url-sync.js'
import { parseUrlFilters as parseFilters } from '../core/url-parser.js'
import { createViewStore, type GridView } from '../core/view-storage.js'
import { DEFAULT_CONFIG } from '../core/validation.js'
import type {
  FilterState,
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

  // Mirror the list on mount and whenever storageKey swaps the store for a
  // different namespace. Without this, switching key leaves the previous
  // namespace's views on screen until the next mutation happens to resync them.
  //
  // The active marker resets here too: on a fresh mount nothing has been applied
  // yet, and a new namespace's view certainly has not been.
  useEffect(() => {
    syncViewsFromStore()
    setActiveViewId(null)
  }, [syncViewsFromStore])

  // Refs to track state and prevent memory leaks
  const urlSyncRef = useRef<AGGridUrlSync | null>(null)
  const autoAppliedRef = useRef(false)
  const lastGridApiRef = useRef<GridApi | null>(null)

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
   * Deliberately a cheap key scan rather than a full parse: this only needs to
   * know whether the URL is making a claim about filters, and it must not depend
   * on a grid API being available.
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

    const params = new URLSearchParams(window.location.search)
    for (const key of params.keys()) {
      if (key.startsWith(prefix) || groupedParams.has(key)) return true
    }
    return false
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
          setActiveViewId(null)
          try {
            // Only write when it would actually change something. This is a
            // read-modify-write that throws whenever setItem does, so writing an
            // already-null pointer means anyone with storage blocked gets an
            // error on page load having done nothing, and "delete a saved view"
            // is useless advice to someone who has none.
            if (viewStore && viewStore.getActiveViewId() !== null) {
              viewStore.persistActiveViewId(null)
            }
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
          setActiveViewId(stored.id)
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
    gridApi
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
  const saveView = useCallback(
    (name: string): GridView | null => {
      if (!urlSyncRef.current || !viewStore || !gridApi) {
        return null
      }

      try {
        // saveView records the new view as active inside the store.
        const view = viewStore.saveView(name, gridApi.getFilterModel())
        syncViewsFromStore()
        // The grid holds exactly these filters, so this view really is loaded.
        setActiveViewId(view.id)
        return view
      } catch (error) {
        handleError(error, 'save-view')
        return null
      }
    },
    [viewStore, gridApi, handleError, syncViewsFromStore]
  )

  const loadView = useCallback(
    (id: string | null): void => {
      // Guard on the store as well as the grid, matching saveView and
      // deleteView. Without this, loadView(null) resets the grid even with views
      // disabled, which contradicts the documented contract. clearFilters
      // is already the API for that, independently of saved views.
      if (!urlSyncRef.current || !viewStore || !gridApi) {
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
          setActiveViewId(null)
          viewStore.persistActiveViewId(null)
          return
        }

        const view = viewStore
          .listViews()
          .find(candidate => candidate.id === id)

        if (!view) {
          handleError(new Error(`No saved view with id "${id}"`), 'load-view')
          return
        }

        gridApi.setFilterModel(view.filterModel)
        setActiveViewId(view.id)
        viewStore.persistActiveViewId(view.id)
      } catch (error) {
        handleError(error, 'load-view')
      }
    },
    [gridApi, viewStore, handleError]
  )

  const deleteView = useCallback(
    (id: string): void => {
      // No gridApi requirement: deleting a stored view is a storage operation,
      // and the body already handles the grid being absent.
      if (!urlSyncRef.current || !viewStore) {
        return
      }

      try {
        // The session marker, not the store's pointer: only this says the view
        // was actually applied to the live grid. Capture the view before
        // deleting, since the store drops it.
        const wasActive = activeViewId === id
        const view = viewStore.listViews().find(entry => entry.id === id)

        // Delete first: it is what was asked for, so it must not be gated behind
        // the grid inspection below, which can throw.
        viewStore.deleteView(id)
        syncViewsFromStore()

        if (wasActive) {
          setActiveViewId(null)
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
    [viewStore, gridApi, handleError, syncViewsFromStore, activeViewId]
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

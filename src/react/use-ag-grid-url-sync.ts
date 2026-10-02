import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { FilterChangedEvent, GridApi } from 'ag-grid-community'
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
 * The part of a model the grid can take: AG Grid drops entries for columns it
 * does not have or that do not allow filtering.
 */
function applicableModel(
  gridApi: GridApi,
  model: Record<string, unknown>
): Record<string, unknown> {
  if (typeof gridApi.getColumn !== 'function') return model
  return Object.fromEntries(
    Object.entries(model).filter(
      ([colId]) => gridApi.getColumn(colId)?.isFilterAllowed() ?? false
    )
  )
}

/**
 * Whether a model could be a view write landing, in any form the grid gave it.
 *
 * setFilterModel resets every column filter the model leaves out, so once a
 * view lands the grid filters only the view's columns. The exception is a
 * column AG Grid still holds in its initial filter state, which the write does
 * not reset, so a column the grid was already filtering exactly as before is
 * allowed too. Any other column means some other write, whatever its source.
 */
function couldBeLanding(
  live: Record<string, unknown>,
  expected: Record<string, unknown>,
  before: Record<string, unknown> | null
): boolean {
  return Object.keys(live).every(
    colId =>
      Object.hasOwn(expected, colId) ||
      (before !== null &&
        Object.hasOwn(before, colId) &&
        JSON.stringify(live[colId]) === JSON.stringify(before[colId]))
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
  // The active view as the grid reported it once applied, which is what
  // reconciliation compares against: a grid that normalises the stored model
  // would otherwise read as the user filtering away.
  const appliedModelRef = useRef<Record<string, unknown> | null>(null)
  // Set while a view write may not have reached the grid. AG Grid can defer
  // setFilterModel (until column types are inferred, or filter components
  // resolve), so the model can land after the call returns. Holds the model the
  // grid showed before the write and the form it should show once it lands, so
  // filterChanged can tell the view landing from the user editing instead of
  // assuming the former.
  const pendingWriteRef = useRef<{
    before: Record<string, unknown> | null
    expected: Record<string, unknown>
  } | null>(null)
  // True only inside applyModelToGrid's own setFilterModel call. AG Grid fires
  // filterChanged synchronously when it can apply straight away, and an event
  // raised from inside the write is the write landing, whatever form it took.
  const writingRef = useRef(false)
  const commitActiveViewId = useCallback((id: string | null): void => {
    activeViewIdRef.current = id
    setActiveViewId(id)
    if (id === null) {
      appliedModelRef.current = null
      pendingWriteRef.current = null
    }
  }, [])

  /** Writes a view's model to the grid and records what the grid made of it. */
  const applyModelToGrid = useCallback(
    (api: GridApi, model: Record<string, unknown>): void => {
      let before: Record<string, unknown> | null = null
      try {
        before = api.getFilterModel() ?? {}
      } catch {
        // Unknown pre-write state: the first event is taken as the landing.
      }
      pendingWriteRef.current = {
        before,
        expected: applicableModel(api, model)
      }
      writingRef.current = true
      try {
        api.setFilterModel(model)
      } catch (error) {
        pendingWriteRef.current = null
        throw error
      } finally {
        writingRef.current = false
      }
      // Already settled if the grid announced the change synchronously.
      if (!pendingWriteRef.current) return

      let live: Record<string, unknown> | null = null
      try {
        live = api.getFilterModel() ?? {}
      } catch {
        // Leave it to filterChanged.
      }
      // Anything other than the pre-write model means the write has landed,
      // possibly in a different form (AG Grid ignores entries it no longer
      // accepts). Only an unchanged model can still be a deferred write.
      if (live && (!before || !sameFilterModel(live, before))) {
        pendingWriteRef.current = null
        appliedModelRef.current = live
      }
    },
    []
  )

  /**
   * Runs a filter write of the hook's own over a view write that may still be
   * pending.
   *
   * AG Grid reports both as 'api' changes, so a pending write would take the
   * hook's for its landing and keep a view the grid never showed. It is settled
   * against the form the view should have taken before the write runs, which
   * also covers an event raised from inside it, and the hook's write is then
   * reconciled like any other edit.
   *
   * That only holds if the write reached the grid. When it threw, or left the
   * model as it found it (the core swallows its own errors, the advanced filter
   * turns setFilterModel into a no-op, and a write that changes nothing raises
   * no event), the restore is as undecided as before, so it goes back to
   * pending. A restore that then lands normalised is still told apart from an
   * edit.
   */
  const writeOverPendingView = useCallback(
    (write: () => void): void => {
      const pending = pendingWriteRef.current
      if (!pending || !gridApi) {
        write()
        return
      }

      const applied = appliedModelRef.current
      const activeId = activeViewIdRef.current
      let before: Record<string, unknown> | null = null
      try {
        before = gridApi.getFilterModel() ?? {}
      } catch {
        // Unreadable: nothing to tell a landed write from a missed one by.
      }

      pendingWriteRef.current = null
      appliedModelRef.current = pending.expected

      // Not if an event during the write already settled the view one way or
      // the other: that decision is newer than this snapshot.
      const reinstate = (): void => {
        if (pendingWriteRef.current || activeViewIdRef.current !== activeId) {
          return
        }
        pendingWriteRef.current = pending
        appliedModelRef.current = applied
      }

      try {
        write()
      } catch (error) {
        reinstate()
        throw error
      }

      if (!before) return
      try {
        const live = gridApi.getFilterModel() ?? {}
        if (sameFilterModel(live, before)) reinstate()
      } catch {
        // Leave it superseded; the next event reconciles.
      }
    },
    [gridApi]
  )

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
  // Whether the URL's filters have already won over a stored view on this grid.
  // The library never rewrites the address bar, so a shared link's params stay
  // there all session: without this, a storageKey swap would apply them again
  // over the user's edits and clear the new namespace's pointer.
  const urlAppliedRef = useRef(false)
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
  // Only when a store still exists. storageKey dropping to undefined runs this
  // too, and re-arming there sends auto-apply down its !viewStore branch, where
  // applyFromUrl() against a filterless URL clears the grid. A store that has
  // gone away has no namespace left to apply.
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
        urlAppliedRef.current = false
        // The marker described the grid that went away; this one has had
        // nothing applied. Session marker only - the pointer still records what
        // to restore, and with autoApplyOnMount the re-arm above does restore it.
        commitActiveViewId(null)
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
        urlAppliedRef.current = false
        // As above: no live grid left for the marker to describe. Guarded on
        // urlSyncRef so a first render with a null gridApi touches nothing.
        commitActiveViewId(null)
      }
      setIsReady(false)
      lastGridApiRef.current = null
    }
  }, [gridApi, enabledWhenReady, coreOptions, handleError, commitActiveViewId])

  /**
   * Whether the current URL carries any filter parameters.
   *
   * Scan to rule out URLs with no filter param at all, then decode what
   * survives: presence does not mean the param yields a filter, and yielding a
   * filter is what this answers. Neither step needs a grid API.
   */
  const urlHasFilterParams = useCallback((): boolean => {
    if (typeof window === 'undefined') return false

    // Normalised: an empty string falls back to the default rather than passing
    // through (startsWith('') matches everything), and a trailing underscore is
    // added so 'filter' cannot match 'filterMode'. Without it a stray ?page=2
    // reads as a claim and clears the user's stored view.
    const rawPrefix = coreOptions.paramPrefix || DEFAULT_CONFIG.paramPrefix
    const prefix = rawPrefix.endsWith('_') ? rawPrefix : `${rawPrefix}_`

    const groupedParams = new Set([
      coreOptions.groupedParam ?? DEFAULT_CONFIG.groupedParam,
      'grid_filters',
      'filters'
    ])

    const search = window.location.search
    const params = new URLSearchParams(search)
    let hasFilterParam = false
    for (const key of params.keys()) {
      if (key.startsWith(prefix) || groupedParams.has(key)) {
        hasFilterParam = true
        break
      }
    }

    if (!hasFilterParam) return false

    // Presence is not a claim, for either kind.
    //
    // Grouped: 'filters' and 'grid_filters' are guesses at what a payload might
    // be called, so a host app's own param answers to one; a value under an
    // older format also stops decoding. detectGroupedSerialization cannot tell
    // these from a payload, because detectFormat falls back to 'querystring' for
    // anything unrecognised (serialization/grouped.ts:139-151).
    //
    // Prefixed: the parser wraps each param in a try and continues past any that
    // throws (url-parser.ts:374-381), so ?f_name_regex=abc (no such operation)
    // and a value over maxValueLength both parse to {}.
    //
    // Counting any of those as a claim takes the URL-wins branch below, writes
    // an empty model over the user's filters, and clears the stored pointer for
    // good. Only the decode separates a claim from a coincidence.
    const probeConfig: InternalConfig = {
      // Unread on the parsing path, and this must stay callable before the grid
      // resolves.
      gridApi: null as unknown as InternalConfig['gridApi'],
      // Raw rather than normalised, and `??` rather than `||`: AGGridUrlSync
      // merges by spread (ag-grid-url-sync.ts:27-31) and lets an empty prefix
      // through. The probe must decide on the same terms as the real parse.
      paramPrefix: coreOptions.paramPrefix ?? DEFAULT_CONFIG.paramPrefix,
      maxValueLength:
        coreOptions.maxValueLength ?? DEFAULT_CONFIG.maxValueLength,
      // Silent: applyFromUrl parses again and reports for itself, and a URL this
      // is about to dismiss must not raise.
      onParseError: () => {},
      serialization: coreOptions.serialization ?? DEFAULT_CONFIG.serialization,
      groupedParam: coreOptions.groupedParam ?? DEFAULT_CONFIG.groupedParam,
      format: coreOptions.format ?? DEFAULT_CONFIG.format
    }

    try {
      // The query string, not href, so the decode reads the params the scan
      // walked; url-parser.ts takes a leading '?' directly. A whole parse even
      // when the prefixed param is valid, but this runs once per armed
      // auto-apply from the single call site below, not per render.
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
        //
        // With views, the URL wins once per grid. A storageKey swap re-arms
        // this on a live grid, and by then the URL has had its say: go straight
        // to the new namespace's stored view.
        if (
          !viewStore ||
          !gridApi ||
          (!urlAppliedRef.current && urlHasFilterParams())
        ) {
          urlSyncRef.current.applyFromUrl()
          if (viewStore && gridApi) {
            urlAppliedRef.current = true
          }

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

        // Views are enabled and the URL makes no claim, or already won on this
        // grid, so restore the stored active view instead of clearing.
        const storedId = viewStore.getActiveViewId()
        const stored = storedId
          ? viewStore.listViews().find(view => view.id === storedId)
          : undefined

        if (stored) {
          // Opposite ordering to loadView: the marker follows the write, so a
          // throw leaves it where it was with nothing to roll back.
          try {
            applyModelToGrid(gridApi, stored.filterModel)
            // Cannot throw itself; it sits in the try only so that a failed
            // write above skips it and the marker is not committed.
            commitActiveViewId(stored.id)
          } catch (error) {
            // A grid rejecting the stored view's model is not the URL being
            // invalid (the URL made no claim), so it must not reach
            // onParseError. Same as loadView: onError only.
            handleError(error, 'auto-apply-filters')
          }
        }

        // No stored view, and deliberately nothing else. Views are enabled, the
        // URL makes no claim and this namespace has nothing saved, so neither
        // source has anything to say. applyFromUrl() would not be a no-op here:
        // against a filterless URL it calls setFilterModel({}) and wipes what
        // the user set by hand. That bites on a storageKey swap between two real
        // namespaces, which re-arms the guard and re-runs this on a live grid.
        // The !viewStore case returned at the branch above and keeps its
        // unconditional apply there.
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
    commitActiveViewId,
    applyModelToGrid
  ])

  // Update current URL and filter state on filter changes
  useEffect(() => {
    if (!isReady || !urlSyncRef.current || !gridApi) {
      setCurrentUrl('')
      setHasFilters(false)
      return
    }

    /**
     * Drops the active view marker once the grid stops showing that view.
     *
     * activeViewId claims a view is applied to the live grid, so every route
     * that changes the model must be able to falsify it. saveView, loadView,
     * deleteView and auto-apply set it directly; clearFilters, applyFilters,
     * applyUrlFilters and a user editing a filter in the grid's own UI do not,
     * and all reach filterChanged instead.
     */
    const syncActiveViewToGrid = (
      fromEvent: boolean,
      source?: FilterChangedEvent['source']
    ) => {
      const activeId = activeViewIdRef.current
      let applied = appliedModelRef.current
      if (!pendingWriteRef.current && (!activeId || !applied || !viewStore)) {
        return
      }

      let live: Record<string, unknown>
      try {
        // Throws on a destroyed grid, and can return null despite its type.
        live = gridApi.getFilterModel() ?? {}
      } catch {
        // No read means no evidence the view stopped applying.
        return
      }

      // A view write is in flight. The next filterChanged is it landing; until
      // then the grid may still show its previous model.
      const pending = pendingWriteRef.current
      if (pending) {
        if (!fromEvent) return
        const inWrite = writingRef.current
        // Outside the write, an event still showing the pre-write model is not
        // the landing; keep waiting.
        if (
          !inWrite &&
          pending.before &&
          sameFilterModel(live, pending.before)
        ) {
          return
        }
        pendingWriteRef.current = null
        // The landing, in whatever form the grid accepted: raised from inside
        // the write, replayed by the grid as an API change once a deferred
        // write goes through, or simply matching the view. An API change is
        // not enough on its own: AG Grid reports an app's setFilterModel the
        // same way, so it must also filter nothing the view could not have.
        if (
          inWrite ||
          (source === 'api' &&
            couldBeLanding(live, pending.expected, pending.before)) ||
          sameFilterModel(live, pending.expected)
        ) {
          appliedModelRef.current = live
          return
        }
        // Anything else is the user editing over a view the grid never
        // applied: reconcile against what the view should have produced, so
        // it unloads like any other edit.
        applied = pending.expected
      }

      if (!activeId || !applied || !viewStore) return
      if (sameFilterModel(live, applied)) return

      commitActiveViewId(null)
      try {
        // The pointer too, or autoApplyOnMount would reapply the view the user
        // just filtered away. Only while it names this view: another tab may
        // have moved it.
        if (viewStore.getActiveViewId() === activeId) {
          viewStore.persistActiveViewId(null)
        }
      } catch (error) {
        // Only the durable pointer is stale; the marker is already right.
        handleError(error, 'filter-change')
      }
    }

    const updateState = (
      fromEvent: boolean,
      source?: FilterChangedEvent['source']
    ) => {
      syncActiveViewToGrid(fromEvent, source)

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
    const onFilterChanged = (event?: FilterChangedEvent) =>
      updateState(true, event?.source)
    gridApi.addEventListener('filterChanged', onFilterChanged)

    // Initial state update
    updateState(false)

    // Cleanup event listener on unmount or gridApi change
    return () => {
      gridApi.removeEventListener('filterChanged', onFilterChanged)
    }
  }, [isReady, gridApi, handleError, viewStore, commitActiveViewId])

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
        const sync = urlSyncRef.current
        writeOverPendingView(() => sync.applyFromUrl(url))
      } catch (error) {
        handleError(error, 'apply-url-filters')
        coreOptions.onParseError?.(error as Error)
      }
    },
    [coreOptions, handleError, writeOverPendingView]
  )

  const clearFilters = useCallback((): void => {
    if (!urlSyncRef.current) {
      const warningMessage = 'clearFilters called while the hook is not ready.'
      console.warn(warningMessage)
      coreOptions.onParseError?.(new Error(warningMessage))
      return
    }
    try {
      const sync = urlSyncRef.current
      writeOverPendingView(() => sync.clearFilters())
    } catch (error) {
      handleError(error, 'clear-filters')
    }
  }, [handleError, coreOptions, writeOverPendingView])

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
        const sync = urlSyncRef.current
        writeOverPendingView(() => sync.applyFilters(filters))
      } catch (error) {
        handleError(error, 'apply-filters')
      }
    },
    [handleError, coreOptions, writeOverPendingView]
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
        // The grid holds exactly these filters, in its own form.
        commitActiveViewId(view.id)
        appliedModelRef.current = view.filterModel
        pendingWriteRef.current = null
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
        //
        // Marker before the durable write: if persist throws, the grid has
        // already changed, and a stale pointer across a reload is a fair trade
        // where a marker naming a view the grid is not showing is not. A grid
        // write that throws rolls the marker back, since the grid never took it.
        const previous = activeViewIdRef.current
        const previousApplied = appliedModelRef.current
        const rollBack = (): void => {
          commitActiveViewId(previous)
          appliedModelRef.current = previousApplied
        }

        if (id == null) {
          commitActiveViewId(null)
          try {
            applyModelToGrid(gridApi, {})
          } catch (error) {
            rollBack()
            throw error
          }
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

        commitActiveViewId(view.id)
        try {
          applyModelToGrid(gridApi, view.filterModel)
        } catch (error) {
          // The grid never took it and the pointer still names `previous`, so
          // restoring keeps the two agreeing. The outer catch reports.
          rollBack()
          throw error
        }
        // Only while the marker still names it: a pointer to a view the marker
        // has already dropped would restore on the next mount a view the UI
        // never showed as loaded.
        if (activeViewIdRef.current === view.id) {
          viewStore.persistActiveViewId(view.id)
        }
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
      commitActiveViewId,
      applyModelToGrid
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
        // From the ref, not the state: a handler can save, load and delete in
        // one tick, and the state is still a render behind, so wasActive would
        // come out false against a view that same tick just made active.
        const wasActive = activeViewIdRef.current === id
        const view = viewStore.listViews().find(entry => entry.id === id)
        // In the grid's form where there is one, as reconciliation compares.
        const applied = appliedModelRef.current ?? view?.filterModel

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
        if (wasActive && applied !== undefined && gridApi !== null) {
          try {
            const current = gridApi.getFilterModel()
            if (current && sameFilterModel(current, applied)) {
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

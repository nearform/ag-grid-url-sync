import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type {
  FilterChangedEvent,
  FilterModel,
  GridApi
} from 'ag-grid-community'
import { useSyncExternalStore } from 'use-sync-external-store/shim'
import { AGGridUrlSync } from '../core/ag-grid-url-sync.js'
import { createGridUrlSync, IDLE_SNAPSHOT } from '../core/grid-url-sync.js'
import { parseUrlFilters as parseFilters } from '../core/url-parser.js'
import { resolveParamPrefix } from '../core/individual-params.js'
import { createViewStore, type GridView } from '../core/view-storage.js'
import { DEFAULT_CONFIG, resolveOptions } from '../core/options.js'
import { toError } from '../core/to-error.js'
import { isDataIssue, shouldThrow, toIssue } from '../core/issues.js'
import { URLSyncError } from '../core/types.js'
import type {
  AGGridUrlSyncConfig,
  FilterState,
  GridUrlSync,
  GridUrlSyncSnapshot,
  IssueEvent,
  SerializationFormat,
  SerializationMode
} from '../core/types.js'
import type {
  UseAGGridUrlSyncOptions,
  UseAGGridUrlSyncReturn
} from './types.js'
import { createSyncHolder } from './sync-holder.js'
import { gridUrlSyncOptions } from './sync-options.js'

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
function sameFilterModel(a: FilterModel, b: FilterModel): boolean {
  const keys = Object.keys(a)

  return (
    keys.length === Object.keys(b).length &&
    keys.every(key => JSON.stringify(a[key]) === JSON.stringify(b[key]))
  )
}

/** The empty list, one object so that an empty state keeps its identity */
const NO_ISSUES: readonly URLSyncError[] = []

/** The snapshot of a server render: no grid and no sync yet (#222) */
const getServerSnapshot = (): GridUrlSyncSnapshot => IDLE_SNAPSHOT

/** Whether two lists have the same issues: the code, message and column */
function sameIssues(
  a: readonly URLSyncError[],
  b: readonly URLSyncError[]
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (issue, index) =>
        issue.code === b[index]?.code &&
        issue.message === b[index]?.message &&
        issue.column === b[index]?.column
    )
  )
}

/**
 * A state update to the data issues in the list. It keeps the previous array
 * when the issues are the same, so a filter change does not make a new one.
 */
function keepIssues(
  list: readonly Error[]
): (previous: readonly URLSyncError[]) => readonly URLSyncError[] {
  const next = list.filter(isDataIssue)

  return previous => (sameIssues(previous, next) ? previous : next)
}

/**
 * Runs one grid API call. An error from the grid becomes a GRID_ERROR issue,
 * with the grid's error as its cause, so onError gets a code for it (#220).
 */
function callGrid<T>(call: () => T): T {
  try {
    return call()
  } catch (cause) {
    throw toIssue(cause, 'GRID_ERROR')
  }
}

/**
 * The part of a model the grid can take: AG Grid drops entries for columns it
 * does not have or that do not allow filtering.
 */
function applicableModel(gridApi: GridApi, model: FilterModel): FilterModel {
  // A test double or an old AG Grid version can lack getColumn
  if (!('getColumn' in gridApi)) return model

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
  live: FilterModel,
  expected: FilterModel,
  before: FilterModel | null
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

  // The URL state comes from the sync (#222). The holder exists before the
  // sync, which the init effect makes, so React always has a store to read.
  const [holder] = useState(createSyncHolder)

  const snapshot = useSyncExternalStore(
    holder.subscribe,
    holder.getSnapshot,
    getServerSnapshot
  )

  const isReady = snapshot.status === 'active'
  const currentUrl = isReady ? snapshot.url : ''
  const hasFilters = isReady && snapshot.hasFilters

  // The data issues of the latest apply (#229). Only data issues: operation
  // failures go to onError. The grid-read issues come from the snapshot.
  const [applyIssues, setApplyIssues] = useState(NO_ISSUES)

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
  const appliedModelRef = useRef<FilterModel | null>(null)

  // Set while a view write may not have reached the grid. AG Grid can defer
  // setFilterModel (until column types are inferred, or filter components
  // resolve), so the model can land after the call returns. Holds the model the
  // grid showed before the write and the form it should show once it lands, so
  // filterChanged can tell the view landing from the user editing instead of
  // assuming the former.
  const pendingWriteRef = useRef<{
    before: FilterModel | null
    expected: FilterModel
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
    (api: GridApi, model: FilterModel): void => {
      let before: FilterModel | null = null

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
        callGrid(() => api.setFilterModel(model))
      } catch (error) {
        pendingWriteRef.current = null
        throw error
      } finally {
        writingRef.current = false
      }

      // Already settled if the grid announced the change synchronously.
      if (!pendingWriteRef.current) return

      let live: FilterModel | null = null

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
      let before: FilterModel | null = null

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
    // oxlint-disable-next-line react/set-state-in-effect -- syncs from the view store (localStorage); #223 moves the saved views out of the hook
    syncViewsFromStore()
    commitActiveViewId(null)

    if (viewStore) {
      autoAppliedRef.current = false
    }
  }, [syncViewsFromStore, viewStore, commitActiveViewId])

  // The latest callbacks. The core is made one time per grid, and it reads
  // them through this ref, so a new callback on a later render is used.
  const callbacksRef = useRef({
    onError,
    onParseError: coreOptions.onParseError
  })

  useEffect(() => {
    callbacksRef.current = { onError, onParseError: coreOptions.onParseError }
  })

  // The hook operation that is calling the core. A grid error that the core
  // reports gets it as its context.
  const contextRef = useRef('initialization')

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

  // Make the sync and the class instance for each grid and each set of
  // URL-format options. The class does the operations; the sync gives the
  // URL state (#222). A new grid resets what described the old one. A new
  // option only changes the URL format: the grid keeps its filters, and the
  // URL is not applied again.
  useEffect(() => {
    const previousGrid = lastGridApiRef.current
    const live = gridApi && enabledWhenReady ? gridApi : null

    if (previousGrid && previousGrid !== live) {
      autoAppliedRef.current = false
      urlAppliedRef.current = false
      // The marker described the grid that went away; this one has had
      // nothing applied. Session marker only - the pointer still records what
      // to restore, and with autoApplyOnMount the re-arm above does restore it.
      commitActiveViewId(null)
      // Nothing has been applied to the new grid yet
      setApplyIssues(NO_ISSUES)
    }

    lastGridApiRef.current = live

    if (!live) return

    let sync: GridUrlSync | null = null

    // A grid-read issue gets the context of the state update, as before
    const onIssue = ({ issue, source }: IssueEvent): void =>
      reportFailure(
        issue,
        source === 'grid' ? 'update-state' : 'initialization'
      )

    try {
      urlSyncRef.current = new AGGridUrlSync(live, {
        ...urlOptions,
        onParseError: issue => reportFailure(issue, contextRef.current)
      })
      sync = createGridUrlSync(gridUrlSyncOptions(live, urlOptions, onIssue))
    } catch (error) {
      urlSyncRef.current = null
      reportFailure(error, 'initialization')

      return
    }

    const core = urlSyncRef.current

    // AG Grid destroyed the grid: the operations take the not-ready path, as
    // with no grid
    const stopWatching = sync.subscribe(() => {
      if (
        sync?.getSnapshot().status === 'destroyed' &&
        urlSyncRef.current === core
      ) {
        urlSyncRef.current = null
      }
    })

    holder.set(sync)

    return () => {
      stopWatching()
      sync?.destroy()
      core.destroy()

      if (urlSyncRef.current === core) urlSyncRef.current = null

      holder.set(null)
    }
  }, [
    gridApi,
    enabledWhenReady,
    urlOptions,
    holder,
    reportFailure,
    commitActiveViewId
  ])

  /**
   * Whether the current URL carries any filter parameters.
   *
   * Scan to rule out URLs with no filter param at all, then decode what
   * survives: presence does not mean the param yields a filter, and yielding a
   * filter is what this answers. Neither step needs a grid API.
   */
  const urlHasFilterParams = useCallback((): boolean => {
    if (typeof window === 'undefined') return false

    // The same options as the real parse, so the probe decides on the same
    // terms. No grid is needed, so this stays callable before the grid
    // resolves.
    const options = resolveOptions(urlOptions)

    // The same prefix the writer and the parser use: an empty string means
    // the default rather than matching everything, and a trailing underscore
    // is added so 'filter' cannot match 'filterMode'. Without it a stray
    // ?page=2 reads as a claim and clears the user's stored view.
    const prefix = resolveParamPrefix(options.paramPrefix)

    // Only the configured name, the same one the parser reads.
    const { groupedParam } = options

    const search = window.location.search
    const params = new URLSearchParams(search)
    let hasFilterParam = false

    for (const key of params.keys()) {
      if (key.startsWith(prefix) || key === groupedParam) {
        hasFilterParam = true
        break
      }
    }

    if (!hasFilterParam) return false

    // Presence is not a claim, for either kind.
    //
    // Grouped: a value that does not decode with the configured format (an
    // older format, or a value the host app wrote under the same name) gives
    // no filters.
    //
    // Prefixed: the parser wraps each param in a try and continues past any that
    // throws (url-parser.ts:374-381), so ?f_name_regex=abc (no such operation)
    // and a value over maxValueLength both parse to {}.
    //
    // Counting any of those as a claim takes the URL-wins branch below, writes
    // an empty model over the user's filters, and clears the stored pointer for
    // good. Only the decode separates a claim from a coincidence.
    const probeConfig = {
      ...options,
      // Silent: applyFromUrl parses again and reports for itself, and a URL this
      // is about to dismiss must not raise.
      onParseError: () => {}
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
  }, [urlOptions])

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
          contextRef.current = 'auto-apply-filters'
          const applied = urlSyncRef.current.applyFromUrl()
          setApplyIssues(keepIssues(applied.issues))

          if (viewStore && gridApi) {
            urlAppliedRef.current = true
          }

          // The URL won, so no saved view is active. Clear the stored pointer
          // too, or the next mount would restore a view the user never chose
          // here. State first, same as loadView.
          // oxlint-disable-next-line react/set-state-in-effect -- the URL won over the saved view, so the active marker clears; #223 moves the saved views out of the hook
          commitActiveViewId(null)

          try {
            // No-ops in the store when the pointer is already null, so a
            // blocked-storage user is not told a write failed that never needed
            // to happen.
            viewStore?.persistActiveViewId(null)
          } catch (error) {
            // Storage failing is not the URL failing: applyFromUrl already
            // succeeded, so this must not reach onParseError below.
            reportFailure(error, 'auto-apply-filters')
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
            // The grid shows the stored view, not an applied URL
            setApplyIssues(NO_ISSUES)
          } catch (error) {
            // A grid rejecting the stored view's model is not the URL being
            // invalid (the URL made no claim), so it must not reach
            // onParseError. Same as loadView: onError only.
            reportFailure(error, 'auto-apply-filters')
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
        reportFailure(error, 'auto-apply-filters')
        // A URL that cannot be read drops all of its filters
        setApplyIssues(keepIssues([toError(error)]))
      }
    }
  }, [
    isReady,
    autoApplyOnMount,
    reportFailure,
    urlHasFilterParams,
    viewStore,
    gridApi,
    commitActiveViewId,
    applyModelToGrid
  ])

  // The saved-view checks on filter changes. The URL state comes from the
  // sync (#222), so this listener only follows the active view.
  useEffect(() => {
    if (!isReady || !urlSyncRef.current || !gridApi) return

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

      let live: FilterModel

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
        reportFailure(error, 'filter-change')
      }
    }

    // Attach event listener for filter changes
    const onFilterChanged = (event?: FilterChangedEvent) =>
      syncActiveViewToGrid(true, event?.source)

    gridApi.addEventListener('filterChanged', onFilterChanged)

    // The grid may already show something other than the active view
    syncActiveViewToGrid(false)

    // Cleanup event listener on unmount or gridApi change
    return () => {
      gridApi.removeEventListener('filterChanged', onFilterChanged)
    }
  }, [isReady, gridApi, reportFailure, viewStore, commitActiveViewId])

  // Memoized API methods
  const shareUrl = useCallback(
    (baseUrl?: string): string => {
      if (!urlSyncRef.current) {
        return (
          baseUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
        )
      }

      try {
        contextRef.current = 'generate-share-url'

        return urlSyncRef.current.generateUrl(baseUrl)
      } catch (error) {
        reportFailure(error, 'generate-share-url')

        return (
          baseUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
        )
      }
    },
    [reportFailure]
  )

  const getQueryParams = useCallback((): string => {
    if (!urlSyncRef.current) {
      return ''
    }

    try {
      contextRef.current = 'get-query-params'

      return urlSyncRef.current.getQueryParams()
    } catch (error) {
      reportFailure(error, 'get-query-params')

      return ''
    }
  }, [reportFailure])

  const applyUrlFilters = useCallback(
    (url?: string): void => {
      if (!urlSyncRef.current) {
        reportNotReady('applyUrlFilters', 'apply-url-filters')

        return
      }

      try {
        const sync = urlSyncRef.current
        contextRef.current = 'apply-url-filters'
        const applied = { issues: NO_ISSUES }
        writeOverPendingView(() => {
          applied.issues = sync.applyFromUrl(url).issues
        })
        setApplyIssues(keepIssues(applied.issues))
      } catch (error) {
        reportFailure(error, 'apply-url-filters')
        // A URL that cannot be read drops all of its filters
        setApplyIssues(keepIssues([toError(error)]))
      }
    },
    [reportFailure, reportNotReady, writeOverPendingView]
  )

  const clearFilters = useCallback((): void => {
    if (!urlSyncRef.current) {
      reportNotReady('clearFilters', 'clear-filters')

      return
    }

    try {
      const sync = urlSyncRef.current
      contextRef.current = 'clear-filters'
      writeOverPendingView(() => sync.clearFilters())
      setApplyIssues(NO_ISSUES)
    } catch (error) {
      reportFailure(error, 'clear-filters')
    }
  }, [reportFailure, reportNotReady, writeOverPendingView])

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
      if (!urlSyncRef.current) {
        reportNotReady('applyFilters', 'apply-filters')

        return
      }

      try {
        const sync = urlSyncRef.current
        contextRef.current = 'apply-filters'
        const applied = { issues: NO_ISSUES }
        writeOverPendingView(() => {
          applied.issues = sync.applyFilters(filters).issues
        })
        setApplyIssues(keepIssues(applied.issues))
      } catch (error) {
        reportFailure(error, 'apply-filters')
      }
    },
    [reportFailure, reportNotReady, writeOverPendingView]
  )

  const getFiltersAsFormat = useCallback(
    (format: SerializationFormat): string => {
      if (!urlSyncRef.current) {
        return ''
      }

      try {
        contextRef.current = 'get-filters-as-format'

        return urlSyncRef.current.getFiltersAsFormat(format)
      } catch (error) {
        reportFailure(error, 'get-filters-as-format')

        return ''
      }
    },
    [reportFailure]
  )

  const getSerializationMode = useCallback((): SerializationMode => {
    if (!urlSyncRef.current) {
      return DEFAULT_CONFIG.serialization
    }

    try {
      return urlSyncRef.current.getSerializationMode()
    } catch (error) {
      reportFailure(error, 'get-serialization-mode')

      return DEFAULT_CONFIG.serialization
    }
  }, [reportFailure])

  // Deprecated: the old name of getSerializationMode (#222)
  const getCurrentFormat = getSerializationMode

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
        const view = viewStore.saveView(
          name,
          callGrid(() => gridApi.getFilterModel())
        )

        syncViewsFromStore()
        // The grid holds exactly these filters, in its own form.
        commitActiveViewId(view.id)
        appliedModelRef.current = view.filterModel
        pendingWriteRef.current = null

        return view
      } catch (error) {
        reportFailure(error, 'save-view')

        return null
      }
    },
    [
      viewStore,
      gridApi,
      reportFailure,
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

          // The grid no longer shows the applied URL
          setApplyIssues(NO_ISSUES)

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
          reportFailure(
            new URLSyncError(`No saved view with id "${id}"`, undefined, {
              code: 'VIEW_NOT_FOUND'
            }),
            'load-view'
          )

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

        // The grid no longer shows the applied URL
        setApplyIssues(NO_ISSUES)

        // Only while the marker still names it: a pointer to a view the marker
        // has already dropped would restore on the next mount a view the UI
        // never showed as loaded.
        if (activeViewIdRef.current === view.id) {
          viewStore.persistActiveViewId(view.id)
        }
      } catch (error) {
        reportFailure(error, 'load-view')
      }
    },
    [
      gridApi,
      viewStore,
      reportFailure,
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
            const current = callGrid(() => gridApi.getFilterModel())

            if (current && sameFilterModel(current, applied)) {
              callGrid(() => gridApi.setFilterModel({}))
            }
          } catch (error) {
            reportFailure(error, 'delete-view')
          }
        }
      } catch (error) {
        reportFailure(error, 'delete-view')
      }
    },
    [
      viewStore,
      gridApi,
      reportFailure,
      syncViewsFromStore,
      enabledWhenReady,
      commitActiveViewId
    ]
  )

  // The data issues of the latest grid read. The snapshot keeps its issues
  // array while the content is the same, so this changes only with it (#229
  // identity).
  const readIssues = useMemo(() => {
    const data = isReady ? snapshot.issues.filter(isDataIssue) : NO_ISSUES

    return data.length ? data : NO_ISSUES
  }, [isReady, snapshot.issues])

  const issues = useMemo(
    () =>
      applyIssues.length === 0
        ? readIssues
        : readIssues.length === 0
          ? applyIssues
          : [...applyIssues, ...readIssues],
    [applyIssues, readIssues]
  )

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

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { GridApi } from 'ag-grid-community'
import { useSyncExternalStore } from 'use-sync-external-store/shim'
import {
  createSync,
  handOver,
  IDLE_SNAPSHOT,
  type Handover
} from '../core/grid-url-sync.js'
import { codecFromOptions, codecOptions, individual } from '../core/codecs.js'
import { createViewStore, type ViewStore } from '../core/view-storage.js'
import { shouldThrow } from '../core/issues.js'
import { toError } from '../core/to-error.js'
import {
  URLSyncError,
  type ApplyResult,
  type Codec,
  type FilterState,
  type GridUrlSync,
  type GridUrlSyncSnapshot,
  type HistoryMode,
  type IssueEvent
} from '../core/types.js'
import type { UseGridUrlSyncOptions, UseGridUrlSyncResult } from './types.js'
import { createSyncHolder } from './sync-holder.js'

// useGridUrlSync, the 0.6.0 hook (#271). A thin adapter, as in TanStack
// Query: the core sync owns all the state and the rules (#269 pattern 1).
// The hook makes the sync, reads its snapshot, and hands out its methods.

/** The snapshot of a server render: no grid and no sync yet */
const getServerSnapshot = (): GridUrlSyncSnapshot => IDLE_SNAPSHOT

const NO_ISSUES: ApplyResult = Object.freeze({ issues: Object.freeze([]) })

/** What the hook knows about the grid that it syncs */
interface Session {
  grid: GridApi | null
  /** A sync was made on this grid, so the URL had its chance */
  started: boolean
  storageKey: string | undefined
  /** The active view of the last sync, for the next sync on this grid */
  keptViewId: string | null
  /** The own write of the last sync, for the next sync on this grid (#276) */
  handover: Handover | null
  /**
   * The last sync had stopped before it was dropped: onIssue got the reason
   * one time already (#286)
   */
  stopped: boolean
}

/** The live sync, and what it was made with */
interface LiveSync {
  sync: GridUrlSync
  codec: Codec
  maxValueLength: number | undefined
  history: HistoryMode
  popstate: boolean | undefined
  viewStore: ViewStore | null
}

function newSession(
  grid: GridApi | null,
  storageKey: string | undefined
): Session {
  return {
    grid,
    started: false,
    storageKey,
    keptViewId: null,
    handover: null,
    stopped: false
  }
}

function pageUrl(): string {
  return typeof window === 'undefined' ? '' : window.location.href
}

/**
 * React hook for the URL sync of one AG Grid (0.6.0). It takes the options
 * of `createGridUrlSync`, and an option can change after mount.
 *
 * @example
 * ```tsx
 * const { url, hasFilters, issues, applyUrl } = useGridUrlSync({
 *   api: gridApi,
 *   history: 'push'
 * })
 * ```
 */
export function useGridUrlSync(
  options: UseGridUrlSyncOptions
): UseGridUrlSyncResult {
  const {
    api,
    codec,
    maxValueLength,
    history = 'none',
    popstate,
    applyUrlOnCreate = true,
    throwOnError,
    onIssue,
    storageKey,
    enabled = true
  } = options

  // The codec by its settings, so a new `individual({ prefix })` on each
  // render makes no new sync. A codec that no factory made throws here.
  const { serialization, paramPrefix, groupedParam, format } = codecOptions(
    codec ?? individual()
  )

  const stableCodec = useMemo(
    () =>
      codecFromOptions({ serialization, paramPrefix, groupedParam, format }),
    [serialization, paramPrefix, groupedParam, format]
  )

  // The latest callbacks and create-time options. The sync reads them
  // through this ref, so a new value on a later render makes no new sync.
  const latestRef = useRef({ onIssue, history, applyUrlOnCreate })

  useEffect(() => {
    latestRef.current = { onIssue, history, applyUrlOnCreate }
  })

  // A function history mode by its kind: the sync calls the latest one
  const historyKind = history instanceof Function ? 'function' : history

  const syncHistory = useMemo(
    (): HistoryMode =>
      historyKind === 'function'
        ? url => {
            const write = latestRef.current.history

            if (write instanceof Function) write(url)
          }
        : historyKind,
    [historyKind]
  )

  const viewStore = useMemo(
    () => (storageKey ? createViewStore(storageKey) : null),
    [storageKey]
  )

  const [holder] = useState(createSyncHolder)

  const snapshot = useSyncExternalStore(
    holder.subscribe,
    holder.getSnapshot,
    getServerSnapshot
  )

  const sessionRef = useRef<Session>(newSession(null, undefined))
  const liveRef = useRef<LiveSync | null>(null)

  // The store of the hook now, for deleteView with no sync
  const storeRef = useRef<ViewStore | null>(null)

  const report = useCallback((event: IssueEvent): void => {
    latestRef.current.onIssue?.(event)
  }, [])

  /** A method called with no sync: no grid yet, enabled false, a server */
  const notReady = useCallback(
    (operation: string): void => {
      report({
        issue: new URLSyncError(
          `${operation} called while there is no grid to sync`,
          undefined,
          { code: 'NOT_READY' }
        ),
        source: 'api'
      })
    },
    [report]
  )

  /** Destroys the live sync. Its view and own write stay for the next one. */
  const dropSync = useCallback(
    (current: LiveSync): void => {
      sessionRef.current.keptViewId = current.sync.getSnapshot().activeViewId
      sessionRef.current.handover = handOver(current.sync)
      sessionRef.current.stopped =
        current.sync.getSnapshot().status === 'destroyed'
      current.sync.destroy()
      holder.set(null)
      liveRef.current = null
    },
    [holder]
  )

  // One sync for each grid and each set of sync options. A new grid starts
  // a new session. A new sync on the same grid (a new option, a StrictMode
  // remount, an <Activity> that shows again) does not apply the URL again:
  // it keeps the active view and the last sync's own write.
  useEffect(() => {
    const live = api && enabled ? api : null
    const current = liveRef.current
    const newGrid = live !== sessionRef.current.grid

    storeRef.current = viewStore

    if (newGrid) {
      if (current) dropSync(current)

      sessionRef.current = newSession(live, storageKey)
    }

    if (
      current &&
      !newGrid &&
      current.codec === stableCodec &&
      current.maxValueLength === maxValueLength &&
      current.history === syncHistory &&
      current.popstate === popstate &&
      current.viewStore === viewStore
    ) {
      return
    }

    if (current && !newGrid) dropSync(current)

    if (!live) {
      // No sync: `views` still shows what is in storage
      holder.setIdleViews(viewStore?.listViews() ?? [])

      return
    }

    const session = sessionRef.current
    const first = !session.started

    // The same store: the view that the last sync tracked. A new store: its
    // stored view, because the URL had its chance on this grid.
    const keptViewId = first
      ? null
      : session.storageKey === storageKey
        ? session.keptViewId
        : (viewStore?.getActiveViewId() ?? null)

    const { handover, stopped } = session

    session.started = true
    session.storageKey = storageKey
    session.keptViewId = null
    session.handover = null
    session.stopped = false

    // A new sync on a grid that AG Grid destroyed: the core reports
    // NOT_READY on create, but the app called nothing. A new sync on a grid
    // that could not take a listener: the core reports GRID_ERROR again,
    // but onIssue got it from the last sync (#286). Later method calls
    // report as usual.
    let creating = true

    const onIssue = (event: IssueEvent): void => {
      const { code } = event.issue

      const repeated =
        code === 'NOT_READY' || (stopped && code === 'GRID_ERROR')

      if (creating && !first && repeated) return

      report(event)
    }

    const sync = createSync(
      {
        api: live,
        codec: stableCodec,
        maxValueLength,
        history: syncHistory,
        popstate,
        applyUrlOnCreate: first && latestRef.current.applyUrlOnCreate,
        // The hook throws in render, not in the methods
        throwOnError: false,
        onIssue,
        views: viewStore ?? undefined
      },
      // The new sync shows the last one's apply issues, as one sync would
      { keptViewId, handover, keepApplyIssues: true }
    )

    creating = false

    holder.set(sync)
    liveRef.current = {
      sync,
      codec: stableCodec,
      maxValueLength,
      history: syncHistory,
      popstate,
      viewStore
    }
  }, [
    api,
    enabled,
    stableCodec,
    maxValueLength,
    syncHistory,
    popstate,
    viewStore,
    storageKey,
    holder,
    report,
    dropSync
  ])

  // Unmount: the sync goes with the hook
  useEffect(
    () => () => {
      const current = liveRef.current

      if (current) dropSync(current)
    },
    [dropSync]
  )

  const applyUrl = useCallback(
    (url?: string): ApplyResult => {
      const sync = holder.get()

      if (sync) return sync.applyUrl(url)

      notReady('applyUrl')

      return NO_ISSUES
    },
    [holder, notReady]
  )

  const applyFilters = useCallback(
    (filters: FilterState): ApplyResult => {
      const sync = holder.get()

      if (sync) return sync.applyFilters(filters)

      notReady('applyFilters')

      return NO_ISSUES
    },
    [holder, notReady]
  )

  const getUrl = useCallback(
    (baseUrl?: string): string =>
      holder.get()?.getUrl(baseUrl) ?? baseUrl ?? pageUrl(),
    [holder]
  )

  const saveView = useCallback(
    (name: string) => {
      const sync = holder.get()

      if (sync) return sync.saveView(name)

      if (storeRef.current) notReady('saveView')

      return null
    },
    [holder, notReady]
  )

  const loadView = useCallback(
    (id: string | null): void => {
      const sync = holder.get()

      if (sync) {
        sync.loadView(id)
      } else if (storeRef.current) {
        notReady('loadView')
      }
    },
    [holder, notReady]
  )

  const deleteView = useCallback(
    (id: string): void => {
      const sync = holder.get()

      if (sync) {
        sync.deleteView(id)

        return
      }

      // Deleting only touches storage, so it works with no grid
      const store = storeRef.current

      if (!store) return

      try {
        store.deleteView(id)
      } catch (cause) {
        report({
          issue: new URLSyncError(
            'The view could not be deleted',
            toError(cause),
            {
              code: 'STORAGE_WRITE_FAILED'
            }
          ),
          source: 'api'
        })
      }

      holder.setIdleViews(store.listViews())
    },
    [holder, report]
  )

  const result = useMemo(
    (): UseGridUrlSyncResult => ({
      ...snapshot,
      applyUrl,
      applyFilters,
      getUrl,
      saveView,
      loadView,
      deleteView
    }),
    [snapshot, applyUrl, applyFilters, getUrl, saveView, loadView, deleteView]
  )

  // throwOnError, as in TanStack Query: the issue is thrown during render,
  // so a React error boundary catches it. onIssue got it one time already.
  const thrown = snapshot.issues.find(issue => shouldThrow(throwOnError, issue))

  if (thrown) throw thrown

  return result
}

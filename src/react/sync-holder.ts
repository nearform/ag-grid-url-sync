import { IDLE_SNAPSHOT } from '../core/grid-url-sync.js'
import type {
  GridUrlSync,
  GridUrlSyncSnapshot,
  URLSyncError
} from '../core/types.js'
import type { GridView } from '../core/view-storage.js'

// The hook makes its sync in an effect, not during render, so React needs a
// store that exists before the sync does (#222). The holder is that store: its
// subscribe and getSnapshot never change, and they forward to the sync that
// the hook has now.

export interface SyncHolder {
  /** Puts a sync in the holder (or none). Does not destroy the old one. */
  set(sync: GridUrlSync | null): void
  /** The current sync, or null */
  get(): GridUrlSync | null
  /**
   * The stored views to show while there is no sync (#223). The listeners
   * hear of it only when no sync is in the holder and the views changed.
   */
  setIdleViews(views: readonly GridView[]): void
  /**
   * The apply issues of an earlier sync on the same grid. The snapshot of
   * the current sync shows them before its own issues.
   */
  setCarriedIssues(issues: readonly URLSyncError[]): void
  subscribe(listener: () => void): () => void
  /** The current sync's snapshot, or the idle snapshot */
  getSnapshot(): GridUrlSyncSnapshot
}

/**
 * Two view lists with the same content. Compares all of it: a save under the
 * same name keeps the id, and two saves in one millisecond keep updatedAt.
 */
function sameViews(a: readonly GridView[], b: readonly GridView[]): boolean {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b)
}

export function createSyncHolder(): SyncHolder {
  const listeners = new Set<() => void>()
  let current: GridUrlSync | null = null
  let stopForwarding: (() => void) | null = null
  let idle: GridUrlSyncSnapshot = IDLE_SNAPSHOT
  let carried: readonly URLSyncError[] = []

  // The last snapshot with the carried issues, and what it was made from
  let merged: {
    from: GridUrlSyncSnapshot
    carried: readonly URLSyncError[]
    snapshot: GridUrlSyncSnapshot
  } | null = null

  /** The sync's snapshot with the carried issues first */
  const withCarried = (from: GridUrlSyncSnapshot): GridUrlSyncSnapshot => {
    if (merged?.from === from && merged.carried === carried) {
      return merged.snapshot
    }

    // The same issues keep the same array (#229 identity)
    const issues =
      merged?.from.issues === from.issues && merged.carried === carried
        ? merged.snapshot.issues
        : Object.freeze([...carried, ...from.issues])

    merged = { from, carried, snapshot: Object.freeze({ ...from, issues }) }

    return merged.snapshot
  }

  const notify = (): void => {
    for (const listener of Array.from(listeners)) listener()
  }

  return {
    set(sync) {
      if (sync === current) return

      stopForwarding?.()
      stopForwarding = null
      current = sync

      if (sync) stopForwarding = sync.subscribe(notify)

      notify()
    },
    get: () => current,
    setIdleViews(views) {
      if (sameViews(idle.views, views)) return

      idle = views.length
        ? Object.freeze({ ...IDLE_SNAPSHOT, views: Object.freeze([...views]) })
        : IDLE_SNAPSHOT

      if (!current) notify()
    },
    setCarriedIssues(issues) {
      if (issues === carried) return

      carried = issues

      if (current) notify()
    },
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      if (!current) return idle

      const snapshot = current.getSnapshot()

      return carried.length ? withCarried(snapshot) : snapshot
    }
  }
}

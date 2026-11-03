import { IDLE_SNAPSHOT } from '../core/grid-url-sync.js'
import type { GridUrlSync, GridUrlSyncSnapshot } from '../core/types.js'

// The hook makes its sync in an effect, not during render, so React needs a
// store that exists before the sync does (#222). The holder is that store: its
// subscribe and getSnapshot never change, and they forward to the sync that
// the hook has now.

export interface SyncHolder {
  /** Puts a sync in the holder (or none). Does not destroy the old one. */
  set(sync: GridUrlSync | null): void
  /** The current sync, or null */
  get(): GridUrlSync | null
  subscribe(listener: () => void): () => void
  /** The current sync's snapshot, or IDLE_SNAPSHOT */
  getSnapshot(): GridUrlSyncSnapshot
}

export function createSyncHolder(): SyncHolder {
  const listeners = new Set<() => void>()
  let current: GridUrlSync | null = null
  let stopForwarding: (() => void) | null = null

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
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => current?.getSnapshot() ?? IDLE_SNAPSHOT
  }
}

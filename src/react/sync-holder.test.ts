import { describe, it, expect, vi } from 'vitest'
import { createSyncHolder } from './sync-holder.js'
import { IDLE_SNAPSHOT } from '../core/grid-url-sync.js'
import type { GridUrlSync, GridUrlSyncSnapshot } from '../core/types.js'

// The holder gives React one stable subscribe and getSnapshot pair, and
// forwards them to the sync that the hook has now (#222)

function createFakeSync() {
  const listeners = new Set<() => void>()

  const snapshot: GridUrlSyncSnapshot = Object.freeze({
    status: 'active',
    url: 'https://example.com/?f_name_contains=jo',
    hasFilters: true,
    issues: [],
    views: [],
    activeViewId: null
  })

  const sync: GridUrlSync = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    applyUrl: () => ({ issues: [] }),
    getUrl: () => '',
    saveView: () => null,
    loadView: () => {},
    deleteView: () => {},
    destroy: () => {}
  }

  const notify = () => {
    for (const listener of listeners) listener()
  }

  return { sync, snapshot, notify, listeners }
}

describe('createSyncHolder', () => {
  it('returns IDLE_SNAPSHOT with no sync', () => {
    const holder = createSyncHolder()

    expect(holder.getSnapshot()).toBe(IDLE_SNAPSHOT)
    expect(holder.get()).toBeNull()
  })

  it('returns the snapshot object of the sync', () => {
    const holder = createSyncHolder()
    const fake = createFakeSync()

    holder.set(fake.sync)

    expect(holder.getSnapshot()).toBe(fake.snapshot)
    expect(holder.get()).toBe(fake.sync)
  })

  it('notifies when the sync changes', () => {
    const holder = createSyncHolder()
    const listener = vi.fn()
    holder.subscribe(listener)

    holder.set(createFakeSync().sync)

    expect(listener).toHaveBeenCalledOnce()

    holder.set(null)

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('forwards the notifications of the current sync', () => {
    const holder = createSyncHolder()
    const fake = createFakeSync()
    holder.set(fake.sync)
    const listener = vi.fn()
    holder.subscribe(listener)

    fake.notify()

    expect(listener).toHaveBeenCalledOnce()
  })

  it('stops forwarding from a sync that was replaced', () => {
    const holder = createSyncHolder()
    const first = createFakeSync()
    holder.set(first.sync)
    const listener = vi.fn()
    holder.subscribe(listener)

    holder.set(createFakeSync().sync)
    listener.mockClear()
    first.notify()

    expect(listener).not.toHaveBeenCalled()
    expect(first.listeners.size).toBe(0)
  })

  it('stops notifying after unsubscribe', () => {
    const holder = createSyncHolder()
    const fake = createFakeSync()
    holder.set(fake.sync)
    const listener = vi.fn()
    const unsubscribe = holder.subscribe(listener)

    unsubscribe()
    fake.notify()
    holder.set(null)

    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps subscribe and getSnapshot stable', () => {
    const holder = createSyncHolder()
    const { subscribe, getSnapshot } = holder

    holder.set(createFakeSync().sync)

    expect(holder.subscribe).toBe(subscribe)
    expect(holder.getSnapshot).toBe(getSnapshot)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { createGridUrlSync } from './grid-url-sync.js'
import { createViewStore } from './view-storage.js'
import type { GridView, ViewStore } from './view-storage.js'
import {
  asGridApi,
  createGridListeners,
  useRealLocation
} from '../test-helpers.js'

// A restore that the grid has not landed yet (#223, D2). The grid holds each
// write, and the test lands a model when it wants, with source 'api', as AG
// Grid does for a deferred write. The grid can also ignore a write.

const AGE_30 = {
  age: { filterType: 'number', type: 'equals', filter: 30 }
} as const

const JOHN = {
  name: { filterType: 'text', type: 'contains', filter: 'John' }
} as const

/** A date filter as an app builds it */
const HAND_BUILT: FilterModel = {
  created: { filterType: 'date', type: 'equals', dateFrom: '2024-01-01' }
}

/** The same filter as AG Grid gives it back */
const NORMALISED: FilterModel = {
  created: {
    dateFrom: '2024-01-01 00:00:00',
    dateTo: null,
    filterType: 'date',
    type: 'equals'
  }
}

/** A grid that takes no write by itself. `land` shows a model. */
function createHoldingGrid(initial: FilterModel) {
  const listeners = createGridListeners()
  let model = initial

  const api = asGridApi({
    getFilterModel: () => ({ ...model }),
    setFilterModel: vi.fn(),
    addEventListener: listeners.addEventListener,
    removeEventListener: listeners.removeEventListener
  })

  return {
    api,
    land(next: FilterModel): void {
      model = next
      listeners.fire('filterChanged', { source: 'api' })
    }
  }
}

interface Mounted {
  store: ViewStore
  view: GridView
  grid: ReturnType<typeof createHoldingGrid>
  sync: ReturnType<typeof createGridUrlSync>
}

/** A stored view that the sync restores on create, still pending */
function mountWithPendingRestore(
  view: FilterModel,
  initial: FilterModel = {}
): Mounted {
  const store = createViewStore('pending')
  const saved = store.saveView('Pending', { filterModel: view })
  const grid = createHoldingGrid(initial)
  const sync = createGridUrlSync({ api: grid.api, views: store })

  expect(sync.getSnapshot().activeViewId).toBe(saved.id)

  return { store, view: saved, grid, sync }
}

beforeEach(() => {
  localStorage.clear()
  useRealLocation('/')
})

describe('createGridUrlSync: a restore that is still pending', () => {
  it('a restore landing beside the initial filter state keeps the view', () => {
    const { store, view, grid, sync } = mountWithPendingRestore(
      HAND_BUILT,
      AGE_30
    )

    // setFilterModel leaves a column that AG Grid holds in its initial
    // filter state, and the view's column comes back in the grid's form
    grid.land({ ...NORMALISED, ...AGE_30 })

    expect(sync.getSnapshot().activeViewId).toBe(view.id)
    expect(store.getActiveViewId()).toBe(view.id)

    grid.land(NORMALISED)

    expect(sync.getSnapshot().activeViewId).toBeNull()
    expect(store.getActiveViewId()).toBeNull()

    sync.destroy()
  })

  it('an app write that the grid ignores does not hide the restore landing', () => {
    const { store, view, grid, sync } = mountWithPendingRestore(HAND_BUILT)

    sync.applyFilters(JOHN)

    expect(sync.getSnapshot().activeViewId).toBe(view.id)

    // The restore lands, in the grid's own form
    grid.land(NORMALISED)

    expect(sync.getSnapshot().activeViewId).toBe(view.id)
    expect(store.getActiveViewId()).toBe(view.id)

    // Then the grid ends with no filters: the view is gone
    grid.land({})

    expect(sync.getSnapshot().activeViewId).toBeNull()
    expect(store.getActiveViewId()).toBeNull()

    sync.destroy()
  })
})

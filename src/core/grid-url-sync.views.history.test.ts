import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createGridUrlSync } from './grid-url-sync.js'
import { createViewStore } from './view-storage.js'
import type { GridView } from './view-storage.js'
import type { HistoryMode } from './types.js'
import type { GridTiming } from '../test-helpers.js'
import {
  createTimedGrid,
  GRID_TIMINGS,
  useRealLocation
} from '../test-helpers.js'

// A view load and applyFilters write the URL as a user edit does (#223, D3).
// A URL apply still writes no history (#273).

const NAME_JO = {
  name: { filterType: 'text', type: 'contains', filter: 'jo' }
} as const

const AGE_30 = {
  age: { filterType: 'number', type: 'equals', filter: 30 }
} as const

/** A set filter: the URL cannot hold it */
const STATUS_OPEN = {
  status: { filterType: 'set', values: ['open'] }
} as const

/** One tick, for the timings that send filterChanged later */
const tick = (): Promise<void> =>
  new Promise(resolve => globalThis.setTimeout(resolve, 0))

/** Goes back one entry, waits for jsdom's popstate, then one tick */
async function back(): Promise<void> {
  const popped = new Promise(resolve => {
    window.addEventListener('popstate', resolve, { once: true })
  })

  window.history.back()
  await popped
  await tick()
}

interface Setup {
  a: GridView
  b: GridView
  open: GridView
  grid: ReturnType<typeof createTimedGrid>
  sync: ReturnType<typeof createGridUrlSync>
  onIssue: ReturnType<typeof vi.fn>
}

/** A store with A = NAME_JO, B = AGE_30 and Open = STATUS_OPEN, no pointer */
function setup(timing: GridTiming, history: HistoryMode = 'push'): Setup {
  const store = createViewStore('t')
  const a = store.saveView('A', NAME_JO)
  const b = store.saveView('B', AGE_30)
  const open = store.saveView('Open', STATUS_OPEN)
  store.persistActiveViewId(null)

  const grid = createTimedGrid(timing)
  const onIssue = vi.fn()

  const sync = createGridUrlSync({
    api: grid.api,
    views: store,
    history,
    onIssue
  })

  return { a, b, open, grid, sync, onIssue }
}

beforeEach(() => {
  localStorage.clear()
  useRealLocation('/')
})

describe.each(GRID_TIMINGS)(
  'createGridUrlSync: view loads and history (%s timing)',
  timing => {
    it("a view load adds one history entry with the view's filters", async () => {
      const { a, sync } = setup(timing)
      const length = window.history.length

      sync.loadView(a.id)
      await tick()

      expect(window.history.length).toBe(length + 1)
      expect(window.location.search).toBe('?f_name_contains=jo')

      sync.destroy()
    })

    it('with replace, a view load replaces the entry', async () => {
      const { a, sync } = setup(timing, 'replace')
      const length = window.history.length

      sync.loadView(a.id)
      await tick()

      expect(window.history.length).toBe(length)
      expect(window.location.search).toBe('?f_name_contains=jo')

      sync.destroy()
    })

    it("with a history function, a view load calls it with the view's URL", async () => {
      const history = vi.fn<(url: string) => void>()
      const { a, sync } = setup(timing, history)

      sync.loadView(a.id)
      await tick()

      expect(history).toHaveBeenCalledTimes(1)
      expect(history).toHaveBeenCalledWith(
        expect.stringContaining('?f_name_contains=jo')
      )

      sync.destroy()
    })

    it('loadView(null) adds one history entry with no filters', async () => {
      const { a, sync } = setup(timing)
      sync.loadView(a.id)
      await tick()
      const length = window.history.length

      sync.loadView(null)
      await tick()

      expect(window.history.length).toBe(length + 1)
      expect(window.location.search).toBe('')

      sync.destroy()
    })

    it('back after a view load applies the old URL, clears the active view and adds no entry', async () => {
      const { a, grid, sync } = setup(timing)
      sync.loadView(a.id)
      await tick()
      const length = window.history.length

      await back()

      expect(window.location.search).toBe('')
      expect(grid.api.getFilterModel()).toEqual({})
      expect(sync.getSnapshot().activeViewId).toBeNull()
      expect(window.history.length).toBe(length)

      sync.destroy()
    })

    it('a view load that does not change the URL adds no entry', async () => {
      const { open, grid, sync } = setup(timing)
      const length = window.history.length

      sync.loadView(open.id)
      await tick()

      expect(grid.api.getFilterModel()).toEqual(STATUS_OPEN)
      expect(sync.getSnapshot().activeViewId).toBe(open.id)
      expect(window.history.length).toBe(length)
      expect(window.location.search).toBe('')

      sync.destroy()
    })

    it('applyUrl after a view load writes no history', async () => {
      const { a, sync } = setup(timing)
      sync.loadView(a.id)
      await tick()
      const length = window.history.length

      sync.applyUrl(new URL('/?f_age_eq=30', window.location.href).href)
      await tick()

      expect(window.history.length).toBe(length)
      expect(window.location.search).toBe('?f_name_contains=jo')

      sync.destroy()
    })

    it('applyFilters writes history as a user edit, and gives TYPE_MISMATCH issues', async () => {
      const { grid, sync, onIssue } = setup(timing)
      const length = window.history.length

      const result = sync.applyFilters({
        age: { filterType: 'number', type: 'eq', filter: 30 },
        name: { filterType: 'number', type: 'eq', filter: 1 }
      })

      await tick()

      expect(result.issues.map(issue => issue.code)).toEqual(['TYPE_MISMATCH'])
      expect(sync.getSnapshot().issues).toEqual(result.issues)
      expect(onIssue).toHaveBeenCalledWith({
        issue: result.issues[0],
        source: 'api'
      })
      expect(grid.api.getFilterModel()).toEqual(AGE_30)
      expect(window.history.length).toBe(length + 1)
      expect(window.location.search).toBe('?f_age_eq=30')

      sync.destroy()
    })

    it('applyFilters clears the active view', async () => {
      const { a, sync } = setup(timing)
      sync.loadView(a.id)
      await tick()

      sync.applyFilters({
        age: { filterType: 'number', type: 'eq', filter: 30 }
      })
      await tick()

      expect(sync.getSnapshot().activeViewId).toBeNull()

      sync.destroy()
    })
  }
)

describe('createGridUrlSync: applyFilters when not ready', () => {
  it('after destroy, applyFilters reports NOT_READY and changes nothing', () => {
    const { grid, sync, onIssue } = setup('in-call')
    sync.destroy()

    const result = sync.applyFilters({
      age: { filterType: 'number', type: 'eq', filter: 30 }
    })

    expect(result.issues).toEqual([])
    expect(grid.api.getFilterModel()).toEqual({})
    expect(onIssue.mock.calls.map(([event]) => event.issue.code)).toEqual([
      'NOT_READY'
    ])
  })
})

// Review Focus 4: on a deferred grid, the first load lands one tick later,
// after the second load has started
describe('createGridUrlSync: two view loads in one tick', () => {
  it('two loads in one tick: B is active, and one entry is written for B', async () => {
    const { a, b, sync } = setup('deferred')
    const length = window.history.length

    sync.loadView(a.id)
    sync.loadView(b.id)
    await tick()

    expect(sync.getSnapshot().activeViewId).toBe(b.id)
    expect(window.history.length).toBe(length + 1)
    expect(window.location.search).toBe('?f_age_eq=30')

    sync.destroy()
  })
})

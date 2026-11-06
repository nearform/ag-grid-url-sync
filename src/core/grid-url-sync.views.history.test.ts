import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createGridUrlSync } from './grid-url-sync.js'
import { createViewStore } from './view-storage.js'
import type { GridView } from './view-storage.js'
import type { HistoryMode, HistoryWrite } from './types.js'
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
      const history = vi.fn<(url: string, write: HistoryWrite) => void>()
      const { a, sync } = setup(timing, history)

      sync.loadView(a.id)
      await tick()

      expect(history).toHaveBeenCalledTimes(1)
      expect(history).toHaveBeenCalledWith(
        expect.stringContaining('?f_name_contains=jo'),
        { replace: false }
      )

      sync.destroy()
    })

    it('a history write that fails at a view landing has the source api', async () => {
      const failing = () => {
        throw new Error('The router is down')
      }

      const { a, sync, onIssue } = setup(timing, failing)

      sync.loadView(a.id)
      await tick()

      expect(
        onIssue.mock.calls.map(([event]) => [event.issue.code, event.source])
      ).toEqual([['HISTORY_WRITE_FAILED', 'api']])

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

  it('A, B, A in one tick: A is active, and one entry is written for A', async () => {
    const { a, b, sync } = setup('deferred')
    const length = window.history.length

    sync.loadView(a.id)
    sync.loadView(b.id)
    sync.loadView(a.id)
    await tick()

    expect(sync.getSnapshot().activeViewId).toBe(a.id)
    expect(window.history.length).toBe(length + 1)
    expect(window.location.search).toBe('?f_name_contains=jo')

    sync.destroy()
  })

  it('A, then a clear, in one tick: no entry is written', async () => {
    const { a, sync } = setup('deferred')
    const length = window.history.length

    sync.loadView(a.id)
    sync.loadView(null)
    await tick()

    expect(window.history.length).toBe(length)
    expect(window.location.search).toBe('')

    sync.destroy()
  })
})

// A grid that rebuilds the model sends no event for a second write of the
// same view, so the URL is written when the first write lands (#223)
describe('createGridUrlSync: loads in one tick on a grid that rebuilds the model', () => {
  /** A store with A = NAME_JO and B = age 30 stored as a string */
  function rebuiltSetup() {
    const store = createViewStore('t')
    const a = store.saveView('A', NAME_JO)

    const b = store.saveView('B', {
      age: { filterType: 'number', type: 'equals', filter: '30' }
    })

    store.persistActiveViewId(null)

    const grid = createTimedGrid('deferred', {}, { normalize: true })

    const sync = createGridUrlSync({
      api: grid.api,
      views: store,
      history: 'push'
    })

    return { a, b, grid, sync }
  }

  it('B: one entry is written for B', async () => {
    const { b, sync } = rebuiltSetup()
    const length = window.history.length

    sync.loadView(b.id)
    await tick()

    expect(sync.getSnapshot().activeViewId).toBe(b.id)
    expect(window.history.length).toBe(length + 1)
    expect(window.location.search).toBe('?f_age_eq=30')

    sync.destroy()
  })

  it('B, B in one tick: one entry is written for B', async () => {
    const { b, sync } = rebuiltSetup()
    const length = window.history.length

    sync.loadView(b.id)
    sync.loadView(b.id)
    await tick()

    expect(sync.getSnapshot().activeViewId).toBe(b.id)
    expect(window.history.length).toBe(length + 1)
    expect(window.location.search).toBe('?f_age_eq=30')

    sync.destroy()
  })

  it('A, B, B in one tick: one entry is written for B', async () => {
    const { a, b, grid, sync } = rebuiltSetup()
    const length = window.history.length

    sync.loadView(a.id)
    sync.loadView(b.id)
    sync.loadView(b.id)
    await tick()

    expect(grid.api.getFilterModel()).toEqual(AGE_30)
    expect(sync.getSnapshot().activeViewId).toBe(b.id)
    expect(window.history.length).toBe(length + 1)
    expect(window.location.search).toBe('?f_age_eq=30')

    sync.destroy()
  })
  it('B, B, then a user clear writes the clear', async () => {
    const { b, grid, sync } = rebuiltSetup()

    sync.loadView(b.id)
    sync.loadView(b.id)
    await tick()

    const length = window.history.length

    grid.userEdit({})
    await tick()

    expect(sync.getSnapshot().activeViewId).toBeNull()
    expect(window.location.search).toBe('')
    expect(window.history.length).toBe(length + 1)

    sync.destroy()
  })

  it('A, B, B, then a user clear writes the clear', async () => {
    const { a, b, grid, sync } = rebuiltSetup()

    sync.loadView(a.id)
    sync.loadView(b.id)
    sync.loadView(b.id)
    await tick()

    const length = window.history.length

    grid.userEdit({})
    await tick()

    expect(sync.getSnapshot().activeViewId).toBeNull()
    expect(window.location.search).toBe('')
    expect(window.history.length).toBe(length + 1)

    sync.destroy()
  })

  it('B, B, then loadView(A) writes A', async () => {
    const { a, b, grid, sync } = rebuiltSetup()

    sync.loadView(b.id)
    sync.loadView(b.id)
    await tick()
    sync.loadView(a.id)
    await tick()

    expect(grid.api.getFilterModel()).toEqual(NAME_JO)
    expect(sync.getSnapshot().activeViewId).toBe(a.id)
    expect(window.location.search).toContain('f_name')

    sync.destroy()
  })

  it('B, B, then loadView(null) clears the URL', async () => {
    const { b, sync } = rebuiltSetup()

    sync.loadView(b.id)
    sync.loadView(b.id)
    await tick()
    sync.loadView(null)
    await tick()

    expect(sync.getSnapshot().activeViewId).toBeNull()
    expect(window.location.search).toBe('')

    sync.destroy()
  })
})

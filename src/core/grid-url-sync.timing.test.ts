import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createGridUrlSync, createSync, handOver } from './grid-url-sync.js'
import {
  createLateRowsGrid,
  createTimedGrid,
  GRID_TIMINGS,
  useRealLocation
} from '../test-helpers.js'

// The sync never writes history for its own applies, at any grid timing
// (#273). Before the fix, an event inside setFilterModel ('in-call') and a
// write that lands one tick later ('deferred') were taken as user edits.

const NAME_JO = {
  name: { filterType: 'text', type: 'contains', filter: 'jo' }
} as const

const NAME_X = {
  name: { filterType: 'text', type: 'contains', filter: 'x' }
} as const

const AGE_30 = {
  age: { filterType: 'number', type: 'equals', filter: 30 }
} as const

/** One tick, for the timings that send filterChanged later */
const tick = (): Promise<void> =>
  new Promise(resolve => globalThis.setTimeout(resolve, 0))

const href = (path: string): string => new URL(path, window.location.href).href

beforeEach(() => {
  useRealLocation('/')
})

describe.each(GRID_TIMINGS)(
  'createGridUrlSync: own applies (%s timing)',
  timing => {
    it('applyUrl writes no history', async () => {
      const grid = createTimedGrid(timing)
      const sync = createGridUrlSync({ api: grid.api, history: 'push' })
      const length = window.history.length

      sync.applyUrl(href('/?f_name_contains=jo'))
      await tick()

      expect(grid.api.getFilterModel()).toEqual(NAME_JO)
      expect(sync.getSnapshot().url).toContain('f_name_contains=jo')
      expect(window.location.search).toBe('')
      expect(window.history.length).toBe(length)

      sync.destroy()
    })

    it('a popstate apply writes no history, when the grid takes only part of the URL', async () => {
      const grid = createTimedGrid(timing)
      const sync = createGridUrlSync({ api: grid.api, history: 'push' })
      window.history.pushState(
        null,
        '',
        '/?f_name_contains=jo&f_missing_contains=x'
      )
      const length = window.history.length

      window.dispatchEvent(new PopStateEvent('popstate'))
      await tick()

      expect(grid.api.getFilterModel()).toEqual(NAME_JO)
      expect(window.location.search).toBe(
        '?f_name_contains=jo&f_missing_contains=x'
      )
      expect(window.history.length).toBe(length)

      sync.destroy()
    })

    it('the apply on create writes no history, when the grid takes only part of the URL', async () => {
      useRealLocation('/?f_name_contains=jo&f_missing_contains=x')
      const length = window.history.length
      const grid = createTimedGrid(timing)
      const sync = createGridUrlSync({ api: grid.api, history: 'push' })
      await tick()

      expect(grid.api.getFilterModel()).toEqual(NAME_JO)
      expect(window.location.search).toBe(
        '?f_name_contains=jo&f_missing_contains=x'
      )
      expect(window.history.length).toBe(length)

      sync.destroy()
    })

    it('two applies in one tick write no history, and the grid keeps the second', async () => {
      const grid = createTimedGrid(timing)
      const sync = createGridUrlSync({ api: grid.api, history: 'push' })
      const length = window.history.length

      sync.applyUrl(href('/?f_name_contains=jo'))
      sync.applyUrl(href('/?f_age_eq=30'))
      await tick()

      expect(grid.api.getFilterModel()).toEqual(AGE_30)
      expect(sync.getSnapshot().url).toContain('f_age_eq=30')
      expect(window.location.search).toBe('')
      expect(window.history.length).toBe(length)

      sync.destroy()
    })

    it('three applies in one tick, the first the same as the third, write no history', async () => {
      const grid = createTimedGrid(timing)
      const sync = createGridUrlSync({ api: grid.api, history: 'push' })
      const length = window.history.length

      sync.applyUrl(href('/?f_name_contains=jo'))
      sync.applyUrl(href('/?f_age_eq=30'))
      sync.applyUrl(href('/?f_name_contains=jo'))
      await tick()

      expect(grid.api.getFilterModel()).toEqual(NAME_JO)
      expect(sync.getSnapshot().url).toContain('f_name_contains=jo')
      expect(window.location.search).toBe('')
      expect(window.history.length).toBe(length)

      sync.destroy()
    })

    it('a user edit after an own apply writes history', async () => {
      const grid = createTimedGrid(timing)
      const sync = createGridUrlSync({ api: grid.api, history: 'push' })
      sync.applyUrl(href('/?f_name_contains=jo'))
      await tick()
      const length = window.history.length

      grid.userEdit(NAME_X)

      expect(window.location.search).toBe('?f_name_contains=x')
      expect(window.history.length).toBe(length + 1)

      sync.destroy()
    })

    it('a user edit after an own apply that changed nothing writes history', async () => {
      const grid = createTimedGrid(timing, NAME_JO)
      const sync = createGridUrlSync({ api: grid.api, history: 'push' })
      sync.applyUrl(href('/?f_name_contains=jo'))
      await tick()
      const length = window.history.length

      grid.userEdit(NAME_X)

      expect(window.location.search).toBe('?f_name_contains=x')
      expect(window.history.length).toBe(length + 1)

      sync.destroy()
    })

    it('a user edit after the apply on create writes history', async () => {
      useRealLocation('/?f_name_contains=jo&f_missing_contains=x')
      const grid = createTimedGrid(timing)
      const sync = createGridUrlSync({ api: grid.api, history: 'push' })
      await tick()

      grid.userEdit(NAME_X)

      expect(window.location.search).toBe('?f_name_contains=x')

      sync.destroy()
    })
  }
)

// AG Grid 31 holds the initialState filters until its first rows. A URL with
// no filter params keeps them, and with history the sync writes them with
// replace, as it does when the grid shows them on create (#306).
describe('createGridUrlSync: filters that the grid holds until its first rows', () => {
  beforeEach(() => {
    useRealLocation('/?tab=1')
  })

  it('writes them with replace when the grid applies them at the first rows', () => {
    const grid = createLateRowsGrid(NAME_JO)
    const sync = createGridUrlSync({ api: grid.api, history: 'push' })
    const length = window.history.length

    expect(window.location.search).toBe('?tab=1')

    grid.rowsArrive()

    expect(window.location.search).toBe('?tab=1&f_name_contains=jo')
    expect(sync.getSnapshot().hasFilters).toBe(true)
    expect(window.history.length).toBe(length)

    sync.destroy()
  })

  it('a user edit after the first rows writes history', () => {
    const grid = createLateRowsGrid(NAME_JO)
    const sync = createGridUrlSync({ api: grid.api, history: 'push' })
    grid.rowsArrive()
    const length = window.history.length

    grid.userEdit(NAME_X)

    expect(window.location.search).toBe('?tab=1&f_name_contains=x')
    expect(window.history.length).toBe(length + 1)

    sync.destroy()
  })

  it('a user edit before the first rows writes history', () => {
    const grid = createLateRowsGrid(NAME_JO)
    const sync = createGridUrlSync({ api: grid.api, history: 'push' })
    const length = window.history.length

    grid.userEdit(NAME_X)

    expect(window.location.search).toBe('?tab=1&f_name_contains=x')
    expect(window.history.length).toBe(length + 1)

    sync.destroy()
  })

  it('a quick filter change before the first rows does not stop the replace', () => {
    const grid = createLateRowsGrid(NAME_JO)
    const sync = createGridUrlSync({ api: grid.api, history: 'push' })
    const length = window.history.length

    grid.quickFilter()
    grid.rowsArrive()

    expect(window.location.search).toBe('?tab=1&f_name_contains=jo')
    expect(window.history.length).toBe(length)

    sync.destroy()
  })

  it('writes nothing with history none', () => {
    const grid = createLateRowsGrid(NAME_JO)
    const sync = createGridUrlSync({ api: grid.api })

    grid.rowsArrive()

    expect(window.location.search).toBe('?tab=1')
    expect(sync.getSnapshot().url).toContain('f_name_contains=jo')

    sync.destroy()
  })

  it('reports an issue of the held filters one time, with source grid', () => {
    const onIssue = vi.fn()

    const grid = createLateRowsGrid({
      ...NAME_JO,
      age: { filterType: 'number', type: 'greaterThan', filter: 5 }
    })

    const sync = createGridUrlSync({
      api: grid.api,
      history: 'push',
      maxValueLength: 1,
      onIssue
    })

    const length = window.history.length

    grid.rowsArrive()

    expect(window.location.search).toBe('?tab=1&f_age_gt=5')
    expect(window.history.length).toBe(length)
    expect(onIssue).toHaveBeenCalledTimes(1)
    expect(onIssue).toHaveBeenCalledWith({
      issue: expect.objectContaining({
        code: 'VALUE_TOO_LONG',
        column: 'name'
      }),
      source: 'grid'
    })

    sync.destroy()
  })
})

// On AG Grid 28 to 30, the grid API has getColumnDef and no getColumn. The
// sync must still find each column's filter type and each column that the
// grid has (#300).
describe.each(GRID_TIMINGS)(
  'createGridUrlSync: a grid API with no getColumn, as on AG Grid 28 to 30 (%s timing) (#300)',
  timing => {
    const NUMBER_AND_DATE = '/?f_age_gt=35&f_created_eq=2024-01-01'

    const AGE_AND_CREATED = {
      age: { filterType: 'number', type: 'greaterThan', filter: 35 },
      created: {
        filterType: 'date',
        type: 'equals',
        dateFrom: '2024-01-01',
        dateTo: null
      }
    } as const

    const legacyGrid = () =>
      createTimedGrid(timing, {}, { columnDefOnly: true })

    it('applyUrl keeps the number and date filters, with no issue', async () => {
      const grid = legacyGrid()
      const onIssue = vi.fn()
      const sync = createGridUrlSync({ api: grid.api, onIssue })

      sync.applyUrl(href(NUMBER_AND_DATE))
      await tick()

      expect(grid.api.getFilterModel()).toEqual(AGE_AND_CREATED)
      expect(sync.getSnapshot().issues).toEqual([])
      expect(onIssue).not.toHaveBeenCalled()

      sync.destroy()
    })

    it('the apply on create keeps the number and date filters, and writes no history', async () => {
      useRealLocation(NUMBER_AND_DATE)
      const length = window.history.length
      const grid = legacyGrid()
      const sync = createGridUrlSync({ api: grid.api, history: 'push' })
      await tick()

      expect(grid.api.getFilterModel()).toEqual(AGE_AND_CREATED)
      expect(window.location.search).toBe(NUMBER_AND_DATE.slice(1))
      expect(window.history.length).toBe(length)

      sync.destroy()
    })

    it('the back button gives the grid the number filter again', async () => {
      const grid = legacyGrid()
      const sync = createGridUrlSync({ api: grid.api, history: 'push' })

      grid.userEdit(AGE_30)
      await tick()
      grid.userEdit(NAME_X)
      await tick()

      expect(window.location.search).toBe('?f_name_contains=x')

      const popped = new Promise(resolve => {
        window.addEventListener('popstate', resolve, { once: true })
      })

      window.history.back()
      await popped
      await tick()

      expect(window.location.search).toBe('?f_age_eq=30')
      expect(grid.api.getFilterModel()).toEqual(AGE_30)

      sync.destroy()
    })

    it('a popstate apply writes no history, when the grid takes only part of the URL', async () => {
      const grid = legacyGrid()
      const sync = createGridUrlSync({ api: grid.api, history: 'push' })
      window.history.pushState(
        null,
        '',
        '/?f_name_contains=jo&f_missing_contains=x'
      )
      const length = window.history.length

      window.dispatchEvent(new PopStateEvent('popstate'))
      await tick()

      expect(grid.api.getFilterModel()).toEqual(NAME_JO)
      expect(window.location.search).toBe(
        '?f_name_contains=jo&f_missing_contains=x'
      )
      expect(window.history.length).toBe(length)

      sync.destroy()
    })
  }
)

// While a deferred write is pending, an 'api' event is the landing only when
// the grid shows the write's filters (#274 review)
describe('createGridUrlSync: an app write while an own write is pending', () => {
  /** The grid shows x, the URL says x, and an apply of jo is pending */
  function pendingApply() {
    const grid = createTimedGrid('deferred', NAME_X)
    const sync = createGridUrlSync({ api: grid.api, history: 'push' })
    sync.applyUrl(href('/?f_name_contains=jo'))

    return { grid, sync }
  }

  it('a clear-all is written to history', () => {
    const { grid, sync } = pendingApply()

    expect(window.location.search).toBe('?f_name_contains=x')

    grid.apiEdit({})

    expect(window.location.search).toBe('')

    sync.destroy()
  })

  it('another value on a column of the write is written to history', () => {
    const { grid, sync } = pendingApply()

    grid.apiEdit({
      name: { filterType: 'text', type: 'contains', filter: 'other' }
    })

    expect(window.location.search).toBe('?f_name_contains=other')

    sync.destroy()
  })
})

// A new sync on the same grid takes the earlier sync's own write (#276)
describe.each(GRID_TIMINGS)('createSync: a handover (%s timing)', timing => {
  const DROPPED = '/?f_name_contains=jo&f_missing_contains=x'

  /** Sync 1 applies a URL that the grid takes only in part, then goes */
  function firstSync() {
    const grid = createTimedGrid(timing)
    const first = createGridUrlSync({ api: grid.api, history: 'push' })
    first.applyUrl(href(DROPPED))
    const handover = handOver(first)
    first.destroy()

    return { grid, handover }
  }

  it('a late event of the earlier write writes no history', async () => {
    window.history.replaceState(null, '', DROPPED)
    const { grid, handover } = firstSync()
    const length = window.history.length

    const sync = createSync(
      { api: grid.api, history: 'push', applyUrlOnCreate: false },
      { handover }
    )

    await tick()

    expect(grid.api.getFilterModel()).toEqual(NAME_JO)
    expect(window.location.search).toBe(
      '?f_name_contains=jo&f_missing_contains=x'
    )
    expect(window.history.length).toBe(length)

    sync.destroy()
  })

  it('a user edit after the handover writes history', async () => {
    window.history.replaceState(null, '', DROPPED)
    const { grid, handover } = firstSync()

    const sync = createSync(
      { api: grid.api, history: 'push', applyUrlOnCreate: false },
      { handover }
    )

    await tick()
    const length = window.history.length

    grid.userEdit(NAME_X)
    await tick()

    expect(window.location.search).toBe('?f_name_contains=x')
    expect(window.history.length).toBe(length + 1)

    sync.destroy()
  })
})

// The write can land, or the user can edit, while no sync listens: for
// example while React's <Activity> hides the tree (#276 review)
describe.each(GRID_TIMINGS)(
  'createSync: a stale handover (%s timing)',
  timing => {
    it('a user edit after the write landed with no listener writes history', async () => {
      const grid = createTimedGrid(timing)
      const first = createGridUrlSync({ api: grid.api, history: 'push' })
      window.history.replaceState(null, '', '/?f_name_contains=jo')
      first.applyUrl()
      const handover = handOver(first)
      first.destroy()
      await tick()

      const sync = createSync(
        { api: grid.api, history: 'push', applyUrlOnCreate: false },
        { handover }
      )

      grid.userEdit({})
      await tick()

      expect(grid.api.getFilterModel()).toEqual({})
      expect(window.location.search).toBe('')

      sync.destroy()
    })

    it('a user edit back to the write after an edit with no listener writes history', async () => {
      const grid = createTimedGrid(timing)
      const first = createGridUrlSync({ api: grid.api, history: 'push' })
      first.applyUrl(href('/?f_name_contains=jo'))
      await tick()
      const handover = handOver(first)
      first.destroy()
      grid.userEdit(NAME_X)
      await tick()

      const sync = createSync(
        { api: grid.api, history: 'push', applyUrlOnCreate: false },
        { handover }
      )

      grid.userEdit(NAME_JO)
      await tick()

      expect(window.location.search).toBe('?f_name_contains=jo')

      sync.destroy()
    })
  }
)

describe('handOver', () => {
  it('hands the apply issues to a sync that keeps them', () => {
    const grid = createTimedGrid('in-call')
    const first = createGridUrlSync({ api: grid.api, applyUrlOnCreate: false })
    first.applyUrl(href('/?f_name_contains=jo&f_age_unknownOperation=1'))
    const handover = handOver(first)
    first.destroy()
    const options = { api: grid.api, applyUrlOnCreate: false } as const

    const keeps = createSync(options, { handover, keepApplyIssues: true })
    const drops = createSync(options, { handover })

    expect(handover?.applyIssues).toHaveLength(1)
    expect(keeps.getSnapshot().issues).toHaveLength(1)
    expect(drops.getSnapshot().issues).toEqual([])

    keeps.destroy()
    drops.destroy()
  })

  it('gives no own write for a sync with no own write', () => {
    const grid = createTimedGrid('in-call')
    const sync = createGridUrlSync({ api: grid.api, applyUrlOnCreate: false })

    expect(handOver(sync)?.own).toBeNull()

    sync.destroy()
  })

  it('gives null for a sync that createSync did not make', () => {
    const grid = createTimedGrid('in-call')
    const sync = createGridUrlSync({ api: grid.api })

    expect(handOver({ ...sync })).toBeNull()

    sync.destroy()
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { createGridUrlSync } from './grid-url-sync.js'
import {
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

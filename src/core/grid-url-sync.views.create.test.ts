import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { createGridUrlSync } from './grid-url-sync.js'
import { createViewStore } from './view-storage.js'
import type { GridView, ViewStore } from './view-storage.js'
import type { HistoryMode } from './types.js'
import type { GridTiming } from '../test-helpers.js'
import {
  createTimedGrid,
  GRID_TIMINGS,
  useRealLocation
} from '../test-helpers.js'

// On create with views (#223, spec "On create" and D7): a URL that holds the
// stored view restores the view. A URL with other filters wins. An empty URL
// restores the stored view.

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

interface Stored {
  store: ViewStore
  a: GridView
  mixed: GridView
}

/** A store with A = NAME_JO and Mixed = NAME_JO + STATUS_OPEN, no pointer */
function seed(): Stored {
  const store = createViewStore('t')
  const a = store.saveView('A', NAME_JO)
  const mixed = store.saveView('Mixed', { ...NAME_JO, ...STATUS_OPEN })
  store.persistActiveViewId(null)

  return { store, a, mixed }
}

interface Created {
  grid: ReturnType<typeof createTimedGrid>
  sync: ReturnType<typeof createGridUrlSync>
  onIssue: ReturnType<typeof vi.fn>
}

/** A new grid and a new sync on the store, as a page load makes them */
function create(
  timing: GridTiming,
  store: ViewStore,
  history: HistoryMode = 'push',
  initial: FilterModel = {},
  applyUrlOnCreate?: boolean
): Created {
  const grid = createTimedGrid(timing, initial)
  const onIssue = vi.fn()

  const sync = createGridUrlSync({
    api: grid.api,
    views: store,
    history,
    onIssue,
    applyUrlOnCreate
  })

  return { grid, sync, onIssue }
}

beforeEach(() => {
  localStorage.clear()
  useRealLocation('/')
})

describe.each(GRID_TIMINGS)(
  'createGridUrlSync: the landing on create with views (%s timing)',
  timing => {
    it('a URL with filters wins over the stored view and clears the pointer', async () => {
      const { store, a } = seed()
      store.persistActiveViewId(a.id)
      window.history.replaceState(null, '', '/?f_age_eq=30')

      const { grid, sync, onIssue } = create(timing, store)
      await tick()

      expect(grid.api.getFilterModel()).toEqual(AGE_30)
      expect(sync.getSnapshot().activeViewId).toBeNull()
      expect(store.getActiveViewId()).toBeNull()
      expect(onIssue).not.toHaveBeenCalled()

      sync.destroy()
    })

    it('an empty URL restores the stored view, with replace', async () => {
      const { store, a } = seed()
      store.persistActiveViewId(a.id)
      const length = window.history.length

      const { grid, sync, onIssue } = create(timing, store, 'push')
      await tick()

      expect(grid.api.getFilterModel()).toEqual(NAME_JO)
      expect(window.history.length).toBe(length)
      expect(window.location.search).toBe('?f_name_contains=jo')
      expect(sync.getSnapshot().activeViewId).toBe(a.id)
      expect(store.getActiveViewId()).toBe(a.id)
      expect(onIssue).not.toHaveBeenCalled()

      sync.destroy()
    })

    it('D7: a reload after a view load keeps the view', async () => {
      const { store, a } = seed()
      const first = create(timing, store, 'push')
      first.sync.loadView(a.id)
      await tick()
      first.sync.destroy()
      const length = window.history.length

      const { grid, sync } = create(timing, store, 'push')
      await tick()

      expect(grid.api.getFilterModel()).toEqual(NAME_JO)
      expect(sync.getSnapshot().activeViewId).toBe(a.id)
      expect(store.getActiveViewId()).toBe(a.id)
      expect(window.history.length).toBe(length)
      expect(window.location.search).toBe('?f_name_contains=jo')

      sync.destroy()
    })

    it('D7: a reload keeps the set filters of the view', async () => {
      const { store, mixed } = seed()
      store.persistActiveViewId(mixed.id)
      window.history.replaceState(null, '', '/?f_name_contains=jo')

      const { grid, sync } = create(timing, store)
      await tick()

      expect(grid.api.getFilterModel()).toEqual({ ...NAME_JO, ...STATUS_OPEN })
      expect(sync.getSnapshot().activeViewId).toBe(mixed.id)
      expect(store.getActiveViewId()).toBe(mixed.id)

      sync.destroy()
    })

    it('D7: a URL with other filters still wins', async () => {
      const { store, a } = seed()
      store.persistActiveViewId(a.id)
      window.history.replaceState(null, '', '/?f_name_contains=x')

      const { grid, sync } = create(timing, store)
      await tick()

      expect(grid.api.getFilterModel()).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'x' }
      })
      expect(sync.getSnapshot().activeViewId).toBeNull()
      expect(store.getActiveViewId()).toBeNull()

      sync.destroy()
    })

    // A URL wins only with a filter that it gives, as in the 0.5.1 hook. A
    // param that gives no filter is not a claim on the grid.
    it.each([
      ['a prefixed param that the parser rejects', '/?f_name_regex=abc'],
      [
        'a prefixed param over maxValueLength',
        `/?f_name_contains=${'x'.repeat(250)}`
      ],
      ['a grouped param that does not decode', '/?grid_filters=recent']
    ])(
      '%s restores the stored view and keeps the pointer',
      async (_name, path) => {
        const { store, a } = seed()
        store.persistActiveViewId(a.id)
        window.history.replaceState(null, '', path)

        const { grid, sync } = create(timing, store)
        await tick()

        expect(grid.api.getFilterModel()).toEqual(NAME_JO)
        expect(sync.getSnapshot().activeViewId).toBe(a.id)
        expect(store.getActiveViewId()).toBe(a.id)

        sync.destroy()
      }
    )

    // With views, a URL that gives no filters is no claim, and with no stored
    // view there is nothing to restore: the grid stays and nothing is
    // reported, as in the 0.5.1 hook
    it.each([
      ['a prefixed param that the parser rejects', '/?f_name_regex=abc'],
      [
        'a prefixed param over maxValueLength',
        `/?f_name_contains=${'x'.repeat(250)}`
      ],
      ['a grouped param that does not decode', '/?grid_filters=recent']
    ])(
      '%s with no stored view keeps the grid and reports nothing',
      async (_name, path) => {
        const { store } = seed()
        window.history.replaceState(null, '', path)
        const search = window.location.search

        const { grid, sync, onIssue } = create(timing, store, 'push', AGE_30)
        await tick()

        expect(grid.api.getFilterModel()).toEqual(AGE_30)
        expect(onIssue).not.toHaveBeenCalled()
        expect(sync.getSnapshot().issues).toEqual([])
        expect(window.location.search).toBe(search)

        sync.destroy()
      }
    )

    it('a pointer to a missing view is ignored', async () => {
      const { store } = seed()
      store.persistActiveViewId('missing')

      const { grid, sync, onIssue } = create(timing, store, 'replace', AGE_30)
      await tick()

      // As with no pointer: the grid's filters stay, and go to the URL
      expect(grid.api.getFilterModel()).toEqual(AGE_30)
      expect(window.location.search).toBe('?f_age_eq=30')
      expect(sync.getSnapshot().activeViewId).toBeNull()
      expect(onIssue).not.toHaveBeenCalled()

      sync.destroy()
    })

    it('applyUrlOnCreate: false: nothing is applied or restored', async () => {
      const { store, a } = seed()
      store.persistActiveViewId(a.id)
      window.history.replaceState(null, '', '/?f_age_eq=30')
      const length = window.history.length

      const { grid, sync } = create(timing, store, 'push', {}, false)
      await tick()

      expect(grid.api.getFilterModel()).toEqual({})
      expect(sync.getSnapshot().activeViewId).toBeNull()
      expect(store.getActiveViewId()).toBe(a.id)
      expect(window.history.length).toBe(length)
      expect(window.location.search).toBe('?f_age_eq=30')

      sync.destroy()
    })
  }
)

describe('createGridUrlSync: edge cases of the landing on create', () => {
  it('a restore whose grid write throws keeps no active view and reports GRID_ERROR', () => {
    const { store, a } = seed()
    store.persistActiveViewId(a.id)
    const grid = createTimedGrid('in-call')
    const onIssue = vi.fn()

    vi.spyOn(grid.api, 'setFilterModel').mockImplementation(() => {
      throw new Error('boom')
    })

    const sync = createGridUrlSync({ api: grid.api, views: store, onIssue })

    expect(sync.getSnapshot().activeViewId).toBeNull()
    expect(grid.api.getFilterModel()).toEqual({})
    expect(
      onIssue.mock.calls.map(([event]) => [event.issue.code, event.source])
    ).toEqual([['GRID_ERROR', 'url']])

    sync.destroy()
  })

  it('a URL with filters writes no pointer when none is stored', () => {
    const { store } = seed()
    const persist = vi.spyOn(store, 'persistActiveViewId')
    window.history.replaceState(null, '', '/?f_age_eq=30')

    const { grid, sync } = create('in-call', store)

    expect(grid.api.getFilterModel()).toEqual(AGE_30)
    expect(persist).not.toHaveBeenCalled()

    sync.destroy()
  })
})

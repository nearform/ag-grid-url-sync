import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { createGridUrlSync } from './grid-url-sync.js'
import { createViewStore } from './view-storage.js'
import type { GridView, ViewStore } from './view-storage.js'
import { URLSyncError } from './types.js'
import type { GridTiming } from '../test-helpers.js'
import {
  createTimedGrid,
  GRID_TIMINGS,
  useRealLocation
} from '../test-helpers.js'

// loadView and the active view at all grid timings (#223, D2). The id is set
// before the grid write, it stays while the grid shows the landed model, and
// any other grid model clears it and its stored pointer.

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

interface Setup {
  store: ViewStore
  a: GridView
  b: GridView
  more: GridView[]
  grid: ReturnType<typeof createTimedGrid>
  sync: ReturnType<typeof createGridUrlSync>
  onIssue: ReturnType<typeof vi.fn>
}

/**
 * A store with A = NAME_JO and B = AGE_30 (and more views when given), and
 * no stored pointer, so the sync starts with no active view
 */
function setup(
  timing: GridTiming,
  more: ReadonlyArray<readonly [string, FilterModel]> = [],
  options: {
    store?: ViewStore
    throwOnError?: boolean
    normalize?: boolean
  } = {}
): Setup {
  const seed = createViewStore('t')
  const a = seed.saveView('A', NAME_JO)
  const b = seed.saveView('B', AGE_30)
  const extra = more.map(([name, model]) => seed.saveView(name, model))
  seed.persistActiveViewId(null)

  const store = options.store ?? seed
  const grid = createTimedGrid(timing, {}, { normalize: options.normalize })
  const onIssue = vi.fn()

  const sync = createGridUrlSync({
    api: grid.api,
    views: store,
    onIssue,
    throwOnError: options.throwOnError
  })

  return { store, a, b, more: extra, grid, sync, onIssue }
}

/** The sync as a JavaScript caller sees it: no type stops an undefined id */
interface JavaScriptCaller {
  loadView(id: string | null | undefined): void
}

/** The one extra view of a setup. A missing view fails the test. */
function extraView(more: readonly GridView[]): GridView {
  const [view] = more

  if (view === undefined) throw new Error('The setup has no extra view')

  return view
}

/** The code and source of each onIssue call */
const issuesOf = (onIssue: ReturnType<typeof vi.fn>) =>
  onIssue.mock.calls.map(([event]) => [event.issue.code, event.source])

beforeEach(() => {
  localStorage.clear()
  useRealLocation('/')
})

describe.each(GRID_TIMINGS)(
  'createGridUrlSync: loadView (%s timing)',
  timing => {
    it('loadView shows the id at once and after the landing', async () => {
      const { a, grid, sync } = setup(timing)

      sync.loadView(a.id)

      expect(sync.getSnapshot().activeViewId).toBe(a.id)

      await tick()

      expect(sync.getSnapshot().activeViewId).toBe(a.id)
      expect(grid.api.getFilterModel()).toEqual(NAME_JO)
      expect(sync.getSnapshot().url).toContain('f_name_contains=jo')

      sync.destroy()
    })

    it('loadView persists the pointer', async () => {
      const { a, store, sync } = setup(timing)

      sync.loadView(a.id)

      expect(store.getActiveViewId()).toBe(a.id)

      await tick()

      expect(store.getActiveViewId()).toBe(a.id)

      sync.destroy()
    })

    it('loadView(null) clears the grid and the active view', async () => {
      const { a, grid, store, sync } = setup(timing)
      sync.loadView(a.id)
      await tick()

      expect(grid.api.getFilterModel()).toEqual(NAME_JO)

      sync.loadView(null)
      await tick()

      expect(grid.api.getFilterModel()).toEqual({})
      expect(sync.getSnapshot().activeViewId).toBeNull()
      expect(sync.getSnapshot().hasFilters).toBe(false)
      expect(store.getActiveViewId()).toBeNull()

      sync.destroy()
    })

    it('loadView(undefined) from JavaScript clears as loadView(null) does', async () => {
      const { a, grid, store, sync } = setup(timing)
      sync.loadView(a.id)
      await tick()

      expect(grid.api.getFilterModel()).toEqual(NAME_JO)

      const fromJavaScript: JavaScriptCaller = sync

      fromJavaScript.loadView(undefined)
      await tick()

      expect(grid.api.getFilterModel()).toEqual({})
      expect(sync.getSnapshot().activeViewId).toBeNull()
      expect(store.getActiveViewId()).toBeNull()

      sync.destroy()
    })

    it('a view that the grid rebuilds with another key order stays active, and its pointer stays', async () => {
      const { a, grid, store, sync } = setup(timing, [], { normalize: true })

      sync.loadView(a.id)
      await tick()

      expect(grid.api.getFilterModel()).toEqual(NAME_JO)
      expect(sync.getSnapshot().activeViewId).toBe(a.id)
      expect(store.getActiveViewId()).toBe(a.id)

      sync.destroy()
    })

    it('a view stored with a number as a string stays active after the grid rebuilds it, and its pointer stays', async () => {
      const { more, grid, store, sync } = setup(
        timing,
        [
          ['S', { age: { filterType: 'number', type: 'equals', filter: '30' } }]
        ],
        { normalize: true }
      )

      const s = extraView(more)

      sync.loadView(s.id)
      await tick()

      expect(grid.api.getFilterModel()).toEqual(AGE_30)
      expect(sync.getSnapshot().activeViewId).toBe(s.id)
      expect(store.getActiveViewId()).toBe(s.id)

      sync.destroy()
    })

    it('a user edit after a rebuilt landing clears the active view', async () => {
      const { a, grid, sync } = setup(timing, [], { normalize: true })
      sync.loadView(a.id)
      await tick()

      expect(sync.getSnapshot().activeViewId).toBe(a.id)

      grid.userEdit(NAME_X)

      expect(sync.getSnapshot().activeViewId).toBeNull()

      sync.destroy()
    })

    it('loadView clears the apply issues', async () => {
      const { a, sync } = setup(timing)
      sync.applyUrl(href('/?f_age_gt=abc'))
      await tick()

      expect(sync.getSnapshot().issues).not.toHaveLength(0)

      sync.loadView(a.id)
      await tick()

      expect(sync.getSnapshot().issues).toHaveLength(0)

      sync.destroy()
    })

    it('a user edit after the landing clears the active view and the pointer', async () => {
      const { a, grid, store, sync } = setup(timing)
      sync.loadView(a.id)
      await tick()

      expect(sync.getSnapshot().activeViewId).toBe(a.id)

      grid.userEdit(NAME_X)

      expect(sync.getSnapshot().activeViewId).toBeNull()
      expect(store.getActiveViewId()).toBeNull()

      sync.destroy()
    })

    it('applyUrl with other filters clears the active view and the pointer', async () => {
      const { a, store, sync } = setup(timing)
      sync.loadView(a.id)
      await tick()

      sync.applyUrl(href('/?f_name_contains=x'))
      await tick()

      expect(sync.getSnapshot().activeViewId).toBeNull()
      expect(store.getActiveViewId()).toBeNull()

      sync.destroy()
    })

    it('a view that the grid takes only part of stays active after the landing', async () => {
      const { more, grid, sync } = setup(timing, [
        [
          'C',
          {
            ...NAME_JO,
            missing: { filterType: 'text', type: 'contains', filter: 'm' }
          }
        ]
      ])

      const c = extraView(more)

      sync.loadView(c.id)
      await tick()

      expect(grid.api.getFilterModel()).toEqual(NAME_JO)
      expect(sync.getSnapshot().activeViewId).toBe(c.id)

      sync.destroy()
    })

    it('two views with the same model: the loaded one is active', async () => {
      const { a, more, sync } = setup(timing, [['A2', NAME_JO]])
      const a2 = extraView(more)

      sync.loadView(a2.id)
      await tick()

      expect(sync.getSnapshot().activeViewId).toBe(a2.id)

      sync.loadView(a.id)
      await tick()

      expect(sync.getSnapshot().activeViewId).toBe(a.id)

      sync.destroy()
    })

    it("a hand edit to a view's model does not make it active", () => {
      const { grid, store, sync } = setup(timing)

      grid.userEdit(NAME_JO)

      expect(sync.getSnapshot().activeViewId).toBeNull()
      expect(store.getActiveViewId()).toBeNull()

      sync.destroy()
    })

    it('loadView of a missing id reports VIEW_NOT_FOUND and re-reads the list', async () => {
      const { a, b, grid, onIssue, sync } = setup(timing)
      sync.loadView(a.id)
      await tick()
      createViewStore('t').deleteView(b.id)

      sync.loadView(b.id)
      await tick()

      expect(issuesOf(onIssue)).toEqual([['VIEW_NOT_FOUND', 'api']])
      expect(sync.getSnapshot().views.map(view => view.name)).toEqual(['A'])
      expect(sync.getSnapshot().activeViewId).toBe(a.id)
      expect(sync.getSnapshot().issues).toEqual([])
      expect(grid.api.getFilterModel()).toEqual(NAME_JO)

      sync.destroy()
    })

    it('a grid that throws in setFilterModel keeps the old active view and reports GRID_ERROR', async () => {
      const { a, b, grid, onIssue, store, sync } = setup(timing)
      sync.loadView(a.id)
      await tick()
      vi.spyOn(grid.api, 'setFilterModel').mockImplementation(() => {
        throw new Error('boom')
      })

      sync.loadView(b.id)
      await tick()

      expect(sync.getSnapshot().activeViewId).toBe(a.id)
      expect(store.getActiveViewId()).toBe(a.id)
      expect(issuesOf(onIssue)).toEqual([['GRID_ERROR', 'api']])
      expect(grid.api.getFilterModel()).toEqual(NAME_JO)

      sync.destroy()
    })

    it('with throwOnError, a grid that throws keeps the old active view', async () => {
      const { a, b, grid, store, sync } = setup(timing, [], {
        throwOnError: true
      })

      sync.loadView(a.id)
      await tick()
      vi.spyOn(grid.api, 'setFilterModel').mockImplementation(() => {
        throw new Error('boom')
      })

      expect(() => sync.loadView(b.id)).toThrow('boom')
      expect(sync.getSnapshot().activeViewId).toBe(a.id)
      expect(store.getActiveViewId()).toBe(a.id)

      sync.destroy()
    })

    it('deleteView of the active view clears the grid when it still shows the view', async () => {
      const { a, grid, sync } = setup(timing)
      sync.loadView(a.id)
      await tick()

      expect(sync.getSnapshot().activeViewId).toBe(a.id)

      sync.deleteView(a.id)
      await tick()

      expect(grid.api.getFilterModel()).toEqual({})
      expect(sync.getSnapshot().activeViewId).toBeNull()
      expect(sync.getSnapshot().hasFilters).toBe(false)
      expect(sync.getSnapshot().views.map(view => view.name)).toEqual(['B'])

      sync.destroy()
    })

    it('deleteView of the active view keeps a hand-edited grid', async () => {
      const { a, grid, sync } = setup(timing)
      sync.loadView(a.id)
      await tick()
      grid.userEdit(NAME_X)

      expect(grid.api.getFilterModel()).toEqual(NAME_X)

      sync.deleteView(a.id)
      await tick()

      expect(grid.api.getFilterModel()).toEqual(NAME_X)
      expect(sync.getSnapshot().activeViewId).toBeNull()

      sync.destroy()
    })

    it('loadView changes the grid when the pointer write fails, and reports it', async () => {
      const real = createViewStore('t')

      const store: ViewStore = {
        ...real,
        persistActiveViewId() {
          throw new URLSyncError('write failed', undefined, {
            code: 'STORAGE_WRITE_FAILED'
          })
        }
      }

      const { a, grid, onIssue, sync } = setup(timing, [], { store })

      sync.loadView(a.id)
      await tick()

      expect(grid.api.getFilterModel()).toEqual(NAME_JO)
      expect(sync.getSnapshot().activeViewId).toBe(a.id)
      expect(issuesOf(onIssue)).toEqual([['STORAGE_WRITE_FAILED', 'api']])

      sync.destroy()
    })

    it('a user edit keeps a pointer that another tab moved to another view', async () => {
      const { a, b, grid, store, sync } = setup(timing)
      sync.loadView(a.id)
      await tick()

      // Another tab loads B
      store.persistActiveViewId(b.id)
      grid.userEdit(NAME_X)

      expect(sync.getSnapshot().activeViewId).toBeNull()
      expect(store.getActiveViewId()).toBe(b.id)

      sync.destroy()
    })
  }
)

// The cases that only a deferred grid has: the write is pending for a tick
describe('createGridUrlSync: loadView while the write is pending', () => {
  it('a user edit while a deferred load is pending clears the active view', async () => {
    const { a, grid, store, sync } = setup('deferred')
    sync.loadView(a.id)

    expect(sync.getSnapshot().activeViewId).toBe(a.id)

    grid.userEdit(NAME_X)
    await tick()

    expect(sync.getSnapshot().activeViewId).toBeNull()
    expect(store.getActiveViewId()).toBeNull()

    sync.destroy()
  })

  it('a user edit with the URL form of a pending view is a change, not the landing', async () => {
    const { more, grid, store, sync } = setup('deferred', [
      ['Set', { ...NAME_JO, age: { filterType: 'set', values: ['30'] } }]
    ])

    const view = extraView(more)
    sync.loadView(view.id)

    expect(sync.getSnapshot().activeViewId).toBe(view.id)

    // The URL form leaves out the set filter, so it is the view's URL form
    grid.userEdit(NAME_JO)

    expect(sync.getSnapshot().activeViewId).toBeNull()

    await tick()

    expect(sync.getSnapshot().activeViewId).toBeNull()
    expect(store.getActiveViewId()).toBeNull()

    sync.destroy()
  })

  it('an app setFilterModel with another model while a load is pending is not the landing', async () => {
    const { a, grid, sync } = setup('deferred')
    sync.loadView(a.id)

    expect(sync.getSnapshot().activeViewId).toBe(a.id)

    grid.apiEdit({
      name: { filterType: 'text', type: 'contains', filter: 'other' }
    })
    await tick()

    expect(sync.getSnapshot().activeViewId).toBeNull()

    sync.destroy()
  })

  it('two loads in one tick: the second view is active, and its pointer stays', async () => {
    const { a, b, grid, store, sync } = setup('deferred')

    sync.loadView(a.id)
    sync.loadView(b.id)
    await tick()

    expect(grid.api.getFilterModel()).toEqual(AGE_30)
    expect(sync.getSnapshot().activeViewId).toBe(b.id)
    expect(store.getActiveViewId()).toBe(b.id)

    sync.destroy()
  })

  it('a second load of the model that the grid shows waits for the first load', async () => {
    const { a, b, grid, store, sync } = setup('deferred')
    sync.loadView(b.id)
    await tick()

    sync.loadView(a.id)
    sync.loadView(b.id)
    await tick()

    expect(grid.api.getFilterModel()).toEqual(AGE_30)
    expect(sync.getSnapshot().activeViewId).toBe(b.id)
    expect(store.getActiveViewId()).toBe(b.id)

    sync.destroy()
  })

  it('A, B, A in one tick: A is active, and its pointer stays', async () => {
    const { a, b, grid, store, sync } = setup('deferred')

    sync.loadView(a.id)
    sync.loadView(b.id)
    sync.loadView(a.id)
    await tick()

    expect(grid.api.getFilterModel()).toEqual(NAME_JO)
    expect(sync.getSnapshot().activeViewId).toBe(a.id)
    expect(store.getActiveViewId()).toBe(a.id)

    sync.destroy()
  })

  it('A, then a clear, in one tick: no view is active, and the grid is clear', async () => {
    const { a, grid, store, sync } = setup('deferred')

    sync.loadView(a.id)
    sync.loadView(null)
    await tick()

    expect(grid.api.getFilterModel()).toEqual({})
    expect(sync.getSnapshot().activeViewId).toBeNull()
    expect(store.getActiveViewId()).toBeNull()

    sync.destroy()
  })

  it('deleteView while the load is pending does not clear the grid', async () => {
    const { a, grid, sync } = setup('deferred')
    sync.loadView(a.id)

    sync.deleteView(a.id)
    await tick()

    expect(grid.api.getFilterModel()).toEqual(NAME_JO)
    expect(sync.getSnapshot().activeViewId).toBeNull()

    sync.destroy()
  })

  it('saveView while a load is pending saves the grid model, and the late landing clears it', async () => {
    const { a, grid, store, sync } = setup('deferred')
    sync.loadView(a.id)

    const saved = sync.saveView('S')

    expect(saved?.filterModel).toEqual({})
    expect(sync.getSnapshot().activeViewId).toBe(saved?.id)

    await tick()

    expect(grid.api.getFilterModel()).toEqual(NAME_JO)
    expect(sync.getSnapshot().activeViewId).toBeNull()
    expect(store.getActiveViewId()).toBeNull()

    sync.destroy()
  })

  it('destroy while a load is pending: the late event changes nothing', async () => {
    const { a, sync } = setup('deferred')
    sync.loadView(a.id)

    expect(sync.getSnapshot().activeViewId).toBe(a.id)

    sync.destroy()
    const snapshot = sync.getSnapshot()

    await tick()

    expect(sync.getSnapshot()).toBe(snapshot)
  })
})

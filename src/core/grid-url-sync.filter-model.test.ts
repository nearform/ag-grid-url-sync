import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { createGridUrlSync } from './grid-url-sync.js'
import { grouped, individual } from './codecs.js'
import { readUrlFilters } from './url-parser.js'
import { writeUrlFilters } from './url-generator.js'
import { createViewStore } from './view-storage.js'
import type { IssueEvent } from './types.js'
import {
  asGridApi,
  createGridListeners,
  createTimedGrid,
  GRID_TIMINGS,
  useRealLocation
} from '../test-helpers.js'

// The sync on AG Grid's FilterModel (#225). A URL apply changes only the
// columns that the codec can hold. The json and base64 formats hold any
// model. The timed grid has a set filter column `status`.

const STATUS_SET: FilterModel = {
  status: { filterType: 'set', values: ['open'] }
}

const NAME_JO: FilterModel = {
  name: { filterType: 'text', type: 'contains', filter: 'jo' }
}

const AGE_30: FilterModel = {
  age: { filterType: 'number', type: 'equals', filter: 30 }
}

const NAME_OR: FilterModel = {
  name: {
    filterType: 'text',
    operator: 'OR',
    conditions: [
      { filterType: 'text', type: 'contains', filter: 'jo' },
      { filterType: 'text', type: 'contains', filter: 'ja' }
    ]
  }
}

const JSON_CODEC = { serialization: 'grouped', format: 'json' } as const

/** One tick, for the timings that send filterChanged later */
const tick = (): Promise<void> =>
  new Promise(resolve => globalThis.setTimeout(resolve, 0))

const href = (path: string): string => new URL(path, window.location.href).href

beforeEach(() => {
  localStorage.clear()
  useRealLocation('/')
})

describe.each(GRID_TIMINGS)('the individual codec (%s timing)', timing => {
  it('a URL apply on create keeps a set filter', async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const grid = createTimedGrid(timing, { ...STATUS_SET, ...AGE_30 })
    const length = window.history.length
    const sync = createGridUrlSync({ api: grid.api, history: 'push' })
    await tick()

    expect(grid.api.getFilterModel()).toEqual({ ...STATUS_SET, ...NAME_JO })
    expect(window.location.search).toBe('?f_name_contains=jo')
    expect(window.history.length).toBe(length)

    sync.destroy()
  })

  it('applyUrl keeps combined conditions on another column', async () => {
    const grid = createTimedGrid(timing, NAME_OR)
    const sync = createGridUrlSync({ api: grid.api, history: 'push' })
    const length = window.history.length

    sync.applyUrl(href('/?f_age_eq=30'))
    await tick()

    expect(grid.api.getFilterModel()).toEqual({ ...NAME_OR, ...AGE_30 })
    expect(window.history.length).toBe(length)

    sync.destroy()
  })

  it('a URL column wins over a filter that the codec cannot hold', async () => {
    const grid = createTimedGrid(timing, NAME_OR)
    const sync = createGridUrlSync({ api: grid.api })

    sync.applyUrl(href('/?f_name_contains=jo'))
    await tick()

    expect(grid.api.getFilterModel()).toEqual(NAME_JO)

    sync.destroy()
  })

  it('reports UNSUPPORTED_FILTER one time when it reads a set filter', async () => {
    const grid = createTimedGrid(timing)
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const sync = createGridUrlSync({ api: grid.api, onIssue, history: 'push' })

    grid.userEdit({ ...STATUS_SET, ...NAME_JO })
    await tick()
    grid.userEdit({ ...STATUS_SET, ...AGE_30 })
    await tick()

    expect(onIssue).toHaveBeenCalledOnce()
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      source: 'grid',
      issue: { code: 'UNSUPPORTED_FILTER', column: 'status' }
    })
    expect(sync.getSnapshot().issues).toMatchObject([
      { code: 'UNSUPPORTED_FILTER', column: 'status' }
    ])
    expect(window.location.search).toBe('?f_age_eq=30')

    grid.userEdit(AGE_30)
    await tick()

    expect(sync.getSnapshot().issues).toEqual([])

    sync.destroy()
  })

  it('applyFilters writes the full model, as setFilterModel does', async () => {
    const grid = createTimedGrid(timing, NAME_JO)
    const sync = createGridUrlSync({ api: grid.api, history: 'push' })
    const length = window.history.length

    expect(sync.applyFilters(STATUS_SET)).toEqual({ issues: [] })
    await tick()

    expect(grid.api.getFilterModel()).toEqual(STATUS_SET)
    // The URL holds no filter now: one entry, as for a user edit
    expect(window.location.search).toBe('')
    expect(window.history.length).toBe(length + 1)

    sync.destroy()
  })

  it('applyFilters reports TYPE_MISMATCH for a number filter on a text column', () => {
    const grid = createTimedGrid(timing)
    const sync = createGridUrlSync({ api: grid.api })

    const { issues } = sync.applyFilters({
      name: { filterType: 'number', type: 'equals', filter: 1 }
    })

    expect(issues).toMatchObject([{ code: 'TYPE_MISMATCH', column: 'name' }])

    sync.destroy()
  })
})

describe.each(GRID_TIMINGS)('the json codec (%s timing)', timing => {
  it('a user edit puts a set filter and combined conditions in the URL', async () => {
    const grid = createTimedGrid(timing)
    const onIssue = vi.fn<(event: IssueEvent) => void>()

    const sync = createGridUrlSync({
      api: grid.api,
      codec: grouped({ format: 'json' }),
      history: 'push',
      onIssue
    })

    grid.userEdit({ ...STATUS_SET, ...NAME_OR })
    await tick()

    expect(readUrlFilters(window.location.href, JSON_CODEC)).toEqual({
      ...STATUS_SET,
      ...NAME_OR
    })
    expect(sync.getSnapshot().hasFilters).toBe(true)
    expect(onIssue).not.toHaveBeenCalled()

    sync.destroy()
  })

  it('a URL apply on create writes the full model and no history', async () => {
    const model = { ...STATUS_SET, ...NAME_OR }
    window.history.replaceState(
      null,
      '',
      writeUrlFilters(window.location.href, model, JSON_CODEC)
    )
    const grid = createTimedGrid(timing, AGE_30)
    const length = window.history.length

    const sync = createGridUrlSync({
      api: grid.api,
      codec: grouped({ format: 'json' }),
      history: 'push'
    })

    await tick()

    expect(grid.api.getFilterModel()).toEqual(model)
    expect(window.history.length).toBe(length)

    sync.destroy()
  })
})

// The grid rebuilds a model (a number given as a string comes back as a
// number). The json form of a URL compares in a normal form, as the
// individual form does (#225 review).
const AGE_30_TEXT: FilterModel = {
  age: { filterType: 'number', type: 'equals', filter: '30' }
}

describe.each(GRID_TIMINGS)(
  'the json codec on a grid that rebuilds models (%s timing)',
  timing => {
    it('a loaded view stays active, and its pointer stays', async () => {
      const store = createViewStore('t')
      const view = store.saveView('S', AGE_30_TEXT)
      store.persistActiveViewId(null)
      const grid = createTimedGrid(timing, {}, { normalize: true })

      const sync = createGridUrlSync({
        api: grid.api,
        codec: grouped({ format: 'json' }),
        views: store
      })

      sync.loadView(view.id)
      await tick()

      expect(grid.api.getFilterModel()).toEqual(AGE_30)
      expect(sync.getSnapshot().activeViewId).toBe(view.id)
      expect(store.getActiveViewId()).toBe(view.id)

      sync.destroy()
    })

    it('a restore on create keeps the view active and adds no history entry', async () => {
      const store = createViewStore('t')
      const view = store.saveView('S', AGE_30_TEXT)
      store.persistActiveViewId(view.id)
      const grid = createTimedGrid(timing, {}, { normalize: true })
      const length = window.history.length

      const sync = createGridUrlSync({
        api: grid.api,
        codec: grouped({ format: 'json' }),
        views: store,
        history: 'push'
      })

      await tick()

      expect(sync.getSnapshot().activeViewId).toBe(view.id)
      expect(store.getActiveViewId()).toBe(view.id)
      expect(window.history.length).toBe(length)

      sync.destroy()
    })

    it('a URL that holds the stored view in the normal form restores the view (D7)', async () => {
      const store = createViewStore('t')
      const view = store.saveView('S', AGE_30_TEXT)
      store.persistActiveViewId(view.id)
      window.history.replaceState(
        null,
        '',
        writeUrlFilters(window.location.href, AGE_30, JSON_CODEC)
      )
      const grid = createTimedGrid(timing, {}, { normalize: true })

      const sync = createGridUrlSync({
        api: grid.api,
        codec: grouped({ format: 'json' }),
        views: store
      })

      await tick()

      expect(sync.getSnapshot().activeViewId).toBe(view.id)
      expect(store.getActiveViewId()).toBe(view.id)

      sync.destroy()
    })

    it('a hand-made URL that the grid rebuilds writes no history', async () => {
      window.history.replaceState(
        null,
        '',
        `/?grid_filters=${encodeURIComponent(JSON.stringify(AGE_30_TEXT))}`
      )
      const grid = createTimedGrid(timing, {}, { normalize: true })
      const length = window.history.length

      const sync = createGridUrlSync({
        api: grid.api,
        codec: grouped({ format: 'json' }),
        history: 'push'
      })

      await tick()

      expect(grid.api.getFilterModel()).toEqual(AGE_30)
      expect(window.history.length).toBe(length)

      sync.destroy()
    })
  }
)

// A custom filter's model can be any value, for example an array (#283
// review). applyFilters keeps it, and a URL apply does not clear it.
const TAGS: FilterModel = { tags: ['a', 'b'] }

/** A grid fake that keeps any model, also one with an array column */
function anyModelGrid(initial: FilterModel) {
  const listeners = createGridListeners()
  let model: FilterModel = { ...initial }

  const setFilterModel = vi.fn((next: FilterModel | null) => {
    model = next ?? {}
  })

  const api = asGridApi({
    getFilterModel: () => model,
    setFilterModel,
    addEventListener: listeners.addEventListener,
    removeEventListener: listeners.removeEventListener
  })

  return { api, setFilterModel, model: () => model }
}

describe('a custom filter model that is an array', () => {
  it('applyFilters passes it to the grid', () => {
    const grid = anyModelGrid({})
    const sync = createGridUrlSync({ api: grid.api })

    sync.applyFilters({ ...TAGS, ...NAME_JO })

    expect(grid.setFilterModel).toHaveBeenLastCalledWith({
      ...TAGS,
      ...NAME_JO
    })

    sync.destroy()
  })

  it('a URL apply with the individual codec keeps it', () => {
    const grid = anyModelGrid(TAGS)
    const sync = createGridUrlSync({ api: grid.api, codec: individual() })

    sync.applyUrl(writeUrlFilters('http://x.test/', NAME_JO))

    expect(grid.model()).toEqual({ ...TAGS, ...NAME_JO })

    sync.destroy()
  })

  it('the json codec holds it, so a json URL applies it', () => {
    const grid = anyModelGrid({})

    const sync = createGridUrlSync({
      api: grid.api,
      codec: grouped({ format: 'json' })
    })

    sync.applyUrl(
      writeUrlFilters('http://x.test/', { ...TAGS, ...NAME_JO }, JSON_CODEC)
    )

    expect(grid.model()).toEqual({ ...TAGS, ...NAME_JO })

    sync.destroy()
  })
})

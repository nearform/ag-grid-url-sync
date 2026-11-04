import { describe, it, expect, beforeEach } from 'vitest'
import { createGridUrlSync } from './grid-url-sync.js'
import { createViewStore } from './view-storage.js'
import { createRealGrid, useRealLocation } from '../test-helpers.js'

// A real AG Grid in jsdom: a view load, a reload and the back button (#223,
// D7). The reload keeps the view. Back applies the old URL.

const NAME_JO = {
  name: { filterType: 'text', type: 'contains', filter: 'jo' }
} as const

const AGE_GT_5 = {
  age: { filterType: 'number', type: 'greaterThan', filter: 5 }
} as const

/** AG Grid sends filterChanged one tick after setFilterModel */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve))

/** Goes back one entry, waits for jsdom's popstate, then one tick */
async function back(): Promise<void> {
  const popped = new Promise(resolve => {
    window.addEventListener('popstate', resolve, { once: true })
  })

  window.history.back()
  await popped
  await settle()
}

beforeEach(() => {
  localStorage.clear()
  useRealLocation('/')
})

describe('createGridUrlSync: views on a real grid', () => {
  it('load, reload, back', async () => {
    const store = createViewStore('t')
    const a = store.saveView('A', { ...NAME_JO, ...AGE_GT_5 })
    store.persistActiveViewId(null)

    const firstApi = createRealGrid()

    const first = createGridUrlSync({
      api: firstApi,
      views: store,
      history: 'push'
    })

    await settle()
    const length = window.history.length

    // Load A: one entry
    first.loadView(a.id)
    await settle()

    expect(window.history.length).toBe(length + 1)
    expect(window.location.search).toBe('?f_name_contains=jo&f_age_gt=5')

    // Reload: a new grid and a new sync on the same URL and store
    first.destroy()
    firstApi.destroy()
    const api = createRealGrid()
    const sync = createGridUrlSync({ api, views: store, history: 'push' })
    await settle()

    expect(api.getFilterModel()).toMatchObject({ ...NAME_JO, ...AGE_GT_5 })
    expect(sync.getSnapshot().activeViewId).toBe(a.id)
    expect(store.getActiveViewId()).toBe(a.id)
    expect(window.history.length).toBe(length + 1)

    // Back: the old URL applies, and the view is no longer active
    await back()

    expect(window.location.search).toBe('')
    expect(api.getFilterModel()).toEqual({})
    expect(sync.getSnapshot().activeViewId).toBeNull()
    expect(store.getActiveViewId()).toBeNull()
    expect(window.history.length).toBe(length + 1)

    sync.destroy()
    api.destroy()
  })
})

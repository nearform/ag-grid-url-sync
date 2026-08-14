import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createViewStore } from './view-storage.js'
import type { FilterModel } from 'ag-grid-community'

const STORAGE_KEY = 'ag-grid-url-sync:views:v1:test-grid'

const filters = (): FilterModel => ({
  department: { filterType: 'text', type: 'equals', filter: 'Engineering' },
  salary: { filterType: 'number', type: 'greaterThan', filter: 90000 }
})

describe('createViewStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts empty', () => {
    const store = createViewStore('test-grid')
    expect(store.listViews()).toEqual([])
    expect(store.getActiveViewId()).toBeNull()
  })

  it('namespaces storage by key', () => {
    createViewStore('grid-a').saveView('A', filters())

    expect(createViewStore('grid-b').listViews()).toEqual([])
    expect(createViewStore('grid-a').listViews()).toHaveLength(1)
  })

  it('round-trips the filter model verbatim', () => {
    const store = createViewStore('test-grid')
    const model = filters()
    store.saveView('Engineering', model)

    expect(store.listViews()[0]?.filterModel).toEqual(model)
  })

  it('makes a newly saved view active', () => {
    const store = createViewStore('test-grid')
    const view = store.saveView('Engineering', filters())

    expect(store.getActiveViewId()).toBe(view.id)
  })

  it('snapshots by value so later mutation cannot corrupt a saved view', () => {
    const store = createViewStore('test-grid')
    const model = filters()
    store.saveView('Engineering', model)

    // AG Grid mutates its own filter model objects in place.
    ;(model.department as { filter: string }).filter = 'MUTATED'

    expect(store.listViews()[0]?.filterModel.department.filter).toBe(
      'Engineering'
    )
  })

  it('toggles the active view between saved views', () => {
    const store = createViewStore('test-grid')
    const first = store.saveView('First', filters())
    const second = store.saveView('Second', {})

    store.setActiveViewId(first.id)
    expect(store.getActiveViewId()).toBe(first.id)

    store.setActiveViewId(second.id)
    expect(store.getActiveViewId()).toBe(second.id)
  })

  it('clears the active id when the active view is deleted', () => {
    const store = createViewStore('test-grid')
    const view = store.saveView('Doomed', filters())

    store.deleteView(view.id)

    expect(store.listViews()).toEqual([])
    expect(store.getActiveViewId()).toBeNull()
  })

  it('keeps the active id when a different view is deleted', () => {
    const store = createViewStore('test-grid')
    const keep = store.saveView('Keep', filters())
    const drop = store.saveView('Drop', {})
    store.setActiveViewId(keep.id)

    store.deleteView(drop.id)

    expect(store.getActiveViewId()).toBe(keep.id)
    expect(store.listViews()).toHaveLength(1)
  })

  describe('resilience', () => {
    it('degrades to empty on corrupt JSON', () => {
      window.localStorage.setItem(STORAGE_KEY, '{ not json at all')

      expect(createViewStore('test-grid').listViews()).toEqual([])
    })

    it('drops malformed view entries', () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          views: [
            { nope: true },
            { id: 'x', name: 'ok', updatedAt: 1, filterModel: {} }
          ],
          activeId: 'x'
        })
      )

      expect(createViewStore('test-grid').listViews()).toHaveLength(1)
    })

    it('nulls an active id that points at a missing view', () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ views: [], activeId: 'ghost' })
      )

      expect(createViewStore('test-grid').getActiveViewId()).toBeNull()
    })

    /**
     * jsdom's Storage is proxy-backed, so an instance-level spy on getItem or
     * setItem does not shadow the real method — the spy is silently ignored and
     * the test passes without ever reaching the code under test. Replace the
     * whole object instead.
     */
    const withStorage = (
      stub: Partial<Storage>,
      run: () => void
    ): void => {
      const original = window.localStorage
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
          clear: () => {},
          ...stub
        },
        configurable: true
      })

      try {
        run()
      } finally {
        Object.defineProperty(window, 'localStorage', {
          value: original,
          configurable: true
        })
      }
    }

    it('degrades to empty when storage cannot be read', () => {
      // Seed a view first, so an empty result can only mean the read failed —
      // asserting [] against an already-empty store would prove nothing.
      createViewStore('test-grid').saveView('Seeded', filters())
      expect(createViewStore('test-grid').listViews()).toHaveLength(1)

      withStorage(
        {
          getItem: () => {
            throw new Error('blocked by policy')
          }
        },
        () => {
          expect(createViewStore('test-grid').listViews()).toEqual([])
        }
      )
    })

    it('throws an actionable error when the quota is exceeded', () => {
      withStorage(
        {
          setItem: () => {
            throw new DOMException('quota', 'QuotaExceededError')
          }
        },
        () => {
          expect(() =>
            createViewStore('test-grid').saveView('X', filters())
          ).toThrow(/Browser storage is full/)
        }
      )
    })

    it('throws an actionable error on the Firefox quota error name', () => {
      withStorage(
        {
          setItem: () => {
            throw new DOMException('quota', 'NS_ERROR_DOM_QUOTA_REACHED')
          }
        },
        () => {
          expect(() =>
            createViewStore('test-grid').saveView('X', filters())
          ).toThrow(/Browser storage is full/)
        }
      )
    })

    it('throws a generic error for other write failures', () => {
      withStorage(
        {
          setItem: () => {
            throw new Error('nope')
          }
        },
        () => {
          expect(() =>
            createViewStore('test-grid').saveView('X', filters())
          ).toThrow(/Could not write saved views/)
        }
      )
    })
  })
})

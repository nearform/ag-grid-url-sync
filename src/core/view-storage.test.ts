import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createViewStore } from './view-storage.js'
import { asGridApi } from '../test-helpers.js'
import { URLSyncError } from './types.js'
import { toError } from './to-error.js'
import type { FilterModel } from 'ag-grid-community'

const STORAGE_KEY = 'ag-grid-url-sync:views:v1:test-grid'

const filters = (): FilterModel => ({
  department: { filterType: 'text', type: 'equals', filter: 'Engineering' },
  salary: { filterType: 'number', type: 'greaterThan', filter: 90000 }
})

/** Runs the callback with a stub in place of localStorage */
const withStorage = (stub: Partial<Storage>, run: () => void): void => {
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
    createViewStore('grid-a').saveView('A', { filterModel: filters() })

    expect(createViewStore('grid-b').listViews()).toEqual([])
    expect(createViewStore('grid-a').listViews()).toHaveLength(1)
  })

  it('round-trips the filter model verbatim', () => {
    const store = createViewStore('test-grid')
    const model = filters()
    store.saveView('Engineering', { filterModel: model })

    expect(store.listViews()[0]?.filterModel).toEqual(model)
  })

  it('makes a newly saved view active', () => {
    const store = createViewStore('test-grid')
    const view = store.saveView('Engineering', { filterModel: filters() })

    expect(store.getActiveViewId()).toBe(view.id)
  })

  describe('names', () => {
    it('trims the name', () => {
      const store = createViewStore('test-grid')

      const view = store.saveView('   Engineering   ', {
        filterModel: filters()
      })

      expect(view.name).toBe('Engineering')
      expect(store.listViews()[0]?.name).toBe('Engineering')
    })

    it('rejects an empty or whitespace-only name', () => {
      const store = createViewStore('test-grid')

      expect(() => store.saveView('', { filterModel: filters() })).toThrow(
        /view name is required/
      )
      expect(() => store.saveView('   ', { filterModel: filters() })).toThrow(
        /view name is required/
      )
      expect(store.listViews()).toEqual([])
    })

    it('stores a readable view when the filter model is null', () => {
      const store = createViewStore('test-grid')

      // AG Grid's getFilterModel can return null despite its declared type.
      // Persisting that verbatim writes a blob isGridView later rejects, so the
      // save appears to succeed and the view then never appears in the list.
      const nullModel = asGridApi({
        getFilterModel: () => null
      }).getFilterModel()

      const view = store.saveView('X', { filterModel: nullModel })

      expect(view.filterModel).toEqual({})
      expect(store.listViews()).toHaveLength(1)
      expect(store.getActiveViewId()).toBe(view.id)
    })

    // A JavaScript caller can still use the 0.5 form, saveView(name,
    // filterModel). Without a check, the store saves an empty view and the
    // call looks like a success.
    it.each([
      ['a filter model (the 0.5 form)', filters()],
      ['an empty filter model (the 0.5 form)', {}],
      ['null', null],
      ['undefined', undefined],
      ['a string', 'x']
    ])('throws a TypeError for %s in place of a ViewState', (_, state) => {
      const store = createViewStore('test-grid')

      // SAFETY: the test gives the store what a JavaScript caller can give
      const save = () => store.saveView('X', state as never)

      expect(save).toThrow(TypeError)
      expect(save).toThrow('saveView takes a ViewState: { filterModel }')
      expect(store.listViews()).toEqual([])
    })

    it('saves a view for a state whose filterModel is undefined', () => {
      const store = createViewStore('test-grid')

      // SAFETY: AG Grid's getFilterModel can give undefined at run time
      const view = store.saveView('X', { filterModel: undefined as never })

      expect(view.filterModel).toEqual({})
      expect(store.listViews()).toHaveLength(1)
    })

    it('overwrites in place when the name already exists', () => {
      const store = createViewStore('test-grid')
      const first = store.saveView('Same', { filterModel: filters() })

      const second = store.saveView('Same', {
        filterModel: {
          age: { filterType: 'number', type: 'equals', filter: 30 }
        }
      })

      // One entry, same id, new filter model.
      expect(store.listViews()).toHaveLength(1)
      expect(second.id).toBe(first.id)
      expect(store.listViews()[0]?.filterModel).toEqual({
        age: { filterType: 'number', type: 'equals', filter: 30 }
      })
    })

    it('keeps list position when overwriting', () => {
      const store = createViewStore('test-grid')
      store.saveView('First', { filterModel: filters() })
      store.saveView('Second', { filterModel: {} })
      store.saveView('Third', { filterModel: {} })

      store.saveView('First', { filterModel: {} })

      expect(store.listViews().map(view => view.name)).toEqual([
        'First',
        'Second',
        'Third'
      ])
    })

    it('matches names after trimming, so padded input overwrites', () => {
      const store = createViewStore('test-grid')
      const first = store.saveView('Padded', { filterModel: filters() })
      const second = store.saveView('  Padded  ', { filterModel: {} })

      expect(store.listViews()).toHaveLength(1)
      expect(second.id).toBe(first.id)
    })

    it('treats different casing as different views', () => {
      const store = createViewStore('test-grid')
      store.saveView('Engineering', { filterModel: filters() })
      store.saveView('engineering', { filterModel: {} })

      expect(store.listViews()).toHaveLength(2)
    })
  })

  it('snapshots by value so later mutation cannot corrupt a saved view', () => {
    const store = createViewStore('test-grid')
    const model = filters()
    store.saveView('Engineering', { filterModel: model })

    // AG Grid mutates its own filter model objects in place.
    model.department.filter = 'MUTATED'

    expect(store.listViews()[0]?.filterModel.department.filter).toBe(
      'Engineering'
    )
  })

  it('toggles the active view between saved views', () => {
    const store = createViewStore('test-grid')
    const first = store.saveView('First', { filterModel: filters() })
    const second = store.saveView('Second', { filterModel: {} })

    store.persistActiveViewId(first.id)
    expect(store.getActiveViewId()).toBe(first.id)

    store.persistActiveViewId(second.id)
    expect(store.getActiveViewId()).toBe(second.id)
  })

  it('clears the active id when the active view is deleted', () => {
    const store = createViewStore('test-grid')
    const view = store.saveView('Doomed', { filterModel: filters() })

    store.deleteView(view.id)

    expect(store.listViews()).toEqual([])
    expect(store.getActiveViewId()).toBeNull()
  })

  it('keeps the active id when a different view is deleted', () => {
    const store = createViewStore('test-grid')
    const keep = store.saveView('Keep', { filterModel: filters() })
    const drop = store.saveView('Drop', { filterModel: {} })
    store.persistActiveViewId(keep.id)

    store.deleteView(drop.id)

    expect(store.getActiveViewId()).toBe(keep.id)
    expect(store.listViews()).toHaveLength(1)
  })

  describe('resilience', () => {
    it('reads degrade without a DOM, but writes report failure', () => {
      const store = createViewStore('test-grid')

      vi.stubGlobal('window', undefined)

      try {
        // Reading during a server render must not throw. That is deliberate.
        expect(store.listViews()).toEqual([])
        expect(store.getActiveViewId()).toBeNull()

        // Writing cannot succeed, so it must not claim to. Returning a populated
        // GridView here would tell the caller a save happened that did not.
        expect(() => store.saveView('X', { filterModel: filters() })).toThrow(
          /storage/i
        )
        expect(() => store.persistActiveViewId('x')).toThrow(/storage/i)

        // deleteView cannot throw here, and that is correct rather than a gap:
        // with no DOM the read yields an empty store, so there is nothing to
        // delete, and a write that changes nothing is a no-op.
        expect(() => store.deleteView('x')).not.toThrow()
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('does not write when the value is unchanged', () => {
      const store = createViewStore('test-grid')
      const view = store.saveView('Seeded', { filterModel: filters() })

      const realSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError')
      }

      try {
        // Each of these would change nothing, so none may attempt a write and
        // none may report a storage failure. Callers should not need their own
        // guard around a throwing read-modify-write.
        expect(() => store.persistActiveViewId(view.id)).not.toThrow()
        expect(() => store.deleteView('never-stored')).not.toThrow()

        // A real change still reports failure.
        expect(() => store.persistActiveViewId(null)).toThrow(/storage/i)
        expect(() => store.deleteView(view.id)).toThrow(/storage/i)
      } finally {
        Storage.prototype.setItem = realSetItem
      }
    })

    it('gives each degraded read its own array', () => {
      // Corrupt blobs under two different keys, so both reads degrade.
      window.localStorage.setItem('ag-grid-url-sync:views:v1:pa', '{ not json')
      window.localStorage.setItem('ag-grid-url-sync:views:v1:pb', '{ not json')

      const a = createViewStore('pa')
      const b = createViewStore('pb')

      expect(a.listViews()).not.toBe(b.listViews())

      // A consumer mutating its own result must not affect any other store:
      // listViews is public API through the ./views entry point.
      const mine = a.listViews()
      mine.push({
        id: 'x',
        name: 'injected',
        updatedAt: 1,
        filterModel: {}
      })

      expect(a.listViews()).toEqual([])
      expect(b.listViews()).toEqual([])
      expect(createViewStore('pc').listViews()).toEqual([])
    })

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
     * setItem does not shadow the real method. The spy is silently ignored and
     * the test passes without ever reaching the code under test. Replace the
     * whole object instead.
     */

    it('degrades to empty when storage cannot be read', () => {
      // Seed a view first, so an empty result can only mean the read failed.
      // asserting [] against an already-empty store would prove nothing.
      createViewStore('test-grid').saveView('Seeded', {
        filterModel: filters()
      })
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
            createViewStore('test-grid').saveView('X', {
              filterModel: filters()
            })
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
            createViewStore('test-grid').saveView('X', {
              filterModel: filters()
            })
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
            createViewStore('test-grid').saveView('X', {
              filterModel: filters()
            })
          ).toThrow(/Error writing to storage/)
        }
      )
    })
  })

  // Each storage error is a URLSyncError with a code (#220)
  describe('error codes (#220)', () => {
    /** The error that the call throws */
    function thrown(run: () => void): Error {
      try {
        run()
      } catch (error) {
        return toError(error)
      }

      throw new Error('expected the call to throw')
    }

    it('gives STORAGE_UNAVAILABLE with no DOM', () => {
      const store = createViewStore('test-grid')
      vi.stubGlobal('window', undefined)

      try {
        const error = thrown(() =>
          store.saveView('X', { filterModel: filters() })
        )

        expect(error).toBeInstanceOf(URLSyncError)
        expect(error).toMatchObject({
          code: 'STORAGE_UNAVAILABLE',
          message: 'Browser storage is unavailable.'
        })
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it.each([
      ['STORAGE_FULL', new DOMException('quota', 'QuotaExceededError')],
      ['STORAGE_FULL', new DOMException('quota', 'NS_ERROR_DOM_QUOTA_REACHED')],
      ['STORAGE_WRITE_FAILED', new Error('nope')]
    ])('gives %s and keeps the storage error as the cause', (code, cause) => {
      withStorage(
        {
          setItem: () => {
            throw cause
          }
        },
        () => {
          const error = thrown(() =>
            createViewStore('test-grid').saveView('X', {
              filterModel: filters()
            })
          )

          expect(error).toBeInstanceOf(URLSyncError)
          expect(error).toMatchObject({ code, cause })
        }
      )
    })

    it('gives VIEW_NAME_REQUIRED for an empty name', () => {
      const error = thrown(() =>
        createViewStore('test-grid').saveView('  ', { filterModel: filters() })
      )

      expect(error).toBeInstanceOf(URLSyncError)
      expect(error).toMatchObject({
        code: 'VIEW_NAME_REQUIRED',
        message: 'A view name is required.'
      })
    })
  })
})

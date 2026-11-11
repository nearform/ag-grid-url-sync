import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { useGridUrlSync } from './use-grid-url-sync.js'
import type { UseGridUrlSyncOptions, UseGridUrlSyncResult } from './types.js'
import { individual } from '../core/codecs.js'
import { createViewStore } from '../core/view-storage.js'
import {
  asGridApi,
  createGridListeners,
  waitForEffects,
  type GridApiFake,
  type GridListeners
} from '../test-helpers.js'

// The restore of the stored view on mount, on a grid fake (#226). Ported
// from the tests of the removed 0.5 hook: a restore that the grid
// applies late or in its own form keeps the view, and a URL wins over the
// stored view only with a filter that it gives.

// A grid fake that has the four methods that the sync calls
type MockGridApi = GridApiFake &
  Required<
    Pick<
      GridApiFake,
      | 'setFilterModel'
      | 'getFilterModel'
      | 'addEventListener'
      | 'removeEventListener'
    >
  >

// The grid fake with a listener registry: fire() calls each live listener
type ListeningGridApi = MockGridApi & Pick<GridListeners, 'fire' | 'count'>

const createMockGridApi = (): ListeningGridApi => ({
  setFilterModel: vi.fn(),
  getFilterModel: vi.fn(() => ({})),
  ...createGridListeners()
})

const KEY = 'view-test-grid'

const savedModel = {
  department: { filterType: 'text', type: 'equals', filter: 'Engineering' }
}

const nameContains = (filter: string): FilterModel => ({
  name: { filterType: 'text', type: 'contains', filter }
})

const QUOTA = (): never => {
  throw new DOMException('quota', 'QuotaExceededError')
}

let mockGridApi: ListeningGridApi

/** Sets the page URL on the location mock of test-setup.ts */
function setSearch(search: string): void {
  Object.defineProperty(window.location, 'search', {
    value: search,
    configurable: true
  })
  // The core reads the full URL, so it must agree with the search
  Object.defineProperty(window.location, 'href', {
    value: `https://example.com/${search}`,
    configurable: true
  })
}

/** A stored view that is the active one, as an earlier session left it */
function seedActiveView(model: FilterModel = savedModel): string {
  return createViewStore(KEY).saveView('Seeded', { filterModel: model }).id
}

/** The hook on the grid fake, with views and the default apply on create */
function renderSync(options: Omit<UseGridUrlSyncOptions, 'api'> = {}) {
  return renderHook(() =>
    useGridUrlSync({
      api: asGridApi(mockGridApi),
      storageKey: KEY,
      ...options
    })
  )
}

/** A filterChanged event, with the source that AG Grid gives */
function emitFilterChanged(source?: string): void {
  if (mockGridApi.count('filterChanged') === 0) {
    throw new Error('no filterChanged listener registered')
  }

  mockGridApi.fire('filterChanged', source ? { source } : undefined)
}

const fireFilterChanged = (): Promise<void> =>
  act(async () => emitFilterChanged())

const expectUnloaded = (result: { current: UseGridUrlSyncResult }): void => {
  expect(result.current.activeViewId).toBeNull()
  expect(createViewStore(KEY).getActiveViewId()).toBeNull()
}

beforeEach(() => {
  mockGridApi = createMockGridApi()
  window.localStorage.clear()
  setSearch('')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useGridUrlSync: a restore that the grid changes (#226)', () => {
  test('a restore that the grid normalises keeps the view and its pointer', async () => {
    // Saved when the grid had a salary column
    const id = seedActiveView({
      ...savedModel,
      salary: { filterType: 'number', type: 'greaterThan', filter: 1 }
    })

    // The column is gone now, so AG Grid drops its filter
    mockGridApi.getFilterModel = vi.fn(() => savedModel)
    mockGridApi.getColumn = vi.fn((colId: string) =>
      colId === 'salary' ? null : { isFilterAllowed: () => true }
    )

    const { result } = renderSync()

    await waitForEffects()
    await fireFilterChanged()

    expect(result.current.activeViewId).toBe(id)
    expect(createViewStore(KEY).getActiveViewId()).toBe(id)
  })

  test('a restore that the grid applies late keeps the view and its pointer', async () => {
    const id = seedActiveView()

    // AG Grid queues setFilterModel until it knows the column types
    let model: FilterModel = {}
    mockGridApi.getFilterModel = vi.fn(() => model)

    const { result } = renderSync()

    await waitForEffects()

    expect(result.current.activeViewId).toBe(id)
    expect(createViewStore(KEY).getActiveViewId()).toBe(id)

    // The queued model lands
    model = savedModel
    await fireFilterChanged()
    expect(result.current.activeViewId).toBe(id)

    // A real edit after it still unloads the view
    model = {}
    await fireFilterChanged()
    expectUnloaded(result)
  })

  test('the first edit after a restore that the grid ignored unloads the view', async () => {
    const id = seedActiveView()

    // The grid drops a model that it does not accept now
    mockGridApi.getFilterModel = vi.fn(() => ({}))

    const { result } = renderSync()

    await waitForEffects()
    expect(result.current.activeViewId).toBe(id)

    // The user's own edit, not the landing of the view
    mockGridApi.getFilterModel = vi.fn(() => ({
      name: { filterType: 'text', type: 'contains', filter: 'John' }
    }))
    await fireFilterChanged()

    expectUnloaded(result)
  })

  test('a restore that the grid reads back in another form keeps the view until an edit', async () => {
    const id = seedActiveView()

    mockGridApi.getFilterModel = vi
      .fn()
      .mockReturnValueOnce({})
      .mockReturnValue(nameContains('x'))

    const { result } = renderSync()

    await waitForEffects()
    await fireFilterChanged()
    expect(result.current.activeViewId).toBe(id)

    mockGridApi.getFilterModel = vi.fn(() => ({}))
    await fireFilterChanged()
    expect(result.current.activeViewId).toBeNull()
  })

  describe('a view that the grid normalises', () => {
    // AG Grid rebuilds a date condition with a time and its own key order
    const handBuilt = {
      created: { filterType: 'date', type: 'equals', dateFrom: '2024-01-01' }
    }

    const normalised = {
      created: {
        dateFrom: '2024-01-01 00:00:00',
        dateTo: null,
        filterType: 'date',
        type: 'equals'
      }
    }

    test('stays loaded when the grid sends the event in the call', async () => {
      const id = createViewStore(KEY).saveView('Dated', {
        filterModel: handBuilt
      }).id

      createViewStore(KEY).persistActiveViewId(null)

      let model: FilterModel = {}
      mockGridApi.getFilterModel = vi.fn(() => model)
      // A ready grid applies at once and sends the event in the call
      mockGridApi.setFilterModel = vi.fn(() => {
        model = normalised
        emitFilterChanged('api')
      })

      const { result } = renderSync()

      await waitForEffects()
      act(() => result.current.loadView(id))

      expect(result.current.activeViewId).toBe(id)
      expect(createViewStore(KEY).getActiveViewId()).toBe(id)

      model = {}
      await act(async () => emitFilterChanged('columnFilter'))
      expectUnloaded(result)
    })

    test('stays loaded when a deferred restore lands', async () => {
      const id = createViewStore(KEY).saveView('Dated', {
        filterModel: handBuilt
      }).id

      let model: FilterModel = {}
      mockGridApi.getFilterModel = vi.fn(() => model)

      const { result } = renderSync()

      await waitForEffects()
      expect(result.current.activeViewId).toBe(id)

      // The grid applies the queued write as an API change
      model = normalised
      await act(async () => emitFilterChanged('api'))
      expect(result.current.activeViewId).toBe(id)
      expect(createViewStore(KEY).getActiveViewId()).toBe(id)

      model = {}
      await act(async () => emitFilterChanged('columnFilter'))
      expectUnloaded(result)
    })

    test('unloads on a user edit over a restore that the grid never applied', async () => {
      const id = createViewStore(KEY).saveView('Dated', {
        filterModel: handBuilt
      }).id

      let model: FilterModel = {}
      mockGridApi.getFilterModel = vi.fn(() => model)

      const { result } = renderSync()

      await waitForEffects()
      expect(result.current.activeViewId).toBe(id)

      model = {
        age: { filterType: 'number', type: 'greaterThan', filter: 30 }
      }
      await act(async () => emitFilterChanged('columnFilter'))
      expectUnloaded(result)
    })
  })
})

describe('useGridUrlSync: a filter write while a restore is pending (#226)', () => {
  const john = nameContains('John')

  const age = { age: { filterType: 'number', type: 'equals', filter: 30 } }

  const handBuilt = {
    created: { filterType: 'date', type: 'equals', dateFrom: '2024-01-01' }
  }

  const normalised = {
    created: {
      dateFrom: '2024-01-01 00:00:00',
      dateTo: null,
      filterType: 'date',
      type: 'equals'
    }
  }

  // The restore is still pending when the app writes: the grid ignored the
  // view or did not apply it yet. `initial` is what the grid shows.
  const mountWithPendingRestore = async (
    view: FilterModel = savedModel,
    initial: FilterModel = {}
  ) => {
    const id = createViewStore(KEY).saveView('Pending', {
      filterModel: view
    }).id

    let model = initial
    mockGridApi.getFilterModel = vi.fn(() => model)

    // As AG Grid: an event only when the model changed
    const setModel = (next: FilterModel): void => {
      const changed = JSON.stringify(next) !== JSON.stringify(model)
      model = next

      if (changed) emitFilterChanged('api')
    }

    const { result, unmount } = renderSync()

    await waitForEffects()
    expect(result.current.activeViewId).toBe(id)

    return { id, result, setModel, unmount }
  }

  test.each([
    [
      'applyUrl',
      john,
      (hook: UseGridUrlSyncResult) =>
        hook.applyUrl('http://example.com?f_name_contains=John')
    ],
    [
      'applyFilters',
      john,
      (hook: UseGridUrlSyncResult) => hook.applyFilters(john)
    ],
    [
      'applyFilters({}) over filters that the grid shows',
      {},
      (hook: UseGridUrlSyncResult) => hook.applyFilters({})
    ]
  ] as const)(
    '%s is not taken for the restore landing',
    async (_name, target, write) => {
      // The grid shows a filter of its own, so each case changes the model
      const { result, setModel } = await mountWithPendingRestore(
        savedModel,
        age
      )

      // The grid takes the write of the hook at once
      vi.mocked(mockGridApi.setFilterModel).mockImplementationOnce(() =>
        setModel(target)
      )

      await act(async () => {
        write(result.current)
      })

      expectUnloaded(result)
    }
  )

  test('a hook write of the view itself keeps it loaded', async () => {
    const { id, result, setModel } = await mountWithPendingRestore()

    vi.mocked(mockGridApi.setFilterModel).mockImplementationOnce(() =>
      setModel(savedModel)
    )

    await act(async () => {
      result.current.applyFilters(savedModel)
    })

    expect(result.current.activeViewId).toBe(id)
    expect(createViewStore(KEY).getActiveViewId()).toBe(id)
  })

  // These writes do not change the grid, so they say nothing about the
  // restore. The restore can still land in the grid's form, which is not an
  // edit. The setFilterModel of the grid fake does nothing.
  test.each([
    [
      'has a bad URL',
      (hook: UseGridUrlSyncResult) => hook.applyUrl('nonsense')
    ],
    [
      'the grid ignores',
      (hook: UseGridUrlSyncResult) => hook.applyFilters(john)
    ],
    ['changes nothing', (hook: UseGridUrlSyncResult) => hook.applyFilters({})]
  ] as const)(
    'a hook write that %s keeps the restore pending',
    async (_name, write) => {
      const { id, result, setModel } = await mountWithPendingRestore(handBuilt)

      await act(async () => {
        write(result.current)
      })
      expect(result.current.activeViewId).toBe(id)

      // The deferred restore lands now, in the grid's own form
      await act(async () => setModel(normalised))
      expect(result.current.activeViewId).toBe(id)
      expect(createViewStore(KEY).getActiveViewId()).toBe(id)

      // A real edit after it still unloads the view
      await act(async () => setModel({}))
      expectUnloaded(result)
    }
  )

  // The app writes to the grid itself, for example with
  // gridApi.setFilterModel. AG Grid gives the source 'api' for that too.
  describe('by the app itself', () => {
    test('unloads a restore that the grid ignored, and a reload does not restore it', async () => {
      const { result, setModel, unmount } =
        await mountWithPendingRestore(savedModel)

      await act(async () => setModel(john))
      expectUnloaded(result)

      unmount()
      vi.mocked(mockGridApi.setFilterModel).mockClear()
      renderSync()
      await waitForEffects()
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalledWith(savedModel)
    })

    test('unloads the view when it changes a column that the grid filtered', async () => {
      const { result, setModel } = await mountWithPendingRestore(
        savedModel,
        age
      )

      await act(async () => setModel({ age: { ...age.age, filter: 40 } }))

      expectUnloaded(result)
    })

    test('unloads the view when it lands together with the restore', async () => {
      const { result, setModel } = await mountWithPendingRestore(handBuilt)

      // AG Grid applies queued writes one after the other, so one event can
      // show the restore and the write of the app over it
      await act(async () => setModel({ ...normalised, ...john }))

      expectUnloaded(result)
    })

    test('a restore landing beside the initial filter state keeps the view', async () => {
      // setFilterModel keeps a column that AG Grid holds in its initial
      // filter state, so it stays after the restore
      const { id, result, setModel } = await mountWithPendingRestore(
        handBuilt,
        age
      )

      await act(async () => setModel({ ...normalised, ...age }))
      expect(result.current.activeViewId).toBe(id)
      expect(createViewStore(KEY).getActiveViewId()).toBe(id)

      await act(async () => setModel(normalised))
      expectUnloaded(result)
    })

    // Another value on the view's own column is a change, not the landing
    // of the view in a form of the grid (#274, #223)
    test("a write with another value on the view's column unloads the view", async () => {
      const { result, setModel } = await mountWithPendingRestore(savedModel)

      await act(async () =>
        setModel({
          department: { filterType: 'text', type: 'equals', filter: 'Sales' }
        })
      )

      expectUnloaded(result)
    })
  })
})

// A URL wins over the stored view only with a filter that it gives
describe('useGridUrlSync: the URL or the stored view on mount (#226)', () => {
  test('an empty prefix does not make each query param a filter', async () => {
    const id = seedActiveView()
    mockGridApi.getFilterModel = vi.fn(() => savedModel)

    // A page param, not a filter
    setSearch('?page=2')

    const { result } = renderSync({ codec: individual({ prefix: '' }) })

    await waitForEffects()

    // The URL gives no filters, so the stored view is restored
    expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)
    expect(result.current.activeViewId).toBe(id)
    // Only the restore wrote to the grid
    expect(mockGridApi.setFilterModel).toHaveBeenCalledTimes(1)
  })

  test('a prefix with no trailing underscore does not match a part of a name', async () => {
    const id = seedActiveView()
    mockGridApi.getFilterModel = vi.fn(() => savedModel)

    // 'filterMode' is not 'filter' + a column
    setSearch('?filterMode=advanced')

    const { result } = renderSync({ codec: individual({ prefix: 'filter' }) })

    await waitForEffects()

    expect(result.current.activeViewId).toBe(id)
  })

  test('one bad param does not remove the other filters of the URL', async () => {
    seedActiveView()
    mockGridApi.getFilterModel = vi.fn(() => savedModel)

    // The parser skips the bad param and keeps the good one, so the URL
    // gives a filter and wins
    setSearch('?f_name_regex=abc&f_dept_contains=eng')

    const { result } = renderSync({ onIssue: () => {} })

    await waitForEffects()

    expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
      dept: { filterType: 'text', type: 'contains', filter: 'eng' }
    })
    expect(mockGridApi.setFilterModel).not.toHaveBeenCalledWith(savedModel)
    expect(result.current.activeViewId).toBeNull()
  })

  test('a param that is not the grouped param of the codec is not a filter claim', async () => {
    const id = seedActiveView()
    mockGridApi.getFilterModel = vi.fn(() => savedModel)

    // A value that decodes, but under 'filters', which is not the grouped
    // param. The parser does not read it (#210).
    setSearch('?filters=f_name_contains%3Dfromurl')

    const { result } = renderSync()

    await waitForEffects()

    // Only the restore wrote to the grid
    expect(mockGridApi.setFilterModel).toHaveBeenCalledTimes(1)
    expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)
    expect(result.current.activeViewId).toBe(id)
  })

  test('a grouped param that decodes wins over the stored view', async () => {
    seedActiveView()
    mockGridApi.getFilterModel = vi.fn(() => savedModel)

    setSearch('?grid_filters=f_name_contains%3Dfromurl')

    const { result } = renderSync()

    await waitForEffects()

    expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(
      nameContains('fromurl')
    )
    expect(mockGridApi.setFilterModel).not.toHaveBeenCalledWith(savedModel)
    expect(result.current.activeViewId).toBeNull()
  })

  test('a delete of a view does not clear the URL filters when the URL won', async () => {
    setSearch('?f_name_contains=fromurl')
    const id = seedActiveView()
    mockGridApi.getFilterModel = vi.fn(() => nameContains('fromurl'))

    const { result } = renderSync()

    await waitForEffects()

    vi.mocked(mockGridApi.setFilterModel).mockClear()
    act(() => result.current.deleteView(id))

    // The grid shows the URL's filters, not this view
    expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()
    expect(result.current.views).toEqual([])
  })

  test('a failed pointer write is a storage issue, not a URL issue', async () => {
    seedActiveView()
    setSearch('?f_name_contains=fromurl')
    const onIssue = vi.fn()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(QUOTA)

    const { result } = renderSync({ onIssue })

    await waitForEffects()

    // The URL apply worked: the issue is the storage write only
    expect(onIssue.mock.calls.map(([event]) => event.issue.code)).toEqual([
      'STORAGE_FULL'
    ])
    expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(
      nameContains('fromurl')
    )
    expect(result.current.issues).toEqual([])
  })

  test('applies the URL one time when the pointer write throws', async () => {
    setSearch('?f_name_contains=fromurl')

    // Storage that reads but does not write, as when a policy blocks it. The
    // stored pointer is set, so the URL win must clear it.
    const stored = JSON.stringify({
      views: [{ id: 'seeded', name: 'Seeded', updatedAt: 1, filterModel: {} }],
      activeId: 'seeded'
    })

    const original = window.localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => stored,
        setItem: QUOTA,
        removeItem: () => {},
        clear: () => {}
      },
      configurable: true
    })

    try {
      const { rerender } = renderSync({ onIssue: () => {} })

      await waitForEffects()

      rerender()
      rerender()
      rerender()
      await waitForEffects()

      expect(mockGridApi.setFilterModel).toHaveBeenCalledOnce()
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(
        nameContains('fromurl')
      )
    } finally {
      Object.defineProperty(window, 'localStorage', {
        value: original,
        configurable: true
      })
    }
  })
})

import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { GridApi } from 'ag-grid-community'
import { useGridUrlSync } from './use-grid-url-sync.js'
import type { UseGridUrlSyncOptions } from './types.js'
import { createViewStore, type GridView } from '../core/view-storage.js'
import {
  asGridApi,
  createGridListeners,
  waitForEffects,
  type GridApiFake,
  type GridListeners
} from '../test-helpers.js'

// The saved views of useGridUrlSync on a grid fake (#226). Ported from the
// tests of the removed 0.5 hook: each one checks a rule that 0.6.0
// still has and that no core test covers on its own.

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

const QUOTA = (): never => {
  throw new DOMException('quota', 'QuotaExceededError')
}

/** The code and the source of each issue that onIssue got */
const issuesOf = (onIssue: ReturnType<typeof vi.fn>) =>
  onIssue.mock.calls.map(([event]) => [event.issue.code, event.source])

let mockGridApi: ListeningGridApi

/** The hook on the grid fake, with inline options as an app gives them */
function renderSync(options: Omit<UseGridUrlSyncOptions, 'api'> = {}) {
  return renderHook(() =>
    useGridUrlSync({ api: asGridApi(mockGridApi), ...options })
  )
}

/** The grid fake does not send events, so a test sends filterChanged */
async function fireFilterChanged(): Promise<void> {
  if (mockGridApi.count('filterChanged') === 0) {
    throw new Error('no filterChanged listener registered')
  }

  await act(async () => {
    mockGridApi.fire('filterChanged')
  })
}

beforeEach(() => {
  mockGridApi = createMockGridApi()
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useGridUrlSync: view methods with no grid (#226)', () => {
  test('saveView and loadView report NOT_READY, and deleteView does not', () => {
    const onIssue = vi.fn()

    const { result } = renderHook(() =>
      useGridUrlSync({ api: null, storageKey: KEY, onIssue })
    )

    act(() => {
      expect(result.current.saveView('Too early')).toBeNull()
    })
    act(() => result.current.loadView('anything'))
    act(() => result.current.deleteView('anything'))

    // Only the two that need the grid. deleteView touches only storage.
    expect(issuesOf(onIssue)).toEqual([
      ['NOT_READY', 'api'],
      ['NOT_READY', 'api']
    ])
  })
})

describe('useGridUrlSync: save, load and delete on a grid fake (#226)', () => {
  test('a view saved from a null filter model survives a read again', () => {
    // AG Grid can give null, though its type says FilterModel
    mockGridApi.getFilterModel = vi.fn(() => null)

    const { result } = renderSync({ storageKey: KEY })

    let saved: GridView | null = null
    act(() => {
      saved = result.current.saveView('Unfiltered')
    })

    expect(saved).not.toBeNull()
    expect(result.current.views).toHaveLength(1)
    expect(result.current.activeViewId).toBe(saved!.id)

    // A later session still has it
    const remount = renderSync({ storageKey: KEY, applyUrlOnCreate: false })

    expect(remount.result.current.views).toHaveLength(1)
  })

  test('loadView(null) with no active view writes no storage, so blocked storage is silent', () => {
    const onIssue = vi.fn()
    const { result } = renderSync({ storageKey: KEY, onIssue })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(QUOTA)

    act(() => result.current.loadView(null))

    expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
    expect(onIssue).not.toHaveBeenCalled()
  })

  test('a load of the active view again does not write the pointer again', () => {
    mockGridApi.getFilterModel = vi.fn(() => savedModel)
    const onIssue = vi.fn()
    const { result } = renderSync({ storageKey: KEY, onIssue })

    let id = ''
    act(() => {
      id = result.current.saveView('Engineering')!.id
    })
    act(() => result.current.loadView(id))
    expect(result.current.activeViewId).toBe(id)

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(QUOTA)
    act(() => result.current.loadView(id))

    expect(result.current.activeViewId).toBe(id)
    expect(onIssue).not.toHaveBeenCalled()
  })

  test('deletes the view also when the grid model cannot be read', () => {
    mockGridApi.getFilterModel = vi.fn(() => savedModel)
    const { result } = renderSync({ storageKey: KEY, onIssue: () => {} })

    let id = ''
    act(() => {
      id = result.current.saveView('Engineering')!.id
    })
    act(() => result.current.loadView(id))

    // As on a destroyed grid
    mockGridApi.getFilterModel = vi.fn(() => {
      throw new Error('grid destroyed')
    })

    act(() => result.current.deleteView(id))

    expect(result.current.views).toEqual([])
    expect(result.current.activeViewId).toBeNull()
  })

  test('deletes the view when the grid gives a null filter model', () => {
    mockGridApi.getFilterModel = vi.fn(() => savedModel)
    const { result } = renderSync({ storageKey: KEY })

    let id = ''
    act(() => {
      id = result.current.saveView('Engineering')!.id
    })
    act(() => result.current.loadView(id))

    mockGridApi.getFilterModel = vi.fn(() => null)

    act(() => result.current.deleteView(id))

    expect(result.current.views).toEqual([])
  })

  // The steps run in one act(), as one event handler of the app runs them
  test('a delete of a view saved and loaded in the same tick clears the grid', () => {
    mockGridApi.getFilterModel = vi.fn(() => savedModel)
    const { result } = renderSync({ storageKey: KEY })

    act(() => {
      const view = result.current.saveView('Engineering')!
      result.current.loadView(view.id)
      result.current.deleteView(view.id)
    })

    expect(result.current.views).toEqual([])
    expect(result.current.activeViewId).toBeNull()
    // The clear of the delete is the last write to the grid
    expect(mockGridApi.setFilterModel).toHaveBeenLastCalledWith({})
  })

  test('a delete of a view saved in the same tick clears the grid', () => {
    mockGridApi.getFilterModel = vi.fn(() => savedModel)
    const { result } = renderSync({ storageKey: KEY })

    act(() => {
      const view = result.current.saveView('Engineering')!
      result.current.deleteView(view.id)
    })

    expect(result.current.views).toEqual([])
    expect(result.current.activeViewId).toBeNull()
    expect(mockGridApi.setFilterModel).toHaveBeenLastCalledWith({})
  })

  test('a filter change that still matches keeps the view active', async () => {
    mockGridApi.getFilterModel = vi.fn(() => savedModel)
    const { result } = renderSync({ storageKey: KEY })

    let id = ''
    act(() => {
      id = result.current.saveView('Engineering')!.id
    })
    act(() => result.current.loadView(id))

    // filterChanged also comes for a change that keeps the model
    await fireFilterChanged()

    expect(result.current.activeViewId).toBe(id)
    expect(createViewStore(KEY).getActiveViewId()).toBe(id)
  })

  test('a new grid clears the active view but keeps the stored pointer', async () => {
    mockGridApi.getFilterModel = vi.fn(() => savedModel)

    const { result, rerender } = renderHook(
      (props: { api: GridApi }) =>
        useGridUrlSync({
          api: props.api,
          storageKey: KEY,
          applyUrlOnCreate: false
        }),
      { initialProps: { api: asGridApi(mockGridApi) } }
    )

    let id = ''
    act(() => {
      id = result.current.saveView('Engineering')!.id
    })
    act(() => result.current.loadView(id))
    expect(result.current.activeViewId).toBe(id)

    // applyUrlOnCreate is false, so nothing restores the view on the new grid
    rerender({ api: asGridApi(createMockGridApi()) })
    await waitForEffects()

    expect(result.current.activeViewId).toBeNull()
    expect(createViewStore(KEY).getActiveViewId()).toBe(id)
  })

  test('a grid that rejects the clear keeps the view active', () => {
    mockGridApi.getFilterModel = vi.fn(() => savedModel)
    const onIssue = vi.fn()
    const { result } = renderSync({ storageKey: KEY, onIssue })

    let id = ''
    act(() => {
      id = result.current.saveView('Engineering')!.id
    })
    act(() => result.current.loadView(id))

    mockGridApi.setFilterModel = vi.fn(() => {
      throw new Error('grid destroyed')
    })
    act(() => result.current.loadView(null))

    // The grid still shows the view, so the view stays active
    expect(result.current.activeViewId).toBe(id)
    expect(createViewStore(KEY).getActiveViewId()).toBe(id)
    expect(issuesOf(onIssue)).toEqual([['GRID_ERROR', 'api']])
  })

  test('a grid that throws in saveView gives GRID_ERROR', () => {
    const onIssue = vi.fn()
    const { result } = renderSync({ storageKey: KEY, onIssue })

    mockGridApi.getFilterModel = vi.fn(() => {
      throw new Error('grid failed')
    })

    let saved: GridView | null | 'unset' = 'unset'
    act(() => {
      saved = result.current.saveView('A')
    })

    expect(saved).toBeNull()
    expect(issuesOf(onIssue)).toEqual([['GRID_ERROR', 'api']])
  })

  test('the check of a filter change reads no storage', async () => {
    const id = createViewStore(KEY).saveView('Seeded', savedModel).id
    mockGridApi.getFilterModel = vi.fn(() => savedModel)
    const { result } = renderSync({ storageKey: KEY })

    act(() => result.current.loadView(id))

    const getItem = vi.spyOn(Storage.prototype, 'getItem')

    await fireFilterChanged()

    expect(getItem).not.toHaveBeenCalled()
    expect(result.current.activeViewId).toBe(id)
  })
})

describe('useGridUrlSync: a storageKey change on a grid fake (#226)', () => {
  test('restores the stored view when storageKey comes after the first render', async () => {
    mockGridApi.getFilterModel = vi.fn(() => savedModel)

    const id = createViewStore('tenant-b').saveView(
      'Engineering',
      savedModel
    ).id

    type Props = { storageKey?: string | undefined }

    const initialProps: Props = { storageKey: undefined }

    // The key is not known yet, as with an async tenant id
    const { result, rerender } = renderHook(
      (props: Props) =>
        useGridUrlSync({
          api: asGridApi(mockGridApi),
          storageKey: props.storageKey
        }),
      { initialProps }
    )

    await waitForEffects()

    expect(result.current.activeViewId).toBeNull()

    rerender({ storageKey: 'tenant-b' })
    await waitForEffects()

    expect(result.current.views).toHaveLength(1)
    expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)
    expect(result.current.activeViewId).toBe(id)
  })

  test('a change to a namespace with no views keeps the grid', async () => {
    mockGridApi.getFilterModel = vi.fn(() => savedModel)
    createViewStore('tenant-a').saveView('Engineering', savedModel)

    const { result, rerender } = renderHook(
      (props: { storageKey: string }) =>
        useGridUrlSync({
          api: asGridApi(mockGridApi),
          storageKey: props.storageKey
        }),
      { initialProps: { storageKey: 'tenant-a' } }
    )

    await waitForEffects()
    expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)

    // A hand edit: no namespace has these filters
    mockGridApi.getFilterModel = vi.fn(() => ({
      salary: { filterType: 'number', type: 'greaterThan', filter: 120000 }
    }))
    vi.mocked(mockGridApi.setFilterModel).mockClear()

    // tenant-b has no stored view, and the URL has no filters
    rerender({ storageKey: 'tenant-b' })
    await waitForEffects()

    expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()
    expect(result.current.views).toEqual([])
    expect(result.current.activeViewId).toBeNull()
  })

  test('keeps the grid when storageKey changes to undefined', async () => {
    mockGridApi.getFilterModel = vi.fn(() => savedModel)
    createViewStore('tenant-b').saveView('Engineering', savedModel)

    type Props = { storageKey?: string | undefined }

    const initialProps: Props = { storageKey: 'tenant-b' }

    const { rerender } = renderHook(
      (props: Props) =>
        useGridUrlSync({
          api: asGridApi(mockGridApi),
          storageKey: props.storageKey
        }),
      { initialProps }
    )

    await waitForEffects()

    expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)

    vi.mocked(mockGridApi.setFilterModel).mockClear()

    // Views turned off, or the key went at logout. The URL has no filters,
    // so an apply would clear the grid with nothing to put back.
    rerender({ storageKey: undefined })
    await waitForEffects()

    expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()
  })
})

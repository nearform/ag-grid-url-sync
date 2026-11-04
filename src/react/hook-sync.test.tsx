import { StrictMode } from 'react'
import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'
import type { UseAGGridUrlSyncOptions } from './types.js'
import * as classModule from '../core/ag-grid-url-sync.js'
import { createViewStore } from '../core/view-storage.js'
import {
  asGridApi,
  createGridListeners,
  waitForEffects
} from '../test-helpers.js'

// The hook reads its state from createGridUrlSync (#222): options take effect
// after mount, the returned object is stable, and a destroyed grid is like no
// grid.

const ANN: FilterModel = {
  name: { filterType: 'text', type: 'contains', filter: 'ann' }
}

const BAD: FilterModel = {
  age: { filterType: 'number', type: 'unknownOperation', filter: 1 }
}

function createGrid(initial: FilterModel = {}) {
  let model = initial
  let destroyed = false
  const listeners = createGridListeners()

  const api = {
    getFilterModel: vi.fn(() => model),
    setFilterModel: vi.fn(),
    isDestroyed: () => destroyed,
    addEventListener: listeners.addEventListener,
    removeEventListener: listeners.removeEventListener
  }

  return {
    api,
    listeners,
    setModel: (next: FilterModel) => {
      model = next
    },
    fireFilterChanged: () =>
      act(() => listeners.fire('filterChanged', { source: 'api' })),
    destroyGrid: () =>
      act(() => {
        listeners.fire('gridPreDestroyed')
        destroyed = true
      })
  }
}

/** Sets the page URL on test-setup's location mock */
function setPage(search: string): void {
  Object.assign(window.location, {
    href: `https://example.com/${search}`,
    search
  })
}

type Props = {
  grid: ReturnType<typeof createGrid>
  options: UseAGGridUrlSyncOptions
}

const useSync = ({ grid, options }: Props) =>
  useAGGridUrlSync(asGridApi(grid.api), options)

function renderSync(props: Props) {
  return renderHook(useSync, { initialProps: props })
}

function renderStrict(props: Props) {
  return renderHook(useSync, { initialProps: props, wrapper: StrictMode })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('options after mount (#222)', () => {
  test('uses a new paramPrefix after mount', async () => {
    const grid = createGrid(ANN)

    const { result, rerender } = renderSync({
      grid,
      options: { paramPrefix: 'f_' }
    })

    await waitForEffects()

    rerender({ grid, options: { paramPrefix: 'g_' } })
    await waitForEffects()

    expect(result.current.currentUrl).toContain('g_name_contains=ann')
    expect(result.current.currentUrl).not.toContain('f_name')
  })

  test('does not apply the URL again when an option changes', async () => {
    setPage('?f_name_contains=ann')
    const grid = createGrid()

    const { rerender } = renderSync({
      grid,
      options: { autoApplyOnMount: true }
    })

    await waitForEffects()
    const writes = grid.api.setFilterModel.mock.calls.length

    rerender({ grid, options: { autoApplyOnMount: true, paramPrefix: 'g_' } })
    await waitForEffects()

    // The URL was applied one time, on mount
    expect(writes).toBe(1)
    expect(grid.api.setFilterModel).toHaveBeenCalledWith(ANN)
    expect(grid.api.setFilterModel).toHaveBeenCalledTimes(writes)
  })

  test('makes no new sync for a new options object with the same values', async () => {
    const grid = createGrid()
    const { rerender } = renderSync({ grid, options: { paramPrefix: 'f_' } })
    await waitForEffects()
    const adds = grid.listeners.addEventListener.mock.calls.length

    rerender({ grid, options: { paramPrefix: 'f_' } })
    await waitForEffects()

    expect(grid.listeners.count('gridPreDestroyed')).toBe(1)
    expect(grid.listeners.addEventListener).toHaveBeenCalledTimes(adds)
  })

  test('returns the same object across renders', async () => {
    const grid = createGrid()

    const { result, rerender } = renderSync({
      grid,
      options: { paramPrefix: 'f_', onParseError: () => {} }
    })

    await waitForEffects()
    const first = result.current

    rerender({ grid, options: { paramPrefix: 'f_', onParseError: () => {} } })
    await waitForEffects()

    expect(result.current).toBe(first)
  })

  test('uses a new onParseError from a later render', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const grid = createGrid()
    const { rerender } = renderSync({ grid, options: { onParseError: first } })
    await waitForEffects()

    rerender({ grid, options: { onParseError: second } })
    await waitForEffects()
    grid.setModel(BAD)
    grid.fireFilterChanged()

    expect(second).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
  })

  test('keeps activeViewId when an option changes', async () => {
    const grid = createGrid(ANN)

    const { result, rerender } = renderSync({
      grid,
      options: { storageKey: 'hook-sync-views' }
    })

    await waitForEffects()
    let id = ''

    act(() => {
      id = result.current.saveView('v')!.id
    })

    rerender({
      grid,
      options: { storageKey: 'hook-sync-views', paramPrefix: 'g_' }
    })
    await waitForEffects()

    expect(result.current.activeViewId).toBe(id)
  })

  test('an option change does not load a view that another tab deleted', async () => {
    const onError = vi.fn()
    const grid = createGrid(ANN)
    const options = { storageKey: 'hook-sync-views', onError }
    const { result, rerender } = renderSync({ grid, options })
    await waitForEffects()
    let id = ''

    act(() => {
      id = result.current.saveView('v')!.id
    })
    createViewStore('hook-sync-views').deleteView(id)
    const writes = grid.api.setFilterModel.mock.calls.length

    rerender({ grid, options: { ...options, paramPrefix: 'g_' } })
    await waitForEffects()

    expect(onError).not.toHaveBeenCalled()
    expect(grid.api.setFilterModel).toHaveBeenCalledTimes(writes)
  })

  test('a new autoApplyOnMount value makes no new sync', async () => {
    setPage('?f_name_contains=ann')
    const grid = createGrid()

    const { rerender } = renderSync({
      grid,
      options: { autoApplyOnMount: true }
    })

    await waitForEffects()
    const adds = grid.listeners.addEventListener.mock.calls.length
    const writes = grid.api.setFilterModel.mock.calls.length

    rerender({ grid, options: { autoApplyOnMount: false } })
    await waitForEffects()

    expect(grid.listeners.addEventListener).toHaveBeenCalledTimes(adds)
    expect(grid.api.setFilterModel).toHaveBeenCalledTimes(writes)
  })

  test('resets for a new grid when the grid and an option change together', async () => {
    setPage('?f_name_contains=ann')
    const oldGrid = createGrid()
    const newGrid = createGrid()

    const { rerender } = renderSync({
      grid: oldGrid,
      options: { autoApplyOnMount: true }
    })

    await waitForEffects()

    rerender({
      grid: newGrid,
      options: { autoApplyOnMount: true, paramPrefix: 'g_' }
    })
    await waitForEffects()

    expect(oldGrid.listeners.count('gridPreDestroyed')).toBe(0)
    expect(newGrid.listeners.count('gridPreDestroyed')).toBe(1)
    // The URL is applied to each grid. With the g_ prefix the URL has no
    // filters, so the new grid is cleared.
    expect(oldGrid.api.setFilterModel).toHaveBeenCalledWith(ANN)
    expect(newGrid.api.setFilterModel).toHaveBeenCalledWith({})
  })

  test('makes one live sync in StrictMode', async () => {
    const grid = createGrid()
    const { result } = renderStrict({ grid, options: {} })
    await waitForEffects()

    expect(grid.listeners.count('gridPreDestroyed')).toBe(1)
    expect(result.current.isReady).toBe(true)
  })

  test('removes all grid listeners on unmount', async () => {
    const grid = createGrid()
    const { unmount } = renderSync({ grid, options: {} })
    await waitForEffects()

    unmount()

    expect(grid.listeners.count('filterChanged')).toBe(0)
    expect(grid.listeners.count('gridPreDestroyed')).toBe(0)
  })

  test('keeps updating when onParseError throws', async () => {
    const reportError = vi.fn()
    vi.stubGlobal('reportError', reportError)
    const thrown = new Error('app handler failed')
    const grid = createGrid(BAD)

    const { result } = renderSync({
      grid,
      options: {
        onParseError: () => {
          throw thrown
        }
      }
    })

    await waitForEffects()
    grid.setModel(ANN)
    grid.fireFilterChanged()

    expect(result.current.currentUrl).toContain('f_name_contains=ann')
    expect(reportError).toHaveBeenCalledOnce()
    expect(reportError).toHaveBeenCalledWith(thrown)
  })
})

describe('grid destroyed (#222)', () => {
  test('isReady is false after the grid is destroyed', async () => {
    const grid = createGrid(ANN)
    const { result } = renderSync({ grid, options: {} })
    await waitForEffects()

    grid.destroyGrid()

    expect(result.current.isReady).toBe(false)
    expect(result.current.currentUrl).toBe('')
    expect(result.current.hasFilters).toBe(false)
  })

  test('reports NOT_READY for an operation on a destroyed grid', async () => {
    const onError = vi.fn()
    const grid = createGrid()
    const { result } = renderSync({ grid, options: { onError } })
    await waitForEffects()

    grid.destroyGrid()
    act(() => result.current.applyUrlFilters('?f_a_contains=b'))

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_READY' }),
      'apply-url-filters'
    )
    expect(grid.api.setFilterModel).not.toHaveBeenCalled()
  })

  test('a grid destroyed before mount reports NOT_READY as initialization', async () => {
    const onError = vi.fn()
    const grid = createGrid()
    grid.destroyGrid()

    renderSync({ grid, options: { autoApplyOnMount: true, onError } })
    await waitForEffects()

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_READY' }),
      'initialization'
    )
    expect(onError).not.toHaveBeenCalledWith(
      expect.anything(),
      'auto-apply-filters'
    )
  })

  test('is ready again with a new grid after the old one is destroyed', async () => {
    const grid = createGrid()
    const { result, rerender } = renderSync({ grid, options: {} })
    await waitForEffects()

    grid.destroyGrid()

    expect(result.current.isReady).toBe(false)

    rerender({ grid: createGrid(), options: {} })
    await waitForEffects()

    expect(result.current.isReady).toBe(true)
  })
})

describe('getSerializationMode (#222)', () => {
  test('returns grouped for serialization grouped', async () => {
    const grid = createGrid()

    const { result } = renderSync({
      grid,
      options: { serialization: 'grouped' }
    })

    await waitForEffects()

    expect(result.current.getSerializationMode()).toBe('grouped')
  })

  test('returns individual by default', async () => {
    const { result } = renderSync({ grid: createGrid(), options: {} })
    await waitForEffects()

    expect(result.current.getSerializationMode()).toBe('individual')
  })

  test('getCurrentFormat returns the same as getSerializationMode', async () => {
    const { result } = renderSync({
      grid: createGrid(),
      options: { serialization: 'grouped' }
    })

    await waitForEffects()

    expect(result.current.getCurrentFormat()).toBe(
      result.current.getSerializationMode()
    )
  })
})

// Final review of #222: the sync strips the param names that the app set for
// both modes, the same as the class (I-1), and a sync made again on a
// destroyed grid is still not ready (I-2)
describe('final review (#222)', () => {
  test('keeps the page params of the other mode in grouped mode', async () => {
    setPage('?f_section=2&tab=1')

    const { result } = renderSync({
      grid: createGrid(ANN),
      options: { serialization: 'grouped', paramPrefix: 'gridf_' }
    })

    await waitForEffects()

    expect(result.current.currentUrl).toContain('f_section=2')
    expect(result.current.currentUrl).toBe(result.current.shareUrl())
  })

  test('keeps the page params of the other mode in individual mode', async () => {
    setPage('?grid_filters=keep&tab=1')

    const { result } = renderSync({
      grid: createGrid(ANN),
      options: { groupedParam: 'gf' }
    })

    await waitForEffects()

    expect(result.current.currentUrl).toContain('grid_filters=keep')
    expect(result.current.currentUrl).toBe(result.current.shareUrl())
  })

  test('reports NOT_READY after an option change on a destroyed grid', async () => {
    const onError = vi.fn()
    const grid = createGrid()

    const { result, rerender } = renderSync({
      grid,
      options: { paramPrefix: 'f_', onError }
    })

    await waitForEffects()
    grid.destroyGrid()
    rerender({ grid, options: { paramPrefix: 'g_', onError } })
    await waitForEffects()
    onError.mockClear()

    act(() => result.current.applyUrlFilters('?g_name_contains=ann'))

    expect(result.current.isReady).toBe(false)
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_READY' }),
      'apply-url-filters'
    )
    expect(grid.api.setFilterModel).not.toHaveBeenCalled()
  })
})

// The hook's saved views come from createGridUrlSync (#223). With no sync,
// `views` still shows what is in storage.
describe('saved views on the core (#223)', () => {
  const KEY = 'hook-sync-core-views'

  /** Puts 2 views in the store, as an earlier session did */
  function storeTwoViews(): void {
    const store = createViewStore(KEY)
    store.saveView('A', ANN)
    store.saveView('B', {})
  }

  test('views lists the stored views before the grid is ready', async () => {
    storeTwoViews()

    const { result } = renderHook(() =>
      useAGGridUrlSync(null, { storageKey: KEY })
    )

    await waitForEffects()

    expect(result.current.views).toHaveLength(2)
    expect(result.current.activeViewId).toBeNull()
  })

  test('views lists the stored views with enabledWhenReady: false', async () => {
    storeTwoViews()

    const { result } = renderSync({
      grid: createGrid(),
      options: { storageKey: KEY, enabledWhenReady: false }
    })

    await waitForEffects()

    expect(result.current.views).toHaveLength(2)
    expect(result.current.isReady).toBe(false)
  })

  test('makes no AGGridUrlSync', async () => {
    const made = vi.spyOn(classModule, 'AGGridUrlSync')

    renderSync({
      grid: createGrid(ANN),
      options: { storageKey: KEY, autoApplyOnMount: true }
    })

    await waitForEffects()

    expect(made).not.toHaveBeenCalled()
  })
})

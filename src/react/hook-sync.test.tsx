import { StrictMode } from 'react'
import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { useGridUrlSync } from './use-grid-url-sync.js'
import type { UseGridUrlSyncOptions } from './types.js'
import { individual } from '../core/codecs.js'
import { createViewStore } from '../core/view-storage.js'
import {
  asGridApi,
  createGridListeners,
  waitForEffects
} from '../test-helpers.js'

// The hook reads its state from the core sync (#222): options take effect
// after mount, the result is stable, and a destroyed grid is like no grid.
// On a grid fake, so a test controls each grid call.

const ANN: FilterModel = {
  name: { filterType: 'text', type: 'contains', filter: 'ann' }
}

const BAD: FilterModel = {
  age: { filterType: 'number', type: 'equals', filter: 'abc' }
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

type Grid = ReturnType<typeof createGrid>

/** Sets the page URL on test-setup's location mock */
function setPage(search: string): void {
  Object.assign(window.location, {
    href: `https://example.com/${search}`,
    search
  })
}

/** The code and the source of each issue that onIssue got */
const issuesOf = (onIssue: ReturnType<typeof vi.fn>) =>
  onIssue.mock.calls.map(([event]) => [event.issue.code, event.source])

type Props = {
  grid: Grid | null
  options: Omit<UseGridUrlSyncOptions, 'api'>
}

const useSync = ({ grid, options }: Props) =>
  useGridUrlSync({ api: grid ? asGridApi(grid.api) : null, ...options })

function renderSync(props: Props) {
  return renderHook(useSync, { initialProps: props })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useGridUrlSync: start and stop (#226)', () => {
  test('becomes active when the grid api arrives', async () => {
    const { result, rerender } = renderSync({ grid: null, options: {} })

    expect(result.current.status).toBe('idle')

    rerender({ grid: createGrid(), options: {} })
    await waitForEffects()

    expect(result.current.status).toBe('active')
  })

  test('a failed apply on create is reported one time and not done again on a render', async () => {
    setPage('?f_name_contains=ann')
    const failure = new Error('cannot apply')
    const grid = createGrid()
    grid.api.setFilterModel.mockImplementationOnce(() => {
      throw failure
    })
    const onIssue = vi.fn()

    // A new options object and a new onIssue on each render
    const { rerender } = renderHook(() =>
      useGridUrlSync({
        api: asGridApi(grid.api),
        onIssue: event => onIssue(event)
      })
    )

    await waitForEffects()
    rerender()
    rerender()
    await waitForEffects()

    expect(grid.api.setFilterModel).toHaveBeenCalledTimes(1)
    expect(issuesOf(onIssue)).toEqual([['GRID_ERROR', 'url']])
    expect(onIssue.mock.calls[0]?.[0].issue.cause).toBe(failure)
  })

  test('a grid that cannot take a listener is reported, not thrown (#286)', () => {
    const grid = createGrid()
    grid.api.addEventListener = vi.fn(() => {
      throw new Error('Initialization failed')
    })
    const onIssue = vi.fn()

    const { result } = renderSync({ grid, options: { onIssue } })

    expect(result.current.status).not.toBe('active')
    expect(onIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        issue: expect.objectContaining({ message: 'Initialization failed' })
      })
    )
  })

  test('getUrl reports INVALID_URL for a page URL that does not parse', async () => {
    const onIssue = vi.fn()
    const { result } = renderSync({ grid: createGrid(), options: { onIssue } })
    await waitForEffects()

    Object.defineProperty(window.location, 'href', {
      value: 'not a url',
      configurable: true
    })

    expect(() => result.current.getUrl()).not.toThrow()
    expect(issuesOf(onIssue)).toEqual([['INVALID_URL', 'api']])
  })

  test('writes nothing to the console when no onIssue is set', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const notReady = renderSync({ grid: null, options: {} })
    act(() => {
      notReady.result.current.applyFilters({})
    })

    const grid = createGrid()
    renderSync({ grid, options: {} })
    await waitForEffects()

    grid.api.getFilterModel.mockImplementation(() => {
      throw new Error('grid failed')
    })
    grid.fireFilterChanged()

    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
  })

  test('removes all grid listeners on unmount', async () => {
    const grid = createGrid()
    const { unmount } = renderSync({ grid, options: {} })
    await waitForEffects()

    unmount()

    expect(grid.listeners.count('filterChanged')).toBe(0)
    expect(grid.listeners.count('gridPreDestroyed')).toBe(0)
  })
})

describe('options after mount (#222)', () => {
  test('uses a new codec prefix after mount', async () => {
    const grid = createGrid(ANN)

    const { result, rerender } = renderSync({
      grid,
      options: { codec: individual({ prefix: 'f_' }) }
    })

    await waitForEffects()

    rerender({ grid, options: { codec: individual({ prefix: 'g_' }) } })
    await waitForEffects()

    expect(result.current.url).toContain('g_name_contains=ann')
    expect(result.current.url).not.toContain('f_name')
  })

  test('returns the same object across renders with inline options', async () => {
    const grid = createGrid()

    const { result, rerender } = renderSync({
      grid,
      options: { codec: individual({ prefix: 'f_' }), onIssue: () => {} }
    })

    await waitForEffects()
    const first = result.current

    rerender({
      grid,
      options: { codec: individual({ prefix: 'f_' }), onIssue: () => {} }
    })
    await waitForEffects()

    expect(result.current).toBe(first)
  })

  test('an option change does not load a view that another tab deleted', async () => {
    const onIssue = vi.fn()
    const grid = createGrid(ANN)
    const options = { storageKey: 'hook-sync-views', onIssue }
    const { result, rerender } = renderSync({ grid, options })
    await waitForEffects()
    let id = ''

    act(() => {
      id = result.current.saveView('v')!.id
    })
    createViewStore('hook-sync-views').deleteView(id)
    const writes = grid.api.setFilterModel.mock.calls.length

    rerender({ grid, options: { ...options, history: 'replace' } })
    await waitForEffects()

    expect(onIssue).not.toHaveBeenCalled()
    expect(grid.api.setFilterModel).toHaveBeenCalledTimes(writes)
  })

  test('a new applyUrlOnCreate value makes no new sync', async () => {
    setPage('?f_name_contains=ann')
    const grid = createGrid()

    const { rerender } = renderSync({
      grid,
      options: { applyUrlOnCreate: true }
    })

    await waitForEffects()
    const adds = grid.listeners.addEventListener.mock.calls.length
    const writes = grid.api.setFilterModel.mock.calls.length

    rerender({ grid, options: { applyUrlOnCreate: false } })
    await waitForEffects()

    expect(grid.listeners.addEventListener).toHaveBeenCalledTimes(adds)
    expect(grid.api.setFilterModel).toHaveBeenCalledTimes(writes)
  })

  test('starts again for a new grid when the grid and an option change together', async () => {
    setPage('?f_name_contains=ann&g_name_contains=bob')
    const oldGrid = createGrid()
    const newGrid = createGrid()

    const { rerender } = renderSync({ grid: oldGrid, options: {} })

    await waitForEffects()

    rerender({
      grid: newGrid,
      options: { codec: individual({ prefix: 'g_' }) }
    })
    await waitForEffects()

    expect(oldGrid.listeners.count('filterChanged')).toBe(0)
    expect(oldGrid.listeners.count('gridPreDestroyed')).toBe(0)
    expect(newGrid.listeners.count('gridPreDestroyed')).toBe(1)
    // The URL is applied to each grid, with the codec of its sync
    expect(oldGrid.api.setFilterModel).toHaveBeenCalledWith(ANN)
    expect(newGrid.api.setFilterModel).toHaveBeenCalledWith({
      name: { filterType: 'text', type: 'contains', filter: 'bob' }
    })
  })

  test('keeps updating when onIssue throws', async () => {
    const reportError = vi.fn()
    vi.stubGlobal('reportError', reportError)
    const thrown = new Error('app handler failed')
    const grid = createGrid(BAD)

    const { result } = renderSync({
      grid,
      options: {
        onIssue: () => {
          throw thrown
        }
      }
    })

    await waitForEffects()
    grid.setModel(ANN)
    grid.fireFilterChanged()

    expect(result.current.url).toContain('f_name_contains=ann')
    expect(reportError).toHaveBeenCalledOnce()
    expect(reportError).toHaveBeenCalledWith(thrown)
  })
})

describe('grid destroyed (#222)', () => {
  test('a grid destroyed before mount reports NOT_READY one time', async () => {
    const onIssue = vi.fn()
    const grid = createGrid()
    grid.destroyGrid()

    const { result } = renderSync({ grid, options: { onIssue } })
    await waitForEffects()

    expect(issuesOf(onIssue)).toEqual([['NOT_READY', 'api']])
    expect(grid.api.setFilterModel).not.toHaveBeenCalled()
    expect(result.current.status).toBe('destroyed')
  })

  test('is active again with a new grid after the old one is destroyed', async () => {
    const grid = createGrid()
    const { result, rerender } = renderSync({ grid, options: {} })
    await waitForEffects()

    grid.destroyGrid()

    expect(result.current.status).toBe('destroyed')

    rerender({ grid: createGrid(), options: {} })
    await waitForEffects()

    expect(result.current.status).toBe('active')
  })
})

describe('saved views on the core (#223)', () => {
  const KEY = 'hook-sync-core-views'

  test('views lists the stored views with enabled: false', async () => {
    const store = createViewStore(KEY)
    store.saveView('A', { filterModel: ANN })
    store.saveView('B', { filterModel: {} })

    const { result } = renderSync({
      grid: createGrid(),
      options: { storageKey: KEY, enabled: false }
    })

    await waitForEffects()

    expect(result.current.views).toHaveLength(2)
    expect(result.current.status).toBe('idle')
  })
})

// The stored pointer after a hand edit, as in 0.5.1 (#223 review)
describe('the stored pointer after a hand edit', () => {
  const KEY = 'hook-sync-pointer'

  const OTHER: FilterModel = {
    name: { filterType: 'text', type: 'contains', filter: 'bob' }
  }

  test('a pointer write that fails has the source grid', async () => {
    const onIssue = vi.fn()
    const grid = createGrid(ANN)

    const { result } = renderSync({
      grid,
      options: { storageKey: KEY, onIssue }
    })

    await waitForEffects()
    act(() => {
      result.current.saveView('v')
    })

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    grid.setModel(OTHER)
    grid.fireFilterChanged()

    expect(result.current.activeViewId).toBeNull()
    expect(issuesOf(onIssue)).toEqual([['STORAGE_FULL', 'grid']])
  })
})

describe('StrictMode (#222)', () => {
  test('makes one live sync', async () => {
    const grid = createGrid()

    const { result } = renderHook(useSync, {
      initialProps: { grid, options: {} },
      wrapper: StrictMode
    })

    await waitForEffects()

    expect(grid.listeners.count('gridPreDestroyed')).toBe(1)
    expect(result.current.status).toBe('active')
  })
})

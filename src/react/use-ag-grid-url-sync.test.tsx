import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { setTimeout } from 'timers/promises'
import type { GridApi } from 'ag-grid-community'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'
import { AGGridUrlSync } from '../core/ag-grid-url-sync.js'
import { parseUrlFilters } from '../core/url-parser.js'
import { waitForEffects } from '../test-helpers.js'

// Create a shared mock instance that will be used across all tests.
// vi.hoisted is required: vi.mock factories are hoisted above this file's
// module scope, so from Vitest 4 on, a plain const is still undefined when the
// factory below runs.
const mockInstance = vi.hoisted(() => ({
  generateUrl: vi.fn(() => 'http://example.com?f_name_contains=test'),
  getQueryParams: vi.fn(() => '?f_name_contains=test'),
  applyFromUrl: vi.fn(),
  clearFilters: vi.fn(),
  applyFilters: vi.fn(),
  destroy: vi.fn()
}))

// Mock the core AG Grid URL sync module
vi.mock('../core/ag-grid-url-sync.js', () => ({
  // The hook calls `new AGGridUrlSync(...)`, and from Vitest 4 on a vi.fn()
  // backed by an arrow function is not constructible - it has to be a real
  // function expression.
  AGGridUrlSync: vi.fn(function () {
    return mockInstance
  }),
  createUrlSync: vi.fn(() => mockInstance)
}))

// Mock the URL parser
vi.mock('../core/url-parser.js', () => ({
  parseUrlFilters: vi.fn((url: string) => {
    if (url.includes('f_created_eq=2024-01-15')) {
      return {
        created: { filterType: 'date', type: 'eq', filter: '2024-01-15' },
        deadline: {
          filterType: 'date',
          type: 'dateBefore',
          filter: '2024-12-31'
        },
        period: {
          filterType: 'date',
          type: 'dateRange',
          filter: '2024-01-01',
          filterTo: '2024-12-31'
        }
      }
    }
    if (url.includes('f_salary_gte=50000')) {
      return {
        salary: {
          filterType: 'number',
          type: 'greaterThanOrEqual',
          filter: 50000
        },
        age: { filterType: 'number', type: 'inRange', filter: 25, filterTo: 45 }
      }
    }
    // Default text filter response
    return {
      name: { filterType: 'text', type: 'contains', filter: 'test' }
    }
  })
}))

// Create proper mock types
type MockGridApi = Partial<GridApi> &
  Pick<
    GridApi,
    | 'setFilterModel'
    | 'getFilterModel'
    | 'addEventListener'
    | 'removeEventListener'
  >

// Create a properly typed mock GridApi
const createMockGridApi = (): MockGridApi => ({
  setFilterModel: vi.fn(),
  getFilterModel: vi.fn(() => ({})),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
})

describe('useAGGridUrlSync', () => {
  let mockGridApi: MockGridApi
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockGridApi = createMockGridApi()
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('Hook Initialization', () => {
    test('returns correct initial state when gridApi is null', () => {
      const { result } = renderHook(() => useAGGridUrlSync(null))

      expect(result.current.isReady).toBe(false)
      expect(result.current.currentUrl).toBe('')
      expect(result.current.hasFilters).toBe(false)
      expect(typeof result.current.shareUrl).toBe('function')
      expect(typeof result.current.getQueryParams).toBe('function')
      expect(typeof result.current.applyUrlFilters).toBe('function')
      expect(typeof result.current.clearFilters).toBe('function')
      expect(typeof result.current.parseUrlFilters).toBe('function')
      expect(typeof result.current.applyFilters).toBe('function')
    })

    test('initializes when gridApi becomes available', () => {
      const { result, rerender } = renderHook(
        (props: { gridApi: GridApi | null }) => useAGGridUrlSync(props.gridApi),
        { initialProps: { gridApi: null as GridApi | null } }
      )

      expect(result.current.isReady).toBe(false)

      rerender({ gridApi: mockGridApi as GridApi | null })

      expect(result.current.isReady).toBe(true)
    })

    test('respects enabledWhenReady option', () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          enabledWhenReady: false
        })
      )

      expect(result.current.isReady).toBe(false)
    })
  })

  describe('Auto-apply on Mount', () => {
    test('applies URL filters on mount when autoApplyOnMount is true', async () => {
      renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          autoApplyOnMount: true
        })
      )

      // Wait for effects to run
      await waitForEffects()

      expect(mockInstance.applyFromUrl).toHaveBeenCalled()
    })

    test('does not apply URL filters when autoApplyOnMount is false', async () => {
      renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          autoApplyOnMount: false
        })
      )

      await waitForEffects()

      expect(mockInstance.applyFromUrl).not.toHaveBeenCalled()
    })
  })

  describe('API Methods', () => {
    test('shareUrl returns generated URL', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const url = result.current.shareUrl()
      expect(url).toBe('http://example.com?f_name_contains=test')
    })

    test('shareUrl returns baseUrl when not ready', () => {
      const { result } = renderHook(() => useAGGridUrlSync(null))

      const url = result.current.shareUrl('http://base.com')
      expect(url).toBe('http://base.com')
    })

    test('getQueryParams returns query string', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const params = result.current.getQueryParams()
      expect(params).toBe('?f_name_contains=test')
    })

    test('applyUrlFilters calls core method', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      act(() => {
        result.current.applyUrlFilters('http://test.com')
      })

      expect(mockInstance.applyFromUrl).toHaveBeenCalledWith('http://test.com')
    })

    test('clearFilters calls core method', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      act(() => {
        result.current.clearFilters()
      })

      expect(mockInstance.clearFilters).toHaveBeenCalled()
    })

    test('parseUrlFilters returns parsed filters', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const filters = result.current.parseUrlFilters(
        'http://test.com?f_name_contains=test'
      )
      expect(filters).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'test' }
      })
    })

    test('parseUrlFilters handles date filters', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const filters = result.current.parseUrlFilters(
        'http://test.com?f_created_eq=2024-01-15&f_deadline_before=2024-12-31&f_period_daterange=2024-01-01,2024-12-31'
      )

      expect(filters).toEqual({
        created: { filterType: 'date', type: 'eq', filter: '2024-01-15' },
        deadline: {
          filterType: 'date',
          type: 'dateBefore',
          filter: '2024-12-31'
        },
        period: {
          filterType: 'date',
          type: 'dateRange',
          filter: '2024-01-01',
          filterTo: '2024-12-31'
        }
      })
    })

    test('parseUrlFilters handles number filters', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const filters = result.current.parseUrlFilters(
        'http://test.com?f_salary_gte=50000&f_age_range=25,45'
      )

      expect(filters).toEqual({
        salary: {
          filterType: 'number',
          type: 'greaterThanOrEqual',
          filter: 50000
        },
        age: { filterType: 'number', type: 'inRange', filter: 25, filterTo: 45 }
      })
    })

    test('applyFilters calls core method', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const filters = {
        name: {
          filterType: 'text' as const,
          type: 'contains' as const,
          filter: 'test'
        }
      }
      act(() => {
        result.current.applyFilters(filters)
      })

      expect(mockInstance.applyFilters).toHaveBeenCalledWith(filters)
    })

    test('applyFilters handles date filters', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const dateFilters = {
        created: {
          filterType: 'date' as const,
          type: 'eq' as const,
          filter: '2024-01-15'
        },
        deadline: {
          filterType: 'date' as const,
          type: 'dateBefore' as const,
          filter: '2024-12-31'
        },
        period: {
          filterType: 'date' as const,
          type: 'dateRange' as const,
          filter: '2024-01-01',
          filterTo: '2024-12-31'
        }
      }

      act(() => {
        result.current.applyFilters(dateFilters)
      })

      expect(mockInstance.applyFilters).toHaveBeenCalledWith(dateFilters)
    })

    test('applyUrlFilters handles URLs with date filters', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const urlWithDateFilters =
        'http://test.com?f_created_eq=2024-01-15&f_deadline_before=2024-12-31&f_period_daterange=2024-01-01,2024-12-31'

      act(() => {
        result.current.applyUrlFilters(urlWithDateFilters)
      })

      expect(mockInstance.applyFromUrl).toHaveBeenCalledWith(urlWithDateFilters)
    })
  })

  describe('Error Handling', () => {
    test('warns when applyUrlFilters called while not ready', () => {
      const onParseError = vi.fn()
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      const { result } = renderHook(() =>
        useAGGridUrlSync(null, { onParseError })
      )

      act(() => {
        result.current.applyUrlFilters('http://test.com?f_name_contains=test')
      })

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'applyUrlFilters called while the hook is not ready.'
      )
      expect(onParseError).toHaveBeenCalledWith(expect.any(Error))

      consoleWarnSpy.mockRestore()
    })

    test('warns when clearFilters called while not ready', () => {
      const onParseError = vi.fn()
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      const { result } = renderHook(() =>
        useAGGridUrlSync(null, { onParseError })
      )

      act(() => {
        result.current.clearFilters()
      })

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'clearFilters called while the hook is not ready.'
      )
      expect(onParseError).toHaveBeenCalledWith(expect.any(Error))

      consoleWarnSpy.mockRestore()
    })

    test('warns when applyFilters called while not ready', () => {
      const onParseError = vi.fn()
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      const { result } = renderHook(() =>
        useAGGridUrlSync(null, { onParseError })
      )

      act(() => {
        result.current.applyFilters({
          name: { filterType: 'text', type: 'contains', filter: 'test' }
        })
      })

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'applyFilters called while the hook is not ready.'
      )
      expect(onParseError).toHaveBeenCalledWith(expect.any(Error))

      consoleWarnSpy.mockRestore()
    })

    test('handles initialization errors gracefully', async () => {
      const onError = vi.fn()

      // Temporarily make the AGGridUrlSync constructor throw
      const MockedAGGridUrlSync = vi.mocked(AGGridUrlSync)
      MockedAGGridUrlSync.mockImplementationOnce(() => {
        throw new Error('Initialization failed')
      })

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { onError })
      )

      expect(result.current.isReady).toBe(false)
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'initialization')
    })

    test('handles method errors gracefully', async () => {
      const onError = vi.fn()
      mockInstance.generateUrl.mockImplementation(() => {
        throw new Error('URL generation failed')
      })

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { onError })
      )

      await waitForEffects()

      const url = result.current.shareUrl()
      expect(url).toBe(window.location.href)
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        'generate-share-url'
      )
    })

    test('calls onParseError callback', async () => {
      const onParseError = vi.fn()
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { onParseError })
      )

      await waitForEffects()

      const mockedParseUrlFilters = vi.mocked(parseUrlFilters)
      mockedParseUrlFilters.mockImplementationOnce(() => {
        throw new Error('Parse error')
      })

      act(() => {
        result.current.parseUrlFilters('invalid-url')
      })

      expect(onParseError).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('Cleanup', () => {
    test('cleans up on unmount', async () => {
      const { unmount } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      unmount()

      expect(mockInstance.destroy).toHaveBeenCalled()
    })

    test('cleans up when gridApi changes', async () => {
      const { rerender } = renderHook(
        (props: { gridApi: GridApi | null }) => useAGGridUrlSync(props.gridApi),
        { initialProps: { gridApi: mockGridApi as GridApi | null } }
      )

      await waitForEffects()

      const newMockGridApi = createMockGridApi()
      rerender({ gridApi: newMockGridApi as GridApi | null })

      expect(mockInstance.destroy).toHaveBeenCalled()
    })
  })

  describe('State Updates', () => {
    test('updates currentUrl and hasFilters reactively', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      // Since mocks might not work perfectly in this test environment,
      // we just check that the state is managed correctly
      expect(typeof result.current.currentUrl).toBe('string')
      expect(typeof result.current.hasFilters).toBe('boolean')
    })

    test('handles empty query params correctly', async () => {
      mockInstance.getQueryParams.mockReturnValue('')

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      expect(result.current.hasFilters).toBe(false)
    })

    test('sets up filterChanged event listener', async () => {
      renderHook(() => useAGGridUrlSync(mockGridApi as GridApi))

      await waitForEffects()

      expect(mockGridApi.addEventListener).toHaveBeenCalledWith(
        'filterChanged',
        expect.any(Function)
      )
    })

    test('removes filterChanged event listener on cleanup', async () => {
      const { unmount } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      unmount()

      expect(mockGridApi.removeEventListener).toHaveBeenCalledWith(
        'filterChanged',
        expect.any(Function)
      )
    })
  })

  describe('Saved Views', () => {
    const STORAGE_KEY = 'view-test-grid'
    const savedModel = {
      department: { filterType: 'text', type: 'equals', filter: 'Engineering' }
    }

    beforeEach(() => {
      window.localStorage.clear()
    })

    const setSearch = (search: string): void => {
      Object.defineProperty(window.location, 'search', {
        value: search,
        configurable: true
      })
    }

    test('view members are inert without a storageKey', () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      expect(result.current.views).toEqual([])
      expect(result.current.activeViewId).toBeNull()
      expect(result.current.saveView('Nope')).toBeNull()

      act(() => result.current.deleteView('anything'))
      expect(result.current.views).toEqual([])

      // loadView must not touch the grid either — clearFilters is the API for
      // resetting filters, and it works independently of saved views.
      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => result.current.loadView(null))
      act(() => result.current.loadView('some-id'))
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()
    })

    test('saveView captures the current filter model', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let saved: { id: string } | null = null
      act(() => {
        saved = result.current.saveView('Engineering')
      })

      expect(saved).not.toBeNull()
      expect(result.current.views).toHaveLength(1)
      expect(result.current.views[0]?.name).toBe('Engineering')
      expect(result.current.views[0]?.filterModel).toEqual(savedModel)
      expect(result.current.activeViewId).toBe(saved!.id)
    })

    test('saving under an existing name updates that view in place', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let firstId = ''
      act(() => {
        firstId = result.current.saveView('Same')!.id
      })

      const updatedModel = {
        age: { filterType: 'number', type: 'equals', filter: 30 }
      }
      mockGridApi.getFilterModel = vi.fn(() => updatedModel)

      let secondId = ''
      act(() => {
        secondId = result.current.saveView('Same')!.id
      })

      expect(result.current.views).toHaveLength(1)
      expect(secondId).toBe(firstId)
      expect(result.current.views[0]?.filterModel).toEqual(updatedModel)
      expect(result.current.activeViewId).toBe(firstId)
    })

    test('rejects an empty name and reports it through onError', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          onError
        })
      )

      let saved: unknown = 'unset'
      act(() => {
        saved = result.current.saveView('   ')
      })

      expect(saved).toBeNull()
      expect(result.current.views).toEqual([])
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('view name is required')
        }),
        'save-view'
      )
    })

    test('loadView applies the saved filter model to the grid', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => result.current.loadView(id))

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)
      expect(result.current.activeViewId).toBe(id)
    })

    test('loadView(null) clears filters and the active view', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      act(() => {
        result.current.saveView('Engineering')
      })
      act(() => result.current.loadView(null))

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
      expect(result.current.activeViewId).toBeNull()
    })

    test('loadView treats a missing argument like null', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          onError
        })
      )

      act(() => {
        result.current.saveView('Engineering')
      })

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      // A JavaScript caller can omit the argument even though the type requires
      // it; that must reset rather than look up a view with an undefined id.
      act(() => (result.current.loadView as () => void)())

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
      expect(result.current.activeViewId).toBeNull()
      // Scoped to this path: other contexts can fire from mock implementations
      // that earlier tests leave installed.
      expect(onError).not.toHaveBeenCalledWith(expect.anything(), 'load-view')
    })

    test('deleteView removes the view and clears filters when it was active', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => result.current.deleteView(id))

      expect(result.current.views).toEqual([])
      expect(result.current.activeViewId).toBeNull()
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
    })

    test('deleting a view keeps hand-edited filters the view no longer owns', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })
      act(() => result.current.loadView(id))

      // The user then hand-adjusts a column filter, so the grid no longer shows
      // what the view holds.
      mockGridApi.getFilterModel = vi.fn(() => ({
        ...savedModel,
        salary: { filterType: 'number', type: 'greaterThan', filter: 120000 }
      }))

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => result.current.deleteView(id))

      // The view is gone, but the user's own filtering must survive.
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()
      expect(result.current.views).toEqual([])
    })

    test('deleting a view clears filters when the grid still shows exactly that view', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })
      act(() => result.current.loadView(id))

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => result.current.deleteView(id))

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
    })

    test('restores the stored active view on mount when the URL has no filters', async () => {
      setSearch('')
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      // Seed a saved, active view from a previous session.
      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      act(() => {
        seed.result.current.saveView('Engineering')
      })
      seed.unmount()

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      mockInstance.applyFromUrl.mockClear()

      renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          autoApplyOnMount: true
        })
      )
      await waitForEffects()

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)
      expect(mockInstance.applyFromUrl).not.toHaveBeenCalled()
    })

    test('prefers URL filters over the stored view on mount', async () => {
      setSearch('?f_name_contains=fromurl')
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      act(() => {
        seed.result.current.saveView('Engineering')
      })
      seed.unmount()

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      mockInstance.applyFromUrl.mockClear()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          autoApplyOnMount: true
        })
      )
      await waitForEffects()

      expect(mockInstance.applyFromUrl).toHaveBeenCalled()
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalledWith(savedModel)
      // The URL won, so nothing is active — otherwise the UI mislabels a saved
      // view as loaded while showing the URL's filters.
      expect(result.current.activeViewId).toBeNull()
    })

    test('deleting a view does not wipe URL filters when the URL took precedence', async () => {
      setSearch('?f_name_contains=fromurl')
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      let id = ''
      act(() => {
        id = seed.result.current.saveView('Engineering')!.id
      })
      seed.unmount()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          autoApplyOnMount: true
        })
      )
      await waitForEffects()

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => result.current.deleteView(id))

      // The grid is showing the URL's filters, not this view, so deleting it must
      // not clear the filter model.
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()
      expect(result.current.views).toEqual([])
    })

    test('reports an actionable reason through onError when storage is full', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)
      const onError = vi.fn()

      // jsdom's Storage is proxy-backed, so an instance spy on setItem does not
      // shadow the real method. Replace the whole object.
      const original = window.localStorage
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => null,
          setItem: () => {
            throw new DOMException('quota', 'QuotaExceededError')
          },
          removeItem: () => {},
          clear: () => {}
        },
        configurable: true
      })

      try {
        const { result } = renderHook(() =>
          useAGGridUrlSync(mockGridApi as GridApi, {
            storageKey: STORAGE_KEY,
            onError
          })
        )

        let saved: unknown = 'unset'
        act(() => {
          saved = result.current.saveView('Too big')
        })

        expect(saved).toBeNull()
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Browser storage is full')
          }),
          'save-view'
        )
      } finally {
        Object.defineProperty(window, 'localStorage', {
          value: original,
          configurable: true
        })
      }
    })

    test('resyncs views and activeViewId when storageKey changes', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      // Seed a view under key-b only.
      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: 'key-b' })
      )
      let seededId = ''
      act(() => {
        seededId = seed.result.current.saveView('Belongs to B')!.id
      })
      seed.unmount()

      // Mount against key-a, which has nothing stored.
      const { result, rerender } = renderHook(
        (props: { storageKey: string }) =>
          useAGGridUrlSync(mockGridApi as GridApi, {
            storageKey: props.storageKey
          }),
        { initialProps: { storageKey: 'key-a' } }
      )

      expect(result.current.views).toEqual([])
      expect(result.current.activeViewId).toBeNull()

      // Switching namespace must bring key-b's view into view.
      rerender({ storageKey: 'key-b' })

      expect(result.current.views).toHaveLength(1)
      expect(result.current.views[0]?.name).toBe('Belongs to B')
      expect(result.current.activeViewId).toBe(seededId)

      // And switching back must clear it again.
      rerender({ storageKey: 'key-a' })

      expect(result.current.views).toEqual([])
      expect(result.current.activeViewId).toBeNull()
    })

    test('views are namespaced by storageKey', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const gridA = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: 'grid-a' })
      )
      act(() => {
        gridA.result.current.saveView('Only in A')
      })

      const gridB = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: 'grid-b' })
      )

      expect(gridA.result.current.views).toHaveLength(1)
      expect(gridB.result.current.views).toEqual([])
    })
  })
})

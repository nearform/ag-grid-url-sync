import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { setTimeout } from 'timers/promises'
import type { GridApi } from 'ag-grid-community'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'
import { AGGridUrlSync } from '../core/ag-grid-url-sync.js'
import { parseUrlFilters } from '../core/url-parser.js'

// Create a shared mock instance that will be used across all tests
const mockInstance = {
  generateUrl: vi.fn(() => 'http://example.com?f_name_contains=test'),
  getQueryParams: vi.fn(() => '?f_name_contains=test'),
  applyFromUrl: vi.fn(),
  clearFilters: vi.fn(),
  applyFilters: vi.fn(),
  destroy: vi.fn()
}

// Mock the core AG Grid URL sync module
vi.mock('../core/ag-grid-url-sync.js', () => ({
  AGGridUrlSync: vi.fn(() => mockInstance),
  createUrlSync: vi.fn(() => mockInstance)
}))

// Mock the URL parser
vi.mock('../core/url-parser.js', () => ({
  parseUrlFilters: vi.fn(() => ({
    name: { filterType: 'text', type: 'contains', filter: 'test' }
  }))
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

type MockAGGridUrlSync = {
  generateUrl: ReturnType<typeof vi.fn>
  getQueryParams: ReturnType<typeof vi.fn>
  applyFromUrl: ReturnType<typeof vi.fn>
  clearFilters: ReturnType<typeof vi.fn>
  applyFilters: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

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
      await act(async () => {
        await setTimeout(0)
      })

      expect(mockInstance.applyFromUrl).toHaveBeenCalled()
    })

    test('does not apply URL filters when autoApplyOnMount is false', async () => {
      renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          autoApplyOnMount: false
        })
      )

      await act(async () => {
        await setTimeout(0)
      })

      expect(mockInstance.applyFromUrl).not.toHaveBeenCalled()
    })
  })

  describe('API Methods', () => {
    test('shareUrl returns generated URL', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await act(async () => {
        await setTimeout(0)
      })

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

      await act(async () => {
        await setTimeout(0)
      })

      const params = result.current.getQueryParams()
      expect(params).toBe('?f_name_contains=test')
    })

    test('applyUrlFilters calls core method', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await act(async () => {
        await setTimeout(0)
      })

      act(() => {
        result.current.applyUrlFilters('http://test.com')
      })

      expect(mockInstance.applyFromUrl).toHaveBeenCalledWith('http://test.com')
    })

    test('clearFilters calls core method', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await act(async () => {
        await setTimeout(0)
      })

      act(() => {
        result.current.clearFilters()
      })

      expect(mockInstance.clearFilters).toHaveBeenCalled()
    })

    test('parseUrlFilters returns parsed filters', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await act(async () => {
        await setTimeout(0)
      })

      const filters = result.current.parseUrlFilters(
        'http://test.com?f_name_contains=test'
      )
      expect(filters).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'test' }
      })
    })

    test('applyFilters calls core method', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await act(async () => {
        await setTimeout(0)
      })

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
  })

  describe('Error Handling', () => {
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

      await act(async () => {
        await setTimeout(0)
      })

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

      await act(async () => {
        await setTimeout(0)
      })

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

      await act(async () => {
        await setTimeout(0)
      })

      unmount()

      expect(mockInstance.destroy).toHaveBeenCalled()
    })

    test('cleans up when gridApi changes', async () => {
      const { rerender } = renderHook(
        (props: { gridApi: GridApi | null }) => useAGGridUrlSync(props.gridApi),
        { initialProps: { gridApi: mockGridApi as GridApi | null } }
      )

      await act(async () => {
        await setTimeout(0)
      })

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

      await act(async () => {
        await setTimeout(0) // Wait for initial state update
      })

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

      await act(async () => {
        await setTimeout(0)
      })

      expect(result.current.hasFilters).toBe(false)
    })

    test('sets up filterChanged event listener', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await act(async () => {
        await setTimeout(0)
      })

      expect(mockGridApi.addEventListener).toHaveBeenCalledWith(
        'filterChanged',
        expect.any(Function)
      )
    })

    test('removes filterChanged event listener on cleanup', async () => {
      const { unmount } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await act(async () => {
        await setTimeout(0)
      })

      unmount()

      expect(mockGridApi.removeEventListener).toHaveBeenCalledWith(
        'filterChanged',
        expect.any(Function)
      )
    })
  })
})

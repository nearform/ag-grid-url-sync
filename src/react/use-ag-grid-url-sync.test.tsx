import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GridApi } from 'ag-grid-community'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'
import { AGGridUrlSync } from '../core/ag-grid-url-sync.js'

// Mock the core AGGridUrlSync class
vi.mock('../core/ag-grid-url-sync.js', () => ({
  AGGridUrlSync: vi.fn()
}))

// Mock window.location
Object.defineProperty(window, 'location', {
  value: { href: 'http://localhost:3000' },
  writable: true
})

describe('useAGGridUrlSync Hook - Event-Driven Architecture', () => {
  let mockGridApi: GridApi
  let mockUrlSync: any
  let mockConstructor: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockGridApi = {
      getFilterModel: vi.fn().mockReturnValue({}),
      setFilterModel: vi.fn(),
      getColumnDefs: vi.fn().mockReturnValue([])
    } as unknown as GridApi

    mockUrlSync = {
      toUrl: vi
        .fn()
        .mockResolvedValue('http://example.com?f_name_contains=test'),
      toParams: vi.fn().mockResolvedValue('f_name_contains=test'),
      fromUrl: vi.fn().mockResolvedValue(undefined),
      fromFilters: vi.fn(),
      clearFilters: vi.fn(),
      validateUrl: vi
        .fn()
        .mockResolvedValue({ valid: true, errors: [], warnings: [] }),
      getUrlInfo: vi.fn().mockResolvedValue({
        length: 50,
        filterCount: 1,
        compressed: false,
        types: { name: 'text' }
      }),
      getColumnTypes: vi
        .fn()
        .mockReturnValue({ name: 'text', price: 'number' }),
      destroy: vi.fn()
    }

    mockConstructor = vi
      .mocked(AGGridUrlSync)
      .mockImplementation(() => mockUrlSync)
  })

  describe('Hook Initialization', () => {
    it('should initialize with default state when gridApi is null', async () => {
      const { result } = renderHook(() => useAGGridUrlSync(null as any))

      expect(result.current.isReady).toBe(false)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe(null)
      expect(result.current.hasFilters).toBe(false)
    })

    it('should initialize when gridApi is provided', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi, { debug: true })
      )

      // Wait for initialization
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(AGGridUrlSync).toHaveBeenCalledWith(
        mockGridApi,
        expect.objectContaining({
          debug: true,
          onError: expect.any(Object)
        })
      )
      expect(result.current.isReady).toBe(true)
    })

    // Note: Initialization error handling is covered by the core library tests
    // The hook gracefully handles when AGGridUrlSync fails to initialize

    it('should respect enabledWhenReady option', () => {
      renderHook(() =>
        useAGGridUrlSync(mockGridApi, { enabledWhenReady: false })
      )

      expect(AGGridUrlSync).not.toHaveBeenCalled()
    })
  })

  describe('API Methods', () => {
    let result: any

    beforeEach(async () => {
      const hook = renderHook(() => useAGGridUrlSync(mockGridApi))
      result = hook.result

      // Wait for initialization
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })
    })

    it('should provide shareUrl method that refreshes state', async () => {
      const url = await act(async () =>
        result.current.shareUrl('http://example.com')
      )

      expect(mockUrlSync.toUrl).toHaveBeenCalledWith(
        'http://example.com',
        undefined
      )
      expect(url).toBe('http://example.com?f_name_contains=test')

      // Should call refresh methods
      expect(mockUrlSync.getUrlInfo).toHaveBeenCalled()
      expect(mockUrlSync.getColumnTypes).toHaveBeenCalled()
    })

    it('should provide applyUrlFilters method that refreshes state', async () => {
      await act(async () => {
        await result.current.applyUrlFilters(
          'http://example.com?f_name_contains=test'
        )
      })

      expect(mockUrlSync.fromUrl).toHaveBeenCalledWith(
        'http://example.com?f_name_contains=test'
      )

      // Should call refresh methods
      expect(mockUrlSync.getUrlInfo).toHaveBeenCalled()
      expect(mockUrlSync.getColumnTypes).toHaveBeenCalled()
    })

    it('should provide applyFilters method that refreshes state', async () => {
      const filterState = {
        name: {
          filterType: 'text' as const,
          type: 'contains' as const,
          filter: 'test'
        }
      }

      await act(async () => {
        await result.current.applyFilters(filterState)
      })

      expect(mockUrlSync.fromFilters).toHaveBeenCalledWith(filterState)

      // Should call refresh methods
      expect(mockUrlSync.getUrlInfo).toHaveBeenCalled()
      expect(mockUrlSync.getColumnTypes).toHaveBeenCalled()
    })

    it('should provide clearFilters method that refreshes state', async () => {
      await act(async () => {
        await result.current.clearFilters()
      })

      expect(mockUrlSync.clearFilters).toHaveBeenCalled()

      // Should call refresh methods
      expect(mockUrlSync.getUrlInfo).toHaveBeenCalled()
      expect(mockUrlSync.getColumnTypes).toHaveBeenCalled()
    })

    it('should provide manual refresh method', async () => {
      await act(async () => {
        await result.current.refresh()
      })

      expect(mockUrlSync.toUrl).toHaveBeenCalled()
      expect(mockUrlSync.getUrlInfo).toHaveBeenCalled()
      expect(mockUrlSync.getColumnTypes).toHaveBeenCalled()
    })

    it('should provide validateUrl method', async () => {
      const validation = await act(async () =>
        result.current.validateUrl('http://example.com?f_name_contains=test')
      )

      expect(mockUrlSync.validateUrl).toHaveBeenCalledWith(
        'http://example.com?f_name_contains=test'
      )
      expect(validation).toEqual({ valid: true, errors: [], warnings: [] })
    })

    it('should provide getQueryParams method', async () => {
      const params = await act(async () =>
        result.current.getQueryParams({ compress: false })
      )

      expect(mockUrlSync.toParams).toHaveBeenCalledWith({ compress: false })
      expect(params).toBe('f_name_contains=test')
    })
  })

  describe('State Management', () => {
    it('should update state after initialization', async () => {
      const { result } = renderHook(() => useAGGridUrlSync(mockGridApi))

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(result.current.urlInfo).toEqual({
        length: 50,
        filterCount: 1,
        compressed: false,
        types: { name: 'text' }
      })
      expect(result.current.columnTypes).toEqual({
        name: 'text',
        price: 'number'
      })
      expect(result.current.hasFilters).toBe(true)
    })

    it('should handle state refresh errors', async () => {
      mockUrlSync.toUrl.mockRejectedValue(new Error('State refresh failed'))

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi, { debug: true })
      )

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(result.current.error).toEqual(
        expect.objectContaining({
          message: 'State refresh failed'
        })
      )
    })

    it('should clear errors on successful operations', async () => {
      // Start with an error
      mockUrlSync.toUrl.mockRejectedValueOnce(new Error('Initial error'))

      const { result } = renderHook(() => useAGGridUrlSync(mockGridApi))

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(result.current.error).toBeTruthy()

      // Now make operations succeed
      mockUrlSync.toUrl.mockResolvedValue('http://example.com?success=true')

      await act(async () => {
        await result.current.refresh()
      })

      expect(result.current.error).toBe(null)
    })
  })

  describe('Auto-Apply on Mount', () => {
    it('should auto-apply filters when enabled', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi, { autoApplyOnMount: true })
      )

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(mockUrlSync.fromUrl).toHaveBeenCalled()
      expect(result.current.isReady).toBe(true)
    })

    it('should not auto-apply filters when disabled', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi, { autoApplyOnMount: false })
      )

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(mockUrlSync.fromUrl).not.toHaveBeenCalled()
      expect(result.current.isReady).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle method calls when not ready', async () => {
      const { result } = renderHook(() => useAGGridUrlSync(null as any))

      // All methods should handle null state gracefully
      const url = await result.current.shareUrl()
      expect(typeof url).toBe('string')

      const params = await result.current.getQueryParams()
      expect(typeof params).toBe('string')

      const validation = await result.current.validateUrl('test')
      expect(validation).toEqual({
        valid: false,
        errors: ['AG Grid URL Sync not ready'],
        warnings: []
      })

      // These should not throw
      await result.current.applyUrlFilters('test')
      await result.current.clearFilters()
      await result.current.applyFilters({})
    })

    it('should handle async operation errors gracefully', async () => {
      mockUrlSync.fromUrl.mockRejectedValueOnce(new Error('Apply failed'))

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi, { debug: true })
      )

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      await act(async () => {
        await result.current.applyUrlFilters('invalid-url')
      })

      expect(result.current.error).toEqual(
        expect.objectContaining({
          message: 'Apply failed'
        })
      )
    })
  })

  describe('Organized API Surface', () => {
    let result: any

    beforeEach(async () => {
      const hook = renderHook(() => useAGGridUrlSync(mockGridApi))
      result = hook.result

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })
    })

    it('should provide organized URL API', () => {
      expect(result.current.url).toEqual({
        share: expect.any(Function),
        current: expect.any(String),
        info: expect.any(Object),
        validate: expect.any(Function)
      })
    })

    it('should provide organized filters API', () => {
      expect(result.current.filters).toEqual({
        apply: expect.any(Function),
        applyState: expect.any(Function),
        clear: expect.any(Function),
        count: expect.any(Number),
        types: expect.any(Object)
      })
    })

    it('should provide organized status API', () => {
      expect(result.current.status).toEqual({
        ready: expect.any(Boolean),
        loading: expect.any(Boolean),
        error: null,
        hasFilters: expect.any(Boolean)
      })
    })
  })

  describe('Lifecycle Management', () => {
    it('should cleanup on unmount', async () => {
      const { unmount } = renderHook(() => useAGGridUrlSync(mockGridApi))

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      unmount()

      expect(mockUrlSync.destroy).toHaveBeenCalled()
    })

    it('should handle gridApi changes', async () => {
      const newMockGridApi = {
        ...mockGridApi,
        id: 'new-grid'
      } as unknown as GridApi
      const { result, rerender } = renderHook(
        ({ gridApi }) => useAGGridUrlSync(gridApi),
        { initialProps: { gridApi: mockGridApi } }
      )

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(result.current.isReady).toBe(true)

      // Change to new grid API
      await act(async () => {
        rerender({ gridApi: newMockGridApi })
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      // Should destroy old instance and create new one
      expect(mockUrlSync.destroy).toHaveBeenCalled()
      expect(AGGridUrlSync).toHaveBeenCalledTimes(2)
    })
  })
})

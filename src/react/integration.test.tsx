import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { setTimeout } from 'timers/promises'
import type { GridApi } from 'ag-grid-community'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'

/**
 * Integration Tests - Practical scenarios that test the hook with real business value
 * Focus on scenarios that could actually break in production
 */

// Mock dependencies
vi.mock('../core/ag-grid-url-sync.js', () => {
  const mockInstance = {
    generateUrl: vi.fn(() => 'http://example.com?f_name_contains=test'),
    getQueryParams: vi.fn(() => '?f_name_contains=test'),
    applyFromUrl: vi.fn(),
    applyFilters: vi.fn(),
    clearFilters: vi.fn(),
    destroy: vi.fn()
  }

  return {
    AGGridUrlSync: vi.fn(() => mockInstance)
  }
})

vi.mock('../core/url-parser.js', () => ({
  parseUrlFilters: vi.fn(() => ({
    name: {
      filterType: 'text' as const,
      type: 'contains' as const,
      filter: 'test'
    }
  }))
}))

const createMockGridApi = (): GridApi =>
  ({
    setFilterModel: vi.fn(),
    getFilterModel: vi.fn(() => ({})),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    destroy: vi.fn()
  }) as any

describe('React Hook Integration Tests', () => {
  let consoleSpy: any

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('Real-world Usage Patterns', () => {
    test('should handle rapid gridApi switching without issues', async () => {
      // Scenario: User quickly switches between different data views/grids
      const gridApi1 = createMockGridApi()
      const gridApi2 = createMockGridApi()

      const { rerender } = renderHook(
        ({ gridApi }: { gridApi: GridApi | null }) => useAGGridUrlSync(gridApi),
        { initialProps: { gridApi: gridApi1 as GridApi | null } }
      )

      await act(async () => {
        await setTimeout(0)
      })

      // Switch to different grid
      rerender({ gridApi: gridApi2 as GridApi | null })

      // Should properly cleanup and reinitialize
      expect(gridApi1.removeEventListener).toHaveBeenCalled()
      expect(gridApi2.addEventListener).toHaveBeenCalled()
    })

    test('should maintain state consistency during config changes', () => {
      // Scenario: User changes configuration options
      const gridApi = createMockGridApi()

      const { result, rerender } = renderHook(
        ({ prefix }: { prefix: string }) =>
          useAGGridUrlSync(gridApi, { paramPrefix: prefix }),
        { initialProps: { prefix: 'f_' } }
      )

      expect(result.current.isReady).toBe(true)

      // Change config
      rerender({ prefix: 'filter_' })

      // Should remain functional with new config
      expect(result.current.isReady).toBe(true)
    })

    test('should handle multiple operations in sequence', async () => {
      // Scenario: User applies multiple filter operations quickly
      const gridApi = createMockGridApi()
      const { result } = renderHook(() => useAGGridUrlSync(gridApi))

      await act(async () => {
        await setTimeout(0)
      })

      // Rapid sequence of operations
      await act(async () => {
        result.current.applyUrlFilters('http://test1.com?f_name_contains=test1')
        result.current.clearFilters()
        result.current.applyUrlFilters('http://test2.com?f_status_eq=active')
        const url = result.current.shareUrl()
        expect(typeof url).toBe('string')
      })

      // Should handle all operations without errors
      expect(result.current.isReady).toBe(true)
    })
  })

  describe('Error Resilience', () => {
    test('should continue working if one operation fails', async () => {
      // Scenario: One operation fails but hook should remain functional
      const gridApi = createMockGridApi()
      const { result } = renderHook(() => useAGGridUrlSync(gridApi))

      await act(async () => {
        await setTimeout(0)
      })

      // Mock a failure in applyUrlFilters
      const { AGGridUrlSync } = await import('../core/ag-grid-url-sync.js')
      const mockInstance = new (AGGridUrlSync as any)()
      mockInstance.applyFromUrl.mockImplementationOnce(() => {
        throw new Error('Apply failed')
      })

      // Operation fails but hook should remain ready
      act(() => {
        result.current.applyUrlFilters('http://failing-url.com')
      })

      expect(result.current.isReady).toBe(true)

      // Other operations should still work
      act(() => {
        const url = result.current.shareUrl()
        expect(typeof url).toBe('string')
      })
    })

    test('should handle disabled state gracefully', () => {
      // Scenario: Hook is disabled but should not crash
      const gridApi = createMockGridApi()
      const { result } = renderHook(() =>
        useAGGridUrlSync(gridApi, {
          enabledWhenReady: false
        })
      )

      expect(result.current.isReady).toBe(false)

      // Operations should work gracefully when disabled
      act(() => {
        const url = result.current.shareUrl('http://default.com')
        expect(url).toBe('http://default.com')

        result.current.clearFilters() // Should not crash
        result.current.applyUrlFilters('http://test.com') // Should not crash
      })
    })
  })

  describe('Memory and Performance', () => {
    test('should cleanup event listeners on unmount', () => {
      // Critical for preventing memory leaks
      const gridApi = createMockGridApi()
      const { unmount } = renderHook(() => useAGGridUrlSync(gridApi))

      unmount()

      expect(gridApi.removeEventListener).toHaveBeenCalled()
    })

    test('should handle frequent re-renders efficiently', async () => {
      // Scenario: Component re-renders frequently but hook should be stable
      const gridApi = createMockGridApi()

      const { result, rerender } = renderHook(
        ({ counter }: { counter: number }) => useAGGridUrlSync(gridApi),
        { initialProps: { counter: 0 } }
      )

      await act(async () => {
        await setTimeout(0)
      })

      const initialShareUrl = result.current.shareUrl

      // Multiple re-renders
      for (let i = 1; i <= 5; i++) {
        rerender({ counter: i })
      }

      // Functions should remain stable (not recreated on every render)
      expect(result.current.shareUrl).toBe(initialShareUrl)
      expect(result.current.isReady).toBe(true)
    })
  })

  describe('Edge Cases in Real Usage', () => {
    test('should handle null gridApi gracefully', () => {
      // Scenario: Grid not yet initialized
      const { result } = renderHook(() => useAGGridUrlSync(null))

      expect(result.current.isReady).toBe(false)

      // Should provide safe defaults
      const url = result.current.shareUrl('http://default.com')
      expect(url).toBe('http://default.com')

      const params = result.current.getQueryParams()
      expect(params).toBe('')
    })

    test('should handle autoApplyOnMount correctly', async () => {
      // Scenario: Auto-apply filters when component mounts
      const gridApi = createMockGridApi()

      renderHook(() =>
        useAGGridUrlSync(gridApi, {
          autoApplyOnMount: true
        })
      )

      await act(async () => {
        await setTimeout(0)
      })

      const { AGGridUrlSync } = await import('../core/ag-grid-url-sync.js')
      const mockInstance = new (AGGridUrlSync as any)()

      // Should have auto-applied filters on mount
      expect(mockInstance.applyFromUrl).toHaveBeenCalled()
    })

    test('should not auto-apply twice on re-renders', async () => {
      // Scenario: Ensure auto-apply only happens once
      const gridApi = createMockGridApi()

      const { rerender } = renderHook(
        ({ key }: { key: number }) =>
          useAGGridUrlSync(gridApi, {
            autoApplyOnMount: true
          }),
        { initialProps: { key: 1 } }
      )

      await act(async () => {
        await setTimeout(0)
      })

      const { AGGridUrlSync } = await import('../core/ag-grid-url-sync.js')
      const mockInstance = new (AGGridUrlSync as any)()

      // Reset call count
      mockInstance.applyFromUrl.mockClear()

      // Re-render component
      rerender({ key: 2 })

      await act(async () => {
        await setTimeout(0)
      })

      // Should not auto-apply again
      expect(mockInstance.applyFromUrl).not.toHaveBeenCalled()
    })
  })
})

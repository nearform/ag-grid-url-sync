import { describe, it, expect, vi } from 'vitest'
import { AGGridUrlSync } from './ag-grid-url-sync.js'
import type { GridApi } from 'ag-grid-community'

/**
 * User Journey Tests - These test complete workflows that real users experience
 * These tests provide high business value by catching integration issues
 */
describe('User Journey Tests', () => {
  describe('Complete Filter Sharing Workflow', () => {
    it('should handle complete user workflow: apply filters → generate share URL → recipient loads filters', () => {
      // Scenario: User A applies filters, shares URL, User B loads the same filters

      // User A's grid with some filters applied
      const userAGridApi = {
        getFilterModel: vi.fn().mockReturnValue({
          name: { filterType: 'text', type: 'contains', filter: 'john' },
          status: { filterType: 'text', type: 'equals', filter: 'active' },
          department: { filterType: 'text', type: 'startsWith', filter: 'eng' }
        }),
        setFilterModel: vi.fn()
      } as unknown as GridApi

      const userASync = new AGGridUrlSync(userAGridApi)

      // User A generates a share URL
      const shareUrl = userASync.generateUrl('https://company.com/employees')

      // Verify the URL contains all expected filters
      expect(shareUrl).toContain('f_name_contains=john')
      expect(shareUrl).toContain('f_status_eq=active')
      expect(shareUrl).toContain('f_department_startsWith=eng')

      // User B receives the URL and applies it to their grid
      const userBGridApi = {
        getFilterModel: vi.fn().mockReturnValue({}),
        setFilterModel: vi.fn()
      } as unknown as GridApi

      const userBSync = new AGGridUrlSync(userBGridApi)

      // User B applies filters from the shared URL
      userBSync.applyFromUrl(shareUrl)

      // Verify User B's grid receives the same filters as User A had
      expect(userBGridApi.setFilterModel).toHaveBeenCalledWith({
        name: { filterType: 'text', type: 'contains', filter: 'john' },
        status: { filterType: 'text', type: 'equals', filter: 'active' },
        department: { filterType: 'text', type: 'startsWith', filter: 'eng' }
      })
    })

    it('should preserve existing URL parameters when adding filters', () => {
      // Business scenario: User shares filtered view from a page with existing query params
      const gridApi = {
        getFilterModel: vi.fn().mockReturnValue({
          priority: { filterType: 'text', type: 'equals', filter: 'high' }
        }),
        setFilterModel: vi.fn()
      } as unknown as GridApi

      const urlSync = new AGGridUrlSync(gridApi)

      // Existing URL with business logic parameters
      const existingUrl =
        'https://app.com/dashboard?tab=issues&view=kanban&team=backend'
      const shareUrl = urlSync.generateUrl(existingUrl)

      // Should preserve existing params AND add filter params
      expect(shareUrl).toContain('tab=issues')
      expect(shareUrl).toContain('view=kanban')
      expect(shareUrl).toContain('team=backend')
      expect(shareUrl).toContain('f_priority_eq=high')
    })

    it('should handle filter clearing workflow', () => {
      // Business scenario: User wants to clear all filters and share clean view
      const gridApi = {
        getFilterModel: vi.fn().mockReturnValue({
          // Initially has filters
          name: { filterType: 'text', type: 'contains', filter: 'test' }
        }),
        setFilterModel: vi.fn()
      } as unknown as GridApi

      const urlSync = new AGGridUrlSync(gridApi)

      // User clears all filters
      urlSync.clearFilters()
      expect(gridApi.setFilterModel).toHaveBeenCalledWith({})

      // Mock the grid now having no filters
      gridApi.getFilterModel = vi.fn().mockReturnValue({})

      // Generate share URL after clearing - should have no filter params
      const cleanUrl = urlSync.generateUrl('https://app.com/data')
      expect(cleanUrl).toBe('https://app.com/data')
    })
  })

  describe('Error Recovery Scenarios', () => {
    it('should handle corrupted shared URLs gracefully', () => {
      // Business scenario: User receives broken URL but app should not crash
      const gridApi = {
        getFilterModel: vi.fn().mockReturnValue({}),
        setFilterModel: vi.fn()
      } as unknown as GridApi

      const onParseError = vi.fn()
      const urlSync = new AGGridUrlSync(gridApi, { onParseError })

      // Try to apply a malformed URL
      urlSync.applyFromUrl(
        'https://app.com?f_invalid_format&f_name_contains=valid'
      )

      // Should still apply valid filters and handle errors gracefully
      expect(onParseError).toHaveBeenCalled()
      expect(gridApi.setFilterModel).toHaveBeenCalled()
    })

    it('should handle AG Grid API failures without crashing', () => {
      // Business scenario: AG Grid throws error but app should continue
      const faultyGridApi = {
        getFilterModel: vi.fn().mockImplementation(() => {
          throw new Error('Grid not ready')
        }),
        setFilterModel: vi.fn().mockImplementation(() => {
          throw new Error('Cannot set filters')
        })
      } as unknown as GridApi

      const urlSync = new AGGridUrlSync(faultyGridApi)

      // Should not throw even when grid fails
      expect(() => urlSync.generateUrl()).not.toThrow()
      expect(() => urlSync.clearFilters()).not.toThrow()
      expect(() =>
        urlSync.applyFromUrl('https://app.com?f_name_contains=test')
      ).not.toThrow()
    })
  })

  describe('Real-world Data Scenarios', () => {
    it('should handle international characters in filter values', () => {
      const gridApi = {
        getFilterModel: vi.fn().mockReturnValue({
          employeeName: {
            filterType: 'text',
            type: 'contains',
            filter: 'José María'
          },
          city: { filterType: 'text', type: 'equals', filter: '北京' },
          description: {
            filterType: 'text',
            type: 'contains',
            filter: 'café résumé'
          }
        }),
        setFilterModel: vi.fn()
      } as unknown as GridApi

      const urlSync = new AGGridUrlSync(gridApi)
      const shareUrl = urlSync.generateUrl('https://app.com')

      // Should properly encode international characters
      expect(shareUrl).toContain('Jos%C3%A9')
      expect(shareUrl).toContain('%E5%8C%97%E4%BA%AC')

      // Should decode correctly when applied
      const recipientGridApi = {
        getFilterModel: vi.fn().mockReturnValue({}),
        setFilterModel: vi.fn()
      } as unknown as GridApi

      const recipientSync = new AGGridUrlSync(recipientGridApi)
      recipientSync.applyFromUrl(shareUrl)

      expect(recipientGridApi.setFilterModel).toHaveBeenCalledWith({
        employeeName: {
          filterType: 'text',
          type: 'contains',
          filter: 'José María'
        },
        city: { filterType: 'text', type: 'equals', filter: '北京' },
        description: {
          filterType: 'text',
          type: 'contains',
          filter: 'café résumé'
        }
      })
    })

    it('should handle edge case filter values that could break URLs', () => {
      const gridApi = {
        getFilterModel: vi.fn().mockReturnValue({
          query: {
            filterType: 'text',
            type: 'contains',
            filter: 'search & filter + more % data # hash'
          },
          path: {
            filterType: 'text',
            type: 'contains',
            filter: '/api/v1/users?id=123&name=test'
          }
        }),
        setFilterModel: vi.fn()
      } as unknown as GridApi

      const urlSync = new AGGridUrlSync(gridApi)
      const shareUrl = urlSync.generateUrl('https://app.com')

      // Should create valid URL despite problematic characters
      expect(() => new URL(shareUrl)).not.toThrow()

      // Should round-trip correctly
      const newGridApi = {
        getFilterModel: vi.fn().mockReturnValue({}),
        setFilterModel: vi.fn()
      } as unknown as GridApi

      const newSync = new AGGridUrlSync(newGridApi)
      newSync.applyFromUrl(shareUrl)

      expect(newGridApi.setFilterModel).toHaveBeenCalledWith({
        query: {
          filterType: 'text',
          type: 'contains',
          filter: 'search & filter + more % data # hash'
        },
        path: {
          filterType: 'text',
          type: 'contains',
          filter: '/api/v1/users?id=123&name=test'
        }
      })
    })
  })

  describe('Browser URL Length Limits', () => {
    it('should handle near-maximum URL lengths gracefully', () => {
      const manyFilters = {}
      // Create filters that will produce a long URL (but under 2000 chars)
      for (let i = 0; i < 15; i++) {
        manyFilters[`very_long_column_name_${i}`] = {
          filterType: 'text',
          type: 'contains',
          filter: `some_reasonably_long_filter_value_${i}`
        }
      }

      const gridApi = {
        getFilterModel: vi.fn().mockReturnValue(manyFilters),
        setFilterModel: vi.fn()
      } as unknown as GridApi

      const urlSync = new AGGridUrlSync(gridApi)
      const shareUrl = urlSync.generateUrl(
        'https://app.com/very/long/path/that/adds/to/url/length'
      )

      // Should produce valid URL under typical browser limits (~2000 chars)
      expect(shareUrl.length).toBeLessThan(2000)
      expect(() => new URL(shareUrl)).not.toThrow()

      // Should round-trip correctly
      const newSync = new AGGridUrlSync({
        getFilterModel: vi.fn().mockReturnValue({}),
        setFilterModel: vi.fn()
      } as unknown as GridApi)

      expect(() => newSync.applyFromUrl(shareUrl)).not.toThrow()
    })
  })
})

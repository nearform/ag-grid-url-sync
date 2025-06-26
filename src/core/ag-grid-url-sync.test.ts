import { describe, it, expect, vi } from 'vitest'
import { AGGridUrlSync, createUrlSync } from './ag-grid-url-sync.js'
import type { GridApi } from 'ag-grid-community'
import type { FilterState } from './types.js'

describe('AGGridUrlSync', () => {
  // Mock GridApi
  const mockFilterModel = {
    name: {
      filterType: 'text' as const,
      type: 'contains' as const,
      filter: 'john'
    }
  }

  const mockGridApi = {
    getFilterModel: vi.fn().mockReturnValue(mockFilterModel),
    setFilterModel: vi.fn()
  } as unknown as GridApi

  describe('generateUrl', () => {
    it('should generate URL with current filter state', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      const url = urlSync.generateUrl('https://example.com')
      expect(url).toBe('https://example.com/?f_name_contains=john')
    })

    it('should use current URL when no base URL provided', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      const url = urlSync.generateUrl()
      expect(url).toBe('https://example.com/?f_name_contains=john')
    })
  })

  describe('getQueryParams', () => {
    it('should return query parameters string', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      const params = urlSync.getQueryParams()
      expect(params).toBe('?f_name_contains=john')
    })
  })

  describe('applyFromUrl', () => {
    it('should apply filters from URL', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      urlSync.applyFromUrl('https://example.com?f_name_contains=jane')
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        name: {
          filterType: 'text' as const,
          type: 'contains' as const,
          filter: 'jane'
        }
      })
    })

    it('should use current URL when no URL provided', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      urlSync.applyFromUrl()
      expect(mockGridApi.setFilterModel).toHaveBeenCalled()
    })
  })

  describe('applyFilters', () => {
    it('should apply filter state to grid', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      const filterState: FilterState = {
        name: {
          filterType: 'text',
          type: 'contains',
          filter: 'test'
        }
      }
      urlSync.applyFilters(filterState)
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        name: {
          filterType: 'text',
          type: 'contains',
          filter: 'test'
        }
      })
    })
  })

  describe('clearFilters', () => {
    it('should clear all filters', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      urlSync.clearFilters()
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
    })
  })
})

import { describe, it, expect, vi } from 'vitest'
import { AGGridUrlSync, createUrlSync } from './ag-grid-url-sync.js'
import type { GridApi } from 'ag-grid-community'
import type { AGGridUrlSyncConfig, FilterState } from './types.js'

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

  describe('config defaults', () => {
    // A caller can forward an optional prop, for example
    // `format: props.format`, so a key can be present with the value undefined.
    const undefinedConfig = {
      paramPrefix: undefined,
      maxValueLength: undefined,
      serialization: undefined,
      groupedParam: undefined,
      format: undefined
    } as unknown as AGGridUrlSyncConfig

    it('should use the defaults for keys set to undefined', () => {
      const urlSync = new AGGridUrlSync(mockGridApi, undefinedConfig)
      expect(urlSync.getSerializationMode()).toBe('individual')
      expect(urlSync.getCurrentFormat()).toBe('querystring')
      expect(urlSync.generateUrl('https://example.com')).toBe(
        'https://example.com/?f_name_contains=john'
      )
    })

    it('should decode a grouped URL when format and groupedParam are undefined', () => {
      const setFilterModel = vi.fn()
      const onParseError = vi.fn()
      const gridApi = {
        getFilterModel: vi.fn().mockReturnValue({}),
        setFilterModel
      } as unknown as GridApi
      const urlSync = new AGGridUrlSync(gridApi, {
        ...undefinedConfig,
        onParseError
      })

      urlSync.applyFromUrl(
        'https://example.com/?grid_filters=f_name_contains%3Dbob'
      )

      expect(setFilterModel).toHaveBeenCalledWith({
        name: { filterType: 'text', type: 'contains', filter: 'bob' }
      })
      expect(onParseError).not.toHaveBeenCalled()
    })
  })

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

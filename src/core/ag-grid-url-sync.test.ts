import { describe, it, expect, vi } from 'vitest'
import { AGGridUrlSync } from './ag-grid-url-sync.js'
import type { AGGridUrlSyncConfig, FilterState } from './types.js'
import { asGridApi } from '../test-helpers.js'

describe('AGGridUrlSync', () => {
  // Mock GridApi
  const mockFilterModel = {
    name: {
      filterType: 'text' as const,
      type: 'contains' as const,
      filter: 'john'
    }
  }

  const mockGridApi = asGridApi({
    getFilterModel: vi.fn().mockReturnValue(mockFilterModel),
    setFilterModel: vi.fn()
  })

  describe('config defaults', () => {
    // A caller can forward an optional prop, for example
    // `format: props.format`, so a key can be present with the value undefined.
    // The config as a caller without exactOptionalPropertyTypes sees it
    type LooseConfig = {
      [K in keyof AGGridUrlSyncConfig]?: AGGridUrlSyncConfig[K] | undefined
    }

    const looseConfig: LooseConfig = {
      paramPrefix: undefined,
      maxValueLength: undefined,
      serialization: undefined,
      groupedParam: undefined,
      format: undefined
    }

    // SAFETY: the constructor drops the keys set to undefined (the case under
    // test), so each one keeps its default
    const undefinedConfig = looseConfig as AGGridUrlSyncConfig

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

      const gridApi = asGridApi({
        getFilterModel: vi.fn().mockReturnValue({}),
        setFilterModel
      })

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

  describe('getUrlState', () => {
    it('should give the URL and hasFilters true when the grid has filters', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      expect(urlSync.getUrlState('https://example.com/?tab=1')).toEqual({
        url: 'https://example.com/?f_name_contains=john&tab=1',
        hasFilters: true
      })
    })

    it('should give hasFilters false when only the page has params (#215)', () => {
      const api = asGridApi({
        getFilterModel: vi.fn().mockReturnValue({}),
        setFilterModel: vi.fn()
      })

      const urlSync = new AGGridUrlSync(api)
      expect(urlSync.getUrlState('https://example.com/?tab=1')).toEqual({
        url: 'https://example.com/?tab=1',
        hasFilters: false
      })
      expect(api.getFilterModel).toHaveBeenCalledTimes(1)
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

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AGGridUrlSync, createUrlSync } from '../ag-grid-url-sync.js'
import type { FilterState } from '../types.js'

// Mock AG Grid API with multi-type filters to test the fix
const createMockGridApi = () =>
  ({
    setFilterModel: vi.fn(),
    getFilterModel: vi.fn().mockReturnValue({
      // AG Grid format - gets converted to our internal format
      name: { filterType: 'text', type: 'contains', filter: 'john' },
      age: { filterType: 'number', type: 'greaterThan', filter: 25 },
      created: { filterType: 'date', type: 'greaterThan', filter: '2024-01-01' }
    }),
    onFilterChanged: vi.fn(),
    getColumnDefs: vi.fn().mockReturnValue([
      { field: 'name', filter: 'agTextColumnFilter' },
      { field: 'age', filter: 'agNumberColumnFilter' },
      { field: 'created', filter: 'agDateColumnFilter' }
    ]),
    getColumn: vi.fn().mockImplementation((columnId: string) => {
      const columnDefs = [
        { field: 'name', filter: 'agTextColumnFilter' },
        { field: 'age', filter: 'agNumberColumnFilter' },
        { field: 'created', filter: 'agDateColumnFilter' }
      ]
      const colDef = columnDefs.find(def => def.field === columnId)
      return colDef
        ? {
            getColDef: () => colDef
          }
        : null
    })
  }) as any

// Expected internal format after conversion
const sampleFilterState: FilterState = {
  name: {
    filterType: 'text',
    type: 'contains',
    filter: 'john'
  },
  age: {
    filterType: 'number',
    type: 'greaterThan',
    filter: 25
  },
  created: {
    filterType: 'date',
    type: 'dateAfter', // Internal format for date > operation
    filter: '2024-01-01'
  }
}

// Expected AG Grid format when filters are applied
const expectedAgGridFormat = {
  name: {
    filterType: 'text',
    type: 'contains',
    filter: 'john'
  },
  age: {
    filterType: 'number',
    type: 'greaterThan',
    filter: 25
  },
  created: {
    filterType: 'date',
    type: 'greaterThan', // AG Grid format
    dateFrom: '2024-01-01',
    dateTo: null
  }
}

// Expected AG Grid format after conversion from our internal format
const expectedAGGridFilterState = {
  name: {
    filterType: 'text',
    type: 'contains',
    filter: 'john'
  },
  age: {
    filterType: 'number',
    type: 'greaterThan',
    filter: 25
  },
  created: {
    filterType: 'date',
    type: 'greaterThan', // AG Grid format
    dateFrom: '2024-01-01',
    dateTo: null
  }
}

describe('AGGridUrlSync - Grouped Serialization Integration', () => {
  let mockGridApi: any

  beforeEach(() => {
    mockGridApi = createMockGridApi()
    // Mock multi-type filter model
    mockGridApi.getFilterModel.mockReturnValue({
      name: { filterType: 'text', type: 'contains', filter: 'john' },
      age: { filterType: 'number', type: 'greaterThan', filter: 25 },
      created: { filterType: 'date', type: 'greaterThan', filter: '2024-01-01' }
    })
  })

  describe('Backward Compatibility', () => {
    it('should default to individual serialization mode', () => {
      const urlSync = createUrlSync(mockGridApi)

      expect(urlSync.getSerializationMode()).toBe('individual')

      const url = urlSync.generateUrl('http://example.com')
      expect(url).toContain('f_name_contains=john')
      expect(url).toContain('f_age_gt=25')
      expect(url).toContain('f_created_after=2024-01-01')
    })

    it('should work with existing configuration options', () => {
      const urlSync = createUrlSync(mockGridApi, {
        paramPrefix: 'filter_',
        maxValueLength: 500
      })

      expect(urlSync.getSerializationMode()).toBe('individual')

      const url = urlSync.generateUrl('http://example.com')
      expect(url).toContain('filter_name_contains=john')
      expect(url).toContain('filter_age_gt=25')
      expect(url).toContain('filter_created_after=2024-01-01')
    })
  })

  describe('Grouped Serialization - QueryString Format', () => {
    it('should generate URLs with grouped querystring format', () => {
      const urlSync = createUrlSync(mockGridApi, {
        serialization: 'grouped',
        format: 'querystring'
      })

      expect(urlSync.getSerializationMode()).toBe('grouped')
      expect(urlSync.getCurrentFormat()).toBe('querystring')

      const url = urlSync.generateUrl('http://example.com')
      expect(url).toContain('grid_filters=')
      expect(url).toContain('f_name_contains%3Djohn')
      expect(url).toContain('f_age_gt%3D25')
      expect(url).toContain('f_created_after%3D2024-01-01')
    })

    it('should parse URLs with grouped querystring format', () => {
      const urlSync = createUrlSync(mockGridApi, {
        serialization: 'grouped',
        format: 'querystring'
      })

      const url =
        'http://example.com?grid_filters=f_name_contains%3Djohn%26f_age_gt%3D25%26f_created_after%3D2024-01-01'

      urlSync.applyFromUrl(url)

      expect(mockGridApi.setFilterModel).toHaveBeenCalled()
      const appliedFilters = mockGridApi.setFilterModel.mock.calls[0][0]
      expect(appliedFilters.name).toEqual({
        filterType: 'text',
        type: 'contains',
        filter: 'john'
      })
      expect(appliedFilters.age).toEqual({
        filterType: 'number',
        type: 'greaterThan',
        filter: 25
      })
      expect(appliedFilters.created).toEqual({
        filterType: 'date',
        type: 'greaterThan', // AG Grid format uses greaterThan for date comparisons
        dateFrom: '2024-01-01',
        dateTo: null
      })
    })
  })

  describe('Grouped Serialization - JSON Format', () => {
    it('should generate URLs with grouped JSON format', () => {
      const urlSync = createUrlSync(mockGridApi, {
        serialization: 'grouped',
        format: 'json',
        groupedParam: 'filters'
      })

      expect(urlSync.getCurrentFormat()).toBe('json')

      const url = urlSync.generateUrl('http://example.com')
      expect(url).toContain('filters=')

      const urlObj = new URL(url)
      const filtersParam = urlObj.searchParams.get('filters')
      expect(filtersParam).toBeTruthy()

      const parsed = JSON.parse(decodeURIComponent(filtersParam!))
      expect(parsed).toEqual(sampleFilterState)
    })

    it('should parse URLs with grouped JSON format', () => {
      const urlSync = createUrlSync(mockGridApi, {
        serialization: 'grouped',
        format: 'json',
        groupedParam: 'filters'
      })

      const jsonData = JSON.stringify(sampleFilterState)
      const url = `http://example.com?filters=${encodeURIComponent(jsonData)}`

      urlSync.applyFromUrl(url)

      expect(mockGridApi.setFilterModel).toHaveBeenCalled()
      const appliedFilters = mockGridApi.setFilterModel.mock.calls[0][0]
      expect(appliedFilters).toEqual(expectedAgGridFormat)
    })
  })

  describe('Grouped Serialization - Base64 Format', () => {
    it('should generate URLs with grouped base64 format', () => {
      const urlSync = createUrlSync(mockGridApi, {
        serialization: 'grouped',
        format: 'base64'
      })

      expect(urlSync.getCurrentFormat()).toBe('base64')

      const url = urlSync.generateUrl('http://example.com')
      expect(url).toContain('grid_filters=')

      const urlObj = new URL(url)
      const filtersParam = urlObj.searchParams.get('grid_filters')
      expect(filtersParam).toBeTruthy()

      // Should be valid base64
      expect(() => atob(decodeURIComponent(filtersParam!))).not.toThrow()

      // Should decode to original filter state
      const decoded = atob(decodeURIComponent(filtersParam!))
      const parsed = JSON.parse(decoded)
      expect(parsed).toEqual(sampleFilterState)
    })

    it('should parse URLs with grouped base64 format', () => {
      const urlSync = createUrlSync(mockGridApi, {
        serialization: 'grouped',
        format: 'base64'
      })

      const base64Data = btoa(JSON.stringify(sampleFilterState))
      const url = `http://example.com?grid_filters=${encodeURIComponent(base64Data)}`

      urlSync.applyFromUrl(url)

      expect(mockGridApi.setFilterModel).toHaveBeenCalled()
      const appliedFilters = mockGridApi.setFilterModel.mock.calls[0][0]
      expect(appliedFilters).toEqual(expectedAgGridFormat)
    })
  })

  describe('Utility Methods', () => {
    it('should provide getFiltersAsFormat method', () => {
      const urlSync = createUrlSync(mockGridApi, {
        serialization: 'individual' // Test that utility works regardless of current mode
      })

      const jsonFormat = urlSync.getFiltersAsFormat('json')
      const parsed = JSON.parse(jsonFormat)
      expect(parsed).toEqual(sampleFilterState)

      const base64Format = urlSync.getFiltersAsFormat('base64')
      const decoded = JSON.parse(atob(base64Format))
      expect(decoded).toEqual(sampleFilterState)

      const queryFormat = urlSync.getFiltersAsFormat('querystring')
      expect(queryFormat).toContain('f_name_contains=john')
    })

    it('should provide serialization mode and format getters', () => {
      const individualSync = createUrlSync(mockGridApi, {
        serialization: 'individual'
      })
      expect(individualSync.getSerializationMode()).toBe('individual')

      const groupedSync = createUrlSync(mockGridApi, {
        serialization: 'grouped',
        format: 'base64'
      })
      expect(groupedSync.getSerializationMode()).toBe('grouped')
      expect(groupedSync.getCurrentFormat()).toBe('base64')
    })
  })

  describe('Multi-Grid Support', () => {
    it('should support multiple grids with different grouped parameters', () => {
      const teamSync = createUrlSync(mockGridApi, {
        serialization: 'grouped',
        groupedParam: 'team_filters',
        format: 'json'
      })

      const projectSync = createUrlSync(mockGridApi, {
        serialization: 'grouped',
        groupedParam: 'project_filters',
        format: 'base64'
      })

      const teamUrl = teamSync.generateUrl('http://example.com')
      const projectUrl = projectSync.generateUrl('http://example.com')

      expect(teamUrl).toContain('team_filters=')
      expect(projectUrl).toContain('project_filters=')

      // URLs shouldn't interfere with each other
      const combinedUrl = teamUrl + '&' + new URL(projectUrl).search.slice(1)
      expect(combinedUrl).toContain('team_filters=')
      expect(combinedUrl).toContain('project_filters=')
    })
  })

  describe('Roundtrip Tests', () => {
    it('should maintain data integrity through serialize/deserialize cycle', () => {
      const formats: Array<'querystring' | 'json' | 'base64'> = [
        'querystring',
        'json',
        'base64'
      ]

      formats.forEach(format => {
        const urlSync = createUrlSync(mockGridApi, {
          serialization: 'grouped',
          format
        })

        // Generate URL -> Parse URL -> Should get same filters
        const url = urlSync.generateUrl('http://example.com')

        // Clear mock and set up for parsing
        mockGridApi.setFilterModel.mockClear()
        urlSync.applyFromUrl(url)

        expect(mockGridApi.setFilterModel).toHaveBeenCalled()
        const appliedFilters = mockGridApi.setFilterModel.mock.calls[0][0]
        expect(appliedFilters).toEqual(expectedAgGridFormat)
      })
    })
  })
})

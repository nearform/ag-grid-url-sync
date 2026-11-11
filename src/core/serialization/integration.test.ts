import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createGridUrlSync } from '../grid-url-sync.js'
import { grouped, individual } from '../codecs.js'
import type { FilterState } from '../types.js'
import {
  asGridApi,
  createGridListeners,
  useRealLocation
} from '../../test-helpers.js'

// Mock AG Grid API with multi-type filters to test the fix
const createMockGridApi = () => ({
  ...createGridListeners(),
  setFilterModel: vi.fn(),
  getFilterModel: vi.fn().mockReturnValue({
    // AG Grid's model: the sync uses it as it is (#225)
    name: { filterType: 'text', type: 'contains', filter: 'john' },
    age: { filterType: 'number', type: 'greaterThan', filter: 25 },
    created: {
      filterType: 'date',
      type: 'greaterThan',
      dateFrom: '2024-01-01',
      dateTo: null
    }
  }),
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
})

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

describe('createGridUrlSync - Grouped Serialization Integration', () => {
  let mockGridApi: ReturnType<typeof createMockGridApi>

  // The sync is the one that the test makes. It applies no URL on create, so
  // only the test's own calls write to the grid.
  const makeSync = (codec?: ReturnType<typeof grouped | typeof individual>) =>
    createGridUrlSync({
      api: asGridApi(mockGridApi),
      applyUrlOnCreate: false,
      codec
    })

  beforeEach(() => {
    useRealLocation('/')
    mockGridApi = createMockGridApi()
    // Mock multi-type filter model
    mockGridApi.getFilterModel.mockReturnValue({
      name: { filterType: 'text', type: 'contains', filter: 'john' },
      age: { filterType: 'number', type: 'greaterThan', filter: 25 },
      created: {
        filterType: 'date',
        type: 'greaterThan',
        dateFrom: '2024-01-01',
        dateTo: null
      }
    })
  })

  describe('Backward Compatibility', () => {
    it('should default to the individual codec', () => {
      const sync = makeSync()

      const url = sync.getUrl('http://example.com')
      expect(url).toContain('f_name_contains=john')
      expect(url).toContain('f_age_gt=25')
      expect(url).toContain('f_created_after=2024-01-01')
    })

    it('should work with a prefix and a value length', () => {
      const sync = createGridUrlSync({
        api: asGridApi(mockGridApi),
        applyUrlOnCreate: false,
        codec: individual({ prefix: 'filter_' }),
        maxValueLength: 500
      })

      const url = sync.getUrl('http://example.com')
      expect(url).toContain('filter_name_contains=john')
      expect(url).toContain('filter_age_gt=25')
      expect(url).toContain('filter_created_after=2024-01-01')
    })
  })

  describe('Grouped Serialization - QueryString Format', () => {
    it('should generate URLs with grouped querystring format', () => {
      const sync = makeSync(grouped({ format: 'querystring' }))

      const url = sync.getUrl('http://example.com')
      expect(url).toContain('grid_filters=')
      expect(url).toContain('f_name_contains%3Djohn')
      expect(url).toContain('f_age_gt%3D25')
      expect(url).toContain('f_created_after%3D2024-01-01')
    })

    it('should parse URLs with grouped querystring format', () => {
      const sync = makeSync(grouped({ format: 'querystring' }))

      const url =
        'http://example.com?grid_filters=f_name_contains%3Djohn%26f_age_gt%3D25%26f_created_after%3D2024-01-01'

      sync.applyUrl(url)

      expect(mockGridApi.setFilterModel).toHaveBeenCalled()
      const appliedFilters = mockGridApi.setFilterModel.mock.calls[0]?.[0]
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
      const sync = makeSync(grouped({ format: 'json', param: 'filters' }))

      const url = sync.getUrl('http://example.com')
      expect(url).toContain('filters=')

      const urlObj = new URL(url)
      const filtersParam = urlObj.searchParams.get('filters')
      expect(filtersParam).toBeTruthy()

      // The value holds AG Grid's model (#225)
      const parsed = JSON.parse(decodeURIComponent(filtersParam!))
      expect(parsed).toEqual(expectedAgGridFormat)
    })

    it('should parse URLs with grouped JSON format', () => {
      const sync = makeSync(grouped({ format: 'json', param: 'filters' }))

      const jsonData = JSON.stringify(sampleFilterState)
      const url = `http://example.com?filters=${encodeURIComponent(jsonData)}`

      sync.applyUrl(url)

      expect(mockGridApi.setFilterModel).toHaveBeenCalled()
      const appliedFilters = mockGridApi.setFilterModel.mock.calls[0]?.[0]
      expect(appliedFilters).toEqual(expectedAgGridFormat)
    })
  })

  describe('Grouped Serialization - Base64 Format', () => {
    it('should generate URLs with grouped base64 format', () => {
      const sync = makeSync(grouped({ format: 'base64' }))

      const url = sync.getUrl('http://example.com')
      expect(url).toContain('grid_filters=')

      const urlObj = new URL(url)
      const filtersParam = urlObj.searchParams.get('grid_filters')
      expect(filtersParam).toBeTruthy()

      // Should be valid base64
      expect(() => atob(decodeURIComponent(filtersParam!))).not.toThrow()

      // Should decode to AG Grid's model (#225)
      const decoded = atob(decodeURIComponent(filtersParam!))
      const parsed = JSON.parse(decoded)
      expect(parsed).toEqual(expectedAgGridFormat)
    })

    it('should parse URLs with grouped base64 format', () => {
      const sync = makeSync(grouped({ format: 'base64' }))

      const base64Data = btoa(JSON.stringify(sampleFilterState))
      const url = `http://example.com?grid_filters=${encodeURIComponent(base64Data)}`

      sync.applyUrl(url)

      expect(mockGridApi.setFilterModel).toHaveBeenCalled()
      const appliedFilters = mockGridApi.setFilterModel.mock.calls[0]?.[0]
      expect(appliedFilters).toEqual(expectedAgGridFormat)
    })

    it('should round-trip non-Latin-1 text through a URL (#212)', () => {
      const filterModel = {
        name: { filterType: 'text', type: 'contains', filter: '日本 😀' }
      }

      mockGridApi.getFilterModel.mockReturnValue(filterModel)

      const sync = makeSync(grouped({ format: 'base64' }))

      const url = sync.getUrl('http://example.com')
      expect(new URL(url).searchParams.get('grid_filters')).toBeTruthy()

      sync.applyUrl(url)
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(filterModel)
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
        const sync = makeSync(grouped({ format }))

        // Generate URL -> Parse URL -> Should get same filters
        const url = sync.getUrl('http://example.com')

        // Clear mock and set up for parsing
        mockGridApi.setFilterModel.mockClear()
        sync.applyUrl(url)

        expect(mockGridApi.setFilterModel).toHaveBeenCalled()
        const appliedFilters = mockGridApi.setFilterModel.mock.calls[0]?.[0]
        expect(appliedFilters).toEqual(expectedAgGridFormat)
      })
    })
  })
})

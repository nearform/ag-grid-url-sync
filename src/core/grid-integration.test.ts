import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getFilterModel,
  applyFilterModel,
  detectColumnFilterType
} from './grid-integration.js'

import type { GridApi } from 'ag-grid-community'
import type { InternalConfig, FilterState } from './types.js'

describe('Grid Integration', () => {
  let mockGridApi: any
  let mockConfig: InternalConfig
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGridApi = {
      getFilterModel: vi.fn(),
      setFilterModel: vi.fn(),
      getColumn: vi.fn()
    }
    mockConfig = {
      gridApi: mockGridApi,
      paramPrefix: 'f_',
      maxValueLength: 200,
      onParseError: vi.fn()
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('detectColumnFilterType', () => {
    it('should detect number filter type', () => {
      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agNumberColumnFilter' })
      })

      const result = detectColumnFilterType(mockGridApi, 'age')
      expect(result).toBe('number')
    })

    it('should detect date filter type', () => {
      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agDateColumnFilter' })
      })

      const result = detectColumnFilterType(mockGridApi, 'created')
      expect(result).toBe('date')
    })

    it('should default to text filter type', () => {
      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agTextColumnFilter' })
      })

      const result = detectColumnFilterType(mockGridApi, 'name')
      expect(result).toBe('text')
    })

    it('should handle missing column', () => {
      mockGridApi.getColumn.mockReturnValue(null)

      const result = detectColumnFilterType(mockGridApi, 'nonexistent')
      expect(result).toBe('text')
    })

    it('should handle column without filter definition', () => {
      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({})
      })

      const result = detectColumnFilterType(mockGridApi, 'nofilter')
      expect(result).toBe('text')
    })
  })

  describe('getFilterModel', () => {
    it('should convert text filters from AG Grid', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        name: { filterType: 'text', type: 'contains', filter: 'john' },
        status: { filterType: 'text', type: 'equals', filter: 'active' }
      })

      const result = getFilterModel(mockConfig)

      expect(result).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'john' },
        status: { filterType: 'text', type: 'eq', filter: 'active' }
      })
    })

    it('should convert number filters from AG Grid', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        age: { filterType: 'number', type: 'equals', filter: 25 },
        salary: { filterType: 'number', type: 'notEqual', filter: 0 }
      })

      const result = getFilterModel(mockConfig)

      expect(result).toEqual({
        age: { filterType: 'number', type: 'eq', filter: 25 },
        salary: { filterType: 'number', type: 'notEqual', filter: 0 }
      })
    })

    it('should convert date filters from AG Grid', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        created: { filterType: 'date', type: 'equals', dateFrom: '2024-01-15' },
        deadline: {
          filterType: 'date',
          type: 'lessThan',
          dateFrom: '2024-12-31'
        },
        period: {
          filterType: 'date',
          type: 'inRange',
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31'
        }
      })

      const result = getFilterModel(mockConfig)

      expect(result).toEqual({
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

    it('should handle date filters with filter field fallback', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        created: { filterType: 'date', type: 'equals', filter: '2024-01-15' }
      })

      const result = getFilterModel(mockConfig)

      expect(result).toEqual({
        created: { filterType: 'date', type: 'eq', filter: '2024-01-15' }
      })
    })

    it('should handle blank operations', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        optional: { filterType: 'text', type: 'blank' },
        required: { filterType: 'text', type: 'notBlank' }
      })

      const result = getFilterModel(mockConfig)

      expect(result).toEqual({
        optional: { filterType: 'text', type: 'blank', filter: '' },
        required: { filterType: 'text', type: 'notBlank', filter: '' }
      })
    })

    it('should handle errors gracefully', () => {
      mockGridApi.getFilterModel.mockImplementation(() => {
        throw new Error('Grid API Error')
      })

      const result = getFilterModel(mockConfig)

      expect(result).toEqual({})
      expect(mockConfig.onParseError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should handle null filter model', () => {
      mockGridApi.getFilterModel.mockReturnValue(null)

      const result = getFilterModel(mockConfig)

      expect(result).toEqual({})
    })

    it('should skip invalid number filters', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        age: {
          filterType: 'number',
          type: 'greaterThan',
          filter: 'not-a-number'
        },
        salary: { filterType: 'number', type: 'equals', filter: 50000 }
      })

      const result = getFilterModel(mockConfig)

      expect(result).toEqual({
        salary: { filterType: 'number', type: 'eq', filter: 50000 }
      })
    })
  })

  describe('applyFilterModel', () => {
    it('should apply text filters to AG Grid', () => {
      const filterState: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: 'john' },
        status: { filterType: 'text', type: 'eq', filter: 'active' }
      }

      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agTextColumnFilter' })
      })

      applyFilterModel(filterState, mockConfig)

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        name: { filterType: 'text', type: 'contains', filter: 'john' },
        status: { filterType: 'text', type: 'equals', filter: 'active' }
      })
    })

    it('should apply number filters to AG Grid', () => {
      const filterState: FilterState = {
        age: { filterType: 'number', type: 'greaterThan', filter: 25 },
        salary: {
          filterType: 'number',
          type: 'inRange',
          filter: 50000,
          filterTo: 100000
        } as any
      }

      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agNumberColumnFilter' })
      })

      applyFilterModel(filterState, mockConfig)

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        age: { filterType: 'number', type: 'greaterThan', filter: 25 },
        salary: {
          filterType: 'number',
          type: 'inRange',
          filter: 50000,
          filterTo: 100000
        }
      })
    })

    it('should apply date filters to AG Grid', () => {
      const filterState: FilterState = {
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
        } as any
      }

      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agDateColumnFilter' })
      })

      applyFilterModel(filterState, mockConfig)

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        created: {
          filterType: 'date',
          type: 'equals',
          dateFrom: '2024-01-15',
          dateTo: null
        },
        deadline: {
          filterType: 'date',
          type: 'lessThan',
          dateFrom: '2024-12-31',
          dateTo: null
        },
        period: {
          filterType: 'date',
          type: 'inRange',
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31'
        }
      })
    })

    it('should handle date blank operations', () => {
      const filterState: FilterState = {
        optional: { filterType: 'date', type: 'blank', filter: '' },
        required: { filterType: 'date', type: 'notBlank', filter: '' }
      }

      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agDateColumnFilter' })
      })

      applyFilterModel(filterState, mockConfig)

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        optional: {
          filterType: 'date',
          type: 'blank',
          dateFrom: null,
          dateTo: null
        },
        required: {
          filterType: 'date',
          type: 'notBlank',
          dateFrom: null,
          dateTo: null
        }
      })
    })

    it('should handle number range without filterTo', () => {
      const filterState: FilterState = {
        age: { filterType: 'number', type: 'inRange', filter: 25 } as any
      }

      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agNumberColumnFilter' })
      })

      applyFilterModel(filterState, mockConfig)

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        age: { filterType: 'number', type: 'inRange', filter: 25 }
      })
    })

    it('should warn on filter type mismatch - date filter on non-date column', () => {
      const filterState: FilterState = {
        name: { filterType: 'date', type: 'eq', filter: '2024-01-15' }
      }

      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agTextColumnFilter' })
      })

      applyFilterModel(filterState, mockConfig)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Column 'name' expects a text filter but received a date filter"
        )
      )
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
    })

    it('should warn on filter type mismatch - number filter on non-number column', () => {
      const filterState: FilterState = {
        name: { filterType: 'number', type: 'eq', filter: 25 }
      }

      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agTextColumnFilter' })
      })

      applyFilterModel(filterState, mockConfig)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Column 'name' expects a text filter but received a number filter"
        )
      )
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
    })

    it('should skip invalid filter objects', () => {
      const filterState: FilterState = {
        valid: { filterType: 'text', type: 'contains', filter: 'john' },
        invalid: null as any,
        alsoinvalid: 'not-an-object' as any
      }

      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agTextColumnFilter' })
      })

      applyFilterModel(filterState, mockConfig)

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        valid: { filterType: 'text', type: 'contains', filter: 'john' }
      })
    })

    it('should handle errors gracefully', () => {
      const filterState: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }

      mockGridApi.setFilterModel.mockImplementation(() => {
        throw new Error('Grid API Error')
      })

      expect(() => applyFilterModel(filterState, mockConfig)).not.toThrow()
      expect(mockConfig.onParseError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should handle all date operation mappings', () => {
      const filterState: FilterState = {
        before: {
          filterType: 'date',
          type: 'dateBefore',
          filter: '2024-12-31'
        },
        beforeEq: {
          filterType: 'date',
          type: 'dateBeforeOrEqual',
          filter: '2024-12-31'
        },
        after: { filterType: 'date', type: 'dateAfter', filter: '2024-01-01' },
        afterEq: {
          filterType: 'date',
          type: 'dateAfterOrEqual',
          filter: '2024-01-01'
        }
      }

      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agDateColumnFilter' })
      })

      applyFilterModel(filterState, mockConfig)

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        before: {
          filterType: 'date',
          type: 'lessThan',
          dateFrom: '2024-12-31',
          dateTo: null
        },
        beforeEq: {
          filterType: 'date',
          type: 'lessThanOrEqual',
          dateFrom: '2024-12-31',
          dateTo: null
        },
        after: {
          filterType: 'date',
          type: 'greaterThan',
          dateFrom: '2024-01-01',
          dateTo: null
        },
        afterEq: {
          filterType: 'date',
          type: 'greaterThanOrEqual',
          dateFrom: '2024-01-01',
          dateTo: null
        }
      })
    })
  })
})

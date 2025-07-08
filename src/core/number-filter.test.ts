import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getFilterModel, applyFilterModel } from './grid-integration.js'
import type { InternalConfig, FilterState } from './types.js'

describe('Number Filter Operations', () => {
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
      onParseError: vi.fn(),
      serialization: 'individual',
      format: 'querystring',
      groupedParam: 'grid_filters'
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('Basic number filter operations', () => {
    it.each([
      ['greaterThan', 25, 'greaterThan'],
      ['lessThan', 100, 'lessThan'],
      ['greaterThanOrEqual', 18, 'greaterThanOrEqual'],
      ['lessThanOrEqual', 65, 'lessThanOrEqual'],
      ['equals', 42, 'eq'], // Note the mapping to 'eq'
      ['notEqual', 0, 'notEqual']
    ])(
      'should correctly parse %s number filter',
      (agGridType, value, expectedType) => {
        mockGridApi.getFilterModel.mockReturnValue({
          testField: {
            filterType: 'number',
            type: agGridType,
            filter: value
          }
        })

        const result = getFilterModel(mockConfig)

        expect(result).toEqual({
          testField: {
            filterType: 'number',
            type: expectedType,
            filter: value
          }
        })
        expect(Object.keys(result)).toHaveLength(1)
      }
    )

    it('should correctly parse inRange number filter', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        range: {
          filterType: 'number',
          type: 'inRange',
          filter: 10,
          filterTo: 50
        }
      })

      const result = getFilterModel(mockConfig)

      expect(result).toEqual({
        range: {
          filterType: 'number',
          type: 'inRange',
          filter: 10,
          filterTo: 50
        }
      })
      expect(Object.keys(result)).toHaveLength(1)
    })

    it('should correctly parse blank and notBlank number filters', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        optional: {
          filterType: 'number',
          type: 'blank',
          filter: null // Blank operations may have null values
        },
        required: {
          filterType: 'number',
          type: 'notBlank',
          filter: null
        }
      })

      const result = getFilterModel(mockConfig)

      // The implementation converts null/undefined to 0 for blank operations
      expect(result).toEqual({
        optional: {
          filterType: 'number',
          type: 'blank',
          filter: 0
        },
        required: {
          filterType: 'number',
          type: 'notBlank',
          filter: 0
        }
      })
      expect(Object.keys(result)).toHaveLength(2)
    })
  })

  describe('Integration scenarios', () => {
    it('should handle mixed filter types without dropping number filters', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        name: { filterType: 'text', type: 'contains', filter: 'john' },
        age: { filterType: 'number', type: 'greaterThan', filter: 25 },
        created: {
          filterType: 'date',
          type: 'lessThan',
          dateFrom: '2024-01-01'
        }
      })

      const result = getFilterModel(mockConfig)

      // All 3 filters should be preserved
      expect(Object.keys(result)).toHaveLength(3)
      expect(result.name).toBeDefined()
      expect(result.age).toBeDefined()
      expect(result.created).toBeDefined()

      // Specifically verify the number filter wasn't dropped
      expect(result.age).toEqual({
        filterType: 'number',
        type: 'greaterThan',
        filter: 25
      })
    })

    it('should maintain number filter integrity through apply -> get cycle', () => {
      // Set up mock for applyFilterModel
      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agNumberColumnFilter' })
      })

      const originalFilterState: FilterState = {
        age: { filterType: 'number', type: 'greaterThan', filter: 25 },
        salary: {
          filterType: 'number',
          type: 'inRange',
          filter: 50000,
          filterTo: 100000
        }
      }

      // Apply the filters
      applyFilterModel(originalFilterState, mockConfig)

      // Verify setFilterModel was called with correct AG Grid format
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        age: { filterType: 'number', type: 'greaterThan', filter: 25 },
        salary: {
          filterType: 'number',
          type: 'inRange',
          filter: 50000,
          filterTo: 100000
        }
      })

      // Now mock the getFilterModel to return what AG Grid would return
      mockGridApi.getFilterModel.mockReturnValue({
        age: { filterType: 'number', type: 'greaterThan', filter: 25 },
        salary: {
          filterType: 'number',
          type: 'inRange',
          filter: 50000,
          filterTo: 100000
        }
      })

      // Get the filters back
      const retrievedFilterState = getFilterModel(mockConfig)

      // Should match the original (no filters dropped)
      expect(retrievedFilterState).toEqual(originalFilterState)
    })
  })

  describe('Edge cases', () => {
    it('should handle number filters with string values by converting them', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        age: {
          filterType: 'number',
          type: 'greaterThan',
          filter: '25' // String instead of number
        }
      })

      const result = getFilterModel(mockConfig)

      expect(result).toEqual({
        age: {
          filterType: 'number',
          type: 'greaterThan',
          filter: 25 // Should be converted to number
        }
      })
    })

    it('should drop number filters with invalid (NaN) values', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        validAge: { filterType: 'number', type: 'greaterThan', filter: 25 },
        invalidAge: {
          filterType: 'number',
          type: 'greaterThan',
          filter: 'not-a-number'
        }
      })

      const result = getFilterModel(mockConfig)

      // Only the valid number filter should remain
      expect(result).toEqual({
        validAge: {
          filterType: 'number',
          type: 'greaterThan',
          filter: 25
        }
      })
      expect(Object.keys(result)).toHaveLength(1)
    })

    it('should call onParseError for unknown number filter operations', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        validAge: { filterType: 'number', type: 'greaterThan', filter: 25 },
        invalidOperation: {
          filterType: 'number',
          type: 'unknownOperation',
          filter: 50
        }
      })

      const result = getFilterModel(mockConfig)

      // Only the valid filter should remain
      expect(result).toEqual({
        validAge: {
          filterType: 'number',
          type: 'greaterThan',
          filter: 25
        }
      })
      expect(Object.keys(result)).toHaveLength(1)

      // Should have called onParseError with appropriate error message
      expect(mockConfig.onParseError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            "Unknown number filter operation 'unknownOperation' for column 'invalidOperation'"
          )
        })
      )
    })
  })

  describe('Demonstrating the actual bug in issue #37', () => {
    it('should demonstrate how the number filters were dropped before the fix', () => {
      /**
       * This test specifically recreates the issue described in issue #37
       *
       * Before the fix:
       * 1. AG Grid returns { filterType: 'number', type: 'greaterThan', filter: 25 }
       * 2. REVERSE_AG_GRID_OPERATION_NAMES["greaterThan"] returns "dateAfter"
       * 3. isNumberFilterOperation("dateAfter") returns false
       * 4. The filter is skipped and not included in the result
       *
       * After the fix:
       * 1. AG Grid returns { filterType: 'number', type: 'greaterThan', filter: 25 }
       * 2. AG_GRID_TO_NUMBER_OPERATION_MAP["greaterThan"] returns "greaterThan"
       * 3. isNumberFilterOperation("greaterThan") returns true
       * 4. The filter is correctly included in the result
       */

      // Mock the scenario in the issue
      mockGridApi.getFilterModel.mockReturnValue({
        age: {
          filterType: 'number',
          type: 'greaterThan',
          filter: 25
        }
      })

      const result = getFilterModel(mockConfig)

      // After the fix, the filter should be included
      expect(result).toEqual({
        age: {
          filterType: 'number',
          type: 'greaterThan',
          filter: 25
        }
      })

      // This would have been an empty object {} before the fix
      expect(Object.keys(result)).toHaveLength(1)
    })

    it('should demonstrate how the fix handles all number filter operations correctly', () => {
      // Test all number operations that would have been affected by the bug
      const agGridFilterModel = {
        gt: { filterType: 'number', type: 'greaterThan', filter: 10 },
        gte: { filterType: 'number', type: 'greaterThanOrEqual', filter: 20 },
        lt: { filterType: 'number', type: 'lessThan', filter: 30 },
        lte: { filterType: 'number', type: 'lessThanOrEqual', filter: 40 },
        eq: { filterType: 'number', type: 'equals', filter: 50 },
        ne: { filterType: 'number', type: 'notEqual', filter: 60 },
        range: {
          filterType: 'number',
          type: 'inRange',
          filter: 70,
          filterTo: 80
        }
      }

      mockGridApi.getFilterModel.mockReturnValue(agGridFilterModel)

      const result = getFilterModel(mockConfig)

      // Verify all filters are preserved (would have been dropped before the fix)
      expect(Object.keys(result)).toHaveLength(7)

      // Check specific mappings
      expect(result.gt.type).toBe('greaterThan')
      expect(result.gte.type).toBe('greaterThanOrEqual')
      expect(result.lt.type).toBe('lessThan')
      expect(result.lte.type).toBe('lessThanOrEqual')
      expect(result.eq.type).toBe('eq') // Special case: 'equals' maps to 'eq'
      expect(result.ne.type).toBe('notEqual')
      expect(result.range.type).toBe('inRange')

      // Values should be preserved
      expect(result.gt.filter).toBe(10)
      expect(result.gte.filter).toBe(20)
      expect(result.lt.filter).toBe(30)
      expect(result.lte.filter).toBe(40)
      expect(result.eq.filter).toBe(50)
      expect(result.ne.filter).toBe(60)
      expect(result.range.filter).toBe(70)
      // For range operations, we need to cast to access filterTo
      expect((result.range as any).filterTo).toBe(80)
    })
  })
})

import { describe, expect, it, vi } from 'vitest'
import type {
  FilterState,
  GridApi,
  InternalConfig,
  NumberFilterOperation
} from './types.js'
import { applyFilterModel, detectColumnFilterType } from './grid-integration.js'
import { serializeFilters } from './url-generator.js'
import { parseFilterParam, parseUrlFilters } from './url-parser.js'
import {
  validateNumberFilter,
  validateAndParseNumber,
  validateNumberRange
} from './validation.js'

describe('Number Filter Operations', () => {
  const mockConfig: InternalConfig = {
    gridApi: {} as any,
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: vi.fn()
  }

  describe('Single Value Number Operations', () => {
    const singleValueOperations: Array<{
      urlOp: string
      internalOp: NumberFilterOperation
      agGridOp: string
      value: number
      expectedUrl: string
    }> = [
      {
        urlOp: 'eq',
        internalOp: 'eq',
        agGridOp: 'equals',
        value: 25,
        expectedUrl: 'f_age_eq=25'
      },
      {
        urlOp: 'neq',
        internalOp: 'notEqual',
        agGridOp: 'notEqual',
        value: 25,
        expectedUrl: 'f_age_neq=25'
      },
      {
        urlOp: 'gt',
        internalOp: 'greaterThan',
        agGridOp: 'greaterThan',
        value: 18,
        expectedUrl: 'f_age_gt=18'
      },
      {
        urlOp: 'gte',
        internalOp: 'greaterThanOrEqual',
        agGridOp: 'greaterThanOrEqual',
        value: 18,
        expectedUrl: 'f_age_gte=18'
      },
      {
        urlOp: 'lt',
        internalOp: 'lessThan',
        agGridOp: 'lessThan',
        value: 65,
        expectedUrl: 'f_age_lt=65'
      },
      {
        urlOp: 'lte',
        internalOp: 'lessThanOrEqual',
        agGridOp: 'lessThanOrEqual',
        value: 65,
        expectedUrl: 'f_age_lte=65'
      }
    ]

    describe.each(singleValueOperations)(
      'Operation: $urlOp',
      ({ urlOp, internalOp, agGridOp, value, expectedUrl }) => {
        it('should parse URL parameter correctly', () => {
          const result = parseFilterParam(`f_age_${urlOp}`, value.toString())
          expect(result).toEqual({
            filterType: 'number',
            type: internalOp,
            filter: value
          })
        })

        it('should parse URL filters correctly', () => {
          const url = `https://example.com?${expectedUrl}`
          const filters = parseUrlFilters(url, mockConfig)
          expect(filters.age).toEqual({
            filterType: 'number',
            type: internalOp,
            filter: value
          })
        })

        it('should serialize to URL correctly', () => {
          const filterState: FilterState = {
            age: {
              filterType: 'number',
              type: internalOp,
              filter: value
            }
          }
          const params = serializeFilters(filterState, mockConfig)
          expect(params.toString()).toBe(expectedUrl)
        })

        it('should apply to AG Grid correctly', () => {
          const mockGridApi = {
            setFilterModel: vi.fn(),
            getColumn: vi.fn().mockReturnValue({
              getColDef: () => ({ filter: 'agNumberColumnFilter' })
            })
          } as unknown as GridApi

          const testConfig = { ...mockConfig, gridApi: mockGridApi }
          const filterState: FilterState = {
            age: {
              filterType: 'number',
              type: internalOp,
              filter: value
            }
          }

          applyFilterModel(filterState, testConfig)
          expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
            age: {
              filterType: 'number',
              type: agGridOp,
              filter: value
            }
          })
        })
      }
    )
  })

  describe('Range Operations', () => {
    it('should parse range operation correctly', () => {
      const result = parseFilterParam('f_age_range', '18,65')
      expect(result).toEqual({
        filterType: 'number',
        type: 'inRange',
        filter: 18,
        filterTo: 65
      })
    })

    it('should parse URL with range filter correctly', () => {
      const url = 'https://example.com?f_age_range=18,65'
      const filters = parseUrlFilters(url, mockConfig)
      expect(filters.age).toEqual({
        filterType: 'number',
        type: 'inRange',
        filter: 18,
        filterTo: 65
      })
    })

    it('should serialize range filter to URL correctly', () => {
      const filterState: FilterState = {
        age: {
          filterType: 'number',
          type: 'inRange',
          filter: 18,
          filterTo: 65
        } as any
      }
      const params = serializeFilters(filterState, mockConfig)
      expect(params.toString()).toBe('f_age_range=18%2C65')
    })

    it('should apply range filter to AG Grid correctly', () => {
      const mockGridApi = {
        setFilterModel: vi.fn(),
        getColumn: vi.fn().mockReturnValue({
          getColDef: () => ({ filter: 'agNumberColumnFilter' })
        })
      } as unknown as GridApi

      const testConfig = { ...mockConfig, gridApi: mockGridApi }
      const filterState: FilterState = {
        age: {
          filterType: 'number',
          type: 'inRange',
          filter: 18,
          filterTo: 65
        } as any
      }

      applyFilterModel(filterState, testConfig)
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        age: {
          filterType: 'number',
          type: 'inRange',
          filter: 18,
          filterTo: 65
        }
      })
    })

    it('should validate range min <= max', () => {
      expect(() => parseFilterParam('f_age_range', '65,18')).toThrow(
        'Range minimum must be less than or equal to maximum'
      )
    })

    it('should require exactly two values for range', () => {
      expect(() => parseFilterParam('f_age_range', '18')).toThrow(
        'Range operation requires exactly two values separated by comma'
      )
      expect(() => parseFilterParam('f_age_range', '18,25,65')).toThrow(
        'Range operation requires exactly two values separated by comma'
      )
    })
  })

  describe('Blank Operations for Numbers', () => {
    it('should handle blank operation on number columns', () => {
      const result = parseFilterParam('f_salary_blank', 'true')
      expect(result).toEqual({
        filterType: 'text', // Default to text for backward compatibility
        type: 'blank',
        filter: ''
      })
    })

    it('should handle notBlank operation on number columns', () => {
      const result = parseFilterParam('f_salary_notBlank', 'true')
      expect(result).toEqual({
        filterType: 'text', // Default to text for backward compatibility
        type: 'notBlank',
        filter: ''
      })
    })

    it('should serialize blank operations correctly', () => {
      const filterState: FilterState = {
        salary: {
          filterType: 'text',
          type: 'blank',
          filter: ''
        }
      }
      const params = serializeFilters(filterState, mockConfig)
      expect(params.toString()).toBe('f_salary_blank=true')
    })
  })

  describe('Number Validation', () => {
    it('should validate finite numbers', () => {
      const result = validateNumberFilter(42)
      expect(result.valid).toBe(true)
    })

    it('should reject infinite numbers', () => {
      const result = validateNumberFilter(Infinity)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Filter value must be a finite number')
    })

    it('should reject NaN', () => {
      const result = validateNumberFilter(NaN)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Filter value must be a finite number')
    })

    it('should reject numbers exceeding safe integer range', () => {
      const result = validateNumberFilter(Number.MAX_SAFE_INTEGER + 1)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Number value exceeds safe integer range')
    })

    it('should validate and parse valid number strings', () => {
      expect(validateAndParseNumber('42')).toBe(42)
      expect(validateAndParseNumber('3.14')).toBe(3.14)
      expect(validateAndParseNumber('-10')).toBe(-10)
    })

    it('should reject invalid number strings', () => {
      expect(() => validateAndParseNumber('not-a-number')).toThrow(
        'Invalid number format'
      )
      expect(() => validateAndParseNumber('')).toThrow(
        'Number filter value cannot be empty'
      )
      expect(() => validateAndParseNumber('   ')).toThrow(
        'Number filter value cannot be empty'
      )
    })

    it('should validate number ranges', () => {
      const validRange = validateNumberRange(10, 20)
      expect(validRange.valid).toBe(true)

      const invalidRange = validateNumberRange(20, 10)
      expect(invalidRange.valid).toBe(false)
      expect(invalidRange.error).toBe(
        'Range minimum must be less than or equal to maximum'
      )
    })
  })

  describe('Column Type Detection', () => {
    it('should detect number columns by filter type', () => {
      const mockGridApi = {
        getColumn: vi.fn().mockReturnValue({
          getColDef: () => ({ filter: 'agNumberColumnFilter' })
        })
      } as unknown as GridApi

      const result = detectColumnFilterType(mockGridApi, 'salary')
      expect(result).toBe('number')
    })

    it('should detect number columns by cell data type', () => {
      const mockGridApi = {
        getColumn: vi.fn().mockReturnValue({
          getColDef: () => ({ cellDataType: 'number' })
        })
      } as unknown as GridApi

      const result = detectColumnFilterType(mockGridApi, 'age')
      expect(result).toBe('number')
    })

    it('should default to text for ambiguous columns', () => {
      const mockGridApi = {
        getColumn: vi.fn().mockReturnValue({
          getColDef: () => ({})
        })
      } as unknown as GridApi

      const result = detectColumnFilterType(mockGridApi, 'unknown')
      expect(result).toBe('text')
    })

    it('should handle non-existent columns gracefully', () => {
      const mockGridApi = {
        getColumn: vi.fn().mockReturnValue(null)
      } as unknown as GridApi

      const result = detectColumnFilterType(mockGridApi, 'nonexistent')
      expect(result).toBe('text')
    })

    it('should handle errors gracefully', () => {
      const mockGridApi = {
        getColumn: vi.fn().mockImplementation(() => {
          throw new Error('Grid error')
        })
      } as unknown as GridApi

      const result = detectColumnFilterType(mockGridApi, 'error-column')
      expect(result).toBe('text')
    })
  })

  describe('Edge Cases', () => {
    it('should handle decimal numbers correctly', () => {
      const result = parseFilterParam('f_price_eq', '99.99')
      expect(result).toEqual({
        filterType: 'number',
        type: 'eq',
        filter: 99.99
      })
    })

    it('should handle negative numbers correctly', () => {
      const result = parseFilterParam('f_balance_lt', '-100')
      expect(result).toEqual({
        filterType: 'number',
        type: 'lessThan',
        filter: -100
      })
    })

    it('should handle scientific notation', () => {
      const result = parseFilterParam('f_distance_gt', '1e6')
      expect(result).toEqual({
        filterType: 'number',
        type: 'greaterThan',
        filter: 1000000
      })
    })

    it('should handle zero values', () => {
      const result = parseFilterParam('f_count_eq', '0')
      expect(result).toEqual({
        filterType: 'number',
        type: 'eq',
        filter: 0
      })
    })

    it('should handle very large safe integers', () => {
      const largeNumber = Number.MAX_SAFE_INTEGER
      const result = parseFilterParam('f_big_number_eq', largeNumber.toString())
      expect(result).toEqual({
        filterType: 'number',
        type: 'eq',
        filter: largeNumber
      })
    })
  })

  describe('Complex Number Filter Scenarios', () => {
    it('should handle multiple number filters in single URL', () => {
      const url =
        'https://example.com?f_age_gt=25&f_salary_range=50000,100000&f_score_lte=95'
      const filters = parseUrlFilters(url, mockConfig)

      expect(filters.age).toEqual({
        filterType: 'number',
        type: 'greaterThan',
        filter: 25
      })
      expect(filters.salary).toEqual({
        filterType: 'number',
        type: 'inRange',
        filter: 50000,
        filterTo: 100000
      })
      expect(filters.score).toEqual({
        filterType: 'number',
        type: 'lessThanOrEqual',
        filter: 95
      })
    })

    it('should serialize mixed number filter types correctly', () => {
      const filterState: FilterState = {
        age: {
          filterType: 'number',
          type: 'greaterThan',
          filter: 25
        },
        salary: {
          filterType: 'number',
          type: 'inRange',
          filter: 50000,
          filterTo: 100000
        } as any
      }

      const params = serializeFilters(filterState, mockConfig)
      const paramStr = params.toString()

      expect(paramStr).toContain('f_age_gt=25')
      expect(paramStr).toContain('f_salary_range=50000%2C100000')
    })
  })

  describe('Round-trip Consistency', () => {
    it('should maintain data integrity in round-trip conversion for single values', () => {
      const originalValue = 12345.67
      const filterState: FilterState = {
        price: {
          filterType: 'number',
          type: 'eq',
          filter: originalValue
        }
      }

      // Convert to URL
      const params = serializeFilters(filterState, mockConfig)
      const urlString = params.toString()

      // Parse back from URL
      const testUrl = `https://example.com?${urlString}`
      const parsedState = parseUrlFilters(testUrl, mockConfig)

      expect(parsedState.price.filter).toBe(originalValue)
      expect(parsedState.price.type).toBe('eq')
      expect(parsedState.price.filterType).toBe('number')
    })

    it('should maintain data integrity in round-trip conversion for ranges', () => {
      const filterState: FilterState = {
        age: {
          filterType: 'number',
          type: 'inRange',
          filter: 25,
          filterTo: 65
        } as any
      }

      // Convert to URL
      const params = serializeFilters(filterState, mockConfig)
      const urlString = params.toString()

      // Parse back from URL
      const testUrl = `https://example.com?${urlString}`
      const parsedState = parseUrlFilters(testUrl, mockConfig)

      expect(parsedState.age.filter).toBe(25)
      expect((parsedState.age as any).filterTo).toBe(65)
      expect(parsedState.age.type).toBe('inRange')
      expect(parsedState.age.filterType).toBe('number')
    })
  })
})

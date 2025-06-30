import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseFilterParam, parseUrlFilters } from './url-parser.js'
import { InvalidFilterError, InvalidURLError } from './types.js'
import type { InternalConfig, FilterState } from './types.js'

describe('URL Parser', () => {
  const mockConfig: InternalConfig = {
    gridApi: {} as any,
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('parseFilterParam', () => {
    describe('Text Filter Operations', () => {
      it('should parse text contains operation', () => {
        const result = parseFilterParam('f_name_contains', 'john', 'f_')

        expect(result).toEqual({
          filterType: 'text',
          type: 'contains',
          filter: 'john'
        })
      })

      it('should parse text equals operation', () => {
        const result = parseFilterParam('f_status_eq', 'active', 'f_')

        expect(result).toEqual({
          filterType: 'text',
          type: 'eq',
          filter: 'active'
        })
      })

      it('should parse text not equals operation', () => {
        const result = parseFilterParam('f_status_neq', 'inactive', 'f_')

        expect(result).toEqual({
          filterType: 'text',
          type: 'notEqual',
          filter: 'inactive'
        })
      })

      it('should parse text starts with operation', () => {
        const result = parseFilterParam('f_email_startsWith', 'admin', 'f_')

        expect(result).toEqual({
          filterType: 'text',
          type: 'startsWith',
          filter: 'admin'
        })
      })

      it('should parse text ends with operation', () => {
        const result = parseFilterParam('f_description_endsWith', 'test', 'f_')

        expect(result).toEqual({
          filterType: 'text',
          type: 'endsWith',
          filter: 'test'
        })
      })

      it('should parse text not contains operation', () => {
        const result = parseFilterParam('f_tags_notContains', 'spam', 'f_')

        expect(result).toEqual({
          filterType: 'text',
          type: 'notContains',
          filter: 'spam'
        })
      })
    })

    describe('Number Filter Operations', () => {
      it('should parse number equals operation', () => {
        const result = parseFilterParam('f_age_eq', '25', 'f_')

        expect(result).toEqual({
          filterType: 'number',
          type: 'eq',
          filter: 25
        })
      })

      it('should parse number not equals operation', () => {
        const result = parseFilterParam('f_count_neq', '0', 'f_')

        expect(result).toEqual({
          filterType: 'number',
          type: 'notEqual',
          filter: 0
        })
      })

      it('should parse number less than operation', () => {
        const result = parseFilterParam('f_score_lt', '100', 'f_')

        expect(result).toEqual({
          filterType: 'number',
          type: 'lessThan',
          filter: 100
        })
      })

      it('should parse number less than or equal operation', () => {
        const result = parseFilterParam('f_rating_lte', '5', 'f_')

        expect(result).toEqual({
          filterType: 'number',
          type: 'lessThanOrEqual',
          filter: 5
        })
      })

      it('should parse number greater than operation', () => {
        const result = parseFilterParam('f_price_gt', '50.99', 'f_')

        expect(result).toEqual({
          filterType: 'number',
          type: 'greaterThan',
          filter: 50.99
        })
      })

      it('should parse number greater than or equal operation', () => {
        const result = parseFilterParam('f_salary_gte', '75000', 'f_')

        expect(result).toEqual({
          filterType: 'number',
          type: 'greaterThanOrEqual',
          filter: 75000
        })
      })

      it('should parse number range operation', () => {
        const result = parseFilterParam('f_age_range', '25,65', 'f_')

        expect(result).toEqual({
          filterType: 'number',
          type: 'inRange',
          filter: 25,
          filterTo: 65
        })
      })

      it('should handle negative numbers', () => {
        const result = parseFilterParam('f_temperature_eq', '-5.5', 'f_')

        expect(result).toEqual({
          filterType: 'number',
          type: 'eq',
          filter: -5.5
        })
      })

      it('should handle scientific notation', () => {
        const result = parseFilterParam('f_value_eq', '1.5e10', 'f_')

        expect(result).toEqual({
          filterType: 'number',
          type: 'eq',
          filter: 1.5e10
        })
      })
    })

    describe('Date Filter Operations', () => {
      it('should parse date equals operation', () => {
        const result = parseFilterParam('f_created_eq', '2024-01-15', 'f_')

        expect(result).toEqual({
          filterType: 'date',
          type: 'eq',
          filter: '2024-01-15'
        })
      })

      it('should parse date not equals operation', () => {
        const result = parseFilterParam('f_deadline_neq', '2024-12-31', 'f_')

        expect(result).toEqual({
          filterType: 'date',
          type: 'notEqual',
          filter: '2024-12-31'
        })
      })

      it('should parse date before operation', () => {
        const result = parseFilterParam('f_deadline_before', '2024-12-31', 'f_')

        expect(result).toEqual({
          filterType: 'date',
          type: 'dateBefore',
          filter: '2024-12-31'
        })
      })

      it('should parse date before or equal operation', () => {
        const result = parseFilterParam(
          'f_archived_beforeEq',
          '2024-12-31',
          'f_'
        )

        expect(result).toEqual({
          filterType: 'date',
          type: 'dateBeforeOrEqual',
          filter: '2024-12-31'
        })
      })

      it('should parse date after operation', () => {
        const result = parseFilterParam('f_created_after', '2024-01-01', 'f_')

        expect(result).toEqual({
          filterType: 'date',
          type: 'dateAfter',
          filter: '2024-01-01'
        })
      })

      it('should parse date after or equal operation', () => {
        const result = parseFilterParam('f_updated_afterEq', '2024-06-01', 'f_')

        expect(result).toEqual({
          filterType: 'date',
          type: 'dateAfterOrEqual',
          filter: '2024-06-01'
        })
      })

      it('should parse date range operation', () => {
        const result = parseFilterParam(
          'f_period_daterange',
          '2024-01-01,2024-12-31',
          'f_'
        )

        expect(result).toEqual({
          filterType: 'date',
          type: 'dateRange',
          filter: '2024-01-01',
          filterTo: '2024-12-31'
        })
      })

      it('should handle leap year dates', () => {
        const result = parseFilterParam('f_special_eq', '2024-02-29', 'f_')

        expect(result).toEqual({
          filterType: 'date',
          type: 'eq',
          filter: '2024-02-29'
        })
      })
    })

    describe('Blank Operations', () => {
      it('should parse blank operation for text', () => {
        const result = parseFilterParam('f_optional_blank', 'true', 'f_')

        expect(result).toEqual({
          filterType: 'text',
          type: 'blank',
          filter: ''
        })
      })

      it('should parse not blank operation for text', () => {
        const result = parseFilterParam('f_required_notBlank', 'true', 'f_')

        expect(result).toEqual({
          filterType: 'text',
          type: 'notBlank',
          filter: ''
        })
      })

      it('should ignore parameter value for blank operations', () => {
        const result = parseFilterParam(
          'f_optional_blank',
          'ignored_value',
          'f_'
        )

        expect(result).toEqual({
          filterType: 'text',
          type: 'blank',
          filter: ''
        })
      })
    })

    describe('Shared Operation Type Detection', () => {
      it('should detect date format and create date filter for eq operation', () => {
        const result = parseFilterParam('f_created_eq', '2024-01-15', 'f_')

        expect(result).toEqual({
          filterType: 'date',
          type: 'eq',
          filter: '2024-01-15'
        })
      })

      it('should detect number format and create number filter for eq operation', () => {
        const result = parseFilterParam('f_count_eq', '42', 'f_')

        expect(result).toEqual({
          filterType: 'number',
          type: 'eq',
          filter: 42
        })
      })

      it('should default to text filter for eq operation with text value', () => {
        const result = parseFilterParam('f_name_eq', 'john', 'f_')

        expect(result).toEqual({
          filterType: 'text',
          type: 'eq',
          filter: 'john'
        })
      })

      it('should prioritize date over number for ambiguous values', () => {
        // This tests the priority: Date > Number > Text
        const result = parseFilterParam('f_year_eq', '2024-01-01', 'f_')

        expect(result.filterType).toBe('date')
      })
    })

    describe('Error Handling', () => {
      it('should throw error for invalid operation', () => {
        expect(() =>
          parseFilterParam('f_name_invalidOp', 'value', 'f_')
        ).toThrow(InvalidFilterError)
        expect(() =>
          parseFilterParam('f_name_invalidOp', 'value', 'f_')
        ).toThrow('Unsupported filter operation: invalidOp')
      })

      it('should throw error for invalid parameter format', () => {
        expect(() => parseFilterParam('f_name', 'value', 'f_')).toThrow(
          InvalidFilterError
        )
        expect(() => parseFilterParam('f_name', 'value', 'f_')).toThrow(
          'Invalid filter parameter format'
        )
      })

      it('should throw error for wrong prefix', () => {
        expect(() => parseFilterParam('x_name_eq', 'value', 'f_')).toThrow(
          InvalidFilterError
        )
        expect(() => parseFilterParam('x_name_eq', 'value', 'f_')).toThrow(
          'Invalid filter prefix in parameter'
        )
      })

      it('should throw error for empty column name', () => {
        expect(() => parseFilterParam('f__eq', 'value', 'f_')).toThrow(
          InvalidFilterError
        )
        expect(() => parseFilterParam('f__eq', 'value', 'f_')).toThrow(
          'Empty column name in parameter'
        )
      })

      it('should fall back to text filter for invalid number in shared operations', () => {
        // For shared operations like 'eq', invalid numbers fall back to text instead of throwing
        const result = parseFilterParam('f_age_eq', 'not-a-number', 'f_')

        expect(result).toEqual({
          filterType: 'text',
          type: 'eq',
          filter: 'not-a-number'
        })
      })

      it('should throw error for invalid number format in number-specific operations', () => {
        expect(() =>
          parseFilterParam('f_age_lt', 'not-a-number', 'f_')
        ).toThrow(InvalidFilterError)
      })

      it('should throw error for invalid date format', () => {
        expect(() =>
          parseFilterParam('f_created_after', 'not-a-date', 'f_')
        ).toThrow(InvalidFilterError)
      })

      it('should throw error for invalid date range format', () => {
        expect(() =>
          parseFilterParam('f_period_daterange', '2024-01-01', 'f_')
        ).toThrow(InvalidFilterError)
        expect(() =>
          parseFilterParam(
            'f_period_daterange',
            '2024-01-01,invalid-date',
            'f_'
          )
        ).toThrow(InvalidFilterError)
      })

      it('should throw error for invalid number range format', () => {
        expect(() => parseFilterParam('f_age_range', '25', 'f_')).toThrow(
          InvalidFilterError
        )
        expect(() => parseFilterParam('f_age_range', '25,abc', 'f_')).toThrow(
          InvalidFilterError
        )
      })

      it('should throw error for invalid date range order', () => {
        expect(() =>
          parseFilterParam('f_period_daterange', '2024-12-31,2024-01-01', 'f_')
        ).toThrow(InvalidFilterError)
      })

      it('should throw error for invalid number range order', () => {
        expect(() => parseFilterParam('f_age_range', '65,25', 'f_')).toThrow(
          InvalidFilterError
        )
      })
    })

    describe('Custom Prefix Support', () => {
      it('should work with custom prefix', () => {
        const result = parseFilterParam(
          'filter_name_contains',
          'john',
          'filter_'
        )

        expect(result).toEqual({
          filterType: 'text',
          type: 'contains',
          filter: 'john'
        })
      })

      it('should work with default prefix when none provided', () => {
        const result = parseFilterParam('f_name_contains', 'john')

        expect(result).toEqual({
          filterType: 'text',
          type: 'contains',
          filter: 'john'
        })
      })
    })
  })

  describe('parseUrlFilters', () => {
    describe('Basic URL Parsing', () => {
      it('should parse single text filter from URL', () => {
        const url = 'https://example.com?f_name_contains=john'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          }
        })
      })

      it('should parse multiple filters from URL', () => {
        const url =
          'https://example.com?f_name_contains=john&f_age_gte=25&f_created_after=2024-01-01'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          },
          age: {
            filterType: 'number',
            type: 'greaterThanOrEqual',
            filter: 25
          },
          created: {
            filterType: 'date',
            type: 'dateAfter',
            filter: '2024-01-01'
          }
        })
      })

      it('should parse query string without protocol', () => {
        const url = '?f_name_contains=john&f_age_eq=25'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          },
          age: {
            filterType: 'number',
            type: 'eq',
            filter: 25
          }
        })
      })

      it('should ignore non-filter parameters', () => {
        const url =
          'https://example.com?f_name_contains=john&other=value&page=1'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          }
        })
        expect(result.other).toBeUndefined()
        expect(result.page).toBeUndefined()
      })

      it('should handle URL with fragments', () => {
        const url =
          'https://example.com/path?f_name_contains=john&f_status_eq=active#section'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          },
          status: {
            filterType: 'text',
            type: 'eq',
            filter: 'active'
          }
        })
      })
    })

    describe('Special Characters and Encoding', () => {
      it('should handle URL encoded values', () => {
        const url = 'https://example.com?f_query_contains=search%20term'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          query: {
            filterType: 'text',
            type: 'contains',
            filter: 'search term'
          }
        })
      })

      it('should handle special characters in values', () => {
        const url =
          'https://example.com?f_description_contains=test%20%26%20more'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          description: {
            filterType: 'text',
            type: 'contains',
            filter: 'test & more'
          }
        })
      })

      it('should handle Unicode characters', () => {
        const url = 'https://example.com?f_name_contains=café'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'café'
          }
        })
      })
    })

    describe('Range Operations', () => {
      it('should parse number range filters', () => {
        const url =
          'https://example.com?f_age_range=25,65&f_salary_range=50000,100000'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          age: {
            filterType: 'number',
            type: 'inRange',
            filter: 25,
            filterTo: 65
          },
          salary: {
            filterType: 'number',
            type: 'inRange',
            filter: 50000,
            filterTo: 100000
          }
        })
      })

      it('should parse date range filters', () => {
        const url =
          'https://example.com?f_period_daterange=2024-01-01,2024-12-31'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          period: {
            filterType: 'date',
            type: 'dateRange',
            filter: '2024-01-01',
            filterTo: '2024-12-31'
          }
        })
      })
    })

    describe('Blank Operations', () => {
      it('should parse blank operations', () => {
        const url =
          'https://example.com?f_optional_blank=true&f_required_notBlank=true'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          optional: {
            filterType: 'text',
            type: 'blank',
            filter: ''
          },
          required: {
            filterType: 'text',
            type: 'notBlank',
            filter: ''
          }
        })
      })
    })

    describe('Edge Cases', () => {
      it('should return empty object for empty URL', () => {
        const result = parseUrlFilters('', mockConfig)
        expect(result).toEqual({})
      })

      it('should return empty object for whitespace-only URL', () => {
        const result = parseUrlFilters('   ', mockConfig)
        expect(result).toEqual({})
      })

      it('should handle URL with no query parameters', () => {
        const url = 'https://example.com'
        const result = parseUrlFilters(url, mockConfig)
        expect(result).toEqual({})
      })

      it('should handle URL with only non-filter parameters', () => {
        const url = 'https://example.com?page=1&sort=name'
        const result = parseUrlFilters(url, mockConfig)
        expect(result).toEqual({})
      })

      it('should handle duplicate parameter names (uses last value)', () => {
        const url =
          'https://example.com?f_name_contains=first&f_name_contains=second'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'second'
          }
        })
      })

      it('should handle empty parameter values', () => {
        const url = 'https://example.com?f_name_contains=&f_status_eq='
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          name: {
            filterType: 'text',
            type: 'contains',
            filter: ''
          },
          status: {
            filterType: 'text',
            type: 'eq',
            filter: ''
          }
        })
      })
    })

    describe('Error Handling and Recovery', () => {
      it('should call onParseError for invalid parameters and continue processing', () => {
        const url =
          'https://example.com?f_name_contains=valid&f_age_invalidOp=skip&f_status_eq=also_valid'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'valid'
          },
          status: {
            filterType: 'text',
            type: 'eq',
            filter: 'also_valid'
          }
        })

        expect(mockConfig.onParseError).toHaveBeenCalledTimes(1)
        expect(mockConfig.onParseError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Unsupported filter operation')
          })
        )
      })

      it('should throw InvalidURLError for malformed URLs', () => {
        const malformedUrls = [
          'not-a-url',
          '://missing-protocol.com',
          'example.com?f_name_contains=test' // Missing protocol, contains dot
        ]

        malformedUrls.forEach(url => {
          expect(() => parseUrlFilters(url, mockConfig)).toThrow(
            InvalidURLError
          )
        })
      })

      it('should continue processing other valid parameters after errors', () => {
        const url =
          'https://example.com?f_name_contains=valid&f_age_range=invalid-range&f_status_eq=valid2'
        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'valid'
          },
          status: {
            filterType: 'text',
            type: 'eq',
            filter: 'valid2'
          }
        })

        expect(mockConfig.onParseError).toHaveBeenCalled()
      })
    })

    describe('Custom Configuration', () => {
      it('should work with custom prefix', () => {
        const customConfig = { ...mockConfig, paramPrefix: 'filter_' }
        const url =
          'https://example.com?filter_name_contains=john&filter_age_eq=25'
        const result = parseUrlFilters(url, customConfig)

        expect(result).toEqual({
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          },
          age: {
            filterType: 'number',
            type: 'eq',
            filter: 25
          }
        })
      })

      it('should respect maxValueLength for text filters', () => {
        const shortConfig = { ...mockConfig, maxValueLength: 5 }
        const url = 'https://example.com?f_name_contains=toolongvalue'

        expect(() => parseUrlFilters(url, shortConfig)).not.toThrow()
        expect(shortConfig.onParseError).toHaveBeenCalled()
      })
    })

    describe('Complex Real-World Scenarios', () => {
      it('should handle enterprise application URL with mixed filter types', () => {
        const url =
          'https://app.example.com/employees?' +
          'f_name_startsWith=J&' +
          'f_department_eq=Engineering&' +
          'f_hire_date_after=2023-01-01&' +
          'f_salary_range=50000,120000&' +
          'f_active_eq=true&' +
          'f_last_review_notBlank=true&' +
          'page=1&sort=name'

        const result = parseUrlFilters(url, mockConfig)

        expect(result).toEqual({
          name: {
            filterType: 'text',
            type: 'startsWith',
            filter: 'J'
          },
          department: {
            filterType: 'text',
            type: 'eq',
            filter: 'Engineering'
          },
          hire_date: {
            filterType: 'date',
            type: 'dateAfter',
            filter: '2023-01-01'
          },
          salary: {
            filterType: 'number',
            type: 'inRange',
            filter: 50000,
            filterTo: 120000
          },
          active: {
            filterType: 'text',
            type: 'eq',
            filter: 'true'
          },
          last_review: {
            filterType: 'text',
            type: 'notBlank',
            filter: ''
          }
        })
      })

      it('should handle URL with all date operations', () => {
        const url =
          'https://example.com?' +
          'f_created_eq=2024-01-15&' +
          'f_deadline_neq=2024-12-31&' +
          'f_start_after=2024-01-01&' +
          'f_end_before=2024-12-31&' +
          'f_updated_afterEq=2024-06-01&' +
          'f_archived_beforeEq=2024-12-31&' +
          'f_period_daterange=2024-01-01,2024-12-31&' +
          'f_optional_blank=true'

        const result = parseUrlFilters(url, mockConfig)

        expect(Object.keys(result)).toHaveLength(8)
        expect(result.created.filterType).toBe('date')
        expect(result.deadline.filterType).toBe('date')
        expect(result.start.filterType).toBe('date')
        expect(result.end.filterType).toBe('date')
        expect(result.updated.filterType).toBe('date')
        expect(result.archived.filterType).toBe('date')
        expect(result.period.filterType).toBe('date')
        expect(result.optional.filterType).toBe('text')
      })
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { serializeFilters, generateUrl } from './url-generator.js'
import type { FilterState, InternalConfig, ColumnFilter } from './types.js'

describe('URL Generator', () => {
  const mockConfig: InternalConfig = {
    gridApi: {} as any,
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('serializeFilters', () => {
    describe('Text Filter Operations', () => {
      it('should serialize text contains filter', () => {
        const filterState: FilterState = {
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_name_contains')).toBe('john')
      })

      it('should serialize text equals filter', () => {
        const filterState: FilterState = {
          status: {
            filterType: 'text',
            type: 'eq',
            filter: 'active'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_status_eq')).toBe('active')
      })

      it('should serialize text not equals filter', () => {
        const filterState: FilterState = {
          category: {
            filterType: 'text',
            type: 'notEqual',
            filter: 'inactive'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_category_neq')).toBe('inactive')
      })

      it('should serialize text starts with filter', () => {
        const filterState: FilterState = {
          email: {
            filterType: 'text',
            type: 'startsWith',
            filter: 'admin'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_email_startsWith')).toBe('admin')
      })

      it('should serialize text ends with filter', () => {
        const filterState: FilterState = {
          description: {
            filterType: 'text',
            type: 'endsWith',
            filter: 'test'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_description_endsWith')).toBe('test')
      })

      it('should serialize text not contains filter', () => {
        const filterState: FilterState = {
          tags: {
            filterType: 'text',
            type: 'notContains',
            filter: 'spam'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_tags_notContains')).toBe('spam')
      })

      it('should handle URL encoding for special characters', () => {
        const filterState: FilterState = {
          query: {
            filterType: 'text',
            type: 'contains',
            filter: 'test & more'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_query_contains')).toBe('test & more')
      })

      it('should handle Unicode characters', () => {
        const filterState: FilterState = {
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'café'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_name_contains')).toBe('café')
      })
    })

    describe('Number Filter Operations', () => {
      it('should serialize number equals filter', () => {
        const filterState: FilterState = {
          age: {
            filterType: 'number',
            type: 'eq',
            filter: 25
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_age_eq')).toBe('25')
      })

      it('should serialize number not equals filter', () => {
        const filterState: FilterState = {
          count: {
            filterType: 'number',
            type: 'notEqual',
            filter: 0
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_count_neq')).toBe('0')
      })

      it('should serialize number less than filter', () => {
        const filterState: FilterState = {
          score: {
            filterType: 'number',
            type: 'lessThan',
            filter: 100
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_score_lt')).toBe('100')
      })

      it('should serialize number less than or equal filter', () => {
        const filterState: FilterState = {
          rating: {
            filterType: 'number',
            type: 'lessThanOrEqual',
            filter: 5
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_rating_lte')).toBe('5')
      })

      it('should serialize number greater than filter', () => {
        const filterState: FilterState = {
          price: {
            filterType: 'number',
            type: 'greaterThan',
            filter: 50.99
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_price_gt')).toBe('50.99')
      })

      it('should serialize number greater than or equal filter', () => {
        const filterState: FilterState = {
          salary: {
            filterType: 'number',
            type: 'greaterThanOrEqual',
            filter: 75000
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_salary_gte')).toBe('75000')
      })

      it('should serialize number range filter', () => {
        const filterState: FilterState = {
          age: {
            filterType: 'number',
            type: 'inRange',
            filter: 25,
            filterTo: 65
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_age_range')).toBe('25,65')
      })

      it('should handle negative numbers', () => {
        const filterState: FilterState = {
          temperature: {
            filterType: 'number',
            type: 'eq',
            filter: -5.5
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_temperature_eq')).toBe('-5.5')
      })

      it('should handle scientific notation', () => {
        const filterState: FilterState = {
          value: {
            filterType: 'number',
            type: 'eq',
            filter: 1.5e10
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_value_eq')).toBe('15000000000')
      })
    })

    describe('Date Filter Operations', () => {
      it('should serialize date equals filter', () => {
        const filterState: FilterState = {
          created: {
            filterType: 'date',
            type: 'eq',
            filter: '2024-01-15'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_created_eq')).toBe('2024-01-15')
      })

      it('should serialize date not equals filter', () => {
        const filterState: FilterState = {
          deadline: {
            filterType: 'date',
            type: 'notEqual',
            filter: '2024-12-31'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_deadline_neq')).toBe('2024-12-31')
      })

      it('should serialize date before filter', () => {
        const filterState: FilterState = {
          deadline: {
            filterType: 'date',
            type: 'dateBefore',
            filter: '2024-12-31'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_deadline_before')).toBe('2024-12-31')
      })

      it('should serialize date before or equal filter', () => {
        const filterState: FilterState = {
          archived: {
            filterType: 'date',
            type: 'dateBeforeOrEqual',
            filter: '2024-12-31'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_archived_beforeEq')).toBe('2024-12-31')
      })

      it('should serialize date after filter', () => {
        const filterState: FilterState = {
          created: {
            filterType: 'date',
            type: 'dateAfter',
            filter: '2024-01-01'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_created_after')).toBe('2024-01-01')
      })

      it('should serialize date after or equal filter', () => {
        const filterState: FilterState = {
          updated: {
            filterType: 'date',
            type: 'dateAfterOrEqual',
            filter: '2024-06-01'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_updated_afterEq')).toBe('2024-06-01')
      })

      it('should serialize date range filter', () => {
        const filterState: FilterState = {
          period: {
            filterType: 'date',
            type: 'dateRange',
            filter: '2024-01-01',
            filterTo: '2024-12-31'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_period_daterange')).toBe('2024-01-01,2024-12-31')
      })

      it('should handle leap year dates', () => {
        const filterState: FilterState = {
          special: {
            filterType: 'date',
            type: 'eq',
            filter: '2024-02-29'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_special_eq')).toBe('2024-02-29')
      })
    })

    describe('Blank Operations', () => {
      it('should serialize text blank filter', () => {
        const filterState: FilterState = {
          optional: {
            filterType: 'text',
            type: 'blank',
            filter: ''
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_optional_blank')).toBe('true')
      })

      it('should serialize text not blank filter', () => {
        const filterState: FilterState = {
          required: {
            filterType: 'text',
            type: 'notBlank',
            filter: ''
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_required_notBlank')).toBe('true')
      })

      it('should serialize number blank filter', () => {
        const filterState: FilterState = {
          optional_count: {
            filterType: 'number',
            type: 'blank',
            filter: 0
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_optional_count_blank')).toBe('true')
      })

      it('should serialize date blank filter', () => {
        const filterState: FilterState = {
          optional_date: {
            filterType: 'date',
            type: 'blank',
            filter: '2024-01-01'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_optional_date_blank')).toBe('true')
      })
    })

    describe('Multiple Filters', () => {
      it('should serialize multiple different filter types', () => {
        const filterState: FilterState = {
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
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_name_contains')).toBe('john')
        expect(result.get('f_age_gte')).toBe('25')
        expect(result.get('f_created_after')).toBe('2024-01-01')
      })

      it('should serialize multiple filters of the same type', () => {
        const filterState: FilterState = {
          first_name: {
            filterType: 'text',
            type: 'startsWith',
            filter: 'J'
          },
          last_name: {
            filterType: 'text',
            type: 'endsWith',
            filter: 'son'
          },
          email: {
            filterType: 'text',
            type: 'contains',
            filter: '@company.com'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_first_name_startsWith')).toBe('J')
        expect(result.get('f_last_name_endsWith')).toBe('son')
        expect(result.get('f_email_contains')).toBe('@company.com')
      })
    })

    describe('Edge Cases', () => {
      it('should handle empty filter state', () => {
        const filterState: FilterState = {}

        const result = serializeFilters(filterState, mockConfig)

        expect(result.toString()).toBe('')
      })

      it('should skip unsupported filter types', () => {
        const filterState: FilterState = {
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          },
          unsupported: {
            filterType: 'custom' as any,
            type: 'customOp' as any,
            filter: 'value'
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_name_contains')).toBe('john')
        expect(result.get('f_unsupported_customOp')).toBeNull()
      })

      it('should handle empty text filter values', () => {
        const filterState: FilterState = {
          empty: {
            filterType: 'text',
            type: 'contains',
            filter: ''
          }
        }

        const result = serializeFilters(filterState, mockConfig)

        expect(result.get('f_empty_contains')).toBeNull()
      })

      it('should throw error for null values in validation', () => {
        const filterState: FilterState = {
          nullable: {
            filterType: 'text',
            type: 'contains',
            filter: null as any
          }
        }

        expect(() => serializeFilters(filterState, mockConfig)).toThrow()
      })
    })

    describe('Custom Configuration', () => {
      it('should work with custom prefix', () => {
        const customConfig = { ...mockConfig, paramPrefix: 'filter_' }
        const filterState: FilterState = {
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          }
        }

        const result = serializeFilters(filterState, customConfig)

        expect(result.get('filter_name_contains')).toBe('john')
      })

      it('should throw error when maxValueLength is exceeded', () => {
        const shortConfig = { ...mockConfig, maxValueLength: 5 }
        const filterState: FilterState = {
          description: {
            filterType: 'text',
            type: 'contains',
            filter: 'very long description that exceeds limit'
          }
        }

        expect(() => serializeFilters(filterState, shortConfig)).toThrow(
          'Filter value exceeds maximum length of 5 characters'
        )
      })
    })
  })

  describe('generateUrl', () => {
    describe('Basic URL Generation', () => {
      it('should generate URL with single text filter', () => {
        const baseUrl = 'https://example.com'
        const filterState: FilterState = {
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          }
        }

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toBe('https://example.com/?f_name_contains=john')
      })

      it('should generate URL with multiple filters', () => {
        const baseUrl = 'https://example.com'
        const filterState: FilterState = {
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          },
          age: {
            filterType: 'number',
            type: 'greaterThanOrEqual',
            filter: 25
          }
        }

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toContain('f_name_contains=john')
        expect(result).toContain('f_age_gte=25')
        expect(result).toContain('https://example.com/?')
      })

      it('should generate URL with path', () => {
        const baseUrl = 'https://example.com/app/users'
        const filterState: FilterState = {
          status: {
            filterType: 'text',
            type: 'eq',
            filter: 'active'
          }
        }

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toBe('https://example.com/app/users?f_status_eq=active')
      })

      it('should preserve existing non-filter parameters', () => {
        const baseUrl = 'https://example.com?page=1&sort=name'
        const filterState: FilterState = {
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          }
        }

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toContain('page=1')
        expect(result).toContain('sort=name')
        expect(result).toContain('f_name_contains=john')
      })

      it('should replace existing filter parameters', () => {
        const baseUrl = 'https://example.com?f_name_contains=old&page=1'
        const filterState: FilterState = {
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'new'
          }
        }

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toContain('f_name_contains=new')
        expect(result).not.toContain('f_name_contains=old')
        expect(result).toContain('page=1')
      })
    })

    describe('Special Characters and Encoding', () => {
      it('should handle special characters in filter values', () => {
        const baseUrl = 'https://example.com'
        const filterState: FilterState = {
          query: {
            filterType: 'text',
            type: 'contains',
            filter: 'test & more'
          }
        }

        const result = generateUrl(baseUrl, filterState, mockConfig)

        // URLSearchParams encodes spaces as + and & as %26
        expect(result).toContain('f_query_contains=test+%26+more')
      })

      it('should handle Unicode characters', () => {
        const baseUrl = 'https://example.com'
        const filterState: FilterState = {
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'café'
          }
        }

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toContain('f_name_contains=caf%C3%A9')
      })
    })

    describe('Range Operations', () => {
      it('should generate URL with number range filter', () => {
        const baseUrl = 'https://example.com'
        const filterState: FilterState = {
          age: {
            filterType: 'number',
            type: 'inRange',
            filter: 25,
            filterTo: 65
          }
        }

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toBe('https://example.com/?f_age_range=25%2C65')
      })

      it('should generate URL with date range filter', () => {
        const baseUrl = 'https://example.com'
        const filterState: FilterState = {
          period: {
            filterType: 'date',
            type: 'dateRange',
            filter: '2024-01-01',
            filterTo: '2024-12-31'
          }
        }

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toBe(
          'https://example.com/?f_period_daterange=2024-01-01%2C2024-12-31'
        )
      })
    })

    describe('Blank Operations', () => {
      it('should generate URL with blank filters', () => {
        const baseUrl = 'https://example.com'
        const filterState: FilterState = {
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
        }

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toContain('f_optional_blank=true')
        expect(result).toContain('f_required_notBlank=true')
      })
    })

    describe('Edge Cases', () => {
      it('should return clean base URL when no filters', () => {
        const baseUrl = 'https://example.com'
        const filterState: FilterState = {}

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toBe('https://example.com')
      })

      it('should remove trailing slash for root paths when no filters', () => {
        const baseUrl = 'https://example.com/'
        const filterState: FilterState = {}

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toBe('https://example.com')
      })

      it('should preserve path when no filters', () => {
        const baseUrl = 'https://example.com/app/users'
        const filterState: FilterState = {}

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toBe('https://example.com/app/users')
      })

      it('should handle base URL with existing query parameters but no filters', () => {
        const baseUrl = 'https://example.com?page=1&sort=name'
        const filterState: FilterState = {}

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toContain('page=1')
        expect(result).toContain('sort=name')
        expect(result).not.toContain('f_')
      })

      it('should handle base URL with fragments', () => {
        const baseUrl = 'https://example.com#section'
        const filterState: FilterState = {
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          }
        }

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toContain('f_name_contains=john')
        expect(result).toContain('#section')
      })
    })

    describe('Custom Configuration', () => {
      it('should work with custom prefix', () => {
        const customConfig = { ...mockConfig, paramPrefix: 'filter_' }
        const baseUrl = 'https://example.com'
        const filterState: FilterState = {
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          }
        }

        const result = generateUrl(baseUrl, filterState, customConfig)

        expect(result).toBe('https://example.com/?filter_name_contains=john')
      })

      it('should preserve existing non-filter parameters with custom prefix', () => {
        const customConfig = { ...mockConfig, paramPrefix: 'filter_' }
        const baseUrl = 'https://example.com?filter_old_contains=old&page=1'
        const filterState: FilterState = {
          name: {
            filterType: 'text',
            type: 'contains',
            filter: 'john'
          }
        }

        const result = generateUrl(baseUrl, filterState, customConfig)

        expect(result).toContain('filter_name_contains=john')
        expect(result).not.toContain('filter_old_contains=old')
        expect(result).toContain('page=1')
      })
    })

    describe('Complex Real-World Scenarios', () => {
      it('should handle enterprise application with mixed filter types', () => {
        const baseUrl = 'https://app.example.com/employees?page=1&sort=name'
        const filterState: FilterState = {
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
        }

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toContain('page=1')
        expect(result).toContain('sort=name')
        expect(result).toContain('f_name_startsWith=J')
        expect(result).toContain('f_department_eq=Engineering')
        expect(result).toContain('f_hire_date_after=2023-01-01')
        expect(result).toContain('f_salary_range=50000%2C120000')
        expect(result).toContain('f_active_eq=true')
        expect(result).toContain('f_last_review_notBlank=true')
      })

      it('should handle URL with all date operations', () => {
        const baseUrl = 'https://example.com'
        const filterState: FilterState = {
          created: {
            filterType: 'date',
            type: 'eq',
            filter: '2024-01-15'
          },
          deadline: {
            filterType: 'date',
            type: 'notEqual',
            filter: '2024-12-31'
          },
          start: {
            filterType: 'date',
            type: 'dateAfter',
            filter: '2024-01-01'
          },
          end: {
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
        }

        const result = generateUrl(baseUrl, filterState, mockConfig)

        expect(result).toContain('f_created_eq=2024-01-15')
        expect(result).toContain('f_deadline_neq=2024-12-31')
        expect(result).toContain('f_start_after=2024-01-01')
        expect(result).toContain('f_end_before=2024-12-31')
        expect(result).toContain('f_period_daterange=2024-01-01%2C2024-12-31')
      })
    })
  })
})

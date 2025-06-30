import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilterState, GridApi, InternalConfig } from './types'
import { serializeFilters } from './url-generator'
import { parseUrlFilters } from './url-parser'
import { AGGridUrlSync } from './ag-grid-url-sync'

describe('Mixed Operations Integration', () => {
  const mockConfig: InternalConfig = {
    gridApi: {} as any,
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: vi.fn()
  }

  const mockGridApi = {
    getFilterModel: vi.fn().mockReturnValue({}),
    setFilterModel: vi.fn(),
    getColumn: vi.fn().mockImplementation((colId: string) => {
      // Mock column definitions for proper type detection
      const numberColumns = [
        'age',
        'salary',
        'score',
        'performance',
        'price',
        'rating',
        'amount',
        'fee'
      ]
      const dateColumns = [
        'created',
        'deadline',
        'period',
        'updated',
        'hire_date',
        'launch_date',
        'date'
      ]

      if (numberColumns.includes(colId)) {
        return {
          getColDef: () => ({ filter: 'agNumberColumnFilter' })
        }
      } else if (dateColumns.includes(colId)) {
        return {
          getColDef: () => ({ filter: 'agDateColumnFilter' })
        }
      }
      // Default to text filter
      return {
        getColDef: () => ({ filter: 'agTextColumnFilter' })
      }
    })
  } as unknown as GridApi

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Mixed Filter Type Scenarios', () => {
    it('should handle multiple different filter types in single URL', () => {
      const complexUrl =
        'https://example.com?' +
        'f_name_contains=john&' + // Text filter
        'f_age_range=25,45&' + // Number range filter
        'f_salary_gte=75000&' + // Number filter
        'f_created_after=2024-01-01&' + // Date filter
        'f_deadline_beforeEq=2024-12-31&' + // Date filter
        'f_period_daterange=2024-06-01,2024-08-31&' + // Date range filter
        'f_archived_blank=true' // Date blank filter

      const urlSync = new AGGridUrlSync(mockGridApi)
      const filterState = parseUrlFilters(complexUrl, {
        ...mockConfig,
        gridApi: mockGridApi
      })

      expect(filterState).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'john' },
        age: {
          filterType: 'number',
          type: 'inRange',
          filter: 25,
          filterTo: 45
        },
        salary: {
          filterType: 'number',
          type: 'greaterThanOrEqual',
          filter: 75000
        },
        created: {
          filterType: 'date',
          type: 'dateAfter',
          filter: '2024-01-01'
        },
        deadline: {
          filterType: 'date',
          type: 'dateBeforeOrEqual',
          filter: '2024-12-31'
        },
        period: {
          filterType: 'date',
          type: 'dateRange',
          filter: '2024-06-01',
          filterTo: '2024-08-31'
        },
        archived: { filterType: 'text', type: 'blank', filter: '' }
      })
    })

    it('should serialize mixed filter types correctly', () => {
      const filterState: FilterState = {
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
        salary: {
          filterType: 'number',
          type: 'inRange',
          filter: 50000,
          filterTo: 100000
        } as any,
        created: {
          filterType: 'date',
          type: 'dateAfter',
          filter: '2024-01-01'
        },
        deadline: {
          filterType: 'date',
          type: 'dateRange',
          filter: '2024-06-01',
          filterTo: '2024-08-31'
        } as any,
        status: {
          filterType: 'text',
          type: 'notBlank',
          filter: ''
        }
      }

      const params = serializeFilters(filterState, mockConfig)
      const paramStr = params.toString()

      expect(paramStr).toContain('f_name_contains=john')
      expect(paramStr).toContain('f_age_gt=25')
      expect(paramStr).toContain('f_salary_range=50000%2C100000')
      expect(paramStr).toContain('f_created_after=2024-01-01')
      expect(paramStr).toContain('f_deadline_daterange=2024-06-01%2C2024-08-31')
      expect(paramStr).toContain('f_status_notBlank=true')
    })

    it('should apply mixed filter types through AGGridUrlSync', () => {
      const mixedUrl =
        'https://example.com?' +
        'f_username_startsWith=admin&' +
        'f_age_gte=18&' +
        'f_score_range=80,100&' +
        'f_created_eq=2024-01-15&' +
        'f_updated_after=2024-06-01&' +
        'f_notes_blank=true'

      const urlSync = new AGGridUrlSync(mockGridApi)
      urlSync.applyFromUrl(mixedUrl)

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        username: { filterType: 'text', type: 'startsWith', filter: 'admin' },
        age: { filterType: 'number', type: 'greaterThanOrEqual', filter: 18 },
        score: {
          filterType: 'number',
          type: 'inRange',
          filter: 80,
          filterTo: 100
        },
        created: { filterType: 'date', type: 'equals', dateFrom: '2024-01-15' },
        updated: {
          filterType: 'date',
          type: 'greaterThan',
          dateFrom: '2024-06-01'
        },
        notes: { filterType: 'text', type: 'blank', filter: '' }
      })
    })
  })

  describe('Real-world Business Scenarios', () => {
    it('should handle employee dashboard filtering scenario', () => {
      const employeeDashboardUrl =
        'https://example.com/employees?' +
        'f_department_eq=Engineering&' +
        'f_salary_range=80000,150000&' +
        'f_hire_date_after=2020-01-01&' +
        'f_performance_gte=4&' +
        'f_status_neq=terminated&' +
        'f_skills_contains=javascript&' +
        'f_last_review_notBlank=true'

      const filters = parseUrlFilters(employeeDashboardUrl, mockConfig)

      expect(filters.department.type).toBe('eq')
      expect(filters.salary.type).toBe('inRange')
      expect(filters.hire_date.type).toBe('dateAfter')
      expect(filters.performance.type).toBe('greaterThanOrEqual')
      expect(filters.status.type).toBe('notEqual')
      expect(filters.skills.type).toBe('contains')
      expect(filters.last_review.type).toBe('notBlank')
    })

    it('should handle e-commerce product filtering scenario', () => {
      const productUrl =
        'https://example.com/products?' +
        'f_category_eq=electronics&' +
        'f_price_range=50,500&' +
        'f_rating_gte=4&' +
        'f_in_stock_eq=true&' +
        'f_brand_neq=generic&' +
        'f_launch_date_afterEq=2023-01-01&' +
        'f_description_contains=wireless&' +
        'f_discontinued_blank=true'

      const urlSync = new AGGridUrlSync(mockGridApi)
      urlSync.applyFromUrl(productUrl)

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        category: { filterType: 'text', type: 'equals', filter: 'electronics' },
        price: {
          filterType: 'number',
          type: 'inRange',
          filter: 50,
          filterTo: 500
        },
        rating: { filterType: 'number', type: 'greaterThanOrEqual', filter: 4 },
        in_stock: { filterType: 'text', type: 'equals', filter: 'true' },
        brand: { filterType: 'text', type: 'notEqual', filter: 'generic' },
        launch_date: {
          filterType: 'date',
          type: 'greaterThanOrEqual',
          dateFrom: '2023-01-01'
        },
        description: {
          filterType: 'text',
          type: 'contains',
          filter: 'wireless'
        },
        discontinued: { filterType: 'text', type: 'blank', filter: '' }
      })
    })

    it('should handle financial transactions filtering scenario', () => {
      const transactionUrl =
        'https://example.com/transactions?' +
        'f_amount_range=100,10000&' +
        'f_type_eq=credit&' +
        'f_date_daterange=2024-01-01,2024-12-31&' +
        'f_account_contains=checking&' +
        'f_merchant_startsWith=AMZ&' +
        'f_status_neq=pending&' +
        'f_fee_lte=5&' +
        'f_notes_notBlank=true'

      const filters = parseUrlFilters(transactionUrl, mockConfig)

      expect(Object.keys(filters)).toHaveLength(8)
      expect(filters.amount.filterType).toBe('number')
      expect(filters.type.filterType).toBe('text')
      expect(filters.date.filterType).toBe('date')
      expect(filters.account.filterType).toBe('text')
      expect(filters.merchant.filterType).toBe('text')
      expect(filters.status.filterType).toBe('text')
      expect(filters.fee.filterType).toBe('number')
      expect(filters.notes.filterType).toBe('text')
    })
  })

  describe('Cross-Filter Type Interactions', () => {
    it('should maintain filter type integrity when mixing operations', () => {
      const filterState: FilterState = {
        // Same column name but different data types in different contexts
        id: { filterType: 'number', type: 'eq', filter: 123 },
        created_id: { filterType: 'text', type: 'contains', filter: 'USR-123' },
        date_id: { filterType: 'date', type: 'eq', filter: '2024-01-15' }
      }

      const params = serializeFilters(filterState, mockConfig)
      const urlString = params.toString()

      // Parse back and verify types are preserved
      const testUrl = `https://example.com?${urlString}`
      const parsedState = parseUrlFilters(testUrl, mockConfig)

      expect(parsedState.id.filterType).toBe('number')
      expect(parsedState.created_id.filterType).toBe('text')
      expect(parsedState.date_id.filterType).toBe('date')
    })

    it('should handle all operation types comprehensively', () => {
      const comprehensiveUrl =
        'https://example.com?' +
        // Text operations
        'f_name_contains=john&' +
        'f_status_eq=active&' +
        'f_email_startsWith=admin&' +
        'f_notes_blank=true&' +
        // Number operations
        'f_age_gt=25&' +
        'f_salary_range=50000,100000&' +
        'f_score_lte=95&' +
        // Date operations
        'f_created_after=2024-01-01&' +
        'f_deadline_beforeEq=2024-12-31&' +
        'f_period_daterange=2024-06-01,2024-08-31'

      const filters = parseUrlFilters(comprehensiveUrl, mockConfig)

      // Verify all operations parsed correctly
      expect(Object.keys(filters)).toHaveLength(10)

      // Text filters
      expect(filters.name.type).toBe('contains')
      expect(filters.status.type).toBe('eq')
      expect(filters.email.type).toBe('startsWith')
      expect(filters.notes.type).toBe('blank')

      // Number filters
      expect(filters.age.type).toBe('greaterThan')
      expect(filters.salary.type).toBe('inRange')
      expect(filters.score.type).toBe('lessThanOrEqual')

      // Date filters
      expect(filters.created.type).toBe('dateAfter')
      expect(filters.deadline.type).toBe('dateBeforeOrEqual')
      expect(filters.period.type).toBe('dateRange')
    })
  })

  describe('Round-trip Integrity Across Filter Types', () => {
    it('should maintain data integrity for all filter types in round-trip', () => {
      const originalState: FilterState = {
        // Text filters
        name: { filterType: 'text', type: 'contains', filter: 'john doe' },
        status: { filterType: 'text', type: 'eq', filter: 'active' },
        notes: { filterType: 'text', type: 'blank', filter: '' },

        // Number filters
        age: { filterType: 'number', type: 'greaterThan', filter: 25 },
        salary: {
          filterType: 'number',
          type: 'inRange',
          filter: 50000,
          filterTo: 100000
        } as any,

        // Date filters
        created: {
          filterType: 'date',
          type: 'dateAfter',
          filter: '2024-01-01'
        },
        period: {
          filterType: 'date',
          type: 'dateRange',
          filter: '2024-06-01',
          filterTo: '2024-08-31'
        } as any
      }

      // Convert to URL
      const params = serializeFilters(originalState, mockConfig)
      const urlString = params.toString()

      // Parse back from URL
      const testUrl = `https://example.com?${urlString}`
      const parsedState = parseUrlFilters(testUrl, mockConfig)

      // Verify complete round-trip integrity
      expect(parsedState.name).toEqual(originalState.name)
      expect(parsedState.status).toEqual(originalState.status)
      expect(parsedState.notes).toEqual(originalState.notes)
      expect(parsedState.age).toEqual(originalState.age)
      expect(parsedState.salary).toEqual(originalState.salary)
      expect(parsedState.created).toEqual(originalState.created)
      expect(parsedState.period).toEqual(originalState.period)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed mixed filter URLs gracefully', () => {
      const malformedUrl =
        'https://example.com?' +
        'f_age_gt=not_a_number&' + // Invalid number
        'f_created_eq=invalid-date&' + // Invalid date format
        'f_name_contains=valid_text&' + // Valid text
        'f_salary_range=50000&' + // Invalid range (missing second value)
        'invalid_param=ignored' // Non-filter parameter

      // Should not throw, but handle errors gracefully
      const filters = parseUrlFilters(malformedUrl, mockConfig)

      // Should only contain valid filters
      expect(filters.name).toBeDefined()
      expect(filters.name.type).toBe('contains')
      expect(filters.name.filter).toBe('valid_text')
    })

    it('should handle empty and edge case values across filter types', () => {
      const edgeCaseUrl =
        'https://example.com?' +
        'f_empty_text_eq=&' +
        'f_zero_number_eq=0&' +
        'f_negative_number_lt=-100&' +
        'f_blank_check_blank=true'

      const filters = parseUrlFilters(edgeCaseUrl, mockConfig)

      expect(filters.empty_text.filter).toBe('')
      expect(filters.zero_number.filter).toBe(0)
      expect(filters.negative_number.filter).toBe(-100)
      expect(filters.blank_check.filter).toBe('')
    })
  })
})

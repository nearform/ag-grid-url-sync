import { describe, expect, it, vi } from 'vitest'
import type {
  DateFilterOperation,
  FilterState,
  GridApi,
  InternalConfig,
  NumberFilterOperation
} from './types'
import { applyFilterModel, detectColumnFilterType } from './grid-integration'
import { serializeFilters } from './url-generator'
import { parseFilterParam, parseUrlFilters } from './url-parser'
import {
  validateNumberFilter,
  validateAndParseNumber,
  validateNumberRange
} from './validation'
import { AGGridUrlSync } from './ag-grid-url-sync'

describe('Filter Operations', () => {
  describe('Text Filter Operations', () => {
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

    // Consolidated test for all filter operations - reduces redundancy while maintaining coverage
    const filterOperations = [
      {
        urlOp: 'contains',
        value: 'john',
        agGridType: 'contains',
        column: 'name'
      },
      { urlOp: 'eq', value: 'active', agGridType: 'equals', column: 'status' },
      {
        urlOp: 'neq',
        value: 'inactive',
        agGridType: 'notEqual',
        column: 'status'
      },
      {
        urlOp: 'notContains',
        value: 'spam',
        agGridType: 'notContains',
        column: 'tags'
      },
      {
        urlOp: 'startsWith',
        value: 'admin',
        agGridType: 'startsWith',
        column: 'email'
      },
      {
        urlOp: 'endsWith',
        value: 'pending',
        agGridType: 'endsWith',
        column: 'description'
      }
    ]

    describe.each(filterOperations)(
      'Operation: $urlOp',
      ({ urlOp, value, agGridType, column }) => {
        it('should apply filter from URL and generate URL correctly', () => {
          // Test URL → Filter conversion
          const urlSync = new AGGridUrlSync(mockGridApi)
          urlSync.applyFromUrl(
            `https://example.com?f_${column}_${urlOp}=${value}`
          )

          expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
            [column]: {
              filterType: 'text',
              type: agGridType,
              filter: value
            }
          })

          // Test Filter → URL conversion
          const mockGridApiWithFilter = {
            getFilterModel: vi.fn().mockReturnValue({
              [column]: { filterType: 'text', type: agGridType, filter: value }
            }),
            setFilterModel: vi.fn()
          } as unknown as GridApi

          const urlSyncReverse = new AGGridUrlSync(mockGridApiWithFilter)
          const url = urlSyncReverse.generateUrl('https://example.com')
          expect(url).toBe(`https://example.com/?f_${column}_${urlOp}=${value}`)
        })
      }
    )

    describe('Blank Operations', () => {
      it('should handle blank and notBlank operations correctly', () => {
        const urlSync = new AGGridUrlSync(mockGridApi)

        // Test blank operation
        urlSync.applyFromUrl('https://example.com?f_optional_blank=true')
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          optional: { filterType: 'text', type: 'blank', filter: '' }
        })

        // Test notBlank operation
        urlSync.applyFromUrl('https://example.com?f_required_notBlank=true')
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          required: { filterType: 'text', type: 'notBlank', filter: '' }
        })

        // Test blank operations ignore the parameter value
        urlSync.applyFromUrl(
          'https://example.com?f_optional_blank=ignored_value'
        )
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          optional: { filterType: 'text', type: 'blank', filter: '' }
        })
      })

      it('should generate URLs for blank operations', () => {
        const mockGridApiWithFilters = {
          getFilterModel: vi.fn().mockReturnValue({
            optional: { filterType: 'text', type: 'blank', filter: '' },
            required: { filterType: 'text', type: 'notBlank', filter: '' }
          }),
          setFilterModel: vi.fn()
        } as unknown as GridApi

        const urlSync = new AGGridUrlSync(mockGridApiWithFilters)
        const url = urlSync.generateUrl('https://example.com')
        expect(url).toContain('f_optional_blank=true')
        expect(url).toContain('f_required_notBlank=true')
      })
    })

    describe('Complex Multi-Operation Scenarios', () => {
      it('should handle multiple different operations in single URL', () => {
        // Test business scenario: user applies multiple filters and shares URL
        const urlSync = new AGGridUrlSync(mockGridApi)
        const complexUrl =
          'https://example.com?' +
          'f_name_contains=john&' +
          'f_email_startsWith=admin&' +
          'f_status_neq=inactive&' +
          'f_description_endsWith=test&' +
          'f_optional_blank=true&' +
          'f_required_notBlank=true&' +
          'f_tags_notContains=spam&' +
          'f_title_eq=manager'

        urlSync.applyFromUrl(complexUrl)
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          name: { filterType: 'text', type: 'contains', filter: 'john' },
          email: { filterType: 'text', type: 'startsWith', filter: 'admin' },
          status: { filterType: 'text', type: 'notEqual', filter: 'inactive' },
          description: { filterType: 'text', type: 'endsWith', filter: 'test' },
          optional: { filterType: 'text', type: 'blank', filter: '' },
          required: { filterType: 'text', type: 'notBlank', filter: '' },
          tags: { filterType: 'text', type: 'notContains', filter: 'spam' },
          title: { filterType: 'text', type: 'equals', filter: 'manager' }
        })
      })
    })
  })

  describe('Number Filter Operations', () => {
    const config: InternalConfig = {
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
            const filters = parseUrlFilters(url, config)
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
            const params = serializeFilters(filterState, config)
            expect(params.toString()).toBe(expectedUrl)
          })

          it('should apply to AG Grid correctly', () => {
            const mockGridApi = {
              setFilterModel: vi.fn(),
              getColumn: vi.fn().mockReturnValue({
                getColDef: () => ({ filter: 'agNumberColumnFilter' })
              })
            } as unknown as GridApi

            const testConfig = { ...config, gridApi: mockGridApi }
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
        const filters = parseUrlFilters(url, config)
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
        const params = serializeFilters(filterState, config)
        expect(params.toString()).toBe('f_age_range=18%2C65')
      })

      it('should apply range filter to AG Grid correctly', () => {
        const mockGridApi = {
          setFilterModel: vi.fn(),
          getColumn: vi.fn().mockReturnValue({
            getColDef: () => ({ filter: 'agNumberColumnFilter' })
          })
        } as unknown as GridApi

        const testConfig = { ...config, gridApi: mockGridApi }
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
        const params = serializeFilters(filterState, config)
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

      it('should detect text columns by filter type', () => {
        const mockGridApi = {
          getColumn: vi.fn().mockReturnValue({
            getColDef: () => ({ filter: 'agTextColumnFilter' })
          })
        } as unknown as GridApi

        const result = detectColumnFilterType(mockGridApi, 'name')
        expect(result).toBe('text')
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
        expect(result).toBe('text') // Now defaults to text instead of null
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

    describe('Mixed Text and Number Filters', () => {
      it('should handle multiple filter types in single URL', () => {
        const url =
          'https://example.com?f_name_contains=john&f_age_gt=25&f_salary_range=50000,100000'
        const filters = parseUrlFilters(url, config)

        expect(filters.name).toEqual({
          filterType: 'text',
          type: 'contains',
          filter: 'john'
        })
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
          } as any
        }

        const params = serializeFilters(filterState, config)
        const paramStr = params.toString()

        expect(paramStr).toContain('f_name_contains=john')
        expect(paramStr).toContain('f_age_gt=25')
        expect(paramStr).toContain('f_salary_range=50000%2C100000')
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
        const result = parseFilterParam(
          'f_big_number_eq',
          largeNumber.toString()
        )
        expect(result).toEqual({
          filterType: 'number',
          type: 'eq',
          filter: largeNumber
        })
      })
    })
  })

  describe('Date Filter Operations', () => {
    const config: InternalConfig = {
      gridApi: {} as any,
      paramPrefix: 'f_',
      maxValueLength: 200,
      onParseError: vi.fn()
    }

    describe('Single Value Date Operations', () => {
      const singleValueOperations: Array<{
        urlOp: string
        internalOp: DateFilterOperation
        agGridOp: string
        value: string
        expectedUrl: string
      }> = [
        {
          urlOp: 'eq',
          internalOp: 'eq',
          agGridOp: 'equals',
          value: '2024-01-15',
          expectedUrl: 'f_created_eq=2024-01-15'
        },
        {
          urlOp: 'neq',
          internalOp: 'notEqual',
          agGridOp: 'notEqual',
          value: '2024-01-15',
          expectedUrl: 'f_deadline_neq=2024-01-15'
        },
        {
          urlOp: 'before',
          internalOp: 'dateBefore',
          agGridOp: 'lessThan',
          value: '2024-12-31',
          expectedUrl: 'f_deadline_before=2024-12-31'
        },
        {
          urlOp: 'beforeEq',
          internalOp: 'dateBeforeOrEqual',
          agGridOp: 'lessThanOrEqual',
          value: '2024-12-31',
          expectedUrl: 'f_archived_beforeEq=2024-12-31'
        },
        {
          urlOp: 'after',
          internalOp: 'dateAfter',
          agGridOp: 'greaterThan',
          value: '2024-01-01',
          expectedUrl: 'f_created_after=2024-01-01'
        },
        {
          urlOp: 'afterEq',
          internalOp: 'dateAfterOrEqual',
          agGridOp: 'greaterThanOrEqual',
          value: '2024-06-01',
          expectedUrl: 'f_updated_afterEq=2024-06-01'
        }
      ]

      describe.each(singleValueOperations)(
        'Date Operation: $urlOp ($internalOp)',
        ({ urlOp, internalOp, agGridOp, value, expectedUrl }) => {
          it('should parse date filter from URL parameter correctly', () => {
            // Extract column name from URL like 'f_created_eq=...' -> 'created'
            const paramPart = expectedUrl.split('=')[0] // 'f_created_eq'
            const column = paramPart.split('_')[1] // 'created'
            const param = `f_${column}_${urlOp}`

            const result = parseFilterParam(param, value, 'f_')

            expect(result).toEqual({
              filterType: 'date',
              type: internalOp,
              filter: value
            })
          })

          it('should serialize date filter to URL parameter correctly', () => {
            const paramPart = expectedUrl.split('=')[0] // Extract parameter part
            const column = paramPart.split('_')[1] // Extract column name
            const filterState: FilterState = {
              [column]: {
                filterType: 'date',
                type: internalOp,
                filter: value
              }
            }

            const params = serializeFilters(filterState, config)
            const paramString = params.toString()

            expect(paramString).toBe(expectedUrl)
          })

          it('should convert to AG Grid filter format correctly', () => {
            const mockGridApi = {
              getFilterModel: vi.fn().mockReturnValue({}),
              setFilterModel: vi.fn(),
              getColumn: vi.fn().mockReturnValue({
                getColDef: () => ({ filter: 'agDateColumnFilter' })
              })
            } as unknown as GridApi

            const testConfig = { ...config, gridApi: mockGridApi }
            const paramPart = expectedUrl.split('=')[0]
            const column = paramPart.split('_')[1]
            const filterState: FilterState = {
              [column]: {
                filterType: 'date',
                type: internalOp,
                filter: value
              }
            }

            applyFilterModel(filterState, testConfig)

            expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
              [column]: {
                filterType: 'date',
                type: agGridOp,
                dateFrom: value
              }
            })
          })

          it('should complete round-trip: URL → Filter → AG Grid → Filter → URL', () => {
            // URL → Filter
            const paramPart = expectedUrl.split('=')[0]
            const column = paramPart.split('_')[1]
            const param = `f_${column}_${urlOp}`
            const parsedFilter = parseFilterParam(param, value, 'f_')

            // Filter → AG Grid (test conversion)
            expect(parsedFilter.filterType).toBe('date')
            expect(parsedFilter.type).toBe(internalOp)
            expect(parsedFilter.filter).toBe(value)

            // Filter → URL
            const filterState: FilterState = { [column]: parsedFilter }
            const serializedParams = serializeFilters(filterState, config)
            expect(serializedParams.toString()).toBe(expectedUrl)
          })
        }
      )
    })

    describe('Date Range Operations', () => {
      const rangeTestCases = [
        {
          urlOp: 'daterange',
          internalOp: 'dateRange' as DateFilterOperation,
          agGridOp: 'inRange',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          column: 'period',
          expectedUrl: 'f_period_daterange=2024-01-01,2024-12-31'
        },
        {
          urlOp: 'daterange',
          internalOp: 'dateRange' as DateFilterOperation,
          agGridOp: 'inRange',
          startDate: '2024-02-28',
          endDate: '2024-02-29', // Leap year range
          column: 'quarter',
          expectedUrl: 'f_quarter_daterange=2024-02-28,2024-02-29'
        }
      ]

      describe.each(rangeTestCases)(
        'Date Range: $startDate to $endDate',
        ({
          urlOp,
          internalOp,
          agGridOp,
          startDate,
          endDate,
          column,
          expectedUrl
        }) => {
          const rangeValue = `${startDate},${endDate}`

          it('should parse date range from URL parameter correctly', () => {
            const param = `f_${column}_${urlOp}`

            const result = parseFilterParam(param, rangeValue, 'f_')

            expect(result).toEqual({
              filterType: 'date',
              type: internalOp,
              filter: startDate,
              filterTo: endDate
            })
          })

          it('should serialize date range to URL parameter correctly', () => {
            const filterState: FilterState = {
              [column]: {
                filterType: 'date',
                type: internalOp,
                filter: startDate,
                filterTo: endDate
              }
            }

            const params = serializeFilters(filterState, config)
            const paramString = params.toString()

            // URLSearchParams automatically encodes commas - this is correct behavior
            const expectedEncodedUrl = expectedUrl.replace(',', '%2C')
            expect(paramString).toBe(expectedEncodedUrl)
          })

          it('should convert date range to AG Grid filter format correctly', () => {
            const mockGridApi = {
              getFilterModel: vi.fn().mockReturnValue({}),
              setFilterModel: vi.fn(),
              getColumn: vi.fn().mockReturnValue({
                getColDef: () => ({ filter: 'agDateColumnFilter' })
              })
            } as unknown as GridApi

            const testConfig = { ...config, gridApi: mockGridApi }
            const filterState: FilterState = {
              [column]: {
                filterType: 'date',
                type: internalOp,
                filter: startDate,
                filterTo: endDate
              }
            }

            applyFilterModel(filterState, testConfig)

            expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
              [column]: {
                filterType: 'date',
                type: agGridOp,
                dateFrom: startDate,
                dateTo: endDate
              }
            })
          })

          it('should validate date range order (start <= end)', () => {
            const param = `f_${column}_${urlOp}`

            // Valid range should work
            expect(() =>
              parseFilterParam(param, rangeValue, 'f_')
            ).not.toThrow()

            // Invalid range (end before start) should throw
            const invalidRange = `${endDate},${startDate}` // Reversed
            expect(() => parseFilterParam(param, invalidRange, 'f_')).toThrow(
              /Date range invalid/
            )
          })
        }
      )
    })

    describe('Date Blank Operations', () => {
      const blankOperations = [
        {
          urlOp: 'blank',
          internalOp: 'blank' as DateFilterOperation,
          agGridOp: 'blank',
          expectedUrl: 'f_optional_blank=true'
        },
        {
          urlOp: 'notBlank',
          internalOp: 'notBlank' as DateFilterOperation,
          agGridOp: 'notBlank',
          expectedUrl: 'f_created_notBlank=true'
        }
      ]

      describe.each(blankOperations)(
        'Blank Operation: $urlOp',
        ({ urlOp, internalOp, agGridOp, expectedUrl }) => {
          it('should parse blank date filter correctly', () => {
            const paramPart = expectedUrl.split('=')[0]
            const column = paramPart.split('_')[1]
            const param = `f_${column}_${urlOp}`

            const result = parseFilterParam(param, 'true', 'f_')

            expect(result.filterType).toBe('text') // Blank operations default to text
            expect(result.type).toBe(internalOp)
            expect(result.filter).toBe('')
          })

          it('should serialize blank date filter correctly', () => {
            const paramPart = expectedUrl.split('=')[0]
            const column = paramPart.split('_')[1]
            const filterState: FilterState = {
              [column]: {
                filterType: 'date',
                type: internalOp,
                filter: ''
              }
            }

            const params = serializeFilters(filterState, config)
            const paramString = params.toString()

            expect(paramString).toBe(expectedUrl)
          })

          it('should ignore parameter value for blank operations', () => {
            const paramPart = expectedUrl.split('=')[0]
            const column = paramPart.split('_')[1]
            const param = `f_${column}_${urlOp}`

            // Should work with any value (blank operations ignore the value)
            const values = ['true', 'false', 'ignored', '', '2024-01-15']

            values.forEach(value => {
              const result = parseFilterParam(param, value, 'f_')
              expect(result.filter).toBe('') // Always empty for blank operations
            })
          })
        }
      )
    })

    describe('Date Column Type Detection', () => {
      it('should detect agDateColumnFilter configuration', () => {
        const mockGridApi = {
          getColumn: vi.fn().mockReturnValue({
            getColDef: () => ({ filter: 'agDateColumnFilter' })
          })
        } as unknown as GridApi

        const result = detectColumnFilterType(mockGridApi, 'createdDate')
        expect(result).toBe('date')
      })

      it('should detect cellDataType: "date" configuration', () => {
        const mockGridApi = {
          getColumn: vi.fn().mockReturnValue({
            getColDef: () => ({ cellDataType: 'date' })
          })
        } as unknown as GridApi

        const result = detectColumnFilterType(mockGridApi, 'updatedAt')
        expect(result).toBe('date')
      })

      it('should prioritize explicit filter over cellDataType', () => {
        const mockGridApi = {
          getColumn: vi.fn().mockReturnValue({
            getColDef: () => ({
              filter: 'agDateColumnFilter',
              cellDataType: 'text' // Conflicting config
            })
          })
        } as unknown as GridApi

        const result = detectColumnFilterType(mockGridApi, 'conflictedColumn')
        expect(result).toBe('date') // filter takes priority
      })

      it('should fall back to text for unknown columns', () => {
        const mockGridApi = {
          getColumn: vi.fn().mockReturnValue(null)
        } as unknown as GridApi

        const result = detectColumnFilterType(mockGridApi, 'unknownColumn')
        expect(result).toBe('text')
      })
    })

    describe('Complex Date Filter Scenarios', () => {
      it('should handle mixed text, number, and date filters in single URL', () => {
        const complexUrl =
          'https://example.com?' +
          'f_name_contains=john&' + // Text filter
          'f_age_range=25,45&' + // Number range filter
          'f_salary_gte=75000&' + // Number filter
          'f_created_after=2024-01-01&' + // Date filter
          'f_deadline_beforeEq=2024-12-31&' + // Date filter
          'f_period_daterange=2024-06-01,2024-08-31&' + // Date range filter
          'f_archived_blank=true' // Date blank filter

        const mockGridApi = {
          getFilterModel: vi.fn().mockReturnValue({}),
          setFilterModel: vi.fn()
        } as unknown as GridApi

        const urlSync = new AGGridUrlSync(mockGridApi)
        const filterState = parseUrlFilters(complexUrl, {
          ...config,
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

      it('should handle all date operations in comprehensive example', () => {
        const allDateOperationsUrl =
          'https://example.com?' +
          'f_created_eq=2024-01-15&' +
          'f_deadline_neq=2024-12-31&' +
          'f_start_after=2024-01-01&' +
          'f_end_before=2024-12-31&' +
          'f_updated_afterEq=2024-06-01&' +
          'f_archived_beforeEq=2024-12-31&' +
          'f_period_daterange=2024-01-01,2024-12-31&' +
          'f_optional_blank=true&' +
          'f_required_notBlank=true'

        const mockGridApi = {
          getFilterModel: vi.fn().mockReturnValue({}),
          setFilterModel: vi.fn()
        } as unknown as GridApi

        const filterState = parseUrlFilters(allDateOperationsUrl, {
          ...config,
          gridApi: mockGridApi
        })

        // Should parse all 9 date operations correctly
        expect(Object.keys(filterState)).toHaveLength(9)
        expect(filterState.created.type).toBe('eq')
        expect(filterState.deadline.type).toBe('notEqual')
        expect(filterState.start.type).toBe('dateAfter')
        expect(filterState.end.type).toBe('dateBefore')
        expect(filterState.updated.type).toBe('dateAfterOrEqual')
        expect(filterState.archived.type).toBe('dateBeforeOrEqual')
        expect(filterState.period.type).toBe('dateRange')
        expect(filterState.optional.type).toBe('blank')
        expect(filterState.required.type).toBe('notBlank')
      })
    })

    describe('Date Filter Edge Cases', () => {
      it('should handle leap year dates correctly', () => {
        const leapYearUrl = 'https://example.com?f_created_eq=2024-02-29'
        const filterState = parseUrlFilters(leapYearUrl, config)

        expect(filterState.created).toEqual({
          filterType: 'date',
          type: 'eq',
          filter: '2024-02-29'
        })
      })

      it('should reject invalid date formats in URL parsing', () => {
        const invalidDateUrl = 'https://example.com?f_created_eq=2024/01/15' // Wrong format

        expect(() => parseUrlFilters(invalidDateUrl, config)).not.toThrow()
        // Should handle error gracefully and continue processing
      })

      it('should handle date ranges across year boundaries', () => {
        const yearBoundaryUrl =
          'https://example.com?f_period_daterange=2023-12-31,2024-01-01'
        const filterState = parseUrlFilters(yearBoundaryUrl, config)

        expect(filterState.period).toEqual({
          filterType: 'date',
          type: 'dateRange',
          filter: '2023-12-31',
          filterTo: '2024-01-01'
        })
      })

      it('should preserve ISO date format in round-trip conversion', () => {
        const originalDate = '2024-01-15'
        const filterState: FilterState = {
          created: {
            filterType: 'date',
            type: 'eq',
            filter: originalDate
          }
        }

        // Convert to URL
        const params = serializeFilters(filterState, config)
        const urlString = params.toString()

        // Parse back from URL
        const testUrl = `https://example.com?${urlString}`
        const parsedState = parseUrlFilters(testUrl, config)

        expect(parsedState.created.filter).toBe(originalDate)
      })
    })

    describe('Integration with AGGridUrlSync Class', () => {
      it('should work seamlessly with AGGridUrlSync for date filters', () => {
        const mockFilterModel = {
          created: {
            filterType: 'date' as const,
            type: 'equals' as const,
            dateFrom: '2024-01-15'
          },
          deadline: {
            filterType: 'date' as const,
            type: 'lessThan' as const,
            dateFrom: '2024-12-31'
          },
          period: {
            filterType: 'date' as const,
            type: 'inRange' as const,
            dateFrom: '2024-01-01',
            dateTo: '2024-12-31'
          }
        }

        const mockGridApi = {
          getFilterModel: vi.fn().mockReturnValue(mockFilterModel),
          setFilterModel: vi.fn()
        } as unknown as GridApi

        const urlSync = new AGGridUrlSync(mockGridApi)

        // Generate URL from AG Grid state
        const url = urlSync.generateUrl('https://example.com')

        expect(url).toContain('f_created_eq=2024-01-15')
        expect(url).toContain('f_deadline_before=2024-12-31')
        expect(url).toContain('f_period_daterange=2024-01-01%2C2024-12-31') // URL encoded comma
      })
    })
  })
})

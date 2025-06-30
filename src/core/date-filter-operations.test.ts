import { describe, expect, it, vi } from 'vitest'
import type {
  FilterState,
  GridApi,
  InternalConfig,
  DateFilterOperation
} from './types.js'
import { applyFilterModel, detectColumnFilterType } from './grid-integration.js'
import { serializeFilters } from './url-generator.js'
import { parseFilterParam, parseUrlFilters } from './url-parser.js'
import { AGGridUrlSync } from './ag-grid-url-sync.js'

describe('Date Filter Operations', () => {
  const mockConfig: InternalConfig = {
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

          const params = serializeFilters(filterState, mockConfig)
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

          const testConfig = { ...mockConfig, gridApi: mockGridApi }
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
          const serializedParams = serializeFilters(filterState, mockConfig)
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

          const params = serializeFilters(filterState, mockConfig)
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

          const testConfig = { ...mockConfig, gridApi: mockGridApi }
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
          expect(() => parseFilterParam(param, rangeValue, 'f_')).not.toThrow()

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

          const params = serializeFilters(filterState, mockConfig)
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
        ...mockConfig,
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

    it('should serialize comprehensive date filter example correctly', () => {
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
        } as any,
        optional: { filterType: 'text', type: 'blank', filter: '' }
      }

      const params = serializeFilters(filterState, mockConfig)
      const paramString = params.toString()

      expect(paramString).toContain('f_created_eq=2024-01-15')
      expect(paramString).toContain('f_deadline_before=2024-12-31')
      expect(paramString).toContain(
        'f_period_daterange=2024-01-01%2C2024-12-31'
      )
      expect(paramString).toContain('f_optional_blank=true')
    })
  })

  describe('Date Filter Edge Cases', () => {
    it('should handle leap year dates correctly', () => {
      const leapYearUrl = 'https://example.com?f_created_eq=2024-02-29'
      const filterState = parseUrlFilters(leapYearUrl, mockConfig)

      expect(filterState.created).toEqual({
        filterType: 'date',
        type: 'eq',
        filter: '2024-02-29'
      })
    })

    it('should handle date ranges across year boundaries', () => {
      const yearBoundaryUrl =
        'https://example.com?f_period_daterange=2023-12-31,2024-01-01'
      const filterState = parseUrlFilters(yearBoundaryUrl, mockConfig)

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
      const params = serializeFilters(filterState, mockConfig)
      const urlString = params.toString()

      // Parse back from URL
      const testUrl = `https://example.com?${urlString}`
      const parsedState = parseUrlFilters(testUrl, mockConfig)

      expect(parsedState.created.filter).toBe(originalDate)
    })

    it('should handle invalid date range order correctly', () => {
      expect(() =>
        parseFilterParam('f_period_daterange', '2024-12-31,2024-01-01', 'f_')
      ).toThrow(/Date range invalid/)
    })

    it('should require exactly two dates for range', () => {
      expect(() =>
        parseFilterParam('f_period_daterange', '2024-01-01', 'f_')
      ).toThrow('Date range must contain exactly two dates separated by comma')

      expect(() =>
        parseFilterParam(
          'f_period_daterange',
          '2024-01-01,2024-02-01,2024-03-01',
          'f_'
        )
      ).toThrow('Date range must contain exactly two dates separated by comma')
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

    it('should apply date filters from URL using AGGridUrlSync', () => {
      const mockGridApi = {
        getFilterModel: vi.fn().mockReturnValue({}),
        setFilterModel: vi.fn(),
        getColumn: vi.fn().mockImplementation((colId: string) => {
          // Mock column definitions for proper type detection
          const dateColumns = ['created', 'deadline', 'period']
          if (dateColumns.includes(colId)) {
            return {
              getColDef: () => ({ filter: 'agDateColumnFilter' })
            }
          }
          return null
        })
      } as unknown as GridApi

      const urlSync = new AGGridUrlSync(mockGridApi)
      const dateFilterUrl =
        'https://example.com?' +
        'f_created_after=2024-01-01&' +
        'f_deadline_beforeEq=2024-12-31&' +
        'f_period_daterange=2024-06-01,2024-08-31'

      urlSync.applyFromUrl(dateFilterUrl)

      // Verify setFilterModel was called with correct AG Grid format
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        created: {
          filterType: 'date',
          type: 'greaterThan',
          dateFrom: '2024-01-01'
        },
        deadline: {
          filterType: 'date',
          type: 'lessThanOrEqual',
          dateFrom: '2024-12-31'
        },
        period: {
          filterType: 'date',
          type: 'inRange',
          dateFrom: '2024-06-01',
          dateTo: '2024-08-31'
        }
      })
    })
  })

  describe('Round-trip Consistency', () => {
    it('should maintain data integrity in round-trip conversion for single dates', () => {
      const originalDate = '2024-01-15'
      const filterState: FilterState = {
        created: {
          filterType: 'date',
          type: 'eq',
          filter: originalDate
        }
      }

      // Convert to URL
      const params = serializeFilters(filterState, mockConfig)
      const urlString = params.toString()

      // Parse back from URL
      const testUrl = `https://example.com?${urlString}`
      const parsedState = parseUrlFilters(testUrl, mockConfig)

      expect(parsedState.created.filter).toBe(originalDate)
      expect(parsedState.created.type).toBe('eq')
      expect(parsedState.created.filterType).toBe('date')
    })

    it('should maintain data integrity in round-trip conversion for date ranges', () => {
      const filterState: FilterState = {
        period: {
          filterType: 'date',
          type: 'dateRange',
          filter: '2024-01-01',
          filterTo: '2024-12-31'
        } as any
      }

      // Convert to URL
      const params = serializeFilters(filterState, mockConfig)
      const urlString = params.toString()

      // Parse back from URL
      const testUrl = `https://example.com?${urlString}`
      const parsedState = parseUrlFilters(testUrl, mockConfig)

      expect(parsedState.period.filter).toBe('2024-01-01')
      expect((parsedState.period as any).filterTo).toBe('2024-12-31')
      expect(parsedState.period.type).toBe('dateRange')
      expect(parsedState.period.filterType).toBe('date')
    })
  })
})

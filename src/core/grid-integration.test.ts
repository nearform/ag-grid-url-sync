import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getFilterModel,
  applyFilterModel,
  detectColumnFilterType,
  toGridModel,
  fromGridModel
} from './grid-integration.js'

import { generateUrl } from './url-generator.js'
import type { InternalConfig, FilterState } from './types.js'
import { asGridApi, createGridApiSpies } from '../test-helpers.js'

describe('Grid Integration', () => {
  let mockGridApi: ReturnType<typeof createGridApiSpies>
  let mockConfig: InternalConfig
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGridApi = createGridApiSpies()
    mockConfig = {
      gridApi: asGridApi(mockGridApi),
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

  describe('detectColumnFilterType', () => {
    it('should detect number filter type', () => {
      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agNumberColumnFilter' })
      })

      const result = detectColumnFilterType(asGridApi(mockGridApi), 'age')
      expect(result).toBe('number')
    })

    it('should detect date filter type', () => {
      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agDateColumnFilter' })
      })

      const result = detectColumnFilterType(asGridApi(mockGridApi), 'created')
      expect(result).toBe('date')
    })

    it('should default to text filter type', () => {
      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agTextColumnFilter' })
      })

      const result = detectColumnFilterType(asGridApi(mockGridApi), 'name')
      expect(result).toBe('text')
    })

    it('should handle missing column', () => {
      mockGridApi.getColumn.mockReturnValue(null)

      const result = detectColumnFilterType(
        asGridApi(mockGridApi),
        'nonexistent'
      )

      expect(result).toBe('text')
    })

    it('should handle column without filter definition', () => {
      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({})
      })

      const result = detectColumnFilterType(asGridApi(mockGridApi), 'nofilter')
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

    it.each(['__proto__', 'constructor', 'prototype'])(
      'should keep a column named %s as an own key (#253)',
      column => {
        // JSON.parse makes `__proto__` an own key, as AG Grid's model can have
        mockGridApi.getFilterModel.mockReturnValue(
          JSON.parse(
            `{"name":{"filterType":"text","type":"contains","filter":"a"},` +
              `"${column}":{"filterType":"text","type":"contains","filter":"b"}}`
          )
        )

        const result = getFilterModel(mockConfig)

        expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
        expect(Object.entries(result)).toEqual([
          ['name', { filterType: 'text', type: 'contains', filter: 'a' }],
          [column, { filterType: 'text', type: 'contains', filter: 'b' }]
        ])
      }
    )

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

    // AG Grid usually gives a number, which is what the grid filters on. A
    // string value gets the same check as a URL param (#238).
    it('should keep a number value from AG Grid as it is (#238)', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        id: {
          filterType: 'number',
          type: 'equals',
          filter: 12345678901234567000
        }
      })

      expect(getFilterModel(mockConfig)).toEqual({
        id: { filterType: 'number', type: 'eq', filter: 12345678901234567000 }
      })
      expect(mockConfig.onParseError).not.toHaveBeenCalled()
    })

    it('should read a string value from AG Grid as an exact number (#238)', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        price: { filterType: 'number', type: 'greaterThan', filter: ' 1e21 ' },
        id: {
          filterType: 'number',
          type: 'equals',
          filter: '12345678901234567890'
        },
        name: { filterType: 'number', type: 'equals', filter: 'abc' }
      })

      expect(getFilterModel(mockConfig)).toEqual({
        price: { filterType: 'number', type: 'greaterThan', filter: 1e21 }
      })
      expect(mockConfig.onParseError).toHaveBeenCalledTimes(2)
      expect(mockConfig.onParseError).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            "Number value 12345678901234567890 would be rounded to 12345678901234567000 (column 'id')"
        })
      )
      expect(mockConfig.onParseError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Invalid number format: abc (column 'name')"
        })
      )
    })

    // Only inRange uses filterTo, so the other operations ignore it, as before
    it('should ignore filterTo outside inRange (#238)', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        a: {
          filterType: 'number',
          type: 'greaterThan',
          filter: 5,
          filterTo: ''
        },
        b: {
          filterType: 'number',
          type: 'lessThan',
          filter: '7',
          filterTo: 'abc'
        }
      })

      expect(getFilterModel(mockConfig)).toEqual({
        a: { filterType: 'number', type: 'greaterThan', filter: 5 },
        b: { filterType: 'number', type: 'lessThan', filter: 7 }
      })
      expect(mockConfig.onParseError).not.toHaveBeenCalled()
    })

    it('should read a string filterTo from AG Grid as an exact number (#238)', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        p: {
          filterType: 'number',
          type: 'inRange',
          filter: '5',
          filterTo: '10'
        },
        q: {
          filterType: 'number',
          type: 'inRange',
          filter: 5,
          filterTo: '12345678901234567890'
        }
      })

      expect(getFilterModel(mockConfig)).toEqual({
        p: { filterType: 'number', type: 'inRange', filter: 5, filterTo: 10 }
      })
      expect(mockConfig.onParseError).toHaveBeenCalledOnce()
      expect(mockConfig.onParseError).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            "Number value 12345678901234567890 would be rounded to 12345678901234567000 (column 'q')"
        })
      )
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

    it.each(['__proto__', 'constructor', 'prototype'])(
      'should send a column named %s as an own key (#253)',
      column => {
        const filterState: FilterState = Object.fromEntries([
          ['name', { filterType: 'text', type: 'contains', filter: 'a' }],
          [column, { filterType: 'text', type: 'contains', filter: 'b' }]
        ])

        mockGridApi.getColumn.mockReturnValue({
          getColDef: () => ({ filter: 'agTextColumnFilter' })
        })

        applyFilterModel(filterState, mockConfig)

        const model = mockGridApi.setFilterModel.mock.calls[0]?.[0]

        expect(Object.getPrototypeOf(model)).toBe(Object.prototype)
        expect(Object.entries(model ?? {})).toEqual([
          ['name', { filterType: 'text', type: 'contains', filter: 'a' }],
          [column, { filterType: 'text', type: 'contains', filter: 'b' }]
        ])
      }
    )

    it('should apply number filters to AG Grid', () => {
      const filterState: FilterState = {
        age: { filterType: 'number', type: 'greaterThan', filter: 25 },
        salary: {
          filterType: 'number',
          type: 'inRange',
          filter: 50000,
          filterTo: 100000
        }
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
        }
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
        age: { filterType: 'number', type: 'inRange', filter: 25 }
      }

      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agNumberColumnFilter' })
      })

      applyFilterModel(filterState, mockConfig)

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        age: { filterType: 'number', type: 'inRange', filter: 25 }
      })
    })

    it('should report a type mismatch - date filter on non-date column', () => {
      const filterState: FilterState = {
        name: { filterType: 'date', type: 'eq', filter: '2024-01-15' }
      }

      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agTextColumnFilter' })
      })

      applyFilterModel(filterState, mockConfig)

      expect(consoleSpy).not.toHaveBeenCalled()
      expect(mockConfig.onParseError).toHaveBeenCalledOnce()
      expect(mockConfig.onParseError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TYPE_MISMATCH',
          column: 'name',
          message: expect.stringContaining(
            "Column 'name' expects a text filter but received a date filter"
          )
        })
      )
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
    })

    it('should report a type mismatch - number filter on non-number column', () => {
      const filterState: FilterState = {
        name: { filterType: 'number', type: 'eq', filter: 25 }
      }

      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agTextColumnFilter' })
      })

      applyFilterModel(filterState, mockConfig)

      expect(consoleSpy).not.toHaveBeenCalled()
      expect(mockConfig.onParseError).toHaveBeenCalledOnce()
      expect(mockConfig.onParseError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TYPE_MISMATCH',
          column: 'name',
          message: expect.stringContaining(
            "Column 'name' expects a text filter but received a number filter"
          )
        })
      )
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
    })

    it('should skip invalid filter objects', () => {
      // SAFETY: applyFilterModel skips an entry that is not a filter object
      // (the case under test), as a JavaScript caller can give one
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

  // gridApi is an argument, not a config field (#219). The tests above use the
  // deprecated config form, which still works.
  describe('gridApi as an argument (#219)', () => {
    const gridModel = {
      name: { filterType: 'text', type: 'contains', filter: 'john' },
      age: { filterType: 'number', type: 'greaterThan', filter: 25 }
    }

    const filterState: FilterState = {
      name: { filterType: 'text', type: 'contains', filter: 'john' }
    }

    it('getFilterModel reads the grid with no options', () => {
      mockGridApi.getFilterModel.mockReturnValue(gridModel)

      expect(getFilterModel(asGridApi(mockGridApi))).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'john' },
        age: { filterType: 'number', type: 'greaterThan', filter: 25 }
      })
    })

    it('getFilterModel reports errors to the onParseError option', () => {
      const onParseError = vi.fn()
      mockGridApi.getFilterModel.mockImplementation(() => {
        throw new Error('Grid API Error')
      })

      expect(getFilterModel(asGridApi(mockGridApi), { onParseError })).toEqual(
        {}
      )
      expect(onParseError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('getFilterModel gives the same result as the config form', () => {
      mockGridApi.getFilterModel.mockReturnValue(gridModel)

      expect(getFilterModel(asGridApi(mockGridApi))).toEqual(
        getFilterModel(mockConfig)
      )
    })

    it('applyFilterModel writes the model with no options', () => {
      applyFilterModel(filterState, asGridApi(mockGridApi))

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      })
    })

    it('applyFilterModel reports errors to the onParseError option', () => {
      const onParseError = vi.fn()
      mockGridApi.setFilterModel.mockImplementation(() => {
        throw new Error('Grid API Error')
      })

      expect(() =>
        applyFilterModel(filterState, asGridApi(mockGridApi), { onParseError })
      ).not.toThrow()
      expect(onParseError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('applyFilterModel does not throw without onParseError', () => {
      mockGridApi.setFilterModel.mockImplementation(() => {
        throw new Error('Grid API Error')
      })

      expect(() =>
        applyFilterModel(filterState, asGridApi(mockGridApi))
      ).not.toThrow()
    })
  })

  // AG Grid leaves a value out, or sets it to null, while a filter is being
  // edited. A filter whose operation needs a value that is not there is "no
  // filter" for that column. Blank filters need no value, so they are kept
  // (#260).
  describe('filters with no value (#260)', () => {
    const NUMBER_OPERATIONS = [
      'equals',
      'notEqual',
      'lessThan',
      'lessThanOrEqual',
      'greaterThan',
      'greaterThanOrEqual'
    ]

    const MISSING = [
      ['null', { filter: null }],
      ['left out', {}],
      ['an empty string', { filter: '' }],
      ['spaces', { filter: '  ' }]
    ] as const

    describe.each(MISSING)('a number value that is %s', (_, value) => {
      it.each(NUMBER_OPERATIONS)('drops %s and reports nothing', type => {
        mockGridApi.getFilterModel.mockReturnValue({
          n: { filterType: 'number', type, ...value },
          name: { filterType: 'text', type: 'contains', filter: 'john' }
        })

        expect(getFilterModel(mockConfig)).toEqual({
          name: { filterType: 'text', type: 'contains', filter: 'john' }
        })
        expect(mockConfig.onParseError).not.toHaveBeenCalled()
      })
    })

    it('does not write a param for a number value that is null', () => {
      mockGridApi.getFilterModel.mockReturnValue({
        n: { filterType: 'number', type: 'equals', filter: null }
      })

      const url = generateUrl(
        'https://example.com/',
        getFilterModel(mockConfig)
      )

      expect(url).toBe('https://example.com')
    })

    it.each([
      ['filterTo is null', { filter: 5, filterTo: null }],
      ['filterTo is left out', { filter: 5 }],
      ['filter is null', { filter: null, filterTo: 10 }],
      ['both are left out', {}]
    ])('drops an inRange number filter when %s', (_, values) => {
      mockGridApi.getFilterModel.mockReturnValue({
        n: { filterType: 'number', type: 'inRange', ...values }
      })

      expect(getFilterModel(mockConfig)).toEqual({})
      expect(mockConfig.onParseError).not.toHaveBeenCalled()
    })

    it.each(['blank', 'notBlank'] as const)(
      'keeps a %s number filter',
      type => {
        mockGridApi.getFilterModel.mockReturnValue({
          n: { filterType: 'number', type }
        })

        expect(getFilterModel(mockConfig)).toEqual({
          n: { filterType: 'number', type, filter: 0 }
        })
        expect(mockConfig.onParseError).not.toHaveBeenCalled()
      }
    )

    it.each(['blank', 'notBlank'] as const)(
      'writes a %s number filter to the URL',
      type => {
        mockGridApi.getFilterModel.mockReturnValue({
          n: { filterType: 'number', type, filter: null }
        })

        const url = generateUrl(
          'https://example.com/',
          getFilterModel(mockConfig)
        )

        expect(new URL(url).searchParams.get(`f_n_${type}`)).toBe('true')
      }
    )

    it.each(['blank', 'notBlank'] as const)(
      'gives a %s number filter back to AG Grid with no value',
      type => {
        mockGridApi.getFilterModel.mockReturnValue({
          n: { filterType: 'number', type }
        })
        mockGridApi.getColumn.mockReturnValue({
          getColDef: () => ({ filter: 'agNumberColumnFilter' })
        })

        applyFilterModel(getFilterModel(mockConfig), mockConfig)

        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          n: { filterType: 'number', type, filter: null }
        })
      }
    )

    it.each([
      ['null', { dateFrom: null }],
      ['left out', {}],
      ['an empty string', { dateFrom: '' }]
    ])('drops a date filter whose date is %s', (_, value) => {
      mockGridApi.getFilterModel.mockReturnValue({
        d: { filterType: 'date', type: 'lessThan', ...value }
      })

      expect(getFilterModel(mockConfig)).toEqual({})
      expect(mockConfig.onParseError).not.toHaveBeenCalled()
    })

    it.each([
      ['dateTo is null', { dateFrom: '2024-01-01', dateTo: null }],
      ['dateTo is left out', { dateFrom: '2024-01-01' }],
      ['dateFrom is null', { dateFrom: null, dateTo: '2024-12-31' }]
    ])('drops an inRange date filter when %s', (_, values) => {
      mockGridApi.getFilterModel.mockReturnValue({
        d: { filterType: 'date', type: 'inRange', ...values }
      })

      expect(getFilterModel(mockConfig)).toEqual({})
      expect(mockConfig.onParseError).not.toHaveBeenCalled()
    })

    it.each(['blank', 'notBlank'] as const)('keeps a %s date filter', type => {
      mockGridApi.getFilterModel.mockReturnValue({
        d: { filterType: 'date', type, dateFrom: null, dateTo: null }
      })

      expect(getFilterModel(mockConfig)).toEqual({
        d: { filterType: 'date', type, filter: '' }
      })
    })
  })

  // A handler that throws gets its own error back. The library does not catch
  // it and report it again as GRID_ERROR (#220 review).
  describe('a throwing onParseError', () => {
    const handlerError = new Error('handler failed')

    const throwingHandler = () =>
      vi.fn(() => {
        throw handlerError
      })

    it('reaches the caller of applyFilterModel and is reported one time', () => {
      const onParseError = throwingHandler()
      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agTextColumnFilter' })
      })

      expect(() =>
        applyFilterModel(
          { name: { filterType: 'number', type: 'eq', filter: 1 } },
          asGridApi(mockGridApi),
          { onParseError }
        )
      ).toThrow(handlerError)
      expect(onParseError).toHaveBeenCalledOnce()
      expect(onParseError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'TYPE_MISMATCH' })
      )
    })

    it('reaches the caller of getFilterModel and is reported one time', () => {
      const onParseError = throwingHandler()
      mockGridApi.getFilterModel.mockReturnValue({
        n: { filterType: 'number', type: 'foo', filter: 1 }
      })

      expect(() =>
        getFilterModel(asGridApi(mockGridApi), { onParseError })
      ).toThrow(handlerError)
      expect(onParseError).toHaveBeenCalledOnce()
      expect(onParseError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'INVALID_PARAM' })
      )
    })
  })

  describe('toGridModel / fromGridModel (#223)', () => {
    it('gives the model for a text filter and does not call setFilterModel', () => {
      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agTextColumnFilter' })
      })

      const model = toGridModel(
        { name: { filterType: 'text', type: 'contains', filter: 'jo' } },
        asGridApi(mockGridApi)
      )

      expect(model).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'jo' }
      })
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()
    })

    it('reports TYPE_MISMATCH for a number filter on a text column', () => {
      const onParseError = vi.fn()
      mockGridApi.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agTextColumnFilter' })
      })

      const model = toGridModel(
        { name: { filterType: 'number', type: 'eq', filter: 1 } },
        asGridApi(mockGridApi),
        { onParseError }
      )

      expect(model).toEqual({})
      expect(onParseError).toHaveBeenCalledOnce()
      expect(onParseError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'TYPE_MISMATCH', column: 'name' })
      )
    })

    it('fromGridModel skips set filters', () => {
      expect(
        fromGridModel({
          status: { filterType: 'set', values: ['open'] },
          name: { filterType: 'text', type: 'contains', filter: 'jo' }
        })
      ).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'jo' }
      })
    })

    it('fromGridModel gives an empty state for null', () => {
      expect(fromGridModel(null)).toEqual({})
    })
  })
})

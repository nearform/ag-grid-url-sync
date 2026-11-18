import { describe, it, expect, vi, beforeEach } from 'vitest'
import { serializeFilters, writeUrlFilters } from './url-generator.js'
import { readUrlFilters } from './url-parser.js'
import type { FilterModel } from 'ag-grid-community'
import type { ResolvedOptions } from './types.js'
import { InvalidFilterError } from './types.js'

describe('URL Generator', () => {
  const mockConfig: ResolvedOptions = {
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: vi.fn(),
    serialization: 'individual',
    format: 'querystring',
    groupedParam: 'grid_filters'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('serializeFilters', () => {
    it('skips a text value over maxValueLength and reports it', () => {
      const config = { ...mockConfig, maxValueLength: 5 }

      const filterState: FilterModel = {
        name: { filterType: 'text', type: 'contains', filter: 'john smith' },
        age: { filterType: 'number', type: 'greaterThan', filter: 25 }
      }

      const result = serializeFilters(filterState, config)

      expect([...result.entries()]).toEqual([['f_age_gt', '25']])
      expect(config.onParseError).toHaveBeenCalledOnce()
      expect(vi.mocked(config.onParseError).mock.calls[0]?.[0]).toBeInstanceOf(
        InvalidFilterError
      )
    })

    it('should serialize basic text filter', () => {
      const filterState: FilterModel = {
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }

      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_name_contains')).toBe('john')
    })

    it('should serialize number filter', () => {
      const filterState: FilterModel = {
        age: { filterType: 'number', type: 'equals', filter: 25 }
      }

      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_age_eq')).toBe('25')
    })

    it('should serialize date filter', () => {
      const filterState: FilterModel = {
        created: { filterType: 'date', type: 'equals', dateFrom: '2024-01-15' }
      }

      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_created_eq')).toBe('2024-01-15')
    })

    it('should serialize range filters', () => {
      const filterState: FilterModel = {
        age: {
          filterType: 'number',
          type: 'inRange',
          filter: 25,
          filterTo: 65
        },
        period: {
          filterType: 'date',
          type: 'inRange',
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31'
        }
      }

      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_age_range')).toBe('25,65')
      expect(result.get('f_period_daterange')).toBe('2024-01-01,2024-12-31')
    })

    it('should serialize blank operations', () => {
      const filterState: FilterModel = {
        optional: { filterType: 'text', type: 'blank', filter: '' },
        required: { filterType: 'text', type: 'notBlank', filter: '' }
      }

      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_optional_blank')).toBe('true')
      expect(result.get('f_required_notBlank')).toBe('true')
    })

    it.each([
      ['=', 'a=b'],
      ['&', 'a&b'],
      ['%', '100%'],
      ['+', 'a+b'],
      ['space', 'first name']
    ])('should keep a column id that contains %s', (_label, column) => {
      const filterState: FilterModel = {
        [column]: { filterType: 'text', type: 'contains', filter: 'q' }
      }

      const result = serializeFilters(filterState, mockConfig)
      expect([...result.entries()]).toEqual([[`f_${column}_contains`, 'q']])
    })

    it.each([
      ['date', { filterType: 'date', type: 'greaterThan', dateFrom: '' }],
      ['text', { filterType: 'text', type: 'contains', filter: '' }]
    ])('should skip a %s filter with an empty value', (_label, filter) => {
      const errors = vi.fn()

      const result = serializeFilters(
        { col: filter },
        { ...mockConfig, onParseError: errors }
      )

      expect([...result.entries()]).toEqual([])
      expect(errors).not.toHaveBeenCalled()
    })

    it('should keep a number filter with the value 0', () => {
      const filterState: FilterModel = {
        qty: { filterType: 'number', type: 'equals', filter: 0 }
      }

      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_qty_eq')).toBe('0')
    })

    it('should keep a text value that contains =', () => {
      const filterState: FilterModel = {
        expr: { filterType: 'text', type: 'contains', filter: 'a=b' }
      }

      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_expr_contains')).toBe('a=b')
    })

    it('should handle special characters', () => {
      const filterState: FilterModel = {
        query: { filterType: 'text', type: 'contains', filter: 'test & more' }
      }

      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_query_contains')).toBe('test & more')
    })
  })

  describe('writeUrlFilters', () => {
    it('should generate URL with filters', () => {
      const filterState: FilterModel = {
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }

      const result = writeUrlFilters(
        'https://example.com',
        filterState,
        mockConfig
      )

      expect(result).toBe('https://example.com/?f_name_contains=john')
    })

    it('should handle empty filter state', () => {
      const result = writeUrlFilters('https://example.com', {}, mockConfig)
      expect(result).toBe('https://example.com')
    })

    it('should preserve existing query parameters', () => {
      const filterState: FilterModel = {
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }

      const result = writeUrlFilters(
        'https://example.com?page=1',
        filterState,
        mockConfig
      )

      expect(result).toContain('page=1')
      expect(result).toContain('f_name_contains=john')
    })

    it('should round-trip column ids with special characters', () => {
      const filterState: FilterModel = {
        'a=b': { filterType: 'text', type: 'contains', filter: 'one' },
        'x&y': { filterType: 'number', type: 'greaterThan', filter: 2 },
        '100%': {
          filterType: 'date',
          type: 'greaterThan',
          dateFrom: '2024-01-15',
          dateTo: null
        }
      }

      const url = writeUrlFilters(
        'https://example.com',
        filterState,
        mockConfig
      )

      expect(readUrlFilters(url, mockConfig)).toEqual(filterState)
    })

    describe('host params', () => {
      const filterState: FilterModel = {
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }

      it.each([
        ['individual', mockConfig],
        ['grouped', { ...mockConfig, serialization: 'grouped' as const }]
      ])('should keep repeated host params in %s mode', (_label, config) => {
        const result = new URL(
          writeUrlFilters(
            'https://example.com/?tag=a&page=1&tag=b',
            filterState,
            config
          )
        )

        expect(result.searchParams.getAll('tag')).toEqual(['a', 'b'])
        expect(result.searchParams.get('page')).toBe('1')
      })

      it.each([
        ['individual', mockConfig],
        ['grouped', { ...mockConfig, serialization: 'grouped' as const }]
      ])(
        'should keep repeated host params with no filters in %s mode',
        (_label, config) => {
          const result = writeUrlFilters(
            'https://example.com/?tag=a&tag=b',
            {},
            config
          )

          expect(result).toBe('https://example.com/?tag=a&tag=b')
        }
      )
    })

    it.each([
      ['individual', mockConfig],
      ['grouped', { ...mockConfig, serialization: 'grouped' as const }]
    ])(
      'should remove old filter params when filters are cleared in %s mode',
      (_label, config) => {
        expect(
          writeUrlFilters(
            'https://example.com/?f_a_contains=old&grid_filters=f_b_eq%3D1',
            {},
            config
          )
        ).toBe('https://example.com')
      }
    )

    it('should keep the hash when filters are cleared', () => {
      expect(
        writeUrlFilters(
          'https://example.com/list?f_a_contains=old#top',
          {},
          mockConfig
        )
      ).toBe('https://example.com/list#top')
    })

    // #228: the writer and the parser must read paramPrefix the same way. A
    // prefix without a trailing `_` gets one, and '' means the default `f_`.
    describe('paramPrefix', () => {
      const state: FilterModel = {
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }

      it.each([
        ['filter', 'filter_name_contains'],
        ['filter_', 'filter_name_contains'],
        ['x-', 'x-_name_contains'],
        ['', 'f_name_contains']
      ])('should write prefix %j as %s and parse it back', (prefix, key) => {
        const config = { ...mockConfig, paramPrefix: prefix }

        const url = writeUrlFilters(
          'https://example.com/?page=2',
          state,
          config
        )

        expect([...new URL(url).searchParams.keys()]).toEqual(['page', key])
        expect(readUrlFilters(url, config)).toEqual(state)
        expect(mockConfig.onParseError).not.toHaveBeenCalled()
      })

      it('should remove stale filter params when the prefix is empty', () => {
        const config = { ...mockConfig, paramPrefix: '' }

        const url = writeUrlFilters(
          'https://example.com/?f_old_contains=x&page=2',
          state,
          config
        )

        expect(url).toBe('https://example.com/?page=2&f_name_contains=john')
      })
    })

    describe('stale params from the other mode', () => {
      const newState: FilterModel = {
        b: { filterType: 'text', type: 'contains', filter: 'new' }
      }

      it('should remove the grouped param in individual mode', () => {
        const url = writeUrlFilters(
          'https://example.com/?grid_filters=f_a_contains%3Dold&page=1',
          newState,
          mockConfig
        )

        expect(new URL(url).searchParams.has('grid_filters')).toBe(false)
        expect(new URL(url).searchParams.get('page')).toBe('1')
        expect(readUrlFilters(url, mockConfig)).toEqual(newState)
      })

      it('should remove the grouped param in individual mode with no filters', () => {
        const url = writeUrlFilters(
          'https://example.com/?grid_filters=f_a_contains%3Dold&page=1',
          {},
          mockConfig
        )

        expect(url).toBe('https://example.com/?page=1')
      })

      it('should remove a custom grouped param in individual mode', () => {
        const config = { ...mockConfig, groupedParam: 'gf' }

        const url = writeUrlFilters(
          'https://example.com/?gf=f_a_contains%3Dold',
          newState,
          config
        )

        expect(new URL(url).searchParams.has('gf')).toBe(false)
      })

      it('should remove prefixed params in grouped mode', () => {
        const config = { ...mockConfig, serialization: 'grouped' as const }

        const url = writeUrlFilters(
          'https://example.com/?f_a_contains=old&page=1',
          newState,
          config
        )

        const params = new URL(url).searchParams
        expect(params.has('f_a_contains')).toBe(false)
        expect(params.get('page')).toBe('1')
        expect(readUrlFilters(url, config)).toEqual(newState)
      })
    })

    // #309: with no filters, each codec writes no filter param
    describe('no filters in grouped mode', () => {
      it.each(['querystring', 'json', 'base64'] as const)(
        'should write no grouped param and remove the old one in %s format',
        format => {
          const config = {
            ...mockConfig,
            serialization: 'grouped' as const,
            format
          }

          expect(
            writeUrlFilters(
              'https://app.com/data?x=1&grid_filters=old',
              {},
              config
            )
          ).toBe('https://app.com/data?x=1')
        }
      )

      it.each(['querystring', 'json', 'base64'] as const)(
        'should write no grouped param when each filter is dropped in %s format',
        format => {
          const config = {
            ...mockConfig,
            serialization: 'grouped' as const,
            format
          }

          const tooLong: FilterModel = {
            name: {
              filterType: 'text',
              type: 'contains',
              filter: 'x'.repeat(201)
            }
          }

          expect(writeUrlFilters('https://app.com/data', tooLong, config)).toBe(
            'https://app.com/data'
          )
          expect(mockConfig.onParseError).toHaveBeenCalledOnce()
        }
      )

      it.each([
        ['json', '%7B%7D'],
        ['base64', 'e30%3D']
      ] as const)(
        'should still read an empty %s value as no filters with no issue',
        (format, value) => {
          const config = {
            ...mockConfig,
            serialization: 'grouped' as const,
            format
          }

          expect(
            readUrlFilters(`https://app.com/data?grid_filters=${value}`, config)
          ).toEqual({})
          expect(mockConfig.onParseError).not.toHaveBeenCalled()
        }
      )
    })

    // #314: the page's own params keep their text and order, and the filter
    // params go after them, in both modes
    describe('page params text and order', () => {
      const state: FilterModel = {
        name: { filterType: 'text', type: 'contains', filter: 'a' }
      }

      const grouped = { ...mockConfig, serialization: 'grouped' as const }
      const json = { ...grouped, format: 'json' as const }

      // The json format writes the keys in sorted order
      const jsonValue = encodeURIComponent(
        '{"name":{"filter":"a","filterType":"text","type":"contains"}}'
      )

      it.each([
        ['individual', mockConfig, 'f_name_contains=a'],
        ['grouped querystring', grouped, 'grid_filters=f_name_contains%3Da'],
        ['grouped json', json, `grid_filters=${jsonValue}`]
      ])(
        'should keep a param with no value and an encoded space in %s mode',
        (_label, config, filterPart) => {
          expect(
            writeUrlFilters(
              'https://app.com/?debug&q=two%20words',
              state,
              config
            )
          ).toBe(`https://app.com/?debug&q=two%20words&${filterPart}`)
        }
      )

      it.each([
        ['individual', mockConfig],
        ['grouped', grouped]
      ])(
        'should keep the page params as they were with no filters in %s mode',
        (_label, config) => {
          expect(
            writeUrlFilters(
              'https://app.com/?debug&f_a_contains=old&q=a+b&grid_filters=x',
              {},
              config
            )
          ).toBe('https://app.com/?debug&q=a+b')
        }
      )

      it.each([
        ['individual', mockConfig, 'f_name_contains=a'],
        ['grouped', grouped, 'grid_filters=f_name_contains%3Da']
      ])(
        'should remove a filter param between page params in %s mode',
        (_label, config, filterPart) => {
          expect(
            writeUrlFilters(
              'https://app.com/?a=1&f_old_contains=x&b=2&grid_filters=y&c',
              state,
              config
            )
          ).toBe(`https://app.com/?a=1&b=2&c&${filterPart}`)
        }
      )

      it('should keep repeated page params in their order', () => {
        expect(
          writeUrlFilters(
            'https://app.com/?tag=a&page=1&tag=b',
            state,
            mockConfig
          )
        ).toBe('https://app.com/?tag=a&page=1&tag=b&f_name_contains=a')
      })

      it('should remove a filter param with an encoded name', () => {
        expect(
          writeUrlFilters(
            'https://app.com/?f%5Fold_contains=x&grid%5Ffilters=y&a=1',
            state,
            mockConfig
          )
        ).toBe('https://app.com/?a=1&f_name_contains=a')
      })

      it.each([
        ['https://app.com/?', 'https://app.com/?f_name_contains=a'],
        ['https://app.com/?&a=1', 'https://app.com/?a=1&f_name_contains=a'],
        [
          'https://app.com/?a=1&&b=2',
          'https://app.com/?a=1&b=2&f_name_contains=a'
        ]
      ])('should drop the empty parts of %s', (input, expected) => {
        expect(writeUrlFilters(input, state, mockConfig)).toBe(expected)
      })

      it('should keep the hash after the params', () => {
        expect(
          writeUrlFilters('https://app.com/list?debug#top', state, mockConfig)
        ).toBe('https://app.com/list?debug&f_name_contains=a#top')
      })
    })
  })
})

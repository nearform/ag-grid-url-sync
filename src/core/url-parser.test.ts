import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readUrlFilters } from './url-parser.js'
import { parseIndividualParams } from './individual-params.js'
import { DEFAULT_CONFIG } from './options.js'
import { writeUrlFilters } from './url-generator.js'
import { InvalidFilterError, InvalidURLError } from './types.js'
import type { ColumnFilter, FilterType, ResolvedOptions } from './types.js'

/**
 * Parses one prefixed param with the individual codec's internal parser, and
 * gives its filter. With throwOnError, a bad param throws its issue.
 */
function parseParam(
  param: string,
  value: string,
  columnType?: FilterType
): ColumnFilter | undefined {
  const filters = parseIndividualParams(new URLSearchParams([[param, value]]), {
    ...DEFAULT_CONFIG,
    paramPrefix: 'f_',
    throwOnError: true,
    columnTypes: columnType ? () => columnType : undefined
  })

  return Object.values(filters)[0]
}

describe('URL Parser', () => {
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

  describe('parseIndividualParams, one param', () => {
    it('should parse text operations', () => {
      expect(parseParam('f_name_contains', 'john')).toEqual({
        filterType: 'text',
        type: 'contains',
        filter: 'john'
      })
      expect(parseParam('f_status_eq', 'active')).toEqual({
        filterType: 'text',
        type: 'eq',
        filter: 'active'
      })
    })

    it('should parse number operations', () => {
      expect(parseParam('f_age_eq', '25', 'number')).toEqual({
        filterType: 'number',
        type: 'eq',
        filter: 25
      })
      expect(parseParam('f_age_range', '25,65')).toEqual({
        filterType: 'number',
        type: 'inRange',
        filter: 25,
        filterTo: 65
      })
    })

    // #214: parseFloat accepts a number at the start of the value ("3M" -> 3)
    describe.each([
      ['eq', 'eq'],
      ['neq', 'notEqual']
    ])('shared operation %s on a number column (#224)', (op, type) => {
      it.each([
        '3M',
        '1e',
        '12abc',
        '0x10',
        '1e400',
        '1.2.3',
        // #238: values that would lose digits
        '9007199254740993',
        '12345678901234567890',
        '-12345678901234567891',
        '0.12345678901234567891'
      ])('should report %s, and keep it as text with no type', value => {
        expect(() => parseParam(`f_age_${op}`, value, 'number')).toThrow(
          expect.objectContaining({ code: 'INVALID_NUMBER' })
        )
        expect(parseParam(`f_name_${op}`, value)).toEqual({
          filterType: 'text',
          type,
          filter: value
        })
      })

      it.each([
        ['42', 42],
        ['-1.5', -1.5],
        // #238: no digits are lost, in any form
        ['9007199254740992', 2 ** 53],
        ['+9007199254740992', 2 ** 53],
        ['9007199254740992.0', 2 ** 53],
        ['1e+21', 1e21],
        ['1E+21', 1e21],
        ['1e21', 1e21],
        ['1.50', 1.5],
        ['007', 7],
        ['.5', 0.5],
        ['2e3', 2000]
      ])('should parse %s as a number', (value, expected) => {
        expect(parseParam(`f_age_${op}`, value, 'number')).toEqual({
          filterType: 'number',
          type,
          filter: expected
        })
      })
    })

    it('should parse date operations', () => {
      expect(parseParam('f_created_eq', '2024-01-15', 'date')).toEqual({
        filterType: 'date',
        type: 'eq',
        filter: '2024-01-15'
      })
      expect(parseParam('f_period_daterange', '2024-01-01,2024-12-31')).toEqual(
        {
          filterType: 'date',
          type: 'dateRange',
          filter: '2024-01-01',
          filterTo: '2024-12-31'
        }
      )
    })

    it('should parse blank operations', () => {
      expect(parseParam('f_optional_blank', 'true')).toEqual({
        filterType: 'text',
        type: 'blank',
        filter: ''
      })
      expect(parseParam('f_required_notBlank', 'true')).toEqual({
        filterType: 'text',
        type: 'notBlank',
        filter: ''
      })
    })

    it('should throw on invalid parameters', () => {
      expect(() => parseParam('f_name', 'value')).toThrow(InvalidFilterError)
      expect(() => parseParam('f_name_invalid', 'value')).toThrow(
        InvalidFilterError
      )
    })
  })

  describe('readUrlFilters', () => {
    it('should parse URL with multiple filters', () => {
      const url =
        'https://example.com?f_name_contains=john&f_age_gte=25&f_created_after=2024-01-01'

      const result = readUrlFilters(url, mockConfig)

      expect(result).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'john' },
        age: { filterType: 'number', type: 'greaterThanOrEqual', filter: 25 },
        created: {
          filterType: 'date',
          type: 'greaterThan',
          dateFrom: '2024-01-01',
          dateTo: null
        }
      })
    })

    // Assignment to `obj['__proto__']` sets the prototype instead of a key
    it.each(['__proto__', 'constructor', 'prototype'])(
      'should keep a column named %s as an own key (#253)',
      column => {
        const result = readUrlFilters(
          `?f_name_contains=a&f_${column}_contains=b`,
          mockConfig
        )

        expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
        expect(Object.entries(result)).toEqual([
          ['name', { filterType: 'text', type: 'contains', filter: 'a' }],
          [column, { filterType: 'text', type: 'contains', filter: 'b' }]
        ])
      }
    )

    it('should parse numbers outside the safe integer range (#238)', () => {
      expect(
        readUrlFilters('?f_a_gt=9007199254740992&f_b_eq=1e%2B21', {
          ...mockConfig,
          columnTypes: () => 'number'
        })
      ).toEqual({
        a: { filterType: 'number', type: 'greaterThan', filter: 2 ** 53 },
        b: { filterType: 'number', type: 'equals', filter: 1e21 }
      })
      expect(mockConfig.onParseError).not.toHaveBeenCalled()
    })

    // Hand-written values: the same rule as the eq type guess, but a
    // number-only operation cannot fall back to text
    it.each([
      [
        'f_id_gt=12345678901234567890',
        '12345678901234567890 would be rounded to 12345678901234567000'
      ],
      [
        'f_id_range=9007199254740993,9007199254740995',
        '9007199254740993 would be rounded to 9007199254740992'
      ],
      [
        'f_id_lte=0.12345678901234567891',
        '0.12345678901234567891 would be rounded to 0.12345678901234568'
      ]
    ])(
      'should report %s, which would be rounded, and skip it (#238)',
      (param, rounded) => {
        expect(readUrlFilters(`?f_ok_gt=1&${param}`, mockConfig)).toEqual({
          ok: { filterType: 'number', type: 'greaterThan', filter: 1 }
        })
        expect(mockConfig.onParseError).toHaveBeenCalledOnce()
        expect(mockConfig.onParseError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: `Number value ${rounded}`
          })
        )
      }
    )

    it('should keep an exact number in any form in a number-only operation (#238)', () => {
      expect(
        readUrlFilters('?f_a_gt=1e21&f_b_range=1E%2B21,1.5e21', mockConfig)
      ).toEqual({
        a: { filterType: 'number', type: 'greaterThan', filter: 1e21 },
        b: {
          filterType: 'number',
          type: 'inRange',
          filter: 1e21,
          filterTo: 1.5e21
        }
      })
      expect(mockConfig.onParseError).not.toHaveBeenCalled()
    })

    it('should keep a value written with more digits than its shortest form (#238)', () => {
      expect(
        readUrlFilters(
          '?f_price_gt=19.989999999999998&f_x_range=0.10000000000000001,1',
          mockConfig
        )
      ).toEqual({
        price: { filterType: 'number', type: 'greaterThan', filter: 19.99 },
        x: { filterType: 'number', type: 'inRange', filter: 0.1, filterTo: 1 }
      })
      expect(mockConfig.onParseError).not.toHaveBeenCalled()
    })

    // URLSearchParams reads a raw `+` as a space
    // In a number-only operation, the space can only be an exponent sign. In
    // the eq type guess it stays text, so a text value such as "2E 5" (which
    // writeUrlFilters writes as 2E+5) round-trips.
    it('should read an exponent with a raw + in a number-only operation (#238)', () => {
      expect(
        readUrlFilters('?f_a_gt=1e+21&f_b_lt=1.e+5&f_c_eq=1e+21', mockConfig)
      ).toEqual({
        a: { filterType: 'number', type: 'greaterThan', filter: 1e21 },
        b: { filterType: 'number', type: 'lessThan', filter: 1e5 },
        c: { filterType: 'text', type: 'equals', filter: '1e 21' }
      })
      expect(mockConfig.onParseError).not.toHaveBeenCalled()
    })

    it('should round-trip a text value shaped like a number with a space (#238)', () => {
      const model = {
        code: { filterType: 'text', type: 'equals', filter: '2E 5' }
      }

      expect(
        readUrlFilters(
          writeUrlFilters('https://x.test/', model, mockConfig),
          mockConfig
        )
      ).toEqual(model)
    })

    it('should keep a value that only starts with a number as text (#214)', () => {
      expect(readUrlFilters('?f_name_eq=3M', mockConfig)).toEqual({
        name: { filterType: 'text', type: 'equals', filter: '3M' }
      })
    })

    it('should handle empty URLs and ignore non-filter params', () => {
      expect(readUrlFilters('https://example.com', mockConfig)).toEqual({})

      const result = readUrlFilters(
        'https://example.com?page=1&f_name_contains=john&sort=name',
        mockConfig
      )

      expect(result).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      })
    })

    it('should handle URL encoding', () => {
      const url = 'https://example.com?f_query_contains=hello%20world'
      const result = readUrlFilters(url, mockConfig)
      expect(result.query?.filter).toBe('hello world')
    })

    // #228: hand-written URLs with a `_` after the prefix keep working
    it.each([
      ['filter', '?filter_name_contains=john&page=2'],
      ['', '?f_name_contains=john&page=2']
    ])(
      'should read prefix %j and ignore the page params (#228)',
      (prefix, url) => {
        expect(
          readUrlFilters(url, { ...mockConfig, paramPrefix: prefix })
        ).toEqual({
          name: { filterType: 'text', type: 'contains', filter: 'john' }
        })
        expect(mockConfig.onParseError).not.toHaveBeenCalled()
      }
    )

    describe('input forms', () => {
      const name = { filterType: 'text', type: 'contains', filter: 'bob' }
      const price = { filterType: 'number', type: 'greaterThan', filter: 1.5 }

      it.each([
        ['an absolute URL', 'https://example.com/users?f_name_contains=bob'],
        ['a relative path', '/users?f_name_contains=bob'],
        [
          'a relative path with = and & before the ?',
          '/users/id=1&x=2?f_name_contains=bob'
        ],
        ['a protocol-relative URL', '//example.com/users?f_name_contains=bob'],
        ['a query string', '?f_name_contains=bob'],
        ['a raw query string', 'f_name_contains=bob'],
        ['a raw query string with other params', 'page=2&f_name_contains=bob']
      ])('should parse %s', (_label, url) => {
        expect(readUrlFilters(url, mockConfig)).toEqual({ name })
      })

      it('should parse a raw query string that contains a dot', () => {
        expect(readUrlFilters('f_price_gt=1.5', mockConfig)).toEqual({
          price
        })
      })

      it('should parse a relative path with a dot in its value', () => {
        expect(readUrlFilters('/products?f_price_gt=1.5', mockConfig)).toEqual({
          price
        })
      })

      it.each([
        ['a raw query string', 'f_name_contains=what?ever'],
        [
          'a raw query string with other params',
          'page=2&f_name_contains=what?ever'
        ]
      ])('should keep a ? in a value of %s', (_label, url) => {
        expect(readUrlFilters(url, mockConfig)).toEqual({
          name: { filterType: 'text', type: 'contains', filter: 'what?ever' }
        })
      })

      it('should keep a # in a value of a raw query string', () => {
        expect(readUrlFilters('f_name_contains=a#b', mockConfig)).toEqual({
          name: { filterType: 'text', type: 'contains', filter: 'a#b' }
        })
      })

      it('should keep a ? in a param name of a raw query string', () => {
        expect(readUrlFilters('f_first?name_contains=bob', mockConfig)).toEqual(
          { 'first?name': name }
        )
      })

      it('should read text with no scheme and no leading / as a raw query', () => {
        // A relative path must start with '/'. Without it, `users?...` is a
        // raw query whose first key is `users?f_name_contains`.
        expect(readUrlFilters('users?f_name_contains=bob', mockConfig)).toEqual(
          {}
        )
      })

      it('should return no filters for text with no filter params', () => {
        expect(readUrlFilters('not-a-url', mockConfig)).toEqual({})
      })
    })

    describe('grouped param', () => {
      const name = { filterType: 'text', type: 'contains', filter: 'bob' }
      const json = encodeURIComponent(JSON.stringify({ name }))
      const base64 = encodeURIComponent(btoa(JSON.stringify({ name })))

      it('should ignore a host param called filters', () => {
        expect(
          readUrlFilters('?filters=active&f_name_contains=bob', mockConfig)
        ).toEqual({ name })
      })

      it('should ignore grid_filters when groupedParam is different', () => {
        const config = { ...mockConfig, groupedParam: 'gf' }
        expect(
          readUrlFilters(
            '?grid_filters=f_age_gt%3D1&f_name_contains=bob',
            config
          )
        ).toEqual({ name })
      })

      it('should read the configured groupedParam', () => {
        const config = { ...mockConfig, groupedParam: 'gf' }
        expect(
          readUrlFilters('?gf=f_name_contains%3Dbob&f_age_gt=1', config)
        ).toEqual({ name })
      })

      it('should decode with the configured format', () => {
        const config = { ...mockConfig, format: 'json' as const }
        expect(readUrlFilters(`?grid_filters=${json}`, config)).toEqual({
          name
        })
      })

      it('should not guess the format', () => {
        const onParseError = vi.fn()

        const config = {
          ...mockConfig,
          format: 'json' as const,
          onParseError
        }

        // A base64 value under a json config is not decoded as base64
        expect(readUrlFilters(`?grid_filters=${base64}`, config)).toEqual({})
        expect(onParseError).toHaveBeenCalledOnce()
      })

      it('should read a grouped link in individual mode', () => {
        // serialization: 'individual', format: 'querystring' (the defaults)
        expect(
          readUrlFilters('?grid_filters=f_name_contains%3Dbob', mockConfig)
        ).toEqual({ name })
      })

      it('should read prefixed params when the grouped param is empty', () => {
        expect(
          readUrlFilters('?grid_filters=&f_name_contains=bob', mockConfig)
        ).toEqual({ name })
      })
    })

    describe('malformed URLs', () => {
      it.each([
        ['an empty host', 'http://'],
        ['a host with a space', 'https://exa mple.com?f_name_contains=bob'],
        ['an unclosed IPv6 host', 'http://[::1?f_name_contains=bob'],
        ['a protocol-relative URL with a bad host', '//[']
      ])('should throw InvalidURLError for %s', (_label, url) => {
        expect(() => readUrlFilters(url, mockConfig)).toThrow(InvalidURLError)
      })

      it.each([
        ['a host', 'example.com?f_name_eq=bob'],
        ['a host and a path', 'example.com/users?f_name_eq=bob'],
        ['a host and a port', 'www.example.com:8080?f_name_eq=bob'],
        ['a host with non-ASCII letters', 'münich.com?f_name_eq=bob'],
        ['a non-Latin host and a port', '例え.jp:8080/users?f_name_eq=bob'],
        ['a host alone', 'example.com'],
        ['a single-label host and a port', 'localhost:3000?f_name_eq=bob'],
        [
          'a single-label host, a port and a path',
          'localhost:3000/users?f_name_eq=bob'
        ]
      ])(
        'should throw InvalidURLError for %s with no scheme',
        (_label, url) => {
          expect(() => readUrlFilters(url, mockConfig)).toThrow(/no scheme/)
        }
      )

      it('should keep the original error as the cause', () => {
        let caught: unknown

        try {
          readUrlFilters('http://', mockConfig)
        } catch (error) {
          caught = error
        }

        expect(caught).toBeInstanceOf(InvalidURLError)
        expect(caught).toHaveProperty('cause', expect.any(TypeError))
      })
    })

    it('should handle invalid parameters gracefully', () => {
      const mockConfigWithError = { ...mockConfig, onParseError: vi.fn() }

      const url =
        'https://example.com?f_name_contains=valid&f_invalid_param=skip'

      const result = readUrlFilters(url, mockConfigWithError)
      expect(result.name?.filter).toBe('valid')
      expect(result.invalid_param).toBeUndefined()
      expect(mockConfigWithError.onParseError).toHaveBeenCalled()
    })
  })
})

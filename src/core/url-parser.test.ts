import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseFilterParam, parseUrlFilters } from './url-parser.js'
import { InvalidFilterError, InvalidURLError } from './types.js'
import type { InternalConfig } from './types.js'

describe('URL Parser', () => {
  const mockConfig: InternalConfig = {
    gridApi: {} as any,
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

  describe('parseFilterParam', () => {
    it('should parse text operations', () => {
      expect(parseFilterParam('f_name_contains', 'john', 'f_')).toEqual({
        filterType: 'text',
        type: 'contains',
        filter: 'john'
      })
      expect(parseFilterParam('f_status_eq', 'active', 'f_')).toEqual({
        filterType: 'text',
        type: 'eq',
        filter: 'active'
      })
    })

    it('should parse number operations', () => {
      expect(parseFilterParam('f_age_eq', '25', 'f_')).toEqual({
        filterType: 'number',
        type: 'eq',
        filter: 25
      })
      expect(parseFilterParam('f_age_range', '25,65', 'f_')).toEqual({
        filterType: 'number',
        type: 'inRange',
        filter: 25,
        filterTo: 65
      })
    })

    it('should parse date operations', () => {
      expect(parseFilterParam('f_created_eq', '2024-01-15', 'f_')).toEqual({
        filterType: 'date',
        type: 'eq',
        filter: '2024-01-15'
      })
      expect(
        parseFilterParam('f_period_daterange', '2024-01-01,2024-12-31', 'f_')
      ).toEqual({
        filterType: 'date',
        type: 'dateRange',
        filter: '2024-01-01',
        filterTo: '2024-12-31'
      })
    })

    it('should parse blank operations', () => {
      expect(parseFilterParam('f_optional_blank', 'true', 'f_')).toEqual({
        filterType: 'text',
        type: 'blank',
        filter: ''
      })
      expect(parseFilterParam('f_required_notBlank', 'true', 'f_')).toEqual({
        filterType: 'text',
        type: 'notBlank',
        filter: ''
      })
    })

    it('should throw on invalid parameters', () => {
      expect(() => parseFilterParam('f_name', 'value')).toThrow(
        InvalidFilterError
      )
      expect(() => parseFilterParam('f_name_invalid', 'value')).toThrow(
        InvalidFilterError
      )
    })
  })

  describe('parseUrlFilters', () => {
    it('should parse URL with multiple filters', () => {
      const url =
        'https://example.com?f_name_contains=john&f_age_gte=25&f_created_after=2024-01-01'
      const result = parseUrlFilters(url, mockConfig)

      expect(result).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'john' },
        age: { filterType: 'number', type: 'greaterThanOrEqual', filter: 25 },
        created: { filterType: 'date', type: 'dateAfter', filter: '2024-01-01' }
      })
    })

    it('should handle empty URLs and ignore non-filter params', () => {
      expect(parseUrlFilters('https://example.com', mockConfig)).toEqual({})

      const result = parseUrlFilters(
        'https://example.com?page=1&f_name_contains=john&sort=name',
        mockConfig
      )
      expect(result).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      })
    })

    it('should handle URL encoding', () => {
      const url = 'https://example.com?f_query_contains=hello%20world'
      const result = parseUrlFilters(url, mockConfig)
      expect(result.query?.filter).toBe('hello world')
    })

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
        expect(parseUrlFilters(url, mockConfig)).toEqual({ name })
      })

      it('should parse a raw query string that contains a dot', () => {
        expect(parseUrlFilters('f_price_gt=1.5', mockConfig)).toEqual({
          price
        })
      })

      it('should parse a relative path with a dot in its value', () => {
        expect(parseUrlFilters('/products?f_price_gt=1.5', mockConfig)).toEqual(
          { price }
        )
      })

      it.each([
        ['a raw query string', 'f_name_contains=what?ever'],
        [
          'a raw query string with other params',
          'page=2&f_name_contains=what?ever'
        ]
      ])('should keep a ? in a value of %s', (_label, url) => {
        expect(parseUrlFilters(url, mockConfig)).toEqual({
          name: { filterType: 'text', type: 'contains', filter: 'what?ever' }
        })
      })

      it('should keep a # in a value of a raw query string', () => {
        expect(parseUrlFilters('f_name_contains=a#b', mockConfig)).toEqual({
          name: { filterType: 'text', type: 'contains', filter: 'a#b' }
        })
      })

      it('should keep a ? in a param name of a raw query string', () => {
        expect(
          parseUrlFilters('f_first?name_contains=bob', mockConfig)
        ).toEqual({ 'first?name': name })
      })

      it('should read text with no scheme and no leading / as a raw query', () => {
        // A relative path must start with '/'. Without it, `users?...` is a
        // raw query whose first key is `users?f_name_contains`.
        expect(
          parseUrlFilters('users?f_name_contains=bob', mockConfig)
        ).toEqual({})
      })

      it('should return no filters for text with no filter params', () => {
        expect(parseUrlFilters('not-a-url', mockConfig)).toEqual({})
      })
    })

    describe('grouped param', () => {
      const name = { filterType: 'text', type: 'contains', filter: 'bob' }
      const json = encodeURIComponent(JSON.stringify({ name }))
      const base64 = encodeURIComponent(btoa(JSON.stringify({ name })))

      it('should ignore a host param called filters', () => {
        expect(
          parseUrlFilters('?filters=active&f_name_contains=bob', mockConfig)
        ).toEqual({ name })
      })

      it('should ignore grid_filters when groupedParam is different', () => {
        const config = { ...mockConfig, groupedParam: 'gf' }
        expect(
          parseUrlFilters(
            '?grid_filters=f_age_gt%3D1&f_name_contains=bob',
            config
          )
        ).toEqual({ name })
      })

      it('should read the configured groupedParam', () => {
        const config = { ...mockConfig, groupedParam: 'gf' }
        expect(
          parseUrlFilters('?gf=f_name_contains%3Dbob&f_age_gt=1', config)
        ).toEqual({ name })
      })

      it('should decode with the configured format', () => {
        const config = { ...mockConfig, format: 'json' as const }
        expect(parseUrlFilters(`?grid_filters=${json}`, config)).toEqual({
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
        expect(parseUrlFilters(`?grid_filters=${base64}`, config)).toEqual({})
        expect(onParseError).toHaveBeenCalledOnce()
      })

      it('should read a grouped link in individual mode', () => {
        // serialization: 'individual', format: 'querystring' (the defaults)
        expect(
          parseUrlFilters('?grid_filters=f_name_contains%3Dbob', mockConfig)
        ).toEqual({ name })
      })

      it('should read prefixed params when the grouped param is empty', () => {
        expect(
          parseUrlFilters('?grid_filters=&f_name_contains=bob', mockConfig)
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
        expect(() => parseUrlFilters(url, mockConfig)).toThrow(InvalidURLError)
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
          expect(() => parseUrlFilters(url, mockConfig)).toThrow(/no scheme/)
        }
      )

      it('should keep the original error as the cause', () => {
        let caught: unknown
        try {
          parseUrlFilters('http://', mockConfig)
        } catch (error) {
          caught = error
        }
        expect(caught).toBeInstanceOf(InvalidURLError)
        expect((caught as InvalidURLError).cause).toBeInstanceOf(TypeError)
      })
    })

    it('should handle invalid parameters gracefully', () => {
      const mockConfigWithError = { ...mockConfig, onParseError: vi.fn() }
      const url =
        'https://example.com?f_name_contains=valid&f_invalid_param=skip'

      const result = parseUrlFilters(url, mockConfigWithError)
      expect(result.name?.filter).toBe('valid')
      expect(result.invalid_param).toBeUndefined()
      expect(mockConfigWithError.onParseError).toHaveBeenCalled()
    })
  })
})

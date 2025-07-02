import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseFilterParam, parseUrlFilters } from './url-parser.js'
import { InvalidFilterError, InvalidURLError } from './types.js'
import type { InternalConfig } from './types.js'

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

    it('should handle malformed URLs', () => {
      expect(() => parseUrlFilters('not-a-url', mockConfig)).toThrow(
        InvalidURLError
      )
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

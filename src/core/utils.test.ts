import { describe, it, expect } from 'vitest'
import type { FilterState, InternalConfig } from './types.js'
import { InvalidFilterError, InvalidURLError } from './types.js'
import { validateFilterValue, DEFAULT_CONFIG } from './validation.js'
import { parseFilterParam, parseUrlFilters } from './url-parser.js'
import { serializeFilters, generateUrl } from './url-generator.js'

describe('URL Parser Utils', () => {
  const mockConfig: InternalConfig = {
    gridApi: {} as InternalConfig['gridApi'],
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: () => {}
  }

  describe('parseFilterParam', () => {
    it('should parse text filter parameters correctly', () => {
      const result = parseFilterParam('f_name_contains', 'john')
      expect(result).toEqual({
        filterType: 'text',
        type: 'contains',
        filter: 'john'
      })
    })

    it('should parse number filter parameters correctly', () => {
      const result = parseFilterParam('f_age_eq', '30')
      expect(result).toEqual({
        filterType: 'number',
        type: 'eq',
        filter: 30
      })
    })

    it('should parse range filter parameters correctly', () => {
      const result = parseFilterParam('f_salary_range', '50000,80000')
      expect(result).toEqual({
        filterType: 'number',
        type: 'inRange',
        filter: 50000,
        filterTo: 80000
      })
    })

    it('should throw InvalidFilterError for invalid parameters', () => {
      expect(() => parseFilterParam('invalid_param', 'value')).toThrow(
        InvalidFilterError
      )
    })

    it('should throw InvalidFilterError for unsupported operations', () => {
      expect(() => parseFilterParam('f_name_invalidop', 'value')).toThrow(
        InvalidFilterError
      )
    })
  })

  describe('parseUrlFilters', () => {
    it('should parse multiple filters from URL', () => {
      const mockConfigForParsing: InternalConfig = {
        gridApi: {} as InternalConfig['gridApi'],
        paramPrefix: 'f_',
        maxValueLength: 200,
        onParseError: () => {}
      }

      const url = 'https://example.com?f_name_contains=john&f_age_eq=30'
      const result = parseUrlFilters(url, mockConfigForParsing)

      expect(result).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'john' },
        age: { filterType: 'number', type: 'eq', filter: 30 }
      })
    })

    it('should handle empty URL', () => {
      const mockConfigForEmpty: InternalConfig = {
        gridApi: {} as InternalConfig['gridApi'],
        paramPrefix: 'f_',
        maxValueLength: 200,
        onParseError: () => {}
      }

      const result = parseUrlFilters('', mockConfigForEmpty)
      expect(result).toEqual({})
    })

    it('should ignore non-filter parameters', () => {
      const mockConfigForIgnore: InternalConfig = {
        gridApi: {} as InternalConfig['gridApi'],
        paramPrefix: 'f_',
        maxValueLength: 200,
        onParseError: () => {}
      }

      const url = 'https://example.com?page=1&f_name_contains=john&sort=desc'
      const result = parseUrlFilters(url, mockConfigForIgnore)

      expect(result).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      })
    })
  })

  describe('URL Generator Utils', () => {
    it('should serialize filters to query string', () => {
      const mockConfigForSerialization: InternalConfig = {
        gridApi: {} as InternalConfig['gridApi'],
        paramPrefix: 'f_',
        maxValueLength: 200,
        onParseError: () => {}
      }

      const filters: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: 'john' },
        age: { filterType: 'number', type: 'eq', filter: 30 }
      }

      const result = serializeFilters(filters, mockConfigForSerialization)
      const queryString = result.toString()
      expect(queryString).toContain('f_name_contains=john')
      expect(queryString).toContain('f_age_eq=30')
    })

    it('should handle empty filter state', () => {
      const result = serializeFilters({}, mockConfig)
      expect(result.toString()).toBe('')
    })

    it('should generate complete URL with filters', () => {
      const filters: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }

      const result = generateUrl('https://example.com', filters, mockConfig)
      expect(result).toBe('https://example.com/?f_name_contains=john')
    })

    it('should preserve existing query parameters', () => {
      const filters: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }

      const result = generateUrl(
        'https://example.com?page=1',
        filters,
        mockConfig
      )
      expect(result).toContain('page=1')
      expect(result).toContain('f_name_contains=john')
    })
  })

  describe('Validation Utils', () => {
    it('should validate filter values within length limits', () => {
      const result = validateFilterValue('test', mockConfig)
      expect(result).toBe('test')
    })

    it('should throw error for values exceeding length limit', () => {
      const longValue = 'a'.repeat(201)
      expect(() => validateFilterValue(longValue, mockConfig)).toThrow(
        InvalidFilterError
      )
    })

    it('should return empty string for blank operations', () => {
      const result = validateFilterValue('any-value', mockConfig, 'blank')
      expect(result).toBe('')
    })
  })
})

import { describe, it, expect } from 'vitest'
import type { FilterState, InternalConfig } from './types.js'
import { InvalidFilterError, InvalidURLError } from './types.js'
import { validateFilterValue, DEFAULT_CONFIG } from './validation.js'
import { parseFilterParam, parseUrlFilters } from './url-parser.js'
import { serializeFilters, generateUrl } from './url-generator.js'

describe('validateFilterValue', () => {
  const config: InternalConfig = {
    gridApi: {} as any,
    paramPrefix: DEFAULT_CONFIG.paramPrefix,
    maxValueLength: 5,
    onParseError: () => {}
  }

  it('should accept valid filter values', () => {
    expect(validateFilterValue('test', config)).toBe('test')
  })

  it('should throw error for values exceeding maxLength', () => {
    expect(() => validateFilterValue('toolong', config)).toThrow(
      InvalidFilterError
    )
  })
})

describe('parseFilterParam', () => {
  it('should parse valid filter parameters', () => {
    const result = parseFilterParam('f_name_contains', 'john')
    expect(result).toEqual({
      filterType: 'text',
      type: 'contains',
      filter: 'john'
    })
  })

  it('should parse equals filter parameters', () => {
    const result = parseFilterParam('f_status_eq', 'active')
    expect(result).toEqual({
      filterType: 'text',
      type: 'eq',
      filter: 'active'
    })
  })

  it('should throw error for invalid parameter format', () => {
    expect(() => parseFilterParam('invalid_param', 'value')).toThrow(
      InvalidFilterError
    )
  })

  it('should throw error for invalid prefix', () => {
    expect(() => parseFilterParam('x_name_contains', 'value')).toThrow(
      InvalidFilterError
    )
  })

  it('should throw error for unsupported operation', () => {
    expect(() => parseFilterParam('f_name_invalid', 'value')).toThrow(
      InvalidFilterError
    )
  })

  it('should handle already decoded values', () => {
    // In real usage, URLSearchParams.get() returns decoded values
    const result = parseFilterParam('f_name_contains', 'john doe')
    expect(result.filter).toBe('john doe')
  })
})

describe('parseUrlFilters', () => {
  const config: InternalConfig = {
    gridApi: {} as any,
    paramPrefix: DEFAULT_CONFIG.paramPrefix,
    maxValueLength: 200,
    onParseError: () => {}
  }

  it('should parse valid URL filters', () => {
    const url = 'https://example.com?f_name_contains=john&f_status_eq=active'
    const result = parseUrlFilters(url, config)
    expect(result).toEqual({
      name: {
        filterType: 'text',
        type: 'contains',
        filter: 'john'
      },
      status: {
        filterType: 'text',
        type: 'eq',
        filter: 'active'
      }
    })
  })

  it('should ignore non-filter parameters', () => {
    const url = 'https://example.com?f_name_contains=john&other=value'
    const result = parseUrlFilters(url, config)
    expect(Object.keys(result)).toEqual(['name'])
  })

  it('should throw error for invalid URLs', () => {
    expect(() => parseUrlFilters('not-a-url', config)).toThrow(InvalidURLError)
  })
})

describe('serializeFilters', () => {
  const config: InternalConfig = {
    gridApi: {} as any,
    paramPrefix: DEFAULT_CONFIG.paramPrefix,
    maxValueLength: 200,
    onParseError: () => {}
  }

  it('should serialize filter state to URL parameters', () => {
    const filterState: FilterState = {
      name: {
        filterType: 'text',
        type: 'contains',
        filter: 'john'
      },
      status: {
        filterType: 'text',
        type: 'eq',
        filter: 'active'
      }
    }

    const params = serializeFilters(filterState, config)
    expect(params.toString()).toBe('f_name_contains=john&f_status_eq=active')
  })

  it('should URL encode special characters', () => {
    const filterState: FilterState = {
      name: {
        filterType: 'text',
        type: 'contains',
        filter: 'john & doe'
      }
    }

    const params = serializeFilters(filterState, config)
    // URLSearchParams uses + for spaces and %26 for &, both are valid URL encoding
    expect(params.toString()).toBe('f_name_contains=john+%26+doe')
  })

  // Removed trivial empty state test - just tests obvious URLSearchParams behavior
})

describe('generateUrl', () => {
  const config: InternalConfig = {
    gridApi: {} as any,
    paramPrefix: DEFAULT_CONFIG.paramPrefix,
    maxValueLength: 200,
    onParseError: () => {}
  }

  it('should generate URL with filter parameters', () => {
    const filterState: FilterState = {
      name: {
        filterType: 'text',
        type: 'contains',
        filter: 'john'
      }
    }

    const url = generateUrl('https://example.com', filterState, config)
    expect(url).toBe('https://example.com/?f_name_contains=john')
  })

  it('should preserve existing non-filter parameters', () => {
    const filterState: FilterState = {
      name: {
        filterType: 'text',
        type: 'contains',
        filter: 'john'
      }
    }

    const url = generateUrl(
      'https://example.com?other=value',
      filterState,
      config
    )
    // Parameter order may vary, so check that both parameters are present
    expect(url).toContain('f_name_contains=john')
    expect(url).toContain('other=value')
    expect(url).toMatch(/^https:\/\/example\.com\/\?/)
  })

  it('should handle empty filter state', () => {
    const url = generateUrl('https://example.com', {}, config)
    expect(url).toBe('https://example.com/')
  })

  describe('Critical Business Logic Tests', () => {
    it('should handle filter parameter conflicts with existing params', () => {
      // Critical scenario: URL already has params that conflict with filter prefix
      const filterState: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }

      const url = generateUrl(
        'https://example.com?f_name_contains=old_value&other=keep',
        filterState,
        config
      )

      // Should replace old filter param with new value, keep other params
      expect(url).toContain('f_name_contains=john')
      expect(url).toContain('other=keep')
      expect(url).not.toContain('old_value')
    })

    it('should handle malformed base URLs gracefully', () => {
      // Critical scenario: Invalid base URL should not crash the application
      const filterState: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: 'test' }
      }

      // Should throw for truly malformed URLs
      expect(() => generateUrl('not-a-url', filterState, config)).toThrow()
      expect(() => generateUrl('', filterState, config)).toThrow()

      // But should handle edge cases gracefully
      expect(() =>
        generateUrl('https://example.com', filterState, config)
      ).not.toThrow()
    })

    it('should handle very long filter values approaching limits', () => {
      // Critical scenario: Values near the limit should work, over limit should fail
      const nearLimitConfig = { ...config, maxValueLength: 50 }

      const validFilterState: FilterState = {
        test: { filterType: 'text', type: 'contains', filter: 'x'.repeat(49) }
      }

      const invalidFilterState: FilterState = {
        test: { filterType: 'text', type: 'contains', filter: 'x'.repeat(51) }
      }

      expect(() =>
        generateUrl('https://example.com', validFilterState, nearLimitConfig)
      ).not.toThrow()
      expect(() =>
        generateUrl('https://example.com', invalidFilterState, nearLimitConfig)
      ).toThrow()
    })
  })
})

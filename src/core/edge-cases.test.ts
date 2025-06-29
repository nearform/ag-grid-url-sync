import { describe, it, expect, vi } from 'vitest'
import { AGGridUrlSync, createUrlSync } from './ag-grid-url-sync.js'
import { validateFilterValue } from './validation.js'
import { parseUrlFilters, parseFilterParam } from './url-parser.js'
import { serializeFilters } from './url-generator.js'
import type { GridApi } from 'ag-grid-community'
import type { FilterState, InternalConfig } from './types.js'
import { InvalidFilterError, InvalidURLError } from './types.js'

describe('Edge Cases - Character Encoding', () => {
  const config: InternalConfig = {
    gridApi: {} as any,
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: vi.fn()
  }

  it('should handle Unicode characters', () => {
    const filterState: FilterState = {
      name: {
        filterType: 'text',
        type: 'contains',
        filter: 'café'
      },
      description: {
        filterType: 'text',
        type: 'eq',
        filter: '🎉 party'
      },
      chinese: {
        filterType: 'text',
        type: 'contains',
        filter: '中文测试'
      }
    }

    const params = serializeFilters(filterState, config)
    const result = parseUrlFilters(
      `https://example.com?${params.toString()}`,
      config
    )

    expect(result.name.filter).toBe('café')
    expect(result.description.filter).toBe('🎉 party')
    expect(result.chinese.filter).toBe('中文测试')
  })

  it('should handle special URL characters', () => {
    const filterState: FilterState = {
      query: {
        filterType: 'text',
        type: 'contains',
        filter: 'search & filter + more % data # hash'
      }
    }

    const params = serializeFilters(filterState, config)
    const result = parseUrlFilters(
      `https://example.com?${params.toString()}`,
      config
    )

    expect(result.query.filter).toBe('search & filter + more % data # hash')
  })

  it('should reject values exceeding maxValueLength', () => {
    const longValue = 'a'.repeat(201)

    expect(() => validateFilterValue(longValue, config)).toThrow(
      InvalidFilterError
    )
    expect(() => validateFilterValue(longValue, config)).toThrow(
      'exceeds maximum length of 200'
    )
  })

  it('should handle empty and whitespace-only values', () => {
    // Empty values should be accepted but might be filtered out
    expect(validateFilterValue('', config)).toBe('')
    expect(validateFilterValue('   ', config)).toBe('   ')

    // Test with actual URL parsing
    const url = 'https://example.com?f_name_contains=&f_city_eq=%20%20%20'
    const result = parseUrlFilters(url, config)

    expect(result.name?.filter).toBe('')
    expect(result.city?.filter).toBe('   ')
  })

  it('should handle null and undefined gracefully in filter values', () => {
    // These should not occur in normal usage, but test defensive coding
    const mockConfig = { ...config, onParseError: vi.fn() }

    // Test with URL that has no value
    const url = 'https://example.com?f_name_contains'
    const result = parseUrlFilters(url, mockConfig)

    // Should handle gracefully - empty string value is valid
    expect(Object.keys(result)).toHaveLength(1)
    expect(result.name?.filter).toBe('')
  })
})

describe('Edge Cases - URL Parsing', () => {
  const config: InternalConfig = {
    gridApi: {} as any,
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: vi.fn()
  }

  it('should handle malformed URLs', () => {
    const malformedUrls = ['not-a-url', '://missing-protocol.com']

    malformedUrls.forEach(url => {
      expect(() => parseUrlFilters(url, config)).toThrow(InvalidURLError)
    })
  })

  it('should handle missing protocols gracefully', () => {
    // URL constructor can handle this, but test edge case
    expect(() =>
      parseUrlFilters('example.com?f_name_contains=test', config)
    ).toThrow(InvalidURLError)
  })

  it('should handle invalid parameter formats', () => {
    const invalidParams = [
      'f_name', // Missing operation
      'f_', // Empty parameter
      'x_name_contains', // Wrong prefix
      'f_name_invalid', // Invalid operation
      'f__contains' // Empty column name
    ]

    invalidParams.forEach(param => {
      expect(() => parseFilterParam(param, 'value')).toThrow(InvalidFilterError)
    })
  })

  it('should handle duplicate parameter names', () => {
    const url =
      'https://example.com?f_name_contains=first&f_name_contains=second'
    const result = parseUrlFilters(url, config)

    // Should use the last value (URL standard behavior)
    expect(result.name.filter).toBe('second')
  })

  it('should handle mixed valid and invalid parameters', () => {
    const mockConfig = { ...config, onParseError: vi.fn() }
    const url =
      'https://example.com?f_name_contains=valid&f_invalid_param=skip&f_city_eq=also_valid&other=ignore'

    const result = parseUrlFilters(url, mockConfig)

    expect(result.name.filter).toBe('valid')
    expect(result.city.filter).toBe('also_valid')
    expect(result.invalid_param).toBeUndefined()
    expect(result.other).toBeUndefined()
    expect(mockConfig.onParseError).toHaveBeenCalled()
  })

  it('should handle very long URLs', () => {
    const longValue = 'x'.repeat(190) // Under limit
    const url = `https://example.com?f_name_contains=${encodeURIComponent(longValue)}`

    const result = parseUrlFilters(url, config)
    expect(result.name.filter).toBe(longValue)
  })

  it('should handle URLs with fragments and complex query strings', () => {
    const url =
      'https://example.com/path?other=value&f_name_contains=john&f_status_eq=active&another=param#fragment'
    const result = parseUrlFilters(url, config)

    expect(result.name.filter).toBe('john')
    expect(result.status.filter).toBe('active')
    expect(Object.keys(result)).toHaveLength(2)
  })
})

describe('Edge Cases - Grid Integration', () => {
  it('should handle grid API errors gracefully', () => {
    const mockGridApi = {
      getFilterModel: vi.fn().mockImplementation(() => {
        throw new Error('Grid API Error')
      }),
      setFilterModel: vi.fn().mockImplementation(() => {
        throw new Error('Grid API Error')
      })
    } as unknown as GridApi

    const urlSync = new AGGridUrlSync(mockGridApi)

    // These should not throw - should handle errors gracefully
    expect(() => urlSync.generateUrl()).not.toThrow()
    expect(() => urlSync.clearFilters()).not.toThrow()
  })

  it('should handle filter model with mixed filter types gracefully', () => {
    // Critical scenario: Grid has mixed filter types, text and number filters should be processed
    const mockGridApi = {
      getFilterModel: vi.fn().mockReturnValue({
        textColumn: { filterType: 'text', type: 'contains', filter: 'value' },
        numberColumn: { filterType: 'number', type: 'equals', filter: 123 },
        dateColumn: {
          filterType: 'date',
          type: 'equals',
          filterDateFrom: '2023-01-01'
        },
        setColumn: { filterType: 'set', values: ['option1', 'option2'] }
      }),
      setFilterModel: vi.fn()
    } as unknown as GridApi

    const urlSync = new AGGridUrlSync(mockGridApi)
    const url = urlSync.generateUrl('https://example.com')

    // Should include text and number filters in URL
    expect(url).toContain('f_textColumn_contains=value')
    expect(url).toContain('f_numberColumn_eq=123')
    // Should exclude unsupported filter types
    expect(url).not.toContain('dateColumn')
    expect(url).not.toContain('setColumn')
  })

  it('should handle unknown AG Grid operation types', () => {
    // Critical scenario: AG Grid introduces new operation types
    const mockGridApi = {
      getFilterModel: vi.fn().mockReturnValue({
        column1: {
          filterType: 'text',
          type: 'unknownOperation',
          filter: 'value'
        },
        column2: { filterType: 'text', type: 'contains', filter: 'validValue' }
      }),
      setFilterModel: vi.fn()
    } as unknown as GridApi

    const urlSync = new AGGridUrlSync(mockGridApi)

    // Should handle unknown operations gracefully and process known ones
    expect(() => urlSync.generateUrl('https://example.com')).not.toThrow()

    const url = urlSync.generateUrl('https://example.com')
    expect(url).toContain('f_column2_contains=validValue')
    // Unknown operation should be filtered out
    expect(url).not.toContain('unknownOperation')
  })

  it('should handle non-existent columns in URL', () => {
    const mockGridApi = {
      getFilterModel: vi.fn().mockReturnValue({}),
      setFilterModel: vi.fn()
    } as unknown as GridApi

    const urlSync = new AGGridUrlSync(mockGridApi)

    // Apply filters for columns that don't exist
    urlSync.applyFromUrl(
      'https://example.com?f_nonexistent_contains=value&f_alsofake_eq=test'
    )

    // Should call setFilterModel with the filters anyway - AG Grid will handle unknown columns
    expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
      nonexistent: {
        filterType: 'text',
        type: 'contains',
        filter: 'value'
      },
      alsofake: {
        filterType: 'text',
        type: 'equals',
        filter: 'test'
      }
    })
  })

  it('should handle corrupted filter models', () => {
    const corruptedModels = [
      null,
      undefined,
      'not-an-object',
      { corruptColumn: null },
      { corruptColumn: { invalid: 'structure' } },
      { corruptColumn: { filterType: 'number' } } // Wrong type
    ]

    corruptedModels.forEach(model => {
      const mockGridApi = {
        getFilterModel: vi.fn().mockReturnValue(model),
        setFilterModel: vi.fn()
      } as unknown as GridApi

      const urlSync = new AGGridUrlSync(mockGridApi)

      // Should not throw, should return empty or filtered results
      expect(() => urlSync.generateUrl()).not.toThrow()
    })
  })

  it('should handle concurrent filter changes', () => {
    const mockGridApi = {
      getFilterModel: vi.fn().mockReturnValue({
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }),
      setFilterModel: vi.fn()
    } as unknown as GridApi

    const urlSync = new AGGridUrlSync(mockGridApi)

    // Simulate rapid successive calls
    const urls: string[] = []
    for (let i = 0; i < 10; i++) {
      urls.push(urlSync.generateUrl())
      urlSync.applyFromUrl(`https://example.com?f_test_contains=value${i}`)
    }

    // All operations should complete without error
    expect(urls).toHaveLength(10)
    expect(mockGridApi.setFilterModel).toHaveBeenCalledTimes(10)
  })
})

describe('Edge Cases - Configuration', () => {
  it('should handle invalid configuration gracefully', () => {
    const mockGridApi = {
      getFilterModel: vi.fn().mockReturnValue({}),
      setFilterModel: vi.fn()
    } as unknown as GridApi

    // Test with invalid config values
    expect(
      () =>
        new AGGridUrlSync(mockGridApi, {
          paramPrefix: '', // Empty prefix
          maxValueLength: -1 // Negative length
        })
    ).not.toThrow()

    expect(
      () =>
        new AGGridUrlSync(mockGridApi, {
          paramPrefix: undefined as any,
          maxValueLength: 'invalid' as any
        })
    ).not.toThrow()
  })

  it('should handle missing onParseError callback', () => {
    const mockGridApi = {
      getFilterModel: vi.fn().mockReturnValue({}),
      setFilterModel: vi.fn()
    } as unknown as GridApi

    const urlSync = new AGGridUrlSync(mockGridApi, {
      onParseError: undefined
    })

    // Should not throw when parsing invalid URLs
    expect(() =>
      urlSync.applyFromUrl('https://example.com?f_invalid_format')
    ).not.toThrow()
  })

  it('should respect custom paramPrefix', () => {
    const mockGridApi = {
      getFilterModel: vi.fn().mockReturnValue({
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }),
      setFilterModel: vi.fn()
    } as unknown as GridApi

    const urlSync = new AGGridUrlSync(mockGridApi, {
      paramPrefix: 'filter_'
    })

    const url = urlSync.generateUrl('https://example.com')
    expect(url).toContain('filter_name_contains=john')

    // Should also parse with custom prefix
    urlSync.applyFromUrl('https://example.com?filter_city_eq=boston')
    expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
      city: {
        filterType: 'text',
        type: 'equals',
        filter: 'boston'
      }
    })
  })
})

describe('Text Filter Operations Edge Cases', () => {
  const config: InternalConfig = {
    gridApi: {} as any,
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: vi.fn()
  }

  describe('New Operations', () => {
    it('should handle all 8 text operations', () => {
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

      const filters = parseUrlFilters(complexUrl, config)

      expect(Object.keys(filters)).toHaveLength(8)
      expect(filters.name.type).toBe('contains')
      expect(filters.email.type).toBe('startsWith')
      expect(filters.status.type).toBe('notEqual')
      expect(filters.description.type).toBe('endsWith')
      expect(filters.optional.type).toBe('blank')
      expect(filters.required.type).toBe('notBlank')
      expect(filters.tags.type).toBe('notContains')
      expect(filters.title.type).toBe('eq')
    })

    it('should handle blank operations with values gracefully', () => {
      const url =
        'https://example.com/?f_field_blank=unexpected_value&f_other_notBlank=123'
      const filters = parseUrlFilters(url, config)

      expect(filters.field).toEqual({
        filterType: 'text',
        type: 'blank',
        filter: ''
      })
      expect(filters.other).toEqual({
        filterType: 'text',
        type: 'notBlank',
        filter: ''
      })
    })
  })
})

describe('Edge Cases and Error Handling', () => {
  const mockConfig: InternalConfig = {
    gridApi: {} as InternalConfig['gridApi'],
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: vi.fn()
  }

  describe('URL Parameter Parsing Edge Cases', () => {
    it('should handle empty URL gracefully', () => {
      const result = parseUrlFilters('', mockConfig)
      expect(result).toEqual({})
    })

    it('should handle URL without query parameters', () => {
      const result = parseUrlFilters('https://example.com/path', mockConfig)
      expect(result).toEqual({})
    })

    it('should handle URL with non-filter parameters', () => {
      const result = parseUrlFilters(
        'https://example.com?page=1&sort=name',
        mockConfig
      )
      expect(result).toEqual({})
    })

    it('should handle malformed filter parameters gracefully', () => {
      const result = parseUrlFilters(
        'https://example.com?invalid_param',
        mockConfig
      )
      expect(result).toEqual({})
    })

    it('should handle URL with mixed valid and invalid parameters', () => {
      const result = parseUrlFilters(
        'https://example.com?f_name_contains=john&invalid_param&f_age_eq=30',
        mockConfig
      )
      expect(result).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'john' },
        age: { filterType: 'number', type: 'eq', filter: 30 }
      })
    })

    it('should ignore parameters that do not match prefix', () => {
      const result = parseUrlFilters(
        'https://example.com?name_contains=john&f_age_eq=30',
        mockConfig
      )
      expect(result).toEqual({
        age: { filterType: 'number', type: 'eq', filter: 30 }
      })
    })

    it('should handle URL-encoded values correctly', () => {
      const result = parseUrlFilters(
        'https://example.com?f_description_contains=hello%20world',
        mockConfig
      )
      expect(result).toEqual({
        description: {
          filterType: 'text',
          type: 'contains',
          filter: 'hello world'
        }
      })
    })

    it('should handle special characters in filter values', () => {
      const specialValue = 'test@domain.com'
      const result = parseUrlFilters(
        `https://example.com?f_email_contains=${encodeURIComponent(specialValue)}`,
        mockConfig
      )
      expect(result).toEqual({
        email: { filterType: 'text', type: 'contains', filter: specialValue }
      })
    })

    it('should handle international characters', () => {
      const internationalValue = 'café'
      const result = parseUrlFilters(
        `https://example.com?f_name_contains=${encodeURIComponent(internationalValue)}`,
        mockConfig
      )
      expect(result).toEqual({
        name: {
          filterType: 'text',
          type: 'contains',
          filter: internationalValue
        }
      })
    })
  })

  describe('URL Generation Edge Cases', () => {
    it('should handle empty filter state', () => {
      const result = serializeFilters({}, mockConfig)
      expect(result.toString()).toBe('')
    })

    it('should preserve existing query parameters when generating URLs', () => {
      const mockConfigForGeneration: InternalConfig = {
        gridApi: {} as InternalConfig['gridApi'],
        paramPrefix: 'f_',
        maxValueLength: 200,
        onParseError: vi.fn()
      }

      const filters: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }

      const result = serializeFilters(filters, mockConfigForGeneration)
      expect(result.toString()).toContain('f_name_contains=john')
    })
  })

  describe('AGGridUrlSync Error Resilience', () => {
    it('should handle grid API errors gracefully', () => {
      const mockGridApi = {
        setFilterModel: vi.fn(() => {
          throw new Error('Grid API error')
        }),
        getFilterModel: vi.fn(() => ({}))
      } as Partial<GridApi> as GridApi

      const urlSync = new AGGridUrlSync(mockGridApi)
      expect(() => urlSync.clearFilters()).not.toThrow()
    })

    it('should handle unknown AG Grid operation types', () => {
      const mockGridApi = {
        setFilterModel: vi.fn(),
        getFilterModel: vi.fn(() => ({
          name: {
            type: 'unknownOperation',
            filter: 'test'
          }
        }))
      } as Partial<GridApi> as GridApi

      const urlSync = new AGGridUrlSync(mockGridApi)
      // Should handle unknown operations gracefully and process known ones
      const url = urlSync.generateUrl('https://example.com')

      // Unknown operation should be filtered out
      expect(url).not.toContain('unknownOperation')
    })

    it('should handle null/undefined column filters', () => {
      const mockGridApi = {
        setFilterModel: vi.fn(),
        getFilterModel: vi.fn(() => ({
          name: null,
          age: undefined,
          valid: { type: 'contains', filter: 'test' }
        }))
      } as Partial<GridApi> as GridApi

      const urlSync = new AGGridUrlSync(mockGridApi)
      // Should call setFilterModel with the filters anyway - AG Grid will handle unknown columns
      expect(() => urlSync.generateUrl()).not.toThrow()
    })

    it('should handle malformed filter models from AG Grid', () => {
      const mockGridApi = {
        setFilterModel: vi.fn(),
        getFilterModel: vi.fn(() => ({
          name: {
            /* missing required properties */
          }
        }))
      } as Partial<GridApi> as GridApi

      const urlSync = new AGGridUrlSync(mockGridApi)
      expect(() => urlSync.generateUrl()).not.toThrow()
    })

    it('should handle unexpected data types in filter model', () => {
      const mockGridApi = {
        setFilterModel: vi.fn(),
        getFilterModel: vi.fn(() => ({
          name: 'not an object',
          age: 123,
          tags: ['array', 'values']
        }))
      } as Partial<GridApi> as GridApi

      const urlSync = new AGGridUrlSync(mockGridApi)
      expect(() => urlSync.generateUrl()).not.toThrow()
    })

    it('should handle grid API returning null/undefined', () => {
      const mockGridApi = {
        setFilterModel: vi.fn(),
        getFilterModel: vi.fn(
          () => null as unknown as ReturnType<GridApi['getFilterModel']>
        )
      } as Partial<GridApi> as GridApi

      const urlSync = new AGGridUrlSync(mockGridApi)
      const result = urlSync.generateUrl('https://example.com')
      expect(result).toBe('https://example.com')
    })
  })

  describe('Configuration Edge Cases', () => {
    it('should handle invalid configuration values', () => {
      const invalidConfig = {
        paramPrefix: undefined as unknown as string,
        maxValueLength: 'invalid' as unknown as number
      }

      const mockGridApi = {
        setFilterModel: vi.fn(),
        getFilterModel: vi.fn(() => ({}))
      } as Partial<GridApi> as GridApi

      // Should fall back to defaults and not throw
      expect(() => new AGGridUrlSync(mockGridApi, invalidConfig)).not.toThrow()
    })

    it('should handle missing error callback gracefully', () => {
      const configWithoutCallback: InternalConfig = {
        gridApi: {} as InternalConfig['gridApi'],
        paramPrefix: 'f_',
        maxValueLength: 200,
        onParseError: () => {}
      }

      expect(() => {
        parseUrlFilters('invalid-url', configWithoutCallback)
      }).not.toThrow()
    })
  })

  describe('Performance Edge Cases', () => {
    it('should handle very long URLs without crashing', () => {
      const longValue = 'a'.repeat(10000)
      const url = `https://example.com?f_description_contains=${longValue}`

      expect(() => parseUrlFilters(url, mockConfig)).not.toThrow()
    })

    it('should handle URLs with many parameters', () => {
      const params: string[] = []
      for (let i = 0; i < 100; i++) {
        params.push(`f_field${i}_contains=value${i}`)
      }
      const url = `https://example.com?${params.join('&')}`

      const result = parseUrlFilters(url, mockConfig)
      expect(Object.keys(result)).toHaveLength(100)
    })
  })
})

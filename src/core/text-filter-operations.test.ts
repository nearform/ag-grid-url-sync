import { describe, expect, it, vi } from 'vitest'
import type { FilterState, GridApi, InternalConfig } from './types.js'
import { serializeFilters } from './url-generator.js'
import { parseFilterParam, parseUrlFilters } from './url-parser.js'
import { AGGridUrlSync } from './ag-grid-url-sync.js'

describe('Text Filter Operations', () => {
  const mockConfig: InternalConfig = {
    gridApi: {} as any,
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: vi.fn()
  }

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

  describe('Core Text Operations', () => {
    const filterOperations = [
      {
        urlOp: 'contains',
        value: 'john',
        agGridType: 'contains',
        column: 'name'
      },
      {
        urlOp: 'eq',
        value: 'active',
        agGridType: 'equals',
        column: 'status'
      },
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
        it('should parse URL parameter correctly', () => {
          const result = parseFilterParam(`f_${column}_${urlOp}`, value, 'f_')

          expect(result).toEqual({
            filterType: 'text',
            type: urlOp === 'eq' ? 'eq' : agGridType, // Use internal type for parsing
            filter: value
          })
        })

        it('should serialize to URL correctly', () => {
          const filterState: FilterState = {
            [column]: {
              filterType: 'text',
              type: (urlOp === 'eq' ? 'eq' : agGridType) as any,
              filter: value
            }
          }

          const params = serializeFilters(filterState, mockConfig)
          expect(params.get(`f_${column}_${urlOp}`)).toBe(value)
        })

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
  })

  describe('Blank Operations', () => {
    it('should handle blank operation correctly', () => {
      const result = parseFilterParam('f_optional_blank', 'true', 'f_')

      expect(result).toEqual({
        filterType: 'text',
        type: 'blank',
        filter: ''
      })
    })

    it('should handle notBlank operation correctly', () => {
      const result = parseFilterParam('f_required_notBlank', 'true', 'f_')

      expect(result).toEqual({
        filterType: 'text',
        type: 'notBlank',
        filter: ''
      })
    })

    it('should ignore parameter value for blank operations', () => {
      const result = parseFilterParam('f_optional_blank', 'ignored_value', 'f_')

      expect(result).toEqual({
        filterType: 'text',
        type: 'blank',
        filter: ''
      })
    })

    it('should apply blank and notBlank operations correctly', () => {
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

  describe('Special Characters and Encoding', () => {
    it('should handle special characters correctly', () => {
      const filterState: FilterState = {
        query: {
          filterType: 'text',
          type: 'contains',
          filter: 'test & more'
        }
      }

      const params = serializeFilters(filterState, mockConfig)
      expect(params.get('f_query_contains')).toBe('test & more')
    })

    it('should handle Unicode characters correctly', () => {
      const filterState: FilterState = {
        name: {
          filterType: 'text',
          type: 'contains',
          filter: 'café'
        }
      }

      const params = serializeFilters(filterState, mockConfig)
      expect(params.get('f_name_contains')).toBe('café')
    })

    it('should handle empty and whitespace values', () => {
      const result = parseFilterParam('f_name_contains', '', 'f_')

      expect(result).toEqual({
        filterType: 'text',
        type: 'contains',
        filter: ''
      })
    })
  })

  describe('Complex Multi-Operation Scenarios', () => {
    it('should handle multiple different text operations in single URL', () => {
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

      const urlSync = new AGGridUrlSync(mockGridApi)
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

    it('should serialize multiple text filters correctly', () => {
      const filterState: FilterState = {
        first_name: { filterType: 'text', type: 'startsWith', filter: 'J' },
        last_name: { filterType: 'text', type: 'endsWith', filter: 'son' },
        email: { filterType: 'text', type: 'contains', filter: '@company.com' }
      }

      const params = serializeFilters(filterState, mockConfig)

      expect(params.get('f_first_name_startsWith')).toBe('J')
      expect(params.get('f_last_name_endsWith')).toBe('son')
      expect(params.get('f_email_contains')).toBe('@company.com')
    })
  })

  describe('Validation and Error Handling', () => {
    it('should respect maxValueLength configuration', () => {
      const shortConfig = { ...mockConfig, maxValueLength: 5 }
      const filterState: FilterState = {
        description: {
          filterType: 'text',
          type: 'contains',
          filter: 'very long description that exceeds limit'
        }
      }

      expect(() => serializeFilters(filterState, shortConfig)).toThrow(
        'Filter value exceeds maximum length of 5 characters'
      )
    })

    it('should handle invalid parameter formats gracefully', () => {
      expect(() => parseFilterParam('f_name', 'value', 'f_')).toThrow(
        'Invalid filter parameter format'
      )
    })

    it('should handle wrong prefix gracefully', () => {
      expect(() => parseFilterParam('x_name_eq', 'value', 'f_')).toThrow(
        'Invalid filter prefix in parameter'
      )
    })
  })

  describe('Round-trip Consistency', () => {
    it('should maintain data integrity in round-trip conversion', () => {
      const originalValue = 'test value with special chars: @#$%'
      const filterState: FilterState = {
        description: {
          filterType: 'text',
          type: 'contains',
          filter: originalValue
        }
      }

      // Convert to URL
      const params = serializeFilters(filterState, mockConfig)
      const urlString = params.toString()

      // Parse back from URL
      const testUrl = `https://example.com?${urlString}`
      const parsedState = parseUrlFilters(testUrl, mockConfig)

      expect(parsedState.description.filter).toBe(originalValue)
      expect(parsedState.description.type).toBe('contains')
      expect(parsedState.description.filterType).toBe('text')
    })
  })
})

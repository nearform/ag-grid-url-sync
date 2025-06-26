import { describe, it, expect, vi } from 'vitest'
import { AGGridUrlSync, createUrlSync } from './ag-grid-url-sync.js'
import type { GridApi } from 'ag-grid-community'
import type { FilterState } from './types.js'

describe('AGGridUrlSync', () => {
  // Mock GridApi
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

  describe('generateUrl', () => {
    it('should generate URL with current filter state', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      const url = urlSync.generateUrl('https://example.com')
      expect(url).toBe('https://example.com/?f_name_contains=john')
    })

    it('should use current URL when no base URL provided', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      const url = urlSync.generateUrl()
      expect(url).toBe('https://example.com/?f_name_contains=john')
    })
  })

  describe('getQueryParams', () => {
    it('should return query parameters string', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      const params = urlSync.getQueryParams()
      expect(params).toBe('?f_name_contains=john')
    })
  })

  describe('applyFromUrl', () => {
    it('should apply filters from URL', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      urlSync.applyFromUrl('https://example.com?f_name_contains=jane')
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        name: {
          filterType: 'text' as const,
          type: 'contains' as const,
          filter: 'jane'
        }
      })
    })

    it('should use current URL when no URL provided', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      urlSync.applyFromUrl()
      expect(mockGridApi.setFilterModel).toHaveBeenCalled()
    })
  })

  describe('applyFilters', () => {
    it('should apply filter state to grid', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      const filterState: FilterState = {
        name: {
          filterType: 'text',
          type: 'contains',
          filter: 'test'
        }
      }
      urlSync.applyFilters(filterState)
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
        name: {
          filterType: 'text',
          type: 'contains',
          filter: 'test'
        }
      })
    })
  })

  describe('clearFilters', () => {
    it('should clear all filters', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      urlSync.clearFilters()
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
    })
  })

  describe('Text Filter Operations', () => {
    // Consolidated test for all filter operations - reduces redundancy while maintaining coverage
    const filterOperations = [
      {
        urlOp: 'contains',
        value: 'john',
        agGridType: 'contains',
        column: 'name'
      },
      { urlOp: 'eq', value: 'active', agGridType: 'equals', column: 'status' },
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

    describe('Blank Operations', () => {
      it('should handle blank and notBlank operations correctly', () => {
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

        // Test blank operations ignore the parameter value
        urlSync.applyFromUrl(
          'https://example.com?f_optional_blank=ignored_value'
        )
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          optional: { filterType: 'text', type: 'blank', filter: '' }
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

    describe('Complex Multi-Operation Scenarios', () => {
      it('should handle multiple different operations in single URL', () => {
        // Test business scenario: user applies multiple filters and shares URL
        const urlSync = new AGGridUrlSync(mockGridApi)
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
    })
  })
})

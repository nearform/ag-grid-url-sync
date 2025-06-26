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

  it('should create instance with default config', () => {
    const urlSync = new AGGridUrlSync(mockGridApi)
    expect(urlSync).toBeInstanceOf(AGGridUrlSync)
  })

  it('should create instance with custom config', () => {
    const urlSync = new AGGridUrlSync(mockGridApi, {
      paramPrefix: 'filter_',
      maxValueLength: 100
    })
    expect(urlSync).toBeInstanceOf(AGGridUrlSync)
  })

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
    describe('Equals Operation', () => {
      it('should apply eq filter from URL', () => {
        const urlSync = new AGGridUrlSync(mockGridApi)
        urlSync.applyFromUrl('https://example.com?f_status_eq=active')
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          status: {
            filterType: 'text',
            type: 'equals',
            filter: 'active'
          }
        })
      })

      it('should generate URL for eq filter', () => {
        const mockGridApiWithFilter = {
          getFilterModel: vi.fn().mockReturnValue({
            status: { filterType: 'text', type: 'equals', filter: 'active' }
          }),
          setFilterModel: vi.fn()
        } as unknown as GridApi

        const urlSync = new AGGridUrlSync(mockGridApiWithFilter)
        const url = urlSync.generateUrl('https://example.com')
        expect(url).toBe('https://example.com/?f_status_eq=active')
      })
    })

    describe('Not Contains Operation', () => {
      it('should apply notContains filter from URL', () => {
        const urlSync = new AGGridUrlSync(mockGridApi)
        urlSync.applyFromUrl('https://example.com?f_name_notContains=spam')
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          name: {
            filterType: 'text',
            type: 'notContains',
            filter: 'spam'
          }
        })
      })

      it('should generate URL for notContains filter', () => {
        const mockGridApiWithFilter = {
          getFilterModel: vi.fn().mockReturnValue({
            name: { filterType: 'text', type: 'notContains', filter: 'spam' }
          }),
          setFilterModel: vi.fn()
        } as unknown as GridApi

        const urlSync = new AGGridUrlSync(mockGridApiWithFilter)
        const url = urlSync.generateUrl('https://example.com')
        expect(url).toBe('https://example.com/?f_name_notContains=spam')
      })
    })

    describe('Not Equal Operation', () => {
      it('should apply notEqual filter from URL', () => {
        const urlSync = new AGGridUrlSync(mockGridApi)
        urlSync.applyFromUrl('https://example.com?f_status_neq=inactive')
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          status: {
            filterType: 'text',
            type: 'notEqual',
            filter: 'inactive'
          }
        })
      })

      it('should generate URL for notEqual filter', () => {
        const mockGridApiWithFilter = {
          getFilterModel: vi.fn().mockReturnValue({
            status: { filterType: 'text', type: 'notEqual', filter: 'inactive' }
          }),
          setFilterModel: vi.fn()
        } as unknown as GridApi

        const urlSync = new AGGridUrlSync(mockGridApiWithFilter)
        const url = urlSync.generateUrl('https://example.com')
        expect(url).toBe('https://example.com/?f_status_neq=inactive')
      })
    })

    describe('Starts With Operation', () => {
      it('should apply startsWith filter from URL', () => {
        const urlSync = new AGGridUrlSync(mockGridApi)
        urlSync.applyFromUrl('https://example.com?f_email_startsWith=admin')
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          email: {
            filterType: 'text',
            type: 'startsWith',
            filter: 'admin'
          }
        })
      })

      it('should generate URL for startsWith filter', () => {
        const mockGridApiWithFilter = {
          getFilterModel: vi.fn().mockReturnValue({
            email: { filterType: 'text', type: 'startsWith', filter: 'admin' }
          }),
          setFilterModel: vi.fn()
        } as unknown as GridApi

        const urlSync = new AGGridUrlSync(mockGridApiWithFilter)
        const url = urlSync.generateUrl('https://example.com')
        expect(url).toBe('https://example.com/?f_email_startsWith=admin')
      })
    })

    describe('Ends With Operation', () => {
      it('should apply endsWith filter from URL', () => {
        const urlSync = new AGGridUrlSync(mockGridApi)
        urlSync.applyFromUrl(
          'https://example.com?f_description_endsWith=pending'
        )
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          description: {
            filterType: 'text',
            type: 'endsWith',
            filter: 'pending'
          }
        })
      })

      it('should generate URL for endsWith filter', () => {
        const mockGridApiWithFilter = {
          getFilterModel: vi.fn().mockReturnValue({
            description: {
              filterType: 'text',
              type: 'endsWith',
              filter: 'pending'
            }
          }),
          setFilterModel: vi.fn()
        } as unknown as GridApi

        const urlSync = new AGGridUrlSync(mockGridApiWithFilter)
        const url = urlSync.generateUrl('https://example.com')
        expect(url).toBe('https://example.com/?f_description_endsWith=pending')
      })
    })

    describe('Blank Operations', () => {
      it('should apply blank filter from URL', () => {
        const urlSync = new AGGridUrlSync(mockGridApi)
        urlSync.applyFromUrl('https://example.com?f_optional_field_blank=true')
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          optional_field: {
            filterType: 'text',
            type: 'blank',
            filter: ''
          }
        })
      })

      it('should apply notBlank filter from URL', () => {
        const urlSync = new AGGridUrlSync(mockGridApi)
        urlSync.applyFromUrl(
          'https://example.com?f_required_field_notBlank=true'
        )
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          required_field: {
            filterType: 'text',
            type: 'notBlank',
            filter: ''
          }
        })
      })

      it('should generate URL for blank operations', () => {
        const mockGridApiWithFilter = {
          getFilterModel: vi.fn().mockReturnValue({
            optional_field: { filterType: 'text', type: 'blank', filter: '' },
            required_field: { filterType: 'text', type: 'notBlank', filter: '' }
          }),
          setFilterModel: vi.fn()
        } as unknown as GridApi

        const urlSync = new AGGridUrlSync(mockGridApiWithFilter)
        const url = urlSync.generateUrl('https://example.com')
        expect(url).toContain('f_optional_field_blank=true')
        expect(url).toContain('f_required_field_notBlank=true')
      })

      it('should handle blank operations with values gracefully', () => {
        const urlSync = new AGGridUrlSync(mockGridApi)
        urlSync.applyFromUrl(
          'https://example.com?f_optional_field_blank=anything'
        )
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({
          optional_field: {
            filterType: 'text',
            type: 'blank',
            filter: ''
          }
        })
      })
    })

    describe('Multiple Operations', () => {
      it('should handle all 8 text operations in single URL', () => {
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

describe('createUrlSync', () => {
  it('should create AGGridUrlSync instance', () => {
    const mockGridApi = {
      getFilterModel: vi.fn(),
      setFilterModel: vi.fn()
    } as unknown as GridApi
    const urlSync = createUrlSync(mockGridApi)
    expect(urlSync).toBeInstanceOf(AGGridUrlSync)
  })

  it('should pass config to AGGridUrlSync instance', () => {
    const mockGridApi = {
      getFilterModel: vi.fn(),
      setFilterModel: vi.fn()
    } as unknown as GridApi
    const config = {
      paramPrefix: 'filter_',
      maxValueLength: 100
    }
    const urlSync = createUrlSync(mockGridApi, config)
    expect(urlSync).toBeInstanceOf(AGGridUrlSync)
  })
})

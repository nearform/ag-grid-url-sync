import { describe, it, expect, vi, beforeEach } from 'vitest'
import { serializeFilters, generateUrl } from './url-generator.js'
import type { FilterState, InternalConfig } from './types.js'

describe('URL Generator', () => {
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

  describe('serializeFilters', () => {
    it('should serialize basic text filter', () => {
      const filterState: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }
      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_name_contains')).toBe('john')
    })

    it('should serialize number filter', () => {
      const filterState: FilterState = {
        age: { filterType: 'number', type: 'eq', filter: 25 }
      }
      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_age_eq')).toBe('25')
    })

    it('should serialize date filter', () => {
      const filterState: FilterState = {
        created: { filterType: 'date', type: 'eq', filter: '2024-01-15' }
      }
      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_created_eq')).toBe('2024-01-15')
    })

    it('should serialize range filters', () => {
      const filterState: FilterState = {
        age: {
          filterType: 'number',
          type: 'inRange',
          filter: 25,
          filterTo: 65
        } as any,
        period: {
          filterType: 'date',
          type: 'dateRange',
          filter: '2024-01-01',
          filterTo: '2024-12-31'
        } as any
      }
      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_age_range')).toBe('25,65')
      expect(result.get('f_period_daterange')).toBe('2024-01-01,2024-12-31')
    })

    it('should serialize blank operations', () => {
      const filterState: FilterState = {
        optional: { filterType: 'text', type: 'blank', filter: '' },
        required: { filterType: 'text', type: 'notBlank', filter: '' }
      }
      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_optional_blank')).toBe('true')
      expect(result.get('f_required_notBlank')).toBe('true')
    })

    it('should handle special characters', () => {
      const filterState: FilterState = {
        query: { filterType: 'text', type: 'contains', filter: 'test & more' }
      }
      const result = serializeFilters(filterState, mockConfig)
      expect(result.get('f_query_contains')).toBe('test & more')
    })
  })

  describe('generateUrl', () => {
    it('should generate URL with filters', () => {
      const filterState: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }
      const result = generateUrl('https://example.com', filterState, mockConfig)
      expect(result).toBe('https://example.com/?f_name_contains=john')
    })

    it('should handle empty filter state', () => {
      const result = generateUrl('https://example.com', {}, mockConfig)
      expect(result).toBe('https://example.com')
    })

    it('should preserve existing query parameters', () => {
      const filterState: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: 'john' }
      }
      const result = generateUrl(
        'https://example.com?page=1',
        filterState,
        mockConfig
      )
      expect(result).toContain('page=1')
      expect(result).toContain('f_name_contains=john')
    })
  })
})

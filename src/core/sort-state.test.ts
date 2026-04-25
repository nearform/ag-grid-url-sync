import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AGGridUrlSync } from './ag-grid-url-sync.js'
import { parseSortState } from './url-parser.js'
import { serializeSortState } from './url-generator.js'
import { getSortState, applySortState } from './grid-integration.js'
import type { GridApi } from 'ag-grid-community'
import type { InternalConfig, SortState } from './types.js'
import { DEFAULT_CONFIG } from './validation.js'

describe('Sort State Synchronization', () => {
  const mockGridApi = {
    getColumnState: vi.fn(),
    applyColumnState: vi.fn()
  } as unknown as GridApi

  const config: InternalConfig = {
    gridApi: mockGridApi,
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: vi.fn(),
    serialization: 'individual',
    format: 'querystring',
    groupedParam: 'grid_filters',
    sortPrefix: 's_'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSortState', () => {
    it('should return empty array when no columns are sorted', () => {
      mockGridApi.getColumnState = vi.fn().mockReturnValue([])

      const result = getSortState(config)

      expect(result).toEqual([])
    })

    it('should return single sort state for one sorted column', () => {
      mockGridApi.getColumnState = vi
        .fn()
        .mockReturnValue([{ colId: 'name', sort: 'asc' }])

      const result = getSortState(config)

      expect(result).toEqual([{ colId: 'name', sort: 'asc', index: 0 }])
    })

    it('should return sort state for multiple sorted columns', () => {
      mockGridApi.getColumnState = vi.fn().mockReturnValue([
        { colId: 'name', sort: 'asc' },
        { colId: 'salary', sort: 'desc' }
      ])

      const result = getSortState(config)

      expect(result).toEqual([
        { colId: 'name', sort: 'asc', index: 0 },
        { colId: 'salary', sort: 'desc', index: 1 }
      ])
    })
  })

  describe('applySortState', () => {
    it('should apply single column sort', () => {
      const sortState: SortState = [{ colId: 'name', sort: 'asc' }]

      applySortState(sortState, config)

      expect(mockGridApi.applyColumnState).toHaveBeenCalledWith({
        state: [{ colId: 'name', sort: 'asc' }],
        defaultState: { sort: null }
      })
    })

    it('should apply multiple column sort', () => {
      const sortState: SortState = [
        { colId: 'name', sort: 'asc' },
        { colId: 'salary', sort: 'desc' }
      ]

      applySortState(sortState, config)

      expect(mockGridApi.applyColumnState).toHaveBeenCalledWith({
        state: [
          { colId: 'name', sort: 'asc' },
          { colId: 'salary', sort: 'desc' }
        ],
        defaultState: { sort: null }
      })
    })

    it('should clear all sorts when empty array provided', () => {
      const sortState: SortState = []

      applySortState(sortState, config)

      expect(mockGridApi.applyColumnState).toHaveBeenCalledWith({
        state: [],
        defaultState: { sort: null }
      })
    })
  })

  describe('serializeSortState', () => {
    it('should serialize single column sort to URL', () => {
      const sortState: SortState = [{ colId: 'name', sort: 'asc' }]

      const params = serializeSortState(sortState, config)

      expect(params.toString()).toBe('s_name=asc')
    })

    it('should serialize descending sort', () => {
      const sortState: SortState = [{ colId: 'salary', sort: 'desc' }]

      const params = serializeSortState(sortState, config)

      expect(params.toString()).toBe('s_salary=desc')
    })

    it('should serialize multiple column sorts', () => {
      const sortState: SortState = [
        { colId: 'name', sort: 'asc' },
        { colId: 'salary', sort: 'desc' }
      ]

      const params = serializeSortState(sortState, config)

      expect(params.get('s_name_1')).toBe('asc')
      expect(params.get('s_salary_2')).toBe('desc')
    })

    it('should return empty params for empty sort state', () => {
      const sortState: SortState = []

      const params = serializeSortState(sortState, config)

      expect(params.toString()).toBe('')
    })
  })

  describe('parseSortState', () => {
    it('should parse single column sort from URL', () => {
      const url = 'https://example.com?s_name=asc'

      const result = parseSortState(url, config)

      expect(result).toEqual([{ colId: 'name', sort: 'asc' }])
    })

    it('should parse descending sort', () => {
      const url = 'https://example.com?s_salary=desc'

      const result = parseSortState(url, config)

      expect(result).toEqual([{ colId: 'salary', sort: 'desc' }])
    })

    it('should parse multiple column sorts from URL', () => {
      const url = 'https://example.com?s_name_1=asc&s_salary_2=desc'

      const result = parseSortState(url, config)

      expect(result).toEqual([
        { colId: 'name', sort: 'asc' },
        { colId: 'salary', sort: 'desc' }
      ])
    })

    it('should return empty array when no sort params', () => {
      const url = 'https://example.com?f_name_contains=john'

      const result = parseSortState(url, config)

      expect(result).toEqual([])
    })

    it('should ignore invalid sort values', () => {
      const url = 'https://example.com?s_name=invalid'

      const result = parseSortState(url, config)

      expect(result).toEqual([])
    })
  })

  describe('AGGridUrlSync with sort enabled', () => {
    it('should include sort state in URL', () => {
      mockGridApi.getFilterModel = vi.fn().mockReturnValue({})
      mockGridApi.getColumnState = vi
        .fn()
        .mockReturnValue([{ colId: 'name', sort: 'asc' }])

      const urlSync = new AGGridUrlSync(mockGridApi)

      const url = urlSync.generateUrl('https://example.com')

      expect(url).toContain('s_name=asc')
    })

    it('should apply sort from URL', () => {
      mockGridApi.setFilterModel = vi.fn()
      mockGridApi.applyColumnState = vi.fn()

      const urlSync = new AGGridUrlSync(mockGridApi)

      urlSync.applyFromUrl('https://example.com?s_name=asc')

      expect(mockGridApi.applyColumnState).toHaveBeenCalledWith({
        state: [{ colId: 'name', sort: 'asc' }],
        defaultState: { sort: null }
      })
    })

    it('should provide getSortState method', () => {
      mockGridApi.getFilterModel = vi.fn().mockReturnValue({})
      mockGridApi.getColumnState = vi
        .fn()
        .mockReturnValue([{ colId: 'name', sort: 'desc' }])

      const urlSync = new AGGridUrlSync(mockGridApi)

      const sortState = urlSync.getSortState()

      expect(sortState).toEqual([{ colId: 'name', sort: 'desc', index: 0 }])
    })

    it('should provide clearSortState method', () => {
      mockGridApi.setFilterModel = vi.fn()
      mockGridApi.applyColumnState = vi.fn()

      const urlSync = new AGGridUrlSync(mockGridApi)

      urlSync.clearSortState()

      expect(mockGridApi.applyColumnState).toHaveBeenCalledWith({
        state: [],
        defaultState: { sort: null }
      })
    })
  })
})

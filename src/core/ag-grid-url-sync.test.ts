import { describe, it, expect, vi } from 'vitest'
import { AGGridUrlSync } from './ag-grid-url-sync.js'
import type { AGGridUrlSyncConfig, FilterState } from './types.js'
import {
  asGridApi,
  createGridApiSpies,
  timedColumnDef
} from '../test-helpers.js'
import type { FilterModel } from 'ag-grid-community'

describe('AGGridUrlSync', () => {
  // Mock GridApi
  const mockFilterModel = {
    name: {
      filterType: 'text' as const,
      type: 'contains' as const,
      filter: 'john'
    }
  }

  const mockGridApi = asGridApi({
    getFilterModel: vi.fn().mockReturnValue(mockFilterModel),
    setFilterModel: vi.fn()
  })

  describe('config defaults', () => {
    // A caller can forward an optional prop, for example
    // `format: props.format`, so a key can be present with the value undefined
    // (#258).
    const undefinedConfig: AGGridUrlSyncConfig = {
      paramPrefix: undefined,
      maxValueLength: undefined,
      serialization: undefined,
      groupedParam: undefined,
      format: undefined
    }

    it('should use the defaults for keys set to undefined', () => {
      const urlSync = new AGGridUrlSync(mockGridApi, undefinedConfig)
      expect(urlSync.getSerializationMode()).toBe('individual')
      expect(urlSync.getCurrentFormat()).toBe('querystring')
      expect(urlSync.generateUrl('https://example.com')).toBe(
        'https://example.com/?f_name_contains=john'
      )
    })

    it('should decode a grouped URL when format and groupedParam are undefined', () => {
      const setFilterModel = vi.fn()
      const onParseError = vi.fn()

      const gridApi = asGridApi({
        getFilterModel: vi.fn().mockReturnValue({}),
        setFilterModel
      })

      const urlSync = new AGGridUrlSync(gridApi, {
        ...undefinedConfig,
        onParseError
      })

      urlSync.applyFromUrl(
        'https://example.com/?grid_filters=f_name_contains%3Dbob'
      )

      expect(setFilterModel).toHaveBeenCalledWith({
        name: { filterType: 'text', type: 'contains', filter: 'bob' }
      })
      expect(onParseError).not.toHaveBeenCalled()
    })
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

  describe('getUrlState', () => {
    it('should give the URL and hasFilters true when the grid has filters', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      expect(urlSync.getUrlState('https://example.com/?tab=1')).toEqual({
        url: 'https://example.com/?f_name_contains=john&tab=1',
        hasFilters: true,
        issues: []
      })
    })

    it('should give hasFilters false when only the page has params (#215)', () => {
      const api = asGridApi({
        getFilterModel: vi.fn().mockReturnValue({}),
        setFilterModel: vi.fn()
      })

      const urlSync = new AGGridUrlSync(api)
      expect(urlSync.getUrlState('https://example.com/?tab=1')).toEqual({
        url: 'https://example.com/?tab=1',
        hasFilters: false,
        issues: []
      })
      expect(api.getFilterModel).toHaveBeenCalledTimes(1)
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

  // Each call gives its own issues, the same objects that onParseError gets
  // (#229)
  describe('issues in the result (#229)', () => {
    const LONG = 'a'.repeat(201)

    function createSync(model: FilterModel = {}) {
      const api = createGridApiSpies()
      api.getFilterModel.mockReturnValue(model)
      api.getColumn.mockReturnValue({
        getColDef: () => ({ filter: 'agTextColumnFilter' })
      })
      const onParseError = vi.fn()

      return {
        api,
        onParseError,
        sync: new AGGridUrlSync(asGridApi(api), { onParseError })
      }
    }

    it('getUrlState gives the issues of the grid read and the URL write', () => {
      const { sync, onParseError } = createSync({
        name: { filterType: 'text', type: 'contains', filter: LONG }
      })

      const state = sync.getUrlState('https://example.com/')

      expect(state.hasFilters).toBe(true)
      expect(state.issues).toHaveLength(1)
      expect(state.issues[0]).toMatchObject({
        code: 'VALUE_TOO_LONG',
        column: 'name'
      })
      expect(onParseError).toHaveBeenCalledOnce()
      expect(onParseError.mock.calls[0]?.[0]).toBe(state.issues[0])
    })

    it('applyFromUrl gives the issues of the URL', () => {
      const { sync } = createSync()

      const { issues } = sync.applyFromUrl('?f_age_gt=abc')

      expect(issues).toHaveLength(1)
      expect(issues[0]).toMatchObject({ code: 'INVALID_NUMBER', column: 'age' })
    })

    it('applyFilters gives TYPE_MISMATCH issues', () => {
      const { sync } = createSync()

      const { issues } = sync.applyFilters({
        n: { filterType: 'number', type: 'eq', filter: 1 }
      })

      expect(issues).toHaveLength(1)
      expect(issues[0]).toMatchObject({ code: 'TYPE_MISMATCH', column: 'n' })
    })

    it('clearFilters gives no issues', () => {
      const { sync } = createSync()

      expect(sync.clearFilters()).toEqual({ issues: [] })
    })

    it('each call gives only its own issues', () => {
      const { sync } = createSync({
        name: { filterType: 'text', type: 'contains', filter: LONG }
      })

      sync.getUrlState('https://example.com/')

      expect(sync.getUrlState('https://example.com/').issues).toHaveLength(1)
    })

    // A subclass that overrides applyFilters still sees URL applies (#229 review)
    it('applyFromUrl goes through applyFilters and joins the issues', () => {
      const { sync } = createSync()
      const applyFilters = vi.spyOn(sync, 'applyFilters')

      const { issues } = sync.applyFromUrl('?f_age_gt=abc&f_n_gt=5')

      expect(applyFilters).toHaveBeenCalledOnce()
      // The parse issue comes first, then the apply issue (a number filter on
      // a text column)
      expect(issues.map(issue => issue.code)).toEqual([
        'INVALID_NUMBER',
        'TYPE_MISMATCH'
      ])
    })

    // An applyFilters override from before #229 returns nothing. applyFromUrl
    // must still apply the URL and give the parse issues (PR #264 review).
    it('applyFromUrl works with an applyFilters override that returns nothing', () => {
      const { sync } = createSync()
      const applied: FilterState[] = []
      // A JavaScript override, so it is set without a TypeScript signature
      Reflect.set(sync, 'applyFilters', (state: FilterState) => {
        applied.push(state)
      })

      const { issues } = sync.applyFromUrl('?f_age_gt=abc&f_name_contains=bob')

      expect(applied).toEqual([
        { name: { filterType: 'text', type: 'contains', filter: 'bob' } }
      ])
      expect(issues.map(issue => issue.code)).toEqual(['INVALID_NUMBER'])
    })

    it('an issue that throwOnError throws is not in the list', () => {
      const api = createGridApiSpies()
      api.getFilterModel.mockReturnValue({})
      const sync = new AGGridUrlSync(asGridApi(api), { throwOnError: true })

      expect(() => sync.applyFromUrl('?f_age_gt=abc')).toThrow(
        expect.objectContaining({ code: 'INVALID_NUMBER' })
      )
    })
  })

  // On AG Grid 28 to 30, the grid API has getColumnDef and no getColumn
  // (#300)
  describe('a grid API with no getColumn, as on AG Grid 28 to 30 (#300)', () => {
    const AGE_AND_CREATED = {
      age: { filterType: 'number', type: 'greaterThan', filter: 35 },
      created: {
        filterType: 'date',
        type: 'equals',
        dateFrom: '2024-01-01',
        dateTo: null
      }
    }

    const legacyApi = () => ({
      getFilterModel: vi.fn(() => ({})),
      setFilterModel: vi.fn(),
      getColumnDef: vi.fn(timedColumnDef)
    })

    it('applyFromUrl keeps the number and date filters, with no issue', () => {
      const api = legacyApi()
      const onParseError = vi.fn()
      const sync = new AGGridUrlSync(asGridApi(api), { onParseError })

      const result = sync.applyFromUrl(
        'https://example.com/?f_age_gt=35&f_created_eq=2024-01-01'
      )

      expect(api.setFilterModel).toHaveBeenCalledWith(AGE_AND_CREATED)
      expect(result.issues).toEqual([])
      expect(onParseError).not.toHaveBeenCalled()
    })

    it('applyFilters keeps the number and date filters, with no issue', () => {
      const api = legacyApi()
      const onParseError = vi.fn()
      const sync = new AGGridUrlSync(asGridApi(api), { onParseError })

      sync.applyFilters({
        age: { filterType: 'number', type: 'greaterThan', filter: 35 },
        created: { filterType: 'date', type: 'eq', filter: '2024-01-01' }
      })

      expect(api.setFilterModel).toHaveBeenCalledWith(AGE_AND_CREATED)
      expect(onParseError).not.toHaveBeenCalled()
    })
  })
})

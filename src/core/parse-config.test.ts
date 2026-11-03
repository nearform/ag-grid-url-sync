import { describe, it, expect, vi } from 'vitest'
import { parseUrlFilters } from './url-parser.js'
import { generateUrl, serializeFilters } from './url-generator.js'
import {
  serializeGrouped,
  deserializeGrouped
} from './serialization/grouped.js'
import { QueryStringSerializer } from './serialization/formats.js'
import { DEFAULT_CONFIG } from './validation.js'
import type { FilterState, ParseConfig, SerializationFormat } from './types.js'
import { InvalidFilterError, InvalidSerializationError } from './types.js'

// The parse/serialize path must work without a grid (issue #109). These tests
// call it with no gridApi, with gridApi: null, and with a gridApi that throws
// when read, so a future change that reads config.gridApi fails here.

const BASE_URL = 'https://example.com/grid'

const sampleFilterState: FilterState = {
  name: { filterType: 'text', type: 'contains', filter: 'john' },
  age: { filterType: 'number', type: 'greaterThan', filter: 25 },
  created: { filterType: 'date', type: 'dateAfter', filter: '2024-01-01' }
}

function withThrowingGridApi(config: ParseConfig): ParseConfig {
  const guarded = { ...config }
  Object.defineProperty(guarded, 'gridApi', {
    enumerable: true,
    get() {
      throw new Error('gridApi must not be read on the parse/serialize path')
    }
  })

  return guarded
}

type GridApiVariant = [string, (config: ParseConfig) => ParseConfig]

const gridApiVariants: GridApiVariant[] = [
  ['gridApi omitted', config => config],
  ['gridApi: null', config => ({ ...config, gridApi: null })],
  ['gridApi throws when read', withThrowingGridApi]
]

const groupedFormats: SerializationFormat[] = ['querystring', 'json', 'base64']

describe.each(gridApiVariants)('ParseConfig with %s', (_, applyVariant) => {
  const createConfig = (overrides: Partial<ParseConfig> = {}): ParseConfig =>
    applyVariant({ ...DEFAULT_CONFIG, onParseError: vi.fn(), ...overrides })

  describe('individual serialization', () => {
    it('serializeFilters writes prefixed params', () => {
      const params = serializeFilters(sampleFilterState, createConfig())

      expect(params.get('f_name_contains')).toBe('john')
      expect(params.get('f_age_gt')).toBe('25')
      expect(params.get('f_created_after')).toBe('2024-01-01')
    })

    it('generateUrl and parseUrlFilters round-trip the filter state', () => {
      const config = createConfig()

      const url = generateUrl(BASE_URL, sampleFilterState, config)

      expect(parseUrlFilters(url, config)).toEqual(sampleFilterState)
      expect(config.onParseError).not.toHaveBeenCalled()
    })
  })

  describe.each(groupedFormats)('grouped %s serialization', format => {
    it('generateUrl and parseUrlFilters round-trip the filter state', () => {
      const config = createConfig({ serialization: 'grouped', format })

      const url = generateUrl(BASE_URL, sampleFilterState, config)

      expect(new URL(url).searchParams.has(config.groupedParam)).toBe(true)
      expect(parseUrlFilters(url, config)).toEqual(sampleFilterState)
      expect(config.onParseError).not.toHaveBeenCalled()
    })

    it('serializeGrouped and deserializeGrouped round-trip the filter state', () => {
      const config = createConfig({ serialization: 'grouped', format })

      const { value } = serializeGrouped(sampleFilterState, config)

      expect(deserializeGrouped(value, format, config)).toEqual(
        sampleFilterState
      )
      expect(config.onParseError).not.toHaveBeenCalled()
    })
  })
})

describe('grouped querystring serialization with caller config (#201)', () => {
  const createGroupedConfig = (
    overrides: Partial<ParseConfig> = {}
  ): ParseConfig => ({
    ...DEFAULT_CONFIG,
    serialization: 'grouped',
    format: 'querystring',
    onParseError: vi.fn(),
    ...overrides
  })

  const textFilter = (filter: string): FilterState => ({
    name: { filterType: 'text', type: 'contains', filter }
  })

  it("round-trips a text filter within the caller's maxValueLength", () => {
    const config = createGroupedConfig({ maxValueLength: 500 })
    const filterState = textFilter('a'.repeat(300))

    const url = generateUrl(BASE_URL, filterState, config)

    expect(parseUrlFilters(url, config)).toEqual(filterState)
    expect(config.onParseError).not.toHaveBeenCalled()
  })

  it("reports a value over the caller's maxValueLength when generating", () => {
    const config = createGroupedConfig({ maxValueLength: 5 })

    const url = generateUrl(BASE_URL, textFilter('john smith'), config)

    expect(new URL(url).searchParams.has(config.groupedParam)).toBe(false)
    expect(config.onParseError).toHaveBeenCalledOnce()
  })

  it("keeps the other filters when one is over the caller's maxValueLength", () => {
    const config = createGroupedConfig({ maxValueLength: 5 })

    const age: FilterState = {
      age: { filterType: 'number', type: 'greaterThan', filter: 25 }
    }

    const url = generateUrl(
      BASE_URL,
      { ...textFilter('john smith'), ...age },
      config
    )

    expect(parseUrlFilters(url, config)).toEqual(age)
    expect(config.onParseError).toHaveBeenCalledOnce()
  })

  it("reports a value over the caller's maxValueLength when parsing", () => {
    const config = createGroupedConfig({ maxValueLength: 5 })

    const grouped = new URLSearchParams({
      grid_filters: 'f_name_contains=john+smith&f_age_gt=25'
    })

    const filters = parseUrlFilters(`${BASE_URL}?${grouped}`, config)

    expect(filters).toEqual({
      age: { filterType: 'number', type: 'greaterThan', filter: 25 }
    })
    expect(config.onParseError).toHaveBeenCalledOnce()
  })

  it('wraps errors inside the grouped value in InvalidSerializationError', () => {
    const config = createGroupedConfig()
    const grouped = new URLSearchParams({ grid_filters: 'f_age_gt=abc' })

    parseUrlFilters(`${BASE_URL}?${grouped}`, config)

    const error = vi.mocked(config.onParseError).mock.calls[0]?.[0]
    expect(error).toBeInstanceOf(InvalidSerializationError)
    expect(error?.cause).toBeInstanceOf(InvalidFilterError)
  })

  it('keeps the default maxValueLength when the caller leaves it out', () => {
    // A JS caller, or a partial config cast to ParseConfig
    const onParseError = vi.fn()
    const config = { onParseError } as unknown as ParseConfig
    const value = `f_name_contains=${'a'.repeat(201)}`

    const filters = new QueryStringSerializer().deserialize(value, config)

    expect(filters).toEqual({})
    expect(onParseError).toHaveBeenCalledOnce()
  })

  it('reports an invalid parameter in the grouped value to onParseError', () => {
    const config = createGroupedConfig()

    const grouped = new URLSearchParams({
      grid_filters: 'f_name_contains=john&f_age_gt=abc'
    })

    const filters = parseUrlFilters(`${BASE_URL}?${grouped}`, config)

    expect(filters).toEqual(textFilter('john'))
    expect(config.onParseError).toHaveBeenCalledOnce()
  })
})

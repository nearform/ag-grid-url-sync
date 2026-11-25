import { describe, it, expect, vi } from 'vitest'
import { readUrlFilters } from './url-parser.js'
import { writeUrlFilters, serializeFilters } from './url-generator.js'
import {
  serializeGrouped,
  deserializeGrouped
} from './serialization/grouped.js'
import {
  QueryStringSerializer,
  JsonSerializer,
  Base64Serializer
} from './serialization/formats.js'
import { DEFAULT_CONFIG, validateFilterValue } from './validation.js'
import type { FilterModel } from 'ag-grid-community'
import type {
  FilterState,
  ResolvedOptions,
  SerializationFormat
} from './types.js'
import { InvalidFilterError, InvalidSerializationError } from './types.js'

// The parse/serialize path must work without a grid (issue #109). It takes
// resolved options only, and has no grid argument.

const BASE_URL = 'https://example.com/grid'

const sampleFilterState: FilterModel = {
  name: { filterType: 'text', type: 'contains', filter: 'john' },
  age: { filterType: 'number', type: 'greaterThan', filter: 25 },
  created: {
    filterType: 'date',
    type: 'greaterThan',
    dateFrom: '2024-01-01',
    dateTo: null
  }
}

const groupedFormats: SerializationFormat[] = ['querystring', 'json', 'base64']

describe('pure functions with resolved options', () => {
  const createConfig = (
    overrides: Partial<ResolvedOptions> = {}
  ): ResolvedOptions => ({
    ...DEFAULT_CONFIG,
    onParseError: vi.fn(),
    ...overrides
  })

  describe('individual serialization', () => {
    it('serializeFilters writes prefixed params', () => {
      const params = serializeFilters(sampleFilterState, createConfig())

      expect(params.get('f_name_contains')).toBe('john')
      expect(params.get('f_age_gt')).toBe('25')
      expect(params.get('f_created_after')).toBe('2024-01-01')
    })

    it('writeUrlFilters and readUrlFilters round-trip the filter state', () => {
      const config = createConfig()

      const url = writeUrlFilters(BASE_URL, sampleFilterState, config)

      expect(readUrlFilters(url, config)).toEqual(sampleFilterState)
      expect(config.onParseError).not.toHaveBeenCalled()
    })
  })

  describe.each(groupedFormats)('grouped %s serialization', format => {
    it('writeUrlFilters and readUrlFilters round-trip the filter state', () => {
      const config = createConfig({ serialization: 'grouped', format })

      const url = writeUrlFilters(BASE_URL, sampleFilterState, config)

      expect(new URL(url).searchParams.has(config.groupedParam)).toBe(true)
      expect(readUrlFilters(url, config)).toEqual(sampleFilterState)
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
    overrides: Partial<ResolvedOptions> = {}
  ): ResolvedOptions => ({
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

    const url = writeUrlFilters(BASE_URL, filterState, config)

    expect(readUrlFilters(url, config)).toEqual(filterState)
    expect(config.onParseError).not.toHaveBeenCalled()
  })

  it("reports a value over the caller's maxValueLength when generating", () => {
    const config = createGroupedConfig({ maxValueLength: 5 })

    const url = writeUrlFilters(BASE_URL, textFilter('john smith'), config)

    expect(new URL(url).searchParams.has(config.groupedParam)).toBe(false)
    expect(config.onParseError).toHaveBeenCalledOnce()
  })

  it("keeps the other filters when one is over the caller's maxValueLength", () => {
    const config = createGroupedConfig({ maxValueLength: 5 })

    const age: FilterState = {
      age: { filterType: 'number', type: 'greaterThan', filter: 25 }
    }

    const url = writeUrlFilters(
      BASE_URL,
      { ...textFilter('john smith'), ...age },
      config
    )

    expect(readUrlFilters(url, config)).toEqual(age)
    expect(config.onParseError).toHaveBeenCalledOnce()
  })

  it("reports a value over the caller's maxValueLength when parsing", () => {
    const config = createGroupedConfig({ maxValueLength: 5 })

    const grouped = new URLSearchParams({
      grid_filters: 'f_name_contains=john+smith&f_age_gt=25'
    })

    const filters = readUrlFilters(`${BASE_URL}?${grouped}`, config)

    expect(filters).toEqual({
      age: { filterType: 'number', type: 'greaterThan', filter: 25 }
    })
    expect(config.onParseError).toHaveBeenCalledOnce()
  })

  it('wraps errors inside the grouped value in InvalidSerializationError', () => {
    const config = createGroupedConfig()
    const grouped = new URLSearchParams({ grid_filters: 'f_age_gt=abc' })

    readUrlFilters(`${BASE_URL}?${grouped}`, config)

    const error = vi.mocked(config.onParseError).mock.calls[0]?.[0]
    expect(error).toBeInstanceOf(InvalidSerializationError)
    expect(error?.cause).toBeInstanceOf(InvalidFilterError)
  })

  it('keeps the default maxValueLength when the caller leaves it out', () => {
    const onParseError = vi.fn()
    const value = `f_name_contains=${'a'.repeat(201)}`

    const filters = new QueryStringSerializer().deserialize(value, {
      onParseError
    })

    expect(filters).toEqual({})
    expect(onParseError).toHaveBeenCalledOnce()
  })

  it('reports an invalid parameter in the grouped value to onParseError', () => {
    const config = createGroupedConfig()

    const grouped = new URLSearchParams({
      grid_filters: 'f_name_contains=john&f_age_gt=abc'
    })

    const filters = readUrlFilters(`${BASE_URL}?${grouped}`, config)

    expect(filters).toEqual(textFilter('john'))
    expect(config.onParseError).toHaveBeenCalledOnce()
  })
})

// The pure functions take a partial config and give each option that is left
// out its default (#219)
describe('partial config (#219)', () => {
  const longText: FilterState = {
    name: { filterType: 'text', type: 'contains', filter: 'a'.repeat(201) }
  }

  it('readUrlFilters works with no config', () => {
    expect(readUrlFilters('?f_name_contains=john')).toEqual({
      name: { filterType: 'text', type: 'contains', filter: 'john' }
    })
  })

  it('serializeFilters and writeUrlFilters work with no config', () => {
    expect(serializeFilters(sampleFilterState).get('f_age_gt')).toBe('25')

    const url = writeUrlFilters(BASE_URL, sampleFilterState)

    expect(readUrlFilters(url)).toEqual(sampleFilterState)
  })

  it('writeUrlFilters and readUrlFilters use the options that are set', () => {
    const config = { paramPrefix: 'flt_' }

    const url = writeUrlFilters(BASE_URL, sampleFilterState, config)

    expect(new URL(url).searchParams.get('flt_name_contains')).toBe('john')
    expect(readUrlFilters(url, config)).toEqual(sampleFilterState)
  })

  it.each(groupedFormats)(
    'round-trips grouped %s with a partial config',
    format => {
      const config = { serialization: 'grouped', format } as const

      const url = writeUrlFilters(BASE_URL, sampleFilterState, config)

      expect(new URL(url).searchParams.has('grid_filters')).toBe(true)
      expect(readUrlFilters(url, config)).toEqual(sampleFilterState)
    }
  )

  it.each(groupedFormats)(
    'serializeGrouped and deserializeGrouped (%s) work with no config',
    format => {
      const { paramName, value } = serializeGrouped(sampleFilterState, {
        format
      })

      expect(paramName).toBe('grid_filters')
      expect(deserializeGrouped(value, format)).toEqual(sampleFilterState)
    }
  )

  it('gives the default maxValueLength when only onParseError is set', () => {
    const onParseError = vi.fn()

    expect(serializeFilters(longText, { onParseError }).toString()).toBe('')
    expect(onParseError).toHaveBeenCalledOnce()
  })

  // The value is written by hand: serialize with no config drops it already
  it.each([
    ['json', new JsonSerializer(), JSON.stringify(longText)],
    ['base64', new Base64Serializer(), btoa(JSON.stringify(longText))]
  ] as const)(
    'the %s serializer drops a value over the default maxValueLength',
    (_, serializer, value) => {
      const onParseError = vi.fn()

      expect(serializer.deserialize(value, { onParseError })).toEqual({})
      expect(onParseError).toHaveBeenCalledOnce()
    }
  )

  it('gives the default for an option set to undefined', () => {
    const config = {
      paramPrefix: undefined,
      maxValueLength: undefined,
      onParseError: undefined,
      serialization: undefined,
      groupedParam: undefined,
      format: undefined
    }

    const url = writeUrlFilters(BASE_URL, sampleFilterState, config)

    expect(new URL(url).searchParams.get('f_name_contains')).toBe('john')
    expect(readUrlFilters(url, config)).toEqual(sampleFilterState)
  })

  it('validateFilterValue uses the default maxValueLength', () => {
    expect(validateFilterValue('john')).toBe('john')
    expect(() => validateFilterValue('a'.repeat(201))).toThrow(
      InvalidFilterError
    )
    expect(validateFilterValue('a'.repeat(201), { maxValueLength: 300 })).toBe(
      'a'.repeat(201)
    )
  })
})

import { describe, it, expect, vi } from 'vitest'
import { parseUrlFilters } from './url-parser.js'
import { generateUrl, serializeFilters } from './url-generator.js'
import {
  serializeGrouped,
  deserializeGrouped
} from './serialization/grouped.js'
import { DEFAULT_CONFIG } from './validation.js'
import type { FilterState, ParseConfig, SerializationFormat } from './types.js'

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

  // TODO(#201): QueryStringSerializer uses DEFAULT_CONFIG, not the caller's
  // config. For 'querystring', the gridApi variant and the onParseError mock
  // only reach grouped.ts, not the inner generate/parse calls, so these cases
  // cannot fail there.
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

describe('grouped querystring serialization with caller config', () => {
  it.todo("uses the caller's maxValueLength and onParseError (#201)")
})

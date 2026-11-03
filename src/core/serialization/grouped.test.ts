import { describe, it, expect, vi } from 'vitest'
import {
  serializeGrouped,
  deserializeGrouped,
  detectGroupedSerialization,
  getAvailableFormats,
  getFormatSerializer
} from './grouped.js'
import {
  QueryStringSerializer,
  JsonSerializer,
  Base64Serializer
} from './formats.js'
import type {
  FilterState,
  InternalConfig,
  SerializationFormat
} from '../types.js'
import { InvalidSerializationError, InvalidFilterError } from '../types.js'
import { asGridApi } from '../../test-helpers.js'

const mockGridApi = asGridApi({
  setFilterModel: () => {},
  getFilterModel: () => ({})
})

/** A format name that a JavaScript caller can give and TypeScript rejects */
const untypedFormat = (name: string): SerializationFormat =>
  // SAFETY: the tests give it only to code that checks the format at run time
  // (the case under test)
  name as SerializationFormat

// Test configuration for grouped serialization
const createTestConfig = (
  overrides: Partial<InternalConfig> = {}
): InternalConfig => ({
  gridApi: mockGridApi,
  paramPrefix: 'f_',
  maxValueLength: 200,
  onParseError: () => {},
  serialization: 'grouped',
  groupedParam: 'grid_filters',
  format: 'querystring',
  ...overrides
})

// Sample filter state for testing
const sampleFilterState: FilterState = {
  name: {
    filterType: 'text',
    type: 'contains',
    filter: 'john'
  },
  age: {
    filterType: 'number',
    type: 'greaterThan',
    filter: 25
  },
  created: {
    filterType: 'date',
    type: 'dateAfter',
    filter: '2024-01-01'
  }
}

describe('Grouped Serialization', () => {
  describe('serializeGrouped', () => {
    it('should serialize filters using querystring format', () => {
      const config = createTestConfig({ format: 'querystring' })
      const result = serializeGrouped(sampleFilterState, config)

      expect(result.paramName).toBe('grid_filters')
      expect(result.value).toContain('f_name_contains=john')
      expect(result.value).toContain('f_age_gt=25')
      expect(result.value).toContain('f_created_after=2024-01-01')
    })

    it('should serialize filters using JSON format', () => {
      const config = createTestConfig({ format: 'json' })
      const result = serializeGrouped(sampleFilterState, config)

      expect(result.paramName).toBe('grid_filters')

      // Should be valid JSON
      const parsed = JSON.parse(result.value)
      expect(parsed).toEqual(sampleFilterState)
    })

    it('should serialize filters using base64 format', () => {
      const config = createTestConfig({ format: 'base64' })
      const result = serializeGrouped(sampleFilterState, config)

      expect(result.paramName).toBe('grid_filters')

      // Should be valid base64
      expect(() => atob(result.value)).not.toThrow()

      // Should decode to valid JSON
      const decoded = atob(result.value)
      const parsed = JSON.parse(decoded)
      expect(parsed).toEqual(sampleFilterState)
    })

    it('should handle empty filter state', () => {
      const config = createTestConfig()
      const result = serializeGrouped({}, config)

      expect(result.paramName).toBe('grid_filters')
      expect(result.value).toBe('')
    })

    it('should use custom grouped parameter name', () => {
      const config = createTestConfig({ groupedParam: 'my_filters' })
      const result = serializeGrouped(sampleFilterState, config)

      expect(result.paramName).toBe('my_filters')
    })
  })

  describe('deserializeGrouped', () => {
    it('should deserialize querystring format', () => {
      const config = createTestConfig()

      const serialized =
        'f_name_contains=john&f_age_gt=25&f_created_after=2024-01-01'

      const result = deserializeGrouped(serialized, 'querystring', config)

      expect(result.name).toEqual({
        filterType: 'text',
        type: 'contains',
        filter: 'john'
      })
      expect(result.age).toEqual({
        filterType: 'number',
        type: 'greaterThan',
        filter: 25
      })
      expect(result.created).toEqual({
        filterType: 'date',
        type: 'dateAfter',
        filter: '2024-01-01'
      })
    })

    it('should deserialize JSON format', () => {
      const config = createTestConfig()
      const serialized = JSON.stringify(sampleFilterState)
      const result = deserializeGrouped(serialized, 'json', config)

      expect(result).toEqual(sampleFilterState)
    })

    it('should deserialize base64 format', () => {
      const config = createTestConfig()
      const serialized = btoa(JSON.stringify(sampleFilterState))
      const result = deserializeGrouped(serialized, 'base64', config)

      expect(result).toEqual(sampleFilterState)
    })

    it('should handle malformed data gracefully', () => {
      const config = createTestConfig()
      const onParseError = vi.fn()
      config.onParseError = onParseError

      const result = deserializeGrouped('invalid-json', 'json', config)

      expect(result).toEqual({})
      expect(onParseError).toHaveBeenCalled()
    })
  })

  // A JS caller, or `{ onParseError: undefined }` spread over the defaults,
  // can leave the handler out. The fallback must still be returned.
  describe('without onParseError', () => {
    const configWithoutHandler = (): InternalConfig => {
      const { onParseError: _, ...config } = createTestConfig()

      // SAFETY: serializeGrouped and deserializeGrouped call onParseError with
      // `?.` (the case under test), as a JavaScript caller can leave it out
      return config as InternalConfig
    }

    it('serializeGrouped returns the empty fallback', () => {
      const config = {
        ...configWithoutHandler(),
        format: untypedFormat('unknown')
      }

      expect(serializeGrouped(sampleFilterState, config)).toEqual({
        paramName: 'grid_filters',
        value: ''
      })
    })

    it('deserializeGrouped returns an empty state', () => {
      expect(
        deserializeGrouped('invalid-json', 'json', configWithoutHandler())
      ).toEqual({})
    })
  })

  describe('detectGroupedSerialization', () => {
    it('does not write to the console for a URL it cannot read (#220)', () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      expect(detectGroupedSerialization('not a url', ['f'])).toEqual({
        isGrouped: false
      })
      expect(consoleError).not.toHaveBeenCalled()

      consoleError.mockRestore()
    })

    it('should detect querystring format', () => {
      const url =
        'http://example.com?grid_filters=f_name_contains%3Djohn%26f_age_gt%3D25'

      const result = detectGroupedSerialization(url, ['grid_filters'])

      expect(result.isGrouped).toBe(true)
      expect(result.paramName).toBe('grid_filters')
      expect(result.format).toBe('querystring')
      expect(result.value).toBe('f_name_contains=john&f_age_gt=25')
    })

    it('should detect JSON format', () => {
      const jsonData = JSON.stringify(sampleFilterState)
      const url = `http://example.com?grid_filters=${encodeURIComponent(jsonData)}`
      const result = detectGroupedSerialization(url, ['grid_filters'])

      expect(result.isGrouped).toBe(true)
      expect(result.paramName).toBe('grid_filters')
      expect(result.format).toBe('json')
    })

    it('should detect base64 format', () => {
      const base64Data = btoa(JSON.stringify(sampleFilterState))
      const url = `http://example.com?grid_filters=${encodeURIComponent(base64Data)}`
      const result = detectGroupedSerialization(url, ['grid_filters'])

      expect(result.isGrouped).toBe(true)
      expect(result.paramName).toBe('grid_filters')
      expect(result.format).toBe('base64')
    })

    it('should not detect grouped serialization when not present', () => {
      const url = 'http://example.com?f_name_contains=john&f_age_gt=25'
      const result = detectGroupedSerialization(url, ['grid_filters'])

      expect(result.isGrouped).toBe(false)
    })

    it('should check multiple possible parameter names', () => {
      const url = 'http://example.com?filters=f_name_contains%3Djohn'

      const result = detectGroupedSerialization(url, [
        'grid_filters',
        'filters'
      ])

      expect(result.isGrouped).toBe(true)
      expect(result.paramName).toBe('filters')
    })
  })

  describe('utility functions', () => {
    it('should return available formats', () => {
      const formats = getAvailableFormats()
      expect(formats).toEqual(['querystring', 'json', 'base64'])
    })

    it('should return format serializers', () => {
      expect(getFormatSerializer('querystring')).toBeInstanceOf(
        QueryStringSerializer
      )
      expect(getFormatSerializer('json')).toBeInstanceOf(JsonSerializer)
      expect(getFormatSerializer('base64')).toBeInstanceOf(Base64Serializer)
      expect(getFormatSerializer(untypedFormat('invalid'))).toBeNull()
    })
  })
})

describe('Format Serializers', () => {
  describe('QueryStringSerializer', () => {
    const serializer = new QueryStringSerializer()

    it('should serialize and deserialize correctly', () => {
      const serialized = serializer.serialize(sampleFilterState)
      const deserialized = serializer.deserialize(serialized)

      expect(deserialized).toEqual(sampleFilterState)
    })

    it('should handle empty state', () => {
      const serialized = serializer.serialize({})
      const deserialized = serializer.deserialize(serialized)

      expect(deserialized).toEqual({})
    })
  })

  describe('JsonSerializer', () => {
    const serializer = new JsonSerializer()

    // #250: each filter is parsed with its schema at the URL boundary
    it('should drop keys that a filter does not have', () => {
      const value = JSON.stringify({
        name: { filterType: 'text', type: 'contains', filter: 'a', extra: 1 }
      })

      expect(serializer.deserialize(value)).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'a' }
      })
    })

    it('should keep a column named __proto__ as an own key', () => {
      const filter = { filterType: 'text', type: 'contains', filter: 'a' }
      const value = `{"__proto__":${JSON.stringify(filter)}}`

      const result = serializer.deserialize(value)

      expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
      expect(Object.hasOwn(result, '__proto__')).toBe(true)
      expect(
        Object.getOwnPropertyDescriptor(result, '__proto__')?.value
      ).toEqual(filter)
    })

    it.each([
      [
        'a filter with an unknown operation',
        '{"a":{"filterType":"text","type":"regex","filter":"x"}}'
      ],
      [
        'a number filter with a text value',
        '{"a":{"filterType":"number","type":"eq","filter":"1"}}'
      ],
      [
        'a filter type the library does not support',
        '{"a":{"filterType":"set","values":["x"]}}'
      ]
    ])('should reject %s', (_label, value) => {
      expect(() => serializer.deserialize(value)).toThrow()
    })

    it('should serialize and deserialize correctly', () => {
      const serialized = serializer.serialize(sampleFilterState)
      const deserialized = serializer.deserialize(serialized)

      expect(deserialized).toEqual(sampleFilterState)
    })

    it('should handle empty state', () => {
      const serialized = serializer.serialize({})
      const deserialized = serializer.deserialize(serialized)

      expect(deserialized).toEqual({})
    })

    it('should throw on invalid JSON', () => {
      expect(() => serializer.deserialize('invalid-json')).toThrow()
    })
  })

  describe('Base64Serializer', () => {
    const serializer = new Base64Serializer()

    it('should serialize and deserialize correctly', () => {
      const serialized = serializer.serialize(sampleFilterState)
      const deserialized = serializer.deserialize(serialized)

      expect(deserialized).toEqual(sampleFilterState)
    })

    it('should handle empty state', () => {
      const serialized = serializer.serialize({})
      const deserialized = serializer.deserialize(serialized)

      expect(deserialized).toEqual({})
    })

    it('should throw on invalid base64', () => {
      expect(() => serializer.deserialize('invalid-base64!')).toThrow()
    })

    // #212: btoa accepts Latin-1 only
    it.each([
      ['CJK', '日本語'],
      ['emoji', 'smile 😀'],
      ['Latin-1', 'café'],
      ['mixed', 'Zürich 東京 🚀 ñ']
    ])('should round-trip %s text', (_label, text) => {
      const state: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: text }
      }

      expect(serializer.deserialize(serializer.serialize(state))).toEqual(state)
    })

    it('should keep the same output for ASCII text', () => {
      expect(serializer.serialize(sampleFilterState)).toBe(
        btoa(JSON.stringify(sampleFilterState))
      )
    })

    it('should decode old links that encoded Latin-1 text directly', () => {
      const state: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: 'café ñ ©' }
      }

      const oldLink = btoa(JSON.stringify(state))
      expect(serializer.deserialize(oldLink)).toEqual(state)
    })

    it('should decode old Latin-1 links whose bytes are also valid UTF-8', () => {
      // 'Ã©' is the bytes C3 A9, which are 'é' in UTF-8
      const state: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: 'Ã©' }
      }

      const oldLink = btoa(JSON.stringify(state))
      expect(serializer.deserialize(oldLink)).toEqual(state)
    })

    it('should give output that atob and JSON.parse can decode', () => {
      const state: FilterState = {
        name: { filterType: 'text', type: 'contains', filter: '日本 😀 é' }
      }

      expect(JSON.parse(atob(serializer.serialize(state)))).toEqual(state)
    })
  })

  describe('base64 format with non-Latin-1 text (#212)', () => {
    const state: FilterState = {
      n: { filterType: 'text', type: 'contains', filter: '日本' }
    }

    it('should serialize without an error and round-trip', () => {
      const onParseError = vi.fn()
      const config = createTestConfig({ format: 'base64', onParseError })

      const { value } = serializeGrouped(state, config)

      expect(onParseError).not.toHaveBeenCalled()
      expect(value).not.toBe('')
      expect(deserializeGrouped(value, 'base64', config)).toEqual(state)
      expect(onParseError).not.toHaveBeenCalled()
    })
  })
})

describe('maxValueLength in json and base64 formats (#213)', () => {
  const long = 'x'.repeat(300)

  const state = {
    big: { filterType: 'text', type: 'contains', filter: long },
    ok: { filterType: 'text', type: 'contains', filter: 'short' },
    blank: { filterType: 'text', type: 'blank', filter: '' },
    age: { filterType: 'number', type: 'greaterThan', filter: 25 }
  } satisfies FilterState

  const decodeRaw = (format: 'json' | 'base64', v: string) =>
    JSON.parse(format === 'base64' ? atob(v) : v)

  for (const format of ['json', 'base64'] as const) {
    describe(format, () => {
      it('drops and reports over-length values on generate', () => {
        const onParseError = vi.fn()
        const config = createTestConfig({ format, onParseError })
        const { value } = serializeGrouped(state, config)
        const raw = decodeRaw(format, value)
        expect(raw.big).toBeUndefined()
        expect(Object.keys(raw)).toEqual(['ok', 'blank', 'age'])
        expect(onParseError).toHaveBeenCalledTimes(1)
        const err = onParseError.mock.calls[0]?.[0]
        expect(err).toBeInstanceOf(InvalidSerializationError)
        expect(err.cause).toBeInstanceOf(InvalidFilterError)
      })

      it('drops and reports over-length values on parse', () => {
        const onParseError = vi.fn()
        const serializer = getFormatSerializer(format)

        if (!serializer) throw new Error(`no ${format} serializer`)

        const value = serializer.serialize(
          { big: state.big },
          createTestConfig({ maxValueLength: 500 })
        )

        const result = deserializeGrouped(
          value,
          format,
          createTestConfig({ format, onParseError })
        )

        expect(result).toEqual({})
        expect(onParseError).toHaveBeenCalledTimes(1)
        expect(onParseError.mock.calls[0]?.[0]).toBeInstanceOf(
          InvalidSerializationError
        )
      })

      it('round-trips in-range values without errors', () => {
        const onParseError = vi.fn()
        const config = createTestConfig({ format, onParseError })
        const { ok, blank, age } = state
        const { value } = serializeGrouped({ ok, blank, age }, config)
        expect(deserializeGrouped(value, format, config)).toEqual({
          ok,
          blank,
          age
        })
        expect(onParseError).not.toHaveBeenCalled()
      })

      it('keeps long values when maxValueLength is higher', () => {
        const onParseError = vi.fn()

        const config = createTestConfig({
          format,
          maxValueLength: 500,
          onParseError
        })

        const { value } = serializeGrouped({ big: state.big }, config)
        expect(deserializeGrouped(value, format, config)).toEqual({
          big: state.big
        })
        expect(onParseError).not.toHaveBeenCalled()
      })
    })
  }
})

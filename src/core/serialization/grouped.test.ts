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
import type { FilterState, InternalConfig } from '../types.js'

// Mock AG Grid API
const mockGridApi = {
  setFilterModel: () => {},
  getFilterModel: () => ({}),
  onFilterChanged: () => {}
} as any

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

  describe('detectGroupedSerialization', () => {
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
      expect(getFormatSerializer('invalid' as any)).toBeNull()
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
  })
})

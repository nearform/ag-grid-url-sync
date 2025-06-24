import { describe, test, expect, vi } from 'vitest'
import { mergeConfig } from './utils.js'
import { createMockGridApi } from './test-helpers.js'

describe('Configuration Management', () => {
  describe('Business Logic Configuration', () => {
    test('validates and applies user configuration correctly', () => {
      const gridApi = createMockGridApi()

      // Test that business-critical settings are properly merged and validated
      const config = mergeConfig(gridApi, {
        prefix: 'custom_',
        limits: {
          valueLength: 300,
          urlLength: 3000
        },
        typeDetection: 'strict',
        compression: 'always'
      })

      // These affect user experience and URL generation
      expect(config.prefix).toBe('custom_')
      expect(config.limits.valueLength).toBe(300)
      expect(config.limits.urlLength).toBe(3000)
      expect(config.typeDetection).toBe('strict')
      expect(config.compression.strategy).toBe('always')
    })

    test('applies user configuration values as specified', () => {
      const gridApi = createMockGridApi()

      // Test that user configuration is applied as provided
      // (The library trusts users to provide reasonable values)
      const config = mergeConfig(gridApi, {
        limits: {
          valueLength: 500,
          urlLength: 4000,
          setValues: 25
        }
      })

      // User values should be preserved
      expect(config.limits.valueLength).toBe(500)
      expect(config.limits.urlLength).toBe(4000)
      expect(config.limits.setValues).toBe(25)
    })

    test('handles complex compression configuration scenarios', () => {
      const gridApi = createMockGridApi()

      // String shorthand
      const config1 = mergeConfig(gridApi, { compression: 'never' })
      expect(config1.compression.strategy).toBe('never')

      // Complex object configuration
      const config2 = mergeConfig(gridApi, {
        compression: {
          strategy: 'auto',
          threshold: 1500,
          algorithms: ['lz'],
          level: 9
        }
      })
      expect(config2.compression.strategy).toBe('auto')
      expect(config2.compression.threshold).toBe(1500)
      expect(config2.compression.algorithms).toEqual(['lz'])
    })
  })

  describe('Error Handling Configuration', () => {
    test('provides comprehensive error handling without breaking user flows', () => {
      const gridApi = createMockGridApi()

      // Test that error handlers are properly configured and can be called
      const errorHandlers = {
        parsing: vi.fn(),
        validation: vi.fn(),
        urlLength: vi.fn()
      }

      const config = mergeConfig(gridApi, {
        onError: errorHandlers
      })

      // Verify error handlers are set and callable
      expect(typeof config.onError.parsing).toBe('function')
      expect(typeof config.onError.validation).toBe('function')
      expect(typeof config.onError.urlLength).toBe('function')

      // Test that they can be invoked without breaking
      expect(() => {
        config.onError.parsing(new Error('test'), {
          url: 'test',
          parameter: 'test',
          value: 'test',
          columnName: 'test',
          operation: 'contains'
        })
        config.onError.validation(new Error('test'), {
          column: 'test',
          type: 'text',
          operation: 'contains',
          value: 'test'
        })
        config.onError.urlLength({
          originalLength: 5000,
          filterCount: 10,
          threshold: 2000
        })
      }).not.toThrow()
    })

    test('gracefully handles missing or invalid error handlers', () => {
      const gridApi = createMockGridApi()

      // Test with null/undefined error handlers
      const config = mergeConfig(gridApi, {
        onError: {
          parsing: null as any,
          validation: undefined as any
        }
      })

      // Should provide safe default handlers
      expect(typeof config.onError.parsing).toBe('function')
      expect(typeof config.onError.validation).toBe('function')

      // Default handlers should not throw
      expect(() => {
        config.onError.parsing(new Error('test'), {
          url: 'test',
          parameter: 'test',
          value: 'test',
          columnName: 'test',
          operation: 'contains'
        })
        config.onError.validation(new Error('test'), {
          column: 'test',
          type: 'text',
          operation: 'contains',
          value: 'test'
        })
      }).not.toThrow()
    })
  })

  describe('Type Hints Business Logic', () => {
    test('applies type hints to improve filter detection accuracy', () => {
      const gridApi = createMockGridApi()

      const config = mergeConfig(gridApi, {
        typeHints: {
          numberColumns: ['price', 'score'],
          dateColumns: ['created_at'],
          setColumns: ['status']
        }
      })

      // Type hints should be preserved for business logic
      expect(config.typeHints.numberColumns).toContain('price')
      expect(config.typeHints.dateColumns).toContain('created_at')
      expect(config.typeHints.setColumns).toContain('status')
    })

    test('handles edge cases in type hint configuration', () => {
      const gridApi = createMockGridApi()

      // Empty arrays should be handled gracefully
      const config1 = mergeConfig(gridApi, {
        typeHints: {
          numberColumns: [],
          dateColumns: [],
          setColumns: []
        }
      })

      expect(Array.isArray(config1.typeHints.numberColumns)).toBe(true)
      expect(config1.typeHints.numberColumns).toHaveLength(0)

      // Missing typeHints should provide defaults
      const config2 = mergeConfig(gridApi, {})
      expect(Array.isArray(config2.typeHints.numberColumns)).toBe(true)
    })
  })
})

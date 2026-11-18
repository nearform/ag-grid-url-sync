import { describe, it, expect, vi } from 'vitest'
import { createGridUrlSync } from './grid-url-sync.js'
import { validateFilterValue } from './validation.js'
import { readUrlFilters } from './url-parser.js'
import type { ResolvedOptions } from './types.js'
import { InvalidFilterError, InvalidURLError } from './types.js'
import { asGridApi, createGridListeners } from '../test-helpers.js'

describe('Edge Cases', () => {
  const config: ResolvedOptions = {
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: vi.fn(),
    serialization: 'individual',
    format: 'querystring',
    groupedParam: 'grid_filters'
  }

  describe('Character Encoding', () => {
    it('should handle Unicode characters and special characters', () => {
      const url =
        'https://example.com?f_name_contains=caf%C3%A9%20%F0%9F%8E%89%20%E4%B8%AD%E6%96%87%E6%B5%8B%E8%AF%95'

      const result = readUrlFilters(url, config)
      expect(result.name?.filter).toBe('café 🎉 中文测试')
    })

    it('should reject values exceeding maxValueLength', () => {
      const longValue = 'a'.repeat(201)
      expect(() => validateFilterValue(longValue, config)).toThrow(
        InvalidFilterError
      )
    })
  })

  describe('URL Parsing', () => {
    it('should handle malformed URLs', () => {
      expect(() => readUrlFilters('http://', config)).toThrow(InvalidURLError)
    })

    it('should handle mixed valid and invalid parameters', () => {
      const mockConfig = { ...config, onParseError: vi.fn() }

      const url =
        'https://example.com?f_name_contains=valid&f_invalid_param=skip&other=ignore'

      const result = readUrlFilters(url, mockConfig)
      expect(result.name?.filter).toBe('valid')
      expect(result.invalid_param).toBeUndefined()
      expect(mockConfig.onParseError).toHaveBeenCalled()
    })
  })

  describe('Grid Integration', () => {
    it('should handle grid API errors gracefully', () => {
      const mockGridApi = asGridApi({
        ...createGridListeners(),
        getFilterModel: vi.fn().mockImplementation(() => {
          throw new Error('Grid API Error')
        }),
        setFilterModel: vi.fn().mockImplementation(() => {
          throw new Error('Grid API Error')
        })
      })

      const urlSync = createGridUrlSync({ api: mockGridApi })
      expect(() => urlSync.getUrl()).not.toThrow()
      expect(() => urlSync.applyFilters({})).not.toThrow()

      urlSync.destroy()
    })
  })
})

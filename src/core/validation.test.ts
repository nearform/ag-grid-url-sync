import { describe, it, expect } from 'vitest'
import {
  validateFilterValue,
  validateNumberFilter,
  validateAndParseNumber,
  validateAndParseDate,
  validateNumberRange,
  validateDateFilter,
  validateDateRange,
  DEFAULT_CONFIG
} from './validation.js'
import { InvalidFilterError, InvalidDateError } from './types.js'
import type { InternalConfig } from './types.js'

describe('Validation Functions', () => {
  describe('validateFilterValue', () => {
    const mockConfig: InternalConfig = {
      ...DEFAULT_CONFIG,
      gridApi: {} as InternalConfig['gridApi'],
      paramPrefix: 'f_',
      maxValueLength: 10,
      onParseError: () => {}
    }

    it('should return value for valid inputs', () => {
      expect(validateFilterValue('hello', mockConfig)).toBe('hello')
      expect(validateFilterValue('a'.repeat(10), mockConfig)).toBe(
        'a'.repeat(10)
      )
    })

    it('should return empty string for blank operations', () => {
      expect(validateFilterValue('any-value', mockConfig, 'blank')).toBe('')
      expect(validateFilterValue('any-value', mockConfig, 'notBlank')).toBe('')
    })

    it('should throw for values exceeding maxValueLength', () => {
      const longValue = 'a'.repeat(11)
      expect(() => validateFilterValue(longValue, mockConfig)).toThrow(
        InvalidFilterError
      )
    })

    it('should handle special characters and unicode', () => {
      const specialChars = '!@#$%^&*()'
      const unicode = '你好世界 😀'
      expect(validateFilterValue(specialChars, mockConfig)).toBe(specialChars)
      expect(validateFilterValue(unicode, mockConfig)).toBe(unicode)
    })
  })

  describe('validateNumberFilter', () => {
    it('should validate finite numbers', () => {
      expect(validateNumberFilter(42)).toEqual({ valid: true })
      expect(validateNumberFilter(-3.14)).toEqual({ valid: true })
      expect(validateNumberFilter(0)).toEqual({ valid: true })
    })

    it('should reject non-finite numbers', () => {
      expect(validateNumberFilter(NaN)).toEqual({
        valid: false,
        error: 'Filter value must be a finite number'
      })
      expect(validateNumberFilter(Infinity)).toEqual({
        valid: false,
        error: 'Filter value must be a finite number'
      })
    })

    it('should reject numbers exceeding safe integer range', () => {
      const tooBig = Number.MAX_SAFE_INTEGER + 1
      expect(validateNumberFilter(tooBig)).toEqual({
        valid: false,
        error: 'Number value exceeds safe integer range'
      })
    })
  })

  describe('validateNumberRange', () => {
    it('should validate valid number ranges', () => {
      expect(validateNumberRange(1, 10)).toEqual({ valid: true })
      expect(validateNumberRange(0, 0)).toEqual({ valid: true })
      expect(validateNumberRange(-5, 5)).toEqual({ valid: true })
    })

    it('should reject invalid min values', () => {
      expect(validateNumberRange(NaN, 10)).toEqual({
        valid: false,
        error: 'Filter value must be a finite number'
      })
    })

    it('should reject when min > max', () => {
      expect(validateNumberRange(10, 5)).toEqual({
        valid: false,
        error: 'Range minimum must be less than or equal to maximum'
      })
    })
  })

  describe('validateAndParseNumber', () => {
    it('should parse valid number strings', () => {
      expect(validateAndParseNumber('42')).toBe(42)
      expect(validateAndParseNumber('-3.14')).toBe(-3.14)
      expect(validateAndParseNumber('1e3')).toBe(1000)
      expect(validateAndParseNumber(' 42 ')).toBe(42)
    })

    it('should reject invalid number strings', () => {
      expect(() => validateAndParseNumber('')).toThrow(
        'Number filter value cannot be empty'
      )
      expect(() => validateAndParseNumber('abc')).toThrow(
        'Invalid number format: abc'
      )
      expect(() => validateAndParseNumber('42abc')).toThrow(
        'Invalid number format: 42abc'
      )
    })
  })

  describe('validateAndParseDate', () => {
    it('should validate correct date formats', () => {
      expect(validateAndParseDate('2024-01-15')).toBe('2024-01-15')
      expect(validateAndParseDate('2024-12-31')).toBe('2024-12-31')
      expect(validateAndParseDate('2024-02-29')).toBe('2024-02-29') // Leap year
    })

    it('should reject invalid date formats', () => {
      expect(() => validateAndParseDate('')).toThrow(InvalidDateError)
      expect(() => validateAndParseDate('not-a-date')).toThrow(InvalidDateError)
      expect(() => validateAndParseDate('2024-13-01')).toThrow(InvalidDateError)
      expect(() => validateAndParseDate('2023-02-29')).toThrow(InvalidDateError) // Not leap year
    })
  })

  describe('validateDateFilter', () => {
    it('should validate blank operations without date validation', () => {
      expect(validateDateFilter('', 'blank')).toEqual({ valid: true })
      expect(validateDateFilter('invalid-date', 'notBlank')).toEqual({
        valid: true
      })
    })

    it('should validate valid dates for date operations', () => {
      expect(validateDateFilter('2024-01-15', 'eq')).toEqual({ valid: true })
      expect(validateDateFilter('2024-12-31', 'dateBefore')).toEqual({
        valid: true
      })
    })

    it('should reject invalid dates for date operations', () => {
      const result = validateDateFilter('invalid-date', 'eq')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid date format')
    })
  })

  describe('validateDateRange', () => {
    it('should validate valid date ranges', () => {
      expect(validateDateRange('2024-01-01', '2024-12-31')).toEqual({
        valid: true
      })
      expect(validateDateRange('2024-06-15', '2024-06-15')).toEqual({
        valid: true
      })
    })

    it('should reject ranges where start > end', () => {
      const result = validateDateRange('2024-12-31', '2024-01-01')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('start date')
    })
  })
})

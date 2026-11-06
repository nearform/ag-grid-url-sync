import { describe, it, expect } from 'vitest'
import {
  validateFilterValue,
  validateNumberFilter,
  validateAndParseNumber,
  readNumber,
  validateAndParseDate,
  validateNumberRange,
  validateDateFilter,
  validateDateRange,
  DEFAULT_CONFIG
} from './validation.js'
import { InvalidFilterError, InvalidDateError } from './types.js'
import type { ResolvedOptions } from './types.js'

describe('Validation Functions', () => {
  describe('validateFilterValue', () => {
    const mockConfig: ResolvedOptions = {
      ...DEFAULT_CONFIG,
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

    // #238: the URL keeps every finite number exactly, so there is no
    // safe-integer limit
    it('should accept finite numbers outside the safe integer range', () => {
      for (const n of [
        Number.MAX_SAFE_INTEGER + 1,
        -Number.MAX_SAFE_INTEGER - 1,
        1e21,
        Number.MAX_VALUE,
        Number.MIN_VALUE
      ]) {
        expect(validateNumberFilter(n)).toEqual({ valid: true })
      }
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

    it('should reject a number that would be rounded (#238)', () => {
      expect(() => validateAndParseNumber('12345678901234567890')).toThrow(
        'Number value 12345678901234567890 would be rounded to 12345678901234567000'
      )
    })

    // URLSearchParams reads a raw `+` as a space. In a number-only operation
    // the space can only be an exponent sign.
    it.each([
      ['1e 21', 1e21],
      ['1.5E 21', 1.5e21],
      ['1.e 5', 1e5]
    ])('should read %s as %s (#238)', (value, expected) => {
      expect(validateAndParseNumber(value)).toBe(expected)
    })

    it('should give its own message for more than 100 significant digits', () => {
      // The exact value of the double 1e-22, 104 significant digits
      expect(() =>
        validateAndParseNumber(
          '0.00000000000000000000010000000000000000485967743265708723529783189783450120951502847720104849571498561999760568141937255859375'
        )
      ).toThrow('Number value has more than 100 significant digits')
    })

    it('should quote the trimmed value in every message', () => {
      expect(() => validateAndParseNumber(' 42abc ')).toThrow(
        'Invalid number format: 42abc'
      )
      expect(() => validateAndParseNumber(' 12345678901234567890 ')).toThrow(
        'Number value 12345678901234567890 would be rounded'
      )
    })
  })

  // A number is exact when the double that parseFloat gives, written with as
  // many significant digits as the text has, gives the text's digits back.
  // The form of the text does not matter (#238).
  describe('readNumber (#238)', () => {
    it.each([
      ['42', 42],
      ['-3.14', -3.14],
      [' 42 ', 42],
      ['1.50', 1.5],
      ['007', 7],
      ['.5', 0.5],
      ['1e3', 1000],
      ['0', 0],
      ['0.000', 0],
      ['9007199254740992', 2 ** 53],
      ['+9007199254740992', 2 ** 53],
      ['9007199254740992.0', 2 ** 53],
      ['1e21', 1e21],
      ['1E+21', 1e21],
      ['1e+21', 1e21],
      ['1000000000000000000000', 1e21],
      ['0.1', 0.1],
      ['5e-324', 5e-324],
      // More digits than the shortest form, but the same double
      ['19.989999999999998', 19.99],
      ['0.10000000000000001', 0.1],
      ['0.1000000000000000055511151231257827021181583404541015625', 0.1],
      ['12345678901234567000', 12345678901234567000],
      // The double is exactly ...248.25, a tie at 17 digits: String(n)
      // writes .2 and toPrecision(17) writes .3
      ['2194262264886248.2', 2194262264886248.25],
      ['2194262264886248.3', 2194262264886248.25]
    ])('should parse %s as %s', (value, expected) => {
      expect(readNumber(value)).toBe(expected)
    })

    it.each([
      // Digits lost above the safe integer range
      '9007199254740993',
      '12345678901234567890',
      '-12345678901234567891',
      // Digits lost inside the safe range
      '0.12345678901234567891',
      '1234567890.12345678901234',
      '3.14159265358979323846',
      // At 17 digits, only the nearest text to the double is kept: these
      // also parse to 19.99, but 19.99 written with 17 digits is
      // 19.989999999999998
      '19.989999999999999',
      '19.989999999999997',
      // Rounded to the nearest subnormal
      '4e-324',
      // Too small or too large for a double
      '1e-400',
      '1e400',
      // Not a number
      '',
      'abc',
      '42abc',
      // The space for a raw `+` is read only in number-only operations
      '1e 21',
      '1 e21',
      '1e  21',
      '1 21'
    ])('should give an error for %s', value => {
      expect(readNumber(value)).toBeInstanceOf(InvalidFilterError)
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

      if (!result.valid) {
        expect(result.error).toContain('Invalid date format')
      }
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

      if (!result.valid) {
        expect(result.error).toContain('start date')
      }
    })
  })
})

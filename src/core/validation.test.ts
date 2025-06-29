import { describe, it, expect } from 'vitest'
import {
  validateFilterValue,
  validateNumberFilter,
  validateNumberRange,
  validateAndParseNumber,
  validateAndParseDate,
  validateDateFilter,
  validateDateRange,
  validateAndParseDateRange,
  DEFAULT_CONFIG
} from './validation.js'
import { InvalidFilterError, InvalidDateError } from './types.js'
import type {
  DateFilterOperation,
  InternalConfig,
  FilterOperation
} from './types.js'

describe('Validation Functions', () => {
  describe('validateFilterValue', () => {
    const mockConfig: InternalConfig = {
      ...DEFAULT_CONFIG,
      gridApi: {} as InternalConfig['gridApi'],
      paramPrefix: 'f_',
      maxValueLength: 10, // Small length for testing
      onParseError: () => {}
    }

    describe('Valid text values', () => {
      it('should return the same value for valid inputs', () => {
        expect(validateFilterValue('hello', mockConfig)).toBe('hello')
        expect(validateFilterValue('test123', mockConfig)).toBe('test123')
        expect(validateFilterValue('', mockConfig)).toBe('')
        expect(validateFilterValue('a'.repeat(10), mockConfig)).toBe(
          'a'.repeat(10)
        ) // Exactly at limit
      })

      it('should handle all filter operations without length validation for blank operations', () => {
        const longValue = 'a'.repeat(20) // Exceeds maxValueLength

        expect(validateFilterValue(longValue, mockConfig, 'blank')).toBe('')
        expect(validateFilterValue(longValue, mockConfig, 'notBlank')).toBe('')
        expect(validateFilterValue('any-value', mockConfig, 'blank')).toBe('')
        expect(validateFilterValue('any-value', mockConfig, 'notBlank')).toBe(
          ''
        )
      })

      it('should validate non-blank operations normally', () => {
        const shortValue = 'short'
        const operations: FilterOperation[] = [
          'eq',
          'notEqual',
          'contains',
          'notContains',
          'startsWith',
          'endsWith',
          'lessThan',
          'lessThanOrEqual',
          'greaterThan',
          'greaterThanOrEqual',
          'inRange',
          'dateBefore',
          'dateBeforeOrEqual',
          'dateAfter',
          'dateAfterOrEqual',
          'dateRange'
        ]

        operations.forEach(operation => {
          expect(validateFilterValue(shortValue, mockConfig, operation)).toBe(
            shortValue
          )
        })
      })
    })

    describe('Invalid text values', () => {
      it('should throw InvalidFilterError for values exceeding maxValueLength', () => {
        const longValue = 'a'.repeat(11) // Exceeds maxValueLength of 10

        expect(() => validateFilterValue(longValue, mockConfig)).toThrow(
          InvalidFilterError
        )
        expect(() => validateFilterValue(longValue, mockConfig)).toThrow(
          'Filter value exceeds maximum length of 10 characters'
        )
      })

      it('should throw for long values with non-blank operations', () => {
        const longValue = 'a'.repeat(15)

        expect(() =>
          validateFilterValue(longValue, mockConfig, 'contains')
        ).toThrow(InvalidFilterError)
        expect(() => validateFilterValue(longValue, mockConfig, 'eq')).toThrow(
          InvalidFilterError
        )
      })

      it('should use default config values when not specified', () => {
        const veryLongValue = 'a'.repeat(250) // Exceeds DEFAULT_CONFIG.maxValueLength (200)
        const defaultConfig: InternalConfig = {
          ...mockConfig,
          maxValueLength: DEFAULT_CONFIG.maxValueLength
        }

        expect(() => validateFilterValue(veryLongValue, defaultConfig)).toThrow(
          'Filter value exceeds maximum length of 200 characters'
        )
      })
    })

    describe('Edge cases', () => {
      it('should handle special characters and unicode', () => {
        const specialChars = '!@#$%^&*()'
        const unicode = '你好世界'
        const emoji = '😀😃😄😁'

        expect(validateFilterValue(specialChars, mockConfig)).toBe(specialChars)
        expect(validateFilterValue(unicode, mockConfig)).toBe(unicode)
        expect(validateFilterValue(emoji, mockConfig)).toBe(emoji)
      })

      it('should handle whitespace', () => {
        expect(validateFilterValue('  ', mockConfig)).toBe('  ')
        expect(validateFilterValue('\t\n', mockConfig)).toBe('\t\n')
        expect(validateFilterValue(' hello ', mockConfig)).toBe(' hello ')
      })
    })

    it('should return the value unchanged if within limits', () => {
      const result = validateFilterValue('test', mockConfig)
      expect(result).toBe('test')
    })

    it('should return empty string for blank operations', () => {
      expect(validateFilterValue('any-value', mockConfig, 'blank')).toBe('')
      expect(validateFilterValue('any-value', mockConfig, 'notBlank')).toBe('')
    })

    it('should throw InvalidFilterError if value exceeds maxValueLength', () => {
      const longValue = 'a'.repeat(201)
      expect(() => validateFilterValue(longValue, mockConfig)).toThrow(
        InvalidFilterError
      )
    })

    it('should respect custom maxValueLength', () => {
      const customConfig: InternalConfig = {
        ...mockConfig,
        maxValueLength: 10
      }
      const longValue = 'a'.repeat(11)
      expect(() => validateFilterValue(longValue, customConfig)).toThrow(
        InvalidFilterError
      )
    })
  })

  describe('validateNumberFilter', () => {
    describe('Valid numbers', () => {
      it('should validate finite numbers', () => {
        expect(validateNumberFilter(0)).toEqual({ valid: true })
        expect(validateNumberFilter(42)).toEqual({ valid: true })
        expect(validateNumberFilter(-42)).toEqual({ valid: true })
        expect(validateNumberFilter(3.14159)).toEqual({ valid: true })
        expect(validateNumberFilter(-3.14159)).toEqual({ valid: true })
      })

      it('should validate numbers at safe integer boundaries', () => {
        expect(validateNumberFilter(Number.MAX_SAFE_INTEGER)).toEqual({
          valid: true
        })
        expect(validateNumberFilter(-Number.MAX_SAFE_INTEGER)).toEqual({
          valid: true
        })
        expect(validateNumberFilter(Number.MIN_SAFE_INTEGER)).toEqual({
          valid: true
        })
      })

      it('should validate very small numbers', () => {
        expect(validateNumberFilter(Number.MIN_VALUE)).toEqual({ valid: true })
        expect(validateNumberFilter(-Number.MIN_VALUE)).toEqual({ valid: true })
        expect(validateNumberFilter(1e-10)).toEqual({ valid: true })
      })
    })

    describe('Invalid numbers', () => {
      it('should reject non-finite numbers', () => {
        expect(validateNumberFilter(NaN)).toEqual({
          valid: false,
          error: 'Filter value must be a finite number'
        })
        expect(validateNumberFilter(Infinity)).toEqual({
          valid: false,
          error: 'Filter value must be a finite number'
        })
        expect(validateNumberFilter(-Infinity)).toEqual({
          valid: false,
          error: 'Filter value must be a finite number'
        })
      })

      it('should reject numbers exceeding safe integer range', () => {
        const tooBig = Number.MAX_SAFE_INTEGER + 1
        const tooSmall = -Number.MAX_SAFE_INTEGER - 1

        expect(validateNumberFilter(tooBig)).toEqual({
          valid: false,
          error: 'Number value exceeds safe integer range'
        })
        expect(validateNumberFilter(tooSmall)).toEqual({
          valid: false,
          error: 'Number value exceeds safe integer range'
        })
      })
    })
  })

  describe('validateNumberRange', () => {
    describe('Valid ranges', () => {
      it('should validate ranges where min equals max', () => {
        expect(validateNumberRange(5, 5)).toEqual({ valid: true })
        expect(validateNumberRange(0, 0)).toEqual({ valid: true })
        expect(validateNumberRange(-10, -10)).toEqual({ valid: true })
      })

      it('should validate ranges where min < max', () => {
        expect(validateNumberRange(1, 10)).toEqual({ valid: true })
        expect(validateNumberRange(-10, 10)).toEqual({ valid: true })
        expect(validateNumberRange(0, 100)).toEqual({ valid: true })
        expect(validateNumberRange(-100, -50)).toEqual({ valid: true })
      })

      it('should validate decimal ranges', () => {
        expect(validateNumberRange(1.5, 2.5)).toEqual({ valid: true })
        expect(validateNumberRange(-3.14, 3.14)).toEqual({ valid: true })
        expect(validateNumberRange(0.001, 0.999)).toEqual({ valid: true })
      })
    })

    describe('Invalid ranges', () => {
      it('should reject ranges where min > max', () => {
        expect(validateNumberRange(10, 5)).toEqual({
          valid: false,
          error: 'Range minimum must be less than or equal to maximum'
        })
        expect(validateNumberRange(0, -1)).toEqual({
          valid: false,
          error: 'Range minimum must be less than or equal to maximum'
        })
        expect(validateNumberRange(100, 50)).toEqual({
          valid: false,
          error: 'Range minimum must be less than or equal to maximum'
        })
      })

      it('should reject ranges with invalid min value', () => {
        expect(validateNumberRange(NaN, 10)).toEqual({
          valid: false,
          error: 'Filter value must be a finite number'
        })
        expect(validateNumberRange(Infinity, 10)).toEqual({
          valid: false,
          error: 'Filter value must be a finite number'
        })
        expect(validateNumberRange(Number.MAX_SAFE_INTEGER + 1, 10)).toEqual({
          valid: false,
          error: 'Number value exceeds safe integer range'
        })
      })

      it('should reject ranges with invalid max value', () => {
        expect(validateNumberRange(5, NaN)).toEqual({
          valid: false,
          error: 'Filter value must be a finite number'
        })
        expect(validateNumberRange(5, -Infinity)).toEqual({
          valid: false,
          error: 'Filter value must be a finite number'
        })
        expect(validateNumberRange(5, Number.MAX_SAFE_INTEGER + 1)).toEqual({
          valid: false,
          error: 'Number value exceeds safe integer range'
        })
      })

      it('should reject ranges with both values invalid', () => {
        expect(validateNumberRange(NaN, Infinity)).toEqual({
          valid: false,
          error: 'Filter value must be a finite number'
        })
      })
    })
  })

  describe('validateAndParseNumber', () => {
    describe('Valid number strings', () => {
      it('should parse integer strings', () => {
        expect(validateAndParseNumber('42')).toBe(42)
        expect(validateAndParseNumber('-42')).toBe(-42)
        expect(validateAndParseNumber('0')).toBe(0)
        expect(validateAndParseNumber('1000')).toBe(1000)
      })

      it('should parse decimal strings', () => {
        expect(validateAndParseNumber('3.14159')).toBe(3.14159)
        expect(validateAndParseNumber('-2.718')).toBe(-2.718)
        expect(validateAndParseNumber('0.001')).toBe(0.001)
        expect(validateAndParseNumber('.5')).toBe(0.5)
      })

      it('should parse scientific notation', () => {
        expect(validateAndParseNumber('1e3')).toBe(1000)
        expect(validateAndParseNumber('1.5e2')).toBe(150)
        expect(validateAndParseNumber('2e-3')).toBe(0.002)
        expect(validateAndParseNumber('-1e3')).toBe(-1000)
      })

      it('should handle numbers with leading/trailing whitespace', () => {
        expect(validateAndParseNumber(' 42 ')).toBe(42)
        expect(validateAndParseNumber('\t-3.14\n')).toBe(-3.14)
        expect(validateAndParseNumber('  0  ')).toBe(0)
      })

      it('should parse numbers at safe integer boundaries', () => {
        const maxSafeInt = Number.MAX_SAFE_INTEGER.toString()
        const minSafeInt = Number.MIN_SAFE_INTEGER.toString()

        expect(validateAndParseNumber(maxSafeInt)).toBe(Number.MAX_SAFE_INTEGER)
        expect(validateAndParseNumber(minSafeInt)).toBe(Number.MIN_SAFE_INTEGER)
      })
    })

    describe('Invalid number strings', () => {
      it('should reject empty or whitespace-only strings', () => {
        expect(() => validateAndParseNumber('')).toThrow(
          'Number filter value cannot be empty'
        )
        expect(() => validateAndParseNumber('   ')).toThrow(
          'Number filter value cannot be empty'
        )
        expect(() => validateAndParseNumber('\t\n')).toThrow(
          'Number filter value cannot be empty'
        )
      })

      it('should reject non-numeric strings', () => {
        expect(() => validateAndParseNumber('abc')).toThrow(
          'Invalid number format: abc'
        )
        expect(() => validateAndParseNumber('hello')).toThrow(
          'Invalid number format: hello'
        )
        expect(() => validateAndParseNumber('42abc')).toThrow(
          'Invalid number format: 42abc'
        )
        expect(() => validateAndParseNumber('12.34.56')).toThrow(
          'Invalid number format: 12.34.56'
        )
      })

      it('should reject special number strings that parse to non-finite values', () => {
        // Note: Our regex now rejects these as invalid format before parsing
        expect(() => validateAndParseNumber('NaN')).toThrow(
          'Invalid number format: NaN'
        )
        expect(() => validateAndParseNumber('Infinity')).toThrow(
          'Invalid number format: Infinity'
        )
        expect(() => validateAndParseNumber('-Infinity')).toThrow(
          'Invalid number format: -Infinity'
        )
      })

      it('should reject numbers exceeding safe integer range', () => {
        const tooBigStr = (Number.MAX_SAFE_INTEGER + 1).toString()
        const tooSmallStr = (-Number.MAX_SAFE_INTEGER - 1).toString()

        expect(() => validateAndParseNumber(tooBigStr)).toThrow(
          'Number value exceeds safe integer range'
        )
        expect(() => validateAndParseNumber(tooSmallStr)).toThrow(
          'Number value exceeds safe integer range'
        )
      })

      it('should reject mixed text and numbers', () => {
        expect(() => validateAndParseNumber('$100')).toThrow(
          'Invalid number format: $100'
        )
        expect(() => validateAndParseNumber('100%')).toThrow(
          'Invalid number format: 100%'
        )
        expect(() => validateAndParseNumber('1,000')).toThrow(
          'Invalid number format: 1,000'
        )
      })
    })

    describe('Edge cases', () => {
      it('should handle very small numbers', () => {
        expect(validateAndParseNumber('1e-10')).toBe(1e-10)
        expect(validateAndParseNumber(Number.MIN_VALUE.toString())).toBe(
          Number.MIN_VALUE
        )
      })

      it('should handle hex, octal, and binary representations as invalid', () => {
        // parseFloat doesn't handle these formats, so they should be invalid
        expect(() => validateAndParseNumber('0x42')).toThrow(
          'Invalid number format: 0x42'
        )
        expect(() => validateAndParseNumber('0o777')).toThrow(
          'Invalid number format: 0o777'
        )
        expect(() => validateAndParseNumber('0b1010')).toThrow(
          'Invalid number format: 0b1010'
        )
      })

      it('should handle numbers with explicit positive sign', () => {
        expect(validateAndParseNumber('+42')).toBe(42)
        expect(validateAndParseNumber('+3.14')).toBe(3.14)
        expect(validateAndParseNumber('+1e3')).toBe(1000)
      })
    })
  })

  describe('Date Validation', () => {
    describe('validateAndParseDate', () => {
      describe('Valid dates', () => {
        it('should validate standard ISO dates', () => {
          expect(validateAndParseDate('2024-01-15')).toBe('2024-01-15')
          expect(validateAndParseDate('2023-12-31')).toBe('2023-12-31')
          expect(validateAndParseDate('2024-02-29')).toBe('2024-02-29') // Leap year
          expect(validateAndParseDate('1970-01-01')).toBe('1970-01-01')
        })

        it('should handle dates with whitespace', () => {
          expect(validateAndParseDate(' 2024-01-15 ')).toBe('2024-01-15')
          expect(validateAndParseDate('\t2023-12-31\n')).toBe('2023-12-31')
        })

        it('should validate leap year dates correctly', () => {
          // Valid leap years
          expect(validateAndParseDate('2024-02-29')).toBe('2024-02-29') // Divisible by 4
          expect(validateAndParseDate('2000-02-29')).toBe('2000-02-29') // Divisible by 400

          // Century years (divisible by 100 but not 400 are not leap years)
          expect(() => validateAndParseDate('1900-02-29')).toThrow(
            InvalidDateError
          )
          expect(() => validateAndParseDate('2100-02-29')).toThrow(
            InvalidDateError
          )
        })

        it('should validate month boundaries correctly', () => {
          // 31-day months
          expect(validateAndParseDate('2024-01-31')).toBe('2024-01-31')
          expect(validateAndParseDate('2024-03-31')).toBe('2024-03-31')
          expect(validateAndParseDate('2024-05-31')).toBe('2024-05-31')
          expect(validateAndParseDate('2024-07-31')).toBe('2024-07-31')
          expect(validateAndParseDate('2024-08-31')).toBe('2024-08-31')
          expect(validateAndParseDate('2024-10-31')).toBe('2024-10-31')
          expect(validateAndParseDate('2024-12-31')).toBe('2024-12-31')

          // 30-day months
          expect(validateAndParseDate('2024-04-30')).toBe('2024-04-30')
          expect(validateAndParseDate('2024-06-30')).toBe('2024-06-30')
          expect(validateAndParseDate('2024-09-30')).toBe('2024-09-30')
          expect(validateAndParseDate('2024-11-30')).toBe('2024-11-30')

          // February (non-leap year)
          expect(validateAndParseDate('2023-02-28')).toBe('2023-02-28')
        })
      })

      describe('Invalid date formats', () => {
        it('should reject empty or whitespace-only values', () => {
          expect(() => validateAndParseDate('')).toThrow(
            'Date filter value cannot be empty'
          )
          expect(() => validateAndParseDate('   ')).toThrow(
            'Date filter value cannot be empty'
          )
          expect(() => validateAndParseDate('\t\n')).toThrow(
            'Date filter value cannot be empty'
          )
        })

        it('should reject non-ISO formats', () => {
          const invalidFormats = [
            '01/15/2024', // US format
            '15/01/2024', // European format
            '15-01-2024', // European dash format
            '2024/01/15', // Year first with slashes
            'Jan 15, 2024', // Text format
            '2024-1-15', // Single digit month
            '2024-01-5', // Single digit day
            '24-01-15', // Two digit year
            '2024-01', // Missing day
            '2024', // Year only
            '01-15' // Missing year
          ]

          invalidFormats.forEach(format => {
            expect(() => validateAndParseDate(format)).toThrow(
              new RegExp(`Invalid date format.*Expected ISO format YYYY-MM-DD`)
            )
          })
        })

        it('should reject invalid date characters', () => {
          expect(() => validateAndParseDate('2024-ab-15')).toThrow()
          expect(() => validateAndParseDate('abcd-01-15')).toThrow()
          expect(() => validateAndParseDate('2024-01-cd')).toThrow()
          expect(() => validateAndParseDate('2024-01-15T10:30')).toThrow() // With time
          expect(() => validateAndParseDate('2024-01-15Z')).toThrow() // With timezone
        })
      })

      describe('Invalid calendar dates', () => {
        it('should reject impossible dates', () => {
          // Invalid months
          expect(() => validateAndParseDate('2024-00-15')).toThrow(
            'Date does not exist'
          )
          expect(() => validateAndParseDate('2024-13-15')).toThrow(
            'Date does not exist'
          )

          // Invalid days
          expect(() => validateAndParseDate('2024-01-00')).toThrow(
            'Date does not exist'
          )
          expect(() => validateAndParseDate('2024-01-32')).toThrow(
            'Date does not exist'
          )

          // February 30th - our validation catches these with more specific messages
          expect(() => validateAndParseDate('2024-02-30')).toThrow(
            InvalidDateError
          )
          expect(() => validateAndParseDate('2023-02-29')).toThrow(
            InvalidDateError
          ) // Non-leap year

          // April 31st (30-day month)
          expect(() => validateAndParseDate('2024-04-31')).toThrow(
            InvalidDateError
          )
          expect(() => validateAndParseDate('2024-06-31')).toThrow(
            InvalidDateError
          )
        })

        it('should validate date component consistency', () => {
          // These test the additional validation that catches edge cases
          // where Date constructor might parse differently than expected
          expect(() => validateAndParseDate('2024-02-30')).toThrow(
            InvalidDateError
          )
          expect(() => validateAndParseDate('2024-04-31')).toThrow(
            InvalidDateError
          )
          expect(() => validateAndParseDate('2024-13-01')).toThrow(
            InvalidDateError
          )
        })
      })
    })

    describe('validateDateFilter', () => {
      const dateOperations: DateFilterOperation[] = [
        'eq',
        'notEqual',
        'dateBefore',
        'dateBeforeOrEqual',
        'dateAfter',
        'dateAfterOrEqual',
        'dateRange'
      ]

      describe('Valid date filters', () => {
        dateOperations.forEach(operation => {
          if (operation !== 'dateRange') {
            // dateRange is tested separately
            it(`should validate ${operation} operation with valid date`, () => {
              const result = validateDateFilter('2024-01-15', operation)
              expect(result.valid).toBe(true)
              expect(result.error).toBeUndefined()
            })
          }
        })

        it('should handle blank operations without date validation', () => {
          expect(validateDateFilter('', 'blank')).toEqual({ valid: true })
          expect(validateDateFilter('invalid-date', 'blank')).toEqual({
            valid: true
          })
          expect(validateDateFilter('', 'notBlank')).toEqual({ valid: true })
          expect(validateDateFilter('invalid-date', 'notBlank')).toEqual({
            valid: true
          })
        })
      })

      describe('Invalid date filters', () => {
        dateOperations.forEach(operation => {
          if (
            operation !== 'blank' &&
            operation !== 'notBlank' &&
            operation !== 'dateRange'
          ) {
            it(`should reject ${operation} operation with invalid date`, () => {
              const result = validateDateFilter('invalid-date', operation)
              expect(result.valid).toBe(false)
              expect(result.error).toContain('Invalid date format')
            })

            it(`should reject ${operation} operation with empty date`, () => {
              const result = validateDateFilter('', operation)
              expect(result.valid).toBe(false)
              expect(result.error).toContain(
                'Date filter value cannot be empty'
              )
            })
          }
        })
      })
    })

    describe('validateDateRange', () => {
      describe('Valid date ranges', () => {
        it('should validate ranges where start equals end', () => {
          const result = validateDateRange('2024-01-15', '2024-01-15')
          expect(result.valid).toBe(true)
        })

        it('should validate ranges where start is before end', () => {
          expect(validateDateRange('2024-01-01', '2024-12-31')).toEqual({
            valid: true
          })
          expect(validateDateRange('2023-12-31', '2024-01-01')).toEqual({
            valid: true
          })
          expect(validateDateRange('2024-02-28', '2024-02-29')).toEqual({
            valid: true
          }) // Leap year
        })

        it('should validate same-month ranges', () => {
          expect(validateDateRange('2024-01-01', '2024-01-31')).toEqual({
            valid: true
          })
          expect(validateDateRange('2024-02-01', '2024-02-28')).toEqual({
            valid: true
          })
        })
      })

      describe('Invalid date ranges', () => {
        it('should reject ranges where start is after end', () => {
          const result = validateDateRange('2024-12-31', '2024-01-01')
          expect(result.valid).toBe(false)
          expect(result.error).toContain('start date')
          expect(result.error).toContain('must be before or equal to end date')
        })

        it('should reject ranges with invalid start date', () => {
          const result = validateDateRange('invalid-date', '2024-12-31')
          expect(result.valid).toBe(false)
          expect(result.error).toContain('Invalid date format')
        })

        it('should reject ranges with invalid end date', () => {
          const result = validateDateRange('2024-01-01', 'invalid-date')
          expect(result.valid).toBe(false)
          expect(result.error).toContain('Invalid date format')
        })

        it('should reject ranges with both dates invalid', () => {
          const result = validateDateRange('invalid-start', 'invalid-end')
          expect(result.valid).toBe(false)
          expect(result.error).toContain('Invalid date format')
        })
      })
    })

    describe('validateAndParseDateRange', () => {
      describe('Valid date ranges', () => {
        it('should parse valid comma-separated date ranges', () => {
          expect(validateAndParseDateRange('2024-01-01,2024-12-31')).toEqual([
            '2024-01-01',
            '2024-12-31'
          ])

          expect(validateAndParseDateRange('2024-01-15,2024-01-15')).toEqual([
            '2024-01-15',
            '2024-01-15'
          ])
        })

        it('should handle whitespace around dates', () => {
          expect(
            validateAndParseDateRange(' 2024-01-01 , 2024-12-31 ')
          ).toEqual(['2024-01-01', '2024-12-31'])

          expect(
            validateAndParseDateRange('2024-01-01,\t2024-12-31\n')
          ).toEqual(['2024-01-01', '2024-12-31'])
        })

        it('should validate leap year ranges', () => {
          expect(validateAndParseDateRange('2024-02-28,2024-02-29')).toEqual([
            '2024-02-28',
            '2024-02-29'
          ])
        })
      })

      describe('Invalid date ranges', () => {
        it('should reject empty range value', () => {
          expect(() => validateAndParseDateRange('')).toThrow(
            'Date range value cannot be empty'
          )
          expect(() => validateAndParseDateRange('   ')).toThrow(
            'Date range value cannot be empty'
          )
        })

        it('should reject single date (no comma)', () => {
          expect(() => validateAndParseDateRange('2024-01-15')).toThrow(
            'Date range must contain exactly two dates separated by comma'
          )
        })

        it('should reject too many dates', () => {
          expect(() =>
            validateAndParseDateRange('2024-01-01,2024-06-15,2024-12-31')
          ).toThrow(
            'Date range must contain exactly two dates separated by comma'
          )
        })

        it('should reject invalid start date', () => {
          expect(() =>
            validateAndParseDateRange('invalid-date,2024-12-31')
          ).toThrow(InvalidDateError)
        })

        it('should reject invalid end date', () => {
          expect(() =>
            validateAndParseDateRange('2024-01-01,invalid-date')
          ).toThrow(InvalidDateError)
        })

        it('should reject ranges where start > end', () => {
          expect(() =>
            validateAndParseDateRange('2024-12-31,2024-01-01')
          ).toThrow('Date range invalid')
        })

        it('should reject empty date parts', () => {
          expect(() => validateAndParseDateRange(',2024-12-31')).toThrow(
            'Date filter value cannot be empty'
          )

          expect(() => validateAndParseDateRange('2024-01-01,')).toThrow(
            'Date filter value cannot be empty'
          )

          expect(() => validateAndParseDateRange(',')).toThrow(
            'Date filter value cannot be empty'
          )
        })
      })
    })

    describe('Edge cases and boundary testing', () => {
      it('should handle year boundaries correctly', () => {
        expect(validateAndParseDate('1970-01-01')).toBe('1970-01-01') // Unix epoch
        expect(validateAndParseDate('2038-01-19')).toBe('2038-01-19') // Near 32-bit timestamp limit
        expect(validateAndParseDate('9999-12-31')).toBe('9999-12-31') // Far future
      })

      it('should handle all months with correct day counts', () => {
        const monthDays = [
          [1, 31],
          [2, 28],
          [3, 31],
          [4, 30],
          [5, 31],
          [6, 30],
          [7, 31],
          [8, 31],
          [9, 30],
          [10, 31],
          [11, 30],
          [12, 31]
        ]

        monthDays.forEach(([month, maxDay]) => {
          const monthStr = month.toString().padStart(2, '0')
          expect(
            validateAndParseDate(
              `2023-${monthStr}-${maxDay.toString().padStart(2, '0')}`
            )
          ).toBe(`2023-${monthStr}-${maxDay.toString().padStart(2, '0')}`)

          // Test invalid day for each month
          expect(() =>
            validateAndParseDate(
              `2023-${monthStr}-${(maxDay + 1).toString().padStart(2, '0')}`
            )
          ).toThrow(InvalidDateError)
        })
      })

      it('should validate leap year February correctly', () => {
        // Leap years: divisible by 4, except century years unless divisible by 400
        const leapYears = [2024, 2000, 1996, 2004]
        const nonLeapYears = [2023, 1900, 2100, 2022]

        leapYears.forEach(year => {
          expect(validateAndParseDate(`${year}-02-29`)).toBe(`${year}-02-29`)
        })

        nonLeapYears.forEach(year => {
          expect(() => validateAndParseDate(`${year}-02-29`)).toThrow(
            InvalidDateError
          )
        })
      })
    })
  })
})

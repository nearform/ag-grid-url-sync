import { describe, it, expect } from 'vitest'
import {
  validateAndParseDate,
  validateDateFilter,
  validateDateRange,
  validateAndParseDateRange
} from './validation.js'
import { InvalidDateError } from './types.js'
import type { DateFilterOperation } from './types.js'

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
            expect(result.error).toContain('Date filter value cannot be empty')
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
        expect(validateAndParseDateRange(' 2024-01-01 , 2024-12-31 ')).toEqual([
          '2024-01-01',
          '2024-12-31'
        ])

        expect(validateAndParseDateRange('2024-01-01,\t2024-12-31\n')).toEqual([
          '2024-01-01',
          '2024-12-31'
        ])
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

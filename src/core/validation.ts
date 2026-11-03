import * as v from 'valibot'
import type {
  ParseConfig,
  FilterOperation,
  DateFilterOperation,
  ColumnFilter
} from './types.js'
import { InvalidFilterError, InvalidDateError } from './types.js'
import { ColumnFilterSchema } from './schemas.js'

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  paramPrefix: 'f_',
  maxValueLength: 200,
  serialization: 'individual' as const,
  groupedParam: 'grid_filters',
  format: 'querystring' as const,
  onParseError: () => {}
} as const

/**
 * Validation result interface
 */
export type ValidationResult =
  | { valid: true }
  | {
      valid: false
      error: string
    }

/**
 * Validates a text filter value against configuration constraints
 *
 * @param value - The filter value to validate
 * @param config - Internal configuration with validation rules
 * @param operation - Optional filter operation type. Blank operations (blank/notBlank) bypass value validation
 * @returns The validated filter value (empty string for blank operations)
 * @throws InvalidFilterError if value exceeds maximum length
 */
export function validateFilterValue(
  value: string,
  config: ParseConfig,
  operation?: FilterOperation
): string {
  // Blank operations don't require value validation
  if (operation === 'blank' || operation === 'notBlank') {
    return ''
  }

  if (value.length > config.maxValueLength) {
    throw new InvalidFilterError(
      `Filter value exceeds maximum length of ${config.maxValueLength} characters`
    )
  }

  return value
}

/**
 * Validates a number filter value
 *
 * @param value - The number value to validate
 * @returns Validation result
 */
export function validateNumberFilter(value: number): ValidationResult {
  // Every finite number is valid. There is no safe-integer limit: String(n)
  // and parseFloat give back the same number, so a number that generateUrl
  // writes comes back exactly. A hand-written value that would lose digits
  // is rejected when it is parsed (see parseExactNumber, #238).
  if (!Number.isFinite(value)) {
    return { valid: false, error: 'Filter value must be a finite number' }
  }

  return { valid: true }
}

/**
 * Validates a number range filter
 *
 * @param min - The minimum value
 * @param max - The maximum value
 * @returns Validation result
 */
export function validateNumberRange(
  min: number,
  max: number
): ValidationResult {
  const minResult = validateNumberFilter(min)

  if (!minResult.valid) return minResult

  const maxResult = validateNumberFilter(max)

  if (!maxResult.valid) return maxResult

  if (min > max) {
    return {
      valid: false,
      error: 'Range minimum must be less than or equal to maximum'
    }
  }

  return { valid: true }
}

/**
 * A whole number in decimal or exponent form. The full match stops parseFloat
 * from taking a number at the start of the value ("42abc" would be 42).
 */
const NUMBER_FORMAT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

/**
 * A key for the value of a number in NUMBER_FORMAT, without its sign: the
 * significant digits (no leading or trailing zeros), then the position of the
 * decimal point after `e`. "1.50", "150e-2" and "0.0150e2" all give "15e1".
 * Zero gives "".
 */
function significantDigits(text: string): string {
  const [mantissa = '', exponent = '0'] = text.replace(/^[+-]/, '').split(/e/i)
  const [whole = '', fraction = ''] = mantissa.split('.')
  const allDigits = whole + fraction
  const leadingZeros = allDigits.length - allDigits.replace(/^0+/, '').length
  const digits = allDigits.slice(leadingZeros).replace(/0+$/, '')

  if (digits === '') return ''

  const point = whole.length - leadingZeros + Number(exponent)

  return `${digits}e${point}`
}

/**
 * Whether `number` has the same decimal digits as `text`, so the text loses
 * no digits when it is stored as a double. String(n) gives the shortest form
 * that reads back as n, so any other digits in the text are lost.
 */
const keepsDigits = (text: string, number: number): boolean =>
  significantDigits(text) === significantDigits(String(Math.abs(number)))

/**
 * Parses the value as a number only if the whole value is a number, and only
 * if no digit is lost. Returns null otherwise.
 *
 * The form does not matter: "1e21", "1E+21" and "1000000000000000000000" are
 * all 1e21, and "1.50" and "007" are 1.5 and 7. A value such as the ID
 * "12345678901234567890" would come back as 12345678901234567000, so it is
 * not a number here (#238).
 */
export function parseExactNumber(value: string): number | null {
  const text = value.trim()

  if (!NUMBER_FORMAT.test(text)) return null

  const number = parseFloat(text)

  return Number.isFinite(number) && keepsDigits(text, number) ? number : null
}

/**
 * Validates a parsed number from string input
 *
 * @param value - String representation of number
 * @returns Parsed number or throws InvalidFilterError
 */
export function validateAndParseNumber(value: string): number {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    throw new InvalidFilterError('Number filter value cannot be empty')
  }

  if (!NUMBER_FORMAT.test(trimmedValue)) {
    throw new InvalidFilterError(`Invalid number format: ${value}`)
  }

  const numValue = parseFloat(trimmedValue)

  const validation = validateNumberFilter(numValue)

  if (!validation.valid) {
    throw new InvalidFilterError(validation.error || 'Invalid number value')
  }

  // The same rule as parseExactNumber (#238)
  if (!keepsDigits(trimmedValue, numValue)) {
    throw new InvalidFilterError(`Number value loses digits: ${trimmedValue}`)
  }

  return numValue
}

/**
 * Validates and parses a date string in ISO format (YYYY-MM-DD)
 *
 * @param value - String representation of date in ISO format
 * @returns Validated ISO date string
 * @throws InvalidDateError if date format is invalid or date doesn't exist
 */
export function validateAndParseDate(value: string): string {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    throw new InvalidDateError('Date filter value cannot be empty')
  }

  // Validate ISO date format (YYYY-MM-DD)
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

  if (!isoDateRegex.test(trimmedValue)) {
    throw new InvalidDateError(
      `Invalid date format '${value}'. Expected ISO format YYYY-MM-DD (e.g., 2024-01-15)`
    )
  }

  // Validate that it's a real date by parsing
  const date = new Date(trimmedValue + 'T00:00:00.000Z') // Force UTC to avoid timezone issues

  if (isNaN(date.getTime())) {
    throw new InvalidDateError(
      `Invalid date '${value}'. Date does not exist in the calendar`
    )
  }

  // Additional validation: ensure the parsed date matches the input
  // This catches edge cases like February 30th that might parse differently
  const [year, month, day] = trimmedValue.split('-').map(Number)

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new InvalidDateError(
      `Invalid date '${value}'. Date components don't match calendar date`
    )
  }

  return trimmedValue
}

/**
 * Validates a date filter value
 *
 * @param value - The date value to validate
 * @param operation - The date filter operation
 * @returns Validation result
 */
export function validateDateFilter(
  value: string,
  operation: DateFilterOperation
): ValidationResult {
  // Blank operations don't require date validation
  if (operation === 'blank' || operation === 'notBlank') {
    return { valid: true }
  }

  try {
    validateAndParseDate(value)

    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid date'
    }
  }
}

/**
 * Validates a date range filter
 *
 * @param startDate - The start date (ISO format)
 * @param endDate - The end date (ISO format)
 * @returns Validation result
 */
export function validateDateRange(
  startDate: string,
  endDate: string
): ValidationResult {
  try {
    const validStartDate = validateAndParseDate(startDate)
    const validEndDate = validateAndParseDate(endDate)

    // Check that start date <= end date
    if (validStartDate > validEndDate) {
      return {
        valid: false,
        error: `Date range invalid: start date '${startDate}' must be before or equal to end date '${endDate}'`
      }
    }

    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid date range'
    }
  }
}

/**
 * Validates a date range from comma-separated string input
 *
 * @param rangeValue - Comma-separated date range (e.g., "2024-01-01,2024-12-31")
 * @returns Tuple of [startDate, endDate] or throws InvalidDateError
 */
export function validateAndParseDateRange(
  rangeValue: string
): [string, string] {
  const trimmedValue = rangeValue?.trim()

  if (!trimmedValue) {
    throw new InvalidDateError('Date range value cannot be empty')
  }

  const rangeParts = trimmedValue.split(',')

  if (rangeParts.length !== 2) {
    throw new InvalidDateError(
      'Date range must contain exactly two dates separated by comma (e.g., "2024-01-01,2024-12-31")'
    )
  }

  const startDate = validateAndParseDate(rangeParts[0]?.trim() ?? '')
  const endDate = validateAndParseDate(rangeParts[1]?.trim() ?? '')

  const rangeValidation = validateDateRange(startDate, endDate)

  if (!rangeValidation.valid) {
    throw new InvalidDateError(rangeValidation.error ?? 'Invalid date range')
  }

  return [startDate, endDate]
}

/**
 * Validates if an object is a valid column filter
 *
 * @param obj - The object to validate
 * @returns Type guard that narrows the type to ColumnFilter
 */
export function isValidColumnFilter(obj: unknown): obj is ColumnFilter {
  return v.is(ColumnFilterSchema, obj)
}

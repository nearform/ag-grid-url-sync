import * as v from 'valibot'
import type {
  AGGridUrlSyncConfig,
  FilterOperation,
  DateFilterOperation,
  ColumnFilter
} from './types.js'
import { InvalidFilterError, InvalidDateError } from './types.js'
import { ColumnFilterSchema } from './schemas.js'
import { resolveOptions } from './options.js'

// The defaults are in options.ts (#219). The `ag-grid-url-sync/validation`
// entry point still exports them.
export { DEFAULT_CONFIG } from './options.js'

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
 * @param config - Options with the validation rules. An option that is left
 *   out gets its default.
 * @param operation - Optional filter operation type. Blank operations (blank/notBlank) bypass value validation
 * @returns The validated filter value (empty string for blank operations)
 * @throws InvalidFilterError if value exceeds maximum length
 */
export function validateFilterValue(
  value: string,
  config: AGGridUrlSyncConfig = {},
  operation?: FilterOperation
): string {
  // Blank operations don't require value validation
  if (operation === 'blank' || operation === 'notBlank') {
    return ''
  }

  const { maxValueLength } = resolveOptions(config)

  if (value.length > maxValueLength) {
    throw new InvalidFilterError(
      `Filter value exceeds maximum length of ${maxValueLength} characters`,
      undefined,
      { code: 'VALUE_TOO_LONG' }
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
  // writes comes back exactly. Text that would be rounded is rejected by
  // readNumber, which reads URL params and string values from the grid (#238).
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
 * A space between the `e` and the exponent digits. URLSearchParams reads a
 * raw `+` as a space, so "1e+21" in a hand-typed URL arrives as "1e 21".
 * Only validateAndParseNumber reads it as a sign: in the eq type guess, a text
 * value such as "2E 5" must stay text.
 */
const EXPONENT_SPACE = /(?<=[\d.][eE]) (?=\d+$)/

/** The most significant digits that toPrecision writes */
const MAX_PRECISION = 100

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
 * Whether `number`, written with as many significant digits as `text` has,
 * gives the digits of `text` back. Then the text is the double at the text's
 * own precision: "19.989999999999998" is 19.99 written with 17 digits, so it
 * is kept. "12345678901234567890" comes back as "12345678901234567168", so it
 * would be rounded.
 *
 * String(n) is checked too. When the double lies exactly halfway between two
 * texts, String(n) and toPrecision can round to different ones, and the text
 * that generateUrl writes must always be kept.
 */
function keepsDigits(text: string, number: number): boolean {
  const key = significantDigits(text)
  const precision = Math.max(1, key.indexOf('e'))
  const magnitude = Math.abs(number)

  return (
    key === significantDigits(String(magnitude)) ||
    key === significantDigits(magnitude.toPrecision(precision))
  )
}

/** The details of each error that readNumber gives */
const NUMBER_ISSUE = { code: 'INVALID_NUMBER' } as const

/**
 * Reads the value as a number, or gives the error that says why it is not
 * one. The one rule for every number in a URL or a grid input (#238): the
 * whole value must be a number, it must be finite, and it must not be rounded
 * when it is stored as a double.
 *
 * The form does not matter: "1e21", "1E+21" and "1000000000000000000000" are
 * all 1e21, and "1.50" and "007" are 1.5 and 7.
 */
export function readNumber(value: string): number | InvalidFilterError {
  const text = value?.trim() ?? ''

  if (!text) {
    return new InvalidFilterError(
      'Number filter value cannot be empty',
      undefined,
      NUMBER_ISSUE
    )
  }

  if (!NUMBER_FORMAT.test(text)) {
    return new InvalidFilterError(
      `Invalid number format: ${text}`,
      undefined,
      NUMBER_ISSUE
    )
  }

  const number = parseFloat(text)
  const validation = validateNumberFilter(number)

  if (!validation.valid) {
    return new InvalidFilterError(
      validation.error || 'Invalid number value',
      undefined,
      NUMBER_ISSUE
    )
  }

  // toPrecision writes at most MAX_PRECISION digits, so a longer text cannot
  // be compared. Nothing is rounded: the text is too long to check.
  if (significantDigits(text).indexOf('e') > MAX_PRECISION) {
    return new InvalidFilterError(
      `Number value has more than ${MAX_PRECISION} significant digits: ${text}`,
      undefined,
      NUMBER_ISSUE
    )
  }

  if (!keepsDigits(text, number)) {
    return new InvalidFilterError(
      `Number value ${text} would be rounded to ${number}`,
      undefined,
      NUMBER_ISSUE
    )
  }

  return number
}

/**
 * The number in the value, or null when readNumber gives an error. The type
 * guess for shared operations uses this, so such a value stays text.
 */
export function parseExactNumber(value: string): number | null {
  const number = readNumber(value)

  return number instanceof InvalidFilterError ? null : number
}

/**
 * Validates a parsed number from string input
 *
 * @param value - String representation of number
 * @returns Parsed number or throws InvalidFilterError
 */
export function validateAndParseNumber(value: string): number {
  // A number-only operation has no text fallback, so a space here can only
  // be the exponent sign
  const number = readNumber((value?.trim() ?? '').replace(EXPONENT_SPACE, '+'))

  if (number instanceof InvalidFilterError) throw number

  return number
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

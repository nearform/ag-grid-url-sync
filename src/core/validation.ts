import type {
  InternalConfig,
  FilterOperation,
  DateFilterOperation
} from './types.js'
import { InvalidFilterError, InvalidDateError } from './types.js'

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  paramPrefix: 'f_',
  maxValueLength: 200
} as const

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean
  error?: string
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
  config: InternalConfig,
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
  // Basic number validation
  if (!Number.isFinite(value)) {
    return { valid: false, error: 'Filter value must be a finite number' }
  }

  // Range validation for precision
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    return { valid: false, error: 'Number value exceeds safe integer range' }
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
 * Validates a parsed number from string input
 *
 * @param value - String representation of number
 * @returns Parsed number or throws InvalidFilterError
 */
export function validateAndParseNumber(value: string): number {
  if (!value || value.trim() === '') {
    throw new InvalidFilterError('Number filter value cannot be empty')
  }

  const numValue = parseFloat(value)
  if (isNaN(numValue)) {
    throw new InvalidFilterError(`Invalid number format: ${value}`)
  }

  const validation = validateNumberFilter(numValue)
  if (!validation.valid) {
    throw new InvalidFilterError(validation.error || 'Invalid number value')
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
  if (!value || value.trim() === '') {
    throw new InvalidDateError('Date filter value cannot be empty')
  }

  const trimmedValue = value.trim()

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
  if (!rangeValue || rangeValue.trim() === '') {
    throw new InvalidDateError('Date range value cannot be empty')
  }

  const rangeParts = rangeValue.split(',')
  if (rangeParts.length !== 2) {
    throw new InvalidDateError(
      'Date range must contain exactly two dates separated by comma (e.g., "2024-01-01,2024-12-31")'
    )
  }

  const startDate = validateAndParseDate(rangeParts[0]?.trim() || '')
  const endDate = validateAndParseDate(rangeParts[1]?.trim() || '')

  const rangeValidation = validateDateRange(startDate, endDate)
  if (!rangeValidation.valid) {
    throw new InvalidDateError(rangeValidation.error || 'Invalid date range')
  }

  return [startDate, endDate]
}

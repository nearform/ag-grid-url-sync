import type {
  InternalConfig,
  FilterOperation,
  DateFilterOperation,
  ColumnFilter,
  TextFilterOperation,
  NumberFilterOperation
} from './types.js'
import {
  InvalidFilterError,
  InvalidDateError,
  TEXT_FILTER_OPERATIONS,
  NUMBER_FILTER_OPERATIONS,
  DATE_FILTER_OPERATIONS
} from './types.js'

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
  const trimmedValue = value?.trim()
  if (!trimmedValue) {
    throw new InvalidFilterError('Number filter value cannot be empty')
  }

  // Use a regex to validate proper number format before parsing
  // This prevents parseFloat from accepting partial numbers like "42abc" -> 42
  const numberRegex = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
  if (!numberRegex.test(trimmedValue)) {
    throw new InvalidFilterError(`Invalid number format: ${value}`)
  }

  const numValue = parseFloat(trimmedValue)
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
  if (!obj || typeof obj !== 'object') {
    return false
  }

  const filter = obj as any

  // Check for required properties
  if (
    !filter.filterType ||
    !filter.type ||
    typeof filter.filterType !== 'string' ||
    typeof filter.type !== 'string'
  ) {
    return false
  }

  // Validate based on filter type
  if (filter.filterType === 'text') {
    return (
      typeof filter.filter === 'string' &&
      TEXT_FILTER_OPERATIONS.includes(filter.type as TextFilterOperation)
    )
  }

  if (filter.filterType === 'number') {
    return (
      typeof filter.filter === 'number' &&
      NUMBER_FILTER_OPERATIONS.includes(filter.type as NumberFilterOperation) &&
      (filter.filterTo === undefined || typeof filter.filterTo === 'number')
    )
  }

  if (filter.filterType === 'date') {
    return (
      typeof filter.filter === 'string' &&
      DATE_FILTER_OPERATIONS.includes(filter.type as DateFilterOperation) &&
      (filter.filterTo === undefined || typeof filter.filterTo === 'string')
    )
  }

  return false
}

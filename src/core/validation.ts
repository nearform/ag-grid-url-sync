import type { InternalConfig, FilterOperation } from './types.js'
import { InvalidFilterError } from './types.js'

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

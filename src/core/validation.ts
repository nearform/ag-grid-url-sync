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
 * Validates a filter value against configuration constraints
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

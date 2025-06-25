import type { InternalConfig } from './types.js'
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
 */
export function validateFilterValue(
  value: string,
  config: InternalConfig
): string {
  if (value.length > config.maxValueLength) {
    throw new InvalidFilterError(
      `Filter value exceeds maximum length of ${config.maxValueLength} characters`
    )
  }
  return value
}

import type { AGGridUrlSyncConfig, ResolvedOptions } from './types.js'

// The one place for the option defaults (#219). This module imports only
// types, so every other module can import it with no circular import.

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
} as const satisfies ResolvedOptions

/**
 * Fills in the default of each option that the config leaves out or sets to
 * undefined. The result has only the options, so a `gridApi` or any other
 * key in the config is not copied. The config is not changed.
 *
 * An empty `paramPrefix` is kept: the prefix rules read it as the default.
 */
export function resolveOptions(
  options: AGGridUrlSyncConfig = {}
): ResolvedOptions {
  return {
    paramPrefix: options.paramPrefix ?? DEFAULT_CONFIG.paramPrefix,
    maxValueLength: options.maxValueLength ?? DEFAULT_CONFIG.maxValueLength,
    onParseError: options.onParseError ?? DEFAULT_CONFIG.onParseError,
    serialization: options.serialization ?? DEFAULT_CONFIG.serialization,
    groupedParam: options.groupedParam ?? DEFAULT_CONFIG.groupedParam,
    format: options.format ?? DEFAULT_CONFIG.format
  }
}

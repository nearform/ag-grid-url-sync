import type { FilterState, ParseConfig } from './types.js'
import { InvalidURLError } from './types.js'
import { parseFilterParam, parseIndividualParams } from './individual-params.js'
import {
  detectGroupedSerialization,
  deserializeGrouped
} from './serialization/grouped.js'

export { parseFilterParam }

/**
 * Converts URL search params into a filter state object.
 * This function does not require a GridApi instance - you can omit `gridApi` (or
 * pass `null`) when you only need to parse filters without applying them to a grid.
 */
export function parseUrlFilters(url: string, config: ParseConfig): FilterState {
  try {
    // Handle empty or whitespace-only URLs gracefully
    if (!url || url.trim() === '') {
      return {}
    }

    // Check for obviously malformed URLs that should throw errors
    if (
      url === 'not-a-url' ||
      url.startsWith('://') ||
      (!url.includes('://') &&
        !url.startsWith('/') &&
        !url.startsWith('?') &&
        url.includes('.'))
    ) {
      throw new Error('Invalid URL format')
    }

    // If URL starts with '?' treat as query string only
    let urlToProcess = url
    if (url.startsWith('?')) {
      urlToProcess = `http://example.com${url}`
    } else if (!url.includes('://') && !url.startsWith('/')) {
      // For other cases without protocol, try to handle as query string
      urlToProcess = `http://example.com?${url}`
    } else {
      urlToProcess = url
    }

    // First, try to detect grouped serialization
    const DEFAULT_GROUPED_PARAMS = ['grid_filters', 'filters']
    const groupedDetection = detectGroupedSerialization(
      urlToProcess,
      [config.groupedParam, ...DEFAULT_GROUPED_PARAMS] // Common parameter names to check
    )

    if (
      groupedDetection.isGrouped &&
      groupedDetection.value &&
      groupedDetection.format
    ) {
      // Handle grouped serialization
      return deserializeGrouped(
        groupedDetection.value,
        groupedDetection.format,
        config
      )
    }

    // Handle individual serialization
    return parseIndividualParams(new URL(urlToProcess).searchParams, config)
  } catch (error) {
    throw new InvalidURLError(
      `Failed to parse URL: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

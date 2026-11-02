import type { FilterState, ParseConfig } from './types.js'
import { InvalidURLError } from './types.js'
import { parseFilterParam, parseIndividualParams } from './individual-params.js'
import {
  detectGroupedSerialization,
  deserializeGrouped
} from './serialization/grouped.js'

export { parseFilterParam }

/**
 * Base for inputs that are not absolute URLs. Only the query string is read,
 * so the origin has no effect on the result.
 */
const PARSE_BASE = 'http://localhost'

/** An absolute URL starts with a scheme, for example `https:`. */
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i

/**
 * Converts the accepted input forms to a URL:
 * - an absolute URL: `https://example.com/users?f_name_contains=bob`
 * - a relative path: `/users?...`, `users?...` or `//example.com/users?...`
 * - a query string: `?f_name_contains=bob`
 * - a raw query string: `f_name_contains=bob`
 *
 * Input with a scheme is parsed as is, so a URL that is not valid fails here.
 * Input with no scheme and no `?` is a raw query string.
 *
 * @throws InvalidURLError if the URL constructor rejects the input
 */
function toUrl(input: string): URL {
  try {
    if (HAS_SCHEME.test(input)) {
      return new URL(input)
    }
    const isRawQuery =
      !input.startsWith('/') && !input.startsWith('#') && !input.includes('?')
    return new URL(isRawQuery ? `?${input}` : input, PARSE_BASE)
  } catch (error) {
    throw new InvalidURLError(
      `Failed to parse URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Converts URL search params into a filter state object.
 * This function does not require a GridApi instance: leave `config.gridApi` out
 * (or set it to `null`) when you only need to parse filters without a grid.
 *
 * Accepts an absolute URL, a relative path, a query string or a raw query
 * string (see {@link toUrl}). A param that is not valid is skipped and reported
 * through `onParseError`.
 *
 * @throws InvalidURLError if the input is an absolute URL that is not valid
 */
export function parseUrlFilters(url: string, config: ParseConfig): FilterState {
  // Handle empty or whitespace-only URLs gracefully
  if (!url || url.trim() === '') {
    return {}
  }

  const urlObj = toUrl(url.trim())

  // First, try to detect grouped serialization
  const DEFAULT_GROUPED_PARAMS = ['grid_filters', 'filters']
  const groupedDetection = detectGroupedSerialization(
    urlObj.href,
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
  return parseIndividualParams(urlObj.searchParams, config)
}

import type { FilterState, InternalConfig, ColumnFilter } from './types.js'
import { validateFilterValue } from './validation.js'
import { INTERNAL_TO_URL_OPERATION_MAP } from './types.js'

const FILTER_TYPES = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date'
} as const

/**
 * Serializes a single column filter to URL parameter
 */
function serializeColumnFilter(
  columnName: string,
  filter: ColumnFilter,
  paramPrefix: string
): string {
  const urlOperation =
    INTERNAL_TO_URL_OPERATION_MAP[
      filter.type as keyof typeof INTERNAL_TO_URL_OPERATION_MAP
    ]
  if (!urlOperation) return ''

  const paramName = `${paramPrefix}${columnName}_${urlOperation}`

  // Handle date range operations
  if (filter.type === 'dateRange' && filter.filterType === FILTER_TYPES.DATE) {
    // Type guard: ensure this is a DateColumnFilter with dateRange operation
    if ('filterTo' in filter && filter.filterTo !== undefined) {
      // Don't encode the comma for range values - handle this directly
      return `${paramName}=${filter.filter},${filter.filterTo}`
    }
    return ''
  }

  // Handle number range operations
  if (filter.type === 'inRange' && filter.filterType === FILTER_TYPES.NUMBER) {
    // Type guard: ensure this is a NumberColumnFilter with inRange operation
    if ('filterTo' in filter && filter.filterTo !== undefined) {
      // Don't encode the comma for range values - handle this directly
      return `${paramName}=${filter.filter},${filter.filterTo}`
    }
    return ''
  }

  // Handle blank operations (shared across text, number, and date)
  if (filter.type === 'blank' || filter.type === 'notBlank') {
    return `${paramName}=true`
  }

  // Handle date operations (ISO date format preservation)
  if (filter.filterType === FILTER_TYPES.DATE) {
    return `${paramName}=${filter.filter}` // ISO dates don't need URL encoding
  }

  // Handle number operations
  if (filter.filterType === FILTER_TYPES.NUMBER) {
    return `${paramName}=${filter.filter}`
  }

  // Handle text operations (existing logic)
  if (filter.filterType === FILTER_TYPES.TEXT && filter.filter) {
    // Note: Validation should be done at the serializeFilters level, not here
    return `${paramName}=${encodeURIComponent(filter.filter.toString())}`
  }

  return ''
}

/**
 * Helper function to append a serialized parameter to URLSearchParams
 */
function appendSerializedParam(
  serialized: string,
  params: URLSearchParams,
  isRangeOperation = false
): void {
  const [paramName, paramValue] = serialized.split('=')
  if (paramName && paramValue) {
    if (isRangeOperation) {
      // For range operations (which contain commas), don't decode
      params.append(paramName, paramValue)
    } else {
      // For regular operations, decode special characters for text filters
      params.append(paramName, decodeURIComponent(paramValue))
    }
  }
}

/**
 * Converts a filter state object into URL search parameters
 */
export function serializeFilters(
  filterState: FilterState,
  config: InternalConfig
): URLSearchParams {
  const params = new URLSearchParams()

  for (const [column, filter] of Object.entries(filterState)) {
    // Support text, number, and date filters
    if (
      filter.filterType !== FILTER_TYPES.TEXT &&
      filter.filterType !== FILTER_TYPES.NUMBER &&
      filter.filterType !== FILTER_TYPES.DATE
    )
      continue

    // Apply validation for text filters before serialization
    if (filter.filterType === FILTER_TYPES.TEXT) {
      const validatedValue = validateFilterValue(
        filter.filter,
        config,
        filter.type
      )
      const updatedFilter = { ...filter, filter: validatedValue }
      const serialized = serializeColumnFilter(
        column,
        updatedFilter,
        config.paramPrefix
      )
      if (serialized) {
        appendSerializedParam(serialized, params, false) // Text filters are not range operations
      }
    } else {
      // Number and date filters don't need additional validation as they're already validated
      const serialized = serializeColumnFilter(
        column,
        filter,
        config.paramPrefix
      )
      if (serialized) {
        // Check if this is a range operation
        const isRangeOp =
          filter.type === 'inRange' || filter.type === 'dateRange'
        appendSerializedParam(serialized, params, isRangeOp)
      }
    }
  }

  return params
}

/**
 * Generates a URL with the current filter state
 */
export function generateUrl(
  baseUrl: string,
  filterState: FilterState,
  config: InternalConfig
): string {
  const url = new URL(baseUrl)
  const filterParams = serializeFilters(filterState, config)

  // Preserve existing non-filter parameters
  for (const [key, value] of url.searchParams.entries()) {
    if (!key.startsWith(config.paramPrefix)) {
      filterParams.append(key, value)
    }
  }

  const queryString = filterParams.toString()

  // If no filters, return the base URL without query string or trailing slash
  if (!queryString) {
    let result = url.toString().replace(/\?$/, '')
    // Remove trailing slash for root paths when no query parameters
    if (result.endsWith('/') && result === url.origin + '/') {
      result = result.slice(0, -1)
    }
    return result
  }

  url.search = queryString
  return url.toString()
}

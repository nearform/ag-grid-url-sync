import type { FilterState, InternalConfig, ColumnFilter } from './types.js'
import { validateFilterValue } from './validation.js'
import { INTERNAL_TO_URL_OPERATION_MAP } from './types.js'

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

  // Handle range operations
  if (filter.type === 'inRange' && filter.filterType === 'number') {
    const numberFilter = filter as any
    if (numberFilter.filterTo === undefined) return ''
    // Don't encode the comma for range values - handle this directly
    return `${paramName}=${filter.filter},${numberFilter.filterTo}`
  }

  // Handle blank operations
  if (filter.type === 'blank' || filter.type === 'notBlank') {
    return `${paramName}=true`
  }

  // Handle number operations
  if (filter.filterType === 'number') {
    return `${paramName}=${filter.filter}`
  }

  // Handle text operations (existing logic)
  if (filter.filterType === 'text' && filter.filter) {
    // Note: Validation should be done at the serializeFilters level, not here
    return `${paramName}=${encodeURIComponent(filter.filter.toString())}`
  }

  return ''
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
    // Support both text and number filters
    if (filter.filterType !== 'text' && filter.filterType !== 'number') continue

    // Apply validation for text filters before serialization
    if (filter.filterType === 'text') {
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
        const [paramName, paramValue] = serialized.split('=')
        if (paramName && paramValue) {
          // Decode the parameter value to handle commas correctly
          params.append(paramName, decodeURIComponent(paramValue))
        }
      }
    } else {
      // Number filters don't need additional validation as they're already validated
      const serialized = serializeColumnFilter(
        column,
        filter,
        config.paramPrefix
      )
      if (serialized) {
        const [paramName, paramValue] = serialized.split('=')
        if (paramName && paramValue) {
          // Decode the parameter value to handle commas correctly
          params.append(paramName, decodeURIComponent(paramValue))
        }
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

  url.search = filterParams.toString()
  return url.toString()
}

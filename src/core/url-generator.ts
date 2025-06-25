import type { FilterState, InternalConfig } from './types.js'
import { validateFilterValue } from './validation.js'
import { REVERSE_OPERATION_MAP } from './types.js'

/**
 * Converts a filter state object into URL search parameters
 */
export function serializeFilters(
  filterState: FilterState,
  config: InternalConfig
): URLSearchParams {
  const params = new URLSearchParams()

  for (const [column, filter] of Object.entries(filterState)) {
    if (filter.filterType !== 'text') continue

    const operation =
      REVERSE_OPERATION_MAP[filter.type as keyof typeof REVERSE_OPERATION_MAP]
    if (!operation) continue

    const paramName = `${config.paramPrefix}${column}_${operation}`

    // Special handling for blank operations
    if (filter.type === 'blank' || filter.type === 'notBlank') {
      params.append(paramName, 'true')
    } else {
      const value = validateFilterValue(filter.filter, config, filter.type)
      // URLSearchParams already handles encoding, so don't double-encode
      params.append(paramName, value)
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

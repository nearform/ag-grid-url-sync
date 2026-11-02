import type { FilterState, ParseConfig } from './types.js'
import { serializeFilters } from './individual-params.js'
import { serializeGrouped } from './serialization/grouped.js'

export { serializeFilters }

/**
 * Helper to extract and preserve non-filter parameters from a URL
 */
function getPreservedParams(
  url: URL,
  config: ParseConfig,
  excludeParam?: string
): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of url.searchParams.entries()) {
    if (
      (excludeParam && key === excludeParam) ||
      (config.paramPrefix && key.startsWith(config.paramPrefix))
    ) {
      continue
    }
    params.set(key, value)
  }
  return params
}

/**
 * Generates a URL with the current filter state.
 * This function does not require a GridApi instance - you can omit `gridApi` (or
 * pass `null`) when you only need to generate URLs without a grid.
 */
export function generateUrl(
  baseUrl: string,
  filterState: FilterState,
  config: ParseConfig
): string {
  const url = new URL(baseUrl)

  // Handle grouped serialization
  if (config.serialization === 'grouped') {
    return generateGroupedUrl(baseUrl, filterState, config)
  }

  // Handle individual serialization (existing logic)
  const filterParams = serializeFilters(filterState, config)

  // Use shared helper to preserve non-filter parameters
  const preservedParams = getPreservedParams(url, config)
  for (const [key, value] of preservedParams.entries()) {
    filterParams.append(key, value)
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

/**
 * Generates a URL with grouped serialization
 */
function generateGroupedUrl(
  baseUrl: string,
  filterState: FilterState,
  config: ParseConfig
): string {
  const url = new URL(baseUrl)

  // Serialize filters using grouped format
  const groupedResult = serializeGrouped(filterState, config)

  // Use shared helper to preserve non-filter parameters (excluding grouped param)
  const preservedParams = getPreservedParams(url, config, config.groupedParam)
  url.search = ''
  for (const [key, value] of preservedParams.entries()) {
    url.searchParams.set(key, value)
  }

  // Add the grouped parameter if there are filters
  if (groupedResult.value) {
    url.searchParams.set(groupedResult.paramName, groupedResult.value)
  }

  // If no filters, ensure the grouped param is removed
  if (!groupedResult.value && url.searchParams.has(config.groupedParam)) {
    url.searchParams.delete(config.groupedParam)
  }

  // Clean up empty query string
  const queryString = url.searchParams.toString()
  if (!queryString) {
    let result = url.toString().replace(/\?$/, '')
    // Remove trailing slash for root paths when no query parameters
    if (result.endsWith('/') && result === url.origin + '/') {
      result = result.slice(0, -1)
    }
    return result
  }

  return url.toString()
}

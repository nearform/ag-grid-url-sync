import type { FilterState, ParseConfig } from './types.js'
import { serializeFilters } from './individual-params.js'
import { serializeGrouped } from './serialization/grouped.js'

export { serializeFilters }

/**
 * Whether a param belongs to the library: a prefixed filter param or the
 * grouped param. Both kinds are removed in both modes, so a URL never keeps
 * filters from the other mode, which the parser could read instead of the new
 * ones.
 */
function isFilterParam(key: string, config: ParseConfig): boolean {
  return (
    key === config.groupedParam ||
    (Boolean(config.paramPrefix) && key.startsWith(config.paramPrefix))
  )
}

/**
 * The host app's own params, in their original order. Repeated keys
 * (`?tag=a&tag=b`) are all kept.
 */
function getHostParams(url: URL, config: ParseConfig): [string, string][] {
  return [...url.searchParams].filter(([key]) => !isFilterParam(key, config))
}

/**
 * Writes the params to the URL. With no params, returns the URL with no `?`
 * and, for a root path, no trailing slash.
 */
function toUrlString(url: URL, params: URLSearchParams): string {
  const queryString = params.toString()
  if (queryString) {
    url.search = queryString
    return url.toString()
  }

  url.search = ''
  const result = url.toString()
  return result === `${url.origin}/` ? result.slice(0, -1) : result
}

/**
 * Generates a URL with the current filter state.
 * This function does not require a GridApi instance: leave `config.gridApi` out
 * (or set it to `null`) when you only need to generate URLs without a grid.
 *
 * The host app's own params are kept, including repeated keys. Filter params
 * from either mode are replaced.
 */
export function generateUrl(
  baseUrl: string,
  filterState: FilterState,
  config: ParseConfig
): string {
  const url = new URL(baseUrl)
  const hostParams = getHostParams(url, config)

  if (config.serialization === 'grouped') {
    // Host params first, then the grouped param
    const params = new URLSearchParams(hostParams)
    const groupedResult = serializeGrouped(filterState, config)
    if (groupedResult.value) {
      params.append(groupedResult.paramName, groupedResult.value)
    }
    return toUrlString(url, params)
  }

  // Filter params first, then host params
  const params = serializeFilters(filterState, config)
  for (const [key, value] of hostParams) {
    params.append(key, value)
  }
  return toUrlString(url, params)
}

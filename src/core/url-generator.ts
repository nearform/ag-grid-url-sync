import type {
  AGGridUrlSyncConfig,
  FilterState,
  ResolvedOptions
} from './types.js'
import { serializeFilters, resolveParamPrefix } from './individual-params.js'
import { serializeGrouped } from './serialization/grouped.js'
import { resolveOptions } from './options.js'

export { serializeFilters }

/**
 * Whether a param belongs to the library: a prefixed filter param or the
 * grouped param. Both kinds are removed in both modes, so a URL never keeps
 * filters from the other mode, which the parser could read instead of the new
 * ones.
 */
function isFilterParam(key: string, config: ResolvedOptions): boolean {
  return (
    key === config.groupedParam ||
    key.startsWith(resolveParamPrefix(config.paramPrefix))
  )
}

/**
 * The host app's own params, as their raw text and in their original order
 * (#314). So `?debug` and `%20` stay as they are. Repeated keys
 * (`?tag=a&tag=b`) are all kept. A part is a filter param when its name,
 * decoded as `URLSearchParams` decodes it, is one. Empty parts (`?&a=1`) have
 * no name, so they are dropped.
 */
function getHostParts(url: URL, config: ResolvedOptions): string[] {
  return url.search
    .slice(1)
    .split('&')
    .filter(part => {
      const [name] = new URLSearchParams(part).keys()

      return name !== undefined && !isFilterParam(name, config)
    })
}

/**
 * The filter params to write, as a query string. A grouped value with no
 * filters gives no param: json and base64 write `{}` for an empty model, and
 * the URL must not keep `?grid_filters=%7B%7D` when the grid has no filters
 * (#309). This is also true when each filter was dropped (for example
 * `VALUE_TOO_LONG`).
 */
function getFilterQuery(
  filterState: FilterState,
  options: ResolvedOptions
): string {
  if (options.serialization !== 'grouped') {
    return serializeFilters(filterState, options).toString()
  }

  const { paramName, value } = serializeGrouped(filterState, options)

  return value && value !== serializeGrouped({}, options).value
    ? new URLSearchParams({ [paramName]: value }).toString()
    : ''
}

/**
 * Writes the query string to the URL. With no query, returns the URL with no
 * `?` and, for a root path, no trailing slash. The `#hash` stays.
 */
function toUrlString(url: URL, queryString: string): string {
  url.search = queryString
  const result = url.toString()

  return result === `${url.origin}/` ? result.slice(0, -1) : result
}

/**
 * Generates a URL with the current filter state.
 * This function does not need a grid. An option that the config leaves out
 * gets its default.
 *
 * The host app's own params are kept as they were in `baseUrl`: the same
 * text, the same order, and repeated keys. Filter params from either mode
 * are replaced, and the new ones go after the host params in both modes.
 * With no filters, the URL has no filter param.
 */
export function generateUrl(
  baseUrl: string,
  filterState: FilterState,
  config: AGGridUrlSyncConfig = {}
): string {
  const options = resolveOptions(config)
  const url = new URL(baseUrl)

  const parts = [
    ...getHostParts(url, options),
    getFilterQuery(filterState, options)
  ]

  return toUrlString(url, parts.filter(Boolean).join('&'))
}

import type { FilterState, ParseConfig } from './types.js'
import { InvalidURLError } from './types.js'
import { parseFilterParam, parseIndividualParams } from './individual-params.js'
import { deserializeGrouped } from './serialization/grouped.js'

export { parseFilterParam }

/**
 * Base for inputs that are not absolute URLs. Only the query string is read,
 * so the origin has no effect on the result.
 */
const PARSE_BASE = 'http://localhost'

/** An absolute URL starts with a scheme, for example `https:`. */
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i

/**
 * A host with no scheme: a dotted host with an optional port (`example.com`,
 * `www.example.com:8080/users?...`), or any host with a port
 * (`localhost:3000?...`). Host labels can contain any Unicode letter or digit
 * (`münich.com`), the same as internationalized domain names. Without this check, `localhost:3000` would match
 * HAS_SCHEME as the scheme `localhost:`.
 *
 * A raw query string cannot match: its first key is followed by `=`, `&` or
 * the end, and a dotted key followed by `/`, `?` or `#` is not a useful filter
 * param. A bare `localhost?...` with no port cannot be told apart from a raw
 * query key, so it is read as a raw query string.
 */
const SCHEMELESS_HOST =
  /^[\p{L}\p{N}-]+(?:(?:\.[\p{L}\p{N}-]+)+(?::\d+)?|:\d+)(?=[/?#]|$)/u

/**
 * Converts the accepted input forms to a URL. Each rule is checked in order:
 *
 * 1. A host with no scheme (`example.com?...`, `localhost:3000?...`) throws,
 *    because the input is probably a pasted URL with its scheme left out.
 * 2. An absolute URL (`https://example.com/users?...`) is parsed as is, so a
 *    URL that is not valid throws.
 * 3. Input that starts with `/`, `?` or `#` is relative to a fixed base:
 *    `/users?...`, `//example.com/users?...`, `?f_name_contains=bob`.
 * 4. All other input is a raw query string: `f_name_contains=bob`. A `?` or
 *    `#` in it is part of a param name or value.
 *
 * A relative path must start with `/`. Without it, `users?...` is a raw query
 * string. A guess based on the text before the first `?` cannot tell paths
 * and raw queries apart in all cases, so the rules do not guess.
 *
 * @throws InvalidURLError if the input is a host with no scheme, or if the URL
 *   constructor rejects it
 */
function toUrl(input: string): URL {
  if (SCHEMELESS_HOST.test(input)) {
    throw new InvalidURLError(
      `Failed to parse URL: "${input}" has a host but no scheme. ` +
        'Add a scheme (https://...) or start a relative path with "/".'
    )
  }

  try {
    if (HAS_SCHEME.test(input)) {
      return new URL(input)
    }
    if (/^[/?#]/.test(input)) {
      return new URL(input, PARSE_BASE)
    }
    // The search setter keeps `?` and `#` in names and values; parsing
    // `?${input}` would read a `#` as the start of a fragment.
    const url = new URL(PARSE_BASE)
    url.search = input
    return url
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
 * If the URL has a non-empty `config.groupedParam`, it is decoded with
 * `config.format` and the prefixed params are not read. This works in both
 * serialization modes, so a grouped link opens in an app in individual mode
 * when the param name and format match.
 *
 * @throws InvalidURLError if the input is an absolute URL that is not valid,
 *   or a host with no scheme
 */
export function parseUrlFilters(url: string, config: ParseConfig): FilterState {
  // Handle empty or whitespace-only URLs gracefully
  if (!url || url.trim() === '') {
    return {}
  }

  const urlObj = toUrl(url.trim())

  // A non-empty grouped param wins over prefixed params. Only the configured
  // name is read, and it is decoded with the configured format: a host app's
  // own param (for example `filters`) is never taken for grouped filters, and
  // the format is not guessed.
  const groupedValue = urlObj.searchParams.get(config.groupedParam)
  if (groupedValue) {
    return deserializeGrouped(groupedValue, config.format, config)
  }

  // Handle individual serialization
  return parseIndividualParams(urlObj.searchParams, config)
}

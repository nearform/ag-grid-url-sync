import * as v from 'valibot'
import type {
  FilterState,
  SerializationFormat,
  FormatSerializer,
  ParseConfig
} from '../types.js'
import { InvalidSerializationError } from '../types.js'
import {
  parseIndividualParams,
  serializeFilters
} from '../individual-params.js'
import { DEFAULT_CONFIG, validateFilterValue } from '../validation.js'
import { ColumnFilterSchema, JsonObjectSchema } from '../schemas.js'
import { toError } from '../to-error.js'

/**
 * Returns a copy of the filter state with every text value over
 * `maxValueLength` removed. Each dropped filter is reported through
 * `config.onParseError`, wrapped in `InvalidSerializationError(format, cause)`
 * like the grouped querystring format (#213, #207). Non-text filters and
 * in-range values are untouched.
 */
function dropOverLengthTextValues(
  filterState: FilterState,
  config: ParseConfig | undefined,
  format: SerializationFormat
): FilterState {
  const cfg = config ?? DEFAULT_CONFIG

  const kept = Object.entries(filterState).filter(([, filter]) => {
    if (filter.filterType !== 'text') return true

    try {
      validateFilterValue(filter.filter, cfg, filter.type)

      return true
    } catch (error) {
      cfg.onParseError?.(new InvalidSerializationError(format, toError(error)))

      return false
    }
  })

  // Own keys, so a column named `__proto__` stays a column (see
  // parseAndValidateJson)
  return Object.fromEntries(kept)
}

/**
 * Parse JSON and validate its structure. Does no length filtering.
 *
 * Each filter is parsed with its schema, so the result holds only the fields
 * that a filter has: other keys in the URL value are dropped.
 */
function parseAndValidateJson(value: string): FilterState {
  try {
    const json: unknown = JSON.parse(value)

    // Checked, not parsed: Valibot's record output leaves out a `__proto__`
    // key, and here that key is a column name like any other
    if (!v.is(JsonObjectSchema, json)) {
      throw new Error('Invalid JSON: must be an object')
    }

    const entries = Object.entries(json).map(([columnId, filter]) => {
      const column = v.safeParse(ColumnFilterSchema, filter)

      if (!column.success) {
        throw new Error(
          `Invalid JSON: filter for column ${columnId} is not a valid filter object`
        )
      }

      return [columnId, column.output] as const
    })

    // Object.fromEntries creates own keys, so a column named `__proto__`
    // stays a column. An assignment to a plain object would call the
    // prototype setter instead.
    return Object.fromEntries(entries)
  } catch (error) {
    throw new Error(`JSON parsing failed: ${toError(error).message}`)
  }
}

/**
 * QueryString format serializer
 * Writes the individual filter parameters as one query string value
 */
export class QueryStringSerializer implements FormatSerializer {
  readonly format: SerializationFormat = 'querystring'

  serialize(filterState: FilterState, config?: ParseConfig): string {
    return serializeFilters(filterState, innerConfig(config)).toString()
  }

  deserialize(value: string, config?: ParseConfig): FilterState {
    return parseIndividualParams(
      new URLSearchParams(value),
      innerConfig(config)
    )
  }
}

/**
 * Config for the parameters inside a grouped querystring value.
 *
 * Takes the caller's validation and error handling. Keeps the default
 * parameter prefix, so grouped URLs do not change when the caller's prefix
 * changes, and URLs that already exist still parse.
 */
function innerConfig(config?: ParseConfig): ParseConfig {
  if (!config) return DEFAULT_CONFIG
  // `??` keeps the defaults when a JS caller or a partial config leaves a
  // field out
  const onParseError = config.onParseError ?? DEFAULT_CONFIG.onParseError

  return {
    ...DEFAULT_CONFIG,
    maxValueLength: config.maxValueLength ?? DEFAULT_CONFIG.maxValueLength,
    // Errors for parameters inside the grouped value are wrapped like the
    // other grouped serialization errors. The original error is the cause.
    onParseError: error =>
      onParseError(new InvalidSerializationError('querystring', error))
  }
}

/**
 * JSON format serializer
 * Serializes FilterState directly as JSON
 */
export class JsonSerializer implements FormatSerializer {
  readonly format: SerializationFormat = 'json'

  serialize(filterState: FilterState, config?: ParseConfig): string {
    return JSON.stringify(dropOverLengthTextValues(filterState, config, 'json'))
  }

  deserialize(value: string, config?: ParseConfig): FilterState {
    return dropOverLengthTextValues(parseAndValidateJson(value), config, 'json')
  }
}

/**
 * Base64 format serializer
 * JSON encoded then base64 encoded for maximum compactness
 */
export class Base64Serializer implements FormatSerializer {
  readonly format: SerializationFormat = 'base64'

  serialize(filterState: FilterState, config?: ParseConfig): string {
    const filtered = dropOverLengthTextValues(filterState, config, 'base64')

    return btoa(escapeNonAscii(JSON.stringify(filtered)))
  }

  deserialize(value: string, config?: ParseConfig): FilterState {
    try {
      const decoded = atob(value)

      return dropOverLengthTextValues(
        parseAndValidateJson(decoded),
        config,
        'base64'
      )
    } catch (error) {
      throw new Error(`Base64 decoding failed: ${toError(error).message}`)
    }
  }
}

/**
 * Write each non-ASCII character in a JSON string as a `\uXXXX` escape.
 *
 * `btoa` accepts Latin-1 characters only, so CJK text or emoji made it throw
 * (#212). After this step the JSON is ASCII only, and `JSON.parse` gives back
 * the same text. Characters outside the BMP (such as emoji) are two UTF-16
 * code units, so they become two escapes, and `JSON.parse` joins them again.
 *
 * The decoder does not change: `atob` then `JSON.parse`. So links made before
 * #212 decode exactly as before, and ASCII text gives the same output.
 */
function escapeNonAscii(json: string): string {
  return json.replace(
    /[\u0080-\uffff]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
  )
}

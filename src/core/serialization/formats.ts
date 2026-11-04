import * as v from 'valibot'
import type { FilterModel } from 'ag-grid-community'
import type {
  AGGridFilter,
  SerializationFormat,
  FormatSerializer,
  AGGridUrlSyncConfig,
  ResolvedOptions
} from '../types.js'
import { InvalidSerializationError } from '../types.js'
import {
  parseIndividualParams,
  serializeFilters
} from '../individual-params.js'
import { validateFilterValue } from '../validation.js'
import { DEFAULT_CONFIG, resolveOptions } from '../options.js'
import { reportIssue, rethrowIfThrown, toIssue } from '../issues.js'
import { ColumnFilterSchema, JsonObjectSchema } from '../schemas.js'
import { convertToAGGridFilter } from '../grid-integration.js'
import type { ColumnModel } from '../schemas.js'
import { isColumnModel } from '../schemas.js'
import { modelToState, stateToModel } from '../model-form.js'
import { stableJson } from '../stable-json.js'
import { toError } from '../to-error.js'

/** The text values of a column model, also in conditions and multi filters */
function textValues(model: ColumnModel): string[] {
  const own =
    model.filterType === 'text' && v.is(v.string(), model.filter)
      ? [model.filter]
      : []

  const nested = [model.conditions, model.filterModels].flatMap(list =>
    Array.isArray(list) ? list.filter(isColumnModel).flatMap(textValues) : []
  )

  return [...own, ...nested]
}

/**
 * Returns a copy of the model with each column that has a text value over
 * `maxValueLength` removed, also in its conditions or its multi filter's
 * models. Each dropped column is reported through `config.onParseError`,
 * wrapped in `InvalidSerializationError(format, cause)` like the grouped
 * querystring format (#213, #207, #225).
 */
function dropOverLengthTextValues(
  model: FilterModel,
  config: AGGridUrlSyncConfig | undefined,
  format: SerializationFormat
): FilterModel {
  const cfg = resolveOptions(config)

  const kept = Object.entries(model).filter(([column, entry]) => {
    try {
      const texts = isColumnModel(entry) ? textValues(entry) : []

      for (const text of texts) validateFilterValue(text, cfg)

      return true
    } catch (error) {
      const issue = toIssue(error, 'VALUE_TOO_LONG', column)
      reportIssue(cfg, new InvalidSerializationError(format, issue))

      return false
    }
  })

  // Own keys, so a column named `__proto__` stays a column (see
  // parseAndValidateJson)
  return Object.fromEntries(kept)
}

/** The columns of a model that are column models (JSON objects) */
function columnModels(model: FilterModel): FilterModel {
  if (!(model instanceof Object)) return {}

  return Object.fromEntries(
    Object.entries(model).filter(([, entry]) => isColumnModel(entry))
  )
}

/**
 * A column of a JSON value as an AG Grid model. A column in the 0.5 form
 * (the library's own filter state, for example `type: 'eq'`) is converted,
 * so old links still open. Where the two forms overlap, they are the same.
 */
function fromJsonColumn(column: ColumnModel): ColumnModel | AGGridFilter {
  const old = v.safeParse(ColumnFilterSchema, column)

  return old.success ? convertToAGGridFilter(old.output) : column
}

/**
 * Parse JSON and validate its structure. Does no length filtering.
 *
 * Each column must be a JSON object. Its model is kept as it is: any AG Grid
 * filter model round-trips (#225).
 */
function parseAndValidateJson(value: string): FilterModel {
  try {
    const json: unknown = JSON.parse(value)

    // Checked, not parsed: Valibot's record output leaves out a `__proto__`
    // key, and here that key is a column name like any other
    if (!v.is(JsonObjectSchema, json)) {
      throw new Error('Invalid JSON: must be an object')
    }

    const entries = Object.entries(json).map(([columnId, filter]) => {
      if (!isColumnModel(filter)) {
        throw new Error(
          `Invalid JSON: filter for column ${columnId} is not a valid filter object`
        )
      }

      return [columnId, fromJsonColumn(filter)] as const
    })

    // Object.fromEntries creates own keys, so a column named `__proto__`
    // stays a column. An assignment to a plain object would call the
    // prototype setter instead.
    return Object.fromEntries(entries)
  } catch (error) {
    throw new Error(`JSON parsing failed: ${toError(error).message}`)
  }
}

/** The JSON of a model, with sorted keys: equal models give equal URLs */
function toJson(
  model: FilterModel,
  config: AGGridUrlSyncConfig | undefined,
  format: SerializationFormat
): string {
  return stableJson(
    dropOverLengthTextValues(columnModels(model), config, format)
  )
}

/**
 * QueryString format serializer
 * Writes the individual filter parameters as one query string value
 */
export class QueryStringSerializer implements FormatSerializer {
  readonly format: SerializationFormat = 'querystring'

  serialize(model: FilterModel, config?: AGGridUrlSyncConfig): string {
    // A column that the format cannot hold is reported as it is (#225)
    const state = modelToState(model, config)

    return serializeFilters(state, innerConfig(config)).toString()
  }

  deserialize(value: string, config?: AGGridUrlSyncConfig): FilterModel {
    return stateToModel(
      parseIndividualParams(new URLSearchParams(value), innerConfig(config))
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
function innerConfig(config?: AGGridUrlSyncConfig): ResolvedOptions {
  const outer = resolveOptions(config)

  return {
    ...DEFAULT_CONFIG,
    maxValueLength: outer.maxValueLength,
    // The params inside name the same columns (#224)
    columnTypes: outer.columnTypes,
    // Errors for parameters inside the grouped value are wrapped like the
    // other grouped serialization errors. The original error is the cause.
    onParseError: error =>
      reportIssue(outer, new InvalidSerializationError('querystring', error))
  }
}

/**
 * JSON format serializer
 * Serializes the AG Grid filter model directly as JSON
 */
export class JsonSerializer implements FormatSerializer {
  readonly format: SerializationFormat = 'json'

  serialize(model: FilterModel, config?: AGGridUrlSyncConfig): string {
    return toJson(model, config, 'json')
  }

  deserialize(value: string, config?: AGGridUrlSyncConfig): FilterModel {
    return dropOverLengthTextValues(parseAndValidateJson(value), config, 'json')
  }
}

/**
 * Base64 format serializer
 * JSON encoded then base64 encoded for maximum compactness
 */
export class Base64Serializer implements FormatSerializer {
  readonly format: SerializationFormat = 'base64'

  serialize(model: FilterModel, config?: AGGridUrlSyncConfig): string {
    return btoa(escapeNonAscii(toJson(model, config, 'base64')))
  }

  deserialize(value: string, config?: AGGridUrlSyncConfig): FilterModel {
    try {
      const decoded = atob(value)

      return dropOverLengthTextValues(
        parseAndValidateJson(decoded),
        config,
        'base64'
      )
    } catch (error) {
      // An issue that throwOnError threw is not wrapped again (#229)
      rethrowIfThrown(error)

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

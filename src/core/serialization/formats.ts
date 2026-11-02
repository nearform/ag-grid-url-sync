import type {
  FilterState,
  SerializationFormat,
  FormatSerializer,
  ParseConfig
} from '../types.js'
import {
  parseIndividualParams,
  serializeFilters
} from '../individual-params.js'
import { DEFAULT_CONFIG, isValidColumnFilter } from '../validation.js'

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
  return {
    ...DEFAULT_CONFIG,
    // `??` keeps the defaults when a JS caller or a partial config leaves a
    // field out
    maxValueLength: config.maxValueLength ?? DEFAULT_CONFIG.maxValueLength,
    onParseError: config.onParseError ?? DEFAULT_CONFIG.onParseError
  }
}

/**
 * JSON format serializer
 * Serializes FilterState directly as JSON
 */
export class JsonSerializer implements FormatSerializer {
  readonly format: SerializationFormat = 'json'

  serialize(filterState: FilterState): string {
    return JSON.stringify(filterState)
  }

  deserialize(value: string): FilterState {
    try {
      const parsed = JSON.parse(value)

      // Validate that it's a proper FilterState object
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Invalid JSON: must be an object')
      }

      // Basic validation of the structure
      for (const [columnId, filter] of Object.entries(parsed)) {
        if (typeof columnId !== 'string') {
          throw new Error('Invalid JSON: column IDs must be strings')
        }

        if (!isValidColumnFilter(filter)) {
          throw new Error(
            `Invalid JSON: filter for column ${columnId} is not a valid filter object`
          )
        }
      }

      return parsed as FilterState
    } catch (error) {
      throw new Error(`JSON parsing failed: ${(error as Error).message}`)
    }
  }
}

/**
 * Base64 format serializer
 * JSON encoded then base64 encoded for maximum compactness
 */
export class Base64Serializer implements FormatSerializer {
  readonly format: SerializationFormat = 'base64'
  private jsonSerializer = new JsonSerializer()

  serialize(filterState: FilterState): string {
    const jsonString = this.jsonSerializer.serialize(filterState)
    return btoa(jsonString)
  }

  deserialize(value: string): FilterState {
    try {
      const decoded = atob(value)
      return this.jsonSerializer.deserialize(decoded)
    } catch (error) {
      throw new Error(`Base64 decoding failed: ${(error as Error).message}`)
    }
  }
}

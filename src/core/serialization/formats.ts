import type {
  FilterState,
  SerializationFormat,
  FormatSerializer
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

  serialize(filterState: FilterState): string {
    // This uses DEFAULT_CONFIG, not the caller's config (see #201)
    return serializeFilters(filterState, DEFAULT_CONFIG).toString()
  }

  deserialize(value: string): FilterState {
    // This uses DEFAULT_CONFIG, not the caller's config (see #201)
    return parseIndividualParams(new URLSearchParams(value), DEFAULT_CONFIG)
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

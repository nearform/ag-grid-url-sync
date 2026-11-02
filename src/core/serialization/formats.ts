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
    return encodeBase64(jsonString)
  }

  deserialize(value: string): FilterState {
    try {
      const decoded = decodeBase64(value)
      return this.jsonSerializer.deserialize(decoded)
    } catch (error) {
      throw new Error(`Base64 decoding failed: ${(error as Error).message}`)
    }
  }
}

/**
 * Base64-encode the UTF-8 bytes of a string.
 *
 * `btoa` accepts Latin-1 characters only, so CJK text or emoji made it throw
 * (#212). ASCII text gives the same output as `btoa`.
 */
function encodeBase64(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/**
 * Decode a base64 value to a string. Reads the bytes as UTF-8.
 *
 * Links made before #212 encoded Latin-1 characters (such as `é`) as one byte
 * each. Those bytes are not valid UTF-8, so the decoder falls back to Latin-1
 * and old links still decode.
 */
function decodeBase64(value: string): string {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return binary
  }
}

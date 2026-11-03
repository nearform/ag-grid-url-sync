import * as v from 'valibot'
import type {
  FilterState,
  SerializationFormat,
  FormatSerializer,
  GroupedSerializationResult,
  GroupedDetectionResult,
  AGGridUrlSyncConfig
} from '../types.js'
import { InvalidSerializationError } from '../types.js'
import {
  QueryStringSerializer,
  JsonSerializer,
  Base64Serializer
} from './formats.js'
import { JsonObjectSchema } from '../schemas.js'
import { toError } from '../to-error.js'
import { resolveOptions } from '../options.js'
import { reportIssue } from '../issues.js'

/**
 * Registry of available format serializers
 */
const FORMAT_SERIALIZERS: Record<SerializationFormat, FormatSerializer> = {
  querystring: new QueryStringSerializer(),
  json: new JsonSerializer(),
  base64: new Base64Serializer()
}

/**
 * Serialize filter state using grouped serialization
 * @param filterState - The filter state to serialize
 * @param config - Options (no grid needed). An option that is left out gets
 *   its default.
 * @returns Grouped serialization result with parameter name and value
 */
export function serializeGrouped(
  filterState: FilterState,
  config: AGGridUrlSyncConfig = {}
): GroupedSerializationResult {
  const options = resolveOptions(config)

  try {
    const serializer = FORMAT_SERIALIZERS[options.format]

    if (!serializer) {
      throw new Error(`Unknown serialization format: ${options.format}`)
    }

    const value = serializer.serialize(filterState, options)

    return {
      paramName: options.groupedParam,
      value
    }
  } catch (error) {
    const serializationError = new InvalidSerializationError(
      options.format,
      toError(error)
    )

    reportIssue(options, serializationError)

    // Return empty state on error
    return {
      paramName: options.groupedParam,
      value: ''
    }
  }
}

/**
 * Deserialize grouped filter state from URL parameter value
 * @param value - The serialized value from URL parameter
 * @param format - The serialization format to use
 * @param config - Options for validation and error handling (no grid
 *   needed). An option that is left out gets its default.
 * @returns Deserialized filter state
 */
export function deserializeGrouped(
  value: string,
  format: SerializationFormat,
  config: AGGridUrlSyncConfig = {}
): FilterState {
  const options = resolveOptions(config)

  try {
    const serializer = FORMAT_SERIALIZERS[format]

    if (!serializer) {
      throw new Error(`Unknown serialization format: ${format}`)
    }

    return serializer.deserialize(value, options)
  } catch (error) {
    const serializationError = new InvalidSerializationError(
      format,
      toError(error)
    )

    reportIssue(options, serializationError)

    // Return empty state on error
    return {}
  }
}

/**
 * Detect if a URL contains grouped serialization parameters
 *
 * @deprecated parseUrlFilters no longer uses this. It reads only
 * `config.groupedParam` and decodes it with `config.format`, because a guessed
 * format takes any non-empty value as grouped filters (#210). This function
 * will be removed in v1.0.
 * @param url - URL to analyze
 * @param possibleParams - Array of possible grouped parameter names to check
 * @returns Detection result with format and value if found
 */
export function detectGroupedSerialization(
  url: string,
  possibleParams: string[]
): GroupedDetectionResult {
  try {
    const urlObj = new URL(url)

    // Check each possible parameter name
    for (const paramName of possibleParams) {
      const value = urlObj.searchParams.get(paramName)

      if (value) {
        // Try to detect format by attempting to parse
        const format = detectFormat(value)

        if (format) {
          return {
            isGrouped: true,
            paramName,
            format,
            value
          }
        }
      }
    }

    return { isGrouped: false }
  } catch (error) {
    console.error(`Error detecting grouped serialization: ${error}`)

    return { isGrouped: false }
  }
}

/**
 * Detect the serialization format of a value
 * @param value - The serialized value
 * @returns The detected format
 */
function detectFormat(value: string): SerializationFormat {
  // Try base64 first (most specific)
  if (isBase64Format(value)) {
    return 'base64'
  }

  // Try JSON format
  if (isJsonFormat(value)) {
    return 'json'
  }

  return 'querystring'
}

/**
 * Check if value appears to be base64 encoded
 */
function isBase64Format(value: string): boolean {
  try {
    // Base64 pattern check
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/

    if (!base64Pattern.test(value)) {
      return false
    }

    // Try to decode and parse as JSON
    const decoded = atob(value)
    JSON.parse(decoded)

    return true
  } catch {
    return false
  }
}

/**
 * Check if value appears to be JSON
 */
function isJsonFormat(value: string): boolean {
  try {
    return v.is(JsonObjectSchema, JSON.parse(value))
  } catch {
    return false
  }
}

/**
 * Get all available serialization formats
 */
export function getAvailableFormats(): SerializationFormat[] {
  return Object.values(FORMAT_SERIALIZERS).map(serializer => serializer.format)
}

/**
 * Get a specific format serializer
 */
export function getFormatSerializer(
  format: SerializationFormat
): FormatSerializer | null {
  return FORMAT_SERIALIZERS[format] || null
}

import type { FilterModel } from 'ag-grid-community'
import type {
  SerializationFormat,
  FormatSerializer,
  GroupedSerializationResult,
  AGGridUrlSyncConfig
} from '../types.js'
import { InvalidSerializationError } from '../types.js'
import {
  QueryStringSerializer,
  JsonSerializer,
  Base64Serializer
} from './formats.js'
import { toError } from '../to-error.js'
import { resolveOptions } from '../options.js'
import { reportIssue, rethrowIfThrown } from '../issues.js'

/**
 * Registry of available format serializers
 */
const FORMAT_SERIALIZERS: Record<SerializationFormat, FormatSerializer> = {
  querystring: new QueryStringSerializer(),
  json: new JsonSerializer(),
  base64: new Base64Serializer()
}

/**
 * Serialize an AG Grid filter model using grouped serialization. The json and
 * base64 formats hold any model. The querystring format holds simple text,
 * number and date filters, and reports each other column as
 * UNSUPPORTED_FILTER (#225).
 * @param model - The filter model to serialize
 * @param config - Options (no grid needed). An option that is left out gets
 *   its default.
 * @returns Grouped serialization result with parameter name and value
 */
export function serializeGrouped(
  model: FilterModel,
  config: AGGridUrlSyncConfig = {}
): GroupedSerializationResult {
  const options = resolveOptions(config)

  try {
    const serializer = FORMAT_SERIALIZERS[options.format]

    if (!serializer) {
      throw new Error(`Unknown serialization format: ${options.format}`)
    }

    const value = serializer.serialize(model, options)

    return {
      paramName: options.groupedParam,
      value
    }
  } catch (error) {
    // An issue that throwOnError threw is not wrapped again (#229)
    rethrowIfThrown(error)

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
 * @returns The AG Grid filter model
 */
export function deserializeGrouped(
  value: string,
  format: SerializationFormat,
  config: AGGridUrlSyncConfig = {}
): FilterModel {
  const options = resolveOptions(config)

  try {
    const serializer = FORMAT_SERIALIZERS[format]

    if (!serializer) {
      throw new Error(`Unknown serialization format: ${format}`)
    }

    return serializer.deserialize(value, options)
  } catch (error) {
    // An issue that throwOnError threw is not wrapped again (#229)
    rethrowIfThrown(error)

    const serializationError = new InvalidSerializationError(
      format,
      toError(error)
    )

    reportIssue(options, serializationError)

    // Return empty state on error
    return {}
  }
}

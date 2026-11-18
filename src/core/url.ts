import type { FilterModel } from 'ag-grid-community'
import type { AGGridUrlSyncConfig, UrlOptions } from './types.js'
import { URLSyncError } from './types.js'
import { codecOptions, individual } from './codecs.js'
import { readUrlFilters } from './url-parser.js'
import { writeUrlFilters } from './url-generator.js'

// The public URL functions (D4). They take the same option names as
// createGridUrlSync, and map them to the internal config.

function toConfig(options: UrlOptions): AGGridUrlSyncConfig {
  const { onIssue } = options

  return {
    ...codecOptions(options.codec ?? individual()),
    maxValueLength: options.maxValueLength,
    columnTypes: options.columnTypes,
    throwOnError: options.throwOnError,
    onParseError: error => {
      // The core only sends URLSyncError here
      if (error instanceof URLSyncError)
        onIssue?.({ issue: error, source: 'api' })
    }
  }
}

/**
 * Reads the filters from a URL, with no grid. Use the same `codec` that
 * wrote the URL.
 *
 * @throws InvalidURLError if the URL is not valid
 * @throws TypeError if `codec` did not come from `individual()` or `grouped()`
 */
export function parseUrlFilters(
  url: string,
  options: UrlOptions = {}
): FilterModel {
  return readUrlFilters(url, toConfig(options))
}

/**
 * Writes the filters into a URL, with no grid. The params of the app are
 * kept. The filter params of either codec are replaced.
 *
 * @throws TypeError if `codec` did not come from `individual()` or `grouped()`
 */
export function generateUrl(
  baseUrl: string,
  model: FilterModel,
  options: UrlOptions = {}
): string {
  return writeUrlFilters(baseUrl, model, toConfig(options))
}

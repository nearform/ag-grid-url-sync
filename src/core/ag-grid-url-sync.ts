import type { GridApi } from 'ag-grid-community'
import type {
  AGGridUrlSyncConfig,
  FilterState,
  ApplyResult,
  ResolvedOptions,
  SerializationFormat,
  SerializationMode,
  UrlState
} from './types.js'
import { resolveOptions } from './options.js'
import { collectIssues } from './issues.js'
import { parseUrlFilters } from './url-parser.js'
import { generateUrl } from './url-generator.js'
import { getFilterModel, applyFilterModel } from './grid-integration.js'
import { serializeGrouped } from './serialization/grouped.js'

/**
 * AGGridUrlSync class for synchronizing AG Grid text filters with URL parameters
 */
export class AGGridUrlSync {
  private readonly gridApi: GridApi
  private readonly options: ResolvedOptions

  /**
   * Creates a new instance of AGGridUrlSync
   * @param gridApi - AG Grid API instance
   * @param config - Optional configuration options
   */
  constructor(gridApi: GridApi, config: AGGridUrlSyncConfig = {}) {
    this.gridApi = gridApi
    // Options set to undefined (for example `format: props.format` when the
    // prop is not set) keep their default
    this.options = resolveOptions(config)
  }

  /**
   * Generates a URL with the current filter state
   * @param baseUrl - Optional base URL (defaults to current URL)
   * @returns URL string with filter parameters
   */
  generateUrl(baseUrl?: string): string {
    return this.getUrlState(baseUrl).url
  }

  /**
   * Generates a URL with the current filter state, and tells if the grid has
   * filters that the library supports.
   *
   * Reads the grid filter model one time, so an error in it is reported one
   * time. `hasFilters` comes from the filter state, not from the URL: the URL
   * also keeps the page's own params (#215).
   * @param baseUrl - Optional base URL (defaults to current URL)
   */
  getUrlState(baseUrl?: string): UrlState {
    const { options, issues } = collectIssues(this.options)
    const filterState = getFilterModel(this.gridApi, options)
    const url = baseUrl ?? window.location.href

    return {
      url: generateUrl(url, filterState, options),
      hasFilters: Object.keys(filterState).length > 0,
      issues
    }
  }

  /**
   * Gets the current filter state as URL query parameters
   * @returns Query parameter string
   */
  getQueryParams(): string {
    const url = this.generateUrl()
    const urlObj = new URL(url)

    return urlObj.search
  }

  /**
   * Applies filters from a URL to the grid
   * @param url - Optional URL to parse (defaults to current URL)
   * @returns The issues of this call: filters in the URL that were dropped
   */
  applyFromUrl(url?: string): ApplyResult {
    const { options, issues } = collectIssues(this.options)
    const urlToParse = url ?? window.location.href
    const filterState = parseUrlFilters(urlToParse, options)
    // Through applyFilters, so a subclass that overrides it sees URL applies.
    // An override from before #229 returns nothing, so its result is read
    // with care.
    const applied = this.applyFilters(filterState)

    return { issues: [...issues, ...(applied?.issues ?? [])] }
  }

  /**
   * Applies a filter state object to the grid
   * @param filterState - Filter state to apply
   * @returns The issues of this call: filters that were dropped
   */
  applyFilters(filterState: FilterState): ApplyResult {
    const { options, issues } = collectIssues(this.options)
    applyFilterModel(filterState, this.gridApi, options)

    return { issues }
  }

  /**
   * Clears all text filters from the grid
   * @returns The issues of this call
   */
  clearFilters(): ApplyResult {
    return this.applyFilters({})
  }

  /**
   * Cleans up any resources or event listeners
   */
  destroy(): void {
    // Currently no cleanup needed, but included for future use
  }

  /**
   * Gets the current serialization mode
   * @returns The current serialization mode
   */
  getSerializationMode(): SerializationMode {
    return this.options.serialization
  }

  /**
   * Gets the current format (for grouped mode)
   * @returns The current format
   */
  getCurrentFormat(): SerializationFormat {
    return this.options.format
  } /**
   * Gets filters in a specific format (useful for sharing/export)
   * @param format - The format to serialize to
   * @returns Serialized filter string
   */
  getFiltersAsFormat(format: SerializationFormat): string {
    const filterState = getFilterModel(this.gridApi, this.options)

    // Create temporary config for the requested format
    const tempConfig = {
      ...this.options,
      format,
      serialization: 'grouped' as const
    }

    // Use the serialization module
    const result = serializeGrouped(filterState, tempConfig)

    return result.value
  }
}

/**
 * Factory function to create a new AGGridUrlSync instance
 * @param gridApi - AG Grid API instance
 * @param config - Optional configuration options
 * @returns AGGridUrlSync instance
 */
export function createUrlSync(
  gridApi: GridApi,
  config?: AGGridUrlSyncConfig
): AGGridUrlSync {
  return new AGGridUrlSync(gridApi, config)
}

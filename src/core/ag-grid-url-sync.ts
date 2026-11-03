import type { GridApi } from 'ag-grid-community'
import type {
  AGGridUrlSyncConfig,
  FilterState,
  ResolvedOptions,
  SerializationFormat,
  SerializationMode,
  UrlState
} from './types.js'
import { resolveOptions } from './options.js'
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
    const filterState = getFilterModel(this.gridApi, this.options)
    const url = baseUrl ?? window.location.href

    return {
      url: generateUrl(url, filterState, this.options),
      hasFilters: Object.keys(filterState).length > 0
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
   */
  applyFromUrl(url?: string): void {
    const urlToParse = url ?? window.location.href
    const filterState = parseUrlFilters(urlToParse, this.options)
    this.applyFilters(filterState)
  }

  /**
   * Applies a filter state object to the grid
   * @param filterState - Filter state to apply
   */
  applyFilters(filterState: FilterState): void {
    applyFilterModel(filterState, this.gridApi, this.options)
  }

  /**
   * Clears all text filters from the grid
   */
  clearFilters(): void {
    this.applyFilters({})
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

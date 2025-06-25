import type { GridApi } from 'ag-grid-community'
import type {
  AGGridUrlSyncConfig,
  FilterState,
  InternalConfig
} from './types.js'
import { DEFAULT_CONFIG } from './validation.js'
import { parseUrlFilters } from './url-parser.js'
import { generateUrl } from './url-generator.js'
import { getFilterModel, applyFilterModel } from './grid-integration.js'

/**
 * AGGridUrlSync class for synchronizing AG Grid text filters with URL parameters
 */
export class AGGridUrlSync {
  private config: InternalConfig

  /**
   * Creates a new instance of AGGridUrlSync
   * @param gridApi - AG Grid API instance
   * @param config - Optional configuration options
   */
  constructor(gridApi: GridApi, config: AGGridUrlSyncConfig = {}) {
    this.config = {
      gridApi,
      paramPrefix: config.paramPrefix ?? DEFAULT_CONFIG.paramPrefix,
      maxValueLength: config.maxValueLength ?? DEFAULT_CONFIG.maxValueLength,
      onParseError: config.onParseError ?? (() => {})
    }
  }

  /**
   * Generates a URL with the current filter state
   * @param baseUrl - Optional base URL (defaults to current URL)
   * @returns URL string with filter parameters
   */
  generateUrl(baseUrl?: string): string {
    const filterState = getFilterModel(this.config)
    const url = baseUrl ?? window.location.href
    return generateUrl(url, filterState, this.config)
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
    const filterState = parseUrlFilters(urlToParse, this.config)
    this.applyFilters(filterState)
  }

  /**
   * Applies a filter state object to the grid
   * @param filterState - Filter state to apply
   */
  applyFilters(filterState: FilterState): void {
    applyFilterModel(filterState, this.config)
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

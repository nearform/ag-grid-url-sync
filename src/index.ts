/**
 * @fileoverview Main Entry Point for AG Grid URL Synchronization Library
 *
 * This is the main entry point for the AG Grid URL Sync library, providing
 * access to all core functionality for vanilla JavaScript/TypeScript applications.
 *
 * The library provides comprehensive URL synchronization capabilities for AG Grid
 * including support for text, number, date, and set filters with automatic type
 * detection, URL compression, and robust error handling.
 *
 * For React applications, use the separate React-specific exports from './react'.
 *
 * @example
 * ```typescript
 * import { AGGridUrlSync } from 'ag-grid-url-sync';
 *
 * const urlSync = new AGGridUrlSync(gridApi, {
 *   prefix: 'filter_',
 *   compression: 'auto'
 * });
 *
 * // Apply filters from URL
 * await urlSync.fromUrl(window.location.href);
 *
 * // Generate shareable URL
 * const shareUrl = await urlSync.toUrl();
 * ```
 *
 */

// Export core functionality (vanilla JS)
export { AGGridUrlSync, createUrlSync } from './core/ag-grid-url-sync.js'

// Export all type definitions
export * from './core/types.js'

// Export utility functions for advanced use cases
export {
  parseUrlFilters,
  serializeFilters,
  generateUrl,
  getFilterModel,
  applyFilterModel,
  validateFilterValue,
  parseFilterParam
} from './core/utils.js'

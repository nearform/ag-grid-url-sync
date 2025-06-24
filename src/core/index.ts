/**
 * @fileoverview Core Module Exports for AG Grid URL Synchronization
 *
 * This module provides access to all core functionality of the AG Grid URL Sync library.
 * It includes the main AGGridUrlSync class, utility functions, and type definitions
 * needed for URL synchronization operations.
 *
 * This is the entry point for the core functionality that can be used in any
 * JavaScript/TypeScript environment, including Node.js, browsers, and frameworks
 * other than React.
 *
 */

// Export main classes and factory functions
export { AGGridUrlSync, createUrlSync } from './ag-grid-url-sync.js'

// Export all type definitions
export * from './types.js'

// Export utility functions for advanced use cases
export {
  parseUrlFilters,
  serializeFilters,
  generateUrl,
  getFilterModel,
  applyFilterModel,
  validateFilterValue,
  parseFilterParam
} from './utils.js'

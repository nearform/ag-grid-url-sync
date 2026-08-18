// Export core functionality (vanilla JS)
export { AGGridUrlSync, createUrlSync } from './core/ag-grid-url-sync.js'

export * from './core/types.js'

// Validation utilities
export { validateFilterValue, DEFAULT_CONFIG } from './core/validation.js'

// URL parsing utilities
export { parseUrlFilters, parseFilterParam } from './core/url-parser.js'

// URL generation utilities
export { serializeFilters, generateUrl } from './core/url-generator.js'

// AG Grid integration utilities
export { getFilterModel, applyFilterModel } from './core/grid-integration.js'

// Saved view types. Types only, since they are erased at build time: a value
// re-export of createViewStore would put a browser-storage helper into the
// bundle of every non-React consumer. Import it from 'ag-grid-url-sync/view-storage'
// instead, matching how the other core modules are exposed.
export type { GridView, ViewStore } from './core/view-storage.js'

// Grouped serialization utilities
export {
  serializeGrouped,
  deserializeGrouped,
  detectGroupedSerialization,
  getAvailableFormats,
  getFormatSerializer
} from './core/serialization/grouped.js'

export {
  QueryStringSerializer,
  JsonSerializer,
  Base64Serializer
} from './core/serialization/formats.js'

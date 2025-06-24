/**
 * @fileoverview React Integration for AG Grid URL Synchronization
 *
 * This module provides React-specific exports for the AG Grid URL Sync library.
 * It includes the main useAGGridUrlSync hook and all necessary type definitions
 * for React applications.
 *
 * The React integration provides:
 * - useAGGridUrlSync hook with automatic lifecycle management
 * - Event-driven state updates (no polling)
 * - Error handling and recovery
 * - TypeScript support with comprehensive type definitions
 * - Integration with React's useEffect and useState patterns
 *
 * @example
 * ```typescript
 * import { useAGGridUrlSync } from 'ag-grid-url-sync/react';
 *
 * function MyGridComponent() {
 *   const [gridApi, setGridApi] = useState<GridApi | null>(null);
 *
 *   const {
 *     isReady,
 *     currentUrl,
 *     hasFilters,
 *     shareUrl,
 *     applyUrlFilters,
 *     clearFilters
 *   } = useAGGridUrlSync(gridApi, {
 *     autoApplyOnMount: true,
 *     prefix: 'filter_'
 *   });
 *
 *   return (
 *     <div>
 *       <AgGridReact onGridReady={params => setGridApi(params.api)} />
 *       {isReady && (
 *         <button onClick={() => navigator.clipboard.writeText(currentUrl)}>
 *           Share Filtered View
 *         </button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 *
 */

// Export the main React hook
export { useAGGridUrlSync } from './use-ag-grid-url-sync.js'

// Export React-specific type definitions
export type {
  UseAGGridUrlSyncOptions,
  UseAGGridUrlSyncReturn
} from './types.js'

// Re-export core types that React users might need
export type {
  FilterState,
  ColumnFilter,
  FilterOperation,
  AGGridUrlSyncConfig,
  GridApi
} from '../core/types.js'

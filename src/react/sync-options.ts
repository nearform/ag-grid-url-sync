import type { GridApi } from 'ag-grid-community'
import type {
  AGGridUrlSyncConfig,
  GridUrlSyncOptions,
  IssueEvent
} from '../core/types.js'
import { grouped, individual } from '../core/codecs.js'
import { resolveOptions } from '../core/options.js'

// The hook's sync options (#222). The hook takes the old config shape, and
// its sync is made from it.

/**
 * The createGridUrlSync options for the hook. The hook's sync only reads the
 * grid: it never writes history, follows popstate, applies on create or
 * throws.
 */
export function gridUrlSyncOptions(
  api: GridApi,
  options: AGGridUrlSyncConfig,
  onIssue: (event: IssueEvent) => void
): GridUrlSyncOptions {
  const resolved = resolveOptions(options)

  const codec =
    resolved.serialization === 'grouped'
      ? grouped({ param: resolved.groupedParam, format: resolved.format })
      : individual({ prefix: resolved.paramPrefix })

  return {
    api,
    codec,
    maxValueLength: resolved.maxValueLength,
    history: 'none',
    popstate: false,
    applyUrlOnCreate: false,
    throwOnError: false,
    onIssue
  }
}

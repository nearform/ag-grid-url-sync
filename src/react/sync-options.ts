import type { GridApi } from 'ag-grid-community'
import type {
  AGGridUrlSyncConfig,
  GridUrlSyncOptions,
  IssueEvent
} from '../core/types.js'
import { codecFromOptions } from '../core/codecs.js'
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

  // All four settings, so the URL strips the param names that the app set
  // for both modes, as the class does (#222 review)
  const codec = codecFromOptions(resolved)

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

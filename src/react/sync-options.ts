import type { GridApi } from 'ag-grid-community'
import type {
  AGGridUrlSyncConfig,
  GridUrlSyncOptions,
  IssueEvent
} from '../core/types.js'
import { grouped, individual } from '../core/codecs.js'
import { resolveOptions } from '../core/options.js'

// The hook's sync options (#222). The hook takes the old config shape, and
// its sync is made from it. A sync is made again only when one of the five
// URL-format options changes, so the key holds only those.

/** One string for the five URL-format options, after defaults */
export function syncOptionsKey(options: AGGridUrlSyncConfig): string {
  const resolved = resolveOptions(options)

  return JSON.stringify([
    resolved.paramPrefix,
    resolved.maxValueLength,
    resolved.serialization,
    resolved.groupedParam,
    resolved.format
  ])
}

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

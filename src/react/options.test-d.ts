// Type-level tests for #258: a caller with exactOptionalPropertyTypes can
// forward an optional prop, so every optional option takes `undefined`, and
// the resolved config keeps its value types. `npm run type-check` checks this
// file through tsconfig.typecheck.json. Vitest does not run it.
import { expectTypeOf } from 'vitest'
import type { GridApi } from 'ag-grid-community'
import { DEFAULT_CONFIG } from '../core/validation.js'
import type {
  AGGridUrlSyncConfig,
  ResolvedOptions,
  SerializationFormat,
  SerializationMode
} from '../core/types.js'
import type { UseGridUrlSyncOptions } from './types.js'
import { useGridUrlSync } from './use-grid-url-sync.js'
import { individual } from '../core/codecs.js'

// Every optional option of the core takes undefined
export const coreUndefined: AGGridUrlSyncConfig = {
  paramPrefix: undefined,
  maxValueLength: undefined,
  onParseError: undefined,
  serialization: undefined,
  groupedParam: undefined,
  format: undefined
}

// Every optional option of the hook takes undefined
export const hookUndefined: UseGridUrlSyncOptions = {
  api: undefined,
  codec: undefined,
  maxValueLength: undefined,
  history: undefined,
  popstate: undefined,
  applyUrlOnCreate: undefined,
  throwOnError: undefined,
  onIssue: undefined,
  storageKey: undefined,
  enabled: undefined
}

// A component that forwards its optional props, as in the issue
type GridProps = { tenantId?: string; prefix?: string; enabled?: boolean }

export function forwardProps(api: GridApi, props: GridProps) {
  const hook = useGridUrlSync({
    api,
    storageKey: props.tenantId,
    codec: individual({ prefix: props.prefix }),
    enabled: props.enabled
  })

  return { hook }
}

// The resolved config keeps its value types, with no undefined
expectTypeOf<ResolvedOptions['paramPrefix']>().toEqualTypeOf<string>()

expectTypeOf<ResolvedOptions['maxValueLength']>().toEqualTypeOf<number>()

expectTypeOf<ResolvedOptions['onParseError']>().toEqualTypeOf<
  (error: Error) => void
>()

expectTypeOf<
  ResolvedOptions['serialization']
>().toEqualTypeOf<SerializationMode>()

expectTypeOf<ResolvedOptions['groupedParam']>().toEqualTypeOf<string>()

expectTypeOf<ResolvedOptions['format']>().toEqualTypeOf<SerializationFormat>()

// A resolved config has a value for each option
export const resolvedUndefined: ResolvedOptions = {
  ...DEFAULT_CONFIG,
  // @ts-expect-error undefined is not a format
  format: undefined
}

// README "Dropped Filters in the Result" and "throwOnError" examples (#229)
export function ReadmeIssuesExample({
  gridApi
}: {
  gridApi: import('ag-grid-community').GridApi
}) {
  const { issues } = useGridUrlSync({
    api: gridApi,
    throwOnError: issue => issue.code === 'VALUE_TOO_LONG'
  })

  return issues.length > 0 ? 'The link leaves out a filter' : null
}

// The hook takes the column types from the grid only (#224), and the view
// store only from storageKey
expectTypeOf<UseGridUrlSyncOptions>().not.toHaveProperty('columnTypes')

expectTypeOf<UseGridUrlSyncOptions>().not.toHaveProperty('views')

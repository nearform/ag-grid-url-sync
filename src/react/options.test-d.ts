// Type-level tests for #258: a caller with exactOptionalPropertyTypes can
// forward an optional prop, so every optional option takes `undefined`, and
// the resolved config keeps its value types. `npm run type-check` checks this
// file through tsconfig.typecheck.json. Vitest does not run it.
import { expectTypeOf } from 'vitest'
import type { GridApi } from 'ag-grid-community'
import { AGGridUrlSync } from '../core/ag-grid-url-sync.js'
import { DEFAULT_CONFIG } from '../core/validation.js'
import type {
  AGGridUrlSyncConfig,
  InternalConfig,
  ParseConfig,
  SerializationFormat,
  SerializationMode
} from '../core/types.js'
import type { UseAGGridUrlSyncOptions } from './types.js'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'

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
export const hookUndefined: UseAGGridUrlSyncOptions = {
  ...coreUndefined,
  storageKey: undefined,
  autoApplyOnMount: undefined,
  enabledWhenReady: undefined,
  onError: undefined
}

// A component that forwards its optional props, as in the issue
type GridProps = { tenantId?: string; format?: SerializationFormat }

export function forwardProps(api: GridApi, props: GridProps) {
  const sync = new AGGridUrlSync(api, { format: props.format })

  const hook = useAGGridUrlSync(api, {
    storageKey: props.tenantId,
    format: props.format
  })

  return { sync, hook }
}

// The resolved config keeps its value types, with no undefined
expectTypeOf<ParseConfig['paramPrefix']>().toEqualTypeOf<string>()

expectTypeOf<ParseConfig['maxValueLength']>().toEqualTypeOf<number>()

expectTypeOf<ParseConfig['onParseError']>().toEqualTypeOf<
  (error: Error) => void
>()

expectTypeOf<ParseConfig['serialization']>().toEqualTypeOf<SerializationMode>()

expectTypeOf<ParseConfig['groupedParam']>().toEqualTypeOf<string>()

expectTypeOf<ParseConfig['format']>().toEqualTypeOf<SerializationFormat>()

expectTypeOf<InternalConfig['format']>().toEqualTypeOf<SerializationFormat>()

// A resolved config has a value for each option
export const resolvedUndefined: ParseConfig = {
  ...DEFAULT_CONFIG,
  // @ts-expect-error undefined is not a format
  format: undefined
}

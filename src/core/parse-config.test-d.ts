// Type-level tests for issue #109: the documented grid-free config must
// compile. `npm run type-check` checks this file through
// tsconfig.typecheck.json. Vitest does not run it.
import { expectTypeOf } from 'vitest'
import { readUrlFilters } from './url-parser.js'
import { writeUrlFilters, serializeFilters } from './url-generator.js'
import {
  serializeGrouped,
  deserializeGrouped
} from './serialization/grouped.js'
import { DEFAULT_CONFIG, validateFilterValue } from './validation.js'
import type {
  AGGridUrlSyncConfig,
  FilterState,
  FormatSerializer,
  ResolvedOptions,
  URLSyncError
} from './types.js'

// The grid-free functions take a partial config, and the config is optional
// (#219)
expectTypeOf(readUrlFilters)
  .parameter(1)
  .toEqualTypeOf<AGGridUrlSyncConfig | undefined>()

expectTypeOf(serializeFilters)
  .parameter(1)
  .toEqualTypeOf<AGGridUrlSyncConfig | undefined>()

expectTypeOf(writeUrlFilters)
  .parameter(2)
  .toEqualTypeOf<AGGridUrlSyncConfig | undefined>()

expectTypeOf(serializeGrouped)
  .parameter(1)
  .toEqualTypeOf<AGGridUrlSyncConfig | undefined>()

expectTypeOf(deserializeGrouped)
  .parameter(2)
  .toEqualTypeOf<AGGridUrlSyncConfig | undefined>()

expectTypeOf(validateFilterValue)
  .parameter(1)
  .toEqualTypeOf<AGGridUrlSyncConfig | undefined>()

// The resolved options have a value for each option and no gridApi (#219)
expectTypeOf<ResolvedOptions>().not.toHaveProperty('gridApi')

expectTypeOf<keyof ResolvedOptions>().toEqualTypeOf<keyof AGGridUrlSyncConfig>()

expectTypeOf<ResolvedOptions['maxValueLength']>().toEqualTypeOf<number>()

expectTypeOf(DEFAULT_CONFIG).toExtend<ResolvedOptions>()

// A format serializer gets the resolved options
expectTypeOf<FormatSerializer['serialize']>()
  .parameter(1)
  .toEqualTypeOf<ResolvedOptions | undefined>()

expectTypeOf<FormatSerializer['deserialize']>()
  .parameter(1)
  .toEqualTypeOf<ResolvedOptions | undefined>()

declare const filterState: FilterState
declare const resolved: ResolvedOptions

// A ResolvedOptions is a valid argument
readUrlFilters('', resolved)

writeUrlFilters('https://example.com', filterState, resolved)

serializeGrouped(filterState, resolved)

// README "Custom URL Parser" example
export function getFiltersFromUrl(url: string): FilterState {
  return readUrlFilters(url, {
    onParseError: error => console.error('Parse error:', error)
  })
}

// README "Custom URL Generator" example
export function createShareableUrl(
  filters: FilterState,
  baseUrl: string
): string {
  return writeUrlFilters(baseUrl, filters, { maxValueLength: 500 })
}

// throwOnError is optional in the resolved options, so a full resolved-options
// literal with no throwOnError still compiles (#229)
expectTypeOf<ResolvedOptions['throwOnError']>().toEqualTypeOf<
  boolean | ((issue: URLSyncError) => boolean) | undefined
>()

export const fullResolvedOptions: ResolvedOptions = {
  paramPrefix: 'f_',
  maxValueLength: 200,
  onParseError: () => {},
  serialization: 'individual',
  groupedParam: 'grid_filters',
  format: 'querystring'
}

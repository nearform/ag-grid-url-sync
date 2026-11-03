// Type-level tests for issue #109: the documented grid-free config must
// compile. `npm run type-check` checks this file through
// tsconfig.typecheck.json. Vitest does not run it.
import { expectTypeOf } from 'vitest'
import type { GridApi } from 'ag-grid-community'
import { parseUrlFilters } from './url-parser.js'
import { generateUrl, serializeFilters } from './url-generator.js'
import {
  serializeGrouped,
  deserializeGrouped
} from './serialization/grouped.js'
import { getFilterModel, applyFilterModel } from './grid-integration.js'
import { DEFAULT_CONFIG, validateFilterValue } from './validation.js'
import type {
  AGGridUrlSyncConfig,
  FilterState,
  FormatSerializer,
  InternalConfig,
  ParseConfig,
  ResolvedOptions
} from './types.js'

// The grid-free functions take a partial config, and the config is optional
// (#219)
expectTypeOf(parseUrlFilters)
  .parameter(1)
  .toEqualTypeOf<AGGridUrlSyncConfig | undefined>()

expectTypeOf(serializeFilters)
  .parameter(1)
  .toEqualTypeOf<AGGridUrlSyncConfig | undefined>()

expectTypeOf(generateUrl)
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

// The grid adapter takes gridApi as an argument, and the deprecated config
// form still compiles
declare const gridApi: GridApi
declare const internalConfig: InternalConfig
declare const filterState: FilterState

expectTypeOf(getFilterModel(gridApi)).toEqualTypeOf<FilterState>()

expectTypeOf(
  getFilterModel(gridApi, { onParseError: () => {} })
).toEqualTypeOf<FilterState>()

expectTypeOf(getFilterModel(internalConfig)).toEqualTypeOf<FilterState>()

expectTypeOf(applyFilterModel(filterState, gridApi)).toEqualTypeOf<void>()

expectTypeOf(
  applyFilterModel(filterState, gridApi, { onParseError: () => {} })
).toEqualTypeOf<void>()

expectTypeOf(
  applyFilterModel(filterState, internalConfig)
).toEqualTypeOf<void>()

// The config form takes no second options argument
// @ts-expect-error options go in the config object
getFilterModel(internalConfig, {})

// A ParseConfig is still a valid argument
declare const parseConfig: ParseConfig

parseUrlFilters('', parseConfig)

generateUrl('https://example.com', filterState, parseConfig)

serializeGrouped(filterState, parseConfig)

// gridApi can be left out or set to null
export const withoutGridApi: ParseConfig = { ...DEFAULT_CONFIG }
export const withNullGridApi: ParseConfig = { ...DEFAULT_CONFIG, gridApi: null }

// InternalConfig still needs a grid
// @ts-expect-error gridApi is missing
export const internalWithoutGridApi: InternalConfig = { ...DEFAULT_CONFIG }

// README "Custom URL Parser" example
export function getFiltersFromUrl(url: string): FilterState {
  return parseUrlFilters(url, {
    onParseError: error => console.error('Parse error:', error)
  })
}

// README "Custom URL Generator" example
export function createShareableUrl(
  filters: FilterState,
  baseUrl: string
): string {
  return generateUrl(baseUrl, filters, { maxValueLength: 500 })
}

// README "Read and Write the Grid Filters" example
export function copyFilters(otherGridApi: GridApi): void {
  const filters = getFilterModel(gridApi, { onParseError: console.warn })
  applyFilterModel(filters, otherGridApi)
}

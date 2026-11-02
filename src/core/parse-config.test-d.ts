// Type-level tests for issue #109: the documented grid-free config must
// compile. `npm run type-check` checks this file through
// tsconfig.typecheck.json. Vitest does not run it.
import { expectTypeOf } from 'vitest'
import { parseUrlFilters } from './url-parser.js'
import { generateUrl, serializeFilters } from './url-generator.js'
import {
  serializeGrouped,
  deserializeGrouped
} from './serialization/grouped.js'
import { DEFAULT_CONFIG } from './validation.js'
import type { FilterState, InternalConfig, ParseConfig } from './types.js'

// The grid-free functions take ParseConfig, not InternalConfig
expectTypeOf(parseUrlFilters).parameter(1).toEqualTypeOf<ParseConfig>()
expectTypeOf(serializeFilters).parameter(1).toEqualTypeOf<ParseConfig>()
expectTypeOf(generateUrl).parameter(2).toEqualTypeOf<ParseConfig>()
expectTypeOf(serializeGrouped).parameter(1).toEqualTypeOf<ParseConfig>()
expectTypeOf(deserializeGrouped).parameter(2).toEqualTypeOf<ParseConfig>()

// gridApi can be left out or set to null
export const withoutGridApi: ParseConfig = { ...DEFAULT_CONFIG }
export const withNullGridApi: ParseConfig = { ...DEFAULT_CONFIG, gridApi: null }

// InternalConfig still needs a grid
// @ts-expect-error gridApi is missing
export const internalWithoutGridApi: InternalConfig = { ...DEFAULT_CONFIG }

// README "Custom URL Parser" example
export function getFiltersFromUrl(url: string): FilterState {
  const config: ParseConfig = {
    ...DEFAULT_CONFIG, // gridApi is not needed for parsing
    onParseError: error => console.error('Parse error:', error)
  }

  return parseUrlFilters(url, config)
}

// README "Custom URL Generator" example
export function createShareableUrl(
  filters: FilterState,
  baseUrl: string
): string {
  const config: ParseConfig = {
    ...DEFAULT_CONFIG, // gridApi is not needed for generation
    maxValueLength: 500
  }

  return generateUrl(baseUrl, filters, config)
}

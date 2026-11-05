// Type-level tests for the public URL functions (D4). `npm run type-check`
// checks this file through tsconfig.typecheck.json. Vitest does not run it.
import { expectTypeOf } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { parseUrlFilters, generateUrl } from './url.js'
import type { UrlOptions } from './types.js'

// An option can be set to undefined (#258)
const options: UrlOptions = {
  codec: undefined,
  maxValueLength: undefined,
  columnTypes: undefined,
  throwOnError: undefined,
  onIssue: undefined
}

expectTypeOf(parseUrlFilters('?a=1', options)).toEqualTypeOf<FilterModel>()

expectTypeOf(parseUrlFilters('?a=1')).toEqualTypeOf<FilterModel>()

expectTypeOf(
  generateUrl('https://a.test/', {}, options)
).toEqualTypeOf<string>()

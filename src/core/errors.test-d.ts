// Type-level tests for the error codes (#220). `npm run type-check` checks
// this file. Vitest does not run it.
import { expectTypeOf } from 'vitest'
import { URLSyncError, type IssueCode } from './types.js'

expectTypeOf<URLSyncError['code']>().toEqualTypeOf<IssueCode>()

expectTypeOf<URLSyncError['column']>().toEqualTypeOf<string | undefined>()

declare const error: URLSyncError

// @ts-expect-error column is read-only
error.column = 'x'

// @ts-expect-error code is read-only
error.code = 'UNKNOWN'

// A subclass can still declare its own column property (#220 review)
export class AppError extends URLSyncError {
  override column = 'fixed'
}

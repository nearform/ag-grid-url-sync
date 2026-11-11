// Type-level tests for the error codes (#220). `npm run type-check` checks
// this file. Vitest does not run it.
import { expectTypeOf } from 'vitest'
import { URLSyncError, type IssueCode } from './types.js'
import { createGridUrlSync } from './grid-url-sync.js'

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

// README "Error Handling" example
declare const gridApiForReadme: import('ag-grid-community').GridApi

declare function showToast(message: string): void

export const readmeErrorExample = createGridUrlSync({
  api: gridApiForReadme,
  onIssue: ({ issue }) => {
    if (issue.code === 'VALUE_TOO_LONG') {
      showToast(`The link leaves out the filter on ${issue.column}`)
    }
  }
})

// README "Dropped Filters in the Result" example (#229)
export function readmeResultExample(): number {
  const urlSync = createGridUrlSync({ api: gridApiForReadme })
  const { issues } = urlSync.getSnapshot()
  const { issues: urlIssues } = urlSync.applyUrl()

  return issues.length + urlIssues.length
}

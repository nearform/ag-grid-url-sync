import type { IssueCode, ResolvedOptions } from './types.js'
import { URLSyncError } from './types.js'
import { attachColumn } from './issue-columns.js'
import { toError } from './to-error.js'

// The one report path for issues (#220). Every issue that the core finds goes
// through reportIssue, which is the only place in the core that calls
// onParseError.

/** The codes for a filter that is dropped or not valid */
export const DATA_ISSUE_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'INVALID_PARAM',
  'INVALID_NUMBER',
  'INVALID_DATE',
  'VALUE_TOO_LONG',
  'INVALID_GROUPED',
  'TYPE_MISMATCH',
  'INVALID_URL'
])

/** Whether the error is a data issue: a filter that is dropped or not valid */
export function isDataIssue(error: unknown): error is URLSyncError {
  return error instanceof URLSyncError && DATA_ISSUE_CODES.has(error.code)
}

/**
 * The caught value as an issue. A URLSyncError keeps its class and code, and
 * gets the column if it has none. Any other value becomes a URLSyncError with
 * the code, and the original error is its cause.
 */
export function toIssue(
  cause: unknown,
  code: IssueCode,
  column?: string
): URLSyncError {
  if (cause instanceof URLSyncError) {
    if (column !== undefined) attachColumn(cause, column)

    return cause
  }

  const error = toError(cause)

  return new URLSyncError(error.message, error, { code, column })
}

/** Reports one issue to the caller */
export function reportIssue(
  options: ResolvedOptions,
  issue: URLSyncError
): void {
  options.onParseError(issue)
}

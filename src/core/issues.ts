import type { IssueCode, ResolvedOptions } from './types.js'
import { URLSyncError } from './types.js'
import { DATA_ISSUE_CODES } from './data-issue-codes.js'
import { attachColumn } from './issue-columns.js'
import { toError } from './to-error.js'

// The one report path for issues (#220). Every issue that the core finds goes
// through reportIssue, which is the only place in the core that calls
// onParseError.

// The codes moved to data-issue-codes.ts, so URLSyncError can read them (#221)
export { DATA_ISSUE_CODES }

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

/** Options for one call, and the issues that the call reports */
export interface IssueCollector {
  options: ResolvedOptions
  issues: URLSyncError[]
}

/**
 * Options that also keep each issue they report, so a method can return the
 * issues of one call (#229). The caller's onParseError still gets each one.
 */
export function collectIssues(options: ResolvedOptions): IssueCollector {
  const issues: URLSyncError[] = []

  return {
    issues,
    options: {
      ...options,
      onParseError: error => {
        // reportIssue only sends URLSyncError here
        if (error instanceof URLSyncError) issues.push(error)
        options.onParseError(error)
      }
    }
  }
}

/** The issues that reportIssue threw, so a catch on the way out can let them pass */
const thrownIssues = new WeakSet<Error>()

/** Whether throwOnError picks the issue (#229) */
export function shouldThrow(
  throwOnError: ResolvedOptions['throwOnError'],
  issue: URLSyncError
): boolean {
  if (throwOnError === undefined || throwOnError === false) return false

  if (throwOnError === true) return true

  return throwOnError(issue)
}

/**
 * Reports one issue to the caller. An issue that throwOnError picks is thrown
 * instead, and it does not reach onParseError (#229).
 */
export function reportIssue(
  options: ResolvedOptions,
  issue: URLSyncError
): void {
  if (shouldThrow(options.throwOnError, issue)) {
    thrownIssues.add(issue)

    throw issue
  }

  options.onParseError(issue)
}

/**
 * Rethrows an issue that reportIssue threw. A catch that wraps errors calls
 * this first, so a thrown issue reaches the caller one time, not wrapped again.
 */
export function rethrowIfThrown(cause: unknown): void {
  if (cause instanceof Error && thrownIssues.has(cause)) throw cause
}

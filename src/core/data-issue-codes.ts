import type { IssueCode } from './types.js'

// Internal: not exported from the package (#221). URLSyncError reads it for
// `severity`, and issues.ts for isDataIssue.

/** The codes for a filter that is dropped or not valid */
export const DATA_ISSUE_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'INVALID_PARAM',
  'INVALID_NUMBER',
  'INVALID_DATE',
  'VALUE_TOO_LONG',
  'INVALID_GROUPED',
  'TYPE_MISMATCH',
  'UNKNOWN_COLUMN',
  'UNSUPPORTED_OPERATION',
  'INVALID_URL',
  'UNSUPPORTED_FILTER'
])

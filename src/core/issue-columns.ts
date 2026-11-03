// The column of each issue (#220). A URLSyncError reads its column from here,
// so the library can add the column after the error is made (for example in
// the catch that knows the param name), and the column stays read-only for
// callers. The key is `Error`, not URLSyncError: types.ts imports this module,
// so an import of types.ts here would make an import cycle.

const columns = new WeakMap<Error, string>()

/** Sets the column of an issue. An issue that has a column keeps it. */
export function attachColumn(error: Error, column: string): void {
  if (!columns.has(error)) columns.set(error, column)
}

/** The column of an issue, or undefined when it is not known */
export function columnOf(error: Error): string | undefined {
  return columns.get(error)
}

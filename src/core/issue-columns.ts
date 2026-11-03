// The column of each issue (#220). The library can add the column after the
// error is made (for example in the catch that knows the param name), so it is
// set here and not only in the constructor. It is an own, enumerable property,
// so JSON and loggers keep it, and it cannot be written. This module does not
// import types.ts, which imports it, so there is no import cycle.

/** Sets the column of an issue. An issue that has a column keeps it. */
export function attachColumn(error: Error, column: string): void {
  if (Object.getOwnPropertyDescriptor(error, 'column') !== undefined) return

  Object.defineProperty(error, 'column', {
    value: column,
    enumerable: true,
    writable: false,
    // A subclass field can still define its own column
    configurable: true
  })
}

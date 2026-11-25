import type { FilterModel } from 'ag-grid-community'

/**
 * JSON with the keys of each object sorted, at every level. Equal models give
 * equal text, whatever the key order. Internal: not exported from the package.
 */
export function stableJson(value: FilterModel | FilterModel[string]): string {
  return JSON.stringify(value, (_key, part) =>
    part instanceof Object && !Array.isArray(part)
      ? // Object.fromEntries creates own keys, so `__proto__` stays a key
        Object.fromEntries(
          Object.entries(part).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      : part
  )
}

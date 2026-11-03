// Schemas for the untrusted input that the library reads (#250).
//
// Filters come from three places that the library does not control: the URL
// (JSON and base64 grouped values), browser storage (saved views), and the
// AG Grid filter model. Each is parsed here, at the boundary, so the rest of
// the code works with typed values instead of checking types with `typeof`.
//
// The operation lists come from the operator table (`operators.ts`), so a new
// operation is accepted here without a change to this file.
import * as v from 'valibot'
import {
  TEXT_FILTER_OPERATIONS,
  NUMBER_FILTER_OPERATIONS,
  DATE_FILTER_OPERATIONS
} from './types.js'

/** Any JSON object (arrays included, the same as `typeof x === 'object'`) */
export const JsonObjectSchema = v.record(v.string(), v.unknown())

// ----------------------------------------------------------------------------
// Filter state from the URL
// ----------------------------------------------------------------------------

const TextFilterSchema = v.object({
  filterType: v.literal('text'),
  type: v.picklist(TEXT_FILTER_OPERATIONS),
  filter: v.string()
})

const NumberFilterSchema = v.object({
  filterType: v.literal('number'),
  type: v.picklist(NUMBER_FILTER_OPERATIONS),
  filter: v.number(),
  filterTo: v.exactOptional(v.number())
})

const DateFilterSchema = v.object({
  filterType: v.literal('date'),
  type: v.picklist(DATE_FILTER_OPERATIONS),
  filter: v.string(),
  filterTo: v.exactOptional(v.string())
})

/** One column filter in the library's own format */
export const ColumnFilterSchema = v.variant('filterType', [
  TextFilterSchema,
  NumberFilterSchema,
  DateFilterSchema
])

// ----------------------------------------------------------------------------
// Saved views from browser storage
// ----------------------------------------------------------------------------

/** One saved view. A view that does not match is dropped, not repaired. */
export const GridViewSchema = v.object({
  id: v.string(),
  name: v.string(),
  updatedAt: v.number(),
  filterModel: JsonObjectSchema
})

/**
 * The stored blob. Reads must never fail: a `views` value that is not a list
 * reads as no views, and an `activeId` that is not a string reads as none.
 */
export const StoredViewsSchema = v.looseObject({
  views: v.fallback(v.array(v.unknown()), []),
  activeId: v.fallback(v.nullable(v.string()), null)
})

// ----------------------------------------------------------------------------
// The AG Grid filter model
// ----------------------------------------------------------------------------

// AG Grid leaves fields out or sets them to null while a filter is being
// edited, and other filter types (set, multi) have other fields. A field with
// an unexpected value reads as missing, so one odd field does not drop the
// column; a filter type that the library does not support is skipped.

const agGridOperation = v.fallback(v.optional(v.string()), undefined)

const agGridValue = v.fallback(
  v.optional(v.union([v.string(), v.number(), v.null()])),
  undefined
)

const agGridDate = v.fallback(v.optional(v.nullable(v.string())), undefined)

/** One column of the AG Grid filter model that the library can read */
export const AgGridFilterSchema = v.variant('filterType', [
  v.looseObject({
    filterType: v.literal('text'),
    type: agGridOperation,
    filter: agGridValue
  }),
  v.looseObject({
    filterType: v.literal('number'),
    type: agGridOperation,
    filter: agGridValue,
    // A string that AG Grid kept from the input box is read with readNumber
    filterTo: agGridValue
  }),
  v.looseObject({
    filterType: v.literal('date'),
    type: agGridOperation,
    filter: agGridValue,
    dateFrom: agGridDate,
    dateTo: agGridDate
  })
])

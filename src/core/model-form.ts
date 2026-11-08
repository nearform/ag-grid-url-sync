// The forms of a filter model (#225). AG Grid's FilterModel is the model of
// the public interfaces. The individual codec (and the grouped querystring
// format) holds simple text, number and date filters only: inside, it works
// on the library's own FilterState. The json and base64 formats hold any
// model. Internal: not exported from the package.

import * as v from 'valibot'
import type { FilterModel } from 'ag-grid-community'
import type {
  AGGridUrlSyncConfig,
  FilterState,
  ResolvedOptions
} from './types.js'
import { InvalidFilterError } from './types.js'
import { convertToAGGridFilter, fromGridModel } from './grid-integration.js'
import { reportIssue } from './issues.js'
import { resolveOptions } from './options.js'
import { operatorFromAgGrid } from './operators.js'
import { readNumber } from './validation.js'
import type { ColumnModel } from './schemas.js'
import { filterTypeOf, isColumnModel } from './schemas.js'

const SIMPLE_TYPES: ReadonlySet<string> = new Set(['text', 'number', 'date'])

/** The AG Grid model of a filter state. It does not call the grid. */
export function stateToModel(state: FilterState): FilterModel {
  // Object.fromEntries creates own keys, so `__proto__` stays a column
  return Object.fromEntries(
    Object.entries(state).map(([column, filter]) => [
      column,
      convertToAGGridFilter(filter)
    ])
  )
}

/**
 * Whether the individual codec can hold this kind of column model: a text,
 * number or date filter with one condition
 */
export function isSimpleKind(model: ColumnModel): boolean {
  const filterType = filterTypeOf(model)

  if (
    filterType === undefined ||
    !SIMPLE_TYPES.has(filterType) ||
    // Combined conditions: `conditions`, or `condition1` and `condition2`
    // with an `operator` in AG Grid 28
    Object.hasOwn(model, 'conditions') ||
    Object.hasOwn(model, 'operator')
  ) {
    return false
  }

  // A custom filter option (AG Grid's filterOptions) is not in the operator
  // table. A model with no type yet is still being edited: no filter.
  return (
    !v.is(v.string(), model.type) ||
    operatorFromAgGrid(filterType, model.type) !== undefined
  )
}

/**
 * The filter state that the individual codec makes of a model. A column of
 * a kind that it cannot hold (set, multi, combined conditions, a custom
 * filter) is left out and reported as UNSUPPORTED_FILTER. A simple filter
 * that the user is still editing is no filter, with no issue (#260).
 */
export function modelToState(
  model: FilterModel | null | undefined,
  config?: AGGridUrlSyncConfig
): FilterState {
  const options = resolveOptions(config)

  if (!(model instanceof Object)) return {}

  // The columns that the codec cannot hold are reported here and not read,
  // so they get one issue each
  const simple = Object.entries(model).filter(([column, entry]) => {
    if (entry === null || entry === undefined) return false

    if (isColumnModel(entry) && isSimpleKind(entry)) return true

    reportIssue(options, unsupported(column, entry))

    return false
  })

  // Own keys, so a column named `__proto__` stays a column
  return fromGridModel(Object.fromEntries(simple), options)
}

function unsupported(
  column: string,
  entry: FilterModel[string]
): InvalidFilterError {
  if (!isColumnModel(entry)) {
    return new InvalidFilterError(
      `Column '${column}' has a custom filter model that is not an object, which this URL format cannot hold. Use grouped({ format: 'json' }) to keep it in the URL.`,
      undefined,
      { code: 'UNSUPPORTED_FILTER', column }
    )
  }

  const filterType = filterTypeOf(entry)

  const kind = Object.hasOwn(entry, 'conditions')
    ? 'combined conditions'
    : filterType === undefined
      ? 'a custom filter'
      : `a ${filterType} filter`

  return new InvalidFilterError(
    `Column '${column}' has ${kind}, which this URL format cannot hold. Use grouped({ format: 'json' }) to keep it in the URL.`,
    undefined,
    { code: 'UNSUPPORTED_FILTER', column }
  )
}

/** Whether the URL format of these options holds any model */
export function holdsAnyModel(options: ResolvedOptions): boolean {
  return options.serialization === 'grouped' && options.format !== 'querystring'
}

/**
 * The part of a model that the URL format holds, in the form that it gives
 * back: what a URL of this model decodes to. The individual codec reports
 * each column that it cannot hold.
 */
export function urlForm(
  model: FilterModel | null | undefined,
  options: ResolvedOptions
): FilterModel {
  if (!holdsAnyModel(options)) {
    return stateToModel(modelToState(model, options))
  }

  return heldColumns(model)
}

/**
 * The columns of a model that json and base64 hold: every column with a
 * filter. A custom filter's model can be any JSON value (#283 review). AG
 * Grid ignores one that a built-in filter cannot read. Null is no filter.
 */
export function heldColumns(
  model: FilterModel | null | undefined
): FilterModel {
  if (!(model instanceof Object)) return {}

  // Own keys, so a column named `__proto__` stays a column
  return Object.fromEntries(
    Object.entries(model).filter(
      ([, entry]) => entry !== null && entry !== undefined
    )
  )
}

/** The filter types whose strings are not all values */
const BUILT_IN_TYPES: ReadonlySet<unknown> = new Set([
  'text',
  'number',
  'date',
  'set',
  'multi'
])

/** Each string in a JSON value, at any level */
function allStrings(value: ColumnModel[string]): string[] {
  if (v.is(v.string(), value)) return [value]

  if (Array.isArray(value)) return value.flatMap(allStrings)

  return isColumnModel(value) ? Object.values(value).flatMap(allStrings) : []
}

/**
 * The values of a column model that maxValueLength limits: a text filter's
 * value, a set filter's values, and each string of a custom filter's model,
 * also in conditions and multi filters (#283 review). Dates, numbers and
 * operation names are not limited.
 */
function textValues(model: ColumnModel): string[] {
  if (!BUILT_IN_TYPES.has(model.filterType)) return allStrings(model)

  const own =
    model.filterType === 'text' && v.is(v.string(), model.filter)
      ? [model.filter]
      : model.filterType === 'set' && Array.isArray(model.values)
        ? model.values.filter(value => v.is(v.string(), value))
        : []

  const nested = [model.conditions, model.filterModels].flatMap(list =>
    Array.isArray(list) ? list.filter(isColumnModel).flatMap(textValues) : []
  )

  return [...own, ...nested]
}

/** The values of a column's model that maxValueLength limits */
export function columnTexts(entry: FilterModel[string]): string[] {
  return isColumnModel(entry) ? textValues(entry) : allStrings(entry)
}

/**
 * Whether the URL writer keeps a column of the URL form: it leaves out a
 * column with a value over maxValueLength and reports VALUE_TOO_LONG. The
 * individual writer does not check the value of a blank operation
 * (serializeFilters).
 */
function fitsValueLength(
  entry: FilterModel[string],
  options: ResolvedOptions
): boolean {
  if (
    !holdsAnyModel(options) &&
    (entry.type === 'blank' || entry.type === 'notBlank')
  ) {
    return true
  }

  return columnTexts(entry).every(text => text.length <= options.maxValueLength)
}

/**
 * A URL model on the grid: the URL's columns, and the grid's columns that
 * the URL format cannot hold. A URL column wins. A column with a value over
 * maxValueLength is not in the URL, so the grid keeps it too (#310).
 */
export function mergeUrlModel(
  live: FilterModel | null,
  url: FilterModel,
  options: ResolvedOptions
): FilterModel {
  if (live === null) return url

  // The read is only for the column list: its issues are not reported here
  const held = urlForm(live, {
    ...options,
    onParseError: () => {},
    throwOnError: false
  })

  const kept = Object.entries(live).filter(
    ([column]) =>
      !Object.hasOwn(url, column) &&
      !(Object.hasOwn(held, column) && fitsValueLength(held[column], options))
  )

  return Object.fromEntries([...kept, ...Object.entries(url)])
}

/** A time of midnight after a date: AG Grid adds it to a date it rebuilds */
const MIDNIGHT = /^(\d{4}-\d{2}-\d{2})[ T]00:00:00$/

/**
 * A column model in a normal form, only for a compare: a number filter's
 * value as a number, a date with no midnight time, and no null values, also
 * in conditions and multi filters. AG Grid rebuilds a model it takes in this
 * way, and the individual form does the same (#225 review).
 */
function normalColumn(model: ColumnModel): ColumnModel {
  const entries = Object.entries(model)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => [key, normalValue(model, key, value)] as const)

  // Own keys, so a `__proto__` key stays a key
  return Object.fromEntries(entries)
}

function normalValue(
  model: ColumnModel,
  key: string,
  value: ColumnModel[string]
): ColumnModel[string] {
  if (
    Array.isArray(value) &&
    (key === 'conditions' || key === 'filterModels')
  ) {
    return value.map(item => (isColumnModel(item) ? normalColumn(item) : item))
  }

  if (!v.is(v.string(), value)) return value

  if (
    model.filterType === 'number' &&
    (key === 'filter' || key === 'filterTo')
  ) {
    const number = readNumber(value)

    return v.is(v.number(), number) ? number : value
  }

  if (model.filterType === 'date' && (key === 'dateFrom' || key === 'dateTo')) {
    return value.replace(MIDNIGHT, '$1')
  }

  return value
}

/**
 * The URL form of a model in a normal form, for the keys that the sync
 * compares. The individual form is normal already. A json or base64 URL
 * holds the model as it is, so here the parts that AG Grid rebuilds are
 * made normal.
 */
export function keyForm(
  model: FilterModel,
  options: ResolvedOptions
): FilterModel {
  if (!holdsAnyModel(options)) return model

  return Object.fromEntries(
    Object.entries(model).map(([column, entry]) => [
      column,
      isColumnModel(entry) ? normalColumn(entry) : entry
    ])
  )
}

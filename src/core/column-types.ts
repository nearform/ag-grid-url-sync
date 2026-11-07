import * as v from 'valibot'
import type { ColDef, Column, GridApi } from 'ag-grid-community'
import type { FilterType } from './types.js'

// The filter type of a grid column (#224). A shared operation (eq, notEqual,
// blank, notBlank) has no type in the URL, so the decoder takes it from the
// column, not from the value.

/** The filter type of each built-in AG Grid filter */
const BUILT_IN_FILTERS = new Map<unknown, FilterType>([
  ['agTextColumnFilter', 'text'],
  ['agNumberColumnFilter', 'number'],
  ['agDateColumnFilter', 'date']
])

/** The filter type of each AG Grid data type that is not text */
const DATA_TYPES = new Map<unknown, FilterType>([
  ['number', 'number'],
  ['date', 'date'],
  ['dateString', 'date'],
  ['dateTime', 'date'],
  ['dateTimeString', 'date']
])

/**
 * The filter type of a grid column, from the column definition that AG Grid
 * resolved. AG Grid 31+ writes the data type that it infers into
 * `getColDef()`.
 *
 * - undefined: the grid has no such column.
 * - `'pending'`: AG Grid infers the data type from the first row, and no row
 *   data came yet. Until then, AG Grid also defers `setFilterModel`.
 */
export function gridColumnType(
  api: GridApi,
  column: string
): FilterType | 'pending' | undefined {
  try {
    // A test double or an old AG Grid version can lack getColumn
    if (!('getColumn' in api)) return undefined

    const col = api.getColumn(column)

    if (!col) return undefined

    const { filter, cellDataType } = col.getColDef()

    // `filter` is a name, a component class, or a boolean
    const named = BUILT_IN_FILTERS.get(filter)

    if (named) return named

    if (v.is(v.string(), cellDataType)) return dataType(api, cellDataType)

    if (cellDataType === false && infersLater(api, col)) return 'pending'

    return 'text'
  } catch {
    return undefined
  }
}

/**
 * The type of a number or date column whose filter takes only that type
 * (#307): a built-in number or date filter, or AG Grid's default filter
 * (`filter: true`) on a number or date data type. undefined for a text
 * column, a custom filter component, another filter name, and a type that
 * AG Grid has not inferred yet.
 */
export function sureColumnType(
  api: GridApi,
  column: string
): 'number' | 'date' | undefined {
  const type = gridColumnType(api, column)

  if (type !== 'number' && type !== 'date') return undefined

  try {
    const filter = api.getColumn(column)?.getColDef().filter

    return filter === true || BUILT_IN_FILTERS.has(filter) ? type : undefined
  } catch {
    return undefined
  }
}

/**
 * Whether the grid has no column with this id (#312). False when the grid
 * cannot tell: a test double or an old AG Grid version with no getColumn, or
 * a grid that throws. AG Grid 31 to 33 give only the columns of the column
 * definitions to getColumn, so a column that the grid makes (the auto group
 * column, a pivot result column) is looked up in the grid's columns too.
 */
export function isUnknownColumn(api: GridApi, column: string): boolean {
  try {
    if (!('getColumn' in api) || api.getColumn(column) !== null) return false

    const gridColumns =
      'getAllGridColumns' in api ? api.getAllGridColumns() : []

    return !gridColumns.some(col => col.getColId() === column)
  } catch {
    return false
  }
}

/** The filter type of a data type name, built-in or from the grid options */
function dataType(api: GridApi, name: string): FilterType {
  const custom = api.getGridOption('dataTypeDefinitions')?.[name]

  return DATA_TYPES.get(name) ?? DATA_TYPES.get(custom?.baseDataType) ?? 'text'
}

/** Column definition keys that stop AG Grid from inferring a data type */
const BLOCKS_INFERENCE = [
  'cellRenderer',
  'valueGetter',
  'valueParser',
  'refData'
] as const

/** The keys of a definition that the inference rules read */
type InferenceKeys = Pick<ColDef, (typeof BLOCKS_INFERENCE)[number]>

/**
 * Whether AG Grid waits for the first row to infer the column's data type.
 * The rules are AG Grid's own (DataTypeService, v36): the client-side row
 * model, no first row yet, a column that AG Grid can infer, and no column
 * that AG Grid inferred already (it infers all of them from one first row).
 */
function infersLater(api: GridApi, col: Column): boolean {
  if ((api.getGridOption('rowModelType') ?? 'clientSide') !== 'clientSide') {
    return false
  }

  if (hasRows(api) || !canInfer(api, col)) return false

  return !(api.getColumns() ?? []).some(
    other =>
      canInfer(api, other) && v.is(v.string(), other.getColDef().cellDataType)
  )
}

/**
 * Whether AG Grid infers the column's data type: no definition sets one, it
 * has a field, and no definition has a key that stops the inference. The
 * app's definitions, not the resolved one: after the inference, AG Grid adds
 * its own valueParser to the column.
 */
function canInfer(api: GridApi, col: Column): boolean {
  const own = col.getUserProvidedColDef()
  const defs = definitions(api, col)
  const set = defs.map(def => cellDataTypeOf(def)).find(t => t !== undefined)

  return (
    (set === undefined || set === true) &&
    !!own?.field &&
    !defs.some(def => BLOCKS_INFERENCE.some(key => def[key] != null))
  )
}

/**
 * The app's definitions of a column, first one wins: its own, its column
 * types (the last type first), and the default column. AG Grid merges them in
 * the other order.
 */
function definitions(api: GridApi, col: Column): InferenceKeys[] {
  const own = col.getUserProvidedColDef()
  const columnTypes = api.getGridOption('columnTypes') ?? {}

  const typeDefs = [own?.type ?? []]
    .flat()
    .flatMap(names => names.split(','))
    .map(name => columnTypes[name.trim()])
    .filter(def => def !== undefined)
    .reverse()

  return [own ?? {}, ...typeDefs, api.getGridOption('defaultColDef') ?? {}]
}

/** A definition that sets a data type, or turns the inference off */
const SetsDataTypeSchema = v.object({
  cellDataType: v.union([v.string(), v.boolean()])
})

/**
 * The cellDataType of a definition. AG Grid applies a column type's
 * cellDataType at run time, but its ColTypeDef type leaves the key out.
 */
function cellDataTypeOf(def: InferenceKeys): ColDef['cellDataType'] {
  return v.is(SetsDataTypeSchema, def) ? def.cellDataType : undefined
}

/** Whether the grid has a row: from row data, or from a transaction */
function hasRows(api: GridApi): boolean {
  const rowData = api.getGridOption('rowData')

  return (rowData?.length ?? 0) > 0 || api.getDisplayedRowCount() > 0
}

/**
 * The column types of a grid, as a decoder lookup. A pending type is not
 * known yet, so it reads as undefined (text).
 */
export function gridColumnTypes(
  api: GridApi
): (column: string) => FilterType | undefined {
  return column => {
    const type = gridColumnType(api, column)

    return type === 'pending' ? undefined : type
  }
}

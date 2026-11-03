// The operator table: the one source for every filter operation (#217).
//
// Each row gives the internal id, the name in the URL, the name that AG Grid
// uses, the filter types that the operation belongs to, and how many values
// it takes. Every operation list, type, guard and lookup in the library is
// derived from this table. To add an operation, add one row.
//
// This module must not import runtime values from types.ts: types.ts derives
// its public constants from this table.

/** A filter type that the library supports */
export type OperatorFilterType = 'text' | 'number' | 'date'

const ALL_TYPES = ['text', 'number', 'date'] as const

/**
 * Row order matters: the public operation lists keep their old order, and
 * the deprecated reverse AG Grid map keeps its old "last row wins" values.
 * Keep text-only rows first, then shared rows, then number-only rows, then
 * date-only rows.
 */
// prettier-ignore
export const OPERATORS = [
  // Text only
  { id: 'contains', url: 'contains', agGrid: 'contains', types: ['text'], arity: 1 },
  { id: 'notContains', url: 'notContains', agGrid: 'notContains', types: ['text'], arity: 1 },
  { id: 'startsWith', url: 'startsWith', agGrid: 'startsWith', types: ['text'], arity: 1 },
  { id: 'endsWith', url: 'endsWith', agGrid: 'endsWith', types: ['text'], arity: 1 },
  // Shared by every filter type
  { id: 'eq', url: 'eq', agGrid: 'equals', types: ALL_TYPES, arity: 1 },
  { id: 'notEqual', url: 'neq', agGrid: 'notEqual', types: ALL_TYPES, arity: 1 },
  { id: 'blank', url: 'blank', agGrid: 'blank', types: ALL_TYPES, arity: 0 },
  { id: 'notBlank', url: 'notBlank', agGrid: 'notBlank', types: ALL_TYPES, arity: 0 },
  // Number only
  { id: 'lessThan', url: 'lt', agGrid: 'lessThan', types: ['number'], arity: 1 },
  { id: 'lessThanOrEqual', url: 'lte', agGrid: 'lessThanOrEqual', types: ['number'], arity: 1 },
  { id: 'greaterThan', url: 'gt', agGrid: 'greaterThan', types: ['number'], arity: 1 },
  { id: 'greaterThanOrEqual', url: 'gte', agGrid: 'greaterThanOrEqual', types: ['number'], arity: 1 },
  { id: 'inRange', url: 'range', agGrid: 'inRange', types: ['number'], arity: 2 },
  // Date only (AG Grid uses the generic names)
  { id: 'dateBefore', url: 'before', agGrid: 'lessThan', types: ['date'], arity: 1 },
  { id: 'dateBeforeOrEqual', url: 'beforeEq', agGrid: 'lessThanOrEqual', types: ['date'], arity: 1 },
  { id: 'dateAfter', url: 'after', agGrid: 'greaterThan', types: ['date'], arity: 1 },
  { id: 'dateAfterOrEqual', url: 'afterEq', agGrid: 'greaterThanOrEqual', types: ['date'], arity: 1 },
  { id: 'dateRange', url: 'daterange', agGrid: 'inRange', types: ['date'], arity: 2 }
] as const satisfies readonly {
  id: string
  url: string
  agGrid: string
  types: readonly OperatorFilterType[]
  arity: 0 | 1 | 2
}[]

export type Operator = (typeof OPERATORS)[number]

export type OperatorId = Operator['id']

/**
 * The ids of the rows in `Ops` that match `Match`, in table order, as a tuple
 * with a literal type at each index
 */
type IdsWhere<Ops extends readonly unknown[], Match> = Ops extends readonly [
  infer Head,
  ...infer Rest
]
  ? Head extends Match
    ? Head extends { id: infer Id }
      ? [Id, ...IdsWhere<Rest, Match>]
      : IdsWhere<Rest, Match>
    : IdsWhere<Rest, Match>
  : []

/**
 * The tuples for each filter type, in a map. A generic `T` then indexes
 * concrete tuples, so TypeScript can compare the generic type with a list of
 * ids.
 */
type OnlyForTuples = {
  [K in OperatorFilterType]: Readonly<
    IdsWhere<typeof OPERATORS, { types: readonly [K] }>
  >
}

/** Ids of the operations that only one filter type supports, as a tuple */
export type OperationsOnlyForTuple<T extends OperatorFilterType> =
  OnlyForTuples[T]

/** Ids of the operations that every filter type supports, as a tuple */
export type SharedOperationsTuple = Readonly<
  IdsWhere<typeof OPERATORS, { types: typeof ALL_TYPES }>
>

/**
 * Ids of the operations that a filter type supports, as a tuple: its own
 * operations first, then the shared ones
 */
export type OperationsForTuple<T extends OperatorFilterType> = {
  [K in OperatorFilterType]: readonly [
    ...OnlyForTuples[K],
    ...SharedOperationsTuple
  ]
}[T]

/** Ids of the operations that a filter type supports, shared ones included */
export type OperationsFor<T extends OperatorFilterType> =
  OperationsForTuple<T>[number]

/** Ids of the operations that only one filter type supports */
export type OperationsOnlyFor<T extends OperatorFilterType> =
  OperationsOnlyForTuple<T>[number]

/** Ids of the operations that every filter type supports */
export type SharedOperationId = SharedOperationsTuple[number]

const isShared = (op: Operator): boolean => op.types.length === ALL_TYPES.length

// `type` is a string, because AG Grid gives any filter type name
const supports = (op: Operator, type: string | undefined): boolean =>
  op.types.some(own => own === type)

/** The operations that only `type` supports, in table order */
export function operationsOnlyFor<T extends OperatorFilterType>(
  type: T
): OperationsOnlyForTuple<T> {
  const ids: readonly OperatorId[] = OPERATORS.flatMap(op =>
    !isShared(op) && supports(op, type) ? [op.id] : []
  )

  // SAFETY: OperationsOnlyForTuple<T> takes the same rows of OPERATORS, in
  // the same order, with the same test. operators.test.ts checks the values
  // and operators.test-d.ts checks the types, for each filter type.
  return ids as OperationsOnlyForTuple<T>
}

/** The operations that every filter type supports, in table order */
export function sharedOperations(): SharedOperationsTuple {
  const ids: readonly OperatorId[] = OPERATORS.flatMap(op =>
    isShared(op) ? [op.id] : []
  )

  // SAFETY: SharedOperationsTuple takes the same rows of OPERATORS, in the
  // same order, with the same test. operators.test.ts checks the values and
  // operators.test-d.ts checks the type.
  return ids as SharedOperationsTuple
}

/**
 * The operations that `type` supports: its own operations first, then the
 * shared ones
 */
export function operationsFor<T extends OperatorFilterType>(
  type: T
): OperationsForTuple<T> {
  const own: readonly OperatorId[] = operationsOnlyFor(type)
  const ids: readonly OperatorId[] = [...own, ...sharedOperations()]

  // SAFETY: OperationsForTuple<T> is OperationsOnlyForTuple<T> followed by
  // SharedOperationsTuple, the two lists joined here
  return ids as OperationsForTuple<T>
}

const BY_ID = new Map<string, Operator>(OPERATORS.map(op => [op.id, op]))
const BY_URL = new Map<string, Operator>(OPERATORS.map(op => [op.url, op]))

/** The operator with this internal id */
export function operatorById(id: string): Operator | undefined {
  return BY_ID.get(id)
}

/** The operator with this name in a URL param (`gt`, `before`, `neq`, …) */
export function operatorFromUrl(urlName: string): Operator | undefined {
  return BY_URL.get(urlName)
}

/**
 * The operator for an AG Grid operation name on a filter type. The key is the
 * pair, because AG Grid uses one name for a number and a date operation
 * (`lessThan` is `lessThan` on a number filter and `dateBefore` on a date
 * filter).
 */
export function operatorFromAgGrid(
  filterType: string | undefined,
  agGridName: string | undefined
): Operator | undefined {
  return OPERATORS.find(
    op => op.agGrid === agGridName && supports(op, filterType)
  )
}

/** Whether `id` is an operation that only `type` supports */
export function isOperationOnlyFor<T extends OperatorFilterType>(
  id: string,
  type: T
): id is OperationsOnlyFor<T> {
  const op = operatorById(id)

  return op !== undefined && !isShared(op) && supports(op, type)
}

/** Whether `id` is an operation that every filter type supports */
export function isSharedOperation(id: string): id is SharedOperationId {
  const op = operatorById(id)

  return op !== undefined && isShared(op)
}

/** Whether `id` is an operation that `type` supports */
export function isOperationFor<T extends OperatorFilterType>(
  id: string,
  type: T
): id is OperationsFor<T> {
  const op = operatorById(id)

  return op !== undefined && supports(op, type)
}

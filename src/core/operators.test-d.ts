// Type-level tests for #217: the public operation lists and types are
// derived from the operator table, and they must keep the exact types they
// had when they were written by hand. `npm run type-check` checks this file
// through tsconfig.typecheck.json. Vitest does not run it.
import { expectTypeOf } from 'vitest'
import {
  TEXT_ONLY_OPERATIONS,
  NUMBER_ONLY_OPERATIONS,
  DATE_ONLY_OPERATIONS,
  SHARED_OPERATIONS,
  TEXT_FILTER_OPERATIONS,
  NUMBER_FILTER_OPERATIONS,
  DATE_FILTER_OPERATIONS
} from './types.js'
import type {
  FilterOperation,
  TextFilterOperation,
  NumberFilterOperation,
  DateFilterOperation,
  RangeOperation,
  BlankOperation
} from './types.js'

type TextOnly = readonly ['contains', 'notContains', 'startsWith', 'endsWith']

type NumberOnly = readonly [
  'lessThan',
  'lessThanOrEqual',
  'greaterThan',
  'greaterThanOrEqual',
  'inRange'
]

type DateOnly = readonly [
  'dateBefore',
  'dateBeforeOrEqual',
  'dateAfter',
  'dateAfterOrEqual',
  'dateRange'
]

type Shared = readonly ['eq', 'notEqual', 'blank', 'notBlank']

// The lists are readonly tuples, with a literal type at each index
expectTypeOf(TEXT_ONLY_OPERATIONS).toEqualTypeOf<TextOnly>()

expectTypeOf(NUMBER_ONLY_OPERATIONS).toEqualTypeOf<NumberOnly>()

expectTypeOf(DATE_ONLY_OPERATIONS).toEqualTypeOf<DateOnly>()

expectTypeOf(SHARED_OPERATIONS).toEqualTypeOf<Shared>()

expectTypeOf(TEXT_FILTER_OPERATIONS).toEqualTypeOf<
  readonly [...TextOnly, ...Shared]
>()

expectTypeOf(NUMBER_FILTER_OPERATIONS).toEqualTypeOf<
  readonly [...NumberOnly, ...Shared]
>()

expectTypeOf(DATE_FILTER_OPERATIONS).toEqualTypeOf<
  readonly [...DateOnly, ...Shared]
>()

// The operation types are the same unions as before
expectTypeOf<TextFilterOperation>().toEqualTypeOf<
  TextOnly[number] | Shared[number]
>()

expectTypeOf<NumberFilterOperation>().toEqualTypeOf<
  NumberOnly[number] | Shared[number]
>()

expectTypeOf<DateFilterOperation>().toEqualTypeOf<
  DateOnly[number] | Shared[number]
>()

expectTypeOf<FilterOperation>().toEqualTypeOf<
  TextOnly[number] | NumberOnly[number] | DateOnly[number] | Shared[number]
>()

expectTypeOf<RangeOperation>().toEqualTypeOf<'inRange' | 'dateRange'>()

expectTypeOf<BlankOperation>().toEqualTypeOf<'blank' | 'notBlank'>()

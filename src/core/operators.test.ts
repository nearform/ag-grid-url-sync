import { describe, it, expect } from 'vitest'
import * as publicApi from '../index.js'
import {
  OPERATORS,
  operatorById,
  operatorFromUrl,
  operatorFromAgGrid
} from './operators.js'

describe('operator table (#217)', () => {
  const unique = (values: string[]) => new Set(values).size === values.length

  it('has unique ids and unique URL names', () => {
    expect(unique(OPERATORS.map(op => op.id))).toBe(true)
    expect(unique(OPERATORS.map(op => op.url))).toBe(true)
  })

  it('has one row for each filter type and AG Grid name', () => {
    const keys = OPERATORS.flatMap(op =>
      op.types.map(type => `${type}:${op.agGrid}`)
    )
    expect(unique(keys)).toBe(true)
  })

  it.each(OPERATORS.map(op => [op.id, op] as const))(
    'finds %s by id, by URL name and by AG Grid name',
    (_id, op) => {
      expect(operatorById(op.id)).toBe(op)
      expect(operatorFromUrl(op.url)).toBe(op)
      for (const type of op.types) {
        expect(operatorFromAgGrid(type, op.agGrid)).toBe(op)
      }
    }
  )

  it('keys the AG Grid lookup on the filter type, so names do not collide', () => {
    expect(operatorFromAgGrid('number', 'lessThan')?.id).toBe('lessThan')
    expect(operatorFromAgGrid('date', 'lessThan')?.id).toBe('dateBefore')
    expect(operatorFromAgGrid('number', 'inRange')?.id).toBe('inRange')
    expect(operatorFromAgGrid('date', 'inRange')?.id).toBe('dateRange')
    expect(operatorFromAgGrid('date', 'equals')?.id).toBe('eq')
  })

  it('finds no operator for a name that the filter type does not support', () => {
    expect(operatorFromAgGrid('text', 'lessThan')).toBeUndefined()
    expect(operatorFromAgGrid('number', 'contains')).toBeUndefined()
    expect(operatorFromAgGrid('set', 'equals')).toBeUndefined()
    expect(operatorFromAgGrid('number', undefined)).toBeUndefined()
    expect(operatorFromUrl('regex')).toBeUndefined()
    expect(operatorById('regex')).toBeUndefined()
  })
})

// #217: the operator table is the one source for every operation list and
// mapping. The public constants below are derived from it now. These
// snapshots were recorded from the hand-written versions before the change,
// so the derived values must be exactly the same.

describe('public operation constants (#217)', () => {
  it('keeps the operation lists', () => {
    expect({
      TEXT_ONLY_OPERATIONS: publicApi.TEXT_ONLY_OPERATIONS,
      NUMBER_ONLY_OPERATIONS: publicApi.NUMBER_ONLY_OPERATIONS,
      DATE_ONLY_OPERATIONS: publicApi.DATE_ONLY_OPERATIONS,
      SHARED_OPERATIONS: publicApi.SHARED_OPERATIONS,
      TEXT_FILTER_OPERATIONS: publicApi.TEXT_FILTER_OPERATIONS,
      NUMBER_FILTER_OPERATIONS: publicApi.NUMBER_FILTER_OPERATIONS,
      DATE_FILTER_OPERATIONS: publicApi.DATE_FILTER_OPERATIONS
    }).toMatchInlineSnapshot(`
      {
        "DATE_FILTER_OPERATIONS": [
          "dateBefore",
          "dateBeforeOrEqual",
          "dateAfter",
          "dateAfterOrEqual",
          "dateRange",
          "eq",
          "notEqual",
          "blank",
          "notBlank",
        ],
        "DATE_ONLY_OPERATIONS": [
          "dateBefore",
          "dateBeforeOrEqual",
          "dateAfter",
          "dateAfterOrEqual",
          "dateRange",
        ],
        "NUMBER_FILTER_OPERATIONS": [
          "lessThan",
          "lessThanOrEqual",
          "greaterThan",
          "greaterThanOrEqual",
          "inRange",
          "eq",
          "notEqual",
          "blank",
          "notBlank",
        ],
        "NUMBER_ONLY_OPERATIONS": [
          "lessThan",
          "lessThanOrEqual",
          "greaterThan",
          "greaterThanOrEqual",
          "inRange",
        ],
        "SHARED_OPERATIONS": [
          "eq",
          "notEqual",
          "blank",
          "notBlank",
        ],
        "TEXT_FILTER_OPERATIONS": [
          "contains",
          "notContains",
          "startsWith",
          "endsWith",
          "eq",
          "notEqual",
          "blank",
          "notBlank",
        ],
        "TEXT_ONLY_OPERATIONS": [
          "contains",
          "notContains",
          "startsWith",
          "endsWith",
        ],
      }
    `)
  })

  it('keeps the URL mappings', () => {
    expect({
      OPERATION_MAP: publicApi.OPERATION_MAP,
      INTERNAL_TO_URL_OPERATION_MAP: publicApi.INTERNAL_TO_URL_OPERATION_MAP
    }).toMatchInlineSnapshot(`
      {
        "INTERNAL_TO_URL_OPERATION_MAP": {
          "blank": "blank",
          "contains": "contains",
          "dateAfter": "after",
          "dateAfterOrEqual": "afterEq",
          "dateBefore": "before",
          "dateBeforeOrEqual": "beforeEq",
          "dateRange": "daterange",
          "endsWith": "endsWith",
          "eq": "eq",
          "greaterThan": "gt",
          "greaterThanOrEqual": "gte",
          "inRange": "range",
          "lessThan": "lt",
          "lessThanOrEqual": "lte",
          "notBlank": "notBlank",
          "notContains": "notContains",
          "notEqual": "neq",
          "startsWith": "startsWith",
        },
        "OPERATION_MAP": {
          "after": "dateAfter",
          "afterEq": "dateAfterOrEqual",
          "before": "dateBefore",
          "beforeEq": "dateBeforeOrEqual",
          "blank": "blank",
          "contains": "contains",
          "daterange": "dateRange",
          "endsWith": "endsWith",
          "eq": "eq",
          "gt": "greaterThan",
          "gte": "greaterThanOrEqual",
          "lt": "lessThan",
          "lte": "lessThanOrEqual",
          "neq": "notEqual",
          "notBlank": "notBlank",
          "notContains": "notContains",
          "range": "inRange",
          "startsWith": "startsWith",
        },
      }
    `)
  })

  it('keeps the AG Grid mappings, including the legacy key collision', () => {
    expect({
      AG_GRID_OPERATION_NAMES: publicApi.AG_GRID_OPERATION_NAMES,
      REVERSE_AG_GRID_OPERATION_NAMES: publicApi.REVERSE_AG_GRID_OPERATION_NAMES
    }).toMatchInlineSnapshot(`
      {
        "AG_GRID_OPERATION_NAMES": {
          "blank": "blank",
          "contains": "contains",
          "dateAfter": "greaterThan",
          "dateAfterOrEqual": "greaterThanOrEqual",
          "dateBefore": "lessThan",
          "dateBeforeOrEqual": "lessThanOrEqual",
          "dateRange": "inRange",
          "endsWith": "endsWith",
          "eq": "equals",
          "greaterThan": "greaterThan",
          "greaterThanOrEqual": "greaterThanOrEqual",
          "inRange": "inRange",
          "lessThan": "lessThan",
          "lessThanOrEqual": "lessThanOrEqual",
          "notBlank": "notBlank",
          "notContains": "notContains",
          "notEqual": "notEqual",
          "startsWith": "startsWith",
        },
        "REVERSE_AG_GRID_OPERATION_NAMES": {
          "blank": "blank",
          "contains": "contains",
          "endsWith": "endsWith",
          "equals": "eq",
          "greaterThan": "dateAfter",
          "greaterThanOrEqual": "dateAfterOrEqual",
          "inRange": "dateRange",
          "lessThan": "dateBefore",
          "lessThanOrEqual": "dateBeforeOrEqual",
          "notBlank": "notBlank",
          "notContains": "notContains",
          "notEqual": "notEqual",
          "startsWith": "startsWith",
        },
      }
    `)
  })

  it('keeps the type guards', () => {
    const all = [
      ...new Set([
        ...publicApi.TEXT_FILTER_OPERATIONS,
        ...publicApi.NUMBER_FILTER_OPERATIONS,
        ...publicApi.DATE_FILTER_OPERATIONS
      ])
    ]
    const guards = {
      isTextFilterOperation: publicApi.isTextFilterOperation,
      isNumberFilterOperation: publicApi.isNumberFilterOperation,
      isDateFilterOperation: publicApi.isDateFilterOperation,
      isRangeOperation: publicApi.isRangeOperation,
      isBlankOperation: publicApi.isBlankOperation
    }
    expect(
      Object.fromEntries(
        Object.entries(guards).map(([name, guard]) => [
          name,
          all.filter(op => guard(op))
        ])
      )
    ).toMatchInlineSnapshot(`
      {
        "isBlankOperation": [
          "blank",
          "notBlank",
        ],
        "isDateFilterOperation": [
          "eq",
          "notEqual",
          "blank",
          "notBlank",
          "dateBefore",
          "dateBeforeOrEqual",
          "dateAfter",
          "dateAfterOrEqual",
          "dateRange",
        ],
        "isNumberFilterOperation": [
          "eq",
          "notEqual",
          "blank",
          "notBlank",
          "lessThan",
          "lessThanOrEqual",
          "greaterThan",
          "greaterThanOrEqual",
          "inRange",
        ],
        "isRangeOperation": [
          "inRange",
          "dateRange",
        ],
        "isTextFilterOperation": [
          "contains",
          "notContains",
          "startsWith",
          "endsWith",
          "eq",
          "notEqual",
          "blank",
          "notBlank",
        ],
      }
    `)
  })
})

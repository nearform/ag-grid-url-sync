import { describe, it, expect, vi } from 'vitest'
import { readUrlFilters } from './url-parser.js'
import { parseIndividualParams } from './individual-params.js'
import { DEFAULT_CONFIG } from './options.js'
import { serializeGrouped } from './serialization/grouped.js'
import type { ColumnFilter, FilterType, URLSyncError } from './types.js'

// The type of a shared operation (eq, notEqual, blank, notBlank) comes from
// the column, not from the value (#224). readUrlFilters gives AG Grid's
// model (#225).

const TYPES = new Map<string, FilterType>([
  ['zip', 'text'],
  ['age', 'number'],
  ['dob', 'date']
])

const columnTypes = (column: string): FilterType | undefined =>
  TYPES.get(column)

describe('readUrlFilters: shared operations with no column types', () => {
  it('keeps the value as text', () => {
    expect(
      readUrlFilters('?f_zip_eq=01234&f_code_neq=007&f_d_eq=2024-01-15')
    ).toEqual({
      zip: { filterType: 'text', type: 'equals', filter: '01234' },
      code: { filterType: 'text', type: 'notEqual', filter: '007' },
      d: { filterType: 'text', type: 'equals', filter: '2024-01-15' }
    })
  })

  it('gives a text blank filter', () => {
    expect(readUrlFilters('?f_age_blank=true')).toEqual({
      age: { filterType: 'text', type: 'blank', filter: '' }
    })
  })

  it('keeps a column that the lookup does not know as text', () => {
    expect(readUrlFilters('?f_other_eq=5', { columnTypes })).toEqual({
      other: { filterType: 'text', type: 'equals', filter: '5' }
    })
  })
})

describe('readUrlFilters: shared operations with column types', () => {
  it('keeps the value as text on a text column', () => {
    expect(readUrlFilters('?f_zip_eq=01234', { columnTypes }).zip).toEqual({
      filterType: 'text',
      type: 'equals',
      filter: '01234'
    })
  })

  it('reads a number on a number column', () => {
    expect(readUrlFilters('?f_age_neq=30', { columnTypes }).age).toEqual({
      filterType: 'number',
      type: 'notEqual',
      filter: 30
    })
  })

  it('reads a date on a date column', () => {
    expect(readUrlFilters('?f_dob_eq=2024-01-15', { columnTypes }).dob).toEqual(
      {
        filterType: 'date',
        type: 'equals',
        dateFrom: '2024-01-15',
        dateTo: null
      }
    )
  })

  it('gives the blank filter of the column type', () => {
    expect(
      readUrlFilters('?f_age_blank=true&f_dob_notBlank=true&f_zip_blank=true', {
        columnTypes
      })
    ).toEqual({
      age: { filterType: 'number', type: 'blank', filter: null },
      dob: {
        filterType: 'date',
        type: 'notBlank',
        dateFrom: null,
        dateTo: null
      },
      zip: { filterType: 'text', type: 'blank', filter: '' }
    })
  })

  it('reports a value that is not a number on a number column', () => {
    const onParseError = vi.fn<(error: Error) => void>()

    const filters = readUrlFilters('?f_age_eq=abc&f_zip_eq=1', {
      columnTypes,
      onParseError
    })

    expect(filters).toEqual({
      zip: { filterType: 'text', type: 'equals', filter: '1' }
    })
    expect(onParseError).toHaveBeenCalledTimes(1)
    expect(onParseError.mock.calls[0]?.[0]).toMatchObject({
      code: 'INVALID_NUMBER',
      column: 'age'
    } satisfies Partial<URLSyncError>)
  })

  it('reports a value that is not a date on a date column', () => {
    const onParseError = vi.fn<(error: Error) => void>()

    expect(
      readUrlFilters('?f_dob_eq=2024-13-45', { columnTypes, onParseError })
    ).toEqual({})
    expect(onParseError.mock.calls[0]?.[0]).toMatchObject({
      code: 'INVALID_DATE',
      column: 'dob'
    } satisfies Partial<URLSyncError>)
  })

  it('does not change an operation that has one type', () => {
    expect(
      readUrlFilters('?f_zip_contains=01&f_zip2_gt=5', { columnTypes })
    ).toEqual({
      zip: { filterType: 'text', type: 'contains', filter: '01' },
      zip2: { filterType: 'number', type: 'greaterThan', filter: 5 }
    })
  })

  it('uses the column types inside a grouped querystring value', () => {
    const { value } = serializeGrouped(
      {
        zip: { filterType: 'text', type: 'equals', filter: '01234' },
        age: { filterType: 'number', type: 'equals', filter: 30 }
      },
      { format: 'querystring' }
    )

    expect(
      readUrlFilters(`?grid_filters=${encodeURIComponent(value)}`, {
        columnTypes
      })
    ).toEqual({
      zip: { filterType: 'text', type: 'equals', filter: '01234' },
      age: { filterType: 'number', type: 'equals', filter: 30 }
    })
  })
})

/**
 * Parses one prefixed param with the individual codec's internal parser, and
 * gives its filter. With throwOnError, a bad param throws its issue.
 */
function parseParam(
  param: string,
  value: string,
  columnType?: FilterType
): ColumnFilter | undefined {
  const filters = parseIndividualParams(new URLSearchParams([[param, value]]), {
    ...DEFAULT_CONFIG,
    paramPrefix: 'f_',
    throwOnError: true,
    columnTypes: columnType ? () => columnType : undefined
  })

  return Object.values(filters)[0]
}

describe('parseIndividualParams, one param', () => {
  it('keeps a shared operation as text with no column type', () => {
    expect(parseParam('f_zip_eq', '01234')).toEqual({
      filterType: 'text',
      type: 'eq',
      filter: '01234'
    })
  })

  it('takes the column type from columnTypes', () => {
    expect(parseParam('f_age_eq', '30', 'number')).toEqual({
      filterType: 'number',
      type: 'eq',
      filter: 30
    })
  })
})

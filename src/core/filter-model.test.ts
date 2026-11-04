import { describe, it, expect, vi } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { parseUrlFilters } from './url-parser.js'
import { generateUrl, serializeFilters } from './url-generator.js'
import {
  deserializeGrouped,
  serializeGrouped
} from './serialization/grouped.js'

// AG Grid's FilterModel is the model of the public functions (#225). The
// json and base64 formats hold any model. The individual codec holds simple
// filters and reports the others.

const SET: FilterModel = {
  country: { filterType: 'set', values: ['Ireland', 'Spain'] }
}

const COMBINED: FilterModel = {
  title: {
    filterType: 'text',
    operator: 'OR',
    conditions: [
      { filterType: 'text', type: 'contains', filter: 'jo' },
      { filterType: 'text', type: 'startsWith', filter: 'ja' }
    ]
  }
}

const MULTI: FilterModel = {
  sport: {
    filterType: 'multi',
    filterModels: [
      { filterType: 'text', type: 'contains', filter: 'ball' },
      { filterType: 'set', values: ['Golf'] }
    ]
  }
}

const CUSTOM: FilterModel = { year: { value: 2008, mode: 'after' } }

const SIMPLE: FilterModel = {
  name: { filterType: 'text', type: 'contains', filter: 'jo' },
  age: { filterType: 'number', type: 'greaterThan', filter: 30 },
  born: {
    filterType: 'date',
    type: 'lessThan',
    dateFrom: '2024-01-15',
    dateTo: null
  }
}

const ALL: FilterModel = { ...SET, ...COMBINED, ...MULTI, ...CUSTOM, ...SIMPLE }

const grouped = (format: 'json' | 'base64') =>
  ({ serialization: 'grouped', format }) as const

describe.each(['json', 'base64'] as const)('%s format', format => {
  it('round-trips any AG Grid filter model', () => {
    const { value } = serializeGrouped(ALL, grouped(format))

    expect(deserializeGrouped(value, format)).toEqual(ALL)
  })

  it('round-trips through a URL', () => {
    const url = generateUrl('https://app.test/?tab=1', ALL, grouped(format))

    expect(parseUrlFilters(url, grouped(format))).toEqual(ALL)
  })

  it('gives the same value for the same model in another key order', () => {
    const reversed = Object.fromEntries(
      Object.entries(SIMPLE)
        .reverse()
        .map(([colId, column]) => [
          colId,
          Object.fromEntries(Object.entries(column).reverse())
        ])
    )

    expect(serializeGrouped(reversed, grouped(format)).value).toBe(
      serializeGrouped(SIMPLE, grouped(format)).value
    )
  })

  it('reads a 0.5 link in the old form as the AG Grid model', () => {
    const old = {
      name: { filterType: 'text', type: 'eq', filter: 'john' },
      age: { filterType: 'number', type: 'blank', filter: 0 },
      born: { filterType: 'date', type: 'dateAfter', filter: '2024-01-15' }
    }

    const json = JSON.stringify(old)
    const value = format === 'json' ? json : btoa(json)

    expect(deserializeGrouped(value, format)).toEqual({
      name: { filterType: 'text', type: 'equals', filter: 'john' },
      age: { filterType: 'number', type: 'blank', filter: null },
      born: {
        filterType: 'date',
        type: 'greaterThan',
        dateFrom: '2024-01-15',
        dateTo: null
      }
    })
  })

  it('drops a column with a text value over maxValueLength, also in conditions', () => {
    const onParseError = vi.fn<(error: Error) => void>()
    const long = 'x'.repeat(30)

    const model: FilterModel = {
      ...SET,
      name: {
        filterType: 'text',
        operator: 'AND',
        conditions: [
          { filterType: 'text', type: 'contains', filter: 'jo' },
          { filterType: 'text', type: 'contains', filter: long }
        ]
      }
    }

    const value = JSON.stringify(model)
    const encoded = format === 'json' ? value : btoa(value)

    expect(
      deserializeGrouped(encoded, format, { maxValueLength: 20, onParseError })
    ).toEqual(SET)
    expect(onParseError).toHaveBeenCalledOnce()
    expect(onParseError.mock.calls[0]?.[0]).toMatchObject({
      code: 'VALUE_TOO_LONG',
      column: 'name'
    })
  })

  it('rejects a value with a column that is not an object', () => {
    const onParseError = vi.fn<(error: Error) => void>()
    const value = JSON.stringify({ name: 'jo' })
    const encoded = format === 'json' ? value : btoa(value)

    expect(deserializeGrouped(encoded, format, { onParseError })).toEqual({})
    expect(onParseError.mock.calls[0]?.[0]).toMatchObject({
      code: 'INVALID_GROUPED'
    })
  })

  it('keeps a column named __proto__', () => {
    const model: FilterModel = Object.fromEntries([
      ['__proto__', { filterType: 'set', values: ['a'] }]
    ])

    const { value } = serializeGrouped(model, grouped(format))

    expect(Object.keys(deserializeGrouped(value, format))).toEqual([
      '__proto__'
    ])
  })
})

describe('parseUrlFilters: the AG Grid model', () => {
  it('gives AG Grid operation names and date fields', () => {
    expect(
      parseUrlFilters(
        '?f_name_eq=john&f_age_gt=30&f_born_before=2024-01-15&f_size_blank=true',
        {
          columnTypes: column =>
            column === 'size'
              ? 'number'
              : column === 'name'
                ? 'text'
                : undefined
        }
      )
    ).toEqual({
      name: { filterType: 'text', type: 'equals', filter: 'john' },
      age: { filterType: 'number', type: 'greaterThan', filter: 30 },
      born: {
        filterType: 'date',
        type: 'lessThan',
        dateFrom: '2024-01-15',
        dateTo: null
      },
      size: { filterType: 'number', type: 'blank', filter: null }
    })
  })

  it('gives the AG Grid model for a grouped querystring value', () => {
    const url = generateUrl('https://app.test/', SIMPLE, {
      serialization: 'grouped',
      format: 'querystring'
    })

    expect(
      parseUrlFilters(url, { serialization: 'grouped', format: 'querystring' })
    ).toEqual(SIMPLE)
  })
})

describe('the individual codec: filters that it cannot hold', () => {
  it.each([
    ['a set filter', SET, 'country'],
    ['combined conditions', COMBINED, 'title'],
    ['a multi filter', MULTI, 'sport'],
    ['a custom filter', CUSTOM, 'year']
  ])('leaves out %s and reports UNSUPPORTED_FILTER', (_name, model, column) => {
    const issues: Error[] = []
    const onParseError = (error: Error) => issues.push(error)

    const url = generateUrl(
      'https://app.test/',
      { ...model, ...SIMPLE },
      {
        onParseError
      }
    )

    expect(parseUrlFilters(url)).toEqual(SIMPLE)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      code: 'UNSUPPORTED_FILTER',
      column,
      severity: 'warning'
    })
  })

  it('reports it from serializeFilters and the grouped querystring format', () => {
    const onParseError = vi.fn<(error: Error) => void>()

    expect(serializeFilters(SET, { onParseError }).toString()).toBe('')
    serializeGrouped(SET, {
      serialization: 'grouped',
      format: 'querystring',
      onParseError
    })

    expect(onParseError).toHaveBeenCalledTimes(2)

    for (const [issue] of onParseError.mock.calls) {
      expect(issue).toMatchObject({ code: 'UNSUPPORTED_FILTER' })
    }
  })

  it('does not report a filter that the user is still editing', () => {
    const onParseError = vi.fn<(error: Error) => void>()

    generateUrl(
      'https://app.test/',
      { age: { filterType: 'number', type: 'equals', filter: null } },
      { onParseError }
    )

    expect(onParseError).not.toHaveBeenCalled()
  })
})

// A simple kind of filter that the codec cannot read is an issue too, not a
// silent drop: AG Grid's custom filterOptions, and the AG Grid 28 combined
// form with condition1 and condition2 (#225 review)
describe('the individual codec: simple filters that it cannot read', () => {
  it.each([
    [
      'a custom text option',
      { filterType: 'text', type: 'startsWithA', filter: 'x' }
    ],
    [
      'a custom date option',
      { filterType: 'date', type: 'lastWeek', dateFrom: null }
    ],
    [
      'a custom number option',
      { filterType: 'number', type: 'evenNumbers', filter: null }
    ],
    [
      'the AG Grid 28 combined form',
      {
        filterType: 'text',
        operator: 'AND',
        condition1: { filterType: 'text', type: 'contains', filter: 'a' },
        condition2: { filterType: 'text', type: 'contains', filter: 'b' }
      }
    ]
  ])('reports %s as UNSUPPORTED_FILTER', (_name, column) => {
    const onParseError = vi.fn<(error: Error) => void>()

    expect(
      generateUrl('http://x.test/', { col: column }, { onParseError })
    ).toBe('http://x.test')
    expect(onParseError).toHaveBeenCalledOnce()
    expect(onParseError.mock.calls[0]?.[0]).toMatchObject({
      code: 'UNSUPPORTED_FILTER',
      column: 'col'
    })
  })
})

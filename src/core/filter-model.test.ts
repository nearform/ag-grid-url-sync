import { describe, it, expect, vi } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { readUrlFilters } from './url-parser.js'
import { writeUrlFilters, serializeFilters } from './url-generator.js'
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
    const url = writeUrlFilters('https://app.test/?tab=1', ALL, grouped(format))

    expect(readUrlFilters(url, grouped(format))).toEqual(ALL)
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

  // A custom filter's model can be any value (#283 review). AG Grid ignores
  // one that a built-in filter cannot read. Null is no filter.
  it('keeps a column model of any JSON value, and drops null', () => {
    const onParseError = vi.fn<(error: Error) => void>()
    const value = JSON.stringify({ name: 'jo', tags: [1, 2], n: 5, x: null })
    const encoded = format === 'json' ? value : btoa(value)

    expect(deserializeGrouped(encoded, format, { onParseError })).toEqual({
      name: 'jo',
      tags: [1, 2],
      n: 5
    })
    expect(onParseError).not.toHaveBeenCalled()
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

describe('readUrlFilters: the AG Grid model', () => {
  it('gives AG Grid operation names and date fields', () => {
    expect(
      readUrlFilters(
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
    const url = writeUrlFilters('https://app.test/', SIMPLE, {
      serialization: 'grouped',
      format: 'querystring'
    })

    expect(
      readUrlFilters(url, { serialization: 'grouped', format: 'querystring' })
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

    const url = writeUrlFilters(
      'https://app.test/',
      { ...model, ...SIMPLE },
      {
        onParseError
      }
    )

    expect(readUrlFilters(url)).toEqual(SIMPLE)
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

    writeUrlFilters(
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
      writeUrlFilters('http://x.test/', { col: column }, { onParseError })
    ).toBe('http://x.test')
    expect(onParseError).toHaveBeenCalledOnce()
    expect(onParseError.mock.calls[0]?.[0]).toMatchObject({
      code: 'UNSUPPORTED_FILTER',
      column: 'col'
    })
  })
})

// maxValueLength in json and base64 covers each string value that a filter
// keeps: text, set values, and the strings of a custom model (#283 review)
describe.each(['json', 'base64'] as const)(
  '%s: maxValueLength for other filters',
  format => {
    it.each([
      ['a set value', { filterType: 'set', values: ['ok', 'x'.repeat(30)] }],
      [
        'a custom model string',
        { mode: 'after', value: { note: 'x'.repeat(30) } }
      ],
      ['a custom model that is a string', 'x'.repeat(30)],
      [
        'a set value in a multi filter',
        {
          filterType: 'multi',
          filterModels: [null, { filterType: 'set', values: ['x'.repeat(30)] }]
        }
      ]
    ])('drops a column with %s over the limit', (_name, column) => {
      const onParseError = vi.fn<(error: Error) => void>()
      const config = { ...grouped(format), maxValueLength: 20, onParseError }

      expect(serializeGrouped({ ...SET, col: column }, config).value).toBe(
        serializeGrouped(SET, grouped(format)).value
      )
      expect(onParseError.mock.calls[0]?.[0]).toMatchObject({
        code: 'VALUE_TOO_LONG',
        column: 'col'
      })
    })

    it('keeps a date column with a short limit', () => {
      const onParseError = vi.fn<(error: Error) => void>()

      const date = {
        born: {
          filterType: 'date',
          type: 'lessThan',
          dateFrom: '2024-01-15 00:00:00'
        }
      }

      const config = { ...grouped(format), maxValueLength: 5, onParseError }

      expect(
        deserializeGrouped(serializeGrouped(date, config).value, format)
      ).toEqual(date)
      expect(onParseError).not.toHaveBeenCalled()
    })
  }
)

// A custom filter's model can be any value, for example an array (#283
// review). JSON keeps a column model that is an object.
describe('a custom filter with a model that is not an object', () => {
  it.each([
    ['an array', ['a', 'b']],
    ['a string', 'after-2008'],
    ['a number', 2008],
    ['a boolean', true]
  ])('json round-trips %s with no issue', (_name, custom) => {
    const onParseError = vi.fn<(error: Error) => void>()

    const url = writeUrlFilters(
      'http://x.test/',
      { ...SET, custom },
      { ...grouped('json'), onParseError }
    )

    expect(readUrlFilters(url, grouped('json'))).toEqual({ ...SET, custom })
    expect(onParseError).not.toHaveBeenCalled()
  })

  it('the individual codec reports it as UNSUPPORTED_FILTER', () => {
    const onParseError = vi.fn<(error: Error) => void>()

    expect(
      writeUrlFilters(
        'http://x.test/',
        { custom: 'after-2008' },
        { onParseError }
      )
    ).toBe('http://x.test')
    expect(onParseError.mock.calls[0]?.[0]).toMatchObject({
      code: 'UNSUPPORTED_FILTER',
      column: 'custom'
    })
  })
})

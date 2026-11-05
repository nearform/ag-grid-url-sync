import { describe, it, expect, vi } from 'vitest'
import { readUrlFilters } from './url-parser.js'
import { serializeFilters } from './url-generator.js'
import { serializeGrouped } from './serialization/grouped.js'
import { createGridUrlSync } from './grid-url-sync.js'
import { fromGridModel } from './grid-integration.js'
import {
  URLSyncError,
  InvalidFilterError,
  InvalidSerializationError,
  InvalidURLError,
  type AGGridUrlSyncConfig,
  type FilterState,
  type IssueCode
} from './types.js'
import {
  asGridApi,
  createGridApiSpies,
  createGridListeners
} from '../test-helpers.js'

// Each report gives the class, the code and the column that a caller can
// switch on (#220). A caller who checks the class must still match.

const LONG = 'a'.repeat(201)

const longText: FilterState = {
  name: { filterType: 'text', type: 'contains', filter: LONG }
}

type ErrorClass = typeof URLSyncError

/** The errors that one call reports to onParseError */
function reported(run: (options: AGGridUrlSyncConfig) => void): Error[] {
  const onParseError = vi.fn<(error: Error) => void>()
  run({ onParseError })

  return onParseError.mock.calls.map(([error]) => error)
}

type GridSpies = ReturnType<typeof createGridApiSpies>

/**
 * Makes a sync on a grid that the setup prepares. Each issue of the sync goes
 * to the onParseError of the options, so a table case can read it.
 */
function syncOn(setup: (api: GridSpies) => void, options: AGGridUrlSyncConfig) {
  const api = createGridApiSpies()
  setup(api)

  const listeners = createGridListeners()

  return createGridUrlSync({
    api: asGridApi({
      ...api,
      addEventListener: listeners.addEventListener,
      removeEventListener: listeners.removeEventListener
    }),
    applyUrlOnCreate: false,
    onIssue: ({ issue }) => options.onParseError?.(issue)
  })
}

const grouped = (value: string) =>
  `?${new URLSearchParams({ grid_filters: value })}`

const CASES: [
  string,
  (options: AGGridUrlSyncConfig) => void,
  ErrorClass,
  IssueCode,
  string | undefined
][] = [
  [
    'a param with no operation',
    o => readUrlFilters('?f_name=x', o),
    InvalidFilterError,
    'INVALID_PARAM',
    undefined
  ],
  [
    'an unknown operation',
    o => readUrlFilters('?f_name_regex=x', o),
    InvalidFilterError,
    'INVALID_PARAM',
    'name'
  ],
  [
    'a value that is not a number',
    o => readUrlFilters('?f_age_gt=abc', o),
    InvalidFilterError,
    'INVALID_NUMBER',
    'age'
  ],
  [
    'a range with one value',
    o => readUrlFilters('?f_age_range=5', o),
    InvalidFilterError,
    'INVALID_NUMBER',
    'age'
  ],
  [
    'a range in the wrong order',
    o => readUrlFilters('?f_age_range=5,1', o),
    InvalidFilterError,
    'INVALID_NUMBER',
    'age'
  ],
  [
    'a date that does not exist',
    o => readUrlFilters('?f_d_before=2024-13-01', o),
    InvalidFilterError,
    'INVALID_DATE',
    'd'
  ],
  [
    'a date range in the wrong order',
    o => readUrlFilters('?f_d_daterange=2024-12-01,2024-01-01', o),
    InvalidFilterError,
    'INVALID_DATE',
    'd'
  ],
  [
    'a URL value over maxValueLength',
    o => readUrlFilters(`?f_name_contains=${LONG}`, o),
    InvalidFilterError,
    'VALUE_TOO_LONG',
    'name'
  ],
  [
    'a written value over maxValueLength',
    o => serializeFilters(longText, o),
    InvalidFilterError,
    'VALUE_TOO_LONG',
    'name'
  ],
  [
    'a grouped querystring value over maxValueLength',
    o => readUrlFilters(grouped(`f_name_contains=${LONG}`), o),
    InvalidSerializationError,
    'VALUE_TOO_LONG',
    'name'
  ],
  [
    'a grouped JSON value that does not decode',
    o => readUrlFilters(grouped('{bad'), { ...o, format: 'json' }),
    InvalidSerializationError,
    'INVALID_GROUPED',
    undefined
  ],
  [
    'a grouped base64 value that does not decode',
    o => readUrlFilters(grouped('!!!'), { ...o, format: 'base64' }),
    InvalidSerializationError,
    'INVALID_GROUPED',
    undefined
  ],
  [
    'a written JSON value over maxValueLength',
    o => serializeGrouped(longText, { ...o, format: 'json' }),
    InvalidSerializationError,
    'VALUE_TOO_LONG',
    'name'
  ],
  [
    'a grid that throws an Error when read',
    o => {
      const sync = syncOn(
        api =>
          api.getFilterModel.mockImplementation(() => {
            throw new Error('x')
          }),
        o
      )

      sync.destroy()
    },
    URLSyncError,
    'GRID_ERROR',
    undefined
  ],
  [
    'a grid that throws a value that is not an Error',
    o => {
      const sync = syncOn(
        api =>
          api.getFilterModel.mockImplementation(() => {
            throw new String('x')
          }),
        o
      )

      sync.destroy()
    },
    URLSyncError,
    'GRID_ERROR',
    undefined
  ],
  [
    'an unknown number operation in the grid',
    o =>
      fromGridModel(
        {
          n: { filterType: 'number', type: 'foo', filter: 1 }
        },
        o
      ),
    InvalidFilterError,
    'INVALID_PARAM',
    'n'
  ],
  [
    'a grid string that is not a number',
    o =>
      fromGridModel(
        {
          n: { filterType: 'number', type: 'equals', filter: 'abc' }
        },
        o
      ),
    InvalidFilterError,
    'INVALID_NUMBER',
    'n'
  ],
  [
    'a grid that throws when written',
    o => {
      const sync = syncOn(
        api =>
          api.setFilterModel.mockImplementation(() => {
            throw new Error('x')
          }),
        o
      )

      sync.applyFilters({})

      sync.destroy()
    },
    URLSyncError,
    'GRID_ERROR',
    undefined
  ]
]

describe('issue codes (#220)', () => {
  it.each(CASES)('%s', (_, run, errorClass, code, column) => {
    const errors = reported(run)

    expect(errors).toHaveLength(1)

    const [error] = errors

    expect(error).toBeInstanceOf(errorClass)
    expect(error).toMatchObject({ code })

    if (column === undefined) {
      expect(error).not.toHaveProperty('column')
    } else {
      expect(error).toHaveProperty('column', column)
    }
  })

  it('throws InvalidURLError with INVALID_URL for a host with no scheme', () => {
    expect(() => readUrlFilters('example.com?f_a_eq=1')).toThrow(
      expect.objectContaining({ code: 'INVALID_URL' })
    )
    expect(() => readUrlFilters('example.com?f_a_eq=1')).toThrow(
      InvalidURLError
    )
  })

  it("keeps the grid's error as the cause of GRID_ERROR", () => {
    const gridError = new Error('grid failed')

    const [error] = reported(o => {
      const sync = syncOn(
        api =>
          api.getFilterModel.mockImplementation(() => {
            throw gridError
          }),
        o
      )

      sync.destroy()
    })

    expect(error?.cause).toBe(gridError)
  })
})

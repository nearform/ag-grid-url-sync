import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { writeUrlFilters, serializeFilters } from './url-generator.js'
import { serializeGrouped } from './serialization/grouped.js'
import { readUrlFilters } from './url-parser.js'
import { resolveParamPrefix } from './individual-params.js'
import { stateToModel } from './model-form.js'
import { DEFAULT_CONFIG } from './validation.js'
import type {
  ColumnFilter,
  FilterState,
  ResolvedOptions,
  SerializationFormat
} from './types.js'
import { operationsOnlyFor } from './operators.js'

const TEXT_ONLY_OPERATIONS = operationsOnlyFor('text')
const NUMBER_ONLY_OPERATIONS = operationsOnlyFor('number')
const DATE_ONLY_OPERATIONS = operationsOnlyFor('date')

// Property-based round-trip tests (#216).
//
// The main property: for any valid filter state s, with m its AG Grid model,
// readUrlFilters(writeUrlFilters(base, m, cfg), cfg) deep-equals m, and the
// host app's params in `base` are kept exactly (#225: the public functions
// take and give AG Grid's FilterModel; the arbitraries make the library's
// own filter state, the form that the individual codec holds).
//
// "Valid" follows the documented limits, which are by design and not bugs:
// text values are not empty and not over maxValueLength, dates are real
// YYYY-MM-DD dates, ranges have from <= to, and host params do not use the
// filter prefix or the grouped param name.
//
// Known failures are written as `it.fails`, with a link to the issue that
// fixes them. When that fix is merged, the test starts to pass, `it.fails`
// then fails, and the test must be changed to `it`.

// ----------------------------------------------------------------------------
// Arbitraries
// ----------------------------------------------------------------------------

/** Characters that are hard for a URL codec, plus some plain ones */
const hardChar = fc.constantFrom(
  'a',
  'b',
  'Z',
  '0',
  '7',
  '_',
  '-',
  '.',
  ',',
  ' ',
  '=',
  '&',
  '?',
  '#',
  '%',
  '+',
  '/',
  ':',
  'é',
  'ß',
  '日',
  '😀',
  // With digits and a space, a text value can look like an exponent (#238)
  'e',
  'E'
)

const columnId = fc.oneof(
  fc
    .string({ unit: hardChar, minLength: 1, maxLength: 12 })
    // A column name that is empty after trim is rejected by the parser
    .filter(id => id.trim() !== ''),
  // Names of Object.prototype properties (#253)
  fc.constantFrom('__proto__', 'constructor', 'prototype')
)

const textValue = fc.oneof(
  fc.string({ unit: hardChar, minLength: 1, maxLength: 40 }),
  // Exactly maxValueLength UTF-16 code units, the longest value allowed
  fc.string({
    unit: fc.constantFrom('a', ' ', '=', '&', ',', 'é', '日'),
    minLength: DEFAULT_CONFIG.maxValueLength,
    maxLength: DEFAULT_CONFIG.maxValueLength
  }),
  // Text shaped like a number with a space, such as a part code "2E 5". The
  // URL writes the space as `+`, so it must not come back as an exponent (#238)
  fc.stringMatching(/^[+-]?\d{1,3}(\.\d{0,2})?[eE] \d{1,3}$/)
)

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * A number as the URL format defines it. This is an oracle written apart
 * from the parser on purpose: a filter that called the parser would also
 * remove the values that show a parser bug, such as "2E 5" read as a number.
 */
const STRICT_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

/** A text value that the parser cannot take as a number or a date */
const unambiguousTextValue = textValue.filter(
  value => !STRICT_NUMBER.test(value.trim()) && !ISO_DATE.test(value.trim())
)

const numberValue = fc
  .double({ noNaN: true, noDefaultInfinity: true })
  // -0 writes as "0" in a URL, so it cannot come back as -0
  .filter(n => !Object.is(n, -0))

/** Finite numbers outside the safe integer range (#238) */
const unsafeNumberValue = numberValue.filter(
  n => Math.abs(n) > Number.MAX_SAFE_INTEGER
)

const dateValue = fc
  .date({
    min: new Date('1000-01-01T00:00:00.000Z'),
    max: new Date('9999-12-31T00:00:00.000Z'),
    noInvalidDate: true
  })
  .map(date => date.toISOString().slice(0, 10))

const sortedPair = <T>(arb: fc.Arbitrary<T>) =>
  fc
    .tuple(arb, arb)
    .map(([a, b]) => (a <= b ? ([a, b] as const) : ([b, a] as const)))

const textFilter = (value: fc.Arbitrary<string>) =>
  fc.oneof(
    fc.record({
      filterType: fc.constant('text' as const),
      type: fc.constantFrom(...TEXT_ONLY_OPERATIONS, 'eq', 'notEqual'),
      filter: value
    }),
    fc.record({
      filterType: fc.constant('text' as const),
      type: fc.constantFrom('blank', 'notBlank'),
      filter: fc.constant('')
    })
  )

const numberFilter = fc.oneof(
  fc.record({
    filterType: fc.constant('number' as const),
    type: fc.constantFrom(
      ...NUMBER_ONLY_OPERATIONS.filter(op => op !== 'inRange'),
      'eq',
      'notEqual'
    ),
    filter: numberValue
  }),
  sortedPair(numberValue).map(([from, to]) => ({
    filterType: 'number' as const,
    type: 'inRange' as const,
    filter: from,
    filterTo: to
  }))
)

const dateFilter = fc.oneof(
  fc.record({
    filterType: fc.constant('date' as const),
    type: fc.constantFrom(
      ...DATE_ONLY_OPERATIONS.filter(op => op !== 'dateRange'),
      'eq',
      'notEqual'
    ),
    filter: dateValue
  }),
  sortedPair(dateValue).map(([from, to]) => ({
    filterType: 'date' as const,
    type: 'dateRange' as const,
    filter: from,
    filterTo: to
  }))
)

/**
 * Filters whose type the URL keeps: the operation gives the type, or the
 * column types give it (#224). Text values that look like a number or a date
 * are left out, so these properties do not depend on the lookup for them.
 */
const unambiguousFilter: fc.Arbitrary<ColumnFilter> = fc.oneof(
  textFilter(unambiguousTextValue),
  numberFilter,
  dateFilter
)

/**
 * Filters that the prefixed URL format cannot tell apart, because it does not
 * record the filter type (#224, bugs 1 and 3)
 */
const typeLosingFilter: fc.Arbitrary<ColumnFilter> = fc.oneof(
  // Text that looks like a number or a date
  fc.record({
    filterType: fc.constant('text' as const),
    type: fc.constantFrom('eq', 'notEqual'),
    filter: fc.oneof(numberValue.map(String), dateValue)
  }),
  // Blank operations on number and date filters come back as text
  fc.record({
    filterType: fc.constant('number' as const),
    type: fc.constantFrom('blank', 'notBlank'),
    filter: fc.constant(0)
  }),
  fc.record({
    filterType: fc.constant('date' as const),
    type: fc.constantFrom('blank', 'notBlank'),
    filter: fc.constant('')
  })
)

const filterState = (filter: fc.Arbitrary<ColumnFilter>) =>
  fc.dictionary(columnId, filter, { maxKeys: 5 })

/** Host params that do not use the filter prefix or the grouped param name */
const hostParams = fc.array(
  fc.tuple(
    fc
      .string({ unit: hardChar, minLength: 1, maxLength: 8 })
      .filter(
        key =>
          !key.startsWith(DEFAULT_CONFIG.paramPrefix) &&
          key !== DEFAULT_CONFIG.groupedParam
      ),
    fc.string({ unit: hardChar, maxLength: 12 })
  ),
  { maxLength: 4 }
)

const baseUrl = hostParams.map(params => {
  const url = new URL('https://example.com/page')

  for (const [key, value] of params) url.searchParams.append(key, value)

  return { url: url.toString(), params }
})

// ----------------------------------------------------------------------------
// Configs and helpers
// ----------------------------------------------------------------------------

type Mode = { name: string; config: ResolvedOptions }

const makeConfig = (
  serialization: 'individual' | 'grouped',
  format: SerializationFormat = 'querystring'
): ResolvedOptions => ({
  ...DEFAULT_CONFIG,
  serialization,
  format,
  // Valid input must report no errors
  onParseError: error => {
    throw error
  }
})

const MODES: Mode[] = [
  { name: 'individual', config: makeConfig('individual') },
  // #228: other prefixes. Host param keys from `hardChar` cannot start with
  // these, so the host params stay host params.
  ...['', 'filter', 'x-'].map(paramPrefix => ({
    name: `individual, paramPrefix ${JSON.stringify(paramPrefix)}`,
    config: { ...makeConfig('individual'), paramPrefix }
  })),
  { name: 'grouped querystring', config: makeConfig('grouped', 'querystring') },
  { name: 'grouped json', config: makeConfig('grouped', 'json') },
  { name: 'grouped base64', config: makeConfig('grouped', 'base64') }
]

/** Modes that write the filter type in the URL */
const TYPED_MODES = MODES.filter(
  mode =>
    mode.config.serialization === 'grouped' &&
    mode.config.format !== 'querystring'
)

/** Modes that write prefixed params, which have no filter type */
const UNTYPED_MODES = MODES.filter(mode => !TYPED_MODES.includes(mode))

/**
 * Encode, then decode with the column types of the state, as the grid gives
 * them (#224)
 */
const roundTrip = (state: FilterState, base: string, config: ResolvedOptions) =>
  readUrlFilters(writeUrlFilters(base, stateToModel(state), config), {
    ...config,
    columnTypes: column => state[column]?.filterType
  })

const isFilterParam = (key: string, config: ResolvedOptions) =>
  key === config.groupedParam ||
  key.startsWith(resolveParamPrefix(config.paramPrefix))

// ----------------------------------------------------------------------------
// Properties
// ----------------------------------------------------------------------------

describe('URL round-trip properties (#216)', () => {
  describe.each(MODES)('$name', ({ config }) => {
    it('round-trips filters whose type the URL keeps', () => {
      fc.assert(
        fc.property(filterState(unambiguousFilter), baseUrl, (state, base) => {
          expect(roundTrip(state, base.url, config)).toEqual(
            stateToModel(state)
          )
        })
      )
    })

    // String(n) and parseFloat give back the same double, so every finite
    // number round-trips (#238)
    it('round-trips numbers outside the safe integer range (#238)', () => {
      fc.assert(
        fc.property(
          columnId,
          fc.constantFrom(
            'greaterThan',
            'greaterThanOrEqual',
            'lessThan',
            'lessThanOrEqual',
            'eq',
            'notEqual'
          ),
          unsafeNumberValue,
          baseUrl,
          (id, type, n, base) => {
            const state: FilterState = {
              [id]: { filterType: 'number', type, filter: n }
            }

            expect(roundTrip(state, base.url, config)).toEqual(
              stateToModel(state)
            )
          }
        )
      )
    })

    it('round-trips ranges outside the safe integer range (#238)', () => {
      fc.assert(
        fc.property(
          columnId,
          sortedPair(unsafeNumberValue),
          baseUrl,
          (id, [from, to], base) => {
            const state: FilterState = {
              [id]: {
                filterType: 'number',
                type: 'inRange',
                filter: from,
                filterTo: to
              }
            }

            expect(roundTrip(state, base.url, config)).toEqual(
              stateToModel(state)
            )
          }
        )
      )
    })

    it('keeps the host params exactly', () => {
      fc.assert(
        fc.property(filterState(unambiguousFilter), baseUrl, (state, base) => {
          const url = new URL(
            writeUrlFilters(base.url, stateToModel(state), config)
          )

          const kept = [...url.searchParams].filter(
            ([key]) => !isFilterParam(key, config)
          )

          expect(kept).toEqual(base.params)
        })
      )
    })
  })

  describe.each(TYPED_MODES)('$name', ({ config }) => {
    it('round-trips every filter type, also for shared operations', () => {
      fc.assert(
        fc.property(
          filterState(fc.oneof(unambiguousFilter, typeLosingFilter)),
          baseUrl,
          (state, base) => {
            expect(roundTrip(state, base.url, config)).toEqual(
              stateToModel(state)
            )
          }
        )
      )
    })
  })

  describe.each(TYPED_MODES)('$name', ({ config }) => {
    // Set, multi and custom filters: any JSON model of a column (#225). The
    // filterType is not a simple type, so no 0.5 form or length rule applies.
    const otherModel = fc
      .record({
        filterType: fc.constantFrom('set', 'multi', 'custom'),
        rest: fc.dictionary(
          fc.string().filter(key => key !== 'filterType'),
          // What JSON gives back: no -0
          fc.jsonValue().map(value => JSON.parse(JSON.stringify(value))),
          { maxKeys: 4 }
        )
      })
      .map(({ filterType, rest }) => ({ ...rest, filterType }))

    it('round-trips any AG Grid filter model (#225)', () => {
      fc.assert(
        fc.property(
          filterState(fc.oneof(unambiguousFilter, typeLosingFilter)),
          fc.dictionary(columnId, otherModel, { maxKeys: 3 }),
          baseUrl,
          (state, others, base) => {
            const model = { ...stateToModel(state), ...others }
            const url = writeUrlFilters(base.url, model, config)

            expect(readUrlFilters(url, config)).toEqual(model)
          }
        )
      )
    })
  })

  describe.each(UNTYPED_MODES)('$name', ({ config }) => {
    // With no column types, a value stays text: "007" and "2024-01-15" come
    // back as text, not as a number or a date (#224)
    it('round-trips any text value with no column types (#224)', () => {
      fc.assert(
        fc.property(
          filterState(textFilter(textValue)),
          baseUrl,
          (state, base) => {
            expect(
              readUrlFilters(
                writeUrlFilters(base.url, stateToModel(state), config),
                config
              )
            ).toEqual(stateToModel(state))
          }
        )
      )
    })

    // The prefixed format does not record the filter type of a shared
    // operation: the decoder takes it from the column (#224)
    it('round-trips every filter type, also for shared operations (#224)', () => {
      fc.assert(
        fc.property(
          filterState(typeLosingFilter).filter(
            state => Object.keys(state).length > 0
          ),
          baseUrl,
          (state, base) => {
            expect(roundTrip(state, base.url, config)).toEqual(
              stateToModel(state)
            )
          }
        )
      )
    })
  })
})

// Encoding drops a value that it cannot write and reports it. It never throws
// for a filter value (#220).
describe('encode never throws (#220)', () => {
  const anyFilter = fc.oneof(
    unambiguousFilter,
    typeLosingFilter,
    textFilter(fc.string({ unit: hardChar, maxLength: 300 }))
  )

  it.each(MODES)('$name', ({ config }) => {
    fc.assert(
      fc.property(
        filterState(anyFilter),
        baseUrl,
        fc.integer({ min: 0, max: 300 }),
        (state, base, maxValueLength) => {
          const options = { ...config, maxValueLength, onParseError: () => {} }
          const model = stateToModel(state)

          expect(() => writeUrlFilters(base.url, model, options)).not.toThrow()
          expect(() => serializeFilters(model, options)).not.toThrow()
          expect(() => serializeGrouped(model, options)).not.toThrow()
        }
      )
    )
  })
})

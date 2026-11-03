import { describe, it, expect } from 'vitest'
import {
  URLSyncError,
  InvalidFilterError,
  InvalidDateError,
  InvalidURLError,
  InvalidSerializationError
} from './types.js'
import { attachColumn } from './issue-columns.js'

// Every error has a code and, when it is known, a column (#220)

describe('error codes', () => {
  it.each([
    ['URLSyncError', new URLSyncError('m'), 'UNKNOWN'],
    ['InvalidFilterError', new InvalidFilterError('m'), 'INVALID_PARAM'],
    ['InvalidDateError', new InvalidDateError('m'), 'INVALID_DATE'],
    ['InvalidURLError', new InvalidURLError('m'), 'INVALID_URL'],
    [
      'InvalidSerializationError',
      new InvalidSerializationError('json', new Error('x')),
      'INVALID_GROUPED'
    ]
  ] as const)('%s has a default code', (_, error, code) => {
    expect(error.code).toBe(code)
    expect(error.column).toBeUndefined()
  })

  it('takes a code and a column from its details', () => {
    const error = new InvalidFilterError('m', undefined, {
      code: 'VALUE_TOO_LONG',
      column: 'name'
    })

    expect(error.code).toBe('VALUE_TOO_LONG')
    expect(error.column).toBe('name')
    expect(error).toBeInstanceOf(InvalidFilterError)
    expect(error).toBeInstanceOf(URLSyncError)
    expect(error).toBeInstanceOf(Error)
  })

  it('keeps the old constructor forms', () => {
    const cause = new Error('cause')

    expect(new InvalidFilterError('m', cause).cause).toBe(cause)
    expect(new URLSyncError('m').name).toBe('URLSyncError')
    expect(new InvalidFilterError('m').name).toBe('InvalidFilterError')
    expect(new InvalidDateError('m').name).toBe('InvalidDateError')
    expect(new InvalidURLError('m').name).toBe('InvalidURLError')
    expect(new InvalidSerializationError('json', cause).name).toBe(
      'InvalidSerializationError'
    )
  })
})

describe('InvalidSerializationError', () => {
  it('is a URLSyncError with the format', () => {
    const error = new InvalidSerializationError('base64', new Error('x'))

    expect(error).toBeInstanceOf(URLSyncError)
    expect(error.format).toBe('base64')
    expect(error.message).toBe('Invalid base64 serialization: x')
  })

  it('takes the code and the column of an inner issue', () => {
    const inner = new InvalidFilterError('m', undefined, {
      code: 'VALUE_TOO_LONG',
      column: 'name'
    })

    const error = new InvalidSerializationError('querystring', inner)

    expect(error.code).toBe('VALUE_TOO_LONG')
    expect(error.column).toBe('name')
    expect(error.format).toBe('querystring')
    expect(error.message).toBe('Invalid querystring serialization: m')
    expect(error.cause).toBe(inner)
  })
})

describe('attachColumn', () => {
  it('sets the column one time only', () => {
    const error = new InvalidFilterError('m')

    attachColumn(error, 'a')
    attachColumn(error, 'b')

    expect(error.column).toBe('a')
  })

  it('does not change a column from the details', () => {
    const error = new InvalidFilterError('m', undefined, { column: 'x' })

    attachColumn(error, 'a')

    expect(error.column).toBe('x')
  })
})

// The column is an own property, so loggers and JSON keep it (#220 review)
describe('column as an own property', () => {
  it('is in JSON and in the own keys when it is known', () => {
    const error = new InvalidFilterError('m', undefined, {
      code: 'VALUE_TOO_LONG',
      column: 'name'
    })

    expect(Object.keys(error)).toContain('column')
    expect(JSON.parse(JSON.stringify(error))).toMatchObject({
      code: 'VALUE_TOO_LONG',
      column: 'name'
    })
  })

  it('is set by attachColumn as an own property', () => {
    const error = new InvalidFilterError('m')
    attachColumn(error, 'age')

    expect(Object.keys(error)).toContain('column')
    expect({ ...error }).toMatchObject({ column: 'age' })
  })

  it('is not an own key when it is not known', () => {
    expect(Object.keys(new InvalidFilterError('m'))).not.toContain('column')
  })
})

// Each issue has a severity, derived from its code (#221)
describe('error severity', () => {
  it('is a warning for a data issue', () => {
    expect(new InvalidFilterError('m').severity).toBe('warning')
    expect(new InvalidURLError('m').severity).toBe('warning')
  })

  it.each(['GRID_ERROR', 'HISTORY_WRITE_FAILED', 'UNKNOWN'] as const)(
    'is an error for %s',
    code => {
      expect(new URLSyncError('m', undefined, { code }).severity).toBe('error')
    }
  )

  it('is not an own property, so toEqual comparisons do not change', () => {
    expect(Object.keys(new InvalidURLError('m'))).not.toContain('severity')
  })
})

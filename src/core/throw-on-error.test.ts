import { describe, it, expect, vi } from 'vitest'
import { parseUrlFilters } from './url-parser.js'
import { generateUrl, serializeFilters } from './url-generator.js'
import { getFilterModel } from './grid-integration.js'
import {
  InvalidFilterError,
  InvalidSerializationError,
  URLSyncError,
  type FilterState
} from './types.js'
import { toError } from './to-error.js'
import { asGridApi, createGridApiSpies } from '../test-helpers.js'

// throwOnError: an issue that it picks is thrown instead of reported (#229)

const LONG = 'a'.repeat(201)

const longText: FilterState = {
  name: { filterType: 'text', type: 'contains', filter: LONG }
}

const grouped = (value: string) =>
  `?${new URLSearchParams({ grid_filters: value })}`

/** The error that the call throws */
function thrown(run: () => void): Error {
  try {
    run()
  } catch (error) {
    return toError(error)
  }

  throw new Error('expected the call to throw')
}

describe('throwOnError (#229)', () => {
  it('throws the issue instead of reporting it', () => {
    const onParseError = vi.fn()

    const error = thrown(() =>
      parseUrlFilters('?f_age_gt=abc', { throwOnError: true, onParseError })
    )

    expect(error).toBeInstanceOf(InvalidFilterError)
    expect(error).toMatchObject({ code: 'INVALID_NUMBER', column: 'age' })
    expect(onParseError).not.toHaveBeenCalled()
  })

  it('throws only the issues that a predicate picks', () => {
    const onParseError = vi.fn()

    const error = thrown(() =>
      parseUrlFilters(`?f_age_gt=abc&f_name_contains=${LONG}`, {
        throwOnError: issue => issue.code === 'VALUE_TOO_LONG',
        onParseError
      })
    )

    expect(error).toMatchObject({ code: 'VALUE_TOO_LONG', column: 'name' })
    expect(onParseError).toHaveBeenCalledOnce()
    expect(onParseError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_NUMBER' })
    )
  })

  it.each([false, undefined])(
    'reports and does not throw when it is %s',
    throwOnError => {
      const onParseError = vi.fn()

      expect(() =>
        parseUrlFilters(`?f_age_gt=abc&f_name_contains=${LONG}`, {
          throwOnError,
          onParseError
        })
      ).not.toThrow()
      expect(onParseError).toHaveBeenCalledTimes(2)
    }
  )

  it('throws one wrapper for an issue inside a grouped querystring value', () => {
    const error = thrown(() =>
      parseUrlFilters(grouped(`f_name_contains=${LONG}`), {
        throwOnError: true
      })
    )

    expect(error).toBeInstanceOf(InvalidSerializationError)
    expect(error).toMatchObject({ code: 'VALUE_TOO_LONG', column: 'name' })
    expect(error.cause).toBeInstanceOf(InvalidFilterError)
    expect(error.cause).not.toBeInstanceOf(InvalidSerializationError)
  })

  it('throws one wrapper for an issue inside a grouped base64 value', () => {
    const error = thrown(() =>
      parseUrlFilters(grouped(btoa(JSON.stringify(longText))), {
        format: 'base64',
        throwOnError: true
      })
    )

    expect(error).toBeInstanceOf(InvalidSerializationError)
    expect(error).toMatchObject({ code: 'VALUE_TOO_LONG', column: 'name' })
    expect(error.message).not.toContain('Base64 decoding failed')
  })

  it('throws from serializeFilters and generateUrl', () => {
    expect(
      thrown(() => serializeFilters(longText, { throwOnError: true }))
    ).toMatchObject({ code: 'VALUE_TOO_LONG' })
    expect(
      thrown(() =>
        generateUrl('https://example.com/', longText, { throwOnError: true })
      )
    ).toMatchObject({ code: 'VALUE_TOO_LONG' })
  })

  it('throws from getFilterModel, also for a grid error', () => {
    const api = createGridApiSpies()
    api.getFilterModel.mockReturnValue({
      n: { filterType: 'number', type: 'foo', filter: 1 }
    })

    expect(
      thrown(() => getFilterModel(asGridApi(api), { throwOnError: true }))
    ).toMatchObject({ code: 'INVALID_PARAM' })

    api.getFilterModel.mockImplementation(() => {
      throw new Error('grid failed')
    })

    const error = thrown(() =>
      getFilterModel(asGridApi(api), { throwOnError: true })
    )

    expect(error).toBeInstanceOf(URLSyncError)
    expect(error).toMatchObject({ code: 'GRID_ERROR' })
  })
})

import { describe, it, expect, vi } from 'vitest'
import { readUrlFilters } from './url-parser.js'
import { writeUrlFilters, serializeFilters } from './url-generator.js'
import { createGridUrlSync } from './grid-url-sync.js'
import { fromGridModel } from './grid-integration.js'
import {
  InvalidFilterError,
  InvalidSerializationError,
  URLSyncError,
  type FilterState
} from './types.js'
import { toError } from './to-error.js'
import {
  asGridApi,
  createGridApiSpies,
  createGridListeners
} from '../test-helpers.js'

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
      readUrlFilters('?f_age_gt=abc', { throwOnError: true, onParseError })
    )

    expect(error).toBeInstanceOf(InvalidFilterError)
    expect(error).toMatchObject({ code: 'INVALID_NUMBER', column: 'age' })
    expect(onParseError).not.toHaveBeenCalled()
  })

  it('throws only the issues that a predicate picks', () => {
    const onParseError = vi.fn()

    const error = thrown(() =>
      readUrlFilters(`?f_age_gt=abc&f_name_contains=${LONG}`, {
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
        readUrlFilters(`?f_age_gt=abc&f_name_contains=${LONG}`, {
          throwOnError,
          onParseError
        })
      ).not.toThrow()
      expect(onParseError).toHaveBeenCalledTimes(2)
    }
  )

  it('throws one wrapper for an issue inside a grouped querystring value', () => {
    const error = thrown(() =>
      readUrlFilters(grouped(`f_name_contains=${LONG}`), {
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
      readUrlFilters(grouped(btoa(JSON.stringify(longText))), {
        format: 'base64',
        throwOnError: true
      })
    )

    expect(error).toBeInstanceOf(InvalidSerializationError)
    expect(error).toMatchObject({ code: 'VALUE_TOO_LONG', column: 'name' })
    expect(error.message).not.toContain('Base64 decoding failed')
  })

  it('throws from serializeFilters and writeUrlFilters', () => {
    expect(
      thrown(() => serializeFilters(longText, { throwOnError: true }))
    ).toMatchObject({ code: 'VALUE_TOO_LONG' })
    expect(
      thrown(() =>
        writeUrlFilters('https://example.com/', longText, {
          throwOnError: true
        })
      )
    ).toMatchObject({ code: 'VALUE_TOO_LONG' })
  })

  it('throws from fromGridModel for an invalid grid filter', () => {
    expect(
      thrown(() =>
        fromGridModel(
          { n: { filterType: 'number', type: 'foo', filter: 1 } },
          { throwOnError: true }
        )
      )
    ).toMatchObject({ code: 'INVALID_PARAM' })
  })

  it('throws from getUrl of the sync for a grid error', () => {
    const api = createGridApiSpies()
    const listeners = createGridListeners()
    api.getFilterModel.mockReturnValue({})

    const sync = createGridUrlSync({
      api: asGridApi({
        ...api,
        addEventListener: listeners.addEventListener,
        removeEventListener: listeners.removeEventListener
      }),
      applyUrlOnCreate: false,
      throwOnError: true
    })

    api.getFilterModel.mockImplementation(() => {
      throw new Error('grid failed')
    })

    const error = thrown(() => sync.getUrl('https://example.com/'))

    expect(error).toBeInstanceOf(URLSyncError)
    expect(error).toMatchObject({ code: 'GRID_ERROR' })

    sync.destroy()
  })
})

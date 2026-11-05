import { describe, expect, it, vi } from 'vitest'
import { grouped, individual } from './codecs.js'
import type { FilterModel } from 'ag-grid-community'
import { InvalidURLError, URLSyncError } from './types.js'
import type { Codec } from './types.js'
import { parseUrlFilters, generateUrl } from './url.js'
import { readUrlFilters } from './url-parser.js'

const LONG_URL = '?f_name_contains=john'

// SAFETY: a test object that no factory made, to pin the TypeError
const FOREIGN_CODEC = {} as Codec

const MODEL: FilterModel = {
  name: { filterType: 'text', type: 'contains', filter: 'jo' },
  age: { filterType: 'number', type: 'greaterThan', filter: 30 }
}

describe('parseUrlFilters', () => {
  it('reads the default codec', () => {
    expect(parseUrlFilters('?f_name_contains=jo')).toEqual({
      name: { filterType: 'text', type: 'contains', filter: 'jo' }
    })
  })

  it('reads the prefix of an individual codec', () => {
    const options = { codec: individual({ prefix: 'x_' }) }

    expect(parseUrlFilters('?x_name_contains=jo', options)).toEqual({
      name: { filterType: 'text', type: 'contains', filter: 'jo' }
    })
    expect(parseUrlFilters('?f_name_contains=jo', options)).toEqual({})
  })

  it('round-trips a model with a grouped codec', () => {
    const options = { codec: grouped({ param: 'g', format: 'json' }) }
    const url = generateUrl('https://a.test/p', MODEL, options)

    expect(url).toContain('g=')
    expect(parseUrlFilters(url, options)).toEqual(MODEL)
  })

  it('sends an issue to onIssue with the source api', () => {
    const onIssue = vi.fn()

    expect(parseUrlFilters(LONG_URL, { maxValueLength: 3, onIssue })).toEqual(
      {}
    )
    expect(onIssue).toHaveBeenCalledTimes(1)
    expect(onIssue).toHaveBeenCalledWith({
      issue: expect.objectContaining({
        code: 'VALUE_TOO_LONG',
        column: 'name'
      }),
      source: 'api'
    })
  })

  it('uses columnTypes for the shared operations', () => {
    const text = parseUrlFilters('?f_zip_eq=01234', {
      columnTypes: c => (c === 'zip' ? 'text' : undefined)
    })

    const number = parseUrlFilters('?f_zip_eq=01234', {
      columnTypes: c => (c === 'zip' ? 'number' : undefined)
    })

    expect(text.zip).toMatchObject({ filterType: 'text', filter: '01234' })
    expect(number.zip).toMatchObject({ filterType: 'number', filter: 1234 })
  })

  it('throws an issue with throwOnError true', () => {
    expect(() =>
      parseUrlFilters(LONG_URL, { maxValueLength: 3, throwOnError: true })
    ).toThrow(expect.objectContaining({ code: 'VALUE_TOO_LONG' }))
    expect(() =>
      parseUrlFilters(LONG_URL, { maxValueLength: 3, throwOnError: true })
    ).toThrow(URLSyncError)
  })

  it('does not throw when the throwOnError function gives false', () => {
    expect(
      parseUrlFilters(LONG_URL, {
        maxValueLength: 3,
        throwOnError: i => i.code === 'INVALID_DATE'
      })
    ).toEqual({})
  })

  it('throws InvalidURLError for a host with no scheme', () => {
    expect(() => parseUrlFilters('example.com?f_a_eq=1')).toThrow(
      InvalidURLError
    )
    expect(() => parseUrlFilters('example.com?f_a_eq=1')).toThrow(
      expect.objectContaining({ code: 'INVALID_URL' })
    )
  })

  it('throws a TypeError for a codec that no factory made', () => {
    expect(() => parseUrlFilters('?a=1', { codec: FOREIGN_CODEC })).toThrow(
      new TypeError('codec must come from individual() or grouped()')
    )
  })

  it('treats a throwing onIssue like a throwing onParseError', () => {
    // reportIssue calls the handler with no try/catch, so the error of the
    // handler reaches the caller of the pure function.
    const boom = new Error('boom')

    const throwing = () => {
      throw boom
    }

    expect(() =>
      readUrlFilters(LONG_URL, { maxValueLength: 3, onParseError: throwing })
    ).toThrow(boom)
    expect(() =>
      parseUrlFilters(LONG_URL, { maxValueLength: 3, onIssue: throwing })
    ).toThrow(boom)
  })
})

describe('generateUrl', () => {
  it('writes the default codec', () => {
    expect(generateUrl('https://a.test/p', MODEL)).toBe(
      'https://a.test/p?f_name_contains=jo&f_age_gt=30'
    )
  })

  it('removes the 0.5 individual params for a grouped codec', () => {
    expect(
      generateUrl(
        'https://a.test/p?f_name_contains=x&tab=1',
        {},
        { codec: grouped() }
      )
    ).toBe('https://a.test/p?tab=1')
  })

  it('removes the grouped param for an individual codec', () => {
    const url = generateUrl('https://a.test/p?grid_filters=abc&tab=1', MODEL, {
      codec: individual()
    })

    expect(url).toContain('tab=1')
    expect(url).toContain('f_name_contains=jo')
    expect(url).not.toContain('grid_filters')
  })

  it('sends an issue to onIssue with the source api', () => {
    const onIssue = vi.fn()

    const model: FilterModel = {
      tags: { filterType: 'set', values: ['a'] }
    }

    expect(generateUrl('https://a.test/p', model, { onIssue })).toBe(
      'https://a.test/p'
    )
    expect(onIssue).toHaveBeenCalledTimes(1)
    expect(onIssue).toHaveBeenCalledWith({
      issue: expect.objectContaining({
        code: 'UNSUPPORTED_FILTER',
        column: 'tags'
      }),
      source: 'api'
    })
  })

  it('throws an issue with throwOnError true', () => {
    expect(() =>
      generateUrl(
        'https://a.test/',
        { name: { filterType: 'text', type: 'contains', filter: 'john' } },
        { maxValueLength: 3, throwOnError: true }
      )
    ).toThrow(URLSyncError)
  })

  it('throws a TypeError for a codec that no factory made', () => {
    expect(() =>
      generateUrl('https://a.test/', {}, { codec: FOREIGN_CODEC })
    ).toThrow(new TypeError('codec must come from individual() or grouped()'))
  })
})

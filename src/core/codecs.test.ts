import { describe, it, expect } from 'vitest'
import { individual, grouped, codecOptions } from './codecs.js'
import type { Codec } from './types.js'

describe('codecs (#221)', () => {
  it('individual() has the default options', () => {
    expect(codecOptions(individual())).toEqual({
      serialization: 'individual',
      paramPrefix: 'f_',
      groupedParam: 'grid_filters',
      format: 'querystring'
    })
  })

  it('individual() takes a prefix', () => {
    expect(codecOptions(individual({ prefix: 'x_' })).paramPrefix).toBe('x_')
  })

  it('individual() keeps the default for an undefined prefix', () => {
    expect(codecOptions(individual({ prefix: undefined })).paramPrefix).toBe(
      'f_'
    )
  })

  it('grouped() takes a param and a format', () => {
    expect(codecOptions(grouped({ param: 'gf', format: 'json' }))).toEqual({
      serialization: 'grouped',
      paramPrefix: 'f_',
      groupedParam: 'gf',
      format: 'json'
    })
  })

  it('grouped() has the default param and format', () => {
    expect(codecOptions(grouped())).toMatchObject({
      groupedParam: 'grid_filters',
      format: 'querystring'
    })
  })

  it('is opaque: no keys, and frozen', () => {
    const codec = individual()

    expect(Object.keys(codec)).toEqual([])
    expect(Object.isFrozen(codec)).toBe(true)
  })

  it('rejects an object that no factory made', () => {
    // SAFETY: a value that no factory made, on purpose: the test checks that
    // codecOptions rejects it
    expect(() => codecOptions({} as Codec)).toThrow(TypeError)
  })
})

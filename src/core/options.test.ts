import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_CONFIG, resolveOptions } from './options.js'
import { DEFAULT_CONFIG as VALIDATION_DEFAULT_CONFIG } from './validation.js'
import type { ParseConfig } from './types.js'
import { asGridApi, createGridApiSpies } from '../test-helpers.js'

// Config defaults live in one place, and each entry point resolves a partial
// config with them (#219)

describe('resolveOptions', () => {
  it('gives the defaults when there is no config', () => {
    expect(resolveOptions()).toEqual(DEFAULT_CONFIG)
    expect(resolveOptions({})).toEqual(DEFAULT_CONFIG)
  })

  it("keeps the caller's options and fills in the others", () => {
    const onParseError = vi.fn()

    expect(
      resolveOptions({ paramPrefix: 'flt_', format: 'json', onParseError })
    ).toEqual({
      ...DEFAULT_CONFIG,
      paramPrefix: 'flt_',
      format: 'json',
      onParseError
    })
  })

  it('gives the default for an option set to undefined (#258)', () => {
    expect(
      resolveOptions({
        paramPrefix: undefined,
        maxValueLength: undefined,
        onParseError: undefined,
        serialization: undefined,
        groupedParam: undefined,
        format: undefined
      })
    ).toEqual(DEFAULT_CONFIG)
  })

  it('keeps an empty prefix: the prefix rules read it as the default', () => {
    expect(resolveOptions({ paramPrefix: '' }).paramPrefix).toBe('')
  })

  it('gives a full config back without changes', () => {
    const config = {
      paramPrefix: 'p_',
      maxValueLength: 5,
      onParseError: vi.fn(),
      serialization: 'grouped',
      groupedParam: 'gf',
      format: 'base64'
    } as const

    expect(resolveOptions(config)).toEqual(config)
  })

  it('leaves out gridApi and other keys that are not options', () => {
    const config: ParseConfig = {
      ...DEFAULT_CONFIG,
      gridApi: asGridApi(createGridApiSpies())
    }

    expect(resolveOptions(config)).not.toHaveProperty('gridApi')
  })

  it('does not change the config that it gets', () => {
    const config = { maxValueLength: 5 }

    resolveOptions(config)

    expect(config).toEqual({ maxValueLength: 5 })
  })
})

describe('DEFAULT_CONFIG', () => {
  it('is the same object from the validation module', () => {
    expect(VALIDATION_DEFAULT_CONFIG).toBe(DEFAULT_CONFIG)
  })
})

import { describe, it, expect, vi } from 'vitest'

// formats.ts -> url-generator.ts / url-parser.ts -> grouped.ts -> formats.ts is
// a cycle. This file has no static imports from the library, so formats.js is
// the first module of the cycle to load, as with the public
// `ag-grid-url-sync/serialization/formats` subpath. grouped.ts must not use
// the serializer classes while it evaluates.
describe('serialization module load order', () => {
  it('loads formats.js first and round-trips through querystring', async () => {
    vi.resetModules()

    const { QueryStringSerializer } = await import('./formats.js')
    const serializer = new QueryStringSerializer()
    const filterState = {
      name: { filterType: 'text', type: 'contains', filter: 'john' }
    } as const

    const value = serializer.serialize(filterState)

    expect(value).toBe('f_name_contains=john')
    expect(serializer.deserialize(value)).toEqual(filterState)
  })
})

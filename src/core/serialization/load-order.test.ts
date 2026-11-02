import { describe, it, expect, vi } from 'vitest'

// This file has no static imports from the library, so formats.js is the
// first library module to load, as with the public
// `ag-grid-url-sync/serialization/formats` subpath. If formats.ts imports a
// module that imports grouped.ts again (#202), grouped.ts creates the
// serializers before their classes exist and this test fails.
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

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

// The public exports of the package (#226 D1, D3)

// SAFETY: package.json has this shape. The tests below check it.
const pkg = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8')
) as {
  exports: Record<string, Record<string, string>>
  typesVersions?: unknown
  peerDependencies: Record<string, string>
}

describe('the package entry', () => {
  it('exports the names of D3 and nothing else', async () => {
    const lib = await import('../index.js')

    expect(Object.keys(lib).sort()).toEqual([
      'IDLE_SNAPSHOT',
      'InvalidDateError',
      'InvalidFilterError',
      'InvalidSerializationError',
      'InvalidURLError',
      'URLSyncError',
      'createGridUrlSync',
      'generateUrl',
      'grouped',
      'individual',
      'parseUrlFilters'
    ])
  })
})

describe('the React entry', () => {
  it('exports only useGridUrlSync', async () => {
    const react = await import('../react/index.js')

    expect(Object.keys(react).sort()).toEqual(['useGridUrlSync'])
  })
})

describe('the views entry', () => {
  it('exports only createViewStore', async () => {
    const views = await import('./view-storage.js')

    expect(Object.keys(views).sort()).toEqual(['createViewStore'])
  })
})

describe('package.json', () => {
  it('has exactly three entry points', () => {
    expect(Object.keys(pkg.exports)).toEqual(['.', './react', './views'])
  })

  it('has no typesVersions', () => {
    expect(pkg.typesVersions).toBeUndefined()
  })

  it('has no require condition (ESM only)', () => {
    for (const entry of Object.values(pkg.exports)) {
      expect(Object.keys(entry)).not.toContain('require')
    }
  })

  it('gives each entry types, import and default', () => {
    for (const entry of Object.values(pkg.exports)) {
      expect(Object.keys(entry)).toEqual(['types', 'import', 'default'])
    }
  })

  // AG Grid 31 moved the column methods to the grid API and added
  // getGridOption. Sort and column state (#112, #70) need that API too.
  it('needs AG Grid 31 or later', () => {
    expect(pkg.peerDependencies['ag-grid-community']).toBe('>=31.0.0')
  })
})

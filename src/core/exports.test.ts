import { describe, it, expect } from 'vitest'
import * as lib from '../index.js'
import * as core from './index.js'

// The public exports of createGridUrlSync (#221)

describe.each([
  ['the package entry', lib],
  ['the core index', core]
])('%s', (_, entry) => {
  it.each(['createGridUrlSync', 'individual', 'grouped'] as const)(
    'exports %s',
    name => {
      expect(entry[name]).toBeInstanceOf(Function)
    }
  )

  it('exports IDLE_SNAPSHOT', () => {
    expect(entry.IDLE_SNAPSHOT).toMatchObject({ status: 'idle', url: '' })
  })

  it('still exports the deprecated class', () => {
    expect(entry.AGGridUrlSync).toBeInstanceOf(Function)
    expect(entry.createUrlSync).toBeInstanceOf(Function)
  })
})

describe('the React entry', () => {
  it('still exports useAGGridUrlSync', async () => {
    const react = await import('../react/index.js')

    expect(react.useAGGridUrlSync).toBeInstanceOf(Function)
  })
})

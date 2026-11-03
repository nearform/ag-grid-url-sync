// @vitest-environment node
import { describe, test, expect } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'

// A server render has no window and no grid. The hook gives the idle state
// and reads no window (#222).

function Probe() {
  const { isReady, currentUrl } = useAGGridUrlSync(null)

  return createElement('p', null, `${isReady}|${currentUrl}`)
}

describe('useAGGridUrlSync in a server render', () => {
  test('renders the idle state with no window', () => {
    expect('window' in globalThis).toBe(false)

    expect(renderToString(createElement(Probe))).toContain('false|')
  })
})

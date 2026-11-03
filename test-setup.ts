import { beforeEach, afterEach, vi } from 'vitest'

// Mock window.location properly for jsdom. A file in the node environment
// (`// @vitest-environment node`, for the no-window checks of #221) has no
// window, so it gets no mock.
const hasWindow = typeof window !== 'undefined'
const originalLocation = hasWindow ? window.location : undefined

beforeEach(() => {
  if (!hasWindow) return

  const mockLocation = {
    href: 'https://example.com',
    search: '',
    pathname: '/',
    origin: 'https://example.com',
    protocol: 'https:',
    host: 'example.com',
    hostname: 'example.com',
    port: '',
    hash: '',
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn()
  }

  Object.defineProperty(window, 'location', {
    value: mockLocation,
    writable: true,
    configurable: true
  })
})

afterEach(() => {
  if (!hasWindow) return

  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true
  })
})

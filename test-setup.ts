import { beforeEach, afterEach, vi } from 'vitest'

// Mock window.location properly for jsdom
const originalLocation = window.location

beforeEach(() => {
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
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true
  })
})

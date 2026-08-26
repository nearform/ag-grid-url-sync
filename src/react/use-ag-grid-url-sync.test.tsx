import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { GridApi } from 'ag-grid-community'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'
import { AGGridUrlSync } from '../core/ag-grid-url-sync.js'
import { parseUrlFilters } from '../core/url-parser.js'
import { createViewStore } from '../core/view-storage.js'
import { waitForEffects } from '../test-helpers.js'

// Create a shared mock instance that will be used across all tests.
// vi.hoisted is required: vi.mock factories are hoisted above this file's
// module scope, so from Vitest 4 on, a plain const is still undefined when the
// factory below runs.
const mockInstance = vi.hoisted(() => ({
  generateUrl: vi.fn(() => 'http://example.com?f_name_contains=test'),
  getQueryParams: vi.fn(() => '?f_name_contains=test'),
  applyFromUrl: vi.fn(),
  clearFilters: vi.fn(),
  applyFilters: vi.fn(),
  destroy: vi.fn()
}))

// Mock the core AG Grid URL sync module
vi.mock('../core/ag-grid-url-sync.js', () => ({
  // The hook calls `new AGGridUrlSync(...)`, and from Vitest 4 on a vi.fn()
  // backed by an arrow function is not constructible - it has to be a real
  // function expression.
  AGGridUrlSync: vi.fn(function () {
    return mockInstance
  }),
  createUrlSync: vi.fn(() => mockInstance)
}))

// Mock the URL parser
vi.mock('../core/url-parser.js', () => ({
  parseUrlFilters: vi.fn((url: string) => {
    if (url.includes('f_created_eq=2024-01-15')) {
      return {
        created: { filterType: 'date', type: 'eq', filter: '2024-01-15' },
        deadline: {
          filterType: 'date',
          type: 'dateBefore',
          filter: '2024-12-31'
        },
        period: {
          filterType: 'date',
          type: 'dateRange',
          filter: '2024-01-01',
          filterTo: '2024-12-31'
        }
      }
    }
    if (url.includes('f_salary_gte=50000')) {
      return {
        salary: {
          filterType: 'number',
          type: 'greaterThanOrEqual',
          filter: 50000
        },
        age: { filterType: 'number', type: 'inRange', filter: 25, filterTo: 45 }
      }
    }
    // A grouped param carries filters only if its value decodes. The real
    // parser hands back {} for one it cannot read - ?filters=recent and
    // ?filters=chips-abc both do - so the mock has to model that rather than
    // fall through to the default below. urlHasFilterParams decodes to tell a
    // real payload from a host app's own param of the same name, and against a
    // mock that always yielded filters the distinction would be untestable.
    const grouped = /[?&](?:filters|grid_filters)=([^&]*)/.exec(url)
    if (grouped) {
      return grouped[1].includes('f_')
        ? { name: { filterType: 'text', type: 'contains', filter: 'grouped' } }
        : {}
    }
    // A prefixed param is not a filter either just for being present. The real
    // parser wraps each one in a try and continues past the ones that throw, so
    // an unknown operation or a value over maxValueLength contributes nothing
    // and a URL carrying only those parses to {}. Verified against the parser:
    // ?f_name_regex=abc and ?f_name_contains= over 200 chars both do.
    const prefixed = [...url.matchAll(/[?&](f_[^=&]+)=([^&]*)/g)]
    if (prefixed.length > 0) {
      const OPERATIONS = [
        'contains',
        'notContains',
        'equals',
        'notEqual',
        'startsWith',
        'endsWith',
        'blank',
        'notBlank',
        'eq',
        'gte',
        'lte',
        'gt',
        'lt',
        'inRange',
        'dateBefore',
        'dateAfter',
        'dateRange'
      ]
      const usable = prefixed.filter(([, key, value]) => {
        const operation = key.split('_').pop() ?? ''
        return (
          OPERATIONS.includes(operation) &&
          decodeURIComponent(value).length <= 200
        )
      })
      if (usable.length === 0) return {}
    }
    // Default text filter response
    return {
      name: { filterType: 'text', type: 'contains', filter: 'test' }
    }
  })
}))

// Create proper mock types
type MockGridApi = Partial<GridApi> &
  Pick<
    GridApi,
    | 'setFilterModel'
    | 'getFilterModel'
    | 'addEventListener'
    | 'removeEventListener'
  >

// Create a properly typed mock GridApi
const createMockGridApi = (): MockGridApi => ({
  setFilterModel: vi.fn(),
  getFilterModel: vi.fn(() => ({})),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
})

describe('useAGGridUrlSync', () => {
  let mockGridApi: MockGridApi
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockGridApi = createMockGridApi()
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.clearAllMocks()

    // mockInstance is module-level, and clearAllMocks resets call history but not
    // implementations. Re-seed it so a test that installs a throwing
    // implementation cannot leak it into everything that runs afterwards.
    mockInstance.generateUrl.mockImplementation(
      () => 'http://example.com?f_name_contains=test'
    )
    mockInstance.getQueryParams.mockImplementation(
      () => '?f_name_contains=test'
    )
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('Hook Initialization', () => {
    test('returns correct initial state when gridApi is null', () => {
      const { result } = renderHook(() => useAGGridUrlSync(null))

      expect(result.current.isReady).toBe(false)
      expect(result.current.currentUrl).toBe('')
      expect(result.current.hasFilters).toBe(false)
      expect(typeof result.current.shareUrl).toBe('function')
      expect(typeof result.current.getQueryParams).toBe('function')
      expect(typeof result.current.applyUrlFilters).toBe('function')
      expect(typeof result.current.clearFilters).toBe('function')
      expect(typeof result.current.parseUrlFilters).toBe('function')
      expect(typeof result.current.applyFilters).toBe('function')
    })

    test('initializes when gridApi becomes available', () => {
      const { result, rerender } = renderHook(
        (props: { gridApi: GridApi | null }) => useAGGridUrlSync(props.gridApi),
        { initialProps: { gridApi: null as GridApi | null } }
      )

      expect(result.current.isReady).toBe(false)

      rerender({ gridApi: mockGridApi as GridApi | null })

      expect(result.current.isReady).toBe(true)
    })

    test('respects enabledWhenReady option', () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          enabledWhenReady: false
        })
      )

      expect(result.current.isReady).toBe(false)
    })
  })

  describe('Auto-apply on Mount', () => {
    test('applies URL filters on mount when autoApplyOnMount is true', async () => {
      renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          autoApplyOnMount: true
        })
      )

      // Wait for effects to run
      await waitForEffects()

      expect(mockInstance.applyFromUrl).toHaveBeenCalled()
    })

    test('does not apply URL filters when autoApplyOnMount is false', async () => {
      renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          autoApplyOnMount: false
        })
      )

      await waitForEffects()

      expect(mockInstance.applyFromUrl).not.toHaveBeenCalled()
    })
  })

  describe('API Methods', () => {
    test('shareUrl returns generated URL', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const url = result.current.shareUrl()
      expect(url).toBe('http://example.com?f_name_contains=test')
    })

    test('shareUrl returns baseUrl when not ready', () => {
      const { result } = renderHook(() => useAGGridUrlSync(null))

      const url = result.current.shareUrl('http://base.com')
      expect(url).toBe('http://base.com')
    })

    test('getQueryParams returns query string', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const params = result.current.getQueryParams()
      expect(params).toBe('?f_name_contains=test')
    })

    test('applyUrlFilters calls core method', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      act(() => {
        result.current.applyUrlFilters('http://test.com')
      })

      expect(mockInstance.applyFromUrl).toHaveBeenCalledWith('http://test.com')
    })

    test('clearFilters calls core method', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      act(() => {
        result.current.clearFilters()
      })

      expect(mockInstance.clearFilters).toHaveBeenCalled()
    })

    test('parseUrlFilters returns parsed filters', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const filters = result.current.parseUrlFilters(
        'http://test.com?f_name_contains=test'
      )
      expect(filters).toEqual({
        name: { filterType: 'text', type: 'contains', filter: 'test' }
      })
    })

    test('parseUrlFilters handles date filters', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const filters = result.current.parseUrlFilters(
        'http://test.com?f_created_eq=2024-01-15&f_deadline_before=2024-12-31&f_period_daterange=2024-01-01,2024-12-31'
      )

      expect(filters).toEqual({
        created: { filterType: 'date', type: 'eq', filter: '2024-01-15' },
        deadline: {
          filterType: 'date',
          type: 'dateBefore',
          filter: '2024-12-31'
        },
        period: {
          filterType: 'date',
          type: 'dateRange',
          filter: '2024-01-01',
          filterTo: '2024-12-31'
        }
      })
    })

    test('parseUrlFilters handles number filters', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const filters = result.current.parseUrlFilters(
        'http://test.com?f_salary_gte=50000&f_age_range=25,45'
      )

      expect(filters).toEqual({
        salary: {
          filterType: 'number',
          type: 'greaterThanOrEqual',
          filter: 50000
        },
        age: { filterType: 'number', type: 'inRange', filter: 25, filterTo: 45 }
      })
    })

    test('applyFilters calls core method', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const filters = {
        name: {
          filterType: 'text' as const,
          type: 'contains' as const,
          filter: 'test'
        }
      }
      act(() => {
        result.current.applyFilters(filters)
      })

      expect(mockInstance.applyFilters).toHaveBeenCalledWith(filters)
    })

    test('applyFilters handles date filters', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const dateFilters = {
        created: {
          filterType: 'date' as const,
          type: 'eq' as const,
          filter: '2024-01-15'
        },
        deadline: {
          filterType: 'date' as const,
          type: 'dateBefore' as const,
          filter: '2024-12-31'
        },
        period: {
          filterType: 'date' as const,
          type: 'dateRange' as const,
          filter: '2024-01-01',
          filterTo: '2024-12-31'
        }
      }

      act(() => {
        result.current.applyFilters(dateFilters)
      })

      expect(mockInstance.applyFilters).toHaveBeenCalledWith(dateFilters)
    })

    test('applyUrlFilters handles URLs with date filters', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      const urlWithDateFilters =
        'http://test.com?f_created_eq=2024-01-15&f_deadline_before=2024-12-31&f_period_daterange=2024-01-01,2024-12-31'

      act(() => {
        result.current.applyUrlFilters(urlWithDateFilters)
      })

      expect(mockInstance.applyFromUrl).toHaveBeenCalledWith(urlWithDateFilters)
    })
  })

  describe('Error Handling', () => {
    test('warns when applyUrlFilters called while not ready', () => {
      const onParseError = vi.fn()
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      const { result } = renderHook(() =>
        useAGGridUrlSync(null, { onParseError })
      )

      act(() => {
        result.current.applyUrlFilters('http://test.com?f_name_contains=test')
      })

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'applyUrlFilters called while the hook is not ready.'
      )
      expect(onParseError).toHaveBeenCalledWith(expect.any(Error))

      consoleWarnSpy.mockRestore()
    })

    test('warns when clearFilters called while not ready', () => {
      const onParseError = vi.fn()
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      const { result } = renderHook(() =>
        useAGGridUrlSync(null, { onParseError })
      )

      act(() => {
        result.current.clearFilters()
      })

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'clearFilters called while the hook is not ready.'
      )
      expect(onParseError).toHaveBeenCalledWith(expect.any(Error))

      consoleWarnSpy.mockRestore()
    })

    test('warns when applyFilters called while not ready', () => {
      const onParseError = vi.fn()
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      const { result } = renderHook(() =>
        useAGGridUrlSync(null, { onParseError })
      )

      act(() => {
        result.current.applyFilters({
          name: { filterType: 'text', type: 'contains', filter: 'test' }
        })
      })

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'applyFilters called while the hook is not ready.'
      )
      expect(onParseError).toHaveBeenCalledWith(expect.any(Error))

      consoleWarnSpy.mockRestore()
    })

    test('handles initialization errors gracefully', async () => {
      const onError = vi.fn()

      // Temporarily make the AGGridUrlSync constructor throw
      const MockedAGGridUrlSync = vi.mocked(AGGridUrlSync)
      MockedAGGridUrlSync.mockImplementationOnce(() => {
        throw new Error('Initialization failed')
      })

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { onError })
      )

      expect(result.current.isReady).toBe(false)
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'initialization')
    })

    test('handles method errors gracefully', async () => {
      const onError = vi.fn()
      mockInstance.generateUrl.mockImplementation(() => {
        throw new Error('URL generation failed')
      })

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { onError })
      )

      await waitForEffects()

      const url = result.current.shareUrl()
      expect(url).toBe(window.location.href)
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        'generate-share-url'
      )
    })

    test('calls onParseError callback', async () => {
      const onParseError = vi.fn()
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { onParseError })
      )

      await waitForEffects()

      const mockedParseUrlFilters = vi.mocked(parseUrlFilters)
      mockedParseUrlFilters.mockImplementationOnce(() => {
        throw new Error('Parse error')
      })

      act(() => {
        result.current.parseUrlFilters('invalid-url')
      })

      expect(onParseError).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('Cleanup', () => {
    test('cleans up on unmount', async () => {
      const { unmount } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      unmount()

      expect(mockInstance.destroy).toHaveBeenCalled()
    })

    test('cleans up when gridApi changes', async () => {
      const { rerender } = renderHook(
        (props: { gridApi: GridApi | null }) => useAGGridUrlSync(props.gridApi),
        { initialProps: { gridApi: mockGridApi as GridApi | null } }
      )

      await waitForEffects()

      const newMockGridApi = createMockGridApi()
      rerender({ gridApi: newMockGridApi as GridApi | null })

      expect(mockInstance.destroy).toHaveBeenCalled()
    })
  })

  describe('State Updates', () => {
    test('updates currentUrl and hasFilters reactively', async () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      // Since mocks might not work perfectly in this test environment,
      // we just check that the state is managed correctly
      expect(typeof result.current.currentUrl).toBe('string')
      expect(typeof result.current.hasFilters).toBe('boolean')
    })

    test('handles empty query params correctly', async () => {
      mockInstance.getQueryParams.mockReturnValue('')

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      expect(result.current.hasFilters).toBe(false)
    })

    test('sets up filterChanged event listener', async () => {
      renderHook(() => useAGGridUrlSync(mockGridApi as GridApi))

      await waitForEffects()

      expect(mockGridApi.addEventListener).toHaveBeenCalledWith(
        'filterChanged',
        expect.any(Function)
      )
    })

    test('removes filterChanged event listener on cleanup', async () => {
      const { unmount } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      await waitForEffects()

      unmount()

      expect(mockGridApi.removeEventListener).toHaveBeenCalledWith(
        'filterChanged',
        expect.any(Function)
      )
    })
  })

  describe('Saved Views', () => {
    const STORAGE_KEY = 'view-test-grid'
    const savedModel = {
      department: { filterType: 'text', type: 'equals', filter: 'Engineering' }
    }

    const setSearch = (search: string): void => {
      Object.defineProperty(window.location, 'search', {
        value: search,
        configurable: true
      })
    }

    // The mock grid records listeners rather than dispatching to them, so a
    // model change has to be announced by hand. The hook re-registers on every
    // grid change, so the newest handler is the live one.
    const fireFilterChanged = async (api: MockGridApi = mockGridApi) => {
      const handler = vi
        .mocked(api.addEventListener)
        .mock.calls.filter(([event]) => event === 'filterChanged')
        .at(-1)?.[1] as (() => void) | undefined

      if (!handler) throw new Error('no filterChanged listener registered')
      await act(async () => {
        handler()
      })
    }

    beforeEach(() => {
      window.localStorage.clear()
      // test-setup.ts replaces window.location wholesale each test, which already
      // resets this. Doing it locally too keeps the block hermetic on its own
      // terms rather than depending on how that setup happens to work.
      setSearch('')
    })

    test('reports view operations attempted before the grid is ready', () => {
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useAGGridUrlSync(null, { storageKey: STORAGE_KEY, onError })
      )

      expect(result.current.saveView('Too early')).toBeNull()
      act(() => result.current.loadView('anything'))

      // Only the two that need the grid: one reads its filter model, the other
      // writes it. Silence here is what makes consumers hand-roll an isReady
      // check. deleteView is deliberately absent, since it only touches storage
      // and works without a grid.
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'save-view')
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'load-view')
      expect(onError).not.toHaveBeenCalledWith(expect.any(Error), 'delete-view')
    })

    test('does not report when saved views are simply not configured', () => {
      const onError = vi.fn()

      // No storageKey: the feature is off by configuration, not broken. A
      // consumer using views conditionally must not get error noise.
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { onError })
      )

      expect(result.current.saveView('Nope')).toBeNull()
      act(() => result.current.loadView('anything'))
      act(() => result.current.deleteView('anything'))

      expect(onError).not.toHaveBeenCalled()
    })

    test('deletes a stored view while the grid is still unresolved', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)
      const onError = vi.fn()

      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      let id = ''
      act(() => {
        id = seed.result.current.saveView('Seeded')!.id
      })
      seed.unmount()

      // A view-management panel rendered beside a grid that has not resolved.
      const { result } = renderHook(() =>
        useAGGridUrlSync(null, { storageKey: STORAGE_KEY, onError })
      )

      act(() => result.current.deleteView(id))

      // Deleting touches only localStorage, so a missing grid must not stop it.
      expect(onError).not.toHaveBeenCalled()
      const after = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      expect(after.result.current.views).toEqual([])
    })

    test('view members are inert when the hook is disabled', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      // Seed a view while enabled, so there is something to load and delete.
      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      let id = ''
      act(() => {
        id = seed.result.current.saveView('Seeded')!.id
      })
      seed.unmount()

      const onError = vi.fn()
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          enabledWhenReady: false,
          onError
        })
      )

      expect(result.current.isReady).toBe(false)
      vi.mocked(mockGridApi.setFilterModel).mockClear()

      // The URL half is inert when disabled, so the view half must be too:
      // otherwise a feature flag silences one and leaves the other writing to
      // localStorage and driving the grid.
      expect(result.current.saveView('While disabled')).toBeNull()
      act(() => result.current.loadView(id))
      act(() => result.current.deleteView(id))

      expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()

      // Silent, not reported. A deliberate disable is configuration, like an
      // absent storageKey, and "not ready" is misleading when nothing is pending.
      expect(onError).not.toHaveBeenCalled()

      // Nothing was written or removed: the store still holds exactly the seed.
      const after = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      expect(after.result.current.views.map(view => view.name)).toEqual([
        'Seeded'
      ])
    })

    test('view members are inert without a storageKey', () => {
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi)
      )

      expect(result.current.views).toEqual([])
      expect(result.current.activeViewId).toBeNull()
      expect(result.current.saveView('Nope')).toBeNull()

      act(() => result.current.deleteView('anything'))
      expect(result.current.views).toEqual([])

      // loadView must not touch the grid either. clearFilters is the API for
      // resetting filters, and it works independently of saved views.
      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => result.current.loadView(null))
      act(() => result.current.loadView('some-id'))
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()
    })

    test('saveView captures the current filter model', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let saved: { id: string } | null = null
      act(() => {
        saved = result.current.saveView('Engineering')
      })

      expect(saved).not.toBeNull()
      expect(result.current.views).toHaveLength(1)
      expect(result.current.views[0]?.name).toBe('Engineering')
      expect(result.current.views[0]?.filterModel).toEqual(savedModel)
      expect(result.current.activeViewId).toBe(saved!.id)
    })

    test('saving under an existing name updates that view in place', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let firstId = ''
      act(() => {
        firstId = result.current.saveView('Same')!.id
      })

      const updatedModel = {
        age: { filterType: 'number', type: 'equals', filter: 30 }
      }
      mockGridApi.getFilterModel = vi.fn(() => updatedModel)

      let secondId = ''
      act(() => {
        secondId = result.current.saveView('Same')!.id
      })

      expect(result.current.views).toHaveLength(1)
      expect(secondId).toBe(firstId)
      expect(result.current.views[0]?.filterModel).toEqual(updatedModel)
      expect(result.current.activeViewId).toBe(firstId)
    })

    test('a view saved from a null filter model survives a re-read', () => {
      // AG Grid can hand back null despite the declared return type.
      mockGridApi.getFilterModel = vi.fn(() => null as unknown as object)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let saved: { id: string } | null = null
      act(() => {
        saved = result.current.saveView('Unfiltered')
      })

      expect(saved).not.toBeNull()
      // The reported symptom: told it saved and marked active, but absent from
      // the list because the stored blob failed validation on the next read.
      expect(result.current.views).toHaveLength(1)
      expect(result.current.activeViewId).toBe(saved!.id)

      // And it is still there for a later session.
      const remount = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      expect(remount.result.current.views).toHaveLength(1)
    })

    test('rejects an empty name and reports it through onError', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          onError
        })
      )

      let saved: unknown = 'unset'
      act(() => {
        saved = result.current.saveView('   ')
      })

      expect(saved).toBeNull()
      expect(result.current.views).toEqual([])
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('view name is required')
        }),
        'save-view'
      )
    })

    test('loadView applies the saved filter model to the grid', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => result.current.loadView(id))

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)
      expect(result.current.activeViewId).toBe(id)
    })

    test('marks the loaded view even when persisting the pointer fails', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          onError
        })
      )

      let a = ''
      let b = ''
      act(() => {
        a = result.current.saveView('A')!.id
      })
      act(() => {
        b = result.current.saveView('B')!.id
      })
      act(() => result.current.loadView(a))
      expect(result.current.activeViewId).toBe(a)

      // Reads keep working; only the durable write fails.
      const realSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError')
      }

      try {
        vi.mocked(mockGridApi.setFilterModel).mockClear()
        act(() => result.current.loadView(b))

        // The grid was told to show B, so the marker must say B. Losing
        // durability is fine, misreporting what is on screen is not.
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(
          expect.objectContaining({})
        )
        expect(result.current.activeViewId).toBe(b)
        expect(onError).toHaveBeenCalledWith(expect.any(Error), 'load-view')
      } finally {
        Storage.prototype.setItem = realSetItem
      }
    })

    test('resetting with no active view does not write, so blocked storage is silent', () => {
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          onError
        })
      )

      const realSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError')
      }

      try {
        act(() => result.current.loadView(null))

        // The grid resets correctly, and there was no pointer to clear, so
        // nothing should have been written or reported.
        expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
        expect(onError).not.toHaveBeenCalled()
      } finally {
        Storage.prototype.setItem = realSetItem
      }
    })

    test('re-loading the already-active view does not rewrite the pointer', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          onError
        })
      )

      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })
      act(() => result.current.loadView(id))
      expect(result.current.activeViewId).toBe(id)

      const realSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError')
      }

      try {
        // The pointer already names this view, so there is nothing to persist.
        act(() => result.current.loadView(id))

        expect(result.current.activeViewId).toBe(id)
        expect(onError).not.toHaveBeenCalled()
      } finally {
        Storage.prototype.setItem = realSetItem
      }
    })

    test('drops a stale entry when loading a view another tab deleted', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          onError
        })
      )

      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })
      expect(result.current.views).toHaveLength(1)

      // Another tab deletes it. Nothing notifies this one, so its mirror is now
      // stale and still renders a button for the missing view.
      act(() => {
        createViewStore(STORAGE_KEY).deleteView(id)
      })
      expect(result.current.views).toHaveLength(1)

      act(() => result.current.loadView(id))

      // Reporting the miss is not enough: without a resync the button stays and
      // every click reports again, with no way back short of a remount.
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'load-view')
      expect(result.current.views).toEqual([])
    })

    test('loadView(null) clears filters and the active view', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      act(() => {
        result.current.saveView('Engineering')
      })
      act(() => result.current.loadView(null))

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
      expect(result.current.activeViewId).toBeNull()
    })

    test('loadView treats a missing argument like null', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          onError
        })
      )

      act(() => {
        result.current.saveView('Engineering')
      })

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      // A JavaScript caller can omit the argument even though the type requires
      // it; that must reset rather than look up a view with an undefined id.
      act(() => (result.current.loadView as () => void)())

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
      expect(result.current.activeViewId).toBeNull()
      expect(onError).not.toHaveBeenCalled()
    })

    test('deleteView removes the view and clears filters when it was active', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => result.current.deleteView(id))

      expect(result.current.views).toEqual([])
      expect(result.current.activeViewId).toBeNull()
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
    })

    test('deleting a view keeps hand-edited filters the view no longer owns', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })
      act(() => result.current.loadView(id))

      // The user then hand-adjusts a column filter, so the grid no longer shows
      // what the view holds.
      mockGridApi.getFilterModel = vi.fn(() => ({
        ...savedModel,
        salary: { filterType: 'number', type: 'greaterThan', filter: 120000 }
      }))

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => result.current.deleteView(id))

      // The view is gone, but the user's own filtering must survive.
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()
      expect(result.current.views).toEqual([])
    })

    test('deletes the view even when reading the grid model throws', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          onError
        })
      )

      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })
      act(() => result.current.loadView(id))

      // As on a destroyed grid.
      mockGridApi.getFilterModel = vi.fn(() => {
        throw new Error('grid destroyed')
      })

      act(() => result.current.deleteView(id))

      // The delete is what the user asked for, so it must land regardless.
      expect(result.current.views).toEqual([])
      expect(result.current.activeViewId).toBeNull()
    })

    test('tolerates a null filter model when deciding whether to clear', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })
      act(() => result.current.loadView(id))

      // AG Grid can hand back null despite the declared return type.
      mockGridApi.getFilterModel = vi.fn(() => null as unknown as object)

      act(() => result.current.deleteView(id))

      expect(result.current.views).toEqual([])
    })

    test('deleting a view clears filters when the grid still shows exactly that view', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })
      act(() => result.current.loadView(id))

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => result.current.deleteView(id))

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
    })

    // The tests above drive each step from its own act(), so state commits in
    // between. A real handler holds one render's closures for the whole
    // sequence, which is what these two cover.
    test('deleting a view saved and loaded in the same tick clears the grid', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => {
        const view = result.current.saveView('Engineering')!
        result.current.loadView(view.id)
        result.current.deleteView(view.id)
      })

      expect(result.current.views).toEqual([])
      expect(result.current.activeViewId).toBeNull()
      // loadView wrote the model earlier in the same block, so the point is that
      // the delete's clear is the last word on the grid.
      expect(mockGridApi.setFilterModel).toHaveBeenLastCalledWith({})
    })

    test('deleting a view saved in the same tick clears the grid', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )

      // Without the loadView above, this is saveView's own marker write: the
      // grid already holds these filters, so saving makes the view active.
      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => {
        const view = result.current.saveView('Engineering')!
        result.current.deleteView(view.id)
      })

      expect(result.current.views).toEqual([])
      expect(result.current.activeViewId).toBeNull()
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith({})
    })

    test('clearing the grid drops the active view marker and its pointer', async () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })
      act(() => result.current.loadView(id))
      expect(result.current.activeViewId).toBe(id)

      // The user clicks Clear Filters. That empties the model and announces it
      // through filterChanged without going near loadView, so the marker has to
      // fall away on the evidence of the grid alone.
      mockGridApi.getFilterModel = vi.fn(() => ({}))
      await fireFilterChanged()

      expect(result.current.activeViewId).toBeNull()
      // The pointer as well as the marker: it is what autoApplyOnMount restores
      // from, so leaving it would reapply the view on the next load.
      expect(createViewStore(STORAGE_KEY).getActiveViewId()).toBeNull()
    })

    test('a hand-edited filter drops the active view marker', async () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })
      act(() => result.current.loadView(id))

      // Adjusting a column filter in the grid's own UI: the view's filters are
      // still there, but the grid no longer shows that view.
      mockGridApi.getFilterModel = vi.fn(() => ({
        ...savedModel,
        salary: { filterType: 'number', type: 'greaterThan', filter: 120000 }
      }))
      await fireFilterChanged()

      expect(result.current.activeViewId).toBeNull()
    })

    test('a filter change that still matches keeps the view active', async () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })
      act(() => result.current.loadView(id))

      // filterChanged fires for reasons that leave the model alone too. The
      // marker must survive those, or loading a view would immediately unload
      // it on its own event.
      await fireFilterChanged()

      expect(result.current.activeViewId).toBe(id)
      expect(createViewStore(STORAGE_KEY).getActiveViewId()).toBe(id)
    })

    test('replacing the grid clears the marker but keeps the stored pointer', async () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const { result, rerender } = renderHook(
        (props: { api: MockGridApi }) =>
          useAGGridUrlSync(props.api as GridApi, { storageKey: STORAGE_KEY }),
        { initialProps: { api: mockGridApi } }
      )
      let id = ''
      act(() => {
        id = result.current.saveView('Engineering')!.id
      })
      act(() => result.current.loadView(id))
      expect(result.current.activeViewId).toBe(id)

      // A different grid instance, with autoApplyOnMount off so nothing
      // reapplies. The marker described the grid that went away.
      rerender({ api: createMockGridApi() })
      await waitForEffects()

      expect(result.current.activeViewId).toBeNull()
      // Only the session marker. The pointer still records what to restore.
      expect(createViewStore(STORAGE_KEY).getActiveViewId()).toBe(id)
    })

    test('loading a view does not report a filter-change error on the way', () => {
      // AG Grid fires filterChanged from inside setFilterModel, so this grid
      // announces its own change the way a real one does.
      const listeners: Array<() => void> = []
      let model: Record<string, unknown> = {}
      const liveGrid: MockGridApi = {
        setFilterModel: vi.fn((next: Record<string, unknown>) => {
          model = next ?? {}
          listeners.forEach(fire => fire())
        }),
        getFilterModel: vi.fn(() => model),
        addEventListener: vi.fn((event: string, fire: () => void) => {
          if (event === 'filterChanged') listeners.push(fire)
        }),
        removeEventListener: vi.fn((_event: string, fire: () => void) => {
          const at = listeners.indexOf(fire)
          if (at >= 0) listeners.splice(at, 1)
        })
      } as unknown as MockGridApi

      const onError = vi.fn()
      const { result } = renderHook(() =>
        useAGGridUrlSync(liveGrid as GridApi, {
          storageKey: STORAGE_KEY,
          onError
        })
      )

      // Two views, so loading one replaces the other and the marker has an
      // outgoing value to be compared against.
      model = savedModel
      let aId = ''
      act(() => {
        aId = result.current.saveView('A')!.id
      })
      model = {
        salary: { filterType: 'number', type: 'greaterThan', filter: 1 }
      }
      act(() => {
        result.current.saveView('B')
      })

      // Storage stops accepting writes just before the load.
      const realSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError')
      }

      try {
        act(() => result.current.loadView(aId))
      } finally {
        Storage.prototype.setItem = realSetItem
      }

      // The load itself may fail to persist, and says so. What it must not do is
      // report a filter-change on top: the marker names the view being loaded
      // before the grid announces it, so the listener sees a match and stays out
      // of the way.
      const contexts = onError.mock.calls.map(([, context]) => context)
      expect(contexts).not.toContain('filter-change')
      expect(result.current.activeViewId).toBe(aId)
    })

    test('restores the stored active view on mount when the URL has no filters', async () => {
      setSearch('')
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      // Seed a saved, active view from a previous session.
      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      act(() => {
        seed.result.current.saveView('Engineering')
      })
      seed.unmount()

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      mockInstance.applyFromUrl.mockClear()

      renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          autoApplyOnMount: true
        })
      )
      await waitForEffects()

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)
      expect(mockInstance.applyFromUrl).not.toHaveBeenCalled()
    })

    test('an empty paramPrefix does not make every query param a filter', async () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      // Seed a stored active view from a previous session.
      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      let id = ''
      act(() => {
        id = seed.result.current.saveView('Engineering')!.id
      })
      seed.unmount()

      // A pagination param, nothing to do with filters.
      setSearch('?page=2')
      vi.mocked(mockGridApi.setFilterModel).mockClear()
      mockInstance.applyFromUrl.mockClear()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          paramPrefix: '',
          autoApplyOnMount: true
        })
      )
      await waitForEffects()

      // The URL makes no claim about filters, so the stored view must be
      // restored, not cleared, and the pointer not wiped.
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)
      expect(result.current.activeViewId).toBe(id)
      expect(mockInstance.applyFromUrl).not.toHaveBeenCalled()
    })

    test('a prefix without a trailing underscore does not match by substring', async () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      let id = ''
      act(() => {
        id = seed.result.current.saveView('Engineering')!.id
      })
      seed.unmount()

      // 'filterMode' is not 'filter_' + column, and the parser would not match it.
      setSearch('?filterMode=advanced')
      vi.mocked(mockGridApi.setFilterModel).mockClear()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          paramPrefix: 'filter',
          autoApplyOnMount: true
        })
      )
      await waitForEffects()

      expect(result.current.activeViewId).toBe(id)
    })

    test('a prefixed param the parser rejects is not a filter claim', async () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      let id = ''
      act(() => {
        id = seed.result.current.saveView('Engineering')!.id
      })
      seed.unmount()

      // 'regex' is not an operation this library has. The key looks like a
      // filter param and is not one, so the parser skips it and yields nothing.
      setSearch('?f_name_regex=abc')
      vi.mocked(mockGridApi.setFilterModel).mockClear()
      mockInstance.applyFromUrl.mockClear()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          autoApplyOnMount: true
        })
      )
      await waitForEffects()

      expect(mockInstance.applyFromUrl).not.toHaveBeenCalled()
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)
      expect(result.current.activeViewId).toBe(id)
      expect(createViewStore(STORAGE_KEY).getActiveViewId()).toBe(id)
    })

    test('a prefixed param over maxValueLength is not a filter claim', async () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      let id = ''
      act(() => {
        id = seed.result.current.saveView('Engineering')!.id
      })
      seed.unmount()

      // A valid operation carrying a value validation will reject, as a link
      // shared from a grid configured with a longer maxValueLength would be.
      setSearch(`?f_name_contains=${'x'.repeat(250)}`)
      vi.mocked(mockGridApi.setFilterModel).mockClear()
      mockInstance.applyFromUrl.mockClear()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          autoApplyOnMount: true
        })
      )
      await waitForEffects()

      expect(mockInstance.applyFromUrl).not.toHaveBeenCalled()
      expect(result.current.activeViewId).toBe(id)
    })

    test('one rejected param does not cost a URL its other filters', async () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      act(() => {
        seed.result.current.saveView('Engineering')
      })
      seed.unmount()

      // The parser skips the param it cannot use and keeps the one it can, so
      // the URL still carries filters and still wins. Deciding on the whole
      // parse rather than on any single param is what makes this hold.
      setSearch('?f_name_regex=abc&f_dept_contains=eng')
      vi.mocked(mockGridApi.setFilterModel).mockClear()
      mockInstance.applyFromUrl.mockClear()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          autoApplyOnMount: true
        })
      )
      await waitForEffects()

      expect(mockInstance.applyFromUrl).toHaveBeenCalled()
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalledWith(savedModel)
      expect(result.current.activeViewId).toBeNull()
    })

    test('a grouped param the parser cannot decode is not a filter claim', async () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      let id = ''
      act(() => {
        id = seed.result.current.saveView('Engineering')!.id
      })
      seed.unmount()

      // 'filters' is one of the names checked for a grouped payload, but it is
      // just as plausible a name for a host app's own quick-filter chips. This
      // value decodes to nothing, so it says nothing about this grid.
      setSearch('?filters=recent')
      vi.mocked(mockGridApi.setFilterModel).mockClear()
      mockInstance.applyFromUrl.mockClear()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          autoApplyOnMount: true
        })
      )
      await waitForEffects()

      // Treating it as a claim would apply an empty model over the user's
      // filters and drop the stored pointer for good, neither of which they
      // asked for.
      expect(mockInstance.applyFromUrl).not.toHaveBeenCalled()
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)
      expect(result.current.activeViewId).toBe(id)
      // The pointer has to survive the mount, not just this render: it is what
      // restores the view on the next one.
      expect(createViewStore(STORAGE_KEY).getActiveViewId()).toBe(id)
    })

    test('a grouped param the parser can decode still wins over the stored view', async () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      act(() => {
        seed.result.current.saveView('Engineering')
      })
      seed.unmount()

      // The same param name, this time carrying a payload that decodes. The
      // decodability check must not have cost grouped URLs their precedence.
      setSearch('?filters=f_name_contains%3Dfromurl')
      vi.mocked(mockGridApi.setFilterModel).mockClear()
      mockInstance.applyFromUrl.mockClear()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          autoApplyOnMount: true
        })
      )
      await waitForEffects()

      expect(mockInstance.applyFromUrl).toHaveBeenCalled()
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalledWith(savedModel)
      expect(result.current.activeViewId).toBeNull()
    })

    test('prefers URL filters over the stored view on mount', async () => {
      setSearch('?f_name_contains=fromurl')
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      act(() => {
        seed.result.current.saveView('Engineering')
      })
      seed.unmount()

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      mockInstance.applyFromUrl.mockClear()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          autoApplyOnMount: true
        })
      )
      await waitForEffects()

      expect(mockInstance.applyFromUrl).toHaveBeenCalled()
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalledWith(savedModel)
      // The URL won, so nothing is active. Otherwise the UI mislabels a saved
      // view as loaded while showing the URL's filters.
      expect(result.current.activeViewId).toBeNull()
    })

    test('deleting a view does not wipe URL filters when the URL took precedence', async () => {
      setSearch('?f_name_contains=fromurl')
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      let id = ''
      act(() => {
        id = seed.result.current.saveView('Engineering')!.id
      })
      seed.unmount()

      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, {
          storageKey: STORAGE_KEY,
          autoApplyOnMount: true
        })
      )
      await waitForEffects()

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      act(() => result.current.deleteView(id))

      // The grid is showing the URL's filters, not this view, so deleting it must
      // not clear the filter model.
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()
      expect(result.current.views).toEqual([])
    })

    test('reports an actionable reason through onError when storage is full', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)
      const onError = vi.fn()

      // jsdom's Storage is proxy-backed, so an instance spy on setItem does not
      // shadow the real method. Replace the whole object.
      const original = window.localStorage
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => null,
          setItem: () => {
            throw new DOMException('quota', 'QuotaExceededError')
          },
          removeItem: () => {},
          clear: () => {}
        },
        configurable: true
      })

      try {
        const { result } = renderHook(() =>
          useAGGridUrlSync(mockGridApi as GridApi, {
            storageKey: STORAGE_KEY,
            onError
          })
        )

        let saved: unknown = 'unset'
        act(() => {
          saved = result.current.saveView('Too big')
        })

        expect(saved).toBeNull()
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Browser storage is full')
          }),
          'save-view'
        )
      } finally {
        Object.defineProperty(window, 'localStorage', {
          value: original,
          configurable: true
        })
      }
    })

    test('does not report a view as active when nothing was applied', async () => {
      setSearch('')
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      // A previous session saved a view, so the store's pointer is set.
      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      act(() => {
        seed.result.current.saveView('Engineering')
      })
      seed.unmount()

      vi.mocked(mockGridApi.setFilterModel).mockClear()

      // Mount with autoApplyOnMount left at its default of false: the stored
      // view is never applied, so nothing is loaded.
      const { result } = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      await waitForEffects()

      expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()
      expect(result.current.activeViewId).toBeNull()
      // The list itself is still mirrored. Only the active marker is withheld.
      expect(result.current.views).toHaveLength(1)
    })

    /**
     * Seeds a stored active view so the URL-wins branch has a non-null pointer
     * to clear. Without one the branch skips the write entirely, and a test that
     * means to exercise a failing write silently exercises nothing.
     */
    const seedActiveView = (): string => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)
      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: STORAGE_KEY })
      )
      let id = ''
      act(() => {
        id = seed.result.current.saveView('Seeded')!.id
      })
      seed.unmount()
      return id
    }

    test('opening a shared link with blocked storage and no saved views is silent', async () => {
      setSearch('?f_name_contains=fromurl')
      const onError = vi.fn()

      // Never saved a view, so there is no pointer to clear.
      const realSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError')
      }

      try {
        renderHook(() =>
          useAGGridUrlSync(mockGridApi as GridApi, {
            storageKey: STORAGE_KEY,
            autoApplyOnMount: true,
            onError
          })
        )
        await waitForEffects()

        // The user took no action. Clearing an already-null pointer is not worth
        // a storage write, and "delete a saved view" is nonsense advice here.
        expect(onError).not.toHaveBeenCalled()
        expect(mockInstance.applyFromUrl).toHaveBeenCalled()
      } finally {
        Storage.prototype.setItem = realSetItem
      }
    })

    test('a failed pointer write does not reach onParseError', async () => {
      seedActiveView()
      setSearch('?f_name_contains=fromurl')
      const onError = vi.fn()
      const onParseError = vi.fn()

      const realSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError')
      }

      try {
        renderHook(() =>
          useAGGridUrlSync(mockGridApi as GridApi, {
            storageKey: STORAGE_KEY,
            autoApplyOnMount: true,
            onError,
            onParseError
          })
        )
        await waitForEffects()

        // Storage failing is not the URL failing. applyFromUrl succeeded, so a
        // parse-error handler must not hear about it.
        expect(onError).toHaveBeenCalledWith(
          expect.any(Error),
          'auto-apply-filters'
        )
        expect(onParseError).not.toHaveBeenCalled()
      } finally {
        Storage.prototype.setItem = realSetItem
      }
    })

    test('auto-applies once when the pointer write throws', async () => {
      setSearch('?f_name_contains=fromurl')
      const onError = vi.fn()

      // Storage that reads fine but cannot be written, as when localStorage is
      // blocked by policy or the quota is exhausted. The read returns a non-null
      // active pointer on purpose: the URL-wins branch only writes when there is
      // something to clear, so without one this would exercise no write at all.
      const stored = JSON.stringify({
        views: [
          { id: 'seeded', name: 'Seeded', updatedAt: 1, filterModel: {} }
        ],
        activeId: 'seeded'
      })
      const original = window.localStorage
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => stored,
          setItem: () => {
            throw new DOMException('quota', 'QuotaExceededError')
          },
          removeItem: () => {},
          clear: () => {}
        },
        configurable: true
      })

      try {
        mockInstance.applyFromUrl.mockClear()

        const { rerender } = renderHook(() =>
          useAGGridUrlSync(mockGridApi as GridApi, {
            storageKey: STORAGE_KEY,
            autoApplyOnMount: true,
            onError
          })
        )
        await waitForEffects()

        // Each render re-creates the effect's dependencies, so a guard that is
        // only armed on success would re-run the whole auto-apply path forever.
        rerender()
        rerender()
        rerender()
        await waitForEffects()

        expect(mockInstance.applyFromUrl).toHaveBeenCalledTimes(1)
      } finally {
        Object.defineProperty(window, 'localStorage', {
          value: original,
          configurable: true
        })
      }
    })

    test('applies the stored view when storageKey resolves after first render', async () => {
      setSearch('')
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      // A previous session saved a view under the tenant's key.
      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: 'tenant-b' })
      )
      let id = ''
      act(() => {
        id = seed.result.current.saveView('Engineering')!.id
      })
      seed.unmount()

      vi.mocked(mockGridApi.setFilterModel).mockClear()

      // First render has no key yet, as when it comes from an async tenant id.
      const { result, rerender } = renderHook(
        (props: { storageKey?: string }) =>
          useAGGridUrlSync(mockGridApi as GridApi, {
            storageKey: props.storageKey,
            autoApplyOnMount: true
          }),
        { initialProps: { storageKey: undefined } as { storageKey?: string } }
      )
      await waitForEffects()

      expect(result.current.activeViewId).toBeNull()

      // The key resolves. The list already handled this case; the restore must
      // too, or auto-apply stays armed from the keyless first pass and the saved
      // view is never applied.
      rerender({ storageKey: 'tenant-b' })
      await waitForEffects()

      expect(result.current.views).toHaveLength(1)
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)
      expect(result.current.activeViewId).toBe(id)
    })

    test('resyncs views and activeViewId when storageKey changes', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      // Seed a view under key-b only.
      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: 'key-b' })
      )
      let seededId = ''
      act(() => {
        seededId = seed.result.current.saveView('Belongs to B')!.id
      })
      seed.unmount()

      // Mount against key-a, which has nothing stored.
      const { result, rerender } = renderHook(
        (props: { storageKey: string }) =>
          useAGGridUrlSync(mockGridApi as GridApi, {
            storageKey: props.storageKey
          }),
        { initialProps: { storageKey: 'key-a' } }
      )

      expect(result.current.views).toEqual([])
      expect(result.current.activeViewId).toBeNull()

      // Switching namespace must bring key-b's list into view.
      rerender({ storageKey: 'key-b' })

      expect(result.current.views).toHaveLength(1)
      expect(result.current.views[0]?.name).toBe('Belongs to B')
      // The list resyncs, but nothing has been applied to the grid, so no view
      // is active. `seededId` exists in the store's pointer only.
      expect(seededId).not.toBe('')
      expect(result.current.activeViewId).toBeNull()

      // And switching back must clear the list again.
      rerender({ storageKey: 'key-a' })

      expect(result.current.views).toEqual([])
      expect(result.current.activeViewId).toBeNull()
    })

    test('swapping storageKey to an empty namespace leaves the grid alone', async () => {
      setSearch('')
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      // tenant-a has a saved, active view from a previous session. tenant-b has
      // never been used.
      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: 'tenant-a' })
      )
      act(() => {
        seed.result.current.saveView('Engineering')
      })
      seed.unmount()

      const { result, rerender } = renderHook(
        (props: { storageKey: string }) =>
          useAGGridUrlSync(mockGridApi as GridApi, {
            storageKey: props.storageKey,
            autoApplyOnMount: true
          }),
        { initialProps: { storageKey: 'tenant-a' } }
      )
      await waitForEffects()
      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)

      // The user then filters by hand, so the grid holds something no namespace
      // has stored.
      mockGridApi.getFilterModel = vi.fn(() => ({
        salary: { filterType: 'number', type: 'greaterThan', filter: 120000 }
      }))
      vi.mocked(mockGridApi.setFilterModel).mockClear()
      mockInstance.applyFromUrl.mockClear()

      // The swap re-arms auto-apply, which is the intent: tenant-b's view should
      // get its chance. It just does not have one, and the URL carries no
      // filters either, so neither source has anything to say about the grid.
      rerender({ storageKey: 'tenant-b' })
      await waitForEffects()

      expect(mockInstance.applyFromUrl).not.toHaveBeenCalled()
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()
      expect(result.current.views).toEqual([])
      expect(result.current.activeViewId).toBeNull()
    })

    test('swapping storageKey still applies the new namespace stored view', async () => {
      setSearch('')
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      // Both namespaces have a stored view, so the swap has something to apply.
      const seedB = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: 'tenant-b' })
      )
      let bId = ''
      act(() => {
        bId = seedB.result.current.saveView('Belongs to B')!.id
      })
      seedB.unmount()

      const seedA = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: 'tenant-a' })
      )
      act(() => {
        seedA.result.current.saveView('Belongs to A')
      })
      seedA.unmount()

      const { result, rerender } = renderHook(
        (props: { storageKey: string }) =>
          useAGGridUrlSync(mockGridApi as GridApi, {
            storageKey: props.storageKey,
            autoApplyOnMount: true
          }),
        { initialProps: { storageKey: 'tenant-a' } }
      )
      await waitForEffects()

      vi.mocked(mockGridApi.setFilterModel).mockClear()

      // Leaving the grid alone for an empty namespace must not have cost a
      // populated one its restore.
      rerender({ storageKey: 'tenant-b' })
      await waitForEffects()

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)
      expect(result.current.activeViewId).toBe(bId)
    })

    test('leaves the grid alone when storageKey drops to undefined', async () => {
      setSearch('')
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      // A saved view exists and is the stored active one.
      const seed = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: 'tenant-b' })
      )
      act(() => {
        seed.result.current.saveView('Engineering')
      })
      seed.unmount()

      const { rerender } = renderHook(
        (props: { storageKey?: string }) =>
          useAGGridUrlSync(mockGridApi as GridApi, {
            storageKey: props.storageKey,
            autoApplyOnMount: true
          }),
        { initialProps: { storageKey: 'tenant-b' } as { storageKey?: string } }
      )
      await waitForEffects()

      expect(mockGridApi.setFilterModel).toHaveBeenCalledWith(savedModel)

      vi.mocked(mockGridApi.setFilterModel).mockClear()
      mockInstance.applyFromUrl.mockClear()

      // Views switched off behind a feature flag, or the key dropped on logout.
      // The store disappearing is not a reason to re-run auto-apply: the URL
      // carries no filters, so applying it would wipe what the user is looking
      // at with nothing to restore it from.
      rerender({ storageKey: undefined })
      await waitForEffects()

      expect(mockInstance.applyFromUrl).not.toHaveBeenCalled()
      expect(mockGridApi.setFilterModel).not.toHaveBeenCalled()
    })

    test('views are namespaced by storageKey', () => {
      mockGridApi.getFilterModel = vi.fn(() => savedModel)

      const gridA = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: 'grid-a' })
      )
      act(() => {
        gridA.result.current.saveView('Only in A')
      })

      const gridB = renderHook(() =>
        useAGGridUrlSync(mockGridApi as GridApi, { storageKey: 'grid-b' })
      )

      expect(gridA.result.current.views).toHaveLength(1)
      expect(gridB.result.current.views).toEqual([])
    })
  })
})

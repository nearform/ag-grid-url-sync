import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { GridApi } from 'ag-grid-community'
import { AGGridUrlSync } from '../core/ag-grid-url-sync.js'
import { parseUrlFilters as parseFilters } from '../core/url-parser.js'
import { DEFAULT_CONFIG } from '../core/validation.js'
import type { FilterState } from '../core/types.js'
import type {
  UseAGGridUrlSyncOptions,
  UseAGGridUrlSyncReturn
} from './types.js'

/**
 * React hook for AG Grid URL synchronization
 *
 * @param gridApi - AG Grid API instance (can be null during initialization)
 * @param options - Configuration options for the hook
 * @returns Hook API for URL synchronization
 */
export function useAGGridUrlSync(
  gridApi: GridApi | null,
  options: UseAGGridUrlSyncOptions = {}
): UseAGGridUrlSyncReturn {
  const {
    autoApplyOnMount = false,
    enabledWhenReady = true,
    ...coreOptions
  } = options

  // Internal state
  const [isReady, setIsReady] = useState(false)
  const [currentUrl, setCurrentUrl] = useState('')
  const [hasFilters, setHasFilters] = useState(false)

  // Refs to track state and prevent memory leaks
  const urlSyncRef = useRef<AGGridUrlSync | null>(null)
  const autoAppliedRef = useRef(false)
  const lastGridApiRef = useRef<GridApi | null>(null)

  // Initialize or update URL sync instance when grid API changes
  useEffect(() => {
    if (gridApi && enabledWhenReady) {
      // Clean up previous instance if grid API changed
      if (lastGridApiRef.current && lastGridApiRef.current !== gridApi) {
        urlSyncRef.current?.destroy()
        urlSyncRef.current = null
        autoAppliedRef.current = false
      }

      // Create new instance if needed
      if (!urlSyncRef.current) {
        try {
          urlSyncRef.current = new AGGridUrlSync(gridApi, coreOptions)
          setIsReady(true)
          lastGridApiRef.current = gridApi
        } catch (error) {
          console.error('Failed to initialize AG Grid URL Sync:', error)
          setIsReady(false)
        }
      }
    } else {
      // Clean up when grid API is null or disabled
      if (urlSyncRef.current) {
        urlSyncRef.current.destroy()
        urlSyncRef.current = null
        autoAppliedRef.current = false
      }
      setIsReady(false)
      lastGridApiRef.current = null
    }
  }, [gridApi, enabledWhenReady, coreOptions])

  // Auto-apply URL filters on mount if enabled
  useEffect(() => {
    if (
      isReady &&
      autoApplyOnMount &&
      !autoAppliedRef.current &&
      urlSyncRef.current
    ) {
      try {
        urlSyncRef.current.applyFromUrl()
        autoAppliedRef.current = true
      } catch (error) {
        console.error('Failed to auto-apply URL filters:', error)
        coreOptions.onParseError?.(error as Error)
      }
    }
  }, [isReady, autoApplyOnMount, coreOptions])

  // Update current URL and filter state on filter changes
  useEffect(() => {
    if (!isReady || !urlSyncRef.current || !gridApi) {
      setCurrentUrl('')
      setHasFilters(false)
      return
    }

    const updateState = () => {
      try {
        const newUrl = urlSyncRef.current!.generateUrl()
        setCurrentUrl(newUrl)

        // Check if there are active filters by comparing query params
        const queryParams = urlSyncRef.current!.getQueryParams()
        setHasFilters(queryParams.length > 1) // > 1 because it includes the '?' prefix
      } catch (error) {
        console.error('Failed to update URL state:', error)
      }
    }

    // Attach event listener for filter changes
    const onFilterChanged = () => updateState()
    gridApi.addEventListener('filterChanged', onFilterChanged)

    // Initial state update
    updateState()

    // Cleanup event listener on unmount or gridApi change
    return () => {
      gridApi.removeEventListener('filterChanged', onFilterChanged)
    }
  }, [isReady, gridApi])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (urlSyncRef.current) {
        urlSyncRef.current.destroy()
        urlSyncRef.current = null
      }
    }
  }, [])

  // Memoized API methods
  const shareUrl = useCallback((baseUrl?: string): string => {
    if (!urlSyncRef.current) {
      return (
        baseUrl || (typeof window !== 'undefined' ? window.location.href : '')
      )
    }
    try {
      return urlSyncRef.current.generateUrl(baseUrl)
    } catch (error) {
      console.error('Failed to generate share URL:', error)
      return (
        baseUrl || (typeof window !== 'undefined' ? window.location.href : '')
      )
    }
  }, [])

  const getQueryParams = useCallback((): string => {
    if (!urlSyncRef.current) {
      return ''
    }
    try {
      return urlSyncRef.current.getQueryParams()
    } catch (error) {
      console.error('Failed to get query params:', error)
      return ''
    }
  }, [])

  const applyUrlFilters = useCallback(
    (url?: string): void => {
      if (!urlSyncRef.current) {
        console.warn('AG Grid URL Sync not ready')
        return
      }
      try {
        urlSyncRef.current.applyFromUrl(url)
      } catch (error) {
        console.error('Failed to apply URL filters:', error)
        coreOptions.onParseError?.(error as Error)
      }
    },
    [coreOptions]
  )

  const clearFilters = useCallback((): void => {
    if (!urlSyncRef.current) {
      console.warn('AG Grid URL Sync not ready')
      return
    }
    try {
      urlSyncRef.current.clearFilters()
    } catch (error) {
      console.error('Failed to clear filters:', error)
    }
  }, [])

  const parseUrlFilters = useCallback(
    (url: string): FilterState => {
      if (!gridApi) {
        console.warn('AG Grid API not available')
        return {}
      }
      try {
        const config = {
          gridApi,
          paramPrefix: coreOptions.paramPrefix ?? DEFAULT_CONFIG.paramPrefix,
          maxValueLength:
            coreOptions.maxValueLength ?? DEFAULT_CONFIG.maxValueLength,
          onParseError: coreOptions.onParseError ?? (() => {})
        }
        return parseFilters(url, config)
      } catch (error) {
        console.error('Failed to parse URL filters:', error)
        coreOptions.onParseError?.(error as Error)
        return {}
      }
    },
    [coreOptions, gridApi]
  )

  const applyFilters = useCallback((filters: FilterState): void => {
    if (!urlSyncRef.current) {
      console.warn('AG Grid URL Sync not ready')
      return
    }
    try {
      urlSyncRef.current.applyFilters(filters)
    } catch (error) {
      console.error('Failed to apply filters:', error)
    }
  }, [])

  // Return the hook API
  return useMemo(
    () => ({
      shareUrl,
      getQueryParams,
      applyUrlFilters,
      clearFilters,
      isReady,
      currentUrl,
      hasFilters,
      parseUrlFilters,
      applyFilters
    }),
    [
      shareUrl,
      getQueryParams,
      applyUrlFilters,
      clearFilters,
      isReady,
      currentUrl,
      hasFilters,
      parseUrlFilters,
      applyFilters
    ]
  )
}

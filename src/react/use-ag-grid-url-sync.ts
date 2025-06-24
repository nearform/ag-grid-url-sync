/**
 * @fileoverview React Hook for AG Grid URL Synchronization
 *
 * This module provides a React hook that integrates the AGGridUrlSync core functionality
 * with React's lifecycle and state management. The hook provides an event-driven architecture
 * that updates state only when changes occur, avoiding performance issues with polling.
 *
 * Key features:
 * - Event-driven state updates (no polling)
 * - Automatic cleanup and memory leak prevention
 * - Error handling and recovery
 * - Optional auto-apply filters on mount
 * - Manual state refresh capability
 * - Integration with React's useEffect and useState
 *
 * The hook manages the AGGridUrlSync instance lifecycle and provides a React-friendly
 * API for URL synchronization operations.
 *
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { GridApi } from 'ag-grid-community'
import { AGGridUrlSync } from '../core/ag-grid-url-sync.js'
import type {
  FilterState,
  UrlInfo,
  ValidationResult,
  FilterType
} from '../core/types.js'
import type {
  UseAGGridUrlSyncOptions,
  UseAGGridUrlSyncReturn
} from './types.js'

/**
 * React hook for AG Grid URL synchronization with comprehensive filter support.
 *
 * Provides a React-friendly interface to the AGGridUrlSync functionality with
 * automatic lifecycle management, error handling, and state synchronization.
 * Uses an event-driven architecture that updates state only when changes occur,
 * avoiding performance issues with polling.
 *
 * The hook automatically manages the AGGridUrlSync instance creation and cleanup,
 * handles React-specific concerns like component unmounting, and provides
 * optimized state updates through manual refresh patterns.
 *
 * @param gridApi - AG Grid API instance (can be null during initialization)
 * @param options - Configuration options for the hook and underlying AGGridUrlSync
 * @param options.autoApplyOnMount - Whether to automatically apply URL filters when the hook mounts
 * @param options.enabledWhenReady - Whether to enable URL sync when grid API becomes available
 * @returns Hook API containing state, methods, and utilities for URL synchronization
 *
 * @example
 * ```typescript
 * function MyGridComponent() {
 *   const [gridApi, setGridApi] = useState<GridApi | null>(null);
 *
 *   const {
 *     isReady,
 *     currentUrl,
 *     hasFilters,
 *     toUrl,
 *     fromUrl,
 *     clearFilters,
 *     refresh
 *   } = useAGGridUrlSync(gridApi, {
 *     autoApplyOnMount: true,
 *     prefix: 'filter_',
 *     compression: 'auto'
 *   });
 *
 *   return (
 *     <div>
 *       <AgGridReact onGridReady={params => setGridApi(params.api)} />
 *       {isReady && (
 *         <button onClick={() => navigator.clipboard.writeText(currentUrl)}>
 *           Share Filtered View
 *         </button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [currentUrl, setCurrentUrl] = useState('')
  const [hasFilters, setHasFilters] = useState(false)
  const [urlInfo, setUrlInfo] = useState<UrlInfo>({
    length: 0,
    filterCount: 0,
    compressed: false,
    types: {}
  })
  const [columnTypes, setColumnTypes] = useState<Record<string, FilterType>>({})

  // Refs to track state and prevent memory leaks
  const urlSyncRef = useRef<AGGridUrlSync | null>(null)
  const autoAppliedRef = useRef(false)
  const lastGridApiRef = useRef<GridApi | null>(null)

  // Manual state refresh function
  const refreshState = useCallback(async () => {
    if (!urlSyncRef.current) {
      setCurrentUrl('')
      setHasFilters(false)
      setUrlInfo({
        length: 0,
        filterCount: 0,
        compressed: false,
        types: {}
      })
      setColumnTypes({})
      return
    }

    try {
      const [newUrl, newUrlInfo, newColumnTypes] = await Promise.all([
        urlSyncRef.current.toUrl(),
        urlSyncRef.current.getUrlInfo(),
        Promise.resolve(urlSyncRef.current.getColumnTypes())
      ])

      setCurrentUrl(newUrl)
      setUrlInfo(newUrlInfo)
      setColumnTypes(newColumnTypes)
      setHasFilters(newUrlInfo.filterCount > 0)

      // Clear error if state update succeeds
      if (error) {
        setError(null)
      }
    } catch (err) {
      const error = err as Error
      setError(error)
      if (coreOptions.debug) {
        console.error('Failed to refresh state:', error)
      }
    }
  }, [error, coreOptions.debug])

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
        setIsLoading(true)
        setError(null)

        try {
          urlSyncRef.current = new AGGridUrlSync(gridApi, {
            ...coreOptions,
            // Enhanced error handling for React
            onError: {
              parsing: (err, context) => {
                if (coreOptions.debug) {
                  console.warn('URL parsing error:', err, context)
                }
                setError(err)
                coreOptions.onError?.parsing?.(err, context)
              },
              typeDetection: (err, column) => {
                if (coreOptions.debug) {
                  console.warn('Type detection error:', err, column)
                }
                coreOptions.onError?.typeDetection?.(err, column)
              },
              urlLength: info => {
                if (coreOptions.debug) {
                  console.warn('URL length warning:', info)
                }
                coreOptions.onError?.urlLength?.(info)
              },
              validation: (err, filter) => {
                if (coreOptions.debug) {
                  console.warn('Validation error:', err, filter)
                }
                setError(err)
                coreOptions.onError?.validation?.(err, filter)
              }
            }
          })

          setIsReady(true)
          setError(null)
          lastGridApiRef.current = gridApi

          if (coreOptions.debug) {
            console.log('AGGridUrlSync React hook initialized')
          }

          // Initial state refresh
          refreshState()
        } catch (error) {
          const err = error as Error
          setError(err)
          setIsReady(false)
          if (coreOptions.debug) {
            console.error('Failed to initialize AG Grid URL Sync:', err)
          }
        } finally {
          setIsLoading(false)
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
      setError(null)
      lastGridApiRef.current = null
    }
  }, [gridApi, enabledWhenReady, coreOptions, refreshState])

  // Auto-apply URL filters on mount if enabled
  useEffect(() => {
    if (
      isReady &&
      autoApplyOnMount &&
      !autoAppliedRef.current &&
      urlSyncRef.current
    ) {
      setIsLoading(true)
      const applyFilters = async () => {
        try {
          await urlSyncRef.current!.fromUrl()
          autoAppliedRef.current = true
          if (coreOptions.debug) {
            console.log('Auto-applied URL filters on mount')
          }
          // Refresh state after applying filters
          await refreshState()
        } catch (error) {
          const err = error as Error
          setError(err)
          if (coreOptions.debug) {
            console.error('Failed to auto-apply URL filters:', err)
          }
        } finally {
          setIsLoading(false)
        }
      }
      applyFilters()
    }
  }, [isReady, autoApplyOnMount, coreOptions, refreshState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (urlSyncRef.current) {
        urlSyncRef.current.destroy()
        urlSyncRef.current = null
      }
    }
  }, [])

  // Primary API methods with automatic state refresh
  const shareUrl = useCallback(
    async (
      baseUrl?: string,
      options?: { compress?: boolean }
    ): Promise<string> => {
      if (!urlSyncRef.current) {
        return (
          baseUrl || (typeof window !== 'undefined' ? window.location.href : '')
        )
      }
      try {
        const result = await urlSyncRef.current.toUrl(baseUrl, options)
        setError(null) // Clear error on success
        // Refresh state after URL generation
        await refreshState()
        return result
      } catch (error) {
        const err = error as Error
        setError(err)
        if (coreOptions.debug) {
          console.error('Failed to generate share URL:', err)
        }
        return (
          baseUrl || (typeof window !== 'undefined' ? window.location.href : '')
        )
      }
    },
    [coreOptions, refreshState]
  )

  const getQueryParams = useCallback(
    async (options?: { compress?: boolean }): Promise<string> => {
      if (!urlSyncRef.current) {
        return ''
      }
      try {
        const result = await urlSyncRef.current.toParams(options)
        setError(null) // Clear error on success
        return result
      } catch (error) {
        const err = error as Error
        setError(err)
        if (coreOptions.debug) {
          console.error('Failed to get query params:', err)
        }
        return ''
      }
    },
    [coreOptions]
  )

  const applyUrlFilters = useCallback(
    async (url?: string): Promise<void> => {
      if (!urlSyncRef.current) {
        if (coreOptions.debug) {
          console.warn('AG Grid URL Sync not ready')
        }
        return
      }

      setIsLoading(true)
      try {
        await urlSyncRef.current.fromUrl(url)
        setError(null) // Clear error on success
        if (coreOptions.debug) {
          console.log('Applied URL filters successfully')
        }
        // Refresh state after applying filters
        await refreshState()
      } catch (error) {
        const err = error as Error
        setError(err)
        if (coreOptions.debug) {
          console.error('Failed to apply URL filters:', err)
        }
      } finally {
        setIsLoading(false)
      }
    },
    [coreOptions, refreshState]
  )

  const applyFilters = useCallback(
    async (filterState: FilterState): Promise<void> => {
      if (!urlSyncRef.current) {
        if (coreOptions.debug) {
          console.warn('AG Grid URL Sync not ready')
        }
        return
      }

      setIsLoading(true)
      try {
        urlSyncRef.current.fromFilters(filterState)
        setError(null) // Clear error on success
        if (coreOptions.debug) {
          console.log('Applied filter state successfully')
        }
        // Refresh state after applying filters
        await refreshState()
      } catch (error) {
        const err = error as Error
        setError(err)
        if (coreOptions.debug) {
          console.error('Failed to apply filter state:', err)
        }
      } finally {
        setIsLoading(false)
      }
    },
    [coreOptions, refreshState]
  )

  const clearFilters = useCallback(async (): Promise<void> => {
    if (!urlSyncRef.current) {
      if (coreOptions.debug) {
        console.warn('AG Grid URL Sync not ready')
      }
      return
    }

    setIsLoading(true)
    try {
      urlSyncRef.current.clearFilters()
      setError(null) // Clear error on success
      if (coreOptions.debug) {
        console.log('Cleared filters successfully')
      }
      // Refresh state after clearing filters
      await refreshState()
    } catch (error) {
      const err = error as Error
      setError(err)
      if (coreOptions.debug) {
        console.error('Failed to clear filters:', err)
      }
    } finally {
      setIsLoading(false)
    }
  }, [coreOptions, refreshState])

  const validateUrl = useCallback(
    async (url: string): Promise<ValidationResult> => {
      if (!urlSyncRef.current) {
        return {
          valid: false,
          errors: ['AG Grid URL Sync not ready'],
          warnings: []
        }
      }

      try {
        const result = await urlSyncRef.current.validateUrl(url)
        setError(null) // Clear error on success
        return result
      } catch (error) {
        const err = error as Error
        setError(err)
        return {
          valid: false,
          errors: [err.message],
          warnings: []
        }
      }
    },
    []
  )

  // Organized API surface using useMemo for performance
  const url = useMemo(
    () => ({
      share: shareUrl,
      current: currentUrl,
      info: urlInfo,
      validate: validateUrl
    }),
    [shareUrl, currentUrl, urlInfo, validateUrl]
  )

  const filters = useMemo(
    () => ({
      apply: applyUrlFilters,
      applyState: applyFilters,
      clear: clearFilters,
      count: urlInfo.filterCount,
      types: columnTypes
    }),
    [
      applyUrlFilters,
      applyFilters,
      clearFilters,
      urlInfo.filterCount,
      columnTypes
    ]
  )

  const status = useMemo(
    () => ({
      ready: isReady,
      loading: isLoading,
      error,
      hasFilters
    }),
    [isReady, isLoading, error, hasFilters]
  )

  return {
    // Primary API
    shareUrl,
    applyUrlFilters,
    clearFilters,

    // Status information
    isReady,
    hasFilters,
    isLoading,
    error,

    // Enhanced capabilities with comprehensive filter support
    urlInfo,
    columnTypes,
    validateUrl,
    applyFilters,
    getQueryParams,

    // Manual control
    refresh: refreshState,

    // Organized API surface
    url,
    filters,
    status
  }
}

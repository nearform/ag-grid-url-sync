![CI](https://github.com/nearform/ag-grid-url-sync/actions/workflows/ci.yml/badge.svg?event=push)

# AG Grid URL Sync

A comprehensive TypeScript library for synchronizing AG Grid filter states with URL parameters, enabling shareable filter views through clean, human-readable URLs with advanced filter support and intelligent type detection.

## Features

- 🔍 **Comprehensive Filter Support** - Text, number, date, and set filters with automatic type detection
- 🔗 **Manual URL Generation** - Create shareable URLs for specific filter states
- ↔️ **Bidirectional Sync** - Seamless synchronization between grid and URL
- 🛠️ **Framework Agnostic** - Core functionality works with any AG Grid setup
- ⚛️ **Enhanced React Hook** - Dedicated `useAGGridUrlSync` with comprehensive state management
- 📝 **Full TypeScript Support** - Strict mode compliance with comprehensive type definitions
- 🚦 **Robust Error Handling** - Configurable error callbacks with graceful fallbacks
- 🧹 **Clean URL Format** - Human-readable URLs with configurable prefixes
- ⚡ **High Performance** - Optimized for 100+ filters with intelligent caching (<20ms)
- 📊 **Smart Type Detection** - Automatic filter type detection with hierarchical analysis
- 🗜️ **URL Compression** - Automatic compression for complex filter states
- 🔧 **Configurable Behavior** - Extensive configuration options for different use cases
- 🛡️ **Robust Edge Case Handling** - Special characters, malformed URLs, and validation
- 📦 **Lightweight Bundle** - Optimized bundle size (~5KB gzipped)

## Supported Filter Types

The library provides comprehensive support for all major AG Grid filter types with intelligent type detection:

| Filter Type | Operations                                                  | URL Format                                                                                         | Example                                                                                               |
| ----------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Text**    | `contains`, `equals`                                        | `f_column_contains=value`<br>`f_column_eq=value`                                                   | `f_name_contains=john`<br>`f_status_eq=active`                                                        |
| **Number**  | `equals`, `notEquals`, `greaterThan`, `lessThan`, `inRange` | `f_column_eq=123`<br>`f_column_gt=100`<br>`f_column_range=10,50`                                   | `f_price_eq=99.99`<br>`f_age_gt=18`<br>`f_score_range=80,100`                                         |
| **Date**    | `equals`, `notEquals`, `before`, `after`, `inRange`         | `f_column_eq=2024-01-15`<br>`f_column_before=2024-12-31`<br>`f_column_range=2024-01-01,2024-12-31` | `f_created_eq=2024-01-15`<br>`f_deadline_before=2024-12-31`<br>`f_period_range=2024-01-01,2024-12-31` |
| **Set**     | `in`                                                        | `f_column_in=value1,value2,value3`                                                                 | `f_category_in=tech,finance,marketing`                                                                |

### Intelligent Type Detection

The library automatically detects the appropriate filter type using a hierarchical approach:

1. **User-defined columnTypes** (highest priority)
2. **User-provided typeHints** (dateColumns, numberColumns, setColumns)
3. **AG Grid column filter configuration** (agNumberColumnFilter, agDateColumnFilter, etc.)
4. **AG Grid cell data type analysis** (cellDataType property)
5. **Smart value analysis** (optional, analyzes actual data values)
6. **Default to text filter** (most permissive)

### URL Compression

For complex filter states, the library automatically compresses URLs using multiple algorithms:

- **Automatic compression** when URLs exceed configurable thresholds
- **Multiple compression algorithms** (LZ-style, gzip, base64) with best-result selection
- **URL-safe encoding** for all compressed data
- **Transparent decompression** when loading filters from URLs

### URL Examples

- **Simple text filter**: `https://app.com/data?f_name_contains=john`
- **Multiple filters**: `https://app.com/data?f_name_contains=john&f_department_eq=Engineering&f_salary_gt=50000`
- **Date range**: `https://app.com/data?f_created_range=2024-01-01,2024-12-31`
- **Set filter**: `https://app.com/data?f_category_in=tech,finance,marketing`
- **Compressed**: `https://app.com/data?_c=lz:H4sIAAAAAAAAA...` (automatic for complex states)

## Installation

```bash
npm install ag-grid-url-sync
```

## Usage

### Importing the Library

The library provides two main entry points:

```typescript
// Core functionality - works with any framework
import { createUrlSync } from 'ag-grid-url-sync'

// React hook - for React applications
import { useAGGridUrlSync } from 'ag-grid-url-sync/react'

// TypeScript types (available from both imports)
import type { FilterState, AGGridUrlSyncConfig } from 'ag-grid-url-sync'
```

### Basic Example

```typescript
import { createUrlSync } from 'ag-grid-url-sync'

// Initialize with AG Grid API
const urlSync = createUrlSync(gridApi, {
  prefix: 'f_',
  compression: 'auto',
  typeDetection: 'smart'
})

// Generate shareable URL with current filters
const shareableUrl = await urlSync.toUrl()

// Apply filters from URL
await urlSync.fromUrl()

// Clear all filters
urlSync.clearFilters()

// Get detailed URL information
const urlInfo = await urlSync.getUrlInfo()
console.log(
  `URL has ${urlInfo.filterCount} filters, compressed: ${urlInfo.compressed}`
)
```

## React Integration

For React applications, use the enhanced `useAGGridUrlSync` hook that provides comprehensive state management and React-specific features.

### Basic React Usage

```tsx
import React, { useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { useAGGridUrlSync } from 'ag-grid-url-sync/react'

function GridComponent() {
  const [gridApi, setGridApi] = useState(null)

  const {
    shareUrl,
    applyUrlFilters,
    clearFilters,
    hasFilters,
    isReady,
    urlInfo,
    error,
    isLoading
  } = useAGGridUrlSync(gridApi, {
    autoApplyOnMount: true,
    prefix: 'filter_',
    compression: 'auto',
    typeDetection: 'smart'
  })

  const handleShare = async () => {
    const url = await shareUrl()
    await navigator.clipboard.writeText(url)
    alert('Filter URL copied!')
  }

  if (error) {
    console.error('URL sync error:', error)
  }

  return (
    <div>
      <div style={{ marginBottom: '10px' }}>
        <button onClick={handleShare} disabled={!isReady || isLoading}>
          📋 Share Filters ({urlInfo.filterCount})
        </button>
        <button onClick={clearFilters} disabled={!hasFilters}>
          🗑️ Clear Filters
        </button>
        <button onClick={applyUrlFilters}>🔄 Apply URL Filters</button>
        {urlInfo.compressed && (
          <span style={{ color: 'green' }}>🗜️ Compressed URL</span>
        )}
      </div>

      <div className="ag-theme-alpine" style={{ height: 400, width: '100%' }}>
        <AgGridReact
          onGridReady={params => setGridApi(params.api)}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={{
            filter: true, // Enables automatic type detection
            floatingFilter: true
          }}
        />
      </div>
    </div>
  )
}
```

### Advanced React Usage with Type Configuration

```tsx
import React, { useState } from 'react'
import { useAGGridUrlSync } from 'ag-grid-url-sync/react'

function AdvancedGridComponent() {
  const [gridApi, setGridApi] = useState(null)

  const {
    shareUrl,
    applyUrlFilters,
    clearFilters,
    validateUrl,
    urlInfo,
    columnTypes,
    isReady,
    error,
    // Organized API access
    url,
    filters,
    status
  } = useAGGridUrlSync(gridApi, {
    autoApplyOnMount: true,
    prefix: 'emp_',

    // Configure type detection
    typeDetection: 'smart',
    columnTypes: {
      employee_id: 'number',
      hire_date: 'date',
      department: 'set'
    },
    typeHints: {
      dateColumns: ['created_at', 'updated_at'],
      numberColumns: ['salary', 'age'],
      setColumns: ['skills', 'certifications']
    },

    // Configure compression
    compression: {
      strategy: 'auto',
      threshold: 1500,
      algorithms: ['lz', 'gzip', 'base64']
    },

    // Configure limits
    limits: {
      valueLength: 100,
      urlLength: 2000,
      setValues: 25
    },

    // Error handling
    onError: {
      parsing: (error, context) => {
        console.warn('Parsing error:', error.message, context)
      },
      validation: (error, filter) => {
        console.warn('Validation error:', error.message, filter)
      }
    },

    debug: true
  })

  const handleValidateUrl = async () => {
    const url = prompt('Enter URL to validate:')
    if (url) {
      const result = await validateUrl(url)
      if (result.valid) {
        alert('URL is valid!')
      } else {
        alert(`Invalid URL: ${result.errors.join(', ')}`)
      }
    }
  }

  const handleShareViaEmail = async () => {
    const shareableUrl = await shareUrl()
    const subject = 'Filtered Data View'
    const body = `Check out this filtered data: ${shareableUrl}`
    window.open(
      `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    )
  }

  return (
    <div>
      <div className="controls">
        <button onClick={handleShareViaEmail} disabled={!isReady}>
          📧 Share via Email
        </button>
        <button onClick={handleValidateUrl}>🔍 Validate URL</button>
        <button onClick={clearFilters} disabled={!hasFilters}>
          Clear ({filters.count} filters)
        </button>
      </div>

      <div className="info">
        <p>Status: {status.ready ? 'Ready' : 'Loading'}</p>
        <p>Filters: {filters.count} active</p>
        <p>URL Length: {url.info.length} chars</p>
        {url.info.compressed && (
          <p>Compression: {url.info.compressionRatio?.toFixed(2)}x ratio</p>
        )}
      </div>

      {error && <div className="error">Error: {error.message}</div>}

      {/* Grid component */}
    </div>
  )
}
```

### React Router Integration

```tsx
import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAGGridUrlSync } from 'ag-grid-url-sync/react'

function RouterGridComponent() {
  const [gridApi, setGridApi] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  const { shareUrl, clearFilters, hasFilters, isReady, urlInfo } =
    useAGGridUrlSync(gridApi, {
      autoApplyOnMount: true,
      prefix: 'f_',
      compression: 'auto'
    })

  // Sync filters with browser URL
  useEffect(() => {
    const updateBrowserUrl = async () => {
      if (!isReady) return

      const filterUrl = await shareUrl(
        window.location.origin + location.pathname
      )
      const urlParams = new URL(filterUrl).searchParams
      const currentParams = new URLSearchParams(location.search)

      // Clear existing filter params
      for (const [key] of currentParams) {
        if (key.startsWith('f_')) {
          currentParams.delete(key)
        }
      }

      // Add current filter params
      for (const [key, value] of urlParams) {
        if (key.startsWith('f_')) {
          currentParams.set(key, value)
        }
      }

      const newSearch = currentParams.toString()
      if (newSearch !== location.search.substring(1)) {
        navigate(`${location.pathname}?${newSearch}`, { replace: true })
      }
    }

    updateBrowserUrl()
  }, [urlInfo.filterCount, isReady, shareUrl, location.pathname, navigate])

  return (
    <div>
      <button onClick={clearFilters} disabled={!hasFilters}>
        Clear Filters
      </button>
      {/* Grid component */}
    </div>
  )
}
```

### React Hook API

#### `useAGGridUrlSync(gridApi, options?)`

```tsx
import { useAGGridUrlSync } from 'ag-grid-url-sync/react'

const {
  shareUrl,
  applyUrlFilters,
  clearFilters,
  isReady,
  hasFilters,
  isLoading,
  error,
  urlInfo,
  columnTypes,
  validateUrl,
  applyFilters,
  getQueryParams,
  refresh,
  // Organized API access
  url,
  filters,
  status
} = useAGGridUrlSync(gridApi, options)
```

#### Hook Options

```tsx
interface UseAGGridUrlSyncOptions extends AGGridUrlSyncConfig {
  // React-specific options
  autoApplyOnMount?: boolean // Default: false
  enabledWhenReady?: boolean // Default: true

  // Core options
  prefix?: string // Default: 'f_'
  typeDetection?: 'smart' | 'strict' | 'disabled' // Default: 'smart'
  compression?: CompressionStrategy | CompressionConfig // Default: 'auto'

  // Limits configuration
  limits?: {
    valueLength?: number // Default: 200
    urlLength?: number // Default: 2000
    setValues?: number // Default: 50
  }

  // Type detection configuration
  columnTypes?: Record<string, FilterType>
  typeHints?: {
    dateColumns?: string[]
    numberColumns?: string[]
    setColumns?: string[]
  }

  // Error handling
  onError?: {
    parsing?: (error: Error, context: ParseContext) => void
    typeDetection?: (error: Error, column: string) => void
    urlLength?: (info: UrlLengthInfo) => void
    validation?: (error: Error, filter: FilterInfo) => void
    compression?: (error: Error, data: CompressionContext) => void
  }

  // Debug options
  debug?: boolean
  validateOnApply?: boolean
  performanceMonitoring?: boolean
}
```

#### Hook Return Values

| Property          | Type                                                                      | Description                                     |
| ----------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| `shareUrl`        | `(baseUrl?: string, options?: { compress?: boolean }) => Promise<string>` | Generate shareable URL with current filters     |
| `applyUrlFilters` | `(url?: string) => Promise<void>`                                         | Apply filters from URL to grid                  |
| `clearFilters`    | `() => Promise<void>`                                                     | Clear all filters                               |
| `isReady`         | `boolean`                                                                 | Whether grid API is available and hook is ready |
| `hasFilters`      | `boolean`                                                                 | Whether grid has any active filters             |
| `isLoading`       | `boolean`                                                                 | Whether hook is currently processing            |
| `error`           | `Error \| null`                                                           | Current error state                             |
| `urlInfo`         | `UrlInfo`                                                                 | Comprehensive URL information and statistics    |
| `columnTypes`     | `Record<string, FilterType>`                                              | Detected column types                           |
| `validateUrl`     | `(url: string) => Promise<ValidationResult>`                              | Validate URL format                             |
| `applyFilters`    | `(filters: FilterState) => Promise<void>`                                 | Apply filter state object                       |
| `getQueryParams`  | `(options?: { compress?: boolean }) => Promise<string>`                   | Get query parameters                            |
| `refresh`         | `() => Promise<void>`                                                     | Manually refresh hook state                     |
| `url`             | `object`                                                                  | Organized URL operations                        |
| `filters`         | `object`                                                                  | Organized filter operations                     |
| `status`          | `object`                                                                  | Organized status information                    |

## API Reference

### `createUrlSync(gridApi, config?)`

Factory function to create a new AGGridUrlSync instance with comprehensive configuration.

```typescript
import { createUrlSync } from 'ag-grid-url-sync'

const urlSync = createUrlSync(gridApi, {
  prefix: 'f_',
  typeDetection: 'smart',
  compression: 'auto',
  columnTypes: {
    id: 'number',
    created_date: 'date',
    categories: 'set'
  },
  limits: {
    valueLength: 200,
    urlLength: 2000,
    setValues: 50
  },
  onError: {
    parsing: (err, context) => console.warn('Parse error:', err, context),
    validation: (err, filter) => console.warn('Validation error:', err, filter)
  }
})
```

### `AGGridUrlSync` Class

#### Methods

##### `toUrl(baseUrl?: string, options?: { compress?: boolean }): Promise<string>`

Generates a complete URL with current filter state.

```typescript
const url = await urlSync.toUrl('https://app.com/page')
// https://app.com/page?f_name_contains=john&f_age_gt=25

// Force compression
const compressedUrl = await urlSync.toUrl(undefined, { compress: true })
```

##### `toParams(options?: { compress?: boolean }): Promise<string>`

Gets the current filter state as URL query parameters.

```typescript
const params = await urlSync.toParams()
// ?f_name_contains=john&f_age_gt=25
```

##### `fromUrl(url?: string): Promise<void>`

Applies filters from a URL to the grid with automatic decompression.

```typescript
await urlSync.fromUrl('https://app.com/page?f_name_contains=john')
```

##### `fromFilters(filterState: FilterState): void`

Applies a filter state object directly to the grid.

```typescript
await urlSync.fromFilters({
  name: {
    filterType: 'text',
    type: 'contains',
    filter: 'john'
  },
  age: {
    filterType: 'number',
    type: 'greaterThan',
    filter: 25
  }
})
```

##### `getUrlInfo(): Promise<UrlInfo>`

Gets comprehensive information about the current URL state.

```typescript
const info = await urlSync.getUrlInfo()
console.log({
  length: info.length,
  filterCount: info.filterCount,
  compressed: info.compressed,
  compressionRatio: info.compressionRatio,
  types: info.types
})
```

##### `validateUrl(url: string): Promise<ValidationResult>`

Validates a URL for proper filter format.

```typescript
const result = await urlSync.validateUrl(url)
if (!result.valid) {
  console.error('Invalid URL:', result.errors)
}
```

##### `clearFilters(): void`

Clears all filters from the grid.

```typescript
urlSync.clearFilters()
```

##### `getColumnTypes(): Record<string, FilterType>`

Gets the detected column types.

```typescript
const types = urlSync.getColumnTypes()
// { name: 'text', age: 'number', created_date: 'date' }
```

### Configuration

```typescript
interface AGGridUrlSyncConfig {
  // URL parameter prefix
  prefix?: string // Default: 'f_'

  // Type detection strategy
  typeDetection?: 'smart' | 'strict' | 'disabled' // Default: 'smart'

  // Compression configuration
  compression?: CompressionStrategy | CompressionConfig // Default: 'auto'

  // Value and URL limits
  limits?: {
    valueLength?: number // Default: 200
    urlLength?: number // Default: 2000
    setValues?: number // Default: 50
  }

  // Type detection hints
  columnTypes?: Record<string, FilterType>
  typeHints?: {
    dateColumns?: string[]
    numberColumns?: string[]
    setColumns?: string[]
  }

  // Error handling
  onError?: {
    parsing?: (error: Error, context: ParseContext) => void
    typeDetection?: (error: Error, column: string) => void
    urlLength?: (info: UrlLengthInfo) => void
    validation?: (error: Error, filter: FilterInfo) => void
    compression?: (error: Error, data: CompressionContext) => void
  }

  // Debug and performance
  debug?: boolean
  validateOnApply?: boolean
  performanceMonitoring?: boolean
}
```

#### Compression Configuration

```typescript
interface CompressionConfig {
  strategy: 'auto' | 'always' | 'never' | 'gzip' | 'lz'
  threshold: number // Auto-compress threshold (default: 2000)
  algorithms: ('gzip' | 'lz' | 'base64')[] // Algorithm preference
  level: number // Compression level (default: 6)
}
```

## Examples

Check out the [examples](./examples) directory for comprehensive working demos:

### Vanilla JavaScript Examples

#### 📝 [Basic Example](./examples/vanilla-js/basic-example.html)

Simple HTML/JS implementation showing core functionality with comprehensive filter support.

#### 🚀 [Advanced Demo](./examples/vanilla-js/advanced-demo.html)

Feature-rich demonstration including:

- Performance monitoring and benchmarks
- All filter types (text, number, date, set)
- Compression and type detection
- Multiple filter scenarios
- Error testing and validation

#### 🔗 [Multi-Grid Demo](./examples/vanilla-js/multi-grid-demo.html)

Complex example with multiple independent grids:

- Four separate grids with different filter types
- Independent URL namespacing
- Combined and individual filter management

### React Examples

#### ⚛️ [Basic React Grid](./examples/react-basic/basic-grid.tsx)

Complete React component with the enhanced `useAGGridUrlSync` hook:

- Comprehensive filter support
- Error handling and loading states
- URL compression and validation

#### 🛣️ [React Router Integration](./examples/react-router/router-grid.tsx)

Advanced React example with React Router:

- Browser URL synchronization
- Automatic filter restoration
- Advanced state management

All examples work out-of-the-box and demonstrate the full range of features including comprehensive filter support, type detection, and URL compression.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

[![banner](https://raw.githubusercontent.com/nearform/.github/refs/heads/master/assets/os-banner-green.svg)](https://www.nearform.com/contact/?utm_source=open-source&utm_medium=banner&utm_campaign=os-project-pages)

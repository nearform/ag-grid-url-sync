![CI](https://github.com/nearform/ag-grid-url-sync/actions/workflows/ci.yml/badge.svg?event=push)

# AG Grid URL Sync

A lightweight TypeScript library for synchronizing AG Grid text filters with URL parameters, enabling shareable filter states through clean, human-readable URLs.

## Features

- 🔍 Text filter synchronization (`contains` and `equals` operations)
- 🔗 Manual URL generation for sharing filter states
- ↔️ Bidirectional sync between grid and URL
- 🛠️ Framework agnostic - works with any AG Grid setup
- ⚛️ **React hook** - dedicated `useAGGridUrlSync` with state management
- 📝 Full TypeScript support with strict mode compliance
- 🚦 Graceful error handling with configurable error callbacks
- 🧹 Clean, human-readable URL format
- ⚡ High performance - handles 100+ filters efficiently (<20ms)
- 🔧 Configurable URL prefixes for multi-grid scenarios
- 🛡️ Robust edge case handling (special characters, malformed URLs)
- 📦 Lightweight bundle size (~3KB gzipped)

## Supported Filter Types

Currently supports **AG Grid text filters** with the following operations:

| Filter Type | Operations | URL Format                | Example                |
| ----------- | ---------- | ------------------------- | ---------------------- |
| **Text**    | `contains` | `f_column_contains=value` | `f_name_contains=john` |
| **Text**    | `equals`   | `f_column_eq=value`       | `f_status_eq=active`   |

### Filter Detection

The library automatically works with:

- Columns configured with `filter: 'agTextColumnFilter'`
- Columns with `filter: true` (AG Grid's default text filter)
- Any column where users apply text-based filters

### URL Examples

- Simple: `https://app.com/data?f_name_contains=john`
- Multiple: `https://app.com/data?f_name_contains=john&f_department_eq=Engineering&f_email_contains=company.com`

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

### Tree-Shaking & Granular Imports

For optimal bundle sizes, you can import only the specific utilities you need:

```typescript
import {
  validateFilterValue,
  DEFAULT_CONFIG
} from 'ag-grid-url-sync/validation'

import { parseUrlFilters, parseFilterParam } from 'ag-grid-url-sync/url-parser'

import { serializeFilters, generateUrl } from 'ag-grid-url-sync/url-generator'

import {
  getFilterModel,
  applyFilterModel
} from 'ag-grid-url-sync/grid-integration'

import type {
  FilterState,
  ColumnFilter,
  FilterOperation
} from 'ag-grid-url-sync/types'
```

#### Bundle Size Comparison

| Import Pattern   | Bundle Size | Use Case               |
| ---------------- | ----------- | ---------------------- |
| Full library     | 5KB         | Complete functionality |
| Core class only  | 3.2KB       | Basic URL sync         |
| React hook only  | 7KB         | React applications     |
| URL parsing only | 1.05KB      | Parse existing URLs    |
| Validation only  | 318B        | Input validation       |
| Types only       | 0B          | TypeScript types       |

#### Example: Custom URL Parser

```typescript
import { parseUrlFilters } from 'ag-grid-url-sync/url-parser'
import { DEFAULT_CONFIG } from 'ag-grid-url-sync/validation'
import type { FilterState } from 'ag-grid-url-sync/types'

function getFiltersFromUrl(url: string): FilterState {
  const config = {
    gridApi: null, // Not needed for parsing
    ...DEFAULT_CONFIG,
    onParseError: error => console.error('Parse error:', error)
  }

  return parseUrlFilters(url, config)
}
```

#### Example: Custom URL Generator

```typescript
import { generateUrl, serializeFilters } from 'ag-grid-url-sync/url-generator'
import type { FilterState } from 'ag-grid-url-sync/types'

function createShareableUrl(filters: FilterState, baseUrl: string): string {
  const config = {
    gridApi: null, // Not needed for generation
    paramPrefix: 'f_',
    maxValueLength: 200,
    onParseError: () => {}
  }

  return generateUrl(baseUrl, filters, config)
}
```

**💡 Pro Tip**: Use granular imports in libraries and applications where bundle size matters. All existing import patterns remain fully supported for backward compatibility.

### Basic Example

```typescript
import { createUrlSync } from 'ag-grid-url-sync'

// Initialize with AG Grid API
const urlSync = createUrlSync(gridApi)

// Generate shareable URL with current filters
const shareableUrl = urlSync.generateUrl()

// Apply filters from URL
urlSync.applyFromUrl()

// Clear all text filters
urlSync.clearFilters()
```

## React Integration

For React applications, use the dedicated `useAGGridUrlSync` hook that provides a complete solution with React-specific features and state management.

### Installation for React

```bash
npm install ag-grid-url-sync
```

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
    currentUrl
  } = useAGGridUrlSync(gridApi, {
    autoApplyOnMount: true,
    paramPrefix: 'filter_'
  })

  const handleShare = async () => {
    const url = shareUrl()
    await navigator.clipboard.writeText(url)
    alert('Filter URL copied!')
  }

  return (
    <div>
      <div style={{ marginBottom: '10px' }}>
        <button onClick={handleShare} disabled={!isReady}>
          📋 Share Filters
        </button>
        <button onClick={clearFilters} disabled={!hasFilters}>
          🗑️ Clear Filters
        </button>
        <button onClick={applyUrlFilters}>🔄 Apply URL Filters</button>
      </div>

      <div className="ag-theme-alpine" style={{ height: 400, width: '100%' }}>
        <AgGridReact
          onGridReady={params => setGridApi(params.api)}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={{
            filter: 'agTextColumnFilter',
            floatingFilter: true
          }}
        />
      </div>
    </div>
  )
}
```

### React Router Integration

For single-page applications using React Router, you can sync filters with the browser URL:

```tsx
import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAGGridUrlSync } from 'ag-grid-url-sync/react'

function RouterGridComponent() {
  const [gridApi, setGridApi] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  const { shareUrl, clearFilters, hasFilters, isReady } = useAGGridUrlSync(
    gridApi,
    {
      autoApplyOnMount: true, // Automatically apply filters from URL on mount
      paramPrefix: 'f_'
    }
  )

  // Update browser URL with current filters
  const updateUrlWithFilters = () => {
    const url = shareUrl()
    const urlParams = new URL(url).searchParams
    const currentParams = new URLSearchParams(location.search)

    // Clear existing filter params
    for (const [key] of currentParams) {
      if (key.startsWith('f_')) {
        currentParams.delete(key)
      }
    }

    // Add current filter params
    for (const [key, value] of urlParams) {
      currentParams.set(key, value)
    }

    navigate(`${location.pathname}?${currentParams.toString()}`, {
      replace: true
    })
  }

  return (
    <div>
      <button onClick={updateUrlWithFilters} disabled={!isReady}>
        Update URL with Filters
      </button>
      <button onClick={clearFilters} disabled={!hasFilters}>
        Clear All Filters
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
  getQueryParams,
  applyUrlFilters,
  clearFilters,
  isReady,
  currentUrl,
  hasFilters,
  parseUrlFilters,
  applyFilters
} = useAGGridUrlSync(gridApi, options)
```

#### Hook Options

```tsx
interface UseAGGridUrlSyncOptions {
  // Core options (same as createUrlSync)
  paramPrefix?: string // Default: 'f_'
  maxValueLength?: number // Default: 200
  onParseError?: (error: Error) => void

  // React-specific options
  autoApplyOnMount?: boolean // Default: false
  enabledWhenReady?: boolean // Default: true
}
```

#### Hook Return Values

| Property          | Type                             | Description                                     |
| ----------------- | -------------------------------- | ----------------------------------------------- |
| `shareUrl`        | `(baseUrl?: string) => string`   | Generate shareable URL with current filters     |
| `getQueryParams`  | `() => string`                   | Get filter state as query parameters            |
| `applyUrlFilters` | `(url?: string) => void`         | Apply filters from URL to grid                  |
| `clearFilters`    | `() => void`                     | Clear all text filters                          |
| `isReady`         | `boolean`                        | Whether grid API is available and hook is ready |
| `currentUrl`      | `string`                         | Current URL with filters applied                |
| `hasFilters`      | `boolean`                        | Whether grid has any active text filters        |
| `parseUrlFilters` | `(url: string) => FilterState`   | Parse filters from URL without applying         |
| `applyFilters`    | `(filters: FilterState) => void` | Apply filter state object to grid               |

### React Features

- **🔄 Automatic State Management**: Tracks grid state and filter changes automatically
- **⚡ Ready State**: `isReady` indicates when the grid API is available
- **🎯 Auto-Apply**: `autoApplyOnMount` applies URL filters when component mounts
- **🧹 Cleanup**: Automatically cleans up resources when component unmounts
- **🛡️ Error Boundaries**: Graceful error handling with configurable callbacks
- **📊 Filter Status**: `hasFilters` tracks whether any filters are active

### Advanced React Example

```tsx
import React, { useState, useEffect } from 'react'
import { useAGGridUrlSync } from 'ag-grid-url-sync/react'

function AdvancedGridComponent() {
  const [gridApi, setGridApi] = useState(null)
  const [shareMessage, setShareMessage] = useState('')

  const {
    shareUrl,
    applyUrlFilters,
    clearFilters,
    hasFilters,
    isReady,
    currentUrl,
    parseUrlFilters
  } = useAGGridUrlSync(gridApi, {
    autoApplyOnMount: true,
    paramPrefix: 'emp_',
    maxValueLength: 100,
    onParseError: error => {
      console.warn('Filter parsing error:', error.message)
      setShareMessage('Invalid filter URL detected')
    }
  })

  // Watch for URL changes
  useEffect(() => {
    if (currentUrl !== window.location.href) {
      setShareMessage('Filters have changed - URL ready to share')
    }
  }, [currentUrl])

  const handleShareToEmail = () => {
    const url = shareUrl()
    const subject = 'Check out this filtered data'
    const body = `View the filtered data here: ${url}`
    window.open(
      `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    )
  }

  const handlePreviewFilters = () => {
    const url = prompt('Enter URL to preview filters:')
    if (url) {
      const filters = parseUrlFilters(url)
      console.log('Parsed filters:', filters)
      alert(`Found ${Object.keys(filters).length} filter(s)`)
    }
  }

  return (
    <div>
      <div className="controls">
        <button onClick={handleShareToEmail} disabled={!isReady}>
          📧 Share via Email
        </button>
        <button onClick={handlePreviewFilters}>👁️ Preview URL Filters</button>
        <button onClick={clearFilters} disabled={!hasFilters}>
          Clear ({hasFilters ? 'has filters' : 'no filters'})
        </button>
      </div>

      {shareMessage && <div className="message">{shareMessage}</div>}

      {/* Grid component */}
    </div>
  )
}
```

### URL Format

The library generates clean, human-readable URLs:

```
Base URL: https://app.com/page
With filters: https://app.com/page?f_name_contains=john&f_status_eq=active
```

Parameter structure:

- Prefix: `f_` (configurable - useful for multi-grid scenarios)
- Format: `f_{columnName}_{operation}={value}`
- Operations: `contains`, `eq` (equals)
- Standard URL encoding for special characters
- Supports column names with underscores (e.g., `user_id`, `created_date`)

## API Reference

### `createUrlSync(gridApi, config?)`

Factory function to create a new AGGridUrlSync instance.

```typescript
import { createUrlSync } from 'ag-grid-url-sync'

const urlSync = createUrlSync(gridApi, {
  paramPrefix: 'f_', // Default: 'f_'
  maxValueLength: 200, // Default: 200
  onParseError: err => console.warn(err)
})
```

### `AGGridUrlSync` Class

#### Constructor

```typescript
new AGGridUrlSync(gridApi: GridApi, config?: AGGridUrlSyncConfig)
```

#### Methods

##### `generateUrl(baseUrl?: string): string`

Generates a URL with the current filter state.

```typescript
const url = urlSync.generateUrl('https://app.com/page')
// https://app.com/page?f_name_contains=john
```

##### `getQueryParams(): string`

Gets the current filter state as URL query parameters.

```typescript
const params = urlSync.getQueryParams()
// ?f_name_contains=john
```

##### `applyFromUrl(url?: string): void`

Applies filters from a URL to the grid.

```typescript
urlSync.applyFromUrl('https://app.com/page?f_name_contains=john')
```

##### `applyFilters(filterState: FilterState): void`

Applies a filter state object to the grid.

```typescript
urlSync.applyFilters({
  name: {
    filterType: 'text',
    type: 'contains',
    filter: 'john'
  }
})
```

##### `clearFilters(): void`

Clears all text filters from the grid.

```typescript
urlSync.clearFilters()
```

##### `destroy(): void`

Cleans up any resources or event listeners.

```typescript
urlSync.destroy()
```

### Configuration

```typescript
interface AGGridUrlSyncConfig {
  // Prefix for URL parameters (default: 'f_')
  // Useful for multi-grid scenarios: 'emp_', 'proj_', etc.
  paramPrefix?: string

  // Maximum length for filter values (default: 200)
  maxValueLength?: number

  // Optional error handler for parsing errors
  // Called when URLs contain invalid filter parameters
  onParseError?: (error: Error) => void
}
```

## Examples

Check out the [examples](./examples) directory for comprehensive working demos:

### Vanilla JavaScript Examples

### 📝 [Basic Example](./examples/vanilla-js/basic-example.html)

Simple HTML/JS implementation showing core functionality:

- Initialize URL sync with AG Grid
- Generate shareable URLs
- Apply filters from URLs
- Handle filter changes

### 🚀 [Advanced Demo](./examples/vanilla-js/advanced-demo.html)

Feature-rich demonstration including:

- Performance monitoring and benchmarks
- Multiple filter scenarios (Sales, Engineering, Executive views)
- URL sharing workflow with copy/email/Slack functionality
- Error testing with malformed URLs and invalid filters
- Memory and stress testing capabilities

### 🔗 [Multi-Grid Demo](./examples/vanilla-js/multi-grid-demo.html)

Complex example with multiple independent grids:

- Four separate grids (Employees, Projects, Departments, Metrics)
- Individual URL namespacing with different prefixes
- Combined URL generation merging all grid states
- Independent grid controls and clearing functions

### React Examples

### ⚛️ [Basic React Grid](./examples/react-basic/basic-grid.tsx)

Complete React component showing the `useAGGridUrlSync` hook:

- React hook integration with AG Grid
- Automatic filter state management
- Share button with clipboard functionality
- Filter status indicators and controls
- Auto-apply filters on component mount

### 🛣️ [React Router Integration](./examples/react-router/router-grid.tsx)

Advanced React example with React Router:

- Browser URL synchronization
- Navigation-aware filter persistence
- Automatic filter restoration on page refresh
- Clean URL management with multiple parameters
- User-controlled URL updates

All examples work out-of-the-box. HTML files can be opened directly in your browser, while React examples show complete implementation patterns.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

[![banner](https://raw.githubusercontent.com/nearform/.github/refs/heads/master/assets/os-banner-green.svg)](https://www.nearform.com/contact/?utm_source=open-source&utm_medium=banner&utm_campaign=os-project-pages)

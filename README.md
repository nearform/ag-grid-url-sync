![CI](https://github.com/nearform/ag-grid-url-sync/actions/workflows/ci.yml/badge.svg?event=push)

# AG Grid URL Sync

A lightweight TypeScript library for synchronizing AG Grid text filters with URL parameters, enabling shareable filter states through clean, human-readable URLs. Now with native React integration!

## Features

- 🔍 Text filter synchronization (`contains` and `equals` operations)
- ⚛️ **NEW**: Native React hook integration
- 🔗 Manual URL generation for sharing filter states
- ↔️ Bidirectional sync between grid and URL
- 🛠️ Framework agnostic core + React-specific integration
- 📝 Full TypeScript support with strict mode compliance
- 🚦 Graceful error handling with configurable error callbacks
- 🧹 Clean, human-readable URL format
- ⚡ High performance - handles 100+ filters efficiently (<20ms)
- 🔧 Configurable URL prefixes for multi-grid scenarios
- 🛡️ Robust edge case handling (special characters, malformed URLs)
- 📦 Lightweight bundle size (~5KB core + ~2KB React integration)

## Installation

```bash
npm install ag-grid-url-sync
```

For React integration, also install React as a peer dependency:

```bash
npm install react ag-grid-react
```

## Quick Start

### Vanilla JavaScript/TypeScript

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

### React Hook (NEW in v0.2)

```tsx
import { useAGGridUrlSync } from 'ag-grid-url-sync/react'
import { AgGridReact } from 'ag-grid-react'

function GridComponent() {
  const [gridApi, setGridApi] = useState(null)

  const { shareUrl, applyUrlFilters, clearFilters, hasFilters, isReady } =
    useAGGridUrlSync(gridApi, {
      autoApplyOnMount: true
    })

  const handleShare = async () => {
    const url = shareUrl()
    await navigator.clipboard.writeText(url)
    alert('Filter URL copied!')
  }

  return (
    <div>
      <div>
        <button onClick={handleShare} disabled={!isReady}>
          📋 Share Filters
        </button>
        <button onClick={clearFilters} disabled={!hasFilters}>
          🗑️ Clear Filters
        </button>
      </div>

      <AgGridReact
        onGridReady={params => setGridApi(params.api)}
        // ... other props
        defaultColDef={{
          filter: 'agTextColumnFilter',
          floatingFilter: true
        }}
      />
    </div>
  )
}
```

## React Router Integration

```tsx
import { useNavigate, useLocation } from 'react-router-dom'
import { useAGGridUrlSync } from 'ag-grid-url-sync/react'

function RouterGrid() {
  const [gridApi, setGridApi] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  const { shareUrl, clearFilters, hasFilters } = useAGGridUrlSync(gridApi, {
    autoApplyOnMount: true
  })

  // Update browser URL with filters (user controls when)
  const updateUrlWithFilters = () => {
    const url = shareUrl()
    const urlParams = new URL(url).searchParams
    const currentParams = new URLSearchParams(location.search)

    // Clear existing grid params and add current ones
    for (const [key] of currentParams) {
      if (key.startsWith('f_')) currentParams.delete(key)
    }
    for (const [key, value] of urlParams) {
      currentParams.set(key, value)
    }

    navigate(`${location.pathname}?${currentParams.toString()}`, {
      replace: true
    })
  }

  return (
    <div>
      <button onClick={updateUrlWithFilters}>🔗 Update URL with Filters</button>
      {/* ... grid component */}
    </div>
  )
}
```

## Import Structure

AG Grid URL Sync v0.2 provides two import paths:

```typescript
// Core vanilla JS library (unchanged from v0.1)
import { createUrlSync, AGGridUrlSync } from 'ag-grid-url-sync'

// React integration (new in v0.2)
import { useAGGridUrlSync } from 'ag-grid-url-sync/react'

// Types (available from both paths)
import type { FilterState, AGGridUrlSyncConfig } from 'ag-grid-url-sync'
import type { UseAGGridUrlSyncOptions } from 'ag-grid-url-sync/react'
```

## URL Format

The library generates clean, human-readable URLs:

```
Base URL: https://app.com/page
With filters: https://app.com/page?f_name_contains=john&f_status_eq=active
```

Parameter structure:

- Prefix: `f_` (configurable)
- Format: `f_{columnName}_{operation}={value}`
- Operations: `contains`, `eq` (equals)
- Standard URL encoding for special characters

## Core API Reference

### `createUrlSync(gridApi, config?)`

Factory function to create a new AGGridUrlSync instance.

```typescript
import { createUrlSync } from 'ag-grid-url-sync'

const urlSync = createUrlSync(gridApi, {
  paramPrefix: 'f_',
  maxValueLength: 200,
  onParseError: err => console.warn(err)
})
```

### `AGGridUrlSync` Class

#### Methods

- `generateUrl(baseUrl?: string): string` - Generate URL with current filters
- `getQueryParams(): string` - Get query parameters for current filters
- `applyFromUrl(url?: string): void` - Apply filters from URL
- `applyFilters(filterState: FilterState): void` - Apply filter state object
- `clearFilters(): void` - Clear all text filters
- `destroy(): void` - Clean up resources

## React Hook API Reference

### `useAGGridUrlSync(gridApi, options?)`

React hook for AG Grid URL synchronization.

```typescript
function useAGGridUrlSync(
  gridApi: GridApi | null,
  options?: UseAGGridUrlSyncOptions
): UseAGGridUrlSyncReturn
```

#### Options

```typescript
interface UseAGGridUrlSyncOptions {
  // Core library options
  paramPrefix?: string // Default: 'f_'
  maxValueLength?: number // Default: 200
  onParseError?: (error: Error) => void

  // React-specific options
  autoApplyOnMount?: boolean // Default: false
  enabledWhenReady?: boolean // Default: true
}
```

#### Return Value

```typescript
interface UseAGGridUrlSyncReturn {
  // URL generation
  shareUrl: (baseUrl?: string) => string
  getQueryParams: () => string

  // Filter management
  applyUrlFilters: (url?: string) => void
  clearFilters: () => void

  // State information
  isReady: boolean // Grid API is available
  currentUrl: string // Current generated URL
  hasFilters: boolean // Grid has active text filters

  // Advanced methods
  parseUrlFilters: (url: string) => FilterState
  applyFilters: (filters: FilterState) => void
}
```

## Configuration

### Core Configuration

```typescript
interface AGGridUrlSyncConfig {
  paramPrefix?: string // URL parameter prefix (default: 'f_')
  maxValueLength?: number // Max filter value length (default: 200)
  onParseError?: (error: Error) => void // Error handler
}
```

### React Hook Configuration

Extends core configuration with React-specific options:

```typescript
interface UseAGGridUrlSyncOptions extends AGGridUrlSyncConfig {
  autoApplyOnMount?: boolean // Auto-apply URL filters on mount
  enabledWhenReady?: boolean // Enable when grid API is ready
}
```

## Examples

The library includes comprehensive examples:

### Vanilla JavaScript Examples

- **Basic Example** (`examples/vanilla-js/basic-example.html`) - Simple filter sharing
- **Advanced Demo** (`examples/vanilla-js/advanced-demo.html`) - Complex scenarios

### React Examples

- **Basic React** (`examples/react-basic/`) - Simple React integration
- **React Router** (`examples/react-router/`) - URL synchronization with routing

## Browser Support

- Chrome 63+
- Firefox 67+
- Safari 12+
- Edge 79+

## TypeScript

Full TypeScript support with strict mode compliance. All types are exported:

```typescript
import type {
  AGGridUrlSyncConfig,
  FilterState,
  ColumnFilter,
  FilterOperation,
  GridApi
} from 'ag-grid-url-sync'

import type {
  UseAGGridUrlSyncOptions,
  UseAGGridUrlSyncReturn
} from 'ag-grid-url-sync/react'
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

[![banner](https://raw.githubusercontent.com/nearform/.github/refs/heads/master/assets/os-banner-green.svg)](https://www.nearform.com/contact/?utm_source=open-source&utm_medium=banner&utm_campaign=os-project-pages)

![CI](https://github.com/nearform/hub-template/actions/workflows/ci.yml/badge.svg?event=push)

# AG Grid URL Sync

[![banner](https://raw.githubusercontent.com/nearform/.github/refs/heads/master/assets/os-banner-green.svg)](https://www.nearform.com/contact/?utm_source=open-source&utm_medium=banner&utm_campaign=os-project-pages)

A lightweight TypeScript library for synchronizing AG Grid text filters with URL parameters, enabling shareable filter states through clean, human-readable URLs.

## Features

- 🔍 Text filter synchronization (`contains` and `equals` operations)
- 🔗 Manual URL generation for sharing filter states
- ↔️ Bidirectional sync between grid and URL
- 🛠️ Framework agnostic - works with any AG Grid setup
- 📝 Full TypeScript support with strict mode compliance
- 🚦 Graceful error handling with configurable error callbacks
- 🧹 Clean, human-readable URL format
- ⚡ High performance - handles 100+ filters efficiently (<20ms)
- 🔧 Configurable URL prefixes for multi-grid scenarios
- 🛡️ Robust edge case handling (special characters, malformed URLs)
- 📦 Lightweight bundle size (~3KB gzipped)

## Installation

```bash
npm install ag-grid-url-sync
```

## Usage

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

### React Integration

```tsx
import { createUrlSync } from 'ag-grid-url-sync'
import { useCallback, useMemo } from 'react'

function useGridUrlSync(gridApi) {
  const urlSync = useMemo(
    () => (gridApi ? createUrlSync(gridApi) : null),
    [gridApi]
  )

  const shareUrl = useCallback(() => urlSync?.generateUrl() || '', [urlSync])

  const applyUrlFilters = useCallback(() => urlSync?.applyFromUrl(), [urlSync])

  return { shareUrl, applyUrlFilters }
}

// In your component
function GridComponent() {
  const { shareUrl, applyUrlFilters } = useGridUrlSync(gridApi)

  return (
    <div>
      <button
        onClick={() => {
          const url = shareUrl()
          navigator.clipboard.writeText(url)
        }}
      >
        Share Filters
      </button>
      <button onClick={applyUrlFilters}>Apply URL Filters</button>
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

### 📝 [Basic Example](./examples/basic-example.html)

Simple HTML/JS implementation showing core functionality:

- Initialize URL sync with AG Grid
- Generate shareable URLs
- Apply filters from URLs
- Handle filter changes

### 🚀 [Advanced Demo](./examples/advanced-demo.html)

Feature-rich demonstration including:

- Performance monitoring and benchmarks
- Multiple filter scenarios (Sales, Engineering, Executive views)
- URL sharing workflow with copy/email/Slack functionality
- Error testing with malformed URLs and invalid filters
- Memory and stress testing capabilities

### 🔗 [Multi-Grid Demo](./examples/multi-grid-demo.html)

Complex example with multiple independent grids:

- Four separate grids (Employees, Projects, Departments, Metrics)
- Individual URL namespacing with different prefixes
- Combined URL generation merging all grid states
- Independent grid controls and clearing functions

All examples work out-of-the-box by opening the HTML files in your browser.

## Testing

This library includes a comprehensive test suite to ensure reliability:

- **60+ tests** covering core functionality, edge cases, and performance scenarios
- **Edge case handling** for malformed URLs, special characters, and invalid data
- **TypeScript strict mode** compliance with all strict compiler flags
- **Cross-browser compatibility** testing

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

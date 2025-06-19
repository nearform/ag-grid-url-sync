![CI](https://github.com/nearform/hub-template/actions/workflows/ci.yml/badge.svg?event=push)

# Hub Template

A feature-packed template to start a new repository on the hub, including:

- code linting with [ESlint](https://eslint.org) and [prettier](https://prettier.io)
- pre-commit code linting and commit message linting with [husky](https://www.npmjs.com/package/husky) and [commitlint](https://commitlint.js.org/)
- dependabot setup with automatic merging thanks to ["merge dependabot" GitHub action](https://github.com/fastify/github-action-merge-dependabot)
- notifications about commits waiting to be released thanks to ["notify release" GitHub action](https://github.com/nearform/github-action-notify-release)
- PRs' linked issues check with ["check linked issues" GitHub action](https://github.com/nearform/github-action-check-linked-issues)
- Continuous Integration GitHub workflow

[![banner](https://raw.githubusercontent.com/nearform/.github/refs/heads/master/assets/os-banner-green.svg)](https://www.nearform.com/contact/?utm_source=open-source&utm_medium=banner&utm_campaign=os-project-pages)

# AG Grid URL Sync

A lightweight TypeScript library for synchronizing AG Grid text filters with URL parameters, enabling shareable filter states through clean, human-readable URLs.

## Features

- 🔍 Text filter synchronization (`contains` and `equals` operations)
- 🔗 Manual URL generation for sharing filter states
- ↔️ Bidirectional sync between grid and URL
- 🛠️ Framework agnostic - works with any AG Grid setup
- 📝 Full TypeScript support
- 🚦 Graceful error handling
- 🧹 Clean, human-readable URL format

## Installation

```bash
npm install ag-grid-url-state-sync
```

## Usage

### Basic Example

```typescript
import { createUrlSync } from 'ag-grid-url-state-sync'

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
import { createUrlSync } from 'ag-grid-url-state-sync'
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

- Prefix: `f_` (configurable)
- Format: `f_{columnName}_{operation}={value}`
- Operations: `contains`, `eq` (equals)
- Standard URL encoding for special characters

## API Reference

### `createUrlSync(gridApi, config?)`

Factory function to create a new AGGridUrlSync instance.

```typescript
import { createUrlSync } from 'ag-grid-url-state-sync'

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
  paramPrefix?: string

  // Maximum length for filter values (default: 200)
  maxValueLength?: number

  // Optional error handler for parsing errors
  onParseError?: (error: Error) => void
}
```

## Examples

Check out the [examples](./examples) directory for working demos:

- [Basic Example](./examples/basic-example.html) - Simple HTML/JS implementation
- More examples coming soon...

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

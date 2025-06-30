![CI](https://github.com/nearform/ag-grid-url-sync/actions/workflows/ci.yml/badge.svg?event=push)

# AG Grid URL Sync

A lightweight TypeScript library for synchronizing AG Grid text and number filters with URL parameters, enabling shareable filter states through clean, human-readable URLs.

## Features

- 🔍 **Complete text filter support** - All 8 AG Grid text operations (contains, equals, not contains, not equal, starts with, ends with, blank, not blank)
- 🔢 **Complete number filter support** - All 9 AG Grid number operations (equals, not equal, greater than, greater than or equal, less than, less than or equal, in range, blank, not blank)
- 🔢 **Complete date filter support** - All 9 AG Grid date operations (equals, not equal, before, before or equal, after, after or equal, in range, blank, not blank) with strict ISO date validation (YYYY-MM-DD)
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

Supports **all AG Grid text, number, and date filter operations** (26 total) with clean, human-readable URL parameters:

### Text Filters (8 operations)

| Filter Type | Operation    | URL Format                   | Example                    | Description                 |
| ----------- | ------------ | ---------------------------- | -------------------------- | --------------------------- |
| **Text**    | Contains     | `f_column_contains=value`    | `f_name_contains=john`     | Text contains value         |
| **Text**    | Equals       | `f_column_eq=value`          | `f_status_eq=active`       | Text equals value exactly   |
| **Text**    | Not Contains | `f_column_notContains=value` | `f_name_notContains=spam`  | Text does not contain value |
| **Text**    | Not Equal    | `f_column_neq=value`         | `f_status_neq=inactive`    | Text does not equal value   |
| **Text**    | Starts With  | `f_column_startsWith=value`  | `f_email_startsWith=admin` | Text starts with value      |
| **Text**    | Ends With    | `f_column_endsWith=value`    | `f_file_endsWith=.pdf`     | Text ends with value        |
| **Text**    | Blank        | `f_column_blank=true`        | `f_optional_blank=true`    | Field is empty/null         |
| **Text**    | Not Blank    | `f_column_notBlank=true`     | `f_required_notBlank=true` | Field has any value         |

### Number Filters (9 operations)

| Filter Type | Operation             | URL Format               | Example                  | Description                   |
| ----------- | --------------------- | ------------------------ | ------------------------ | ----------------------------- |
| **Number**  | Equals                | `f_column_eq=value`      | `f_age_eq=30`            | Number equals value exactly   |
| **Number**  | Not Equal             | `f_column_neq=value`     | `f_salary_neq=50000`     | Number does not equal value   |
| **Number**  | Greater Than          | `f_column_gt=value`      | `f_experience_gt=5`      | Number is greater than value  |
| **Number**  | Greater Than or Equal | `f_column_gte=value`     | `f_score_gte=85`         | Number is ≥ value             |
| **Number**  | Less Than             | `f_column_lt=value`      | `f_budget_lt=10000`      | Number is less than value     |
| **Number**  | Less Than or Equal    | `f_column_lte=value`     | `f_hours_lte=40`         | Number is ≤ value             |
| **Number**  | In Range              | `f_column_range=min,max` | `f_age_range=25,45`      | Number is between min and max |
| **Number**  | Blank                 | `f_column_blank=true`    | `f_bonus_blank=true`     | Field is empty/null           |
| **Number**  | Not Blank             | `f_column_notBlank=true` | `f_salary_notBlank=true` | Field has any numeric value   |

### Date Filters (9 operations)

| Filter Type | Operation       | URL Format                     | Example                                    | Description                               |
| ----------- | --------------- | ------------------------------ | ------------------------------------------ | ----------------------------------------- |
| **Date**    | Equals          | `f_column_eq=YYYY-MM-DD`       | `f_created_eq=2024-01-15`                  | Date equals value exactly                 |
| **Date**    | Not Equal       | `f_column_neq=YYYY-MM-DD`      | `f_deadline_neq=2024-12-31`                | Date does not equal value                 |
| **Date**    | Before          | `f_column_before=YYYY-MM-DD`   | `f_deadline_before=2024-12-31`             | Date is before value                      |
| **Date**    | Before or Equal | `f_column_beforeEq=YYYY-MM-DD` | `f_archived_beforeEq=2024-12-31`           | Date is before or equal to value          |
| **Date**    | After           | `f_column_after=YYYY-MM-DD`    | `f_created_after=2024-01-01`               | Date is after value                       |
| **Date**    | After or Equal  | `f_column_afterEq=YYYY-MM-DD`  | `f_updated_afterEq=2024-06-01`             | Date is after or equal to value           |
| **Date**    | In Range        | `f_column_daterange=start,end` | `f_period_daterange=2024-01-01,2024-12-31` | Date is between start and end (inclusive) |
| **Date**    | Blank           | `f_column_blank=true`          | `f_deadline_blank=true`                    | Date field is empty/null                  |
| **Date**    | Not Blank       | `f_column_notBlank=true`       | `f_created_notBlank=true`                  | Date field has any value                  |

> **🗓️ Date Format Note**: Date filters require strict ISO format (`YYYY-MM-DD`). All date values are validated for real calendar dates, including leap years and month boundaries. Invalid or non-ISO dates will be rejected.

### Filter Detection

The library automatically works with:

- **Text columns** configured with `filter: 'agTextColumnFilter'`
- **Number columns** configured with `filter: 'agNumberColumnFilter'`
- **Auto-detection** based on `cellDataType: 'number'` configuration
- Columns with `filter: true` (AG Grid's default text filter)
- Any column where users apply text, number, or date-based filters
- All AG Grid text, number, and date filter operations through the filter menu
- **Mixed filter types** - combine text, number, and date filters in the same URL

### URL Examples

**Simple text filter:**

```
https://app.com/data?f_name_contains=john
```

**Simple number filter:**

```
https://app.com/data?f_salary_gt=75000
```

**Simple date filter:**

```
https://app.com/data?f_created_eq=2024-01-15
```

**Date range filter:**

```
https://app.com/data?f_period_daterange=2024-01-01,2024-12-31
```

**Date before/after filter:**

```
https://app.com/data?f_deadline_before=2024-12-31&f_created_after=2024-01-01
```

**Mixed text, number, and date filters:**

```
https://app.com/data?f_name_contains=john&f_department_eq=Engineering&f_salary_gte=80000&f_age_range=25,45&f_created_after=2024-01-01
```

**All date operations:**

```
https://app.com/data?f_created_eq=2024-01-15&f_deadline_neq=2024-12-31&f_start_after=2024-01-01&f_end_before=2024-12-31&f_updated_afterEq=2024-06-01&f_archived_beforeEq=2024-12-31&f_period_daterange=2024-01-01,2024-12-31&f_optional_blank=true&f_required_notBlank=true
```

**Blank operations (text, number, and date):**

```
https://app.com/data?f_comments_blank=true&f_bonus_blank=true&f_name_notBlank=true&f_salary_notBlank=true&f_deadline_blank=true&f_created_notBlank=true
```

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

// Generate shareable URL with current filters (text and number)
const shareableUrl = urlSync.generateUrl()
// Result: https://app.com/data?f_name_contains=john&f_salary_gte=80000&f_age_range=25,45

// Apply filters from URL (automatically detects text vs number columns)
urlSync.applyFromUrl(
  'https://app.com/data?f_name_contains=manager&f_salary_gt=75000'
)

// Apply specific filter programmatically
urlSync.applyFilters({
  name: { filterType: 'text', type: 'contains', filter: 'john' },
  salary: { filterType: 'number', type: 'greaterThan', filter: 75000 },
  age: { filterType: 'number', type: 'inRange', filter: 25, filterTo: 45 }
})

// Clear all text and number filters
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
          columnDefs={[
            {
              field: 'name',
              filter: 'agTextColumnFilter',
              floatingFilter: true
            },
            {
              field: 'email',
              filter: 'agTextColumnFilter',
              floatingFilter: true
            },
            {
              field: 'salary',
              filter: 'agNumberColumnFilter',
              floatingFilter: true
            },
            {
              field: 'age',
              filter: 'agNumberColumnFilter',
              floatingFilter: true
            }
          ]}
          defaultColDef={{
            flex: 1,
            sortable: true,
            resizable: true
          }}
        />
      </div>
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
With text filters: https://app.com/page?f_name_contains=john&f_status_eq=active
With number filters: https://app.com/page?f_salary_gte=75000&f_age_range=25,45
Mixed filters: https://app.com/page?f_name_contains=john&f_salary_gte=75000&f_age_lt=50
```

Parameter structure:

- Prefix: `f_` (configurable - useful for multi-grid scenarios)
- Format: `f_{columnName}_{operation}={value}`
- **Text Operations**: `contains`, `eq`, `neq`, `startsWith`, `endsWith`, `notContains`, `blank`, `notBlank`
- **Number Operations**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `range`, `blank`, `notBlank`
- **Date Operations**: `eq`, `neq`, `before`, `beforeEq`, `after`, `afterEq`, `range`, `blank`, `notBlank`
- **Range Format**: `f_column_range=min,max` (comma-separated values)
- Standard URL encoding for special characters
- Supports column names with underscores (e.g., `user_id`, `salary_base`, `created_date`)

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

### 🚀 [Vanilla JavaScript Demo](./examples/vanilla-js/demo.html)

Comprehensive demonstration showcasing all features:

- **Complete text filter support** - All 8 AG Grid text operations (contains, equals, not contains, not equal, starts with, ends with, blank, not blank)
- **Complete number filter support** - All 9 AG Grid number operations (equals, not equal, greater than, greater than or equal, less than, less than or equal, in range, blank, not blank)
- **Complete date filter support** - All 9 AG Grid date operations (equals, not equal, before, before or equal, after, after or equal, in range, blank, not blank)
- **Mixed filter scenarios** - Text, number, and date filters working together (Sales team + salary filters, Engineering + experience, Executive view with high salaries)
- **Number operation demos** - Dedicated buttons for salary ranges, age filtering, experience thresholds, and blank number fields
- **URL sharing workflow** - Copy to clipboard, email, and Slack integration
- **Performance monitoring** - Real-time benchmarks and stress testing with mixed filter types
- **Error handling** - Malformed URL and invalid filter testing for both text, number, and date
- **Complete API showcase** - Generate URLs, apply filters, clear filters with comprehensive examples

### ⚛️ [React Integration](./examples/react-basic/basic-grid.tsx)

Clean React component showing the `useAGGridUrlSync` hook:

- React hook integration with AG Grid for text, number, and date filters
- Automatic filter state management for mixed filter types
- Share button with clipboard functionality
- Filter status indicators and controls
- Auto-apply filters on component mount with all filter types
- Enhanced employee data with salary, age, and experience columns
- Full TypeScript support with comprehensive type coverage

### 📊 [Shared Data](./examples/shared-data.js)

Common data and column definitions used across examples:

- Enhanced employee data with salary, age, and experience number fields
- Project data with budget and numeric fields for comprehensive testing
- Column definitions with complete text, number, and date filter support
- All 8 text filter operations, 9 number filter operations, and 9 date filter operations enabled
- Realistic data ranges for demonstrating number and date filters (salaries $58K-$95K, ages 26-42, experience 3-15 years)
- Includes null values for demonstrating blank/notBlank operations

All examples work out-of-the-box and demonstrate the complete functionality. The HTML demo can be opened directly in your browser, while the React example shows clean integration patterns.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

[![banner](https://raw.githubusercontent.com/nearform/.github/refs/heads/master/assets/os-banner-green.svg)](https://www.nearform.com/contact/?utm_source=open-source&utm_medium=banner&utm_campaign=os-project-pages)

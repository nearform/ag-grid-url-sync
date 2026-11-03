![CI](https://github.com/nearform/ag-grid-url-sync/actions/workflows/ci.yml/badge.svg?event=push)

# AG Grid URL Sync

A lightweight TypeScript library for synchronizing AG Grid text and number filters with URL parameters, enabling shareable filter states through clean, human-readable URLs.

## Features

- 🔍 **Complete text filter support** - All 8 AG Grid text operations (contains, equals, not contains, not equal, starts with, ends with, blank, not blank)
- 🔢 **Complete number filter support** - All 9 AG Grid number operations (equals, not equal, greater than, greater than or equal, less than, less than or equal, in range, blank, not blank)
- 🔢 **Complete date filter support** - All 9 AG Grid date operations (equals, not equal, before, before or equal, after, after or equal, in range, blank, not blank) with strict ISO date validation (YYYY-MM-DD)
- � **Grouped serialization** - Package all filters into a single URL parameter with querystring, JSON, or base64 encoding
- �🔗 Manual URL generation for sharing filter states
- ↔️ Bidirectional sync between grid and URL
- 🛠️ Framework agnostic - works with any AG Grid setup
- ⚛️ **React hook** - dedicated `useAGGridUrlSync` with state management
- 📝 Full TypeScript support with strict mode compliance
- 🚦 Graceful error handling with configurable error callbacks
- 🧹 Clean, human-readable URL format
- ⚡ High performance - handles 100+ filters efficiently (<20ms)
- 🔧 Configurable URL prefixes
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
import { createGridUrlSync } from 'ag-grid-url-sync'

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
import type { FilterState } from 'ag-grid-url-sync/types'

function getFiltersFromUrl(url: string): FilterState {
  // Options that you leave out get their defaults. No grid is needed.
  return parseUrlFilters(url, {
    onParseError: error => console.error('Parse error:', error)
  })
}
```

`parseUrlFilters` reads the input with these rules, in this order:

| #   | Input                       | Result                   | Example                                   |
| --- | --------------------------- | ------------------------ | ----------------------------------------- |
| 1   | A host with no scheme       | Throws `InvalidURLError` | `example.com?…`, `localhost:3000?…`       |
| 2   | Starts with a scheme        | Absolute URL             | `https://example.com/users?f_name_eq=bob` |
| 3   | Starts with `/`, `?` or `#` | Relative URL             | `/users?f_name_eq=bob`, `?f_name_eq=bob`  |
| 4   | Anything else               | Raw query string         | `f_name_eq=bob`                           |

- A relative path must start with `/`. `users?f_name_eq=bob` matches rule 4, so it gives no filters.
- A bare `localhost?…` with no port cannot be told apart from a raw query, so it matches rule 4.
- In a raw query string, a `?` or `#` is part of a param name or value.

`InvalidURLError` is thrown for rule 1, and for any input that the `URL` constructor rejects under rules 2 and 3 (for example `http://` or `//[`). A param that is not valid is skipped and sent to `onParseError`.

#### Example: Custom URL Generator

```typescript
import { generateUrl } from 'ag-grid-url-sync/url-generator'
import type { FilterState } from 'ag-grid-url-sync/types'

function createShareableUrl(filters: FilterState, baseUrl: string): string {
  return generateUrl(baseUrl, filters, { maxValueLength: 500 })
}
```

#### Example: Read and Write the Grid Filters

```typescript
import {
  getFilterModel,
  applyFilterModel
} from 'ag-grid-url-sync/grid-integration'

const filters = getFilterModel(gridApi, { onParseError: console.warn })
applyFilterModel(filters, otherGridApi)
```

The config form (`getFilterModel({ ...DEFAULT_CONFIG, gridApi })`) still works, but it is deprecated.

**💡 Pro Tip**: Use granular imports in libraries and applications where bundle size matters. All existing import patterns remain fully supported for backward compatibility.

### Vanilla JS: `createGridUrlSync`

One call gives full sync. `createGridUrlSync` applies the address bar's filters to the grid, follows the grid's filter changes, can write them to the address bar, and removes its listeners when the grid is destroyed.

```typescript
import { createGridUrlSync, individual, grouped } from 'ag-grid-url-sync'

const sync = createGridUrlSync({
  api: gridApi,
  codec: individual({ prefix: 'f_' }), // or grouped({ param: 'gf', format: 'json' })
  history: 'replace', // 'none' (default) | 'replace' | 'push' | (url) => router.replace(url)
  onIssue: ({ issue, source }) => {
    if (issue.severity === 'warning') showToast(issue.message)
  }
})

// The current state: { status, url, hasFilters, issues }
const { url, hasFilters } = sync.getSnapshot()

// Called after each change of the snapshot. Returns an unsubscribe function.
const unsubscribe = sync.subscribe(() => render(sync.getSnapshot()))

sync.applyUrl('https://app.com/data?f_name_contains=jo') // { issues }
sync.getUrl('https://app.com/share') // a share link for the grid's filters
sync.destroy()
```

| Option             | Default                   | Meaning                                                                                                                                                                                          |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api`              | (required)                | The AG Grid API                                                                                                                                                                                  |
| `codec`            | `individual()`            | How the filters are written in the URL. `individual({ prefix })` writes one param for each filter; `grouped({ param, format })` writes all filters in one param                                  |
| `maxValueLength`   | `200`                     | The longest text value that is kept                                                                                                                                                              |
| `history`          | `'none'`                  | How a filter change goes to the address bar. `'replace'` and `'push'` use `window.history`; a function gets the URL, for a router. The page's other params, the `#hash` and `history.state` stay |
| `popstate`         | `true` only with `'push'` | Apply the URL when the back or forward button changes it                                                                                                                                         |
| `applyUrlOnCreate` | `true`                    | Apply the address bar's filters on create. A URL with no filter params keeps the grid's filters (for example from `initialState`), and with `history` they are written to the URL with replace   |
| `throwOnError`     | `false`                   | Throw an issue instead of reporting it, in `applyUrl` and `getUrl`. `createGridUrlSync` and its listeners never throw                                                                            |
| `onIssue`          | none                      | Gets each issue one time, as `{ issue, source }`. `source` is `'url'` (the sync read the address bar), `'grid'` (it read the grid) or `'api'` (a method that the app called)                     |

The snapshot `status` is `'active'` from create, and `'destroyed'` after `destroy()` or after the grid is destroyed. `IDLE_SNAPSHOT` (`status: 'idle'`) is the snapshot for a time when there is no sync yet. `getSnapshot()` returns the same object until something changes, so it works with React's `useSyncExternalStore`. The sync never writes for its own applies, so an apply never adds a history entry. Nothing reads `window` when the module loads, and a sync made with no `window` does nothing to the address bar.

### Basic Example (deprecated `createUrlSync`)

`createUrlSync` and `AGGridUrlSync` will be removed in 0.6.0. Use `createGridUrlSync`.

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

## Grouped Serialization

Grouped serialization provides an alternative to individual URL parameters by packaging all filters into a single URL parameter. This is particularly useful for applications with many filters or when you need more compact URLs.

### Why Use Grouped Serialization?

**Individual serialization** (default):

```
https://app.com/data?f_name_contains=john&f_age_gt=25&f_salary_gte=80000&f_created_after=2024-01-01
```

**Grouped serialization**:

```
https://app.com/data?grid_filters=f_name_contains%3Djohn%26f_age_gt%3D25%26f_salary_gte%3D80000%26f_created_after%3D2024-01-01
```

Benefits of grouped serialization:

- **Cleaner URLs** with a single parameter instead of many
- **Better for sharing** - easier to copy/paste and less prone to URL manipulation

- **Format flexibility** - choose between querystring, JSON, or base64 encoding
- **Future-proof** - easier to extend with additional metadata

### Configuration

```typescript
interface AGGridUrlSyncConfig {
  // Serialization mode
  serialization?: 'individual' | 'grouped' // default: 'individual'

  // Format for grouped serialization
  format?: 'querystring' | 'json' | 'base64' // default: 'querystring'

  // Parameter name for grouped mode
  groupedParam?: string // default: 'grid_filters'

  // ... other existing options
}
```

When the library reads a URL, it reads only the `groupedParam` name and decodes it with the configured `format`. It does not guess the format. This works in both modes, so a grouped link opens in an app in individual mode when the name and format match. If the param is present and not empty, the prefixed params are not read.

> **Note:** A URL written with a different `groupedParam` or `format` does not decode. If you change either option, links that were shared before the change stop working.

### Format Options

#### QueryString Format (Default)

Filters are URL-encoded as a query string within the parameter:

```typescript
const urlSync = createUrlSync(gridApi, {
  serialization: 'grouped',
  format: 'querystring' // default
})

// Result: ?grid_filters=f_name_contains%3Djohn%26f_age_gt%3D25
// Decoded: f_name_contains=john&f_age_gt=25
```

#### JSON Format

Filters are JSON-encoded, ideal for complex filter states:

```typescript
const urlSync = createUrlSync(gridApi, {
  serialization: 'grouped',
  format: 'json'
})

// Result: ?grid_filters=%7B%22name%22%3A%7B%22filterType%22%3A%22text%22...
// Decoded: {"name":{"filterType":"text","type":"contains","filter":"john"}...}
```

#### Base64 Format

Filters are JSON-encoded then base64-encoded for maximum compactness:

```typescript
const urlSync = createUrlSync(gridApi, {
  serialization: 'grouped',
  format: 'base64'
})

// Result: ?grid_filters=eyJuYW1lIjp7ImZpbHRlclR5cGUiOiJ0ZXh0Ii...
// Most compact representation, ideal for sharing
```

### Basic Usage

```typescript
import { createUrlSync } from 'ag-grid-url-sync'

// Basic grouped serialization
const urlSync = createUrlSync(gridApi, {
  serialization: 'grouped'
})

// Generate grouped URL
const url = urlSync.generateUrl('https://app.com/data')
// Result: https://app.com/data?grid_filters=f_name_contains%3Djohn%26f_age_gt%3D25

// Apply filters from grouped URL
urlSync.applyFromUrl(url)

// Get current serialization mode and format
console.log(urlSync.getSerializationMode()) // 'grouped'
console.log(urlSync.getCurrentFormat()) // 'querystring'
```

### Advanced Examples

#### Format Conversion Utility

```typescript
// Convert current filters to any format
const jsonFormat = urlSync.getFiltersAsFormat('json')
const base64Format = urlSync.getFiltersAsFormat('base64')
const querystringFormat = urlSync.getFiltersAsFormat('querystring')

console.log('JSON:', jsonFormat)
console.log('Base64:', base64Format)
console.log('QueryString:', querystringFormat)
```

#### Dynamic Format Switching

```typescript
// Start with individual mode
const urlSync = createUrlSync(gridApi, {
  serialization: 'individual'
})

// Switch to grouped mode when needed
const groupedSync = createUrlSync(gridApi, {
  serialization: 'grouped',
  format: 'base64',
  groupedParam: 'filters'
})

// Use utility to maintain filters across mode changes
const currentFilters = urlSync.getFiltersAsFormat('json')
```

### Granular Import: Grouped Serialization

You can import grouped serialization utilities and format serializers directly for advanced use cases or custom integrations:

```typescript
import {
  serializeGrouped,
  deserializeGrouped
} from 'ag-grid-url-sync/serialization'
import {
  QueryStringSerializer,
  JsonSerializer,
  Base64Serializer
} from 'ag-grid-url-sync/serialization/formats'
```

---

### Error Handling

The library never writes to the console. Each problem goes to one callback, and each error that the library makes has a `code` that you can switch on:

| Code                                                          | Meaning                                                        | Callback                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `INVALID_PARAM`                                               | A param name that is not valid, or an unknown operation        | `onParseError`                                                                                           |
| `INVALID_NUMBER`                                              | A value that is not a number, or that would be rounded         | `onParseError`                                                                                           |
| `INVALID_DATE`                                                | A date that does not exist, or a date range in the wrong order | `onParseError`                                                                                           |
| `VALUE_TOO_LONG`                                              | A text value over `maxValueLength`                             | `onParseError`                                                                                           |
| `INVALID_GROUPED`                                             | A grouped value that does not decode (bad JSON or base64)      | `onParseError`                                                                                           |
| `TYPE_MISMATCH`                                               | A number or date filter on a column of another type            | `onParseError`                                                                                           |
| `INVALID_URL`                                                 | A URL that the parser cannot read                              | Thrown by `parseUrlFilters` and `applyFromUrl`. The React hook catches it and sends it to `onParseError` |
| `GRID_ERROR`                                                  | The AG Grid API threw                                          | `onParseError` in the core, `onError` in the React hook                                                  |
| `NOT_READY`                                                   | A hook operation called before the grid is ready               | `onError` (React)                                                                                        |
| `VIEW_NOT_FOUND`, `VIEW_NAME_REQUIRED`                        | A saved view operation that cannot run                         | `onError` (React)                                                                                        |
| `STORAGE_UNAVAILABLE`, `STORAGE_FULL`, `STORAGE_WRITE_FAILED` | Browser storage for saved views failed                         | `onError` (React)                                                                                        |
| `HISTORY_WRITE_FAILED`                                        | `createGridUrlSync` could not write the address bar            | `onIssue`                                                                                                |

Each error has a `severity`: `'warning'` for the first seven rows, `'error'` for the others. `createGridUrlSync` sends every issue to `onIssue`; the callbacks in the table are for the deprecated API and the React hook.

The codes in the first seven rows are data issues: a filter that is dropped or is not valid. The library skips that filter and keeps the others. When the library knows the column, it is in `error.column`. `onParseError` is typed with `Error`, so check `instanceof URLSyncError` before you read `code` or `column`.

Every error is a `URLSyncError`. The classes from earlier versions (`InvalidFilterError`, `InvalidDateError`, `InvalidURLError`, `InvalidSerializationError`) are subclasses of it, so an `instanceof` check still works.

```typescript
import { createUrlSync, URLSyncError } from 'ag-grid-url-sync'

const urlSync = createUrlSync(gridApi, {
  onParseError: error => {
    if (error instanceof URLSyncError && error.code === 'VALUE_TOO_LONG') {
      showToast(`The link leaves out the filter on ${error.column}`)
    }
  }
})
```

In grouped mode, an error that comes from the grouped URL value is an `InvalidSerializationError`, and the original error is in `error.cause`. When the original error is an issue with one filter (for example a value over `maxValueLength`), the wrapper has the same `code` and `column`. So a check on `error.code` works the same in both modes. `INVALID_GROUPED` means that the grouped value itself does not decode.

In every grouped format (`querystring`, `json`, `base64`), a text value over `maxValueLength` (default 200) is dropped and reported through `onParseError`, both when the URL is generated and when it is parsed.

#### Dropped Filters in the Result

A caller does not need a callback to see dropped filters. `getUrlState()` and the apply methods return the issues of each call. They are the same objects that `onParseError` gets.

```typescript
const { url, hasFilters, issues } = urlSync.getUrlState()

if (issues.length > 0) {
  // The link leaves out these filters, so the recipient sees other rows
  showToast(`The link leaves out ${issues.length} filter(s)`)
}

const { issues: urlIssues } = urlSync.applyFromUrl()
```

In React, the hook returns `issues`: the issues of the latest URL apply (`applyUrlFilters`, `applyFilters`, auto-apply), followed by the issues of the latest URL write. The apply issues stay until the next apply, `clearFilters` or `loadView`. Operation failures (`onError`) are not in the list:

```tsx
const { shareUrl, issues } = useAGGridUrlSync(gridApi)

return issues.length > 0 ? (
  <Warning>The link leaves out a filter</Warning>
) : null
```

#### `throwOnError`

Like TanStack Query, the library can throw an issue instead of reporting it. Set `throwOnError: true` to throw every issue, or give a function that picks issues. In the core, a thrown issue does not go to `onParseError`, and the first one stops the call. In React, the hook keeps reporting each issue to `onParseError` one time, and then throws the picked issue during render, so an error boundary catches it. The default is `false`.

Only `createGridUrlSync` with `history` changes the address bar. Before an error boundary resets, remove the bad param from the URL (or the filter from the grid), or the same issue is thrown again.

```tsx
useAGGridUrlSync(gridApi, {
  // Throw only when a link would leave out a filter
  throwOnError: issue => issue.code === 'VALUE_TOO_LONG'
})
```

### Exports

The package supports granular subpath exports for advanced usage and optimal bundle size:

- `ag-grid-url-sync/serialization` – grouped serialization utilities
- `ag-grid-url-sync/serialization/formats` – format-specific serializers
- `ag-grid-url-sync/validation` – validation helpers
- `ag-grid-url-sync/url-parser` – URL parsing utilities
- `ag-grid-url-sync/url-generator` – URL generation utilities
- `ag-grid-url-sync/grid-integration` – AG Grid integration helpers
- `ag-grid-url-sync/view-storage` – localStorage-backed saved views
- `ag-grid-url-sync/types` – TypeScript types

Refer to the [package.json](./package.json) for the full export map.

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
  issues,
  parseUrlFilters,
  applyFilters,
  getFiltersAsFormat,
  getCurrentFormat
} = useAGGridUrlSync(gridApi, options)
```

#### Hook Options

```tsx
interface UseAGGridUrlSyncOptions {
  // Core options (same as createUrlSync)
  paramPrefix?: string // Default: 'f_'
  maxValueLength?: number // Default: 200
  onParseError?: (error: Error) => void
  throwOnError?: boolean | ((issue: URLSyncError) => boolean) // Default: false

  // React-specific options
  autoApplyOnMount?: boolean // Default: false
  enabledWhenReady?: boolean // Default: true
  onError?: (error: Error, context: string) => void // Operation failures (see Error Handling)

  // Saved views: setting a key enables the feature and namespaces its storage
  storageKey?: string // Default: undefined (saved views disabled)
}
```

#### Hook Return Values

| Property             | Type                                                      | Description                                                                 |
| -------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `shareUrl`           | `(baseUrl?: string) => string`                            | Generate shareable URL with current filters                                 |
| `getQueryParams`     | `() => string`                                            | Get filter state as query parameters                                        |
| `applyUrlFilters`    | `(url?: string) => void`                                  | Apply filters from URL to grid                                              |
| `clearFilters`       | `() => void`                                              | Clear all text filters                                                      |
| `isReady`            | `boolean`                                                 | Whether grid API is available and hook is ready                             |
| `currentUrl`         | `string`                                                  | Current URL with filters applied                                            |
| `hasFilters`         | `boolean`                                                 | Whether the grid has supported filters                                      |
| `issues`             | `readonly URLSyncError[]`                                 | Filters that the latest URL apply or URL write dropped (see Error Handling) |
| `parseUrlFilters`    | `(url: string) => FilterState`                            | Parse filters from URL without applying                                     |
| `applyFilters`       | `(filters: FilterState) => void`                          | Apply filter state object to grid                                           |
| `getFiltersAsFormat` | `(format: 'querystring' \| 'json' \| 'base64') => string` | Serialize filters to any supported format (for sharing/export)              |
| `getCurrentFormat`   | `() => 'individual' \| 'grouped'`                         | Get the current serialization mode (individual or grouped)                  |

Saved views (inert unless `storageKey` is set):

| Property       | Type                                 | Description                                                             |
| -------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `views`        | `GridView[]`                         | Saved views for this grid, in save order. Empty when views are disabled |
| `activeViewId` | `string \| null`                     | Id of the view currently applied to the grid, or `null` when none is    |
| `saveView`     | `(name: string) => GridView \| null` | Save current filters under a name; overwrites an existing name in place |
| `loadView`     | `(id: string \| null) => void`       | Apply a saved view, or pass `null` to reset to unfiltered               |
| `deleteView`   | `(id: string) => void`               | Delete a saved view                                                     |

> **Note:** `getFiltersAsFormat` and `getCurrentFormat` are especially useful for grouped serialization, format conversion, and advanced sharing scenarios.

### Saved Views

Pass a `storageKey` to let users name and revisit filter sets. The key both enables
the feature and namespaces its storage, so two grids on the same origin must use
different keys:

```tsx
const { views, activeViewId, saveView, loadView, deleteView } =
  useAGGridUrlSync(gridApi, { storageKey: 'employee-grid' })

// One handler each, as a user drives them: save whatever is currently filtered,
// then apply or remove a view by id in a later interaction.
const handleSave = () => saveView('Engineering, high salary')
const handleLoad = (id: string) => loadView(id)
const handleDelete = (id: string) => deleteView(id)
const handleReset = () => loadView(null) // back to an unfiltered grid
```

Render the list from `views` and drive the buttons from it. `views[i].id` is only
stale immediately after a mutation, not during render. If you do need the new
view's id in the same handler that saved it, use `saveView`'s return value rather
than reading it back out of `views`: that array is React state, so it does not
update until the next render.

Only the filter model is stored, using AG Grid's native format so set filters and
combined conditions survive a round trip. Column order, row selection and expanded
groups are not stored.

Behaviour worth knowing:

- **Names are unique.** Saving over an existing name updates that view in place,
  keeping its id and list position, so "load, adjust, save under the same name" is
  how you update one. Names are trimmed and must not be empty.
- **`activeViewId` describes the live grid**, not what is persisted. A stored view
  is only applied on mount when `autoApplyOnMount` is set, so with it off this
  stays `null` until you call `loadView` or `saveView`.
- **Filtering away from a view unloads it.** `activeViewId` returns to `null` as
  soon as the grid stops showing that view, including through routes that never
  mention views: `clearFilters`, `applyFilters`, `applyUrlFilters`, or the user
  editing a filter in the grid's own UI. The stored pointer is cleared with it,
  so `autoApplyOnMount` will not bring the view back on the next load. The grid
  is compared against what it reported once the view was applied, so a view AG
  Grid normalises (one naming a column the grid no longer has, say) stays loaded
  and keeps its stored pointer. A write AG Grid defers, such as a restore made
  before column data types are inferred, is recognised when it lands by the
  event's `source: 'api'`; on AG Grid versions that do not report a source, a
  deferred view the grid also normalises unloads when it lands. An API change
  that filters a column the view does not, such as your own `setFilterModel`
  over a view the grid ignored, is not taken for the view and unloads it. One
  that filters only the view's columns cannot be told from the view landing.
  Render the
  active state from `activeViewId` and it follows the grid on its own. Replacing
  `gridApi` also clears `activeViewId`, but keeps the stored pointer, so with
  `autoApplyOnMount` the view is restored against the new grid.
- **URL filters win on mount.** With `autoApplyOnMount` set, an incoming URL that
  carries filters takes precedence over the stored view, so a shared link shows the
  sender's filters rather than the recipient's saved default. It wins once per
  grid: switching `storageKey` later restores the new namespace's stored view
  instead of applying the link again.
- **Deleting is conservative.** `deleteView` clears the grid only if it still shows
  exactly that view's filters, so hand-edited filters survive.
- **Failures are reported, not silent.** A save that cannot be persisted (quota
  exhausted, storage blocked by policy) returns `null` and reports through
  `onError` with context `'save-view'`. Reads degrade to an empty list instead of
  throwing, so server rendering is safe.

For non-React consumers the same store is available directly:

```ts
import { createViewStore } from 'ag-grid-url-sync/view-storage'

const store = createViewStore('employee-grid')
store.saveView('Engineering', gridApi.getFilterModel())
```

### React Features

- **🔄 Automatic State Management**: Tracks grid state and filter changes automatically
- **⚡ Ready State**: `isReady` indicates when the grid API is available
- **🎯 Auto-Apply**: `autoApplyOnMount` applies URL filters when component mounts.
  It is attempted once per grid: a failure is reported one time (a bad filter
  through `onParseError`, any other failure through `onError`) and is not
  retried on later renders
- **🧹 Cleanup**: Automatically cleans up resources when component unmounts
- **🛡️ Error Boundaries**: Graceful error handling with configurable callbacks
- **📊 Filter Status**: `hasFilters` tracks whether any filters are active
- **💾 Saved Views**: `storageKey` enables naming and revisiting filter sets

### React with Grouped Serialization

The React hook fully supports grouped serialization with all format options:

```tsx
import React, { useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { useAGGridUrlSync } from 'ag-grid-url-sync/react'

function AdvancedGridComponent() {
  const [gridApi, setGridApi] = useState(null)

  // Grouped serialization with base64 format
  const { shareUrl, applyUrlFilters, clearFilters, hasFilters, isReady } =
    useAGGridUrlSync(gridApi, {
      serialization: 'grouped',
      format: 'base64',
      groupedParam: 'grid_state',
      autoApplyOnMount: true
    })

  const handleShareCompact = async () => {
    // Base64 format creates very compact URLs
    const url = shareUrl()
    await navigator.clipboard.writeText(url)
    alert('Compact filter URL copied!')
  }

  const handleShareJSON = async () => {
    // Get filters in JSON format for debugging
    const jsonFilters = urlSync?.getFiltersAsFormat?.('json')
    console.log('Current filters as JSON:', jsonFilters)
  }

  return (
    <div>
      <div style={{ marginBottom: '10px' }}>
        <button onClick={handleShareCompact} disabled={!isReady}>
          📋 Share Compact URL
        </button>
        <button onClick={handleShareJSON} disabled={!isReady}>
          🔍 Debug Filters
        </button>
        <button onClick={clearFilters} disabled={!hasFilters}>
          🗑️ Clear Filters
        </button>
      </div>

      {/* Grid component */}
      <div className="ag-theme-alpine" style={{ height: 400, width: '100%' }}>
        <AgGridReact
          onGridReady={params => setGridApi(params.api)}
          // ... grid configuration
        />
      </div>
    </div>
  )
}
```

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

- Prefix: `f_` (configurable)
- Format: `f_{columnName}_{operation}={value}`
- **Text Operations**: `contains`, `eq`, `neq`, `startsWith`, `endsWith`, `notContains`, `blank`, `notBlank`
- **Number Operations**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `range`, `blank`, `notBlank`
- **Date Operations**: `eq`, `neq`, `before`, `beforeEq`, `after`, `afterEq`, `daterange`, `blank`, `notBlank`
- **Range Format**: `f_column_range=min,max` (comma-separated values)
- Standard URL encoding for special characters
- Supports column names with underscores (e.g., `user_id`, `salary_base`, `created_date`)

## API Reference

### `createGridUrlSync(options)`

See [Vanilla JS: `createGridUrlSync`](#vanilla-js-creategridurlsync) for the options. It returns `{ getSnapshot, subscribe, applyUrl, getUrl, destroy }`.

### `createUrlSync(gridApi, config?)` (deprecated)

Factory function to create a new AGGridUrlSync instance. Deprecated: use `createGridUrlSync`. It will be removed in 0.6.0.

```typescript
import { createUrlSync } from 'ag-grid-url-sync'

const urlSync = createUrlSync(gridApi, {
  paramPrefix: 'f_', // Default: 'f_'
  maxValueLength: 200, // Default: 200
  onParseError: err => console.warn(err)
})
```

### `AGGridUrlSync` Class (deprecated)

Deprecated: use `createGridUrlSync`. It will be removed in 0.6.0.

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

##### `getUrlState(baseUrl?: string): { url: string; hasFilters: boolean; issues: readonly URLSyncError[] }`

Generates the same URL as `generateUrl`, and tells if the grid has filters that the library supports. It reads the grid one time for both values. `hasFilters` comes from the filter state, not from the URL, because the URL also keeps the page's own params.

```typescript
const { url, hasFilters } = urlSync.getUrlState('https://app.com/page?tab=1')
// url: https://app.com/page?tab=1 (no filters), hasFilters: false
```

`issues` holds the filters that this call dropped, for example a text value over `maxValueLength`.

##### `getQueryParams(): string`

Gets the current filter state as URL query parameters.

```typescript
const params = urlSync.getQueryParams()
// ?f_name_contains=john
```

##### `applyFromUrl(url?: string): { issues: readonly URLSyncError[] }`

Applies filters from a URL to the grid, and returns the filters in the URL that were dropped.

```typescript
urlSync.applyFromUrl('https://app.com/page?f_name_contains=john')
```

##### `applyFilters(filterState: FilterState): { issues: readonly URLSyncError[] }`

Applies a filter state object to the grid, and returns the filters that were dropped (for example a number filter on a text column).

```typescript
urlSync.applyFilters({
  name: {
    filterType: 'text',
    type: 'contains',
    filter: 'john'
  }
})
```

##### `clearFilters(): { issues: readonly URLSyncError[] }`

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
  // Serialization mode (default: 'individual')
  // 'individual': Each filter becomes a separate URL parameter
  // 'grouped': All filters are packaged into a single URL parameter
  serialization?: 'individual' | 'grouped'

  // Format for grouped serialization (default: 'querystring')
  // 'querystring': URL-encoded querystring format (most compatible)
  // 'json': JSON-encoded format (good for complex filters)
  // 'base64': Base64-encoded JSON (most compact)
  format?: 'querystring' | 'json' | 'base64'

  // Parameter name for grouped mode (default: 'grid_filters')
  groupedParam?: string

  // Prefix for URL parameters in individual mode (default: 'f_')
  // A prefix without a trailing '_' gets one ('filter' -> 'filter_name_contains').
  // An empty prefix means the default. Grouped mode always uses 'f_' inside the
  // grouped value, so grouped URLs do not change with this option.
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
- **Grouped serialization** - Package all filters into a single URL parameter with querystring, JSON, or base64 encoding
- **Manual URL generation** - Generate shareable URLs with current filter states
- **Bidirectional sync** - Automatic synchronization between AG Grid and URL
- **Framework agnostic** - Works with any AG Grid setup, no dependencies
- **High performance** - Efficiently handles 100+ filters with <20ms latency
- **Robust error handling** - Graceful handling of malformed URLs and special characters
- **Lightweight** - Minimal bundle size (~3KB gzipped), ideal for modern web applications

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

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

[![banner](https://raw.githubusercontent.com/nearform/.github/refs/heads/master/assets/os-banner-green.svg)](https://www.nearform.com/contact/?utm_source=open-source&utm_medium=banner&utm_campaign=os-project-pages)

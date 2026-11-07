![CI](https://github.com/nearform/ag-grid-url-sync/actions/workflows/ci.yml/badge.svg?event=push)

# AG Grid URL Sync

A TypeScript library that syncs AG Grid filters (text, number and date) with the URL. It gives shareable links, browser history and saved views, with clean, human-readable URLs. It has a framework-free core and a React hook.

> **Upgrade from 0.5?** Version 0.6.0 is a breaking release. Read [Migrating from 0.5 to 0.6](#migrating-from-05-to-06).

## Features

- 🔍 **Complete text filter support** - All 8 AG Grid text operations (contains, equals, not contains, not equal, starts with, ends with, blank, not blank)
- 🔢 **Complete number filter support** - All 9 AG Grid number operations (equals, not equal, greater than, greater than or equal, less than, less than or equal, in range, blank, not blank)
- 📅 **Complete date filter support** - All 9 AG Grid date operations (equals, not equal, before, before or equal, after, after or equal, in range, blank, not blank) with strict ISO date validation (YYYY-MM-DD)
- 🔄 **Full sync in one call** - `createGridUrlSync` applies the URL, follows the grid's filter changes, and can write the address bar (replace, push or your router)
- 📦 **Grouped serialization** - Put all filters in one URL parameter with querystring, JSON or base64 encoding. JSON and base64 hold any AG Grid filter model
- 💾 **Saved views** - Let users name and load filter sets, kept in `localStorage` or in your own store
- ⚛️ **React hook** - `useGridUrlSync`, with `StrictMode` and server rendering support
- 🔗 URL functions with no grid: `parseUrlFilters` and `generateUrl`
- 🚦 One issue callback, `onIssue`, with a `code` and a `severity` on each issue. The library never writes to the console
- 📝 Full TypeScript support with strict mode compliance
- 🧹 Clean, human-readable URL format, with a prefix that you can set
- ⚡ High performance - handles 100+ filters efficiently (<20ms)
- 🛡️ Robust edge case handling (special characters, malformed URLs)
- 🌲 ESM only, tree-shakable, with three entry points

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
| **Date**    | In Range        | `f_column_daterange=start,end` | `f_period_daterange=2024-01-01,2024-12-31` | Date is between start and end (see below) |
| **Date**    | Blank           | `f_column_blank=true`          | `f_deadline_blank=true`                    | Date field is empty/null                  |
| **Date**    | Not Blank       | `f_column_notBlank=true`       | `f_created_notBlank=true`                  | Date field has any value                  |

Two date operations depend on the settings of the AG Grid column:

- **`daterange`:** AG Grid's `inRange` leaves out the start and end dates. To keep them, set `filterParams: { inRangeInclusive: true }` on the column.
- **`beforeEq` and `afterEq`:** they need the AG Grid filter options `lessThanOrEqual` and `greaterThanOrEqual`. AG Grid's default date filter does not have these options, so it uses `equals` in their place. The grid then shows other rows, and the sync reports no issue. Add the options to the column:

```ts
filterParams: {
  filterOptions: [
    'equals',
    'notEqual',
    'lessThan',
    'lessThanOrEqual',
    'greaterThan',
    'greaterThanOrEqual',
    'inRange',
    'blank',
    'notBlank'
  ]
}
```

> **🗓️ Date Format Note**: Date filters require strict ISO format (`YYYY-MM-DD`). All date values are validated for real calendar dates, including leap years and month boundaries. Invalid or non-ISO dates will be rejected.

### Filter Types of `eq`, `neq`, `blank` and `notBlank`

Most operations have one filter type, so the URL gives it: `contains` is text, `gt` is a number, `before` is a date. Four operations work on every type: `eq`, `neq`, `blank` and `notBlank`. The URL does not say their type, so the library takes it from the grid's column (0.6.0, #224):

- A **text** column keeps the value as text: `f_zip_eq=01234` stays `"01234"`, with its leading zero.
- A **number** column reads the value as a number. A value that is not a number is an `INVALID_NUMBER` issue.
- A **date** column reads the value as a `YYYY-MM-DD` date. A date that is not valid is an `INVALID_DATE` issue.

The column type comes from the column definition that AG Grid resolved:

1. A built-in filter name: `agTextColumnFilter`, `agNumberColumnFilter` or `agDateColumnFilter`.
2. Else the `cellDataType`, set by you or inferred by AG Grid 31+ from the data: `number` is a number; `date`, `dateString`, `dateTime` and `dateTimeString` are dates; a custom data type uses its `baseDataType`; all others are text.
3. Else text.

AG Grid infers the data types from the first row. Before the first row data arrives, the types are not known, and AG Grid holds a filter model until then. So `createGridUrlSync` waits too: a URL with a filter on such a column is applied at the first `rowDataUpdated` with rows. Then the value of `eq`, `neq`, `blank` and `notBlank` gets the column's type, and a filter of the wrong type for the column is a `TYPE_MISMATCH` issue. The React hook keeps the wait across a new sync on the same grid (StrictMode, an option change).

- A newer apply, a filter write, a user filter change or `destroy` cancels the wait.
- An `applyUrl` that waits returns no issues and does not throw. The issues of the URL go to `onIssue` and the snapshot when it is applied.
- The wait is only for the client-side row model.

With no grid (`parseUrlFilters`), the value of these four operations stays text. Give `columnTypes` to read it as a number or a date:

```typescript
parseUrlFilters('?f_age_eq=30', {
  columnTypes: column => (column === 'age' ? 'number' : undefined)
})
// { age: { filterType: 'number', type: 'equals', filter: 30 } }
```

> **Breaking change in 0.6.0:** before 0.6.0, the library guessed the type from the value. See [part 6 of the migration guide](#6-the-filter-type-comes-from-the-column-224).

### Filter Models

The library uses AG Grid's own `FilterModel` (the value of `gridApi.getFilterModel()`), in the sync, the React hook, saved views and the URL functions. The URL formats hold different parts of it:

| Format                                                         | Holds                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `individual()` (the default)                                   | Text, number and date filters with one condition                                       |
| `grouped({ format: 'querystring' })`                           | The same as `individual()`, in one param                                               |
| `grouped({ format: 'json' })`, `grouped({ format: 'base64' })` | Any filter model: set, multi and custom filters, and combined conditions (`AND`, `OR`) |

- **A URL apply changes only the columns that the format holds.** With `individual()`, a set filter or combined conditions on the grid stay when the user opens a link. A URL filter on the same column replaces it.
- **A filter that the format cannot hold is an issue.** When the grid has one, the sync reports `UNSUPPORTED_FILTER` (a warning) one time, and leaves it out of the URL. This includes AG Grid's custom `filterOptions`. Use `grouped({ format: 'json' })` to keep it in the URL. The issue stays in `issues` while the grid has the filter, so with `throwOnError: true` the React hook throws again after each reset of the error boundary. To not throw for it, give `throwOnError: issue => issue.code !== 'UNSUPPORTED_FILTER'`.
- `applyFilters(model)` replaces the full model, as `gridApi.setFilterModel(model)` does.
- A custom filter's model can be any JSON value (an object, an array, a string, a number). `json` and `base64` hold each one. `individual()` reports one that is not an object as `UNSUPPORTED_FILTER`, and a URL apply keeps it on the grid. AG Grid ignores a value that a built-in filter cannot read.
- The JSON and base64 values have the keys in sorted order, so the same filters give the same URL.
- Links from 0.5 in the `json` and `base64` formats still open: the old form of a filter (for example `type: 'eq'`) is read as AG Grid's form.

> **Breaking change in 0.6.0:** before 0.6.0, the library had its own filter model. See [part 5 of the migration guide](#5-filterstate-becomes-ag-grids-filtermodel-225).

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

It needs `ag-grid-community` 31 or later. For AG Grid 28 to 30, use version 0.5.

The package is ESM only:

- Bundlers and `import` load it.
- `require('ag-grid-url-sync')` needs Node 20.19+ (or 22.12+), which can `require()` an ES module. A CommonJS test runner needs one of these Node versions, or its ESM support.
- TypeScript with `moduleResolution: node10` (the old `node`) cannot find the types of `ag-grid-url-sync/react` and `ag-grid-url-sync/views`. Use `bundler`, `node16` or `nodenext`.

## Usage

### Importing the Library

The library has three entry points:

```typescript
// The core: works with any framework
import { createGridUrlSync, individual, grouped } from 'ag-grid-url-sync'

// The React hook
import { useGridUrlSync } from 'ag-grid-url-sync/react'

// The saved-view store
import { createViewStore } from 'ag-grid-url-sync/views'

// TypeScript types
import type { GridUrlSyncOptions, IssueEvent } from 'ag-grid-url-sync'
import type { FilterModel } from 'ag-grid-community'
```

`createViewStore` is in its own entry point, so an app with no saved views does not get the storage code. See [Exports](#exports) for the names of each entry point.

### Vanilla JS: `createGridUrlSync`

One call gives full sync. `createGridUrlSync` applies the address bar's filters to the grid, follows the grid's filter changes, can write them to the address bar, and removes its listeners when the grid is destroyed.

```typescript
import { createGridUrlSync, individual, grouped } from 'ag-grid-url-sync'

const sync = createGridUrlSync({
  api: gridApi,
  codec: individual({ prefix: 'f_' }), // or grouped({ param: 'gf', format: 'json' })
  history: 'replace', // 'none' (default) | 'replace' | 'push' | (url, { replace }) => ...
  onIssue: ({ issue, source }) => {
    if (issue.severity === 'warning') showToast(issue.message)
  }
})

// The current state: { status, url, hasFilters, issues, views, activeViewId }
const { url, hasFilters } = sync.getSnapshot()

// Called after each change of the snapshot. Returns an unsubscribe function.
const unsubscribe = sync.subscribe(() => render(sync.getSnapshot()))

sync.applyUrl('https://app.com/data?f_name_contains=jo') // { issues }
sync.getUrl('https://app.com/share') // a share link for the grid's filters
sync.applyFilters({
  name: { filterType: 'text', type: 'contains', filter: 'jo' }
}) // { issues }
sync.applyFilters({}) // clear the filters
sync.destroy()
```

`applyFilters` writes an AG Grid filter model to the grid as the app's own write. It replaces the full model, as `setFilterModel` does. When it lands, the sync writes the URL in the `history` mode, as it does for a user edit. `applyUrl` writes no history, because the URL already holds those filters.

A URL write keeps the text and the order of the page's other params, and puts the filter params after them. With no filters, the URL has no filter param.

Two grids on one page must use different URL params. A URL write removes every param with the codec's prefix and the codec's grouped param. `grouped()` has no prefix, so it always removes the `f_` params too. Give each grid its own prefix, for example `individual({ prefix: 'a' })` and `individual({ prefix: 'b' })`.

| Option             | Default                   | Meaning                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api`              | (required)                | The AG Grid API                                                                                                                                                                                                                                                                                       |
| `codec`            | `individual()`            | How the filters are written in the URL. `individual({ prefix })` writes one param for each filter; `grouped({ param, format })` writes all filters in one param                                                                                                                                       |
| `maxValueLength`   | `200`                     | The longest text value that is kept                                                                                                                                                                                                                                                                   |
| `history`          | `'none'`                  | How a filter change goes to the address bar. `'replace'` and `'push'` use `window.history`; a function gets the absolute URL and `{ replace }`, for a router. The page's other params, the `#hash` and `history.state` stay                                                                           |
| `popstate`         | `true` only with `'push'` | Apply the URL when the back or forward button changes it                                                                                                                                                                                                                                              |
| `applyUrlOnCreate` | `true`                    | Apply the address bar's filters on create. A URL with no filter params keeps the grid's filters (for example from `initialState`), and with `history` they are written to the URL with replace. AG Grid 31 applies `initialState` filters when the first rows come: the sync writes them at that time |
| `views`            | none                      | The saved views. Give `createViewStore(key)` from `ag-grid-url-sync/views`. See [Saved Views](#saved-views)                                                                                                                                                                                           |
| `throwOnError`     | `false`                   | Throw an issue instead of reporting it, in the methods that the app calls (`applyUrl`, `getUrl`, `applyFilters`, `saveView`, `loadView`, `deleteView`). `createGridUrlSync` and its listeners never throw, and an `applyUrl` that waits for the row data does not throw either                        |
| `onIssue`          | none                      | Gets each issue one time, as `{ issue, source }`. `source` is `'url'` (the sync read the address bar), `'grid'` (it read the grid) or `'api'` (a method that the app called)                                                                                                                          |

The snapshot `status` is `'active'` from create, and `'destroyed'` after `destroy()` or after the grid is destroyed. A grid that cannot take the sync's listeners also gives `'destroyed'`: `createGridUrlSync` does not throw, and sends a `GRID_ERROR` to `onIssue`. After that, `applyUrl`, `applyFilters`, `saveView` and `loadView` report `NOT_READY` to `onIssue`. `deleteView` needs only storage, so it still works. `IDLE_SNAPSHOT` (`status: 'idle'`) is the snapshot for a time when there is no sync yet. `getSnapshot()` returns the same object until something changes, so it works with React's `useSyncExternalStore`. The sync writes no history for an `applyUrl` apply, because the URL holds those filters already. `applyFilters` and `loadView` write the URL as a user edit does. Nothing reads `window` when the module loads, and a sync made with no `window` does nothing to the address bar.

An issue has the source of the work that found it. A method that the app calls gives `'api'` to each issue of its work: also the grid read after its write, a later landing of that write, and the write of the stored view pointer. A back-button apply and the restore on create give `'url'`. A filter change in the grid, and the read of the grid's own filters on create, give `'grid'`.

#### History with a router

A `history` function gets two arguments: the absolute URL (`https://host/path?...`) and `{ replace }`. `replace` tells the function what to do with the history entry:

- `true`: replace the entry. This is for a write that must not add a back-button step: the create-time write of the grid's own filters, and the restore of a stored view (on create, or for a new `storageKey`).
- `false`: add an entry. This is for a user edit, `applyFilters` and `loadView`.

For a router that can push, use the two arguments. Then the history is the same as with `'push'`:

```typescript
createGridUrlSync({
  api: gridApi,
  history: (url, { replace }) =>
    replace ? router.replace(url) : router.push(url)
})
```

A function with one argument also works. It does not use `replace`, so it does the same for each write. `url => router.replace(url)` is correct. Do not use `url => router.push(url)`: it adds a back-button step on page load.

The Next.js router takes the absolute URL. React Router's `navigate` takes a path: it reads an absolute URL as a relative path, so the route does not match. Give it the path, the search and the hash:

```typescript
createGridUrlSync({
  api: gridApi,
  history: (url, { replace }) => {
    const { pathname, search, hash } = new URL(url)
    navigate(pathname + search + hash, { replace })
  }
})
```

The sync reads the address bar only on create and on `popstate`. A router navigation that keeps the page mounted (for example a Next.js `<Link>` to the same page with other params) does not fire `popstate`, so the sync does not apply its filters. The next user edit then writes the grid's filters over them. Call `applyUrl()` when the search params change. With a `history` function, `popstate` is `false` by default, so set `popstate: true` to apply the URL on back and forward:

```tsx
const query = useSearchParams().toString()
const { status, applyUrl } = useGridUrlSync({
  api,
  history: url => router.replace(url),
  popstate: true
})

useEffect(() => {
  if (status === 'active') applyUrl()
}, [query, status, applyUrl])
```

`'replace'` and `'push'` keep `history.state`, but they remove the Next.js keys `__NA` and `_N` from it. Next.js skips its router update for a write with these keys. With them removed, the Next.js router (`useSearchParams`) gets the new URL. A state that is not a plain object stays as it is.

### URL Functions With No Grid

`parseUrlFilters` and `generateUrl` read and write the URL with no grid, for example on a server or for `initialState`. They take the same option names as `createGridUrlSync` (see [`UrlOptions`](#urloptions)).

```typescript
import { parseUrlFilters, generateUrl, individual } from 'ag-grid-url-sync'
import type { FilterModel } from 'ag-grid-community'

const codec = individual({ prefix: 'f_' })

// AG Grid's filter model, for example for `initialState.filter.filterModel`
function getFiltersFromUrl(url: string): FilterModel {
  return parseUrlFilters(url, {
    codec,
    onIssue: ({ issue }) => console.warn(issue.code, issue.column)
  })
}

// A share link. The page's own params stay.
function createShareableUrl(model: FilterModel, baseUrl: string): string {
  return generateUrl(baseUrl, model, { codec, maxValueLength: 500 })
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

`InvalidURLError` is thrown for rule 1, and for any input that the `URL` constructor rejects under rules 2 and 3 (for example `http://` or `//[`). A param that is not valid is skipped and sent to `onIssue`.

`generateUrl` needs an absolute `baseUrl`. It keeps the page's own params with their text and order (`?debug` stays `?debug`, `%20` stays `%20`), puts the filter params after them, and replaces the filter params of both codecs: each param that starts with the codec's prefix, and the codec's grouped param. So a URL never holds filters of both kinds.

Rules for both functions:

- Give the same `codec` that wrote the URL.
- `onIssue` gets each issue one time, with `source: 'api'`.
- An `onIssue` that throws stops the call, and the error goes to the caller. (The sync of `createGridUrlSync` catches such an error, so it cannot stop the sync.)
- A codec that did not come from `individual()` or `grouped()` throws a `TypeError`.

## Grouped Serialization

Grouped serialization puts all filters in one URL parameter, in place of one parameter for each filter. It is useful for apps with many filters, or when you need more compact URLs.

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
- **Full filter models** - the JSON and base64 formats hold set, multi and custom filters, and combined conditions

### Configuration

Give the `grouped()` codec to `createGridUrlSync`, `useGridUrlSync`, `parseUrlFilters` or `generateUrl`:

```typescript
import { createGridUrlSync, grouped } from 'ag-grid-url-sync'

const sync = createGridUrlSync({
  api: gridApi,
  codec: grouped({
    param: 'grid_filters', // the param name (default: 'grid_filters')
    format: 'querystring' // 'querystring' (default) | 'json' | 'base64'
  })
})
```

When the library reads a URL, it reads the codec's grouped param first, and decodes it with the codec's format. It does not guess the format. If that param is present and not empty, the library does not read the prefixed params. Else it reads the prefixed params. `individual()` reads the grouped param `grid_filters` in the `querystring` format, and `grouped()` reads the prefix `f_`. So an app that changes from `individual()` to `grouped()`, both with their defaults, still opens its old links.

With no filters, the URL has no grouped param, in each format. A link with an empty value, such as `?grid_filters=%7B%7D` (json) or `?grid_filters=e30%3D` (base64), still opens with no filters and no issue.

> **Note:** A URL written with a different `param` or `format` does not decode. If you change either setting, links that were shared before the change stop working.

### Format Options

#### QueryString Format (Default)

Filters are URL-encoded as a query string within the parameter:

```typescript
const sync = createGridUrlSync({
  api: gridApi,
  codec: grouped({ format: 'querystring' }) // the default format
})

// Result: ?grid_filters=f_name_contains%3Djohn%26f_age_gt%3D25
// Decoded: f_name_contains=john&f_age_gt=25
```

The querystring value always uses the prefix `f_` inside it.

#### JSON Format

Filters are JSON-encoded. Use it for complex filter models:

```typescript
const sync = createGridUrlSync({
  api: gridApi,
  codec: grouped({ format: 'json' })
})

// Result: ?grid_filters=%7B%22name%22%3A%7B%22filter%22%3A%22john%22...
// Decoded: AG Grid's filter model, with sorted keys (#225)
// {"name":{"filter":"john","filterType":"text","type":"contains"}...}
```

#### Base64 Format

Filters are JSON-encoded, then base64-encoded:

```typescript
const sync = createGridUrlSync({
  api: gridApi,
  codec: grouped({ format: 'base64' })
})

// Result: ?grid_filters=eyJuYW1lIjp7ImZpbHRlclR5cGUiOiJ0ZXh0Ii...
```

### Basic Usage

```typescript
import { createGridUrlSync, grouped } from 'ag-grid-url-sync'

const sync = createGridUrlSync({ api: gridApi, codec: grouped() })

// Generate a grouped URL
const url = sync.getUrl('https://app.com/data')
// Result: https://app.com/data?grid_filters=f_name_contains%3Djohn%26f_age_gt%3D25

// Apply the filters of a grouped URL
sync.applyUrl(url)
```

### Advanced Examples

#### Compare the Formats

`generateUrl` writes a filter model with any codec, so you can compare the formats with no second sync:

```typescript
import { generateUrl, grouped } from 'ag-grid-url-sync'

const model = gridApi.getFilterModel()

for (const format of ['querystring', 'json', 'base64'] as const) {
  const url = generateUrl('https://app.com/data', model, {
    codec: grouped({ format })
  })

  console.log(format, url.length)
}
```

#### Change the Codec

A sync has one codec. To change it, destroy the sync and make a new one. The grid keeps its filters.

```typescript
sync.destroy()

const groupedSync = createGridUrlSync({
  api: gridApi,
  codec: grouped({ param: 'filters', format: 'base64' }),
  applyUrlOnCreate: false // keep the grid's filters, do not read the old URL
})
```

In React, give a new `codec` to `useGridUrlSync`. The hook makes a new sync on the same grid, and does not apply the URL again.

---

### Error Handling

The library never writes to the console. Each issue goes to `onIssue` one time, as `{ issue, source }`. `issue` is a `URLSyncError` with a `code`, a `severity` and, when it is known, a `column`:

| Code                                                          | Severity  | Meaning                                                                                         |
| ------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `INVALID_PARAM`                                               | `warning` | A param name that is not valid, or an unknown operation                                         |
| `INVALID_NUMBER`                                              | `warning` | A value that is not a number, or that would be rounded                                          |
| `INVALID_DATE`                                                | `warning` | A date that does not exist, or a date range in the wrong order                                  |
| `VALUE_TOO_LONG`                                              | `warning` | A text value over `maxValueLength`                                                              |
| `INVALID_GROUPED`                                             | `warning` | A grouped value that does not decode (bad JSON or base64)                                       |
| `TYPE_MISMATCH`                                               | `warning` | A number or date filter on a column of another type                                             |
| `INVALID_URL`                                                 | `warning` | A URL that the parser cannot read. The sync and the hook report it. `parseUrlFilters` throws it |
| `UNSUPPORTED_FILTER`                                          | `warning` | A filter that the URL format cannot hold (set, multi, custom, combined conditions)              |
| `GRID_ERROR`                                                  | `error`   | The AG Grid API threw                                                                           |
| `NOT_READY`                                                   | `error`   | A method called before the grid is ready, or after the sync is destroyed                        |
| `VIEW_NOT_FOUND`, `VIEW_NAME_REQUIRED`                        | `error`   | A saved view operation that cannot run                                                          |
| `STORAGE_UNAVAILABLE`, `STORAGE_FULL`, `STORAGE_WRITE_FAILED` | `error`   | Browser storage for saved views failed                                                          |
| `HISTORY_WRITE_FAILED`                                        | `error`   | The sync could not write the address bar                                                        |
| `UNKNOWN`                                                     | `error`   | An error with no other code                                                                     |

The codes with the severity `'warning'` are data issues: a filter that is dropped or is not valid. The library skips that filter and keeps the others. The codes with the severity `'error'` are operations that failed.

`source` tells where the work started: `'url'` (the sync read the address bar, on create or on `popstate`), `'grid'` (the sync read the grid after a filter change) or `'api'` (a method that the app called, or a pure URL function).

Every error is a `URLSyncError`. The classes `InvalidFilterError`, `InvalidDateError`, `InvalidURLError` and `InvalidSerializationError` are subclasses of it, so an `instanceof` check works.

```typescript
import { createGridUrlSync } from 'ag-grid-url-sync'

const sync = createGridUrlSync({
  api: gridApi,
  onIssue: ({ issue }) => {
    if (issue.code === 'VALUE_TOO_LONG') {
      showToast(`The link leaves out the filter on ${issue.column}`)
    }
  }
})
```

In grouped mode, an error that comes from the grouped URL value is an `InvalidSerializationError`, and the original error is in `error.cause`. When the original error is an issue with one filter (for example a value over `maxValueLength`), the wrapper has the same `code` and `column`. So a check on `issue.code` works the same in both modes. `INVALID_GROUPED` means that the grouped value itself does not decode.

In every grouped format (`querystring`, `json`, `base64`), a text value over `maxValueLength` (default 200) is dropped and reported through `onIssue`, both when the URL is generated and when it is parsed. In `json` and `base64`, the limit is also for each set filter value and each string of a custom filter's model, and the column with the long value is dropped.

An `onIssue` that throws does not stop the sync of `createGridUrlSync` (also the sync inside `useGridUrlSync`): the sync reports the error with `globalThis.reportError` (or a timer that throws it), as the browser does for an event listener. When `useGridUrlSync` has no sync (no grid yet, `enabled: false`, a server render), its methods call `onIssue` directly, so an error that `onIssue` throws goes to the caller of the method. In `parseUrlFilters` and `generateUrl`, an `onIssue` that throws stops the call, and the error goes to the caller.

#### Dropped Filters in the Result

A caller does not need a callback to see dropped filters. The snapshot has the issues of the latest apply and of the latest grid read, and each apply method returns the issues of its call. They are the same objects that `onIssue` gets.

```typescript
const { issues } = sync.getSnapshot()

if (issues.length > 0) {
  // The link leaves out these filters, so the recipient sees other rows
  showToast(`The link leaves out ${issues.length} filter(s)`)
}

const { issues: urlIssues } = sync.applyUrl()
```

In React, the hook returns the same `issues`:

```tsx
const { issues } = useGridUrlSync({ api })

return issues.length > 0 ? (
  <Warning>The link leaves out a filter</Warning>
) : null
```

#### `throwOnError`

Like TanStack Query, the library can throw an issue instead of reporting it. Set `throwOnError: true` to throw every issue, or give a function that picks issues. The default is `false`.

- In `createGridUrlSync`, the methods that the app calls throw the picked issue. The sync's own work (create, the listeners) never throws.
- In `parseUrlFilters` and `generateUrl`, a thrown issue does not go to `onIssue`, and the first one stops the call.
- In React, the hook reports each issue to `onIssue` one time, and then throws a picked issue of `issues` during render, so an error boundary catches it. A failure, such as `GRID_ERROR`, is not in `issues`, so it goes to `onIssue` only (#284). The one failure in `issues` is a failed address-bar write (`HISTORY_WRITE_FAILED`), so the hook can throw it. The hook's methods do not throw.

Only `createGridUrlSync` or the hook with `history` changes the address bar. Before an error boundary resets, remove the bad param from the URL (or the filter from the grid), or the same issue is thrown again.

```tsx
useGridUrlSync({
  api,
  // Throw only when a link would leave out a filter
  throwOnError: issue => issue.code === 'VALUE_TOO_LONG'
})
```

### Exports

The package has three entry points. Each one lists its names.

`ag-grid-url-sync`:

| Kind            | Names                                                                                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sync            | `createGridUrlSync`, `IDLE_SNAPSHOT`                                                                                                                                                                                                                                                |
| Codecs          | `individual`, `grouped`                                                                                                                                                                                                                                                             |
| Pure functions  | `parseUrlFilters`, `generateUrl`                                                                                                                                                                                                                                                    |
| Errors (values) | `URLSyncError`, `InvalidFilterError`, `InvalidURLError`, `InvalidDateError`, `InvalidSerializationError`                                                                                                                                                                            |
| Types           | `GridUrlSync`, `GridUrlSyncOptions`, `GridUrlSyncSnapshot`, `UrlOptions`, `Codec`, `HistoryMode`, `SyncStatus`, `ApplyResult`, `IssueCode`, `IssueSeverity`, `IssueSource`, `IssueEvent`, `IssueDetails`, `FilterType`, `SerializationFormat`, `GridView`, `ViewState`, `ViewStore` |

`ag-grid-url-sync/react`: `useGridUrlSync`, and the types `UseGridUrlSyncOptions` and `UseGridUrlSyncResult`. The other types come from `ag-grid-url-sync`.

`ag-grid-url-sync/views`: `createViewStore`, and the types `GridView`, `ViewState` and `ViewStore`.

The filter model types (`FilterModel`, `TextFilterModel`, `NumberFilterModel`, `DateFilterModel`) and `GridApi` come from `ag-grid-community`.

## React Integration

For React applications, use the `useGridUrlSync` hook. It is a thin adapter on [`createGridUrlSync`](#vanilla-js-creategridurlsync): it takes the same options, and the grid behaves as with the vanilla sync.

### Installation for React

```bash
npm install ag-grid-url-sync
```

The hook works with React 16.8 and later. It uses the `use-sync-external-store` package, which npm installs with the library. On React 18 and later, that package uses React's own `useSyncExternalStore`.

### `useGridUrlSync({ api, ...options })`

```tsx
import { useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { GridApi } from 'ag-grid-community'
import { useGridUrlSync } from 'ag-grid-url-sync/react'
import { individual } from 'ag-grid-url-sync'

function GridComponent() {
  const [api, setApi] = useState<GridApi | null>(null)

  const { status, hasFilters, issues, getUrl, applyFilters } = useGridUrlSync({
    api,
    codec: individual({ prefix: 'filter_' }),
    history: 'push', // each filter change adds a history entry; back and forward apply the URL
    onIssue: ({ issue, source }) => console.warn(source, issue.code)
  })

  return (
    <div>
      <button
        disabled={status !== 'active'}
        onClick={() => navigator.clipboard.writeText(getUrl())}
      >
        Share filters
      </button>
      <button disabled={!hasFilters} onClick={() => applyFilters({})}>
        Clear filters
      </button>
      {issues.length > 0 && (
        <p>The link leaves out {issues.length} filter(s)</p>
      )}
      <AgGridReact onGridReady={params => setApi(params.api)} {...gridProps} />
    </div>
  )
}
```

The options are the [`createGridUrlSync` options](#vanilla-js-creategridurlsync) (`codec`, `maxValueLength`, `history`, `popstate`, `applyUrlOnCreate`, `throwOnError`, `onIssue`), with these changes:

| Option         | Default | Description                                                                                                                                                                                                     |
| -------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api`          | none    | The AG Grid API, or `null` while the grid starts                                                                                                                                                                |
| `storageKey`   | none    | Enables saved views, kept in `localStorage` under this key (in place of the core's `views` store). With no key, the view methods do nothing                                                                     |
| `enabled`      | `true`  | With `false`, the hook makes no sync: `status` is `'idle'`, and a method reports `NOT_READY`. `views` still shows what is in storage. Back to `true` starts again, as a new grid does: the URL is applied again |
| `throwOnError` | `false` | As in TanStack Query: the hook throws a picked issue of `issues` during render, so an error boundary catches it. Failures other than `HISTORY_WRITE_FAILED` go to `onIssue` only. The methods do not throw      |

The hook returns the snapshot and the methods of the sync:

| Property                             | Description                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `status`                             | `'idle'` (no grid, no sync yet, or a server render), `'active'` or `'destroyed'`              |
| `url`, `hasFilters`, `issues`        | The URL with the grid's filters, whether the URL holds filters (see below), the latest issues |
| `views`, `activeViewId`              | The saved views and the active one                                                            |
| `applyUrl(url?)`, `applyFilters(f)`  | Apply a URL or filters. They return `{ issues }`                                              |
| `getUrl(baseUrl?)`                   | The URL with the grid's filters, for example to share                                         |
| `saveView`, `loadView`, `deleteView` | The saved view methods of the sync                                                            |

- **The core's rules hold.** On mount, a URL with filters wins over the stored view, a URL with no filters keeps the grid's filters, and a URL apply writes no history.
- **Options can change after mount.** A new codec, `maxValueLength`, history mode, `popstate` or `storageKey` makes a new sync on the same grid. It does not apply the URL again, and it keeps the active view. A new `storageKey` restores that store's view. A new codec object with the same settings, a new `onIssue` or a new `history` function makes no new sync.
- **The result is stable.** It is the same object until a snapshot value changes, and the methods never change.
- **`hasFilters` counts only the filters that the URL holds.** With `individual()`, a combined (AND/OR) filter or a set filter is not in the URL (`UNSUPPORTED_FILTER`). So `hasFilters` is `false` while the grid shows such a filter, and a "Clear" button with `disabled={!hasFilters}` stays disabled. To clear any filter, keep the button enabled.
- **A method with no sync** (no grid yet, `enabled: false`): `applyUrl` and `applyFilters` report `NOT_READY` to `onIssue`, and so do `saveView` and `loadView` with a `storageKey`. `getUrl` returns the base URL. `deleteView` still works with storage only.
- **Issues stay across a new sync.** After an option change or a `StrictMode` remount, `issues` still shows the latest apply's issues until the next apply. A new `storageKey` that restores its stored view clears them, as `loadView` does. `onIssue` gets each issue one time.
- `StrictMode`, React's `<Activity>` and server rendering are supported.

#### Address bar (`history` and `popstate`)

The hook takes the `history` and `popstate` options of [`createGridUrlSync`](#vanilla-js-creategridurlsync), so a React app gets the same address-bar sync with one option:

```tsx
// Each filter change adds a history entry, and back and forward apply the URL
useGridUrlSync({ api, history: 'push' })

// Or give the URL to a router. A new function on each render is fine.
// `replace` is true for a write that must not add an entry (see History with a router).
useGridUrlSync({
  api,
  history: (url, { replace }) =>
    replace ? router.replace(url) : router.push(url)
})
```

- A user edit, `applyFilters` and `loadView` write the URL. `'push'` adds one entry for each of them.
- A URL apply writes nothing, because the URL holds those filters already: the apply on mount, `applyUrl` and the back button.
- The restore of a stored view on mount replaces the entry. A new sync for an option change, or a `StrictMode` remount, adds no entry.
- `popstate` is `true` by default with `'push'`. On back or forward, the hook applies the new URL. The view is then no longer active, and the issues of that apply are in `issues`. A failed address-bar write is `HISTORY_WRITE_FAILED`.

### Saved Views

The views are part of `createGridUrlSync`. The React hook uses the same code, so a vanilla app and a React app get the same rules.

#### Saved views in vanilla JS

Give the `views` option a view store. `createViewStore` is in its own entry point, so an app with no saved views does not get the storage code.

```ts
import { createGridUrlSync } from 'ag-grid-url-sync'
import { createViewStore } from 'ag-grid-url-sync/views'

const sync = createGridUrlSync({
  api: gridApi,
  history: 'push',
  views: createViewStore('orders')
})

const { views, activeViewId } = sync.getSnapshot()

const view = sync.saveView('Open orders') // GridView, or null if the save failed

if (view) {
  sync.loadView(view.id)
  sync.loadView(null) // clear the filters
  sync.deleteView(view.id)
}
```

You can also give your own `ViewStore`, for example one that talks to a server. Its `saveView(name, state)` gets a `ViewState` object. Keep every field of `state`, and give them back in the `GridView`:

```typescript
saveView(name, state) {
  const view = { ...state, id: makeId(), name, updatedAt: Date.now() }
  // write the view to your server
  return view
}
```

Now `ViewState` has only `filterModel`. A later release can add more fields, for example the sort. A store that keeps every field needs no change for them.

With no `views` option, `views` is `[]`, `activeViewId` is `null`, and the three methods do nothing.

Rules for the vanilla API:

- **`activeViewId` is tracked.** `saveView`, `loadView` and the restore of the stored view set it. A load sets it before the grid write, so a snapshot never shows `null` while the write is still pending.
- **Any other filter model clears it.** A user edit, `applyUrl`, `applyFilters` and a back-button apply all set `activeViewId` to `null` and clear the stored pointer. A view that AG Grid changes when it applies it stays active.
- **A hand edit does not make a view active.** If the user types the filters of a view, `activeViewId` stays `null`. When two views have the same model, the active one is the one the user loaded.
- **A view load writes the URL as a user edit does.** With `history: 'push'`, the back button goes back to the URL from before the load. If the URL does not change, the sync writes no entry. Set and multi filters are kept in a view, but the URL cannot hold them. A view that differs only in those filters adds no entry.
- **A URL apply writes no history.** This holds for `applyUrl`, the apply on create and the back button.
- **A failed grid write restores `activeViewId`.** The failure goes to `onIssue` as `GRID_ERROR`.
- **Deleting is conservative.** If the deleted view is active and the grid still shows it, the grid is cleared. If the user edited the filters, they stay.
- **Failures go to `onIssue`**, not to `snapshot.issues`. They are `NOT_READY`, `GRID_ERROR`, `VIEW_NOT_FOUND`, `VIEW_NAME_REQUIRED`, `STORAGE_FULL`, `STORAGE_UNAVAILABLE` and `STORAGE_WRITE_FAILED`. `loadView` with an unknown id reads the store again, then reports `VIEW_NOT_FOUND`. After `destroy`, `saveView` and `loadView` report `NOT_READY`, and `deleteView` still deletes from the store.

On create (when `applyUrlOnCreate` is not `false`), the sync picks the starting filters in this order:

1. The URL holds the filters of the stored view (compared in URL form). The sync restores the view with its full model, and keeps `activeViewId` and the pointer. This is how a reload keeps a view that was loaded with `history` on.
2. The URL has at least one filter. The URL wins. `activeViewId` is `null` and the pointer is cleared. A URL with only bad params does not win, and its bad params are not reported: `onIssue` gets nothing, and `issues` stays empty. With no `views`, the sync reports them.
3. A stored view exists. The sync restores it. With `history` on, the URL is written with replace, so page load adds no back-button step.
4. Else, the grid keeps its filters.

A stored pointer that names a missing view is ignored.

#### Saved views in React

Give a `storageKey` to let users name and load filter sets. The key enables the feature and is the name of its storage, so two grids on the same origin must use different keys. They must also use different URL params (see [Vanilla JS: `createGridUrlSync`](#vanilla-js-creategridurlsync)):

```tsx
const { views, activeViewId, saveView, loadView, deleteView } = useGridUrlSync({
  api,
  storageKey: 'employee-grid'
})

// One handler for each user action
const handleSave = () => saveView('Engineering, high salary')
const handleLoad = (id: string) => loadView(id)
const handleDelete = (id: string) => deleteView(id)
const handleReset = () => loadView(null) // back to a grid with no filters
```

The rules are the [rules of the vanilla API](#saved-views-in-vanilla-js). Render the list from `views`. `views` is React state, so it changes at the next render. If you need the id of a new view in the handler that saved it, use the return value of `saveView`.

Only the filter model is stored, in AG Grid's native format, so set filters and combined conditions stay. Column order, row selection and expanded groups are not stored.

- **Names are unique.** A save with the name of a view updates that view, and keeps its id and its position in the list. So to change a view, load it, change the filters, and save it with the same name. Names are trimmed and must not be empty.
- **`activeViewId` shows the live grid**, not what is in storage.
- **Failures go to `onIssue`.** A save that cannot be written (storage full, storage blocked by policy) returns `null` and reports `STORAGE_FULL`, `STORAGE_UNAVAILABLE` or `STORAGE_WRITE_FAILED`. A read that fails gives an empty list and does not throw, so server rendering is safe.

The store is also available directly:

```ts
import { createViewStore } from 'ag-grid-url-sync/views'

const store = createViewStore('employee-grid')
store.saveView('Engineering', gridApi.getFilterModel())
```

### React with Grouped Serialization

The React hook takes every codec:

```tsx
import { useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { GridApi } from 'ag-grid-community'
import { grouped } from 'ag-grid-url-sync'
import { useGridUrlSync } from 'ag-grid-url-sync/react'

// Grouped serialization with the base64 format
const codec = grouped({ param: 'grid_state', format: 'base64' })

function AdvancedGridComponent() {
  const [api, setApi] = useState<GridApi | null>(null)

  const { status, hasFilters, getUrl, applyFilters } = useGridUrlSync({
    api,
    codec
  })

  const handleShareCompact = async () => {
    await navigator.clipboard.writeText(getUrl())
    alert('Compact filter URL copied!')
  }

  const handleDebug = () => {
    // AG Grid's own filter model
    console.log('Current filters:', JSON.stringify(api?.getFilterModel()))
  }

  return (
    <div>
      <div style={{ marginBottom: '10px' }}>
        <button onClick={handleShareCompact} disabled={status !== 'active'}>
          📋 Share Compact URL
        </button>
        <button onClick={handleDebug} disabled={status !== 'active'}>
          🔍 Debug Filters
        </button>
        <button onClick={() => applyFilters({})} disabled={!hasFilters}>
          🗑️ Clear Filters
        </button>
      </div>

      <div className="ag-theme-alpine" style={{ height: 400, width: '100%' }}>
        <AgGridReact
          onGridReady={params => setApi(params.api)}
          // ... grid configuration
        />
      </div>
    </div>
  )
}
```

### Advanced React Example

```tsx
import { useState, useEffect } from 'react'
import type { GridApi } from 'ag-grid-community'
import { individual, parseUrlFilters } from 'ag-grid-url-sync'
import { useGridUrlSync } from 'ag-grid-url-sync/react'

const codec = individual({ prefix: 'emp_' })

function AdvancedGridComponent() {
  const [api, setApi] = useState<GridApi | null>(null)
  const [shareMessage, setShareMessage] = useState('')

  const { status, url, hasFilters, getUrl, applyFilters } = useGridUrlSync({
    api,
    codec,
    maxValueLength: 100,
    onIssue: ({ issue }) => {
      if (issue.severity === 'warning') {
        setShareMessage('Invalid filter URL detected')
      }
    }
  })

  // Watch for URL changes
  useEffect(() => {
    if (url && url !== window.location.href) {
      setShareMessage('Filters have changed - URL ready to share')
    }
  }, [url])

  const handleShareToEmail = () => {
    const subject = 'Check out this filtered data'
    const body = `View the filtered data here: ${getUrl()}`
    window.open(
      `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    )
  }

  const handlePreviewFilters = () => {
    const input = prompt('Enter URL to preview filters:')

    if (!input) return

    try {
      // The pure function, with the same codec as the hook
      const filters = parseUrlFilters(input, { codec })
      alert(`Found ${Object.keys(filters).length} filter(s)`)
    } catch {
      alert('The URL is not valid')
    }
  }

  return (
    <div>
      <div className="controls">
        <button onClick={handleShareToEmail} disabled={status !== 'active'}>
          📧 Share via Email
        </button>
        <button onClick={handlePreviewFilters}>👁️ Preview URL Filters</button>
        <button onClick={() => applyFilters({})} disabled={!hasFilters}>
          Clear ({hasFilters ? 'has filters' : 'no filters'})
        </button>
      </div>

      {shareMessage && <div className="message">{shareMessage}</div>}

      {/* Grid component, with onGridReady={params => setApi(params.api)} */}
    </div>
  )
}
```

### URL Format

The library generates clean, human-readable URLs:

```
Base URL: https://app.com/page
With text filters: https://app.com/page?f_name_contains=john&f_status_eq=active
With number filters: https://app.com/page?f_salary_gte=75000&f_age_range=25%2C45
Mixed filters: https://app.com/page?f_name_contains=john&f_salary_gte=75000&f_age_lt=50
```

Parameter structure:

- Prefix: `f_` (set it with `individual({ prefix })`)
- Format: `f_{columnName}_{operation}={value}`
- **Text Operations**: `contains`, `eq`, `neq`, `startsWith`, `endsWith`, `notContains`, `blank`, `notBlank`
- **Number Operations**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `range`, `blank`, `notBlank`
- **Date Operations**: `eq`, `neq`, `before`, `beforeEq`, `after`, `afterEq`, `daterange`, `blank`, `notBlank`
- **Range Format**: `f_column_range=min,max` (comma-separated values). The library writes the comma as `%2C`. A link with a raw comma (`f_age_range=25,45`) also works.
- Standard URL encoding for special characters
- Supports column names with underscores (e.g., `user_id`, `salary_base`, `created_date`)

## API Reference

### `createGridUrlSync(options)`

```typescript
createGridUrlSync(options: GridUrlSyncOptions): GridUrlSync
```

Makes a sync between one grid and the URL. See [Vanilla JS: `createGridUrlSync`](#vanilla-js-creategridurlsync) for the options.

| Method                 | Returns               | Description                                                                        |
| ---------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `getSnapshot()`        | `GridUrlSyncSnapshot` | The current state. The same object until something changes                         |
| `subscribe(listener)`  | `() => void`          | Calls the listener after each snapshot change. Returns the unsubscribe function    |
| `applyUrl(url?)`       | `ApplyResult`         | Applies the filters of a URL (default: the address bar) to the grid                |
| `applyFilters(model)`  | `ApplyResult`         | Writes an AG Grid filter model to the grid, as the app's own write. `{}` clears it |
| `getUrl(baseUrl?)`     | `string`              | The URL with the grid's filters (default base: the address bar)                    |
| `saveView(name)`       | `GridView \| null`    | Saves the grid's filters as a view, and makes it active                            |
| `loadView(id \| null)` | `void`                | Loads a saved view. `null` clears the filters                                      |
| `deleteView(id)`       | `void`                | Deletes a saved view                                                               |
| `destroy()`            | `void`                | Removes the listeners. The snapshot keeps the last state                           |

`ApplyResult` is `{ issues: readonly URLSyncError[] }`: the filters that the call dropped.

The snapshot (`GridUrlSyncSnapshot`):

| Field          | Type                                | Description                                           |
| -------------- | ----------------------------------- | ----------------------------------------------------- |
| `status`       | `'idle' \| 'active' \| 'destroyed'` | The state of the sync                                 |
| `url`          | `string`                            | The URL with the grid's filters and the page's params |
| `hasFilters`   | `boolean`                           | Whether the grid has filters that the library holds   |
| `issues`       | `readonly URLSyncError[]`           | The issues of the latest apply and latest grid read   |
| `views`        | `readonly GridView[]`               | The saved views, in save order                        |
| `activeViewId` | `string \| null`                    | The id of the active saved view                       |

`IDLE_SNAPSHOT` is the snapshot with `status: 'idle'`, `url: ''`, no filters, no issues and no views.

### Codecs: `individual(options?)` and `grouped(options?)`

A codec tells how the filters are written in the URL. It is opaque: give it to `createGridUrlSync`, `useGridUrlSync`, `parseUrlFilters` or `generateUrl`.

```typescript
individual({ prefix?: string }): Codec
grouped({ param?: string, format?: SerializationFormat }): Codec
```

| Codec        | Option   | Default          | Description                                                                                                                                               |
| ------------ | -------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `individual` | `prefix` | `'f_'`           | The start of each param name. A prefix with no trailing `_` gets one, so `'filter'` gives `?filter_name_contains=john`. An empty prefix means the default |
| `grouped`    | `param`  | `'grid_filters'` | The name of the one param                                                                                                                                 |
| `grouped`    | `format` | `'querystring'`  | `'querystring'`, `'json'` or `'base64'`. See [Format Options](#format-options)                                                                            |

Two codecs with the same settings are equal for the React hook: a new codec object with the same settings makes no new sync.

### `parseUrlFilters(url, options?)`

```typescript
parseUrlFilters(url: string, options?: UrlOptions): FilterModel
```

Reads the filters from a URL, with no grid. It returns AG Grid's filter model. It throws `InvalidURLError` for a URL that it cannot read, and a `TypeError` for a codec that did not come from `individual()` or `grouped()`. See [URL Functions With No Grid](#url-functions-with-no-grid) for the rules.

### `generateUrl(baseUrl, model, options?)`

```typescript
generateUrl(baseUrl: string, model: FilterModel, options?: UrlOptions): string
```

Writes the filters of an AG Grid filter model into a URL, with no grid. `baseUrl` must be an absolute URL. The page's own params stay, and the filter params of both codecs are replaced. It throws a `TypeError` for a codec that did not come from `individual()` or `grouped()`.

### `UrlOptions`

The options of `parseUrlFilters` and `generateUrl`. The names and meanings are the same as in `GridUrlSyncOptions`. One option is only here: `columnTypes`. A sync reads the column types from the grid.

| Option           | Default        | Description                                                                                                                                                                                              |
| ---------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codec`          | `individual()` | How the filters are written in the URL                                                                                                                                                                   |
| `maxValueLength` | `200`          | The longest text value that is kept                                                                                                                                                                      |
| `columnTypes`    | none           | `(column) => 'text' \| 'number' \| 'date' \| undefined`: the filter type of a column, for `eq`, `neq`, `blank` and `notBlank`. With no type, the value stays text                                        |
| `throwOnError`   | `false`        | Throw an issue instead of reporting it. `true` throws every issue, and a function throws the issues for which it gives `true`. A thrown issue does not go to `onIssue`, and the first one stops the call |
| `onIssue`        | none           | Gets each issue one time, with `source: 'api'`. An error that it throws goes to the caller                                                                                                               |

### `createViewStore(storageKey)`

```typescript
import { createViewStore } from 'ag-grid-url-sync/views'

createViewStore(storageKey: string): ViewStore
```

Makes a store for the saved views of one grid, in `localStorage`. Give it to the `views` option of `createGridUrlSync`. (The React hook makes one for you from `storageKey`.)

| Method                    | Description                                                                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listViews()`             | All saved views, in save order                                                                                                                                                                            |
| `getActiveViewId()`       | The id of the active view, or `null`                                                                                                                                                                      |
| `persistActiveViewId(id)` | Writes the id of the active view. It does nothing when the id does not change                                                                                                                             |
| `saveView(name, state)`   | Saves a `ViewState`, `{ filterModel }`, with a name and makes it active. The same name updates that view. Throws for an empty name or a failed write, and a `TypeError` when `state` is not a `ViewState` |
| `deleteView(id)`          | Deletes a view. An unknown id does nothing                                                                                                                                                                |

A read never throws: with no storage (a server render), storage blocked by policy, or data that is not valid, it gives an empty store. A write throws a `URLSyncError` with the code `STORAGE_UNAVAILABLE`, `STORAGE_FULL` or `STORAGE_WRITE_FAILED`.

A `GridView` is `{ id, name, updatedAt, filterModel }`: the fields of its `ViewState`, and the id, the name and the time. `updatedAt` is the time of the last write, in milliseconds. `filterModel` is AG Grid's filter model, as it was saved.

### `useGridUrlSync(options)`

```typescript
import { useGridUrlSync } from 'ag-grid-url-sync/react'

useGridUrlSync(options: UseGridUrlSyncOptions): UseGridUrlSyncResult
```

See [`useGridUrlSync({ api, ...options })`](#usegridurlsync-api-options-) for the options and the result.

### Issue Codes and Severities

`IssueCode` is the type of `issue.code`, and `IssueSeverity` (`'warning' | 'error'`) is the type of `issue.severity`. The [Error Handling](#error-handling) table gives each code and its severity. `IssueEvent` is `{ issue: URLSyncError, source: IssueSource }`, and `IssueSource` is `'url' | 'grid' | 'api'`.

`URLSyncError`, `InvalidFilterError`, `InvalidURLError` and `InvalidDateError` take `(message, cause?, details?)`. `details` is an `IssueDetails`: `{ code?, column? }`. `InvalidSerializationError` takes `(format, cause)`: it copies the `code` and the `column` of a `URLSyncError` cause, else its code is `INVALID_GROUPED`. Its `format` is the grouped format.

## Migrating from 0.5 to 0.6

Version 0.6.0 removes the APIs that 0.5 deprecated, and changes the filter model, the issue callbacks and the view store's `saveView`. It needs AG Grid 31 or later. The URL format does not change: links from 0.5 still open.

### 1. Entry points

The package has three entry points: `ag-grid-url-sync`, `ag-grid-url-sync/react` and `ag-grid-url-sync/views`. The other subpaths are removed. An import of a removed subpath fails to resolve.

| 0.5 subpath                              | 0.6                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ag-grid-url-sync`                       | The same entry point, with fewer names. See [Exports](#exports) and the tables below                                                                                                                                                                                                  |
| `ag-grid-url-sync/react`                 | The same entry point. It has `useGridUrlSync` and its two types only. Import `GridView` and `HistoryMode` from `ag-grid-url-sync`, and `GridApi` from `ag-grid-community`. `FilterState`, `ColumnFilter`, `FilterOperation` and `AGGridUrlSyncConfig` are removed (see parts 2 and 5) |
| `ag-grid-url-sync/view-storage`          | `ag-grid-url-sync/views` (`createViewStore`, `GridView`, `ViewStore`)                                                                                                                                                                                                                 |
| `ag-grid-url-sync/url-parser`            | `parseUrlFilters` from `ag-grid-url-sync`. `parseFilterParam` is removed (see part 4)                                                                                                                                                                                                 |
| `ag-grid-url-sync/url-generator`         | `generateUrl` from `ag-grid-url-sync`. `serializeFilters` is removed (see part 4)                                                                                                                                                                                                     |
| `ag-grid-url-sync/grid-integration`      | Removed. Use `gridApi.getFilterModel()` and `sync.applyFilters(model)` (see part 4)                                                                                                                                                                                                   |
| `ag-grid-url-sync/validation`            | Removed (see part 4)                                                                                                                                                                                                                                                                  |
| `ag-grid-url-sync/types`                 | Removed. Import the types from `ag-grid-url-sync`, and the filter model types from `ag-grid-community`                                                                                                                                                                                |
| `ag-grid-url-sync/serialization`         | Removed. Use `grouped({ param, format })` with `parseUrlFilters` and `generateUrl` (see part 4)                                                                                                                                                                                       |
| `ag-grid-url-sync/serialization/formats` | Removed. Use `grouped({ format: 'querystring' })`, `grouped({ format: 'json' })` or `grouped({ format: 'base64' })`                                                                                                                                                                   |

A 0.5 subpath also gave the other exports of its file (for example `validateNumberFilter` or `detectColumnFilterType`). They are internal in 0.6.0, with no replacement.

The package is ESM only. It has no `require` build and no `typesVersions`:

- `require('ag-grid-url-sync')` needs Node 20.19+ (or 22.12+), or a bundler.
- TypeScript with `moduleResolution: node10` cannot find the types of `./react` and `./views`. Use `bundler`, `node16` or `nodenext`.

### 2. `AGGridUrlSync` and `createUrlSync` become `createGridUrlSync`

```typescript
// 0.5
const urlSync = createUrlSync(gridApi, { paramPrefix: 'filter_' })

// 0.6
const sync = createGridUrlSync({
  api: gridApi,
  codec: individual({ prefix: 'filter_' })
})
```

The sync does more than the class did. It listens to the grid's filter changes, and it applies the address bar's filters when you make it. Give `applyUrlOnCreate: false` to not apply them. The default `history: 'none'` does not write the address bar, as the class did not. Call `destroy()` when you no longer need the sync (a destroyed grid also removes the listeners).

| 0.5 class                     | 0.6 sync                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `new AGGridUrlSync(api, cfg)` | `createGridUrlSync({ api, ...options })`                                                                                                                                                                                       |
| `createUrlSync(api, cfg)`     | `createGridUrlSync({ api, ...options })`                                                                                                                                                                                       |
| `generateUrl(baseUrl?)`       | `getUrl(baseUrl?)`                                                                                                                                                                                                             |
| `getUrlState(baseUrl?)`       | `getSnapshot()`: `{ url, hasFilters, issues }`, for the address bar. For another base URL, use `getUrl(baseUrl)`                                                                                                               |
| `getQueryParams()`            | `new URL(sync.getUrl()).search`, or `new URL(sync.getSnapshot().url).search` (#236)                                                                                                                                            |
| `applyFromUrl(url?)`          | `applyUrl(url?)`. It returns `{ issues }`. A URL that it cannot read is an `INVALID_URL` issue, not an error that it throws (unless `throwOnError` picks it)                                                                   |
| `applyFilters(filterState)`   | `applyFilters(model)`, with AG Grid's `FilterModel` (see part 5)                                                                                                                                                               |
| `clearFilters()`              | `applyFilters({})`                                                                                                                                                                                                             |
| `destroy()`                   | `destroy()`. It now removes the sync's listeners                                                                                                                                                                               |
| `getSerializationMode()`      | Removed. Your app gives the codec, so it knows the mode                                                                                                                                                                        |
| `getCurrentFormat()`          | Removed. Your app gives the codec, so it knows the format                                                                                                                                                                      |
| `getFiltersAsFormat(format)`  | Removed. Use `new URL(generateUrl(baseUrl, gridApi.getFilterModel(), { codec: grouped({ format }) })).searchParams.get('grid_filters') ?? ''`. With no filters, the URL has no param, so `?? ''` gives the empty string of 0.5 |

The options (`AGGridUrlSyncConfig` becomes `GridUrlSyncOptions`):

| 0.5 option                                           | 0.6 option                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `paramPrefix`                                        | `codec: individual({ prefix })`                                                                            |
| `serialization: 'individual'`                        | `codec: individual()` (the default)                                                                        |
| `serialization: 'grouped'`, `groupedParam`, `format` | `codec: grouped({ param, format })`                                                                        |
| `maxValueLength`                                     | `maxValueLength`                                                                                           |
| `throwOnError`                                       | `throwOnError`                                                                                             |
| `onParseError(error)`                                | `onIssue({ issue, source })` (see part 7)                                                                  |
| `columnTypes`                                        | Removed from the sync: it takes the types from the grid's columns. The pure functions keep it (see part 6) |
| (none)                                               | New: `history`, `popstate`, `applyUrlOnCreate`, `views`                                                    |

The types:

| 0.5 type                                           | 0.6                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `AGGridUrlSyncConfig`                              | `GridUrlSyncOptions` (the sync) or `UrlOptions` (the pure functions) |
| `ResolvedOptions`, `ParseConfig`, `InternalConfig` | Removed (internal)                                                   |
| `UrlState`                                         | `GridUrlSyncSnapshot`                                                |
| `GridApi`                                          | `import type { GridApi } from 'ag-grid-community'`                   |

### 3. `useAGGridUrlSync` becomes `useGridUrlSync`

```tsx
// 0.5
const { shareUrl, isReady } = useAGGridUrlSync(gridApi, {
  autoApplyOnMount: true,
  paramPrefix: 'filter_'
})

// 0.6
const { getUrl, status } = useGridUrlSync({
  api: gridApi,
  codec: individual({ prefix: 'filter_' })
})
```

The types `UseAGGridUrlSyncOptions` and `UseAGGridUrlSyncReturn` become `UseGridUrlSyncOptions` and `UseGridUrlSyncResult`.

The options:

| 0.5 option                                                            | 0.6 option                                                                                                                       |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `useAGGridUrlSync(gridApi, options)`                                  | `useGridUrlSync({ api: gridApi, ...options })`                                                                                   |
| `paramPrefix`, `serialization`, `groupedParam`, `format`              | `codec: individual({ prefix })` or `grouped({ param, format })`                                                                  |
| `autoApplyOnMount` (default `false`)                                  | `applyUrlOnCreate` (default `true`). A URL with no filters keeps the grid's filters. Give `false` for the 0.5 default            |
| `enabledWhenReady`                                                    | `enabled`. With `enabled: false`, `deleteView` still deletes from storage (in 0.5, `enabledWhenReady: false` made it do nothing) |
| `onParseError(error)`                                                 | `onIssue({ issue, source })`                                                                                                     |
| `onError(error, context)`                                             | `onIssue({ issue, source })`. Use `issue.code` and `source` in place of `context`                                                |
| `maxValueLength`, `throwOnError`, `history`, `popstate`, `storageKey` | The same                                                                                                                         |

The result:

| 0.5 result                                           | 0.6 result                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `shareUrl(baseUrl?)`                                 | `getUrl(baseUrl?)`                                                                                 |
| `currentUrl`                                         | `url`                                                                                              |
| `isReady`                                            | `status === 'active'`                                                                              |
| `applyUrlFilters(url?)`                              | `applyUrl(url?)`. It returns `{ issues }`                                                          |
| `applyFilters(filters)`                              | `applyFilters(model)`, with AG Grid's `FilterModel`. It returns `{ issues }`                       |
| `clearFilters()`                                     | `applyFilters({})`                                                                                 |
| `parseUrlFilters(url)`                               | `parseUrlFilters(url, { codec })` from `ag-grid-url-sync`. Give the same codec as the hook         |
| `getQueryParams()`                                   | `new URL(getUrl()).search`, while `status` is `'active'` (#236)                                    |
| `getFiltersAsFormat(format)`                         | Removed. Use `generateUrl` with `grouped({ format })`, as in part 2                                |
| `getSerializationMode()`                             | Removed. Your app gives the codec, so it knows the mode                                            |
| `getCurrentFormat()`                                 | Removed. Your app gives the codec, so it knows the format (in 0.5, this hook method gave the mode) |
| `hasFilters`, `issues`                               | The same                                                                                           |
| `views`                                              | `views`. Its type is now `readonly GridView[]`                                                     |
| `activeViewId`, `saveView`, `loadView`, `deleteView` | The same                                                                                           |

### 4. The pure functions

`parseUrlFilters` and `generateUrl` take the option names of `createGridUrlSync` (`UrlOptions`):

```typescript
// 0.5
parseUrlFilters(url, { serialization: 'grouped', format: 'json', onParseError })

// 0.6
parseUrlFilters(url, { codec: grouped({ format: 'json' }), onIssue })
```

| 0.5 config                                      | 0.6 option                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| `paramPrefix`                                   | `codec: individual({ prefix })`                                                    |
| `serialization`, `groupedParam`, `format`       | `codec: grouped({ param, format })`                                                |
| `onParseError(error: Error)`                    | `onIssue({ issue, source })`. `issue` is a `URLSyncError`, and `source` is `'api'` |
| `maxValueLength`, `columnTypes`, `throwOnError` | The same                                                                           |

The rules do not change: `parseUrlFilters` throws `INVALID_URL` for a URL that it cannot read, a non-empty grouped param wins over the prefixed params, and `generateUrl` keeps the page's own params. As in 0.5, a handler that throws stops the call, and the error goes to the caller.

The removed helpers:

| 0.5 name                                                                             | 0.6                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseFilterParam(param, value)`                                                     | `parseUrlFilters(new URLSearchParams({ [param]: value }).toString(), { codec: individual({ prefix }) })`. Give the `prefix` that you gave as `expectedPrefix` (default `'f_'`). It gives a model with that one column. 0.5 threw for a bad param; 0.6 gives `{}` and reports the issue to `onIssue` |
| `serializeFilters(model)`                                                            | `new URL(generateUrl('https://app.invalid/', model, { codec: individual({ prefix }) })).searchParams`. `generateUrl` keeps the base URL's own params, so give a base URL with no params                                                                                                             |
| `serializeGrouped(model, config)`                                                    | `generateUrl(baseUrl, model, { codec: grouped({ param, format }) })`, and read the param from the URL                                                                                                                                                                                               |
| `deserializeGrouped(value, format)`                                                  | `parseUrlFilters(new URLSearchParams({ grid_filters: value }).toString(), { codec: grouped({ format }) })`                                                                                                                                                                                          |
| `detectGroupedSerialization`                                                         | Removed. The library does not guess the format: give the codec that wrote the URL                                                                                                                                                                                                                   |
| `getAvailableFormats()`                                                              | The type `SerializationFormat`: `'querystring' \| 'json' \| 'base64'`                                                                                                                                                                                                                               |
| `getFormatSerializer`, `QueryStringSerializer`, `JsonSerializer`, `Base64Serializer` | `grouped({ format })`                                                                                                                                                                                                                                                                               |
| `getFilterModel(gridApi)`                                                            | `gridApi.getFilterModel()` (AG Grid's model)                                                                                                                                                                                                                                                        |
| `applyFilterModel(state, gridApi)`                                                   | `sync.applyFilters(model)`, or `gridApi.setFilterModel(model)`                                                                                                                                                                                                                                      |
| `validateFilterValue`                                                                | Removed. The library checks each value when it reads or writes a URL, and reports an issue                                                                                                                                                                                                          |
| `DEFAULT_CONFIG`                                                                     | Removed. The defaults are: prefix `'f_'`, param `'grid_filters'`, format `'querystring'`, `maxValueLength` `200`                                                                                                                                                                                    |
| `GroupedSerializationResult`, `FormatSerializer`, `GroupedDetectionResult`           | Removed                                                                                                                                                                                                                                                                                             |
| `SerializationMode`                                                                  | Removed. The codec gives the mode                                                                                                                                                                                                                                                                   |

### 5. `FilterState` becomes AG Grid's `FilterModel` (#225)

`applyFilters`, `parseUrlFilters` and `generateUrl` take and give AG Grid's `FilterModel` (the value of `gridApi.getFilterModel()`). The library's own `FilterState` is removed.

```typescript
// 0.5 (FilterState)
sync.applyFilters({
  created: { filterType: 'date', type: 'dateBefore', filter: '2024-01-01' }
})

// 0.6 (AG Grid's FilterModel)
sync.applyFilters({
  created: { filterType: 'date', type: 'lessThan', dateFrom: '2024-01-01' }
})
```

- An operation has AG Grid's name: `eq` is `equals`, `dateBefore` is `lessThan`, `dateBeforeOrEqual` is `lessThanOrEqual`, `dateAfter` is `greaterThan`, `dateAfterOrEqual` is `greaterThanOrEqual`, `dateRange` is `inRange`. The other names do not change.
- A date filter has `dateFrom` and `dateTo`, not `filter` and `filterTo`.
- A URL apply merges. It changes only the columns that the codec holds. The columns that it cannot hold (set, multi, combined conditions, custom filters) stay on the grid. In 0.5, a URL apply cleared them.
- `applyFilters(model)` replaces the full model, as `gridApi.setFilterModel(model)` does.
- A new issue code, `UNSUPPORTED_FILTER` (a warning): the grid has a filter that the codec cannot hold. The sync reports it when it reads the grid, and `generateUrl` reports it too.
- The `json` and `base64` formats write AG Grid's native model, with sorted keys, so they hold any filter model. 0.6 writes only this form. It still reads the 0.5 form, so 0.5 links open.

The removed types and constants:

| 0.5 name                                                                                                                                                                      | 0.6                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `FilterState`                                                                                                                                                                 | `FilterModel` from `ag-grid-community`                                             |
| `ColumnFilter`, `TextColumnFilter`, `NumberColumnFilter`, `DateColumnFilter`, `AGGridFilter`, `RawAGGridFilter`                                                               | `TextFilterModel`, `NumberFilterModel`, `DateFilterModel` from `ag-grid-community` |
| `FilterOperation`, `TextFilterOperation`, `NumberFilterOperation`, `DateFilterOperation`, `RangeOperation`, `BlankOperation`                                                  | The `type` of AG Grid's filter models                                              |
| `TEXT_FILTER_OPERATIONS`, `NUMBER_FILTER_OPERATIONS`, `DATE_FILTER_OPERATIONS`, `TEXT_ONLY_OPERATIONS`, `NUMBER_ONLY_OPERATIONS`, `DATE_ONLY_OPERATIONS`, `SHARED_OPERATIONS` | Removed. See [Supported Filter Types](#supported-filter-types) for the operations  |
| `isTextFilter`, `isNumberFilter`, `isDateFilter`                                                                                                                              | Check `filter.filterType`                                                          |
| `isTextFilterOperation`, `isNumberFilterOperation`, `isDateFilterOperation`, `isRangeOperation`, `isBlankOperation`                                                           | Removed                                                                            |
| `OPERATION_MAP`, `INTERNAL_TO_URL_OPERATION_MAP`, `AG_GRID_OPERATION_NAMES`, `REVERSE_AG_GRID_OPERATION_NAMES`                                                                | Removed. The URL names are in [Supported Filter Types](#supported-filter-types)    |
| `ParsedFilterParam`                                                                                                                                                           | Removed                                                                            |

### 6. The filter type comes from the column (#224)

`eq`, `neq`, `blank` and `notBlank` do not say their filter type in the URL. 0.5 guessed it from the value: `f_zip_eq=01234` became the number `1234`, and `f_note_eq=2024-01-15` on a text column became a date filter that the grid then rejected (`TYPE_MISMATCH`).

0.6 takes the type from the grid's column, so `?f_zip_eq=01234` keeps its leading zero on a text column. `createGridUrlSync` and `useGridUrlSync` read the types from the grid, and wait for the first row data when AG Grid has not inferred them yet. With no grid, the value stays text. Give `columnTypes` to `parseUrlFilters` to read it as a number or a date. See [Filter Types of `eq`, `neq`, `blank` and `notBlank`](#filter-types-of-eq-neq-blank-and-notblank).

### 7. Issues

One callback, `onIssue({ issue, source })`, replaces `onParseError(error)` and the hook's `onError(error, context)`.

| 0.5                                                       | 0.6                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `onParseError(error)` (data issues)                       | `onIssue({ issue, source })`                                                                            |
| `onError(error, context)` (the hook's operation failures) | `onIssue({ issue, source })`. `issue.code` tells the failure, and `source` tells where the work started |
| `error instanceof URLSyncError` check                     | Not necessary: `issue` is always a `URLSyncError`                                                       |
| (none)                                                    | `issue.severity`: `'warning'` for a data issue, `'error'` for an operation that failed                  |
| (none)                                                    | The code `UNSUPPORTED_FILTER` (see part 5)                                                              |

`createGridUrlSync` and `useGridUrlSync` send every issue to `onIssue` one time. See [Error Handling](#error-handling).

### 8. A view store's `saveView` gets one state object

`ViewStore.saveView(name, filterModel)` becomes `saveView(name, state)`. The `state` is a `ViewState`, `{ filterModel }`. Later releases can add more fields to it, and a store that keeps every field gets them with no new argument. The saved views in `localStorage` do not change: views from 0.5 still load.

```typescript
// 0.5
store.saveView('Open orders', api.getFilterModel())

// 0.6
store.saveView('Open orders', { filterModel: api.getFilterModel() })
```

In JavaScript, the store of `createViewStore` throws a `TypeError` for the 0.5 form, so the call does not save an empty view.

In your own `ViewStore`, keep every field of `state` (see [Saved views in vanilla JS](#saved-views-in-vanilla-js)):

```typescript
// 0.5
saveView(name, filterModel) {
  return { id: makeId(), name, updatedAt: Date.now(), filterModel }
}

// 0.6
saveView(name, state) {
  return { ...state, id: makeId(), name, updatedAt: Date.now() }
}
```

TypeScript shows an error for a 0.5 store. In JavaScript, a 0.5 store saves the whole `state` object as the filter model, so the view loads no filters, and no issue is reported.

### 9. AG Grid 31 or later

The peer dependency `ag-grid-community` goes from `>=28.0.0` to `>=31.0.0`. AG Grid 31 moved the column methods (`getColumn`, `getColumns`) from the column API to the grid API, and added `getGridOption`. 0.6 reads the filter type of a column with these methods (part 6), and sort and column state also need the grid API. On AG Grid 28 to 30, use version 0.5, or update AG Grid first.

## Examples

Check out the [examples](./examples) directory for comprehensive working demos:

### 🚀 [Vanilla JavaScript Demo](./examples/vanilla-js/demo.html)

Comprehensive demonstration of `createGridUrlSync`:

- **Complete text filter support** - All 8 AG Grid text operations (contains, equals, not contains, not equal, starts with, ends with, blank, not blank)
- **Complete number filter support** - All 9 AG Grid number operations (equals, not equal, greater than, greater than or equal, less than, less than or equal, in range, blank, not blank)
- **Complete date filter support** - All 9 AG Grid date operations (equals, not equal, before, before or equal, after, after or equal, in range, blank, not blank)
- **Grouped serialization** - Package all filters into a single URL parameter with querystring, JSON, or base64 encoding
- **Manual URL generation** - Generate shareable URLs with current filter states
- **Bidirectional sync** - Automatic synchronization between AG Grid and URL
- **Framework agnostic** - Works with any AG Grid setup, with no framework
- **High performance** - Efficiently handles 100+ filters with <20ms latency
- **Robust error handling** - Graceful handling of malformed URLs and special characters

### ⚛️ [React Integration](./examples/react-basic/basic-grid.tsx)

A React component that uses the `useGridUrlSync` hook:

- React hook integration with AG Grid for text, number, and date filters
- A codec that changes between `individual()` and `grouped()` at run time
- Share button with clipboard functionality
- Filter status indicators and controls
- Saved views with `storageKey`
- The URL filters are applied on mount, for all filter types
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

# Grouped Serialization Demo

This interactive demo showcases the grouped serialization feature of ag-grid-url-sync, demonstrating the differences between individual and grouped filter serialization modes.

## Features Demonstrated

- **Serialization Modes**: Switch between individual and grouped serialization
- **Format Options**: Compare querystring, JSON, and base64 formats for grouped mode
- **Real-time URL Generation**: See how URLs change with different configurations
- **Multi-type Filters**: Test with text, number, and date filters simultaneously
- **Interactive Controls**: Apply, clear, and share filter states

## Running the Demo

1. Open `grouped-demo.html` in your web browser
2. Apply some filters using the floating filter inputs
3. Switch between different serialization modes and formats
4. Click "Generate Shareable URL" to see the resulting URL structure
5. Use "Add Sample Filters" to quickly populate the grid with test filters

## Key Differences

### Individual Serialization (Default)

Each filter becomes a separate URL parameter:

```
?f_name_contains=John&f_salary_gt=80000&f_age_range=25,40
```

### Grouped Serialization

All filters are packaged into a single parameter:

**QueryString Format:**

```
?filters=f_name_contains%3DJohn%26f_salary_gt%3D80000%26f_age_range%3D25%2C40
```

**JSON Format:**

```
?filters=%7B%22name%22%3A%7B%22filterType%22%3A%22text%22%2C%22type%22%3A%22contains%22%2C%22filter%22%3A%22John%22%7D%7D
```

**Base64 Format:**

```
?filters=eyJuYW1lIjp7ImZpbHRlclR5cGUiOiJ0ZXh0IiwidHlwZSI6ImNvbnRhaW5zIiwiZmlsdGVyIjoiSm9obiJ9fQ%3D%3D
```

## Use Cases

- **Individual Mode**: Good for simple URLs, easy debugging, SEO-friendly
- **Grouped QueryString**: Balance between compatibility and cleanliness
- **Grouped JSON**: Ideal for complex filter states, easy debugging
- **Grouped Base64**: Most compact URLs, best for sharing via messaging/email

## Integration Example

```javascript
// Individual mode (default)
const urlSync = AGGridUrlSync.createUrlSync(gridApi, {
  serialization: 'individual'
})

// Grouped mode with different formats
const groupedSync = AGGridUrlSync.createUrlSync(gridApi, {
  serialization: 'grouped',
  format: 'base64', // 'querystring', 'json', or 'base64'
  groupedParam: 'filters'
})
```

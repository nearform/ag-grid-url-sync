import React, { useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AgGridReact } from 'ag-grid-react'
import { useAGGridUrlSync } from 'ag-grid-url-sync/react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

// Sample data
const rowData = [
  {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    status: 'active',
    department: 'Engineering'
  },
  {
    id: 2,
    name: 'Jane Smith',
    email: 'jane@example.com',
    status: 'inactive',
    department: 'Marketing'
  },
  {
    id: 3,
    name: 'Bob Johnson',
    email: 'bob@example.com',
    status: 'active',
    department: 'Sales'
  },
  {
    id: 4,
    name: 'Alice Brown',
    email: 'alice@example.com',
    status: 'active',
    department: 'Engineering'
  },
  {
    id: 5,
    name: 'Charlie Wilson',
    email: 'charlie@example.com',
    status: 'inactive',
    department: 'HR'
  },
  {
    id: 6,
    name: 'Diana Davis',
    email: 'diana@example.com',
    status: 'active',
    department: 'Marketing'
  },
  {
    id: 7,
    name: 'Edward Miller',
    email: 'edward@example.com',
    status: 'active',
    department: 'Sales'
  },
  {
    id: 8,
    name: 'Fiona Garcia',
    email: 'fiona@example.com',
    status: 'inactive',
    department: 'Engineering'
  }
]

const columnDefs = [
  { field: 'id', headerName: 'ID', width: 80 },
  {
    field: 'name',
    headerName: 'Name',
    filter: 'agTextColumnFilter',
    floatingFilter: true,
    width: 150
  },
  {
    field: 'email',
    headerName: 'Email',
    filter: 'agTextColumnFilter',
    floatingFilter: true,
    width: 200
  },
  {
    field: 'status',
    headerName: 'Status',
    filter: 'agTextColumnFilter',
    floatingFilter: true,
    width: 120
  },
  {
    field: 'department',
    headerName: 'Department',
    filter: 'agTextColumnFilter',
    floatingFilter: true,
    width: 150
  }
]

export default function RouterGrid() {
  const [gridApi, setGridApi] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  const { shareUrl, applyUrlFilters, clearFilters, hasFilters, isReady } =
    useAGGridUrlSync(gridApi, {
      autoApplyOnMount: true,
      prefix: 'f_'
    })

  const defaultColDef = useMemo(
    () => ({
      flex: 1,
      minWidth: 100,
      resizable: true,
      sortable: true
    }),
    []
  )

  // Update browser URL with filters (user controls when)
  const updateUrlWithFilters = () => {
    const url = shareUrl() // Get URL from hook
    const urlParams = new URL(url).searchParams
    const currentParams = new URLSearchParams(location.search)

    // Clear existing grid params
    for (const [key] of currentParams) {
      if (key.startsWith('f_')) {
        currentParams.delete(key)
      }
    }

    // Add current grid params
    for (const [key, value] of urlParams) {
      currentParams.set(key, value)
    }

    navigate(`${location.pathname}?${currentParams.toString()}`, {
      replace: true
    })
  }

  // Clear URL filters and update browser (user controls when)
  const clearUrlFilters = () => {
    clearFilters() // Clear grid filters
    const params = new URLSearchParams(location.search)

    // Remove grid filter params
    for (const [key] of [...params]) {
      if (key.startsWith('f_')) {
        params.delete(key)
      }
    }

    navigate(`${location.pathname}?${params.toString()}`, { replace: true })
  }

  const handleShare = async () => {
    const url = shareUrl()
    try {
      await navigator.clipboard.writeText(url)
      alert('Filter URL copied to clipboard!\n\n' + url)
    } catch (err) {
      console.error('Failed to copy URL:', err)
      alert('Share this URL:\n\n' + url)
    }
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>AG Grid URL Sync - React Router Example</h1>

      <div style={{ marginBottom: '20px' }}>
        <h3>Instructions:</h3>
        <ol>
          <li>Apply some text filters using the floating filter inputs</li>
          <li>
            Click "Update URL with Filters" to sync filters with browser URL
          </li>
          <li>Notice how the browser URL changes with your filters</li>
          <li>Refresh the page - filters are automatically restored!</li>
          <li>Use "Clear All Filters" to remove filters and update URL</li>
        </ol>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}
        >
          <button
            onClick={updateUrlWithFilters}
            disabled={!isReady}
            style={{
              padding: '8px 16px',
              backgroundColor: isReady ? '#007bff' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isReady ? 'pointer' : 'not-allowed'
            }}
          >
            🔗 Update URL with Filters
          </button>

          <button
            onClick={clearUrlFilters}
            disabled={!hasFilters}
            style={{
              padding: '8px 16px',
              backgroundColor: hasFilters ? '#dc3545' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: hasFilters ? 'pointer' : 'not-allowed'
            }}
          >
            🗑️ Clear All Filters
          </button>

          <button
            onClick={handleShare}
            disabled={!isReady}
            style={{
              padding: '8px 16px',
              backgroundColor: isReady ? '#28a745' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isReady ? 'pointer' : 'not-allowed'
            }}
          >
            📋 Share Current URL
          </button>
        </div>

        <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
          <strong>Status:</strong> {isReady ? '✅ Ready' : '⏳ Loading...'} |
          <strong> Has Filters:</strong> {hasFilters ? '✅ Yes' : '❌ No'}
        </div>

        <div
          style={{
            marginTop: '10px',
            fontSize: '12px',
            color: '#333',
            wordBreak: 'break-all'
          }}
        >
          <strong>Current Route:</strong> {location.pathname}
          {location.search}
        </div>
      </div>

      <div
        className="ag-theme-alpine"
        style={{ height: '400px', width: '100%' }}
      >
        <AgGridReact
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={params => setGridApi(params.api)}
          animateRows={true}
          rowSelection="multiple"
        />
      </div>

      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        <h4>Key Features of this Example:</h4>
        <ul>
          <li>
            <strong>User-controlled URL updates:</strong> Filters are only
            synced to URL when you click the button
          </li>
          <li>
            <strong>Automatic restoration:</strong> Filters are automatically
            applied when page loads with filter parameters
          </li>
          <li>
            <strong>Router integration:</strong> Uses React Router's navigate()
            to update the URL without page reload
          </li>
          <li>
            <strong>Persistent state:</strong> Browser refresh maintains your
            filter state
          </li>
        </ul>

        <h4>Try these example workflows:</h4>
        <ul>
          <li>
            Filter by name "John", then click "Update URL" - see URL change
          </li>
          <li>Refresh the page - notice filters are restored automatically</li>
          <li>Add status filter "active", then update URL again</li>
          <li>Copy and share the URL with someone else</li>
        </ul>
      </div>
    </div>
  )
}

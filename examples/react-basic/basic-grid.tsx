import React, { useState, useMemo } from 'react'
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

export default function BasicGrid() {
  const [gridApi, setGridApi] = useState<GridApi | null>(null)

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

  const defaultColDef = useMemo(
    () => ({
      flex: 1,
      minWidth: 100,
      resizable: true,
      sortable: true
    }),
    []
  )

  const handleShare = async () => {
    const url = shareUrl()
    try {
      await navigator.clipboard.writeText(url)
      alert('Filter URL copied to clipboard!\n\n' + url)
    } catch (err) {
      console.error('Failed to copy URL:', err)
      // Fallback: show URL in alert
      alert('Share this URL:\n\n' + url)
    }
  }

  const handleClearFilters = () => {
    clearFilters()
  }

  const handleApplyFilters = () => {
    applyUrlFilters()
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>AG Grid URL Sync - Basic React Example</h1>

      <div style={{ marginBottom: '20px' }}>
        <h3>Instructions:</h3>
        <ol>
          <li>Apply some text filters using the floating filter inputs</li>
          <li>Click "Share Filters" to copy a URL with your filters</li>
          <li>
            Open the URL in a new tab to see filters automatically applied
          </li>
          <li>Use "Clear Filters" to remove all filters</li>
        </ol>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={handleShare}
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
            📋 Share Filters
          </button>

          <button
            onClick={handleClearFilters}
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
            🗑️ Clear Filters
          </button>

          <button
            onClick={handleApplyFilters}
            style={{
              padding: '8px 16px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            🔄 Apply URL Filters
          </button>
        </div>

        <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
          <strong>Status:</strong> {isReady ? '✅ Ready' : '⏳ Loading...'} |
          <strong> Has Filters:</strong> {hasFilters ? '✅ Yes' : '❌ No'}
        </div>

        {currentUrl && (
          <div
            style={{
              marginTop: '10px',
              fontSize: '12px',
              color: '#333',
              wordBreak: 'break-all'
            }}
          >
            <strong>Current URL:</strong> {currentUrl}
          </div>
        )}
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
        <h4>Try these example filters:</h4>
        <ul>
          <li>
            <strong>Name contains "John":</strong> Filter the Name column with
            "John"
          </li>
          <li>
            <strong>Status equals "active":</strong> Filter the Status column
            with "active"
          </li>
          <li>
            <strong>Department contains "Eng":</strong> Filter the Department
            column with "Eng"
          </li>
        </ul>
      </div>
    </div>
  )
}

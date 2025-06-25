import React, { useState, useMemo } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { GridApi } from 'ag-grid-community'
import { useAGGridUrlSync } from 'ag-grid-url-sync/react'
import {
  employeeData,
  employeeColumnDefs,
  defaultColDef
} from '../shared-data.js'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

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

  const memoizedDefaultColDef = useMemo(() => defaultColDef, [])

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
          rowData={employeeData}
          columnDefs={employeeColumnDefs}
          defaultColDef={memoizedDefaultColDef}
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

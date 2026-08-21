import React, { useState, useMemo, useCallback, useRef } from 'react'
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

interface SerializationConfig {
  mode: 'individual' | 'grouped'
  format: 'querystring' | 'json' | 'base64'
}

export default function BasicGrid() {
  const [gridApi, setGridApi] = useState<GridApi | null>(null)
  const [config, setConfig] = useState<SerializationConfig>({
    mode: 'individual',
    format: 'querystring'
  })
  const [message, setMessage] = useState<string>('')

  const [viewName, setViewName] = useState<string>('')

  const showMessage = useCallback(
    (msg: string, type: 'success' | 'info' | 'error' = 'info') => {
      setMessage(msg)
      setTimeout(() => setMessage(''), 3000)
    },
    []
  )

  // Set by onError below. The hook reports failures synchronously during a view
  // operation, so handlers check this before claiming success. Otherwise the
  // success message overwrites the error the user needs to see.
  const errorReportedRef = useRef(false)

  // Create hook options based on current config
  const hookOptions = useMemo(
    () => ({
      autoApplyOnMount: true,
      // Presence of the key enables saved views and namespaces the storage.
      storageKey: 'employee-grid',
      paramPrefix: 'filter_',
      // Surface the hook's own errors to the user. Without this they only reach
      // the dev console, so a full-storage save would fail with no explanation.
      onError: (error: Error) => {
        errorReportedRef.current = true
        showMessage(error.message, 'error')
      },
      ...(config.mode === 'grouped' && {
        serialization: 'grouped' as const,
        format: config.format,
        groupedParam: 'grid_filters'
      })
    }),
    [config, showMessage]
  )

  const {
    shareUrl,
    applyUrlFilters,
    clearFilters,
    hasFilters,
    isReady,
    currentUrl,
    getFiltersAsFormat,
    getCurrentFormat,
    applyFilters,
    views,
    activeViewId,
    saveView,
    loadView,
    deleteView
  } = useAGGridUrlSync(gridApi, hookOptions)

  const memoizedDefaultColDef = useMemo(() => defaultColDef, [])

  const handleSaveView = useCallback(() => {
    // Check readiness here so that a null return below can only mean the hook
    // reported a reason through onError: no generic message overwriting it.
    // Name trimming and empty rejection are the library's job, not ours.
    if (!isReady) {
      showMessage(
        'The grid is still initialising. Try again in a moment.',
        'error'
      )
      return
    }

    const view = saveView(viewName)
    if (!view) return

    setViewName('')
    showMessage(`Saved view "${view.name}"`, 'success')
  }, [viewName, isReady, saveView, showMessage])

  const handleLoadView = useCallback(
    (id: string | null) => {
      errorReportedRef.current = false
      loadView(id)
      // A storage failure, or an id that no longer exists, already reported
      // through onError. Do not paper over it with a success message.
      if (errorReportedRef.current) return

      const name = views.find(view => view.id === id)?.name
      showMessage(
        name ? `Loaded view "${name}"` : 'Reset to unfiltered grid',
        'success'
      )
    },
    [loadView, views, showMessage]
  )

  const handleDeleteView = useCallback(
    (id: string) => {
      errorReportedRef.current = false
      deleteView(id)
      if (errorReportedRef.current) return

      showMessage('View deleted', 'info')
    },
    [deleteView, showMessage]
  )

  const handleShare = async () => {
    const url = shareUrl()
    try {
      await navigator.clipboard.writeText(url)
      showMessage(
        `✅ Filter URL copied to clipboard! (${config.mode} mode, ${config.format} format)`,
        'success'
      )
    } catch (err) {
      console.error('Failed to copy URL:', err)
      showMessage(`Share this URL: ${url}`, 'info')
    }
  }

  const handleApplyScenario = useCallback(
    (scenario: string) => {
      if (!gridApi) return

      let filters: Record<string, any> = {}

      switch (scenario) {
        // Text filter scenarios
        case 'sales':
          filters = {
            department: {
              filterType: 'text',
              type: 'equals',
              filter: 'Sales'
            }
          }
          break
        case 'engineering':
          filters = {
            department: {
              filterType: 'text',
              type: 'equals',
              filter: 'Engineering'
            },
            location: {
              filterType: 'text',
              type: 'contains',
              filter: 'San'
            }
          }
          break
        case 'support':
          filters = {
            department: {
              filterType: 'text',
              type: 'contains',
              filter: 'Support'
            }
          }
          break
        case 'startsWithFilter':
          filters = {
            name: {
              filterType: 'text',
              type: 'startsWith',
              filter: 'S'
            }
          }
          break
        case 'endsWithFilter':
          filters = {
            position: {
              filterType: 'text',
              type: 'endsWith',
              filter: 'er'
            }
          }
          break
        case 'notContainsFilter':
          filters = {
            name: {
              filterType: 'text',
              type: 'notContains',
              filter: 'a'
            }
          }
          break
        // Number filter scenarios
        case 'highSalary':
          filters = {
            salary: {
              filterType: 'number',
              type: 'greaterThanOrEqual',
              filter: 90000
            }
          }
          break
        case 'midSalary':
          filters = {
            salary: {
              filterType: 'number',
              type: 'inRange',
              filter: 60000,
              filterTo: 90000
            }
          }
          break
        case 'entrySalary':
          filters = {
            salary: {
              filterType: 'number',
              type: 'lessThan',
              filter: 65000
            }
          }
          break
        case 'exactSalary':
          filters = {
            salary: {
              filterType: 'number',
              type: 'equals',
              filter: 75000
            }
          }
          break
        case 'notEqualSalary':
          filters = {
            salary: {
              filterType: 'number',
              type: 'notEqual',
              filter: 60000
            }
          }
          break
        case 'executive':
          filters = {
            salary: {
              filterType: 'number',
              type: 'greaterThan',
              filter: 100000
            },
            performance: {
              filterType: 'text',
              type: 'equals',
              filter: 'Excellent'
            }
          }
          break
        case 'blankSalary':
          filters = {
            salary: {
              filterType: 'number',
              type: 'blank'
            }
          }
          break
        case 'notBlankSalary':
          filters = {
            salary: {
              filterType: 'number',
              type: 'notBlank'
            }
          }
          break
        // Date filter scenarios
        case 'dateEquals':
          filters = {
            hireDate: {
              filterType: 'date',
              type: 'equals',
              dateFrom: '2021-03-15'
            }
          }
          break
        case 'dateNotEqual':
          filters = {
            hireDate: {
              filterType: 'date',
              type: 'notEqual',
              dateFrom: '2020-07-22'
            }
          }
          break
        case 'dateBefore':
          filters = {
            hireDate: {
              filterType: 'date',
              type: 'lessThan',
              dateFrom: '2020-01-01'
            }
          }
          break
        case 'dateBeforeEq':
          filters = {
            hireDate: {
              filterType: 'date',
              type: 'lessThanOrEqual',
              dateFrom: '2021-09-05'
            }
          }
          break
        case 'dateAfter':
          filters = {
            hireDate: {
              filterType: 'date',
              type: 'greaterThan',
              dateFrom: '2022-01-01'
            }
          }
          break
        case 'dateAfterEq':
          filters = {
            hireDate: {
              filterType: 'date',
              type: 'greaterThanOrEqual',
              dateFrom: '2019-01-10'
            }
          }
          break
        case 'dateRange':
          filters = {
            hireDate: {
              filterType: 'date',
              type: 'inRange',
              dateFrom: '2020-01-01',
              dateTo: '2020-12-31'
            }
          }
          break
        case 'dateBlank':
          filters = {
            hireDate: {
              filterType: 'date',
              type: 'blank'
            }
          }
          break
        case 'dateNotBlank':
          filters = {
            hireDate: {
              filterType: 'date',
              type: 'notBlank'
            }
          }
          break
        default:
          return
      }

      if (applyFilters) {
        applyFilters(filters)
        showMessage(
          `Applied ${scenario.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} filter(s)`,
          'success'
        )
      }
    },
    [gridApi, applyFilters, showMessage]
  )

  const handleFormatTest = useCallback(() => {
    if (!getFiltersAsFormat || config.mode === 'individual') {
      showMessage('Format testing requires grouped mode', 'error')
      return
    }

    try {
      const querystring = getFiltersAsFormat('querystring')
      const json = getFiltersAsFormat('json')
      const base64 = getFiltersAsFormat('base64')

      const results = [
        `QueryString: ${querystring.length} chars`,
        `JSON: ${json.length} chars`,
        `Base64: ${base64.length} chars`
      ]

      showMessage(`Format comparison: ${results.join(', ')}`, 'info')
    } catch (error) {
      showMessage('Format test failed', 'error')
    }
  }, [getFiltersAsFormat, config.mode, showMessage])

  const handleConfigChange = useCallback(
    (newConfig: Partial<SerializationConfig>) => {
      setConfig(prev => ({ ...prev, ...newConfig }))
      showMessage(
        `Switched to ${newConfig.mode || config.mode} mode${newConfig.format ? ` with ${newConfig.format} format` : ''}`,
        'success'
      )
    },
    [config.mode, showMessage]
  )

  // Common style for scenario buttons
  const buttonStyle: React.CSSProperties = {
    padding: '8px 12px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    marginBottom: 4
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ color: '#1976d2', marginBottom: '10px' }}>
          🔗 AG Grid URL Sync - React Complete Demo
        </h1>
        <p style={{ color: '#666', fontSize: '16px', margin: 0 }}>
          Comprehensive demonstration of individual & grouped serialization with
          all filter types
        </p>
      </div>

      {/* Configuration Panel */}
      <div
        style={{
          background: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px'
        }}
      >
        <h3 style={{ margin: '0 0 15px 0', color: '#495057' }}>
          ⚙️ Serialization Configuration
        </h3>

        {/* Mode Selection */}
        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontWeight: 'bold', marginRight: '15px' }}>
            Mode:
          </label>
          {(['individual', 'grouped'] as const).map(mode => (
            <label
              key={mode}
              style={{ marginRight: '15px', cursor: 'pointer' }}
            >
              <input
                type="radio"
                checked={config.mode === mode}
                onChange={() => handleConfigChange({ mode })}
                style={{ marginRight: '5px' }}
              />
              {mode === 'individual'
                ? 'Individual (separate parameters)'
                : 'Grouped (single parameter)'}
            </label>
          ))}
        </div>

        {/* Format Selection */}
        <div
          style={{
            marginBottom: '15px',
            opacity: config.mode === 'individual' ? 0.5 : 1
          }}
        >
          <label style={{ fontWeight: 'bold', marginRight: '15px' }}>
            Format:
          </label>
          {(['querystring', 'json', 'base64'] as const).map(format => (
            <label
              key={format}
              style={{
                marginRight: '15px',
                cursor: config.mode === 'grouped' ? 'pointer' : 'not-allowed'
              }}
            >
              <input
                type="radio"
                checked={config.format === format}
                onChange={() => handleConfigChange({ format })}
                disabled={config.mode === 'individual'}
                style={{ marginRight: '5px' }}
              />
              {format}
            </label>
          ))}
        </div>

        {/* Info Display */}
        <div
          style={{
            background: '#e3f2fd',
            border: '1px solid #2196f3',
            borderRadius: '4px',
            padding: '10px',
            fontSize: '14px',
            color: '#1976d2'
          }}
        >
          {config.mode === 'individual' ? (
            <strong>Individual Mode:</strong>
          ) : (
            <strong>Grouped Mode ({config.format}):</strong>
          )}{' '}
          {config.mode === 'individual'
            ? 'Each filter creates a separate URL parameter'
            : `All filters packaged into a single parameter using ${config.format} encoding`}
        </div>
      </div>

      {/* Saved Views */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px'
        }}
      >
        <h3 style={{ margin: '0 0 5px 0', color: '#495057' }}>
          💾 Saved Views
        </h3>
        <p style={{ color: '#6c757d', fontSize: '14px', margin: '0 0 15px 0' }}>
          Filter the grid, name it, and save. Managed by the hook via its{' '}
          <code>storageKey</code> option. Stored in this browser only.
        </p>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            marginBottom: '15px'
          }}
        >
          <input
            type="text"
            value={viewName}
            onChange={event => setViewName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') handleSaveView()
            }}
            placeholder="View name, e.g. 'Engineering, high salary'"
            style={{
              flex: '1 1 260px',
              padding: '8px 10px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
          <button
            onClick={handleSaveView}
            disabled={!isReady}
            style={{
              padding: '8px 16px',
              backgroundColor: isReady ? '#198754' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isReady ? 'pointer' : 'not-allowed',
              fontWeight: 'bold'
            }}
          >
            💾 Save Current View
          </button>
        </div>

        {views.length === 0 ? (
          <div style={{ color: '#6c757d', fontSize: '14px' }}>
            No saved views yet.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleLoadView(null)}
              style={{
                ...buttonStyle,
                backgroundColor: activeViewId === null ? '#0d6efd' : '#e9ecef',
                color: activeViewId === null ? 'white' : '#212529',
                border:
                  activeViewId === null
                    ? '2px solid #0a58ca'
                    : '2px solid transparent'
              }}
            >
              ○ Unfiltered
            </button>

            {views.map(view => {
              const isActive = view.id === activeViewId
              return (
                <span
                  key={view.id}
                  style={{ display: 'inline-flex', marginBottom: 4 }}
                >
                  <button
                    onClick={() => handleLoadView(view.id)}
                    title={`${
                      Object.keys(view.filterModel).length
                    } filter(s) · saved ${new Date(
                      view.updatedAt
                    ).toLocaleString()}`}
                    style={{
                      ...buttonStyle,
                      marginBottom: 0,
                      borderRadius: '4px 0 0 4px',
                      backgroundColor: isActive ? '#0d6efd' : '#e9ecef',
                      color: isActive ? 'white' : '#212529',
                      border: isActive
                        ? '2px solid #0a58ca'
                        : '2px solid transparent'
                    }}
                  >
                    {isActive ? '● ' : '○ '}
                    {view.name}{' '}
                    <span style={{ opacity: 0.7 }}>
                      ({Object.keys(view.filterModel).length})
                    </span>
                  </button>
                  <button
                    onClick={() => handleDeleteView(view.id)}
                    title={`Delete "${view.name}"`}
                    aria-label={`Delete ${view.name}`}
                    style={{
                      ...buttonStyle,
                      marginBottom: 0,
                      borderRadius: '0 4px 4px 0',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      padding: '8px 10px'
                    }}
                  >
                    ×
                  </button>
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px'
        }}
      >
        <h3 style={{ margin: '0 0 15px 0', color: '#495057' }}>
          🎮 Controls & Testing
        </h3>

        {/* Primary Actions */}
        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleShare}
              disabled={!isReady}
              style={{
                padding: '10px 16px',
                backgroundColor: isReady ? '#007bff' : '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isReady ? 'pointer' : 'not-allowed',
                fontWeight: 'bold'
              }}
            >
              📋 Share URL
            </button>

            <button
              onClick={clearFilters}
              disabled={!hasFilters}
              style={{
                padding: '10px 16px',
                backgroundColor: hasFilters ? '#dc3545' : '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: hasFilters ? 'pointer' : 'not-allowed'
              }}
            >
              🗑️ Clear Filters
            </button>

            <button
              onClick={() => applyUrlFilters()}
              style={{
                padding: '10px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              🔄 Apply URL Filters
            </button>

            <button
              onClick={handleFormatTest}
              disabled={config.mode === 'individual'}
              style={{
                padding: '10px 16px',
                backgroundColor:
                  config.mode === 'grouped' ? '#17a2b8' : '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: config.mode === 'grouped' ? 'pointer' : 'not-allowed'
              }}
            >
              🔍 Test Formats
            </button>
          </div>
        </div>

        {/* Status Display */}
        <div
          style={{
            fontSize: '14px',
            color: '#495057',
            background: '#f8f9fa',
            padding: '10px',
            borderRadius: '4px',
            marginBottom: '15px'
          }}
        >
          <strong>Status:</strong> {isReady ? '✅ Ready' : '⏳ Loading...'} |
          <strong> Filters:</strong> {hasFilters ? '✅ Active' : '❌ None'} |
          <strong> Mode:</strong> {config.mode} |<strong> Format:</strong>{' '}
          {config.mode === 'grouped' ? config.format : 'N/A'}
        </div>

        {/* Message Display */}
        {message && (
          <div
            style={{
              background: '#d4edda',
              border: '1px solid #c3e6cb',
              borderRadius: '4px',
              padding: '10px',
              fontSize: '14px',
              color: '#155724',
              marginBottom: '15px'
            }}
          >
            {message}
          </div>
        )}

        {/* Current URL Display */}
        {currentUrl && (
          <div
            style={{
              background: '#f8f9fa',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              padding: '10px',
              fontSize: '12px',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              color: '#495057'
            }}
          >
            <strong>Current URL:</strong> {currentUrl}
          </div>
        )}
      </div>

      {/* Example Scenarios */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px'
        }}
      >
        <h3 style={{ margin: '0 0 15px 0', color: '#495057' }}>
          🎯 Example Scenarios
        </h3>
        <p style={{ color: '#6c757d', fontSize: '14px', margin: '0 0 15px 0' }}>
          Click buttons to apply pre-configured filter combinations
        </p>
        {/* Text Filter Scenarios */}
        <div style={{ marginBottom: '10px' }}>
          <strong>Text Filters:</strong>
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginTop: 4
            }}
          >
            <button
              onClick={() => handleApplyScenario('sales')}
              style={{
                ...buttonStyle,
                backgroundColor: '#1976d2',
                color: 'white'
              }}
            >
              💰 Sales Team
            </button>
            <button
              onClick={() => handleApplyScenario('engineering')}
              style={{
                ...buttonStyle,
                backgroundColor: '#388e3c',
                color: 'white'
              }}
            >
              ⚙️ Engineering
            </button>
            <button
              onClick={() => handleApplyScenario('support')}
              style={{
                ...buttonStyle,
                backgroundColor: '#6a1b9a',
                color: 'white'
              }}
            >
              🎧 Customer Support
            </button>
            <button
              onClick={() => handleApplyScenario('startsWithFilter')}
              style={{
                ...buttonStyle,
                backgroundColor: '#0288d1',
                color: 'white'
              }}
            >
              🚀 Starts With 'S'
            </button>
            <button
              onClick={() => handleApplyScenario('endsWithFilter')}
              style={{
                ...buttonStyle,
                backgroundColor: '#c2185b',
                color: 'white'
              }}
            >
              📍 Ends With 'er'
            </button>
            <button
              onClick={() => handleApplyScenario('notContainsFilter')}
              style={{
                ...buttonStyle,
                backgroundColor: '#fbc02d',
                color: 'black'
              }}
            >
              🚫 Not Contains 'a'
            </button>
          </div>
        </div>
        {/* Number Filter Scenarios */}
        <div style={{ marginBottom: '10px' }}>
          <strong>Number Filters:</strong>
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginTop: 4
            }}
          >
            <button
              onClick={() => handleApplyScenario('highSalary')}
              style={{
                ...buttonStyle,
                backgroundColor: '#388e3c',
                color: 'white'
              }}
            >
              💎 High Salary (≥$90K)
            </button>
            <button
              onClick={() => handleApplyScenario('midSalary')}
              style={{
                ...buttonStyle,
                backgroundColor: '#0288d1',
                color: 'white'
              }}
            >
              💰 Mid Salary ($60K-$90K)
            </button>
            <button
              onClick={() => handleApplyScenario('entrySalary')}
              style={{
                ...buttonStyle,
                backgroundColor: '#fbc02d',
                color: 'black'
              }}
            >
              🎯 Entry Level (&lt;$65K)
            </button>
            <button
              onClick={() => handleApplyScenario('exactSalary')}
              style={{
                ...buttonStyle,
                backgroundColor: '#6a1b9a',
                color: 'white'
              }}
            >
              🎯 Exact Salary ($75K)
            </button>
            <button
              onClick={() => handleApplyScenario('notEqualSalary')}
              style={{
                ...buttonStyle,
                backgroundColor: '#c2185b',
                color: 'white'
              }}
            >
              ❌ Not $60K
            </button>
            <button
              onClick={() => handleApplyScenario('executive')}
              style={{
                ...buttonStyle,
                backgroundColor: '#1976d2',
                color: 'white'
              }}
            >
              🕴️ Executive View (&gt;$100K + Excellent)
            </button>
            <button
              onClick={() => handleApplyScenario('blankSalary')}
              style={{
                ...buttonStyle,
                backgroundColor: '#757575',
                color: 'white'
              }}
            >
              🕳️ Blank Salary
            </button>
            <button
              onClick={() => handleApplyScenario('notBlankSalary')}
              style={{
                ...buttonStyle,
                backgroundColor: '#388e3c',
                color: 'white'
              }}
            >
              ✅ Not Blank Salary
            </button>
          </div>
        </div>
        {/* Date Filter Scenarios */}
        <div style={{ marginBottom: '10px' }}>
          <strong>Date Filters:</strong>
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginTop: 4
            }}
          >
            <button
              onClick={() => handleApplyScenario('dateEquals')}
              style={{
                ...buttonStyle,
                backgroundColor: '#1976d2',
                color: 'white'
              }}
            >
              📅 Hired On 2021-03-15
            </button>
            <button
              onClick={() => handleApplyScenario('dateNotEqual')}
              style={{
                ...buttonStyle,
                backgroundColor: '#c2185b',
                color: 'white'
              }}
            >
              ❌ Not Hired On 2020-07-22
            </button>
            <button
              onClick={() => handleApplyScenario('dateBefore')}
              style={{
                ...buttonStyle,
                backgroundColor: '#0288d1',
                color: 'white'
              }}
            >
              ⏪ Hired Before 2020-01-01
            </button>
            <button
              onClick={() => handleApplyScenario('dateBeforeEq')}
              style={{
                ...buttonStyle,
                backgroundColor: '#388e3c',
                color: 'white'
              }}
            >
              ⏮️ Hired On/Before 2021-09-05
            </button>
            <button
              onClick={() => handleApplyScenario('dateAfter')}
              style={{
                ...buttonStyle,
                backgroundColor: '#fbc02d',
                color: 'black'
              }}
            >
              ⏩ Hired After 2022-01-01
            </button>
            <button
              onClick={() => handleApplyScenario('dateAfterEq')}
              style={{
                ...buttonStyle,
                backgroundColor: '#6a1b9a',
                color: 'white'
              }}
            >
              ⏭️ Hired On/After 2019-01-10
            </button>
            <button
              onClick={() => handleApplyScenario('dateRange')}
              style={{
                ...buttonStyle,
                backgroundColor: '#1976d2',
                color: 'white'
              }}
            >
              🔄 Hired in 2020
            </button>
            <button
              onClick={() => handleApplyScenario('dateBlank')}
              style={{
                ...buttonStyle,
                backgroundColor: '#757575',
                color: 'white'
              }}
            >
              🕳️ Hire Date Blank
            </button>
            <button
              onClick={() => handleApplyScenario('dateNotBlank')}
              style={{
                ...buttonStyle,
                backgroundColor: '#388e3c',
                color: 'white'
              }}
            >
              ✅ Hire Date Not Blank
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px'
        }}
      >
        <h3 style={{ margin: '0 0 15px 0', color: '#495057' }}>
          📊 Employee Data Grid
        </h3>
        <div
          className="ag-theme-alpine"
          style={{ height: '500px', width: '100%' }}
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
      </div>

      {/* Instructions & Examples */}
      <div
        style={{
          background: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          padding: '20px'
        }}
      >
        <h3 style={{ margin: '0 0 15px 0', color: '#495057' }}>
          📚 How to Use
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px'
          }}
        >
          <div>
            <h4 style={{ color: '#007bff', marginTop: 0 }}>📝 Text Filters</h4>
            <ul style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
              <li>
                <strong>Name contains "John":</strong> Type "John" in Name
                filter
              </li>
              <li>
                <strong>Email starts with "j":</strong> Use "j" in Email filter
              </li>
              <li>
                <strong>Department equals "Engineering":</strong> Filter by
                exact department
              </li>
              <li>
                <strong>Status not equals "inactive":</strong> Exclude inactive
                users
              </li>
            </ul>
          </div>

          <div>
            <h4 style={{ color: '#28a745', marginTop: 0 }}>
              🔢 Number Filters
            </h4>
            <ul style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
              <li>
                <strong>Salary &gt; $80,000:</strong> Set salary greater than
                80000
              </li>
              <li>
                <strong>Age between 25-35:</strong> Use range filter on age
              </li>
              <li>
                <strong>Experience ≥ 5 years:</strong> Filter experience ≥ 5
              </li>
              <li>
                <strong>Salary is blank:</strong> Find employees with missing
                salary
              </li>
            </ul>
          </div>

          <div>
            <h4 style={{ color: '#17a2b8', marginTop: 0 }}>
              🔄 Serialization Features
            </h4>
            <ul style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
              <li>
                <strong>Individual Mode:</strong> Each filter = separate URL
                param
              </li>
              <li>
                <strong>Grouped Mode:</strong> All filters in single param
              </li>
              <li>
                <strong>Format Options:</strong> QueryString, JSON, or Base64
              </li>
              <li>
                <strong>Auto-Detection:</strong> URLs parsed automatically
              </li>
            </ul>
          </div>

          <div>
            <h4 style={{ color: '#ffc107', marginTop: 0 }}>⚡ Quick Actions</h4>
            <ul style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
              <li>
                <strong>Share URL:</strong> Copy current filter state to
                clipboard
              </li>
              <li>
                <strong>Apply Scenarios:</strong> Use pre-built filter
                combinations
              </li>
              <li>
                <strong>Test Formats:</strong> Compare URL lengths across
                formats
              </li>
              <li>
                <strong>Switch Modes:</strong> Toggle between individual/grouped
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

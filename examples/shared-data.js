// Shared sample data for all examples
// This ensures consistency across React and vanilla JS demos

export const employeeData = [
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

export const employeeColumnDefs = [
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

// Additional sample data for multi-grid demos
export const projectData = [
  {
    id: 'P001',
    name: 'Customer Portal',
    status: 'Active',
    priority: 'High',
    startDate: '2024-01-15',
    budget: 150000
  },
  {
    id: 'P002',
    name: 'Mobile App Redesign',
    status: 'Completed',
    priority: 'Medium',
    startDate: '2023-10-01',
    budget: 80000
  },
  {
    id: 'P003',
    name: 'Data Migration',
    status: 'Active',
    priority: 'Critical',
    startDate: '2024-02-01',
    budget: 200000
  },
  {
    id: 'P004',
    name: 'API Integration',
    status: 'Planning',
    priority: 'Medium',
    startDate: '2024-03-15',
    budget: 120000
  },
  {
    id: 'P005',
    name: 'Security Audit',
    status: 'Completed',
    priority: 'High',
    startDate: '2023-12-01',
    budget: 60000
  }
]

export const projectColumnDefs = [
  { field: 'id', headerName: 'Project ID', width: 100 },
  {
    field: 'name',
    headerName: 'Project Name',
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
    field: 'priority',
    headerName: 'Priority',
    filter: 'agTextColumnFilter',
    floatingFilter: true,
    width: 100
  },
  {
    field: 'startDate',
    headerName: 'Start Date',
    filter: 'agDateColumnFilter',
    floatingFilter: true,
    width: 120
  },
  {
    field: 'budget',
    headerName: 'Budget',
    filter: 'agNumberColumnFilter',
    floatingFilter: true,
    width: 120,
    valueFormatter: params => `$${params.value?.toLocaleString()}`
  }
]

// Simple data for basic demos
export const simpleData = [
  { name: 'John Smith', age: 32, city: 'New York' },
  { name: 'Jane Doe', age: 27, city: 'San Francisco' },
  { name: 'Bob Johnson', age: 45, city: 'Chicago' },
  { name: 'Alice Brown', age: 29, city: 'Boston' },
  { name: 'Charlie Wilson', age: 38, city: 'Seattle' }
]

export const simpleColumnDefs = [
  {
    field: 'name',
    headerName: 'Name',
    filter: 'agTextColumnFilter',
    filterParams: {
      filterOptions: ['contains', 'equals'],
      defaultOption: 'contains'
    }
  },
  {
    field: 'age',
    headerName: 'Age',
    filter: 'agNumberColumnFilter',
    filterParams: {
      filterOptions: ['equals', 'greaterThan', 'lessThan'],
      defaultOption: 'equals'
    }
  },
  {
    field: 'city',
    headerName: 'City',
    filter: 'agTextColumnFilter',
    filterParams: {
      filterOptions: ['contains', 'equals'],
      defaultOption: 'contains'
    }
  }
]

// Default column definition that can be shared across examples
export const defaultColDef = {
  flex: 1,
  minWidth: 100,
  resizable: true,
  sortable: true
}

// Shared sample data for all examples
// This ensures consistency across React and vanilla JS demos

export const employeeData = [
  {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    status: 'active',
    department: 'Engineering',
    salary: 85000,
    age: 32,
    experience: 8
  },
  {
    id: 2,
    name: 'Jane Smith',
    email: 'jane@example.com',
    status: 'inactive',
    department: 'Marketing',
    salary: 72000,
    age: 28,
    experience: 5
  },
  {
    id: 3,
    name: 'Bob Johnson',
    email: 'bob@example.com',
    status: 'active',
    department: 'Sales',
    salary: 68000,
    age: 35,
    experience: 12
  },
  {
    id: 4,
    name: 'Alice Brown',
    email: 'alice@example.com',
    status: 'active',
    department: 'Engineering',
    salary: 95000,
    age: 29,
    experience: 7
  },
  {
    id: 5,
    name: 'Charlie Wilson',
    email: 'charlie@example.com',
    status: 'inactive',
    department: 'HR',
    salary: 58000,
    age: 42,
    experience: 15
  },
  {
    id: 6,
    name: 'Diana Davis',
    email: 'diana@example.com',
    status: 'active',
    department: 'Marketing',
    salary: 75000,
    age: 31,
    experience: 6
  },
  {
    id: 7,
    name: 'Edward Miller',
    email: 'edward@example.com',
    status: 'active',
    department: 'Sales',
    salary: 82000,
    age: 38,
    experience: 14
  },
  {
    id: 8,
    name: 'Fiona Garcia',
    email: 'fiona@example.com',
    status: 'inactive',
    department: 'Engineering',
    salary: 78000,
    age: 26,
    experience: 3
  },
  {
    id: 9,
    name: 'Sam Wilson',
    email: 'sam@example.com',
    status: 'active',
    department: 'Design',
    salary: null, // For demonstrating blank filters
    age: 30,
    experience: 4
  },
  {
    id: 10,
    name: 'Alex Johnson',
    email: 'alex@example.com',
    status: 'active',
    department: 'Operations',
    salary: 65000,
    age: 33,
    experience: 9
  }
]

export const employeeColumnDefs = [
  { field: 'id', headerName: 'ID', width: 80 },
  {
    field: 'name',
    headerName: 'Name',
    filter: 'agTextColumnFilter',
    floatingFilter: true,
    width: 150,
    filterParams: {
      filterOptions: [
        'equals',
        'notEqual',
        'contains',
        'notContains',
        'startsWith',
        'endsWith'
      ],
      defaultOption: 'contains'
    }
  },
  {
    field: 'email',
    headerName: 'Email',
    filter: 'agTextColumnFilter',
    floatingFilter: true,
    width: 200,
    filterParams: {
      filterOptions: ['contains', 'startsWith', 'endsWith'],
      defaultOption: 'contains'
    }
  },
  {
    field: 'status',
    headerName: 'Status',
    filter: 'agTextColumnFilter',
    floatingFilter: true,
    width: 120,
    filterParams: {
      filterOptions: ['equals', 'notEqual'],
      defaultOption: 'equals'
    }
  },
  {
    field: 'department',
    headerName: 'Department',
    filter: 'agTextColumnFilter',
    floatingFilter: true,
    width: 150,
    filterParams: {
      filterOptions: ['equals', 'contains'],
      defaultOption: 'equals'
    }
  },
  {
    field: 'salary',
    headerName: 'Salary',
    filter: 'agNumberColumnFilter',
    floatingFilter: true,
    width: 130,
    valueFormatter: params =>
      params.value ? `$${params.value.toLocaleString()}` : 'N/A',
    filterParams: {
      filterOptions: [
        'equals',
        'notEqual',
        'greaterThan',
        'greaterThanOrEqual',
        'lessThan',
        'lessThanOrEqual',
        'inRange',
        'blank',
        'notBlank'
      ],
      defaultOption: 'greaterThan'
    }
  },
  {
    field: 'age',
    headerName: 'Age',
    filter: 'agNumberColumnFilter',
    floatingFilter: true,
    width: 100,
    filterParams: {
      filterOptions: ['equals', 'greaterThan', 'lessThan', 'inRange'],
      defaultOption: 'equals'
    }
  },
  {
    field: 'experience',
    headerName: 'Experience (Years)',
    filter: 'agNumberColumnFilter',
    floatingFilter: true,
    width: 160,
    filterParams: {
      filterOptions: [
        'equals',
        'greaterThan',
        'greaterThanOrEqual',
        'lessThan',
        'inRange'
      ],
      defaultOption: 'greaterThan'
    }
  }
]

// Additional sample data for demos
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
    floatingFilter: true,
    filterParams: {
      // Allow all text filter operations to showcase the complete functionality
      filterOptions: [
        'equals',
        'notEqual',
        'contains',
        'notContains',
        'startsWith',
        'endsWith',
        'blank',
        'notBlank'
      ],
      defaultOption: 'contains'
    }
  },
  {
    field: 'age',
    headerName: 'Age',
    filter: 'agNumberColumnFilter',
    floatingFilter: true,
    filterParams: {
      filterOptions: ['equals', 'greaterThan', 'lessThan'],
      defaultOption: 'equals'
    }
  },
  {
    field: 'city',
    headerName: 'City',
    filter: 'agTextColumnFilter',
    floatingFilter: true,
    filterParams: {
      // Allow all text filter operations to showcase the complete functionality
      filterOptions: [
        'equals',
        'notEqual',
        'contains',
        'notContains',
        'startsWith',
        'endsWith',
        'blank',
        'notBlank'
      ],
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

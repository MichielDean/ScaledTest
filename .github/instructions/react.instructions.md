---
applyTo: "frontend/src/**/*.{tsx,jsx}"
---

# React Component Development Standards

Guidelines for building React components in the ScaledTest project.

---

## Purpose & Scope

This file applies to all React component files (`.tsx`, `.jsx`) in `frontend/src/`.

---

## Component Structure

**ALWAYS use functional components with hooks:**

```typescript
// ✅ CORRECT - Modern functional component
import React, { useState, useCallback } from 'react';

interface ButtonProps {
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
  disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  onClick,
  variant = 'primary',
  children,
  disabled = false
}) => {
  const baseClasses = 'px-4 py-2 rounded-lg font-medium transition-colors';
  const variantClasses = variant === 'primary'
    ? 'bg-blue-600 hover:bg-blue-700 text-white'
    : 'bg-gray-200 hover:bg-gray-300 text-gray-800';

  return (
    <button
      id="action-button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses}`}
    >
      {children}
    </button>
  );
};

export default Button;

// ❌ WRONG - Class components
class Button extends React.Component {
  render() {
    return <button>{this.props.children}</button>;
  }
}
```

---

## Styling with Tailwind CSS

**ALWAYS use Tailwind CSS utility classes:**

```typescript
// ✅ CORRECT - Tailwind utilities
const Card: React.FC<CardProps> = ({ title, children }) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <h2 className="text-2xl font-bold mb-4 text-gray-900">{title}</h2>
      <div className="text-gray-700">{children}</div>
    </div>
  );
};

// ❌ WRONG - Inline styles or custom CSS
const Card: React.FC<CardProps> = ({ title, children }) => {
  return (
    <div style={{ backgroundColor: 'white', padding: '24px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{title}</h2>
      <div>{children}</div>
    </div>
  );
};
```

**Responsive design:**

```typescript
// ✅ CORRECT - Mobile-first responsive classes
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <div className="text-sm md:text-base lg:text-lg">Content</div>
</div>
```

---

## State Management

**Use hooks for state management:**

```typescript
// ✅ CORRECT - Proper state management
const UserForm: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Derived state
  const isValid = formData.name && formData.email;
  const hasErrors = Object.keys(errors).length > 0;

  const handleInputChange = useCallback((field: keyof FormData) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormData(prev => ({ ...prev, [field]: event.target.value }));

      // Clear field errors
      if (errors[field]) {
        setErrors(prev => {
          const { [field]: removed, ...rest } = prev;
          return rest;
        });
      }
    }, [errors]
  );

  return (/* JSX */);
};
```

---

## Event Handlers

**Use useCallback for event handlers:**

```typescript
// ✅ CORRECT - Memoized event handlers
const handleSubmit = useCallback(async (event: React.FormEvent) => {
  event.preventDefault();

  if (!formData.email || !formData.password) {
    setErrors({ form: "Email and password are required" });
    return;
  }

  try {
    setIsLoading(true);
    await onSubmit(formData);
    logger.info("Form submitted successfully");
  } catch (error) {
    logger.error("Form submission failed", { error });
    setErrors({ form: "Submission failed. Please try again." });
  } finally {
    setIsLoading(false);
  }
}, [formData, onSubmit]);

// ❌ WRONG - Inline event handlers
<button onClick={async () => {
  setIsLoading(true);
  await onSubmit(formData);
  setIsLoading(false);
}}>
  Submit
</button>
```

---

## Performance Optimization

**Use React.memo for pure components:**

```typescript
// ✅ CORRECT - Memoized component
const UserCard = React.memo<UserCardProps>(({ user, onEdit }) => {
  return (
    <div className="p-4 border rounded">
      <h3>{user.name}</h3>
      <button id={`edit-${user.id}`} onClick={() => onEdit(user.id)}>
        Edit
      </button>
    </div>
  );
});
```

**Use useMemo for expensive calculations:**

```typescript
// ✅ CORRECT - Memoized calculations
const processedData = useMemo(() => {
  if (!Array.isArray(rawData)) return [];

  return rawData
    .filter((item) => item?.isActive === true)
    .map((item) => ({
      id: item.id,
      displayName: item.name || "Unknown",
      value: Number(item.value) || 0,
    }))
    .sort((a, b) => b.value - a.value);
}, [rawData]);

// ❌ WRONG - Recalculating on every render
const processedData = rawData
  .filter((item) => item.isActive)
  .map((item) => ({ ...item }))
  .sort((a, b) => b.value - a.value);
```

---

## Accessibility

**ALWAYS add IDs to interactive elements:**

```typescript
// ✅ CORRECT - IDs on all interactive elements
<form id="login-form" onSubmit={handleSubmit}>
  <input
    id="email-input"
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
  <input
    id="password-input"
    type="password"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
  />
  <button id="submit-button" type="submit">Login</button>
</form>

// ❌ WRONG - Missing IDs
<form onSubmit={handleSubmit}>
  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
  <button type="submit">Login</button>
</form>
```

**Use semantic HTML:**

```typescript
// ✅ CORRECT - Semantic HTML
<nav id="main-nav">
  <ul>
    <li><a id="home-link" href="/">Home</a></li>
    <li><a id="about-link" href="/about">About</a></li>
  </ul>
</nav>

// ❌ WRONG - Generic divs
<div id="nav">
  <div>
    <div onClick={() => navigate('/')}>Home</div>
    <div onClick={() => navigate('/about')}>About</div>
  </div>
</div>
```

**Add ARIA attributes when needed:**

```typescript
// ✅ CORRECT - Proper ARIA attributes
<button
  id="menu-button"
  aria-expanded={isOpen}
  aria-controls="menu-panel"
  onClick={toggleMenu}
>
  Menu
</button>

<div id="menu-panel" role="menu" aria-labelledby="menu-button">
  {/* Menu items */}
</div>
```

---

## Error Boundaries

**Implement error boundaries for components:**

```typescript
// ✅ CORRECT - Error boundary pattern
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType<{ error: Error }> },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('Component error boundary triggered', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error!} />;
    }

    return this.props.children;
  }
}
```

---

## Authentication Integration

**Use authentication hooks:**

```typescript
// ✅ CORRECT - Use authentication context
import { useAuth } from '../contexts/AuthContext';

const DashboardPage: React.FC = () => {
  const { user, hasRole } = useAuth();

  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <div>
      <h1>Welcome, {user.name}</h1>
      {hasRole(UserRole.Admin) && (
        <AdminPanel />
      )}
    </div>
  );
};

// Protect routes with HOC
export default withAuth(DashboardPage, [UserRole.User, UserRole.Admin]);
```

---

## Dependency Injection with Context

**ALWAYS use injectable API services via context for testability:**

### Using the ApiProvider

```typescript
// ✅ CORRECT - Use injectable API context
import { useApi, useTestResultsApi } from '../contexts/ApiContext';

const TestResultsPage: React.FC = () => {
  const { testResults } = useApi();
  // or use the specialized hook:
  // const testResults = useTestResultsApi();

  const [results, setResults] = useState<TestRun[]>([]);

  useEffect(() => {
    const fetchResults = async () => {
      const response = await testResults.getTestRuns({ page: 1, pageSize: 20 });
      if (response.data) {
        setResults(response.data.results);
      }
    };
    fetchResults();
  }, [testResults]);

  return (/* JSX */);
};

// ❌ WRONG - Direct API imports (not testable)
import { api } from '../lib/api';

const TestResultsPage: React.FC = () => {
  useEffect(() => {
    api.getTestRuns().then(setResults);  // Hard to mock in tests
  }, []);
};
```

### API Interface Definition

```typescript
// contexts/ApiContext.tsx
export interface TestResultsApi {
  uploadTestResults: (data: UploadRequest) => Promise<ApiResponse<UploadResponse>>;
  getTestResults: (runId: string) => Promise<ApiResponse<TestResults>>;
  getTestRuns: (params: ListParams) => Promise<ApiResponse<PaginatedTestRuns>>;
  getTestStatistics: (projectId: string) => Promise<ApiResponse<TestStatistics>>;
}

export interface UserApi {
  getUser: (userId: string) => Promise<ApiResponse<User>>;
  updateUser: (userId: string, data: UpdateUserRequest) => Promise<ApiResponse<User>>;
  listUsers: (params: ListParams) => Promise<ApiResponse<PaginatedUsers>>;
}
```

### Testing with Mocked APIs

```typescript
// __tests__/TestResultsPage.test.tsx
import { renderWithProviders, createMockTestResultsApi } from '../__tests__/utils/test-utils';

describe('TestResultsPage', () => {
  it('displays test results', async () => {
    const mockApi = createMockTestResultsApi({
      getTestRuns: vi.fn().mockResolvedValue({
        data: {
          results: [{ id: 'run-1', status: 'completed' }],
          total_count: 1,
        },
      }),
    });

    const { getByText } = renderWithProviders(<TestResultsPage />, {
      testResultsApi: mockApi,
    });

    await waitFor(() => {
      expect(getByText('completed')).toBeInTheDocument();
    });
  });
});
```

---

## Loading and Error States

**ALWAYS handle loading and error states:**

```typescript
// ✅ CORRECT - Comprehensive state handling
const UserList: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await userService.getAll();
        setUsers(Array.isArray(data) ? data : []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load users';
        setError(message);
        logger.error('Failed to fetch users', { error: err });
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
};

// ❌ WRONG - No loading/error handling
const UserList: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    userService.getAll().then(setUsers);
  }, []);

  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
};
```

---

## Example

```typescript
// ✅ CORRECT - Complete React component pattern
import React, { useState, useCallback, useEffect } from 'react';
import { logger } from '../lib/logger';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

const UserManagementPage: React.FC = () => {
  const { hasRole, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch('/api/users');

        if (!response.ok) {
          throw new Error('Failed to fetch users');
        }

        const data = await response.json();
        setUsers(Array.isArray(data) ? data : []);
        logger.info('Users fetched successfully', { count: data.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        logger.error('Failed to fetch users', { error: err });
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // Handle user deletion
  const handleDelete = useCallback(async (userId: string) => {
    try {
      await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      setUsers(prev => prev.filter(u => u.id !== userId));
      logger.info('User deleted', { userId });
    } catch (err) {
      logger.error('Failed to delete user', { error: err, userId });
      setError('Failed to delete user');
    }
  }, []);

  // Render loading state
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Render error state
  if (error) {
    return <ErrorMessage message={error} />;
  }

  // Render user list
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">User Management</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map(user => (
          <div
            key={user.id}
            id={`user-card-${user.id}`}
            className="bg-white rounded-lg shadow p-4"
          >
            <h2 className="text-xl font-semibold">{user.name}</h2>
            <p className="text-gray-600">{user.email}</p>
            <p className="text-sm text-gray-500">{user.role}</p>

            {hasRole('admin') && user.id !== currentUser?.id && (
              <button
                id={`delete-user-${user.id}`}
                onClick={() => handleDelete(user.id)}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserManagementPage;
```

---
applyTo: "**/*.{ts,tsx}"
---

# TypeScript Coding Standards

Guidelines for TypeScript code in the ScaledTest project.

---

## Purpose & Scope

This file applies to all TypeScript and TSX files in the repository.

---

## Naming Conventions

- Use `camelCase` for variables and functions
- Use `PascalCase` for classes, interfaces, and type names
- Use `UPPER_SNAKE_CASE` for constants
- Prefix interfaces with `I` only when necessary to avoid name conflicts
- Use descriptive names that indicate purpose

---

## Type Definitions

**NEVER use `any` type** - Always specify proper types:

```typescript
// ✅ CORRECT - Proper typing
interface UserData {
  id: number;
  name: string;
  email: string;
}

function processUserData(data: UserData): string {
  return data.name;
}

// ❌ WRONG - Using any
function processData(data: any): any {
  return data.someProperty;
}
```

**Check for existing types before creating new ones:**

- Search `frontend/src/types/` directory first
- Use semantic search or grep to find similar type definitions
- Extend existing types when appropriate: `interface ExtendedUser extends UserData`
- Group related types in the same file

---

## Import Management

**ALWAYS remove unused imports immediately:**

```typescript
// ✅ CORRECT - Only import what you use
import React, { useState } from "react";
import { logger } from "../logging/logger";
import { UserData } from "../types/user";

// ❌ WRONG - Unused imports
import React, { useState, useEffect } from "react"; // useEffect not used
import { SomeUnusedType } from "./types"; // unused import
```

---

## Variable Declaration

**Remove unused variables and constants:**

```typescript
// ✅ CORRECT - Declare only used variables
const [data, setData] = useState<UserData | null>(null);
const isLoading = data === null;

// ❌ WRONG - Unused variables
const [data, setData] = useState(null);
const unusedVar = "test"; // unused
const [loading, setLoading] = useState(false); // setLoading never called
```

**Prefix unused parameters with underscore:**

```typescript
// ✅ CORRECT - Underscore for intentionally unused parameters
function processData(data: UserData, _metadata?: MetaData): string {
  return data.name;
}

// ❌ WRONG - Unused parameters without prefix
function processData(data: UserData, metadata: MetaData): string {
  return data.name; // metadata unused
}
```

---

## Logging

**NEVER use console methods** - Use structured logger:

```typescript
// ✅ CORRECT - Structured logger
import { logger } from "../logging/logger";

logger.debug("Debug message", { context: "additional-data" });
logger.info("Operation completed", { userId: user.id });
logger.error("Error occurred", { error, module: "component-name" });

// ❌ WRONG - Console usage
console.log("Debug message");
console.error("Error occurred");
```

---

## Code Style

- Prefer `const` over `let` when variables are not reassigned
- Use arrow functions for callbacks
- Limit line length to 100 characters
- Use template literals for string concatenation
- Use optional chaining and nullish coalescing

**Code Examples:**

```typescript
// ✅ CORRECT - Modern TypeScript patterns
const getUserName = (user: User | null): string => {
  return user?.name ?? "Unknown";
};

const formatMessage = (name: string, count: number): string => {
  return `Hello ${name}, you have ${count} messages`;
};

// ❌ WRONG - Old patterns
function getUserName(user: User | null): string {
  if (user && user.name) {
    return user.name;
  }
  return "Unknown";
}

const formatMessage = function (name: string, count: number): string {
  return "Hello " + name + ", you have " + count + " messages";
};
```

---

## Error Handling

- Always handle promise rejections with `try/catch` or `.catch()`
- Use custom error classes for application-specific errors
- Provide meaningful error messages
- Log errors with context

**Error Handling Pattern:**

```typescript
// ✅ CORRECT - Proper error handling
const fetchUserData = async (userId: string): Promise<UserData> => {
  try {
    const response = await fetch(`/api/users/${userId}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch user: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    logger.error("User fetch failed", { error, userId });
    throw error;
  }
};

// ❌ WRONG - Unhandled errors
const fetchUserData = async (userId: string): Promise<UserData> => {
  const response = await fetch(`/api/users/${userId}`);
  return await response.json();
};
```

---

## Safe Property Access

**ALWAYS use defensive programming:**

```typescript
// ✅ CORRECT - Safe access
const userName = user?.profile?.name || "Unknown";
const items = Array.isArray(data) ? data : [];
const total = items.reduce((acc, item) => acc + (item?.value || 0), 0);

// ❌ WRONG - Unsafe access
const userName = user.profile.name;
const total = data.reduce((acc, item) => acc + item.value, 0);
```

**Patterns to follow:**

- Use optional chaining: `obj?.nested?.property`
- Check arrays with `Array.isArray()` before operations
- Provide fallback values: `|| defaultValue` or `?? defaultValue`
- Validate API responses before accessing properties

---

## ESLint Compliance

**NEVER use `eslint-disable` comments** - Fix linting errors properly:

- Remove unused variables and imports
- Add proper type annotations
- Use proper TypeScript patterns
- Implement proper error handling
- Use semantic variable and function names

**Common ESLint violations to prevent:**

1. `no-console` - Use structured logger instead
2. `@typescript-eslint/no-explicit-any` - Define proper interfaces
3. `@typescript-eslint/no-unused-vars` - Remove unused code

---

## Example

```typescript
// ✅ CORRECT - Complete TypeScript pattern
import React, { useState, useCallback } from 'react';
import { logger } from '../lib/logger';

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserFormProps {
  onSubmit: (user: User) => Promise<void>;
}

const UserForm: React.FC<UserFormProps> = ({ onSubmit }) => {
  const [formData, setFormData] = useState<Partial<User>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.name || !formData.email) {
      logger.warn("Form validation failed", { formData });
      return;
    }

    try {
      setIsLoading(true);
      await onSubmit(formData as User);
      logger.info("User submitted successfully", { userId: formData.id });
    } catch (error) {
      logger.error("User submission failed", { error, formData });
    } finally {
      setIsLoading(false);
    }
  }, [formData, onSubmit]);

  return (
    <form id="user-form" onSubmit={handleSubmit}>
      <input
        id="name-input"
        type="text"
        value={formData.name || ''}
        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
        disabled={isLoading}
      />
      <button id="submit-button" type="submit" disabled={isLoading}>
        {isLoading ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
};

export default UserForm;
```

---

## Dependency Injection

Use React Context for dependency injection to enable testability:

### Interface-Based Design

**Define interfaces for services:**

```typescript
// ✅ CORRECT - Service interface
interface UserApi {
  getUser(id: string): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  listUsers(page: number): Promise<User[]>;
}

// Implementation
const createUserApi = (baseUrl: string): UserApi => ({
  getUser: async (id) => {
    const response = await fetch(`${baseUrl}/users/${id}`);
    return response.json();
  },
  updateUser: async (id, data) => {
    const response = await fetch(`${baseUrl}/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.json();
  },
  listUsers: async (page) => {
    const response = await fetch(`${baseUrl}/users?page=${page}`);
    return response.json();
  },
});
```

### Context-Based DI

**Create injectable context:**

```typescript
// ✅ CORRECT - API Context for dependency injection
import React, { createContext, useContext, useMemo } from 'react';

interface ApiContextValue {
  userApi: UserApi;
  projectApi: ProjectApi;
}

const ApiContext = createContext<ApiContextValue | null>(null);

// Provider with real implementations
export const ApiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useMemo(() => ({
    userApi: createUserApi(import.meta.env.VITE_API_URL),
    projectApi: createProjectApi(import.meta.env.VITE_API_URL),
  }), []);

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
};

// Hook for consuming APIs
export const useApi = (): ApiContextValue => {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi must be used within ApiProvider');
  }
  return context;
};
```

### Using Injected Dependencies

**Components receive dependencies via hooks:**

```typescript
// ✅ CORRECT - Component using injected API
const UserList: React.FC = () => {
  const { userApi } = useApi();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    userApi.listUsers(1).then(setUsers);
  }, [userApi]);

  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
};
```

### Testing with Mock Implementations

**Create mock factories for testing:**

```typescript
// ✅ CORRECT - Mock factory for testing
const createMockUserApi = (overrides?: Partial<UserApi>): UserApi => ({
  getUser: vi.fn().mockResolvedValue({ id: '1', name: 'Test User' }),
  updateUser: vi.fn().mockResolvedValue({ id: '1', name: 'Updated' }),
  listUsers: vi.fn().mockResolvedValue([{ id: '1', name: 'User 1' }]),
  ...overrides,
});

// Test with mock injection
describe('UserList', () => {
  it('displays users from API', async () => {
    const mockUserApi = createMockUserApi({
      listUsers: vi.fn().mockResolvedValue([
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ]),
    });

    render(
      <TestApiProvider userApi={mockUserApi}>
        <UserList />
      </TestApiProvider>
    );

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(mockUserApi.listUsers).toHaveBeenCalledWith(1);
  });
});
```

### Test Provider Helper

**Create a test wrapper that accepts mock implementations:**

```typescript
// ✅ CORRECT - Test provider for dependency injection
interface TestApiProviderProps {
  children: React.ReactNode;
  userApi?: UserApi;
  projectApi?: ProjectApi;
}

export const TestApiProvider: React.FC<TestApiProviderProps> = ({
  children,
  userApi = createMockUserApi(),
  projectApi = createMockProjectApi(),
}) => {
  const value = useMemo(() => ({ userApi, projectApi }), [userApi, projectApi]);
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
};

// Custom render with test provider
export const renderWithProviders = (
  ui: React.ReactElement,
  options?: { userApi?: UserApi; projectApi?: ProjectApi }
) => {
  return render(
    <TestApiProvider {...options}>{ui}</TestApiProvider>
  );
};
```

### Benefits

- **Testability**: Easily mock API dependencies in unit tests
- **Flexibility**: Swap implementations without changing components
- **Type Safety**: Full TypeScript support for interfaces
- **Separation**: Business logic separated from API implementation

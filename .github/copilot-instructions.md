# ScaledTest Project - GitHub Copilot Instructions

## Code Generation Best Practices

**When generating any TypeScript code, ALWAYS follow these patterns to prevent common ESLint violations:**

1. **Import Management:**

   ```typescript
   // ✅ CORRECT - Only import what you use
   import React, { useState } from 'react';
   import { logger } from '../logging/logger';
   import { UserData } from '../types/user';

   // ❌ WRONG - Unused imports
   import React, { useState, useEffect } from 'react'; // useEffect not used
   ```

2. **Variable Declaration:**

   ```typescript
   // ✅ CORRECT - Declare only used variables
   const [data, setData] = useState<UserData | null>(null);
   const isLoading = data === null;

   // ❌ WRONG - Unused variables
   const [data, setData] = useState(null);
   const unusedVar = 'test'; // unused
   const [loading, setLoading] = useState(false); // setLoading never called
   ```

3. **Type Definitions:**

   ```typescript
   // ✅ CORRECT - Specific types
   interface ApiResponse {
     data: UserData[];
     status: 'success' | 'error';
   }

   function handleResponse(response: ApiResponse): void {
     logger.info('Response processed', { status: response.status });
   }

   // ❌ WRONG - Using any
   function handleResponse(response: any): any {
     console.log('Response:', response);
     return response.data;
   }
   ```

4. **Function Parameters:**

   ```typescript
   // ✅ CORRECT - Remove unused parameters or prefix with underscore
   function processData(data: UserData, _metadata?: MetaData): string {
     return data.name;
   }

   // ❌ WRONG - Unused parameters
   function processData(data: UserData, metadata: MetaData): string {
     return data.name; // metadata unused
   }
   ```

## Code Quality and File Management Standards

**NEVER create files with "new", "backup", "copy", "temp", or similar suffixes in the filename.** Always update existing files directly or create files with proper, final names.

**NEVER create summary documents or status files.** Do not create files like "TASK_SUMMARY.md", "STATUS.md", "COMPLETION_REPORT.md", or similar documentation files that summarize work completed. The work itself and any necessary updates to existing documentation (like README.md) are sufficient.

**Example pattern for handling all commands:**

1. Run the command with `run_in_terminal`
2. If no immediate response after a reasonable time (30-60 seconds for most commands, longer for extensive operations), use `get_terminal_output` to check status
3. Look for completion indicators (command prompt return, success/failure messages, etc.)
4. Proceed if command has actually completed, even if terminal detection failedER use eslint-disable comments.** Fix actual linting errors instead of suppressing them. **This includes all forms of ESLint suppression:\*\*

- `// eslint-disable`
- `// eslint-disable-line`
- `// eslint-disable-next-line`
- `/* eslint-disable */`
- `/* eslint-disable-line */`
- `/* eslint-disable-next-line */`
- Rule-specific disables like `// eslint-disable-next-line @typescript-eslint/no-unused-vars`

**Instead, resolve linting errors properly by:**

- Fixing unused variables and imports
- Adding proper type annotations
- Following proper naming conventions
- Ensuring proper dependency usage
- Refactor code to comply with ESLint rules
- Using proper TypeScript patterns (prefer interfaces over types, proper generics)
- Implementing proper error handling instead of ignoring Promise rejections
- Adding proper return types to functions
- Using semantic variable and function names
- Properly handling async/await patterns

**If you encounter a rule that seems inappropriate for the codebase, discuss it with the team to potentially modify the ESLint configuration rather than suppressing the rule.**

**MOST COMMON ESLINT VIOLATIONS TO PREVENT:**

1. **`no-console`** - Never use `console.log`, `console.error`, etc.

   - Use structured logger: `import { logger } from '../logging/logger';`
   - Use appropriate log levels: `logger.info()`, `logger.error()`, `logger.debug()`

2. **`@typescript-eslint/no-explicit-any`** - Never use `any` type

   - Define proper interfaces in `src/types/`
   - Use specific union types: `string | number` instead of `any`
   - Use generic constraints: `<T extends SomeInterface>` instead of `<T = any>`

3. **`@typescript-eslint/no-unused-vars`** - Remove unused variables and imports
   - Delete unused imports immediately after adding them
   - Remove unused function parameters or prefix with underscore: `_unusedParam`
   - Clean up unused variables and constants before committing code

## Safe Property and Array Access Standards

**CRITICAL: NEVER access properties or array methods without proper safety checks.** All property and array access must be defensive to prevent runtime errors like "Cannot read properties of undefined" or "Cannot read property 'length' of undefined".

**ALWAYS follow these mandatory safety patterns:**

### 1. **Optional Chaining for Nested Properties**

```typescript
// ✅ CORRECT - Safe property access
const userName = user?.profile?.name || 'Unknown';
const firstAddress = user?.addresses?.[0]?.street || 'No address';

// ❌ WRONG - Unsafe property access
const userName = user.profile.name; // Error if user or profile is undefined
const firstAddress = user.addresses[0].street; // Error if any level is undefined
```

### 2. **Array Safety Checks Before Operations**

```typescript
// ✅ CORRECT - Safe array operations
const results = Array.isArray(data) ? data : [];
const totalCount = results.length;
const processedData = results.map(item => processItem(item));
const sum = results.reduce((acc, item) => acc + (item?.value || 0), 0);

// ❌ WRONG - Unsafe array operations
const totalCount = data.length; // Error if data is undefined/null
const processedData = data.map(item => processItem(item)); // Error if data is not an array
const sum = data.reduce((acc, item) => acc + item.value, 0); // Multiple failure points
```

### 3. **Defensive State Access in React Components**

```typescript
// ✅ CORRECT - Safe React state access
const MyComponent = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [metadata, setMetadata] = useState<Metadata | null>(null);

  const itemCount = items?.length || 0;
  const hasItems = Array.isArray(items) && items.length > 0;
  const title = metadata?.title || 'Default Title';

  return (
    <div>
      <h1>{title}</h1>
      {hasItems ? (
        <ul>
          {items.map((item, index) => (
            <li key={item?.id || index}>{item?.name || 'Unknown'}</li>
          ))}
        </ul>
      ) : (
        <p>No items available</p>
      )}
    </div>
  );
};

// ❌ WRONG - Unsafe React patterns
const MyComponent = () => {
  const [items, setItems] = useState<Item[]>();
  const [metadata, setMetadata] = useState<Metadata>();

  return (
    <div>
      <h1>{metadata.title}</h1> {/* Error if metadata is undefined */}
      <ul>
        {items.map(item => ( {/* Error if items is undefined */}
          <li key={item.id}>{item.name}</li> {/* Error if item properties are undefined */}
        ))}
      </ul>
      <p>Total: {items.length}</p> {/* Error if items is undefined */}
    </div>
  );
};
```

### 4. **API Response Safety Patterns**

```typescript
// ✅ CORRECT - Safe API response handling
interface ApiResponse {
  data?: Item[];
  metadata?: {
    total?: number;
    page?: number;
  };
}

const handleApiResponse = (response: ApiResponse) => {
  const items = Array.isArray(response?.data) ? response.data : [];
  const total = response?.metadata?.total || 0;
  const currentPage = response?.metadata?.page || 1;

  return {
    items,
    pagination: {
      total,
      currentPage,
      hasItems: items.length > 0,
    },
  };
};

// ❌ WRONG - Unsafe API response handling
const handleApiResponse = (response: ApiResponse) => {
  const total = response.data.length; // Error if response.data is undefined
  const firstItem = response.data[0]; // Error if array is empty or undefined
  const pageNumber = response.metadata.page; // Error if metadata is undefined

  return {
    total,
    firstItem,
    pageNumber,
  };
};
```

### 5. **Safe Iteration and Aggregation**

```typescript
// ✅ CORRECT - Safe iteration patterns
const calculateStats = (data: any) => {
  const items = Array.isArray(data?.items) ? data.items : [];
  const validItems = items.filter(item => item && typeof item === 'object');

  return {
    count: validItems.length,
    sum: validItems.reduce((acc, item) => acc + (Number(item?.value) || 0), 0),
    average:
      validItems.length > 0
        ? validItems.reduce((acc, item) => acc + (Number(item?.value) || 0), 0) / validItems.length
        : 0,
    names: validItems.map(item => item?.name || 'Unknown').filter(Boolean),
  };
};

// ❌ WRONG - Unsafe iteration
const calculateStats = (data: any) => {
  return {
    count: data.items.length, // Error if data or items is undefined
    sum: data.items.reduce((acc, item) => acc + item.value, 0), // Multiple failure points
    average: data.items.reduce((acc, item) => acc + item.value, 0) / data.items.length,
    names: data.items.map(item => item.name), // Error if item.name is undefined
  };
};
```

### 6. **Safe Object Destructuring**

```typescript
// ✅ CORRECT - Safe destructuring with defaults
const processUser = (user: any) => {
  const { name = 'Unknown', email = '', preferences = {}, roles = [] } = user || {};

  const { theme = 'light', language = 'en' } = preferences;
  const isAdmin = Array.isArray(roles) && roles.includes('admin');

  return { name, email, theme, language, isAdmin };
};

// ❌ WRONG - Unsafe destructuring
const processUser = (user: any) => {
  const { name, email, preferences, roles } = user; // Error if user is undefined
  const { theme, language } = preferences; // Error if preferences is undefined
  const isAdmin = roles.includes('admin'); // Error if roles is undefined

  return { name, email, theme, language, isAdmin };
};
```

### 7. **Safe Property Access Checklist**

**Before accessing any property or array method, ALWAYS verify:**

- ✅ Is the object/array defined? Use `obj?.property` or `Array.isArray(arr)`
- ✅ Is the property path safe? Use optional chaining `obj?.nested?.property`
- ✅ Do you have fallback values? Use `|| defaultValue` or `?? defaultValue`
- ✅ Are array operations protected? Check `Array.isArray()` before `.map()`, `.reduce()`, `.filter()`
- ✅ Are you handling empty arrays? Check `.length > 0` before accessing indices
- ✅ Do you have null checks? Use `!== null && !== undefined` when needed
- ✅ Are API responses validated? Assume external data can be malformed
- ✅ Are you using safe defaults? Provide meaningful fallback values

**MANDATORY: Apply these patterns consistently in ALL code:**

- React components and hooks
- API response handlers
- Data processing functions
- Event handlers
- Utility functions
- Test code
- Configuration files

## CSS and Styling Standards

**NEVER use inline styles.** All styling must use CSS Modules located in `src/styles/`.

**ALWAYS use the existing design system:**

- Use CSS custom properties from `src/styles/design-tokens.css`
- Import shared styles from `src/styles/shared/` directory
- Follow the established CSS architecture and patterns in the codebase
- Maintain consistency with existing design patterns

**CSS Module Structure:**

- Component-specific styles go in `src/styles/ComponentName.module.css`
- Use shared styles from `src/styles/shared/` for common patterns
- Import CSS modules with: `import styles from '../styles/ComponentName.module.css'`

## DRY (Don't Repeat Yourself) Principles

**ALWAYS follow DRY principles:**

- Reuse existing shared components and utilities
- Extract common patterns into shared modules
- Use design tokens instead of hardcoded values
- Reference existing implementations before creating new ones

## Project Architecture

**Technology Stack:**

- Next.js with TypeScript
- CSS Modules for styling
- Keycloak for authentication
- OpenSearch for analytics
- Jest and Playwright for testing

**Key Directories:**

- `src/components/` - React components
- `src/pages/` - Next.js pages
- `src/styles/` - CSS modules and design system
- `src/types/` - TypeScript type definitions
- `src/logging/` - Structured logging functionality
- `src/environment/` - Environment variable handling
- `src/authentication/` - Authentication utilities (tokens, config, admin API)
- `src/auth/` - Authentication logic
- `tests/` - All test files organized by type

**Testing Structure:**

- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- System tests: `tests/system/` (includes UI/end-to-end tests with Playwright)
- Component tests: `tests/components/`

## Code Standards

**TypeScript:**

- Use strict typing - avoid `any` types
- Define proper interfaces and types in `src/types/`
- Use type guards for runtime type checking

**CRITICAL: TypeScript Error Prevention**

**NEVER use `any` types** - Always specify proper types:

```typescript
// ❌ WRONG - Using any
function processData(data: any): any {
  return data.someProperty;
}

// ✅ CORRECT - Proper typing
interface UserData {
  id: number;
  name: string;
  email: string;
}

function processUserData(data: UserData): string {
  return data.name;
}
```

**ALWAYS remove unused variables and imports immediately:**

```typescript
// ❌ WRONG - Unused imports and variables
import React, { useState, useEffect } from 'react'; // useEffect unused
import { SomeUnusedType } from './types'; // unused import

const Component = () => {
  const [data, setData] = useState(null); // setData unused
  const unusedVariable = 'test'; // unused variable

  return <div>Content</div>;
};

// ✅ CORRECT - Only used imports and variables
import React, { useState } from 'react';

const Component = () => {
  const [data] = useState(null);

  return <div>Content</div>;
};
```

**NEVER use console methods** - Use structured logger instead:

```typescript
// ❌ WRONG - Console usage
console.log('Debug message');
console.error('Error occurred');

// ✅ CORRECT - Structured logger
import { logger } from '../logging/logger';

logger.debug('Debug message', { context: 'additional-data' });
logger.error('Error occurred', { error, module: 'component-name' });
```

**ALWAYS check for existing types before creating new ones:**

```typescript
// ✅ CORRECT - Check src/types/ directory first
import { UserData, ApiResponse } from '../types/user';
import { AuthToken } from '../types/auth';

// Only create new types if they don't exist
interface NewFeatureData {
  id: string;
  feature: string;
}

// ❌ WRONG - Creating duplicate types without checking
interface User {
  // UserData already exists in src/types/user.ts
  id: number;
  name: string;
}
```

**Type Creation Guidelines:**

- Search `src/types/` directory for existing interfaces and types
- Use semantic search or grep to find similar type definitions
- Extend existing types when appropriate: `interface ExtendedUser extends UserData`
- Group related types in the same file (e.g., all auth-related types in `src/types/auth.ts`)
- Use specific, descriptive names that indicate the type's purpose

**React Components:**

- Use functional components with hooks
- Implement proper error boundaries
- Follow component composition patterns

**Component Structure Standards:**

- **Component Definition Pattern:**

  ```typescript
  import React from 'react';
  import styles from '../styles/ComponentName.module.css';

  interface ComponentNameProps {
    // Props defined with specific types (no any)
  }

  const ComponentName: React.FC<ComponentNameProps> = ({ prop1, prop2 }) => {
    // Hooks at the top
    // State and derived values
    // Event handlers

    return (
      <div className={styles.container}>
        {/* JSX with semantic HTML and accessibility attributes */}
      </div>
    );
  };

  export default ComponentName;
  ```

- Include explicit accessibility attributes (aria-\* attributes, role, etc.)
- Use semantic HTML elements (`<button>`, `<nav>`, `<article>`, etc.) instead of generic `<div>`s
- Always include skip navigation links for keyboard users in page components
- **ALWAYS add unique IDs to all interactable elements** - Every button, input, form, link, and other interactive element must have a unique `id` attribute for testing purposes

**Element ID Requirements:**

- **Buttons**: Use descriptive IDs like `#submit-button`, `#cancel-button`, `#edit-content-button`
- **Form inputs**: Use field-specific IDs like `#email`, `#password`, `#firstName`
- **Links**: Use descriptive IDs like `#login-link`, `#dashboard-link`, `#header-home`
- **Form elements**: Use IDs like `#login-form`, `#registration-form`
- **Containers**: Use IDs like `#main-content`, `#dashboard-container`, `#error-message`
- **Navigation**: Use IDs like `#main-nav`, `#header-nav`, `#breadcrumb-nav`

**ID Naming Conventions:**

- Use kebab-case for all IDs (lowercase with hyphens)
- Be descriptive and specific to the element's purpose
- Include context when needed (e.g., `#header-logout` vs `#modal-logout`)
- For lists/tables, use patterns like `#user-row-{id}`, `#role-{rolename}`

**File Organization:**

- Group related functionality in appropriate directories
- Use descriptive, clear filenames
- Maintain consistent import/export patterns

**Naming Standards:**

**NEVER use generic names like "helpers", "utils", "utilities", "common", or other overly broad terms.** These names are too permissive and become dumping grounds that violate the Single Responsibility Principle.

**Examples of FORBIDDEN naming patterns:**

- Folders: `helpers/`, `utils/`, `utilities/`, `common/`, `misc/`
- Files: `helpers.ts`, `utils.ts`, `common.ts`, `miscellaneous.ts`
- Classes: `Helper`, `Utility`, `CommonUtils`
- Functions: `helperFunction`, `utilityMethod`

**Instead, use descriptive names that clearly indicate purpose:**

- `validation/` instead of `helpers/`
- `authentication/` instead of `auth-utils/`
- `dateFormatting.ts` instead of `date-utils.ts`
- `UserValidator` instead of `UserHelper`
- `formatCurrency()` instead of `currencyHelper()`

**When refactoring existing generic names:**

1. Identify the actual responsibility and purpose
2. Create appropriately named replacement with specific, descriptive name
3. Update all references throughout the codebase
4. Remove the old generic implementation
5. This applies to all levels: folders, files, classes, functions, variables

**Authentication Implementation Standards:**

- **ALWAYS use the established authentication hooks and components:**

  - `useAuth()` hook from KeycloakProvider for authentication state and functions
  - `withAuth` higher-order component for protecting pages
  - `UserRole` enum for role-based access control

- **Page Protection Pattern:**

  ```typescript
  import withAuth from '../auth/withAuth';
  import { UserRole } from '../auth/keycloak';

  const ProtectedPage = () => {
    const { userProfile } = useAuth();
    // Component implementation
  };

  export default withAuth(ProtectedPage, [UserRole.User, UserRole.Admin]);
  ```

- **Role-Based Rendering Pattern:**

  ```typescript
  const { hasRole } = useAuth();

  {hasRole(UserRole.Admin) && (
    <AdminOnlyComponent />
  )}
  ```

## Accessibility Standards

**ALWAYS prioritize accessibility when creating visual elements:**

- Use semantic HTML elements for proper screen reader support
- Ensure sufficient color contrast ratios (WCAG 2.1 AA minimum)
- Provide alternative text for images and visual content
- Implement proper focus management and keyboard navigation
- Use ARIA attributes when semantic HTML is insufficient

**Color Selection Guidelines:**

- Reference existing accessible color combinations from the design system
- Test color contrast using design tokens from `src/styles/design-tokens.css`
- Avoid relying solely on color to convey information
- Provide additional visual or textual indicators alongside color coding

**ALWAYS add accessibility tests for new visual components:**

- Create corresponding accessibility tests in `tests/ui/accessibility.test.ts`
- Test keyboard navigation, screen reader compatibility, and focus management
- Verify color contrast and visual accessibility requirements
- Follow existing accessibility test patterns in the codebase

## Performance Considerations

**ALWAYS follow established performance optimization practices:**

- **Component Optimization:**

  - Use React.memo for expensive pure components
  - Implement useMemo for computationally intensive calculations
  - Apply useCallback for event handlers passed to child components
  - Create virtualized lists for large datasets using established patterns

- **Next.js Optimizations:**

  - Use Image component for optimized image loading and display
  - Implement proper code splitting with dynamic imports
  - Apply getStaticProps/getServerSideProps appropriately based on data requirements
  - Utilize Incremental Static Regeneration for dynamic content that changes infrequently

- **Data Fetching Strategies:**

  - Follow SWR patterns for client-side data fetching
  - Implement proper loading and error states for all data fetching operations
  - Use appropriate caching strategies based on data volatility
  - Batch API requests where possible to reduce network overhead

- **Resource Management:**
  - Lazy load non-critical components and features
  - Implement proper cleanup in useEffect hooks to prevent memory leaks
  - Monitor and optimize bundle sizes with established tools and patterns
  - Follow the project's established patterns for optimized CSS delivery

## Logging Standards

**NEVER use console.log, console.error, etc. in any code, including tests.** All logging must use the structured logger from `src/logging/logger.ts`

- If console logging is found while working with a file, it should be updated to use the structured logger.

- For all logging (production code and tests), use appropriate log levels:

  ```typescript
  import { logger } from '../logging/logger';

  logger.info('Operation succeeded', { userId, operation });
  logger.error('Operation failed', { error, context });
  logger.debug('Processing data', { data });
  ```

- Include relevant context objects with log messages
- **Console Usage Rules:**
  - All code: The ESLint rule `no-console: "error"` will catch violations in both production and test code
  - During development: Temporary console statements are allowed for debugging but must be removed before committing
- Always include useful information in log messages to aid troubleshooting
- Use appropriate log levels based on the severity and purpose of the message

## Task Execution and Validation Standards

**ALWAYS use terminal commands instead of VS Code tasks.** This ensures direct control and consistent behavior:

**Bulk File Operations - Use Terminal Commands for Efficiency:**

When making similar changes across multiple files, **ALWAYS favor terminal commands over individual file edits.** This is significantly faster and more efficient than editing each file individually.

**Examples of when to use terminal commands:**

- Adding imports across multiple files
- Updating import paths after refactoring
- Replacing deprecated function calls
- Adding or removing specific patterns from multiple files
- Updating configuration values across components

**Terminal Command Patterns for Bulk Operations:**

```powershell
# Find and replace across TypeScript/JavaScript files (exclude node_modules, .next, etc.)
Get-ChildItem -Recurse -Include "*.ts","*.tsx","*.js","*.jsx" -Path . | Where-Object { $_.FullName -notmatch "(node_modules|\.next|\.git|dist|build)" } | ForEach-Object { (Get-Content $_) -replace "oldPattern", "newPattern" | Set-Content $_ }

# Add import statement to all component files
Get-ChildItem -Recurse -Include "*.tsx" -Path "src/components" | ForEach-Object { $content = Get-Content $_; if ($content -notmatch "import.*logger") { $content = "import { logger } from '../logging/logger';`n" + ($content -join "`n"); Set-Content $_ $content } }

# Remove console.log statements across all files
Get-ChildItem -Recurse -Include "*.ts","*.tsx","*.js","*.jsx" -Path . | Where-Object { $_.FullName -notmatch "(node_modules|\.next|\.git|dist|build)" } | ForEach-Object { (Get-Content $_) -replace "console\.(log|error|warn|info).*", "" | Set-Content $_ }
```

**Directory Exclusion Patterns:**
Always exclude these directories when performing bulk operations:

- `node_modules/`
- `.next/`
- `.git/`
- `dist/`
- `build/`
- `.vscode/`
- `coverage/`
- `.nyc_output/`
- Any other build artifacts or dependency directories

**When to still use individual file edits:**

- Complex logic changes that require understanding of specific file context
- Changes that vary significantly between files
- When the bulk operation would be more complex than individual edits
- Adding new functions or components with unique implementations

**NEVER re-run failing tests without making changes first.** If tests fail:

1. Analyze the failure output carefully
2. Make necessary code changes to fix the issues
3. Only then re-run the tests
4. Avoid repeated test runs without modifications

**Final Validation Process:** After completing any task, ALWAYS run this validation command:

- Run `npm run test` to ensure **ALL** tests pass (this includes automatic formatting and TypeScript compilation validation)

The single `npm run test` command runs formatting, TypeScript compilation of test files, and all test suites (unit, component, integration, and system tests) in one operation. If any step fails, the task is not complete.

If environment variables are needed for tests, ensure they are properly set up before running the tests.

**CRITICAL: ALL TESTS MUST PASS** after any change to the codebase. This is a non-negotiable requirement. The validation is incomplete until `npm run test` succeeds without errors.

**NEVER re-run the same command multiple times without making changes** when it produces errors. Each failed command must be followed by meaningful code changes before trying again.

**Error Resolution Priority:**

- Format errors: Fix code style and formatting issues
- Build errors: Resolve TypeScript errors, missing imports, syntax issues
- Test failures: Address failing test cases and logic errors

## Jest Configuration and CLI Usage

**Jest Multi-Project Setup:**

This project uses Jest's multi-project configuration with four distinct test types:

- **Unit** - Tests for individual functions and utilities (`tests/unit/`)
- **Components** - React component tests (`tests/components/`)
- **Integration** - API and service integration tests (`tests/integration/`)
- **System** - End-to-end system tests (`tests/system/`)

**CORRECT Jest CLI Usage:**

**Run all tests:**

```bash
npm run test
```

**Run specific project types:**

```bash
# Run only unit tests
npx jest --selectProjects Unit

# Run only component tests
npx jest --selectProjects Components

# Run multiple project types
npx jest --selectProjects Unit,Components
```

**Filter tests by name pattern:**

```bash
# Run tests with specific name pattern
npx jest --testNamePattern="authentication"

# Run specific test file patterns
npx jest --testPathPattern="auth"
```

**NEVER use invalid Jest flags.** These are NOT valid Jest CLI options:

- ❌ `--env` (this is not a Jest CLI flag)
- ❌ `--config-env` (this does not exist)
- ❌ Custom environment configuration flags

**ES Module Support in Jest:**

- **Custom Reporters:** Must point to compiled `.js` files, not TypeScript source files
- **Module Resolution:** Jest supports ES modules when the project has `"type": "module"` in `package.json`
- **Build Requirements:** TypeScript reporters must be compiled to ES2024 modules before Jest can load them
- **Import Paths:** Use relative imports in Jest configuration: `./dist/logging/enhancedCtrfReporter.js`

**Jest Reporter Configuration:**

```typescript
// ✅ CORRECT - Point to compiled JS file
reporters: ['default', './dist/logging/enhancedCtrfReporter.js'];

// ❌ WRONG - Point to TypeScript source
reporters: ['default', './src/logging/enhancedCtrfReporter.ts'];
```

**TypeScript Build for Jest:**

- Include Jest reporters in the main TypeScript build (`tsconfig.json`)
- Ensure reporters are compiled to the same module format as the project (ES2024)
- Do not create separate build configurations unless absolutely necessary
- Jest will load ES module reporters correctly in ES module projects

## Testing and Quality Assurance

**Test Design Philosophy:**

- **Test behaviors, not implementations** - Focus on what the component does, not how it does it
- Test user interactions and expected outcomes
- Avoid testing internal state or implementation details
- Write tests that remain valid even when refactoring code

**CRITICAL: Test Integrity Standards**

**NEVER write tests that skip validation and mark themselves as passing.** This includes:

- Tests that catch errors and log them as "skipped" instead of failing
- Tests that check permissions/access and skip execution instead of ensuring proper test user setup
- Tests that use try-catch blocks to avoid legitimate test failures
- Tests that check conditions and skip assertions instead of setting up proper test preconditions

**Examples of FORBIDDEN test patterns:**

```typescript
// ❌ WRONG - This test will always pass even when it should fail
test('Admin functionality should work', async () => {
  try {
    await accessAdminPage();
    // test logic
  } catch (error) {
    testLogger.info('Test skipped - no admin access');
    // Test passes without actually testing anything!
  }
});

// ❌ WRONG - Conditional skipping instead of proper setup
test('Feature should work for admin users', async () => {
  if (!hasAdminAccess()) {
    testLogger.info('Skipping admin test');
    return; // Test passes without testing
  }
  // test logic
});
```

**Correct approach:**

```typescript
// ✅ CORRECT - Ensure proper test setup and let legitimate failures occur
test('Admin functionality should work', async () => {
  // Use proper test user with admin privileges
  await loginPage.loginWithUser(TestUsers.OWNER);
  await accessAdminPage(); // If this fails, the test should fail
  // test assertions - no try-catch to hide failures
});
```

**Test User Management:**

- Use appropriate test users from `TestUsers` model for different permission levels
- `TestUsers.READONLY` for basic user functionality
- `TestUsers.MAINTAINER` for elevated permissions
- `TestUsers.OWNER` for admin/owner functionality
- Set up proper authentication before testing restricted functionality
- Let tests fail if permissions are insufficient - fix the test setup, don't skip the test

**Specific Testing Patterns:**

- **ALWAYS test accessibility** for UI components using axe-playwright:

  ```typescript
  import { injectAxe, getViolations } from 'axe-playwright';

  await injectAxe(page);
  const violations = await getViolations(page);
  expect(violations.length).toBe(0);
  ```

- **Page Object Pattern** for UI tests:

  - Create page models in `tests/ui/pages/` directory
  - Implement methods for common interactions
  - Abstract implementation details from test cases
  - **CRITICAL: playwright.page usage restriction** - The `playwright.page` object should ONLY be used in the constructor of page classes under `tests/ui/pages/`. All other test code should interact through page object methods
  - **Generic methods placement** - If a test needs to use a method that is more generic and not specific to a particular page, it should be added to the `basePage` class
  - **Selector requirements** - When creating or changing Playwright page objects, ONLY use IDs as selectors (e.g., `#elementId`, `[id="elementId"]`)
  - **Missing ID handling** - If an ID does not exist in the HTML element that needs to be tested, you MUST first add the ID to the HTML element in the source code, then reference it in the tests

- **Test Data Management:**

  - Use the `tests/data/` directory for test data generation (avoid generic names like "utils")
  - Prefer generated data over hardcoded test values
  - Clean up test data in afterEach/afterAll blocks

- **Separate Test Types:**
  - Unit tests with Jest
  - Component tests with React Testing Library
  - Integration tests for API interactions
  - System tests for end-to-end workflows (includes UI testing with Playwright)

**Test Execution Guidelines:**

- Run tests only after making meaningful changes
- Always investigate and fix test failures before re-running
- Use the established test structure in `tests/` directory
- Follow existing test patterns and conventions
- **NEVER create a separate `test:ui` script** - UI tests are part of the system test suite (`npm run test:system`)
- **EVERY TEST MUST PASS** after any code change before the task is considered complete
- When any tests fail, prioritize fixing them immediately before moving on to other tasks
- Ensure all test environments (including environment variables) are properly configured
- Run the complete test suite using `npm run test` to verify ALL tests pass

**Jest Project-Specific Testing:**

When working on specific areas of the codebase, you can run targeted test suites:

```bash
# When working on utilities or core logic
npx jest --selectProjects Unit

# When working on React components
npx jest --selectProjects Components

# When working on API integrations
npx jest --selectProjects Integration

# When working on end-to-end workflows
npx jest --selectProjects System
```

**Test Filtering Best Practices:**

- Use `--testNamePattern` to run tests with specific names: `npx jest --testNamePattern="login"`
- Use `--testPathPattern` to run tests in specific files: `npx jest --testPathPattern="auth"`
- Combine project selection with filtering: `npx jest --selectProjects Unit --testNamePattern="validation"`
- Always run the full test suite (`npm run test`) before completing any task

## Documentation Standards

**Keep documentation concise and focused:**

- Use the main `README.md` at the project root for essential information
- Avoid over-documenting or creating unnecessary documentation files
- Focus on practical, actionable information rather than verbose explanations
- Update existing documentation rather than creating new files

When working on this project, examine existing components and maintain consistency with the current architecture.

# ScaledTest Project - GitHub Copilot Instructions

## Code Quality and File Management Standards

**NEVER create files with "new", "backup", "copy", "temp", or similar suffixes in the filename.** Always update existing files directly or create files with proper, final names.

**NEVER use eslint-disable comments.** Fix actual linting errors instead of suppressing them. **This includes all forms of ESLint suppression:**

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
- Refactoring code to comply with ESLint rules
- Using proper TypeScript patterns (prefer interfaces over types, proper generics)
- Implementing proper error handling instead of ignoring Promise rejections
- Adding proper return types to functions
- Using semantic variable and function names
- Properly handling async/await patterns

**If you encounter a rule that seems inappropriate for the codebase, discuss it with the team to potentially modify the ESLint configuration rather than suppressing the rule.**

**NEVER add filepath comments at the top of files.** Do not include comments like `// src/components/MyComponent.tsx` or similar file path indicators.

**NEVER add redundant or obvious comments.** Only include comments that:

- Explain complex business logic
- Document non-obvious architectural decisions
- Provide context for unusual code patterns
- Explain why something is done, not what is being done

**NEVER leave commented-out code.** Remove all dead code and unused commented blocks.

**ALWAYS check for and remove unused/unreferenced files.** Ensure all created files serve a real purpose and are properly integrated.

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
- `src/utils/` - Utility functions
- `src/auth/` - Authentication logic
- `tests/` - All test files organized by type

**Testing Structure:**

- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- UI tests: `tests/ui/`
- System tests: `tests/system/`
- Component tests: `tests/components/`

## Code Standards

**TypeScript:**

- Use strict typing - avoid `any` types
- Define proper interfaces and types in `src/types/`
- Use type guards for runtime type checking

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

**File Organization:**

- Group related functionality in appropriate directories
- Use descriptive, clear filenames
- Maintain consistent import/export patterns

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

**NEVER use console.log, console.error, etc. in any code, including tests.** All logging must use the structured logger from `src/utils/logger.ts`

- If console logging is found while working with a file, it should be updated to use the structured logger.

- For all logging (production code and tests), use appropriate log levels:

  ```typescript
  import { logger } from '../utils/logger';

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

- Use `npm run format` instead of "Format All Files" task
- Use `npm run build` instead of "NPM Build" task
- Use `npm run test` instead of "NPM Test" task

**Windows Terminal Command Handling:**

Due to a Windows-specific issue where fast-executing commands may not be properly detected as completed, follow these strategies:

- **For quick commands (< 5 seconds expected):** Use `get_terminal_output` tool to proactively check command completion rather than waiting indefinitely
- **Command timeout strategy:** If a command appears to hang after a reasonable time (30-60 seconds for most commands), check terminal output and proceed if the command has actually completed
- **Signs of completion:** Look for return to command prompt, exit codes, or expected output patterns in terminal
- **Fallback approach:** If terminal appears stuck but output suggests completion, acknowledge the completion and continue with the next step
- **Fast command examples:** `npm run format`, `git status`, `ls`/`dir`, simple file operations

**Example pattern for handling potentially fast commands:**

1. Run the command with `run_in_terminal`
2. If no immediate response after 30 seconds, use `get_terminal_output` to check status
3. Look for completion indicators (command prompt return, success messages, etc.)
4. Proceed if command has actually completed, even if terminal detection failed

**ALWAYS wait for commands to complete fully** before proceeding. Do not assume success without confirmation.

**NEVER re-run failing tests without making changes first.** If tests fail:

1. Analyze the failure output carefully
2. Make necessary code changes to fix the issues
3. Only then re-run the tests
4. Avoid repeated test runs without modifications

**Final Validation Process:** After completing any task, ALWAYS run this validation command:

- Run `npm run test` to ensure **ALL** tests pass (this includes automatic formatting and TypeScript compilation validation)

The single `npm run test` command runs formatting, TypeScript compilation of test files, and all test suites (unit, component, integration, system, and UI tests) in one operation. If any step fails, the task is not complete.

If environment variables are needed for tests, ensure they are properly set up before running the tests.

**CRITICAL: ALL TESTS MUST PASS** after any change to the codebase. This is a non-negotiable requirement. The validation is incomplete until `npm run test` succeeds without errors.

**NEVER re-run the same command multiple times without making changes** when it produces errors. Each failed command must be followed by meaningful code changes before trying again.

**Error Resolution Priority:**

- Format errors: Fix code style and formatting issues
- Build errors: Resolve TypeScript errors, missing imports, syntax issues
- Test failures: Address failing test cases and logic errors

## Testing and Quality Assurance

**Test Design Philosophy:**

- **Test behaviors, not implementations** - Focus on what the component does, not how it does it
- Test user interactions and expected outcomes
- Avoid testing internal state or implementation details
- Write tests that remain valid even when refactoring code

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

- **Test Data Management:**

  - Use the `tests/utils/` helpers for test data generation
  - Prefer generated data over hardcoded test values
  - Clean up test data in afterEach/afterAll blocks

- **Separate Test Types:**
  - Unit tests with Jest
  - Component tests with React Testing Library
  - Integration tests for API interactions
  - UI tests with Playwright
  - System tests for end-to-end workflows

**Test Execution Guidelines:**

- Run tests only after making meaningful changes
- Always investigate and fix test failures before re-running
- Use the established test structure in `tests/` directory
- Follow existing test patterns and conventions
- **EVERY TEST MUST PASS** after any code change before the task is considered complete
- When any tests fail, prioritize fixing them immediately before moving on to other tasks
- Ensure all test environments (including environment variables) are properly configured
- Run the complete test suite using `npm run test` to verify ALL tests pass

## Documentation Standards

**Keep documentation concise and focused:**

- Use the main `README.md` at the project root for essential information
- Avoid over-documenting or creating unnecessary documentation files
- Focus on practical, actionable information rather than verbose explanations
- Update existing documentation rather than creating new files

When working on this project, examine existing components and maintain consistency with the current architecture.

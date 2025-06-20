# ScaledTest Project - GitHub Copilot Instructions

## Code Quality and File Management Standards

**NEVER create files with "new", "backup", "copy", "temp", or similar suffixes in the filename.** Always update existing files directly or create files with proper, final names.

**NEVER use eslint-disable comments.** Fix actual linting errors instead of suppressing them. If you encounter linting errors, resolve them properly by:

- Fixing unused variables and imports
- Adding proper type annotations
- Following proper naming conventions
- Ensuring proper dependency usage

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
- **ALWAYS use TypeScript file extensions**:
  - Use `.ts` for all TypeScript files containing logic, utilities, services, and non-React code
  - Use `.tsx` only for files that contain JSX/TSX (React components)
  - **NEVER create `.js` or `.jsx` files** unless absolutely necessary (e.g., configuration files that must be in JavaScript)
  - Convert any JavaScript files to TypeScript when modifying them substantively

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

- Include explicit accessibility attributes (aria-* attributes, role, etc.)
- Use semantic HTML elements (`<button>`, `<nav>`, `<article>`, etc.) instead of generic `<div>`s
- Always include skip navigation links for keyboard users in page components

**File Organization:**

- Group related functionality in appropriate directories
- Use descriptive, clear filenames
- Maintain consistent import/export patterns

**Authentication:**

- Use the established Keycloak integration
- Follow patterns in `src/auth/` directory
- Implement proper authorization checks

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

## Error Handling and Validation

**Error Handling Standards:**

- Implement React error boundaries for component-level error isolation:
  ```typescript
  import React, { ErrorInfo } from 'react';
  
  interface ErrorBoundaryProps {
    fallback: React.ReactNode;
    children: React.ReactNode;
  }
  
  interface ErrorBoundaryState {
    hasError: boolean;
  }
  
  class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
      super(props);
      this.state = { hasError: false };
    }
    
    static getDerivedStateFromError(): ErrorBoundaryState {
      return { hasError: true };
    }
    
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
      logger.error('Component error', { error, errorInfo });
    }
    
    render(): React.ReactNode {
      if (this.state.hasError) {
        return this.props.fallback;
      }
      
      return this.props.children;
    }
  }
  ```

- Use try/catch blocks for handling async operations and API calls
- Apply proper error mapping with user-friendly messages
- Log all errors with appropriate context for troubleshooting

**Validation Standards:**

- Use the validation schemas defined in `src/schemas/` for data validation
- Implement client-side validation before form submission
- Apply server-side validation in API routes regardless of client validation
- Use consistent validation error formats across the application
- Provide clear, actionable error messages to users

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

**ALWAYS use direct terminal commands instead of VS Code tasks.** GitHub Copilot should never use VS Code tasks or commands:

- `npm run format` for formatting code
- `npm run build` for building the application
- `npm run test` for running tests

**Command Execution Standards:**

**ALWAYS limit operations to the src, test, and scripts directories** to maintain focus on relevant code and avoid unintended side effects.

**ALWAYS wait for commands to complete fully** before proceeding. Do not assume success without confirmation.

**NEVER re-run failing tests without making changes first.** If any command fails:

1. Analyze the failure output carefully
2. Make specific code changes to address each identified issue
3. Only then re-run the command that previously failed

**Final Validation Process:** After completing any task, ALWAYS run this validation sequence in strict order:

1. Run `npm run format` to ensure code formatting, targeting only src and test directories
2. Run `npm run build` to verify the build succeeds
3. Run `npm run test` to ensure all tests pass
4. Fix any errors found and restart the sequence from step 1

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

## Documentation Standards

**Keep documentation concise and focused:**

- Use the main `README.md` at the project root for essential information
- Avoid over-documenting or creating unnecessary documentation files
- Focus on practical, actionable information rather than verbose explanations
- Update existing documentation rather than creating new files
- DO NOT create a docs folder and add documentation to it. It should go in the readme.

## Environment Configuration Management

**Environment Variables Standards:**

- **ALWAYS use the environment utility functions** from `src/utils/env.ts` to access environment variables
- Follow the organization pattern in `.env.example` when adding new environment variables:
  - Group variables by functional area (Keycloak, OpenSearch, etc.)
  - Mark variables as REQUIRED or OPTIONAL with comments
  - Include descriptive comments for non-obvious variables
- **NEVER hardcode configuration values** that should be environment-dependent

When working on this project, examine existing components and maintain consistency with the current architecture.

## Self-Updating Instructions

**ALWAYS scan for new coding patterns and standards:** When working in the codebase, be vigilant about identifying any new coding patterns, standards, or best practices that may not yet be documented in this instructions file.

**Detecting New Standards Process:**

- When observing consistent patterns across multiple files that aren't documented here
- When noticing newly introduced libraries, tools, or frameworks
- When identifying repeated code review feedback across multiple pull requests
- When seeing improvements or optimizations that could be standardized
- When the user mentions keywords like "standard," "pattern," "best practice," "convention," or "rule" in chat conversations
- When the user provides feedback like "we always do X this way" or "we never do Y" during chat sessions

**Self-Updating Mechanism:**

1. **Check existing sections first:** Before suggesting additions, verify that the observed pattern isn't already covered elsewhere in this document
2. **Propose specific updates:** Suggest precise additions or modifications to these instructions, using the same formatting and style as existing content
3. **Include examples:** Provide concrete examples from the codebase that demonstrate the pattern or standard being documented
4. **Reference locations:** Mention specific files or components where the pattern is implemented well
5. **Capture chat insights:** When the user mentions standards or practices in chat conversations, document them promptly in the appropriate section
6. **Verify with user:** When uncertain about a standard mentioned in chat, ask clarifying questions to ensure accurate documentation

**Documentation Integration:**

- New standards should be placed in the most relevant existing section
- If no appropriate section exists, suggest creating a new one with a descriptive heading
- Maintain consistent formatting, including bold headings, bullet points, and code blocks
- Follow the established tone and level of detail of existing sections

**Priority Standards to Monitor:**

- Security best practices for authentication and data handling
- Performance optimizations for data fetching and rendering
- Accessibility improvements and testing methodologies
- New design system components and usage patterns
- Test coverage expectations for new feature types

## API Integration Standards

**API Client Implementation:**

- Create typed API clients in `src/api/` directory for external service integration
- Use consistent error handling patterns across all API calls
- Implement proper retry logic for transient failures
- Add appropriate request timeouts to prevent hanging operations

**API Response Handling:**

- Always handle both success and error cases explicitly
- Parse and validate API responses using schemas from `src/schemas/`
- Transform API responses to application models before using in components
- Cache API responses appropriately based on data volatility

**API Request Management:**

- Use SWR or React Query patterns for data fetching
- Implement loading, error, and success states for all API interactions
- Add appropriate debouncing for user-initiated API calls
- Cancel pending requests when components unmount

**Authentication for API Calls:**

- Use the established authentication patterns from `src/auth/apiAuth.ts`
- Implement proper token refresh handling for expired credentials
- Apply appropriate authorization headers consistently
- Handle unauthorized responses by redirecting to login when appropriate

## Package Management and Dependencies

**Dependency Management Standards:**

- Always use exact versions (not ranges) in package.json to ensure consistency
- Document the purpose of non-standard or complex dependencies with comments
- Group dependencies logically in package.json:
  - Core framework dependencies first (Next.js, React)
  - UI and component libraries next
  - Utility libraries
  - Development dependencies appropriately in devDependencies

**Adding New Dependencies:**

- Prefer established libraries with active maintenance and community support
- Evaluate bundle size impact before adding new dependencies
- Check for type definitions or add them in `src/types/` when missing
- Document why a new dependency is needed in pull request descriptions

**Dependency Security:**

- Run security audits regularly with `npm audit`
- Address security vulnerabilities promptly
- Pin dependency versions to avoid unexpected updates
- Use only vetted dependencies from trusted sources

**Custom Script Standards:**

- Add descriptive comments for non-standard npm scripts in package.json
- Ensure all scripts follow consistent naming conventions
- Document environment requirements for scripts when applicable
- Create npm scripts for common development tasks to standardize execution

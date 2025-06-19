# ScaledTest Project - GitHub Copilot Instructions

## Code Quality and File Management Standards

**NEVER create files with "new", "backup", "copy", "temp", or similar suffixes in the filename.** Always update existing files directly or create files with proper, final names.

**NEVER use eslint-disable-next-line comments.** Fix actual linting errors instead of suppressing them. If you encounter linting errors, resolve them properly by:

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

**React Components:**

- Use functional components with hooks
- Implement proper error boundaries
- Follow component composition patterns

**File Organization:**

- Group related functionality in appropriate directories
- Use descriptive, clear filenames
- Maintain consistent import/export patterns

**Authentication:**

- Use the established Keycloak integration
- Follow patterns in `src/auth/` directory
- Implement proper authorization checks

## Error Handling and Validation

- Use proper error boundaries and error handling
- Implement input validation using established patterns
- Follow the validation schemas in `src/schemas/`

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

- Implement proper loading states
- Use Next.js optimization features
- Follow established patterns for data fetching

## Task Execution and Validation Standards

**ALWAYS use VS Code tasks from tasks.json instead of running duplicate terminal commands.** This prevents wasted cycles and ensures consistency:

- Use "Format All Files" task instead of `npm run format`
- Use "NPM Build" task instead of `npm run build`
- Use "NPM Test" task instead of `npm run test`

**ALWAYS wait for tasks to complete fully** before proceeding. Do not assume success without confirmation.

**NEVER re-run failing tests without making changes first.** If tests fail:

1. Analyze the failure output carefully
2. Make necessary code changes to fix the issues
3. Only then re-run the tests
4. Avoid repeated test runs without modifications

**Final Validation Process:** After completing any task, ALWAYS run this validation sequence:

1. Run "Format All Files" task to ensure code formatting
2. Run "NPM Build" task to verify the build succeeds
3. Run "NPM Test" task to ensure all tests pass
4. Fix any errors found and repeat validation until all steps pass

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

When working on this project, examine existing components and maintain consistency with the current architecture.

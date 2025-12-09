---
applyTo: "frontend/tests/**/*.{ts,tsx}"
---

# Testing Standards

Guidelines for writing tests in the ScaledTest project using Playwright and Vitest.

---

## Purpose & Scope

This file applies to all test files in the `frontend/tests/` and `frontend/src/__tests__/` directories.

---

## Testing Types

### E2E Tests (Playwright)
- Located in `frontend/tests/ui/`
- Test full user flows through the browser
- Use Page Object pattern
- Require running application servers

### Unit/Component Tests (Vitest)
- Located in `frontend/src/__tests__/`
- Test components and hooks in isolation
- Use React Testing Library
- Use mock API services via context injection

---

## Testing Philosophy

- Test behaviors, not implementations
- Focus on user interactions and expected outcomes
- Avoid testing internal state or implementation details
- Write tests that remain valid during refactoring

---

## Test Structure

```
frontend/tests/
├── ui/                     # Playwright E2E tests
│   ├── login.test.ts
│   ├── navigation.test.ts
│   ├── role-access.test.ts
│   ├── accessibility/      # WCAG compliance tests
│   ├── models/             # Test data models
│   └── pages/              # Page Object Models
├── global-setup.ts         # Global test setup
└── README.md               # Testing documentation
```

---

## Test Integrity

**NEVER write tests that skip validation:**

```typescript
// ✅ CORRECT - Let test fail if permissions insufficient
test("Admin functionality should work", async ({ page }) => {
  await loginPage.loginWithUser(TestUsers.ADMIN);
  await adminPage.navigateToAdminPanel();
  await expect(page.locator("#admin-content")).toBeVisible();
});

// ❌ WRONG - Skip test instead of fixing setup
test("Admin functionality should work", async ({ page }) => {
  try {
    await loginPage.loginWithUser(TestUsers.ADMIN);
    await adminPage.navigateToAdminPanel();
  } catch (error) {
    testLogger.info("Test skipped - no admin access");
    return; // Test passes without testing!
  }
});
```

**Test User Management:**

- Use `TestUsers.ADMIN` for admin/owner functionality
- Use `TestUsers.USER` for basic user functionality
- Set up proper authentication before testing restricted features
- Let tests fail if permissions are insufficient

---

## Page Object Pattern

**CRITICAL: `page` object usage restriction:**

- The `page` object should ONLY be used in constructors of page classes
- All test code should interact through page object methods
- Generic methods belong in `BasePage` class

**Selector Requirements:**

- ONLY use IDs as selectors: `#elementId` or `[id="elementId"]`
- If an element lacks an ID, add it to the HTML first
- Never use class names, text content, or XPath selectors

**Page Object Structure:**

```typescript
// ✅ CORRECT - Page object pattern
import { Page, Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

export class LoginPage extends BasePage {
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly submitButton: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = this.page.locator("#email-input");
    this.passwordInput = this.page.locator("#password-input");
    this.submitButton = this.page.locator("#submit-button");
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async loginWithUser(testUser: TestUser): Promise<void> {
    await this.login(testUser.email, testUser.password);
  }
}

// ❌ WRONG - Using page directly in tests
test("User can login", async ({ page }) => {
  await page.locator("#email-input").fill("test@example.com");
  await page.locator("#password-input").fill("password");
  await page.locator("#submit-button").click();
});
```

---

## Playwright Configuration

**Test execution commands:**

```bash
# Run all tests
npm test
npx playwright test

# Run with UI mode (debugging)
npm run test:ui
npx playwright test --ui

# Run in headed mode (visible browser)
npm run test:headed
npx playwright test --headed

# Run in debug mode
npm run test:debug
npx playwright test --debug

# Filter tests
npx playwright test login.test.ts
npx playwright test --grep "login"
npx playwright test accessibility/
```

---

## Accessibility Testing

**ALWAYS test accessibility for UI components:**

```typescript
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Page should have no accessibility violations", async ({ page }) => {
  await page.goto("/dashboard");

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});

// Test specific accessibility requirements
test("Interactive elements should have IDs", async ({ page }) => {
  await page.goto("/login");

  const buttons = await page.locator("button").all();
  for (const button of buttons) {
    const id = await button.getAttribute("id");
    expect(id).toBeTruthy();
  }
});
```

---

## Vitest Unit/Component Tests

**Use Vitest with React Testing Library for unit and component tests:**

### Test Structure

```typescript
// src/__tests__/components/UserCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, createMockUserApi } from '../utils/test-utils';
import { UserCard } from '../../components/UserCard';

describe('UserCard', () => {
  it('displays user information', () => {
    const { getByText } = renderWithProviders(
      <UserCard user={{ id: '1', name: 'Test', email: 'test@example.com' }} />
    );

    expect(getByText('Test')).toBeInTheDocument();
    expect(getByText('test@example.com')).toBeInTheDocument();
  });
});
```

### Mocking API Services

```typescript
// Use mock factories for consistent API mocks
import { createMockTestResultsApi, createMockUserApi } from '../utils/test-utils';

describe('TestResultsPage', () => {
  it('fetches and displays results', async () => {
    const mockApi = createMockTestResultsApi({
      getTestRuns: vi.fn().mockResolvedValue({
        data: { results: [{ id: 'run-1', status: 'completed' }] }
      })
    });

    const { getByText } = renderWithProviders(<TestResultsPage />, {
      testResultsApi: mockApi
    });

    await waitFor(() => {
      expect(getByText('completed')).toBeInTheDocument();
    });

    expect(mockApi.getTestRuns).toHaveBeenCalled();
  });
});
```

### Testing Hooks

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useTestResults } from '../../hooks/useTestResults';
import { createMockTestResultsApi, TestWrapper } from '../utils/test-utils';

describe('useTestResults', () => {
  it('fetches results on mount', async () => {
    const mockApi = createMockTestResultsApi();

    const { result } = renderHook(() => useTestResults('project-1'), {
      wrapper: ({ children }) => (
        <TestWrapper testResultsApi={mockApi}>{children}</TestWrapper>
      ),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});
```

### Running Vitest

```bash
# Run unit tests
npm run test:unit

# Run with coverage
npm run test:unit:coverage

# Run in watch mode
npm run test:unit -- --watch

# Run specific test file
npm run test:unit -- UserCard.test.tsx
```

---

## Test Data Management

**Use TestUser model:**

```typescript
// tests/ui/models/TestUsers.ts
export interface TestUser {
  email: string;
  password: string;
  name: string;
  role: string;
}

export const TestUsers = {
  ADMIN: {
    email: "admin@test.com",
    password: "AdminPass123!",
    name: "Admin User",
    role: "admin",
  },
  USER: {
    email: "user@test.com",
    password: "UserPass123!",
    name: "Test User",
    role: "user",
  },
};
```

**Use test data models:**

```typescript
// ✅ CORRECT - Use test data models
import { TestUsers } from "./models/TestUsers";

test("User can access dashboard", async ({ page }) => {
  await loginPage.loginWithUser(TestUsers.USER);
  await expect(page.locator("#dashboard-content")).toBeVisible();
});

// ❌ WRONG - Hardcoded test data
test("User can access dashboard", async ({ page }) => {
  await loginPage.login("user@test.com", "password123");
  await expect(page.locator("#dashboard-content")).toBeVisible();
});
```

---

## Test Execution

**ALL TESTS MUST PASS before completing any task:**

- Run tests after making changes: `cd frontend && npm test`
- Never re-run failing tests without making changes
- Fix issues before retrying tests
- Ensure all test environments are properly configured

**Error Resolution Priority:**

1. Fix test setup issues (authentication, test data)
2. Fix actual application bugs causing failures
3. Update tests if behavior intentionally changed

---

## Common Patterns

**Waiting for elements:**

```typescript
// ✅ CORRECT - Wait for visibility
await expect(page.locator("#content")).toBeVisible();
await page.locator("#button").click();

// ❌ WRONG - Hard-coded timeouts
await page.waitForTimeout(2000);
await page.locator("#button").click();
```

**Form interactions:**

```typescript
// ✅ CORRECT - Clear form interaction pattern
await page.locator("#email-input").fill(email);
await page.locator("#password-input").fill(password);
await page.locator("#submit-button").click();
await expect(page.locator("#success-message")).toBeVisible();

// ❌ WRONG - No verification of actions
await page.locator("#email-input").type(email);
await page.locator("#password-input").type(password);
await page.locator("#submit-button").click();
// Missing assertion
```

**Navigation testing:**

```typescript
// ✅ CORRECT - Verify navigation
await page.locator("#dashboard-link").click();
await expect(page).toHaveURL(/.*dashboard/);
await expect(page.locator("#dashboard-header")).toBeVisible();

// ❌ WRONG - No URL or content verification
await page.locator("#dashboard-link").click();
// Missing verification
```

---

## Example

```typescript
// ✅ CORRECT - Complete test pattern
import { test, expect } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TestUsers } from "./models/TestUsers";
import AxeBuilder from "@axe-core/playwright";

test.describe("Dashboard Access", () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    await page.goto("/login");
  });

  test("User can access dashboard after login", async ({ page }) => {
    await loginPage.loginWithUser(TestUsers.USER);

    await expect(page).toHaveURL(/.*dashboard/);
    await expect(dashboardPage.header).toBeVisible();
  });

  test("Admin can access admin panel", async ({ page }) => {
    await loginPage.loginWithUser(TestUsers.ADMIN);
    await dashboardPage.navigateToAdminPanel();

    await expect(page.locator("#admin-content")).toBeVisible();
  });

  test("Dashboard should have no accessibility violations", async ({
    page,
  }) => {
    await loginPage.loginWithUser(TestUsers.USER);

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
```

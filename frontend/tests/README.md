# Frontend Tests

This directory contains all frontend testing infrastructure for ScaledTest.

## Test Structure

```
tests/
├── ui/              # Playwright end-to-end tests
│   ├── pages/       # Page Object Models
│   ├── models/      # Test data models
│   ├── utils/       # Test utilities
│   └── *.test.ts    # E2E test files
└── setup.ts         # Jest test setup
```

## Running Tests

### Jest Unit/Component Tests

```bash
npm test              # Run all Jest tests
npm run test:watch   # Run in watch mode
npm run test:coverage # Run with coverage report
```

### Playwright E2E Tests

```bash
npm run test:ui      # Run Playwright tests
```

Playwright will automatically start the dev server at http://localhost:5173 before running tests.

## Configuration

- **Jest**: Configured in `jest.config.ts`
- **Playwright**: Configured in `playwright.config.ts`
- **TypeScript**: Uses `tsconfig.test.json` for test files

## Test Environment

Tests run against:

- **Frontend**: http://localhost:5173 (Vite dev server)
- **Backend API**: http://localhost:8080 (configured in `VITE_API_URL`)

Make sure the backend is running when executing E2E tests.

## Writing Tests

### Component Tests (Jest + React Testing Library)

```typescript
import { render, screen } from '@testing-library/react';
import MyComponent from '../components/MyComponent';

test('renders component', () => {
  render(<MyComponent />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

### E2E Tests (Playwright)

```typescript
import { test, expect } from "@playwright/test";

test("user can login", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", "user@example.com");
  await page.fill("#password", "password");
  await page.click("#login-button");
  await expect(page).toHaveURL("/dashboard");
});
```

## Notes

- UI tests use Page Object Models (in `tests/ui/pages/`)
- All interactive elements should have unique IDs for reliable test selectors
- Tests should be independent and not rely on execution order

import { test, expect } from '@playwright/test';

// Note: These tests use Playwright's recommended role/label selectors for
// accessibility validation. The root-layout component also exposes stable
// id attributes (e.g. #nav-dashboard, #btn-sign-out) for use in the
// existing tests/ui framework's id-based selector pattern. Both approaches
// coexist intentionally: role selectors verify a11y, id selectors enable
// deterministic automation without coupling to visible text.
test.describe('Navigation', () => {
  test('login page renders without errors', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'ScaledTest' })).toBeVisible();
  });

  test('login page hides sidebar when not authenticated', async ({ page }) => {
    await page.goto('/login');
    // Auth pages use centered AuthLayout, which has no sidebar
    await expect(page.getByRole('heading', { name: 'ScaledTest' })).toBeVisible();
    // Sidebar should not be visible
    await expect(page.locator('aside')).not.toBeVisible();
  });

  test('protected routes redirect to login', async ({ page }) => {
    const routes = ['/reports', '/executions', '/analytics', '/quality-gates', '/admin'];
    for (const route of routes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});

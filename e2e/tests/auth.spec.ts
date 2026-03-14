import { test, expect } from '@playwright/test';

// Note: These tests use Playwright's recommended role/label selectors for
// accessibility validation. Components also expose stable id attributes
// (e.g. #nav-sign-in, #btn-sign-out) for the existing tests/ui framework's
// id-based selector pattern. Both approaches coexist intentionally:
// role selectors verify a11y, id selectors enable deterministic automation.
test.describe('Authentication', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'ScaledTest' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('shows register link on login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
  });

  test('navigates to register page', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole('heading', { name: 'ScaledTest' })).toBeVisible();
    await expect(page.getByLabel('Display Name')).toBeVisible();
  });

  test('shows validation error on invalid login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('bad@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();
    // Should show an error message — check for role=alert or common error text patterns
    await expect(
      page.getByRole('alert').or(page.getByText(/invalid|error|failed|unauthorized/i))
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows OAuth buttons', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'GitHub' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Google' })).toBeVisible();
  });

  test('register form validates password match', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Display Name').fill('Test User');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm Password').fill('different');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('text=Passwords do not match')).toBeVisible();
  });
});

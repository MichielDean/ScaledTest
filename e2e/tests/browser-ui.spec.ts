/**
 * Browser UI tests for core platform flows.
 *
 * Each test:
 * 1. Logs in via the UI form (page.goto + fill + click Sign In)
 * 2. Navigates to a core page and asserts key elements are visible
 * 3. Performs real interactions — not just API assertions
 * 4. Produces at least one screenshot showing the authenticated UI
 *
 * Team context: the login handler embeds the user's first team_id in the JWT,
 * so all browser API calls are team-scoped. Tests that need team-scoped data
 * (e.g. test-results) create a team and submit data via the request fixture
 * BEFORE calling loginViaUI, ensuring the JWT from login carries a team_id.
 */

import { test, expect } from '@playwright/test';
import {
  loginViaUI,
  loadCachedToken,
  getOrCreateTeam,
  OWNER,
} from './helpers';

test.describe('Browser UI — Core Platform Flows', () => {
  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  test('dashboard: login via UI and assert page loads with expected structure', async ({
    page,
    request,
  }) => {
    // Ensure the user has a team so the JWT from loginViaUI embeds a team_id.
    const session = loadCachedToken();
    await getOrCreateTeam(request, session);

    await loginViaUI(page);

    // After login, should land on the dashboard
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // All four stat cards must be present
    await expect(page.getByText('Total Reports')).toBeVisible();
    await expect(page.getByText('Total Executions')).toBeVisible();
    await expect(page.getByText('Pass Rate').first()).toBeVisible();
    await expect(page.getByText('Flaky Tests')).toBeVisible();

    // Section headings
    await expect(page.getByText('Pass Rate Trends')).toBeVisible();
    await expect(page.getByText('Recent Reports')).toBeVisible();
    await expect(page.getByText('Recent Executions')).toBeVisible();

    // Authenticated navigation is visible
    await expect(page.getByRole('link', { name: 'ScaledTest' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/browser-ui-dashboard.png' });
  });

  // ---------------------------------------------------------------------------
  // Test Results
  // ---------------------------------------------------------------------------

  test('test-results: navigate to /reports and assert page structure', async ({
    page,
    request,
  }) => {
    const session = loadCachedToken();
    await getOrCreateTeam(request, session);

    // Navigate via SPA link click (not page.goto) to preserve auth state
    // in Zustand memory — a full page reload would lose the access token.
    await loginViaUI(page);
    await page.getByRole('link', { name: 'Reports' }).click();

    // Page heading and search bar
    await expect(page.getByRole('heading', { name: 'Test Reports' })).toBeVisible();
    await expect(page.getByPlaceholder(/search reports/i)).toBeVisible();

    // Status filter buttons (use .first() — report rows may also contain buttons with these labels)
    await expect(page.getByRole('button', { name: 'All' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Failed' }).first()).toBeVisible();

    // Authenticated navigation is visible
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/browser-ui-test-results.png' });
  });

  // ---------------------------------------------------------------------------
  // Quality Gates
  // ---------------------------------------------------------------------------

  test('quality-gates: navigate to /quality-gates and assert page loads', async ({
    page,
    request,
  }) => {
    const session = loadCachedToken();
    await getOrCreateTeam(request, session);

    await loginViaUI(page);
    await page.getByRole('link', { name: 'Quality Gates' }).click();

    await expect(page.getByRole('heading', { name: 'Quality Gates', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Quality Gate' })).toBeVisible();
    await expect(page.getByText('Define pass/fail criteria')).toBeVisible();

    // Either a list of quality gates or the empty-state placeholder is shown
    await expect(page.locator('.rounded-lg.border.bg-card').first()).toBeVisible();

    await page.screenshot({ path: 'screenshots/browser-ui-quality-gates.png' });
  });

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  test('webhooks: navigate to /webhooks and assert page loads', async ({ page, request }) => {
    const session = loadCachedToken();
    await getOrCreateTeam(request, session);

    await loginViaUI(page);
    await page.getByRole('link', { name: 'Webhooks' }).click();

    await expect(page.getByRole('heading', { name: 'Webhooks', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Webhook' })).toBeVisible();
    await expect(page.getByText('Receive HTTP notifications')).toBeVisible();

    // User is authenticated
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/browser-ui-webhooks.png' });
  });

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  test('admin: login as owner via UI and assert admin page renders', async ({ page }) => {
    // Log in as the owner user (role='owner' in users table, seeded in global-setup
    // via the invitation flow). The admin page requires owner role; a maintainer
    // would see "Access Denied".
    await loginViaUI(page, OWNER);
    await page.getByRole('link', { name: 'Admin' }).click();

    // Owner sees the full admin page — not the "Access Denied" fallback
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();

    // Admin sections are present
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible();

    // Owner remains authenticated
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/browser-ui-admin.png' });
  });
});

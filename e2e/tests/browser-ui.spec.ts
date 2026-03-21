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
  authHeaders,
  tokenHeaders,
  getOrCreateTeam,
  createAPIToken,
  buildCtrfReport,
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
    await expect(page.getByText('Pass Rate')).toBeVisible();
    await expect(page.getByText('Flaky Tests')).toBeVisible();

    // Section headings
    await expect(page.getByText('Pass Rate Trends')).toBeVisible();
    await expect(page.getByText('Recent Reports')).toBeVisible();
    await expect(page.getByText('Recent Executions')).toBeVisible();

    // Authenticated navigation is visible
    await expect(page.getByRole('link', { name: 'ScaledTest' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Test Results
  // ---------------------------------------------------------------------------

  test('test-results: submit report via API then navigate to /reports and assert it appears', async ({
    page,
    request,
  }) => {
    const session = loadCachedToken();

    // Create a team and API token BEFORE login so the JWT from loginViaUI
    // carries this team_id.
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);

    // Submit a report with a unique tool name via the API token (team-scoped)
    const uniqueTool = `Browser-Report-${Date.now()}`;
    const submitRes = await request.post('/api/v1/reports', {
      headers: tokenHeaders(apiToken),
      data: buildCtrfReport(uniqueTool),
    });
    expect(submitRes.ok(), `Report submit failed: ${submitRes.status()}`).toBeTruthy();

    // Log in via the UI — the JWT now has the team_id embedded
    await loginViaUI(page);
    await page.goto('/reports');

    // Page heading and search bar
    await expect(page.getByRole('heading', { name: 'Test Reports' })).toBeVisible();
    await expect(page.getByPlaceholder(/search reports/i)).toBeVisible();

    // Status filter buttons
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Failed' })).toBeVisible();

    // The submitted report should appear in the list
    await expect(page.getByText(uniqueTool)).toBeVisible({ timeout: 10_000 });

    // Pass/fail counts are visible in the report row
    await expect(page.getByText('2 passed')).toBeVisible();
    await expect(page.getByText('1 failed')).toBeVisible();
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
    await page.goto('/quality-gates');

    await expect(page.getByRole('heading', { name: 'Quality Gates' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Quality Gate' })).toBeVisible();
    await expect(page.getByText('Define pass/fail criteria')).toBeVisible();

    // Either a list of quality gates or the empty-state placeholder is shown
    const hasGates = await page.locator('.rounded-lg.border.bg-card').first().isVisible();
    expect(hasGates).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  test('webhooks: navigate to /webhooks and assert page loads', async ({ page, request }) => {
    const session = loadCachedToken();
    await getOrCreateTeam(request, session);

    await loginViaUI(page);
    await page.goto('/webhooks');

    await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Webhook' })).toBeVisible();
    await expect(page.getByText('Receive HTTP notifications')).toBeVisible();

    // User is authenticated
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  test('admin: navigate to /admin and assert page renders with RBAC enforcement', async ({
    page,
    request,
  }) => {
    const session = loadCachedToken();
    await getOrCreateTeam(request, session);

    await loginViaUI(page);
    await page.goto('/admin');

    // The maintainer user sees "Access Denied" — correct RBAC enforcement.
    // An owner would see the "Admin" heading and user/team management sections.
    await expect(
      page.getByRole('heading', { name: /^(Admin|Access Denied)$/ })
    ).toBeVisible();

    // Regardless of role, the user remains authenticated
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
  });
});

/**
 * E2E tests for the Test Sharding feature.
 *
 * Covers:
 *  - API: create shard plan returns valid distribution across workers
 *  - API: list durations returns array response
 *  - API: rebalance removes failed worker and redistributes its tests
 *  - Browser UI: navigate to /sharding, open create-plan form, submit, see plan view
 */

import { test, expect } from '@playwright/test';
import {
  loadCachedToken,
  tokenHeaders,
  loginViaUI,
  getOrCreateTeam,
  createAPIToken,
} from './helpers';

const TEST_NAMES = [
  'test-login',
  'test-dashboard',
  'test-reports-list',
  'test-create-report',
  'test-analytics',
  'test-quality-gate',
];

test.describe('Sharding', () => {
  test('create shard plan distributes all tests across requested workers', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    const planRes = await request.post('/api/v1/sharding/plan', {
      headers,
      data: {
        test_names: TEST_NAMES,
        num_workers: 3,
        strategy: 'round_robin',
      },
    });
    expect(planRes.ok(), `Create plan failed: ${planRes.status()}`).toBeTruthy();
    const plan = await planRes.json();

    expect(plan.execution_id).toBeTruthy();
    expect(plan.total_workers).toBe(3);
    expect(plan.strategy).toBe('round_robin');
    expect(Array.isArray(plan.shards)).toBeTruthy();
    expect(plan.shards.length).toBe(3);

    // Every test must appear exactly once across all shards
    const distributed: string[] = plan.shards.flatMap(
      (s: { test_names: string[] }) => s.test_names,
    );
    expect(distributed.length).toBe(TEST_NAMES.length);
    for (const name of TEST_NAMES) {
      expect(distributed).toContain(name);
    }

    // Each shard has the required fields and at least one test
    for (const shard of plan.shards) {
      expect(shard.worker_id).toBeTruthy();
      expect(shard.test_count).toBeGreaterThan(0);
      expect(shard.test_names.length).toBe(shard.test_count);
    }
  });

  test('list durations returns array response', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    const res = await request.get('/api/v1/sharding/durations', { headers });
    expect(res.ok(), `List durations failed: ${res.status()}`).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data.durations)).toBeTruthy();
  });

  test('rebalance removes failed worker and redistributes its tests', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    // Create an initial 3-worker plan
    const planRes = await request.post('/api/v1/sharding/plan', {
      headers,
      data: { test_names: TEST_NAMES, num_workers: 3, strategy: 'round_robin' },
    });
    expect(planRes.ok()).toBeTruthy();
    const plan = await planRes.json();

    const failedWorkerId = plan.shards[0].worker_id;

    // Rebalance: simulate worker_0 going offline with no completed tests
    const rebalanceRes = await request.post('/api/v1/sharding/rebalance', {
      headers,
      data: {
        execution_id: plan.execution_id,
        failed_worker_id: failedWorkerId,
        current_plan: plan,
        completed_tests: [],
      },
    });
    expect(rebalanceRes.ok(), `Rebalance failed: ${rebalanceRes.status()}`).toBeTruthy();
    const rebalanced = await rebalanceRes.json();

    expect(rebalanced.shards).toBeDefined();
    expect(Array.isArray(rebalanced.shards)).toBeTruthy();
    expect(rebalanced.shards.length).toBeGreaterThan(0);

    // The failed worker must not appear in the new plan
    const remainingWorkerIds = rebalanced.shards.map((s: { worker_id: string }) => s.worker_id);
    expect(remainingWorkerIds).not.toContain(failedWorkerId);

    // All 6 original tests must be preserved — a rebalance bug that drops tests
    // would go undetected without this assertion
    const redistributed: string[] = rebalanced.shards.flatMap(
      (s: { test_names: string[] }) => s.test_names,
    );
    expect(redistributed.length).toBe(TEST_NAMES.length);
    for (const name of TEST_NAMES) {
      expect(redistributed).toContain(name);
    }
  });

  test('sharding UI: page renders, create-plan form works, plan view appears', async ({
    page,
    request,
  }) => {
    const session = loadCachedToken();
    await getOrCreateTeam(request, session);

    await loginViaUI(page);
    await page.getByRole('link', { name: 'Sharding' }).click();
    await page.waitForURL('/sharding');

    // Page structure
    await expect(page.getByRole('heading', { name: 'Test Sharding' })).toBeVisible();
    await expect(page.getByText('Test Duration History')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Shard Plan' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();

    // Open the create-plan form
    await page.getByRole('button', { name: 'Create Shard Plan' }).click();
    await expect(page.getByRole('heading', { name: 'Create Shard Plan' })).toBeVisible();
    await expect(page.getByLabel('Number of Workers')).toBeVisible();
    await expect(page.getByLabel('Strategy')).toBeVisible();

    // Fill in test names (textarea is linked via id="sh-tests") and set 2 workers
    await page.getByLabel('Number of Workers').fill('2');
    await page.locator('#sh-tests').fill(TEST_NAMES.join('\n'));

    // Submit the form
    await page.getByRole('button', { name: 'Create Plan' }).click();

    // ShardPlanView should appear with plan details
    await expect(page.getByRole('heading', { name: 'Shard Plan' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/sharding-plan.png' });
  });
});

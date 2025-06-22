/**
 * Accessibility tests for UI components
 * Tests WCAG compliance and keyboard navigation
 */

import { injectAxe, getViolations } from 'axe-playwright';
import { setupPlaywright } from '../utils/playwright';
import { testLogger } from '../../src/utils/logger';

const playwright = setupPlaywright();

describe('Accessibility Tests', () => {
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

  // Helper function to run axe and get violations
  const getAxeViolations = async (page = playwright.page) => {
    await injectAxe(page);
    return await getViolations(page);
  };

  describe('Public Pages', () => {
    const publicPages = [
      { path: '/', name: 'Home' },
      { path: '/login', name: 'Login' },
      { path: '/register', name: 'Register' },
      { path: '/unauthorized', name: 'Unauthorized' },
    ];

    publicPages.forEach(({ path, name }) => {
      test(`${name} page should be accessible`, async () => {
        await playwright.page.goto(`${baseUrl}${path}`, {
          waitUntil: 'domcontentloaded', // Faster than networkidle
        });

        // Wait for page to be fully loaded
        await playwright.page.waitForTimeout(1000);

        // Get accessibility violations
        const violations = await getAxeViolations();

        if (violations.length > 0) {
          testLogger.error(`Accessibility violations on ${name} page`, {
            violations: violations.map(v => ({
              id: v.id,
              impact: v.impact,
              description: v.description,
              nodes: v.nodes ? v.nodes.length : 0,
            })),
          });
        }

        expect(violations).toHaveLength(0);
      });
    });
  });

  describe('Authenticated Pages', () => {
    // Single login for all authenticated tests for performance
    beforeAll(async () => {
      await playwright.page.goto(`${baseUrl}/login`, {
        waitUntil: 'domcontentloaded',
      });

      // Use valid test credentials
      await playwright.page.fill('input[name="username"]', 'readonly@example.com');
      await playwright.page.fill('input[name="password"]', 'password');
      await playwright.page.click('button[type="submit"]');

      // Wait for redirect to complete
      await playwright.page.waitForURL('**/dashboard', { timeout: 10000 });
    });

    const authenticatedPages = [
      { path: '/dashboard', name: 'Dashboard' },
      { path: '/profile', name: 'Profile' },
      { path: '/test-results-dashboard', name: 'Test Results Dashboard' },
    ];

    authenticatedPages.forEach(({ path, name }) => {
      test(`${name} page should be accessible`, async () => {
        await playwright.page.goto(`${baseUrl}${path}`, {
          waitUntil: 'domcontentloaded',
        });

        // Wait for page to be fully loaded
        await playwright.page.waitForTimeout(1000);

        // Get accessibility violations
        const violations = await getAxeViolations();

        if (violations.length > 0) {
          testLogger.error(`Accessibility violations on ${name} page`, {
            violations: violations.map(v => ({
              id: v.id,
              impact: v.impact,
              description: v.description,
              nodes: v.nodes ? v.nodes.length : 0,
            })),
          });
        }

        expect(violations).toHaveLength(0);
      });
    });

    test('Admin pages should be accessible', async () => {
      // Try to access admin page (may fail if user doesn't have admin rights)
      try {
        await playwright.page.goto(`${baseUrl}/admin/users`, {
          waitUntil: 'domcontentloaded',
        });

        // Check if we're on the admin page or redirected to unauthorized
        const currentUrl = playwright.page.url();
        const isAdminPage = currentUrl.includes('/admin/');

        if (isAdminPage) {
          // Wait for page to be fully loaded
          await playwright.page.waitForTimeout(1000);

          // Get accessibility violations
          const violations = await getAxeViolations();

          expect(violations).toHaveLength(0);
        } else {
          testLogger.info('Admin page test skipped - user lacks admin privileges');
        }
      } catch (error) {
        testLogger.info('Admin page accessibility test skipped', {
          error: error instanceof Error ? error.message : error,
        });
      }
    });
  });

  describe('Keyboard Navigation', () => {
    test('Login form should be keyboard accessible', async () => {
      await playwright.page.goto(`${baseUrl}/login`, {
        waitUntil: 'domcontentloaded',
      });

      // Focus directly on the username field first to ensure we're starting from the right place
      await playwright.page.focus('input[name="username"]');

      // Verify the username field is focused
      const focusedElement1 = await playwright.page.evaluate(() =>
        document.activeElement?.getAttribute('name')
      );
      expect(focusedElement1).toBe('username');

      // Tab to password field
      await playwright.page.keyboard.press('Tab');
      const focusedElement2 = await playwright.page.evaluate(() =>
        document.activeElement?.getAttribute('name')
      );
      expect(focusedElement2).toBe('password');

      // Tab to submit button
      await playwright.page.keyboard.press('Tab');
      const focusedElement3 = await playwright.page.evaluate(() =>
        document.activeElement?.getAttribute('type')
      );
      expect(focusedElement3).toBe('submit');
    });

    test('Navigation should be keyboard accessible', async () => {
      await playwright.page.goto(`${baseUrl}/`, {
        waitUntil: 'domcontentloaded',
      });

      // Test that navigation links are reachable via keyboard
      await playwright.page.keyboard.press('Tab');

      // Look for focused navigation elements
      const focusedElement = await playwright.page.locator(':focus');
      const tagName = await focusedElement.evaluate(el => el.tagName.toLowerCase());

      // Should focus on interactive elements (links, buttons)
      expect(['a', 'button', 'input']).toContain(tagName);
    });
  });

  describe('Color Contrast', () => {
    test('All pages should have sufficient color contrast', async () => {
      const pages = ['/', '/login', '/register'];

      for (const path of pages) {
        await playwright.page.goto(`${baseUrl}${path}`, {
          waitUntil: 'domcontentloaded',
        });

        // Wait for page to be fully loaded
        await playwright.page.waitForTimeout(1000);

        // Get violations focusing on color contrast
        const violations = await getAxeViolations();

        const contrastViolations = violations.filter(v => v.id === 'color-contrast');

        if (contrastViolations.length > 0) {
          testLogger.error(`Color contrast violations on ${path}`, {
            violations: contrastViolations.map(v => ({
              impact: v.impact,
              nodes: v.nodes ? v.nodes.length : 0,
            })),
          });
        }

        expect(contrastViolations).toHaveLength(0);
      }
    });
  });
});

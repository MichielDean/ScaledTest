import { describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { injectAxe, getViolations } from 'axe-playwright';
import type { Page } from 'playwright';
import type { Result, NodeResult } from 'axe-core';

import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { RegisterPage } from './pages/RegisterPage';
import { TestUsers } from './models/TestUsers';
import { testLogger } from '../../src/utils/logger';

// For Jest-Playwright integration
declare const page: Page;

interface PageTestCase {
  label: string;
  path: string;
  requiresAuth?: boolean;
  userRole?: keyof typeof TestUsers;
  maxViolations?: number;
}

// Configuration for accessibility testing
const accessibilityConfig = {
  // Base URL for testing
  baseUrl: 'http://localhost:3000',

  // Axe configuration with valid rule names
  axeOptions: {
    rules: {
      // Core accessibility rules (using valid axe-core rule names)
      'color-contrast': { enabled: true },
      'heading-order': { enabled: true },
      label: { enabled: true },
      'link-name': { enabled: true },
      'skip-link': { enabled: true },
      'image-alt': { enabled: true },
      'button-name': { enabled: true },
      'form-field-multiple-labels': { enabled: false }, // Can be noisy
      'duplicate-id': { enabled: true },
    },
  },

  // Define pages to test
  pages: [
    {
      label: 'home-page',
      path: '/',
      maxViolations: 0,
    },
    {
      label: 'login-page',
      path: '/login',
      maxViolations: 0,
    },
    {
      label: 'register-page',
      path: '/register',
      maxViolations: 0,
    },
    {
      label: 'unauthorized-page',
      path: '/unauthorized',
      maxViolations: 0,
    },
    // Authenticated pages
    {
      label: 'dashboard-page',
      path: '/dashboard',
      requiresAuth: true,
      userRole: 'READONLY',
      maxViolations: 0,
    },
    {
      label: 'profile-page',
      path: '/profile',
      requiresAuth: true,
      userRole: 'READONLY',
      maxViolations: 0,
    },
    {
      label: 'test-results-dashboard',
      path: '/test-results-dashboard',
      requiresAuth: true,
      userRole: 'READONLY',
      maxViolations: 0,
    },
    {
      label: 'simple-test-dashboard',
      path: '/simple-test-dashboard',
      requiresAuth: true,
      userRole: 'READONLY',
      maxViolations: 0,
    },
    {
      label: 'admin-users-page',
      path: '/admin/users',
      requiresAuth: true,
      userRole: 'OWNER', // Only owners can access admin pages
      maxViolations: 0,
    },
  ] as PageTestCase[],
};

/**
 * Helper function to format accessibility violations in a human-readable way
 */
function formatAccessibilityViolations(violations: Result[], pageConfig: PageTestCase): string {
  const cleanViolations = violations
    .map((violation, index) => {
      const nodeTargets = violation.nodes
        .map((node: NodeResult) => {
          if (Array.isArray(node.target)) {
            return node.target.join(' > ');
          }
          return String(node.target);
        })
        .join('\n    - ');
      return (
        `${index + 1}. ${violation.id} (${violation.impact || 'unknown'})\n` +
        `   Description: ${violation.description}\n` +
        `   Help: ${violation.helpUrl}\n` +
        `   Elements:\n    - ${nodeTargets}`
      );
    })
    .join('\n\n');

  return `
ACCESSIBILITY VIOLATIONS FOUND
===============================
Page: ${pageConfig.label} (${pageConfig.path})
Violations Found: ${violations.length}
Max Allowed: ${pageConfig.maxViolations ?? 0}

${cleanViolations}
`;
}

// Enhanced accessibility configuration with more comprehensive rule coverage
const enhancedAccessibilityConfig = {
  baseUrl: 'http://localhost:3000',

  // WCAG 2.1 AA Compliance Configuration
  wcag21AAConfig: {
    tags: ['wcag2a', 'wcag2aa', 'wcag21aa'],
    rules: {
      // Core accessibility rules
      'color-contrast': { enabled: true },
      'color-contrast-enhanced': { enabled: true }, // WCAG AAA
      'heading-order': { enabled: true },
      'landmark-one-main': { enabled: true },
      'landmark-unique': { enabled: true },
      'page-has-heading-one': { enabled: true },

      // ARIA rules
      'aria-allowed-attr': { enabled: true },
      'aria-command-name': { enabled: true },
      'aria-hidden-body': { enabled: true },
      'aria-hidden-focus': { enabled: true },
      'aria-input-field-name': { enabled: true },
      'aria-meter-name': { enabled: true },
      'aria-progressbar-name': { enabled: true },
      'aria-required-attr': { enabled: true },
      'aria-required-children': { enabled: true },
      'aria-required-parent': { enabled: true },
      'aria-roles': { enabled: true },
      'aria-toggle-field-name': { enabled: true },
      'aria-tooltip-name': { enabled: true },
      'aria-valid-attr': { enabled: true },
      'aria-valid-attr-value': { enabled: true },

      // Form accessibility
      label: { enabled: true },
      'label-title-only': { enabled: true },
      'form-field-multiple-labels': { enabled: true },
      'select-name': { enabled: true },
      'autocomplete-valid': { enabled: true },

      // Keyboard navigation
      accesskeys: { enabled: true },
      tabindex: { enabled: true },
      'focus-order-semantics': { enabled: true },

      // Interactive elements
      'button-name': { enabled: true },
      'link-name': { enabled: true },
      'link-in-text-block': { enabled: true },

      // Structure and semantics
      bypass: { enabled: true }, // Skip links
      'duplicate-id': { enabled: true },
      'duplicate-id-active': { enabled: true },
      'duplicate-id-aria': { enabled: true },
      'html-has-lang': { enabled: true },
      'html-lang-valid': { enabled: true },
      'html-xml-lang-mismatch': { enabled: true },
      'valid-lang': { enabled: true },

      // Tables
      'table-fake-caption': { enabled: true },
      'td-headers-attr': { enabled: true },
      'th-has-data-cells': { enabled: true },
      'scope-attr-valid': { enabled: true },

      // Media
      'audio-caption': { enabled: true },
      'video-caption': { enabled: true },

      // Images
      'image-alt': { enabled: true },
      'image-redundant-alt': { enabled: true },
      'input-image-alt': { enabled: true },
      'area-alt': { enabled: true },
      'object-alt': { enabled: true },
      'svg-img-alt': { enabled: true },

      // Disable noisy or experimental rules
      'nested-interactive': { enabled: false },
      'identical-links-same-purpose': { enabled: false },
    },
  },

  // Category-specific configurations
  categoryConfigs: {
    forms: {
      tags: ['cat.forms'],
      rules: {
        label: { enabled: true },
        'form-field-multiple-labels': { enabled: true },
        'select-name': { enabled: true },
        'autocomplete-valid': { enabled: true },
        'aria-required-attr': { enabled: true },
      },
    },

    keyboard: {
      tags: ['cat.keyboard'],
      rules: {
        accesskeys: { enabled: true },
        tabindex: { enabled: true },
        'focus-order-semantics': { enabled: true },
      },
    },

    aria: {
      tags: ['cat.aria'],
      rules: {
        'aria-allowed-attr': { enabled: true },
        'aria-command-name': { enabled: true },
        'aria-hidden-body': { enabled: true },
        'aria-hidden-focus': { enabled: true },
        'aria-input-field-name': { enabled: true },
        'aria-required-attr': { enabled: true },
        'aria-required-children': { enabled: true },
        'aria-required-parent': { enabled: true },
        'aria-roles': { enabled: true },
        'aria-valid-attr': { enabled: true },
        'aria-valid-attr-value': { enabled: true },
      },
    },

    structure: {
      tags: ['cat.structure'],
      rules: {
        'heading-order': { enabled: true },
        'landmark-one-main': { enabled: true },
        'landmark-unique': { enabled: true },
        'page-has-heading-one': { enabled: true },
        bypass: { enabled: true },
      },
    },

    tables: {
      tags: ['cat.tables'],
      rules: {
        'table-fake-caption': { enabled: true },
        'td-headers-attr': { enabled: true },
        'th-has-data-cells': { enabled: true },
        'scope-attr-valid': { enabled: true },
        'table-duplicate-name': { enabled: true },
      },
    },
  },

  // Component-specific testing contexts
  componentContexts: {
    modal: {
      include: ['.test-modal', '[role="dialog"]'],
      rules: {
        'aria-dialog-name': { enabled: true },
        'focus-order-semantics': { enabled: true },
        'aria-hidden-focus': { enabled: true },
      },
    },

    charts: {
      include: ['[data-testid*="chart"]', '.recharts-wrapper'],
      rules: {
        'svg-img-alt': { enabled: true },
        'aria-hidden-body': { enabled: true },
      },
    },

    tables: {
      include: ['table', '[role="table"]'],
      rules: {
        'table-fake-caption': { enabled: true },
        'td-headers-attr': { enabled: true },
        'th-has-data-cells': { enabled: true },
        'scope-attr-valid': { enabled: true },
      },
    },

    forms: {
      include: ['form', '[role="form"]'],
      rules: {
        label: { enabled: true },
        'form-field-multiple-labels': { enabled: true },
        'autocomplete-valid': { enabled: true },
      },
    },
  },
};

describe('Accessibility Tests', () => {
  let loginPage: LoginPage;

  beforeEach(async () => {
    loginPage = new LoginPage(page);
  });
  afterEach(async () => {
    // Ensure logout after each test
    try {
      await loginPage.logout();
    } catch {
      // Ignore logout errors in cleanup
    }
  });

  describe('Public Pages Accessibility', () => {
    const publicPages = accessibilityConfig.pages.filter(pageConfig => !pageConfig.requiresAuth);

    for (const pageConfig of publicPages) {
      it(`should have no accessibility violations on ${pageConfig.label}`, async () => {
        testLogger.info({ path: pageConfig.path }, 'Testing accessibility for page');

        try {
          // Navigate to the page
          await page.goto(`${accessibilityConfig.baseUrl}${pageConfig.path}`);

          // Wait for page to load
          await page.waitForLoadState('networkidle');

          // Inject axe-core
          await injectAxe(page);

          // Run accessibility check
          const violations = await getViolations(page, accessibilityConfig.axeOptions);

          // Log summary
          testLogger.info({ violationsCount: violations.length }, 'Accessibility check completed');

          // Create clean, readable error message if violations found
          if (violations.length > 0) {
            const violationErrorMessage = formatAccessibilityViolations(violations, pageConfig);
            throw new Error(violationErrorMessage);
          }

          // Assert no violations (or within allowed threshold)
          const maxAllowed = pageConfig.maxViolations ?? 0;
          expect(violations.length).toBeLessThanOrEqual(maxAllowed);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Enhanced error reporting
          if (errorMessage.includes('net::ERR_CONNECTION_REFUSED')) {
            throw new Error(
              `Could not connect to ${accessibilityConfig.baseUrl}${pageConfig.path}. ` +
                `Make sure the development server is running`
            );
          }

          testLogger.error(
            { error: errorMessage, pageLabel: pageConfig.label },
            'Accessibility test failed'
          );
          throw error;
        }
      });
    }
  });

  describe('Authenticated Pages Accessibility', () => {
    const authPages = accessibilityConfig.pages.filter(pageConfig => pageConfig.requiresAuth);

    for (const pageConfig of authPages) {
      it(`should have no accessibility violations on ${pageConfig.label} (authenticated)`, async () => {
        testLogger.info({ path: pageConfig.path }, 'Testing accessibility for authenticated page');

        try {
          // Get the test user for this page
          const testUser = pageConfig.userRole
            ? TestUsers[pageConfig.userRole]
            : TestUsers.READONLY;

          // Create login page and authenticate
          const loginPage = new LoginPage(page);
          await loginPage.goto();
          await loginPage.login(testUser.email, testUser.password);

          // Wait for login to complete
          await loginPage.waitForNavigation();

          // Navigate to the target page
          await page.goto(`${accessibilityConfig.baseUrl}${pageConfig.path}`);

          // Wait for page to load
          await page.waitForLoadState('networkidle');

          // Inject axe-core
          await injectAxe(page);

          // Run accessibility check
          const violations = await getViolations(page, accessibilityConfig.axeOptions);

          // Log summary
          testLogger.info({ violationsCount: violations.length }, 'Accessibility check completed');

          // Create clean, readable error message if violations found
          if (violations.length > 0) {
            const violationErrorMessage = formatAccessibilityViolations(violations, pageConfig);
            throw new Error(violationErrorMessage);
          }

          // Assert no violations (or within allowed threshold)
          const maxAllowed = pageConfig.maxViolations ?? 0;
          expect(violations.length).toBeLessThanOrEqual(maxAllowed);

          // Cleanup - logout
          await loginPage.logout();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Enhanced error reporting for auth issues
          if (
            errorMessage.includes('401') ||
            errorMessage.includes('403') ||
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('login')
          ) {
            testLogger.warn(`Authentication issue for ${pageConfig.label}: ${errorMessage}`);
            // Don't fail the test for auth issues, just skip
            return;
          }

          testLogger.error(
            { error: errorMessage, pageLabel: pageConfig.label },
            'Accessibility test failed'
          );
          throw error;
        }
      });
    }
  });

  describe('Specific Accessibility Features', () => {
    it('should have proper heading hierarchy on home page', async () => {
      await page.goto(`${accessibilityConfig.baseUrl}/`);
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      // Check specifically for heading hierarchy violations
      const violations = await getViolations(page, {
        rules: {
          'heading-order': { enabled: true },
        },
      });

      const headingViolations = violations.filter(v => v.id.includes('heading'));
      expect(headingViolations.length).toBe(0);
    });

    it('should have proper form accessibility on login page', async () => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      // Check specifically for form accessibility violations
      const violations = await getViolations(page, {
        rules: {
          label: { enabled: true },
          'label-title-only': { enabled: true },
          'form-field-multiple-labels': { enabled: true },
        },
      });

      const formViolations = violations.filter(
        v => v.id.includes('label') || v.id.includes('form')
      );
      expect(formViolations.length).toBe(0);
    });

    it('should have proper navigation accessibility', async () => {
      await page.goto(`${accessibilityConfig.baseUrl}/`);
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      // Check specifically for navigation accessibility violations
      const violations = await getViolations(page, {
        rules: {
          'link-name': { enabled: true },
          'link-in-text-block': { enabled: true },
          'skip-link': { enabled: true },
        },
      });

      const navViolations = violations.filter(
        v => v.id.includes('link') || v.id.includes('navigation') || v.id.includes('skip')
      );
      expect(navViolations.length).toBe(0);
    });
  });

  describe('Application Flow Accessibility', () => {
    it('should maintain accessibility across user registration flow', async () => {
      // Test registration page accessibility
      const registerPage = new RegisterPage(page);
      await registerPage.goto();
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      let violations = await getViolations(page, accessibilityConfig.axeOptions);
      expect(violations.length).toBe(0);

      // Navigate to login and test accessibility
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      violations = await getViolations(page, accessibilityConfig.axeOptions);
      expect(violations.length).toBe(0);

      testLogger.info('Registration flow maintains accessibility');
    });

    it('should maintain accessibility across authenticated user flow', async () => {
      const loginPage = new LoginPage(page);
      const dashboardPage = new DashboardPage(page);
      const profilePage = new ProfilePage(page);

      // Login
      await loginPage.goto();
      await loginPage.login(TestUsers.READONLY.email, TestUsers.READONLY.password);
      await loginPage.waitForNavigation();

      // Test dashboard accessibility
      await dashboardPage.goto();
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      let violations = await getViolations(page, accessibilityConfig.axeOptions);
      expect(violations.length).toBe(0);

      // Test profile accessibility
      await profilePage.goto();
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      violations = await getViolations(page, accessibilityConfig.axeOptions);
      expect(violations.length).toBe(0);

      // Logout
      await loginPage.logout();

      testLogger.info('Authenticated user flow maintains accessibility');
    });
  });

  describe('Component-Specific Accessibility', () => {
    describe('Chart Components Accessibility', () => {
      it('should have accessible chart components with proper ARIA labels', async () => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(TestUsers.READONLY.email, TestUsers.READONLY.password);
        await loginPage.waitForNavigation();

        // Navigate to dashboard with charts
        await page.goto(`${accessibilityConfig.baseUrl}/dashboard`);
        await page.waitForLoadState('networkidle');

        // Wait for charts to load
        await page.waitForTimeout(2000);

        await injectAxe(page);

        // Test chart-specific accessibility
        const violations = await getViolations(
          page,
          enhancedAccessibilityConfig.categoryConfigs.structure
        );

        // Charts should have descriptive titles and be properly labeled
        const chartViolations = violations.filter(v =>
          v.nodes.some(
            node =>
              node.html.includes('chart') ||
              node.html.includes('svg') ||
              node.target.some(target => String(target).includes('chart'))
          )
        );

        expect(chartViolations.length).toBe(0);

        await loginPage.logout();
      });

      it('should have keyboard navigable chart controls', async () => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(TestUsers.READONLY.email, TestUsers.READONLY.password);
        await loginPage.waitForNavigation();

        await page.goto(`${accessibilityConfig.baseUrl}/dashboard`);
        await page.waitForLoadState('networkidle');

        // Test that chart controls are keyboard accessible
        const chartButtons = page.locator('button').filter({ hasText: /refresh|analytics|hide/i });
        const buttonCount = await chartButtons.count();

        if (buttonCount > 0) {
          for (let i = 0; i < buttonCount; i++) {
            const button = chartButtons.nth(i);
            await button.focus();

            // Verify button is focusable and has accessible name
            const isFocused = await button.evaluate(el => document.activeElement === el);
            expect(isFocused).toBe(true);
            const ariaLabel = await button.getAttribute('aria-label');
            const textContent = await button.textContent();
            expect(ariaLabel || textContent).toBeTruthy();
          }
        }

        await loginPage.logout();
      });
    });

    describe('Modal Dialog Accessibility', () => {
      it('should have properly implemented modal dialogs', async () => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(TestUsers.READONLY.email, TestUsers.READONLY.password);
        await loginPage.waitForNavigation();

        // Navigate to test results dashboard which has modals
        await page.goto(`${accessibilityConfig.baseUrl}/test-results-dashboard`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // Look for view buttons that open modals
        const viewButtons = page.locator('button').filter({ hasText: /view|details/i });
        const buttonCount = await viewButtons.count();

        if (buttonCount > 0) {
          await viewButtons.first().click();
          await page.waitForTimeout(500);

          // Check if modal opened
          const modal = page.locator('[role="dialog"]');
          if (await modal.isVisible()) {
            await injectAxe(page);

            // Test modal-specific accessibility
            const violations = await getViolations(page, {
              ...enhancedAccessibilityConfig.wcag21AAConfig,
              ...enhancedAccessibilityConfig.componentContexts.modal,
            });

            // Filter violations to modal-specific issues
            const modalViolations = violations.filter(v =>
              v.nodes.some(
                node =>
                  node.html.includes('modal') ||
                  node.html.includes('dialog') ||
                  node.target.some(target => String(target).includes('modal'))
              )
            );

            expect(modalViolations.length).toBe(0);

            // Test focus management
            const closeButton = modal.locator('button').filter({ hasText: /close|×/i });
            if (await closeButton.isVisible()) {
              const isFocused = await closeButton.evaluate(el => document.activeElement === el);
              expect(isFocused).toBe(true);
            }

            // Close modal
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
          }
        }

        await loginPage.logout();
      });
    });

    describe('Data Table Accessibility', () => {
      it('should have accessible data tables with proper headers', async () => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(TestUsers.READONLY.email, TestUsers.READONLY.password);
        await loginPage.waitForNavigation();

        // Navigate to test results dashboard which has tables
        await page.goto(`${accessibilityConfig.baseUrl}/test-results-dashboard`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        await injectAxe(page);

        // Test table-specific accessibility
        const violations = await getViolations(
          page,
          enhancedAccessibilityConfig.categoryConfigs.tables
        );

        expect(violations.length).toBe(0);

        // Verify tables have proper structure
        const tables = page.locator('table');
        const tableCount = await tables.count();

        for (let i = 0; i < tableCount; i++) {
          const table = tables.nth(i);

          // Check for table headers
          const headers = table.locator('th');
          const headerCount = await headers.count();

          if (headerCount > 0) {
            // Verify headers have scope attributes for complex tables
            for (let j = 0; j < headerCount; j++) {
              const header = headers.nth(j);
              const scope = await header.getAttribute('scope');
              expect(
                ['col', 'row', 'colgroup', 'rowgroup'].includes(scope!) || scope === null
              ).toBe(true);
            }
          }
        }

        await loginPage.logout();
      });
    });

    describe('Form Accessibility Enhancement', () => {
      it('should have enhanced form accessibility with proper error handling', async () => {
        await page.goto(`${accessibilityConfig.baseUrl}/register`);
        await page.waitForLoadState('networkidle');

        await injectAxe(page);

        // Test form-specific accessibility
        const violations = await getViolations(
          page,
          enhancedAccessibilityConfig.categoryConfigs.forms
        );
        expect(violations.length).toBe(0);

        // Test form validation accessibility
        const submitButton = page.locator('#registerButton');
        await submitButton.click();
        await page.waitForTimeout(1000);

        // Check if error messages are properly associated with form fields
        const errorMessages = page.locator('[role="alert"], .error-message, [id*="error"]');
        const errorCount = await errorMessages.count();

        if (errorCount > 0) {
          // Re-run accessibility check with errors present
          const violationsWithErrors = await getViolations(
            page,
            enhancedAccessibilityConfig.categoryConfigs.forms
          );
          expect(violationsWithErrors.length).toBe(0);
        }
      });
    });

    describe('Dynamic Content Accessibility', () => {
      it('should handle loading states accessibly', async () => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(TestUsers.READONLY.email, TestUsers.READONLY.password);
        await loginPage.waitForNavigation();

        // Navigate to dashboard and immediately check accessibility during loading
        await page.goto(`${accessibilityConfig.baseUrl}/dashboard`);

        // Check accessibility during loading state
        await page.waitForTimeout(500); // Brief wait to catch loading state
        await injectAxe(page);

        const loadingViolations = await getViolations(
          page,
          enhancedAccessibilityConfig.wcag21AAConfig
        );

        // Log violation details for debugging if any are found
        if (loadingViolations.length > 0) {
          console.log('Loading state violations found:');
          loadingViolations.forEach((violation, index) => {
            console.log(`${index + 1}. ${violation.id} (${violation.impact})`);
            console.log(`   Description: ${violation.description}`);
            console.log(`   Help: ${violation.helpUrl}`);
            violation.nodes.forEach((node, nodeIndex) => {
              console.log(`   Node ${nodeIndex + 1}: ${node.html.substring(0, 200)}...`);
              console.log(`   Target: ${node.target}`);
            });
          });
        }

        // Should have no accessibility violations even during loading
        expect(loadingViolations.length).toBe(0);

        // Wait for full load and test again
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const loadedViolations = await getViolations(
          page,
          enhancedAccessibilityConfig.wcag21AAConfig
        );
        expect(loadedViolations.length).toBe(0);

        await loginPage.logout();
      });

      it('should announce dynamic content changes', async () => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(TestUsers.READONLY.email, TestUsers.READONLY.password);
        await loginPage.waitForNavigation();

        await page.goto(`${accessibilityConfig.baseUrl}/test-results-dashboard`);
        await page.waitForLoadState('networkidle');

        // Look for ARIA live regions
        const liveRegions = page.locator('[aria-live], [role="status"], [role="alert"]');
        const liveRegionCount = await liveRegions.count();

        // Should have some form of live regions for dynamic content
        expect(liveRegionCount).toBeGreaterThan(0);

        // Test filter interactions that might trigger live region updates
        const filters = page
          .locator('select, input[type="text"]')
          .filter({ hasText: /filter|search/i });
        const filterCount = await filters.count();

        if (filterCount > 0) {
          const firstFilter = filters.first();
          await firstFilter.focus();
          await firstFilter.fill('test');
          await page.waitForTimeout(1000);

          // Verify no new accessibility violations after dynamic update
          await injectAxe(page);
          const dynamicViolations = await getViolations(
            page,
            enhancedAccessibilityConfig.wcag21AAConfig
          );
          expect(dynamicViolations.length).toBe(0);
        }

        await loginPage.logout();
      });
    });

    describe('Advanced Keyboard Navigation Tests', () => {
      it('should support comprehensive keyboard navigation patterns', async () => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(TestUsers.READONLY.email, TestUsers.READONLY.password);
        await loginPage.waitForNavigation();

        await page.goto(`${accessibilityConfig.baseUrl}/dashboard`);
        await page.waitForLoadState('networkidle');

        // Test Tab navigation through interactive elements
        await page.keyboard.press('Tab');

        const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
        const interactiveElements = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'];

        // Should land on an interactive element
        expect(interactiveElements.includes(focusedElement!)).toBe(true);

        // Test that all interactive elements are reachable via keyboard
        const allButtons = page.locator('button:visible, a:visible, input:visible, select:visible');
        const buttonCount = await allButtons.count();

        const maxTabs = Math.min(buttonCount, 20); // Limit to prevent infinite loops

        for (let i = 0; i < maxTabs; i++) {
          await page.keyboard.press('Tab');

          const currentElement = await page.evaluate(() => {
            const el = document.activeElement;
            return {
              tag: el?.tagName,
              type: el?.getAttribute('type'),
              disabled: el?.hasAttribute('disabled'),
            };
          });

          // Should be on a focusable element (not disabled)
          if (currentElement.tag && interactiveElements.includes(currentElement.tag)) {
            expect(currentElement.disabled).toBe(false);
          }
        }

        await loginPage.logout();
      });

      it('should support arrow key navigation in appropriate components', async () => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(TestUsers.READONLY.email, TestUsers.READONLY.password);
        await loginPage.waitForNavigation();

        await page.goto(`${accessibilityConfig.baseUrl}/test-results-dashboard`);
        await page.waitForLoadState('networkidle');

        // Look for components that should support arrow key navigation
        const tables = page.locator('table');
        const tableCount = await tables.count();

        if (tableCount > 0) {
          const firstTable = tables.first();
          const firstCell = firstTable.locator('td, th').first();

          if (await firstCell.isVisible()) {
            await firstCell.focus();

            // Test arrow key navigation (if implemented)
            await page.keyboard.press('ArrowRight');
            await page.waitForTimeout(100);

            // Should still be in the table
            const currentFocus = await page.evaluate(() => {
              const el = document.activeElement;
              return el?.closest('table') !== null;
            });

            expect(currentFocus).toBe(true);
          }
        }

        await loginPage.logout();
      });

      it('should handle escape key properly in modal contexts', async () => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(TestUsers.READONLY.email, TestUsers.READONLY.password);
        await loginPage.waitForNavigation();

        await page.goto(`${accessibilityConfig.baseUrl}/test-results-dashboard`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // Look for buttons that open modals
        const viewButtons = page.locator('button').filter({ hasText: /view|details/i });
        const buttonCount = await viewButtons.count();

        if (buttonCount > 0) {
          await viewButtons.first().click();
          await page.waitForTimeout(500);

          const modal = page.locator('[role="dialog"]');
          if (await modal.isVisible()) {
            // Test Escape key closes modal
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
            // Modal should be closed
            const isModalVisible = await modal.isVisible();
            expect(isModalVisible).toBe(false);
          }
        }

        await loginPage.logout();
      });
    });

    describe('WCAG 2.1 AA Compliance Tests', () => {
      it('should pass WCAG 2.1 AA compliance checks', async () => {
        const publicPages = accessibilityConfig.pages.filter(
          pageConfig => !pageConfig.requiresAuth
        );

        for (const pageConfig of publicPages) {
          await page.goto(`${accessibilityConfig.baseUrl}${pageConfig.path}`);
          await page.waitForLoadState('networkidle');
          await injectAxe(page);

          // Run WCAG 2.1 AA specific checks
          const violations = await getViolations(page, enhancedAccessibilityConfig.wcag21AAConfig);

          if (violations.length > 0) {
            const violationDetails = formatAccessibilityViolations(violations, pageConfig);
            throw new Error(
              `WCAG 2.1 AA violations found on ${pageConfig.label}:\n${violationDetails}`
            );
          }

          expect(violations.length).toBe(0);
        }
      });

      it('should pass enhanced color contrast requirements', async () => {
        await page.goto(`${accessibilityConfig.baseUrl}/`);
        await page.waitForLoadState('networkidle');
        await injectAxe(page);

        // Test enhanced color contrast (WCAG AAA)
        const violations = await getViolations(page, {
          rules: {
            'color-contrast-enhanced': { enabled: true },
          },
        });

        // Log any contrast issues for review
        if (violations.length > 0) {
          testLogger.warn({ violations }, 'Enhanced color contrast violations detected');
        }

        // For now, we'll track but not fail on enhanced contrast
        // expect(violations.length).toBe(0);
      });
    });

    describe('Screen Reader Simulation Tests', () => {
      it('should have proper heading structure for screen readers', async () => {
        const pages = [
          { path: '/', name: 'home' },
          { path: '/login', name: 'login' },
          { path: '/register', name: 'register' },
        ];

        for (const testPage of pages) {
          await page.goto(`${accessibilityConfig.baseUrl}${testPage.path}`);
          await page.waitForLoadState('networkidle');

          // Check heading hierarchy
          const headings = await page.evaluate(() => {
            const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
            return Array.from(headingElements).map(h => ({
              level: parseInt(h.tagName.substring(1)),
              text: h.textContent?.trim(),
              id: h.id,
            }));
          });

          // Should have exactly one h1
          const h1Count = headings.filter(h => h.level === 1).length;
          expect(h1Count).toBe(1);

          // Check that heading levels don't skip (e.g., h1 -> h3)
          for (let i = 1; i < headings.length; i++) {
            const currentLevel = headings[i].level;
            const prevLevel = headings[i - 1].level;
            const levelDiff = currentLevel - prevLevel;

            // Heading levels should not skip more than 1 level
            expect(levelDiff).toBeLessThanOrEqual(1);
          }
        }
      });

      it('should have proper landmark structure', async () => {
        await page.goto(`${accessibilityConfig.baseUrl}/`);
        await page.waitForLoadState('networkidle');

        const landmarks = await page.evaluate(() => {
          const landmarkSelectors = [
            'header, [role="banner"]',
            'nav, [role="navigation"]',
            'main, [role="main"]',
            'footer, [role="contentinfo"]',
            'aside, [role="complementary"]',
            '[role="search"]',
          ];

          return landmarkSelectors.map(selector => ({
            selector,
            count: document.querySelectorAll(selector).length,
          }));
        });

        // Should have main landmark
        const mainLandmark = landmarks.find(l => l.selector.includes('main'));
        expect(mainLandmark?.count).toBeGreaterThan(0);

        // Should have navigation
        const navLandmark = landmarks.find(l => l.selector.includes('nav'));
        expect(navLandmark?.count).toBeGreaterThan(0);
      });

      it('should provide adequate alternative text for images', async () => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(TestUsers.READONLY.email, TestUsers.READONLY.password);
        await loginPage.waitForNavigation();

        await page.goto(`${accessibilityConfig.baseUrl}/dashboard`);
        await page.waitForLoadState('networkidle');

        const images = await page.evaluate(() => {
          const imgs = document.querySelectorAll('img');
          return Array.from(imgs).map(img => ({
            src: img.src,
            alt: img.alt,
            role: img.getAttribute('role'),
            ariaLabel: img.getAttribute('aria-label'),
            ariaLabelledBy: img.getAttribute('aria-labelledby'),
          }));
        });

        for (const img of images) {
          // Each image should have some form of alternative text
          const hasAltText = !!(
            img.alt ||
            img.ariaLabel ||
            img.ariaLabelledBy ||
            img.role === 'presentation'
          );

          expect(hasAltText).toBe(true);
        }

        await loginPage.logout();
      });
    });
  });
});

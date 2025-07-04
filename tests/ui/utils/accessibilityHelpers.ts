/**
 * Shared utilities for accessibility testing
 */

import { injectAxe, getViolations } from 'axe-playwright';
import { testLogger } from '../../../src/logging/logger';
import { Page } from '@playwright/test';

export interface PageObjectWithGoto {
  goto(): Promise<void>;
}

/**
 * Helper function to run axe and get violations
 */
export const getAxeViolations = async (page: Page) => {
  await injectAxe(page);
  return await getViolations(page);
};

/**
 * Helper function to log accessibility violations
 */
export const logAccessibilityViolations = (
  pageName: string,
  violations: {
    id: string;
    impact?: string | null;
    description: string;
    nodes?: unknown[];
  }[],
  violationType?: string
) => {
  const logMessage = violationType
    ? `${violationType} violations on ${pageName}`
    : `Accessibility violations on ${pageName}`;

  testLogger.error(logMessage, {
    violations: violations.map(v => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes ? v.nodes.length : 0,
    })),
  });
};

/**
 * Helper function to wait for page to be fully loaded
 */
export const waitForPageLoad = async (page: Page, timeout = 1500) => {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('main, body', { state: 'visible' });
  await page.waitForTimeout(timeout);
};

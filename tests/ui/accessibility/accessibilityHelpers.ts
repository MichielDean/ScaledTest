/**
 * Shared utilities for acces  testLogger.error({
    violations: violations.map(v => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
    })),
  }, logMessage); testing
 */

import { injectAxe, getViolations } from 'axe-playwright';
import { testLogger } from '../../../src/logging/logger';
import { Page } from '@playwright/test';
import type { Result } from 'axe-core';

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
  violations: Result[],
  violationType?: string
) => {
  const logMessage = violationType
    ? `${violationType} violations on ${pageName}`
    : `Accessibility violations on ${pageName}`;

  testLogger.error(
    {
      violations: violations.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes ? v.nodes.length : 0,
      })),
    },
    logMessage
  );
};

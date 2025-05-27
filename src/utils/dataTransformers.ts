/**
 * Data transformation utilities for converting test results data into various visualization formats
 */

import {
  TestResultData,
  // Team, // Currently unused but reserved for future use
  Application,
  TestSuite,
  TestExecution,
  TestCase,
  TestResult,
  TestCaseStatus,
  TestResultStatus,
  TestExecutionStatus,
} from '../models/testResults';

/**
 * Hierarchical node structure for sunburst visualization
 */
export interface SunburstNode {
  name: string;
  value?: number;
  children?: SunburstNode[];
  id?: string;
  type: 'root' | 'team' | 'application' | 'testSuite' | 'testExecution' | 'testCase' | 'testResult';
  status?: TestCaseStatus | TestResultStatus | TestExecutionStatus;
  metadata?: {
    description?: string;
    createdAt?: string;
    tags?: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
}

/**
 * Transforms flat test results data into hierarchical structure for sunburst visualization
 */
export function transformToSunburstData(data: TestResultData): SunburstNode {
  const root: SunburstNode = {
    name: 'Test Results',
    type: 'root',
    children: [],
  };

  // Group applications by team
  const teamAppsMap = new Map<string, Application[]>();
  data.applications.forEach(app => {
    if (!teamAppsMap.has(app.teamId)) {
      teamAppsMap.set(app.teamId, []);
    }
    teamAppsMap.get(app.teamId)!.push(app);
  });

  // Group test suites by application
  const appSuitesMap = new Map<string, TestSuite[]>();
  data.testSuites.forEach(suite => {
    if (!appSuitesMap.has(suite.applicationId)) {
      appSuitesMap.set(suite.applicationId, []);
    }
    appSuitesMap.get(suite.applicationId)!.push(suite);
  });

  // Group test executions by test suite
  const suiteExecutionsMap = new Map<string, TestExecution[]>();
  data.testExecutions.forEach(execution => {
    if (!suiteExecutionsMap.has(execution.testSuiteId)) {
      suiteExecutionsMap.set(execution.testSuiteId, []);
    }
    suiteExecutionsMap.get(execution.testSuiteId)!.push(execution);
  });

  // Group test cases by test execution
  const executionCasesMap = new Map<string, TestCase[]>();
  data.testCases.forEach(testCase => {
    if (!executionCasesMap.has(testCase.testExecutionId)) {
      executionCasesMap.set(testCase.testExecutionId, []);
    }
    executionCasesMap.get(testCase.testExecutionId)!.push(testCase);
  });

  // Group test results by test case
  const caseResultsMap = new Map<string, TestResult[]>();
  data.testResults.forEach(result => {
    if (!caseResultsMap.has(result.testCaseId)) {
      caseResultsMap.set(result.testCaseId, []);
    }
    caseResultsMap.get(result.testCaseId)!.push(result);
  });

  // Build the hierarchy
  data.teams.forEach(team => {
    const teamNode: SunburstNode = {
      name: team.name,
      type: 'team',
      id: team.id,
      children: [],
      metadata: {
        description: team.description,
        createdAt: team.createdAt,
        tags: team.tags,
      },
    };

    const teamApps = teamAppsMap.get(team.id) || [];

    teamApps.forEach(app => {
      const appNode: SunburstNode = {
        name: app.name,
        type: 'application',
        id: app.id,
        children: [],
        metadata: {
          description: app.description,
          createdAt: app.createdAt,
          tags: app.tags,
          version: app.version,
          repositoryUrl: app.repositoryUrl,
        },
      };

      const appSuites = appSuitesMap.get(app.id) || [];

      appSuites.forEach(suite => {
        const suiteNode: SunburstNode = {
          name: suite.name,
          type: 'testSuite',
          id: suite.id,
          children: [],
          metadata: {
            description: suite.description,
            createdAt: suite.createdAt,
            tags: suite.tags,
            sourceLocation: suite.sourceLocation,
          },
        };

        const suiteExecutions = suiteExecutionsMap.get(suite.id) || [];

        suiteExecutions.forEach(execution => {
          const executionNode: SunburstNode = {
            name: `Execution ${execution.id.substring(0, 8)}`,
            type: 'testExecution',
            id: execution.id,
            children: [],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            status: execution.status as any,
            metadata: {
              createdAt: execution.createdAt,
              tags: execution.tags,
              startedAt: execution.startedAt,
              completedAt: execution.completedAt,
              environment: execution.environment,
              triggeredBy: execution.triggeredBy,
              buildId: execution.buildId,
            },
          };

          const executionCases = executionCasesMap.get(execution.id) || [];

          executionCases.forEach(testCase => {
            const caseNode: SunburstNode = {
              name: testCase.name,
              type: 'testCase',
              id: testCase.id,
              children: [],
              status: testCase.status,
              metadata: {
                description: testCase.description,
                createdAt: testCase.createdAt,
                tags: testCase.tags,
                startedAt: testCase.startedAt,
                completedAt: testCase.completedAt,
                durationMs: testCase.durationMs,
              },
            };

            const caseResults = caseResultsMap.get(testCase.id) || [];

            caseResults.forEach(result => {
              const resultNode: SunburstNode = {
                name: result.name,
                type: 'testResult',
                id: result.id,
                value: 1, // Each test result has a value of 1
                status: result.status,
                metadata: {
                  description: result.description,
                  createdAt: result.createdAt,
                  tags: result.tags,
                  expected: result.expected,
                  actual: result.actual,
                  priority: result.priority,
                  durationMs: result.durationMs,
                  errorDetails: result.errorDetails,
                },
              };

              caseNode.children!.push(resultNode);
            });

            // If no test results, give the test case a value of 1
            if (caseNode.children!.length === 0) {
              caseNode.value = 1;
              delete caseNode.children;
            }

            executionNode.children!.push(caseNode);
          });

          // If no test cases, give the execution a value of 1
          if (executionNode.children!.length === 0) {
            executionNode.value = 1;
            delete executionNode.children;
          }

          suiteNode.children!.push(executionNode);
        });

        // If no executions, give the suite a value of 1
        if (suiteNode.children!.length === 0) {
          suiteNode.value = 1;
          delete suiteNode.children;
        }

        appNode.children!.push(suiteNode);
      });

      // If no test suites, give the app a value of 1
      if (appNode.children!.length === 0) {
        appNode.value = 1;
        delete appNode.children;
      }

      teamNode.children!.push(appNode);
    });

    // If no applications, give the team a value of 1
    if (teamNode.children!.length === 0) {
      teamNode.value = 1;
      delete teamNode.children;
    }

    root.children!.push(teamNode);
  });

  return root;
}

/**
 * Calculates the passing percentage for a node and its descendants
 */
export function calculatePassingPercentage(node: SunburstNode): number {
  // For leaf nodes (test results), calculate based on status
  if (node.type === 'testResult') {
    if (node.status === 'passed') {
      return 100;
    } else if (node.status === 'failed' || node.status === 'error') {
      return 0;
    } else {
      // For skipped, blocked, not_run, etc., we don't count them in pass/fail calculations
      return -1; // Indicates this result should be excluded from calculations
    }
  }

  // For parent nodes, calculate based on children
  if (node.children && node.children.length > 0) {
    const childPercentages = node.children
      .map(calculatePassingPercentage)
      .filter(percentage => percentage >= 0); // Exclude skipped/blocked results

    if (childPercentages.length === 0) {
      return 50; // Default to neutral if no valid results
    }

    return (
      childPercentages.reduce((sum, percentage) => sum + percentage, 0) / childPercentages.length
    );
  }

  // Default for nodes without children or status
  return 50;
}

/**
 * Converts HSL to RGB color format
 */
function hslToRgb(h: number, s: number, l: number): string {
  h /= 360;
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 1 / 6) {
    r = c;
    g = x;
    b = 0;
  } else if (1 / 6 <= h && h < 2 / 6) {
    r = x;
    g = c;
    b = 0;
  } else if (2 / 6 <= h && h < 3 / 6) {
    r = 0;
    g = c;
    b = x;
  } else if (3 / 6 <= h && h < 4 / 6) {
    r = 0;
    g = x;
    b = c;
  } else if (4 / 6 <= h && h < 5 / 6) {
    r = x;
    g = 0;
    b = c;
  } else if (5 / 6 <= h && h < 1) {
    r = c;
    g = 0;
    b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Gets color for a node based on its passing percentage using a gradient scheme
 * Green (100%) -> Yellow (80%) -> Red (<80%)
 */
export function getNodeColor(node: SunburstNode): string {
  const percentage = calculatePassingPercentage(node);

  // Handle special cases for non-test nodes or nodes with no valid data
  if (percentage < 0) {
    return '#6c757d'; // Gray for skipped/blocked
  }

  // Special handling for root node
  if (node.type === 'root') {
    return '#495057'; // Dark gray for root
  }

  // Color gradient based on passing percentage
  if (percentage >= 95) {
    // Dark green for excellent results (95-100%)
    return '#28a745';
  } else if (percentage >= 85) {
    // Light green to green (85-95%)
    const factor = (percentage - 85) / 10;
    const hue = 120; // Green hue
    const saturation = 60 + factor * 20; // 60-80%
    const lightness = 45 + factor * 10; // 45-55%
    return hslToRgb(hue, saturation, lightness);
  } else if (percentage >= 70) {
    // Yellow-green to light green (70-85%)
    const factor = (percentage - 70) / 15;
    const hue = 90 + factor * 30; // 90-120 (yellow-green to green)
    const saturation = 70;
    const lightness = 50;
    return hslToRgb(hue, saturation, lightness);
  } else if (percentage >= 50) {
    // Orange-yellow to yellow-green (50-70%)
    const factor = (percentage - 50) / 20;
    const hue = 60 + factor * 30; // 60-90 (orange-yellow to yellow-green)
    const saturation = 75;
    const lightness = 50;
    return hslToRgb(hue, saturation, lightness);
  } else if (percentage >= 30) {
    // Orange to orange-yellow (30-50%)
    const factor = (percentage - 30) / 20;
    const hue = 30 + factor * 30; // 30-60 (orange to orange-yellow)
    const saturation = 80;
    const lightness = 50;
    return hslToRgb(hue, saturation, lightness);
  } else {
    // Red to orange for poor results (0-30%)
    const factor = percentage / 30;
    const hue = factor * 30; // 0-30 (red to orange)
    const saturation = 75 + factor * 10; // 75-85%
    const lightness = 45 + factor * 10; // 45-55%
    return hslToRgb(hue, saturation, lightness);
  }
}

/**
 * Gets display text for a node including status and passing percentage information
 */
export function getNodeDisplayText(node: SunburstNode): string {
  let text = node.name;

  const percentage = calculatePassingPercentage(node);

  if (percentage >= 0) {
    text += ` (${percentage.toFixed(1)}%)`;
  } else if (node.status) {
    text += ` (${node.status})`;
  }

  return text;
}

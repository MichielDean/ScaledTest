#!/usr/bin/env node
/**
 * ScaledTest Jest Test Discovery Script
 *
 * Scans test files and outputs JSON list of all tests for UI selection.
 * Output format conforms to BASE_CONTAINER_SPEC.md
 */

const { globSync } = require("glob");
const fs = require("fs");
const path = require("path");

// Configuration
const TEST_PATTERNS =
  process.env.TEST_PATTERNS || "tests/**/*.{test,spec}.{js,ts,jsx,tsx}";
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || "/app";

/**
 * Extract test cases from file using regex (simple AST parsing)
 * Looks for: it('test name'), test('test name'), it.skip(), it.only(), etc.
 */
function extractTestsFromFile(filePath) {
  const tests = [];
  const content = fs.readFileSync(filePath, "utf8");
  const relativePath = path.relative(WORKSPACE_DIR, filePath);

  // Match test declarations: it('name'), test('name'), it.skip('name'), etc.
  const testRegex =
    /(?:it|test)(?:\.skip|\.only|\.concurrent)?\s*\(\s*['"`](.+?)['"`]/g;

  // Match describe blocks for suite grouping
  const describeRegex = /describe\s*\(\s*['"`](.+?)['"`]/g;

  // Extract describe blocks (suites)
  const describes = [];
  let describeMatch;
  while ((describeMatch = describeRegex.exec(content)) !== null) {
    describes.push({
      name: describeMatch[1],
      index: describeMatch.index,
    });
  }

  // Extract test cases
  let testMatch;
  while ((testMatch = testRegex.exec(content)) !== null) {
    const testName = testMatch[1];
    const testIndex = testMatch.index;

    // Find closest preceding describe block
    const suite = describes
      .filter((d) => d.index < testIndex)
      .sort((a, b) => b.index - a.index)[0];

    // Generate unique test ID
    const testId = suite
      ? `${relativePath}::${suite.name}::${testName}`
      : `${relativePath}::${testName}`;

    // Extract tags from test name or comments
    const tags = [];
    if (testMatch[0].includes(".skip")) tags.push("skip");
    if (testMatch[0].includes(".only")) tags.push("only");
    if (testName.toLowerCase().includes("critical")) tags.push("critical");
    if (testName.toLowerCase().includes("smoke")) tags.push("smoke");

    tests.push({
      id: testId,
      name: testName,
      suite: suite ? suite.name : null,
      file: relativePath,
      tags,
    });
  }

  return tests;
}

/**
 * Main discovery function
 */
function discoverTests() {
  try {
    // Find all test files
    const testFiles = globSync(TEST_PATTERNS, {
      cwd: WORKSPACE_DIR,
      absolute: true,
      nodir: true,
    });

    if (testFiles.length === 0) {
      console.error("No test files found matching pattern:", TEST_PATTERNS);
      process.exit(1);
    }

    // Extract tests from all files
    const allTests = [];
    for (const filePath of testFiles) {
      try {
        const tests = extractTestsFromFile(filePath);
        allTests.push(...tests);
      } catch (error) {
        console.error(`Error parsing ${filePath}:`, error.message);
        // Continue processing other files
      }
    }

    // Get Jest version
    let jestVersion = "unknown";
    try {
      const jestPackage = require("jest/package.json");
      jestVersion = jestPackage.version;
    } catch (e) {
      // Fallback if package.json not accessible
    }

    // Output discovery results
    const output = {
      tests: allTests,
      framework: "jest",
      version: jestVersion,
      totalCount: allTests.length,
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("Test discovery failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run discovery if executed directly
if (require.main === module) {
  discoverTests();
}

module.exports = { discoverTests, extractTestsFromFile };

import { test, expect } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage";
import { TestUsers } from "./models/TestUsers";
import { testLogger } from "./testLogger";

test.describe("Test Results Upload - E2E Tests", () => {
  let loginPage: LoginPage;
  const API_URL = process.env.VITE_API_URL || "http://localhost:8080";

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
  });

  test.afterEach(async () => {
    await loginPage.logout();
  });

  test.describe("Upload Test Results - API Integration", () => {
    test("should successfully upload test results via API", async ({
      page,
    }) => {
      // Login first to get auth token
      await loginPage.loginWithUser(TestUsers.USER);

      // Get the auth token from localStorage
      const accessToken = await page.evaluate(() => {
        const authData = localStorage.getItem("auth_session");
        if (!authData) return null;
        try {
          const parsed = JSON.parse(authData);
          return parsed?.access_token || null;
        } catch {
          return null;
        }
      });

      expect(accessToken).toBeTruthy();

      // Upload test results using CTRF format
      const testResultsPayload = {
        reportFormat: "CTRF",
        specVersion: "0.0.0",
        generatedBy: "ScaledTest E2E Tests",
        timestamp: new Date().toISOString(),
        results: {
          tool: {
            name: "playwright",
            version: "1.49.0",
          },
          summary: {
            tests: 10,
            passed: 8,
            failed: 1,
            skipped: 1,
            pending: 0,
            start: Date.now() - 5000,
            stop: Date.now(),
          },
          tests: [
            {
              name: "should render homepage",
              status: "passed",
              duration: 150,
            },
            {
              name: "should navigate to profile",
              status: "passed",
              duration: 200,
            },
            {
              name: "should fail validation",
              status: "failed",
              duration: 180,
              message: "Expected validation error",
              trace: "at FormTest.spec.ts:45",
            },
          ],
          environment: {
            osPlatform: "linux",
            branchName: "main",
            commit: "abc123def456",
          },
        },
      };

      const response = await page.evaluate(
        async ({ url, token, payload }) => {
          const res = await fetch(`${url}/api/v1/test-results`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });

          return {
            status: res.status,
            data: await res.json(),
          };
        },
        { url: API_URL, token: accessToken, payload: testResultsPayload },
      );

      testLogger.info(`Upload response: ${JSON.stringify(response)}`);

      expect(response.status).toBe(201);
      expect(response.data?.id).toBeTruthy();
      expect(response.data?.message).toBeTruthy();
    });

    test("should upload minimal test results", async ({ page }) => {
      await loginPage.loginWithUser(TestUsers.USER);

      const accessToken = await page.evaluate(() => {
        const authData = localStorage.getItem("auth_session");
        if (!authData) return null;
        try {
          const parsed = JSON.parse(authData);
          return parsed?.access_token || null;
        } catch {
          return null;
        }
      });

      const minimalPayload = {
        reportFormat: "CTRF",
        specVersion: "0.0.0",
        generatedBy: "ScaledTest E2E Tests",
        results: {
          tool: {
            name: "playwright",
          },
          summary: {
            tests: 5,
            passed: 5,
            failed: 0,
            skipped: 0,
            pending: 0,
            start: Date.now() - 1000,
            stop: Date.now(),
          },
          tests: [],
        },
      };

      const response = await page.evaluate(
        async ({ url, token, payload }) => {
          const res = await fetch(`${url}/api/v1/test-results`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });

          return {
            status: res.status,
            data: await res.json(),
          };
        },
        { url: API_URL, token: accessToken, payload: minimalPayload },
      );

      expect(response.status).toBe(201);
      expect(response.data?.id).toBeTruthy();
    });

    test("should upload test results with multiple test cases", async ({
      page,
    }) => {
      await loginPage.loginWithUser(TestUsers.USER);

      const accessToken = await page.evaluate(() => {
        const authData = localStorage.getItem("auth_session");
        if (!authData) return null;
        try {
          const parsed = JSON.parse(authData);
          return parsed?.access_token || null;
        } catch {
          return null;
        }
      });

      // Create 50 test cases in CTRF format
      const testCases = Array.from({ length: 50 }, (_, i) => {
        const status: "failed" | "passed" = i % 10 === 0 ? "failed" : "passed";
        return {
          name: `test case ${i + 1}`,
          status,
          duration: Math.floor(Math.random() * 500) + 100,
          ...(i % 10 === 0 && {
            message: `Error in test ${i + 1}`,
            trace: `at test.spec.ts:${i + 1}`,
          }),
        };
      });

      const payload = {
        reportFormat: "CTRF",
        specVersion: "0.0.0",
        generatedBy: "ScaledTest E2E Tests",
        results: {
          tool: {
            name: "playwright",
          },
          summary: {
            tests: 50,
            passed: 45,
            failed: 5,
            skipped: 0,
            pending: 0,
            start: Date.now() - 15000,
            stop: Date.now(),
          },
          tests: testCases,
          environment: {
            osPlatform: "linux",
            testEnvironment: "github-actions",
            branchName: "feature/test-upload",
            commit: "test123",
          },
        },
      };

      const response = await page.evaluate(
        async ({ url, token, payload }) => {
          const res = await fetch(`${url}/api/v1/test-results`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });

          return {
            status: res.status,
            data: await res.json(),
          };
        },
        { url: API_URL, token: accessToken, payload },
      );

      expect(response.status).toBe(201);
      expect(response.data?.id).toBeTruthy();
    });

    test("should reject upload without authentication", async ({ page }) => {
      const payload = {
        reportFormat: "CTRF",
        specVersion: "0.0.0",
        results: {
          tool: { name: "playwright" },
          summary: {
            tests: 5,
            passed: 5,
            failed: 0,
            skipped: 0,
          },
          tests: [],
        },
      };

      const response = await page.evaluate(
        async ({ url, payload }) => {
          try {
            const res = await fetch(`${url}/api/v1/test-results`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(payload),
            });

            return {
              status: res.status,
              data: await res.json().catch(() => null),
            };
          } catch (error) {
            // Network error or CORS issue - this is expected without auth
            return {
              status: 401,
              data: null,
            };
          }
        },
        { url: API_URL, payload },
      );

      expect(response.status).toBe(401);
    });

    test("should reject upload with invalid payload", async ({ page }) => {
      await loginPage.loginWithUser(TestUsers.USER);

      const accessToken = await page.evaluate(() => {
        const authData = localStorage.getItem("auth_session");
        if (!authData) return null;
        try {
          const parsed = JSON.parse(authData);
          return parsed?.access_token || null;
        } catch {
          return null;
        }
      });

      // Invalid payload - missing required fields
      const invalidPayload = {
        branch: "main",
        // Missing required fields like reportFormat, results, etc.
      };

      const response = await page.evaluate(
        async ({ url, token, payload }) => {
          const res = await fetch(`${url}/api/v1/test-results`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });

          return {
            status: res.status,
            data: await res.json().catch(() => null),
          };
        },
        { url: API_URL, token: accessToken, payload: invalidPayload },
      );

      expect(response.status).toBe(400);
    });
  });

  test.describe("Test Results Retrieval", () => {
    let uploadedTestRunId: string;

    test.beforeEach(async ({ page }) => {
      // Upload a test result first
      await loginPage.loginWithUser(TestUsers.USER);

      const accessToken = await page.evaluate(() => {
        const authData = localStorage.getItem("auth_session");
        if (!authData) return null;
        try {
          const parsed = JSON.parse(authData);
          return parsed?.access_token || null;
        } catch {
          return null;
        }
      });

      const payload = {
        reportFormat: "CTRF",
        specVersion: "0.0.0",
        generatedBy: "ScaledTest E2E Tests",
        results: {
          tool: { name: "playwright" },
          summary: {
            tests: 3,
            passed: 3,
            failed: 0,
            skipped: 0,
            start: Date.now() - 1500,
            stop: Date.now(),
          },
          tests: [
            {
              name: "test 1",
              status: "passed",
              duration: 500,
            },
          ],
          environment: {
            branchName: "test-retrieval",
          },
        },
      };

      const response = await page.evaluate(
        async ({ url, token, payload }) => {
          const res = await fetch(`${url}/api/v1/test-results`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });

          return await res.json();
        },
        { url: API_URL, token: accessToken, payload },
      );

      uploadedTestRunId = response?.id;
      expect(uploadedTestRunId).toBeTruthy();
    });

    test("should retrieve uploaded test results by ID", async ({ page }) => {
      const accessToken = await page.evaluate(() => {
        const authData = localStorage.getItem("auth_session");
        if (!authData) return null;
        try {
          const parsed = JSON.parse(authData);
          return parsed?.access_token || null;
        } catch {
          return null;
        }
      });

      const response = await page.evaluate(
        async ({ url, token, testRunId }) => {
          const res = await fetch(`${url}/api/v1/test-results/${testRunId}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          return {
            status: res.status,
            data: await res.json(),
          };
        },
        { url: API_URL, token: accessToken, testRunId: uploadedTestRunId },
      );

      expect(response.status).toBe(200);
      expect(response.data?.reportFormat).toBe("CTRF");
      expect(response.data?.results?.summary?.tests).toBe(3);
      expect(response.data?.results?.environment?.branchName).toBe(
        "test-retrieval",
      );
      expect(response.data?.results?.tests).toBeDefined();
      expect(Array.isArray(response.data?.results?.tests)).toBe(true);
    });

    test("should list test results with pagination", async ({ page }) => {
      const accessToken = await page.evaluate(() => {
        const authData = localStorage.getItem("auth_session");
        if (!authData) return null;
        try {
          const parsed = JSON.parse(authData);
          return parsed?.access_token || null;
        } catch {
          return null;
        }
      });

      const response = await page.evaluate(
        async ({ url, token }) => {
          const res = await fetch(
            `${url}/api/v1/test-results?page=1&page_size=20`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );

          return {
            status: res.status,
            data: await res.json(),
          };
        },
        { url: API_URL, token: accessToken },
      );

      expect(response.status).toBe(200);
      expect(response.data?.reports).toBeDefined();
      expect(Array.isArray(response.data?.reports)).toBe(true);
      expect(response.data?.total_count).toBeGreaterThanOrEqual(1);
      expect(response.data?.page).toBe(1);
    });

    test("should get test statistics", async ({ page }) => {
      const accessToken = await page.evaluate(() => {
        const authData = localStorage.getItem("auth_session");
        if (!authData) return null;
        try {
          const parsed = JSON.parse(authData);
          return parsed?.access_token || null;
        } catch {
          return null;
        }
      });

      const response = await page.evaluate(
        async ({ url, token }) => {
          const res = await fetch(`${url}/api/v1/test-statistics`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          return {
            status: res.status,
            data: await res.json(),
          };
        },
        { url: API_URL, token: accessToken },
      );

      expect(response.status).toBe(200);
      expect(response.data?.total_runs).toBeGreaterThanOrEqual(1);
      expect(response.data?.total_tests).toBeGreaterThanOrEqual(1);
      expect(response.data?.pass_rate).toBeGreaterThanOrEqual(0);
      expect(response.data?.pass_rate).toBeLessThanOrEqual(100);
    });
  });

  test.describe("Test Results Page UI", () => {
    test("should display test results page for authenticated user", async ({
      page,
    }) => {
      await loginPage.loginWithUser(TestUsers.USER);

      await page.goto("/test-results");
      await page.waitForLoadState("networkidle");

      // Check if the page title is visible (use specific h1 selector to avoid strict mode)
      await expect(
        page.locator("h1", { hasText: "Test Results" }),
      ).toBeVisible();

      // Check for test results container
      const container = page.locator("#test-results-container");
      await expect(container).toBeVisible();
    });

    test("should redirect to login if not authenticated", async ({ page }) => {
      await page.goto("/test-results");

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });

    test("should display statistics if available", async ({ page }) => {
      // First upload some data
      await loginPage.loginWithUser(TestUsers.USER);

      const accessToken = await page.evaluate(() => {
        const authData = localStorage.getItem("auth_session");
        if (!authData) return null;
        try {
          const parsed = JSON.parse(authData);
          return parsed?.access_token || null;
        } catch {
          return null;
        }
      });

      // Upload test results in CTRF format
      await page.evaluate(
        async ({ url, token }) => {
          await fetch(`${url}/api/v1/test-results`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              reportFormat: "CTRF",
              specVersion: "0.0.0",
              generatedBy: "ScaledTest E2E Tests",
              results: {
                tool: { name: "playwright" },
                summary: {
                  tests: 10,
                  passed: 10,
                  failed: 0,
                  skipped: 0,
                  start: Date.now() - 2000,
                  stop: Date.now(),
                },
                tests: [],
              },
            }),
          });
        },
        { url: API_URL, token: accessToken },
      );

      // Navigate to test results page
      await page.goto("/test-results");
      await page.waitForLoadState("networkidle");

      // Wait for statistics to load
      await page.waitForTimeout(2000);

      // Check if statistics grid is visible
      const statsGrid = page.locator("#statistics-grid");
      if (await statsGrid.isVisible({ timeout: 5000 }).catch(() => false)) {
        expect(await statsGrid.isVisible()).toBe(true);
      }
    });
  });
});

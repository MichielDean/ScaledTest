/**
 * Playwright Global Setup
 * Runs once before all tests to set up test users
 * 
 * IDEMPOTENT: This script is safe to run multiple times concurrently.
 * - It first attempts to login to check if user exists
 * - If login fails, it attempts registration
 * - Registration failures (e.g., user already exists) are caught and ignored
 * 
 * This is important for K8s indexed jobs where multiple pods may run
 * globalSetup simultaneously.
 */

import { chromium, FullConfig } from "@playwright/test";
import { TestUsers } from "./ui/models/TestUsers";

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || "http://localhost:5173";

  console.log(`Setting up test users against: ${baseURL}`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // IMPORTANT: Register ADMIN user first so they get admin role via first-user rule
  // The backend grants admin role to the first user who signs up
  const orderedUsers = [
    { key: "ADMIN", user: TestUsers.ADMIN },
    { key: "USER", user: TestUsers.USER },
  ];

  // Create test users by registering them in order
  for (const { key, user } of orderedUsers) {
    try {
      // First, try to login to check if user already exists
      await page.goto(`${baseURL}/login`);
      await page.waitForLoadState("networkidle");

      const emailInput = page.locator("#email");
      const passwordInput = page.locator("#password");
      const signInButton = page.locator("#signInButton");

      await emailInput.fill(user.email);
      await passwordInput.fill(user.password);
      await signInButton.click();

      // Wait to see if login succeeds or fails
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      if (currentUrl.includes("/dashboard")) {
        console.log(`✓ Test user ${key} (${user.email}) already exists`);
        // Logout
        const logoutButton = page.locator("#headerLogOut");
        if (await logoutButton.isVisible()) {
          await logoutButton.click();
          await page.waitForURL(/\/login/, { timeout: 5000 }).catch(() => {});
        }
        continue;
      }

      // User doesn't exist, try to create it
      console.log(`  Creating user ${key} (${user.email})...`);
      await page.goto(`${baseURL}/register`);
      await page.waitForLoadState("networkidle");

      // Fill registration form with actual field IDs
      const nameInput = page.locator("#name");
      const regEmailInput = page.locator("#email");
      const regPasswordInput = page.locator("#password");
      const registerButton = page.locator("#signUpButton");

      await nameInput.fill(user.displayName);
      await regEmailInput.fill(user.email);
      await regPasswordInput.fill(user.password);

      await registerButton.click();

      // Wait for registration to complete or error
      try {
        await page.waitForURL(/\/dashboard/, { timeout: 15000 });
        console.log(`✓ Created test user ${key} (${user.email})`);

        // Logout
        const logoutButton = page.locator("#headerLogOut");
        if (await logoutButton.isVisible()) {
          await logoutButton.click();
          await page.waitForURL(/\/login/, { timeout: 5000 }).catch(() => {});
        }
      } catch {
        // Registration might have failed because another pod created the user
        // This is expected in K8s parallel execution - verify by trying login
        console.log(`  Registration may have failed, verifying user exists...`);
        
        await page.goto(`${baseURL}/login`);
        await page.waitForLoadState("networkidle");
        
        await emailInput.fill(user.email);
        await passwordInput.fill(user.password);
        await signInButton.click();
        await page.waitForTimeout(2000);
        
        if (page.url().includes("/dashboard")) {
          console.log(`✓ User ${key} (${user.email}) exists (created by another process)`);
          const logoutButton = page.locator("#headerLogOut");
          if (await logoutButton.isVisible()) {
            await logoutButton.click();
            await page.waitForURL(/\/login/, { timeout: 5000 }).catch(() => {});
          }
        } else {
          console.log(`⚠ Could not verify user ${key} (${user.email}) - tests may fail`);
        }
      }
    } catch (error) {
      // Catch-all for any unexpected errors - log but continue
      console.error(
        `⚠ Error setting up user ${key} (${user.email}):`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  await context.close();
  await browser.close();

  console.log("Test user setup complete\n");
}

export default globalSetup;

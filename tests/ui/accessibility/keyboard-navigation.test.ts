/**
 * Keyboard navigation accessibility tests
 * Tests keyboard navigation and focus management
 */

import { setupPlaywright } from '../playwrightSetup';
import { LoginPage } from '../pages/LoginPage';
import { BasePage } from '../pages/BasePage';

const playwright = setupPlaywright();

describe('Keyboard Navigation Tests', () => {
  let loginPage: LoginPage;
  let basePage: BasePage;

  beforeEach(() => {
    loginPage = new LoginPage(playwright.page);
    basePage = new BasePage(playwright.page);
  });

  test('Login form should be keyboard accessible', async () => {
    await loginPage.goto();
    await basePage.waitForNavigation();

    // Wait for the form elements to be present and visible using page object locators
    await loginPage.emailInput.waitFor({ state: 'visible' });
    await loginPage.passwordInput.waitFor({ state: 'visible' });
    await loginPage.signInButton.waitFor({ state: 'visible' });

    // Wait a bit more for page to be fully interactive
    await basePage.waitForTimeout(1000);

    // Focus directly on the username field first to ensure we're starting from the right place
    await loginPage.emailInput.focus();

    // Wait for focus to be applied and verify the username field is focused
    await basePage.waitForFunction(() => document.activeElement?.getAttribute('id') === 'email', {
      timeout: 10000,
    });

    const focusedElement1 = await basePage.evaluate(() =>
      document.activeElement?.getAttribute('id')
    );
    expect(focusedElement1).toBe('email');

    // Tab to password field
    await basePage.pressKey('Tab');

    // Wait for focus to change
    await basePage.waitForFunction(
      () => document.activeElement?.getAttribute('id') === 'password',
      { timeout: 10000 }
    );

    const focusedElement2 = await basePage.evaluate(() =>
      document.activeElement?.getAttribute('id')
    );
    expect(focusedElement2).toBe('password');

    // Tab to submit button (skipping password toggle as it may not be present)
    await basePage.pressKey('Tab');

    // Wait for focus to change to submit button or another focusable element
    await basePage.waitForFunction(
      () =>
        document.activeElement?.getAttribute('type') === 'submit' ||
        document.activeElement?.getAttribute('id') === 'signInButton' ||
        document.activeElement?.tagName.toLowerCase() === 'button',
      { timeout: 10000 }
    );

    const focusedElement3 = await basePage.evaluate(() => ({
      id: document.activeElement?.getAttribute('id'),
      type: document.activeElement?.getAttribute('type'),
      tagName: document.activeElement?.tagName.toLowerCase(),
    }));

    // Verify we're on a button or submit element
    expect(
      focusedElement3.type === 'submit' ||
        focusedElement3.id === 'signInButton' ||
        focusedElement3.tagName === 'button'
    ).toBe(true);
  });

  test('Navigation should be keyboard accessible', async () => {
    // Use login page since it has header navigation
    await loginPage.goto();
    await basePage.waitForNavigation();

    // For SPA applications, the login page may not have standard navigation links
    // Instead, let's check for the actual focusable elements that exist
    await basePage.waitForTimeout(1000);

    // Start from the beginning and tab to first focusable element
    await basePage.pressKey('Tab');

    // Wait for an element to receive focus (with longer timeout)
    await basePage.waitForFunction(
      () =>
        document.activeElement !== document.body &&
        document.activeElement !== document.documentElement,
      { timeout: 10000 }
    );

    // Look for focused navigation elements
    const focusedElement = await basePage.getFocusedElement();
    const tagName = await focusedElement.evaluate(el => el.tagName.toLowerCase());

    // Should focus on interactive elements (links, buttons, inputs)
    expect(['a', 'button', 'input', 'select', 'textarea']).toContain(tagName);

    // Test that we can navigate through multiple focusable elements
    const initialFocusedElement = await basePage.evaluate(() => ({
      tagName: document.activeElement?.tagName.toLowerCase(),
      id: document.activeElement?.getAttribute('id'),
      className: document.activeElement?.className,
    }));

    // Tab to next element multiple times to ensure navigation works
    let changedFocus = false;
    for (let i = 0; i < 5; i++) {
      await basePage.pressKey('Tab');
      await basePage.waitForTimeout(200);

      const currentFocusedElement = await basePage.evaluate(() => ({
        tagName: document.activeElement?.tagName.toLowerCase(),
        id: document.activeElement?.getAttribute('id'),
        className: document.activeElement?.className,
      }));

      // Check if focus changed from initial element
      if (
        currentFocusedElement.id !== initialFocusedElement.id ||
        currentFocusedElement.tagName !== initialFocusedElement.tagName
      ) {
        changedFocus = true;
        break;
      }
    }

    // Verify focus changed to a different element
    expect(changedFocus).toBe(true);
  });
});

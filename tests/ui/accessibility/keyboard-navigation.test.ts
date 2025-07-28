/**
 * Keyboard navigation accessibility tests
 * Tests keyboard navigation and focus management
 */

import { setupPlaywright } from '../playwrightSetup';
import { LoginPage } from '../pages/LoginPage';
import { HeaderComponent } from '../pages/HeaderComponent';
import { BasePage } from '../pages/BasePage';

const playwright = setupPlaywright();

describe('Keyboard Navigation Tests', () => {
  let loginPage: LoginPage;
  let header: HeaderComponent;
  let basePage: BasePage;

  beforeEach(() => {
    loginPage = new LoginPage(playwright.page);
    header = new HeaderComponent(playwright.page);
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
    await basePage.waitForTimeout(500);

    // Focus directly on the username field first to ensure we're starting from the right place
    await loginPage.emailInput.focus();

    // Wait for focus to be applied and verify the username field is focused
    await basePage.waitForFunction(
      () => document.activeElement?.getAttribute('name') === 'username'
    );

    const focusedElement1 = await basePage.evaluate(() =>
      document.activeElement?.getAttribute('name')
    );
    expect(focusedElement1).toBe('username');

    // Tab to password field
    await basePage.pressKey('Tab');

    // Wait for focus to change
    await basePage.waitForFunction(
      () => document.activeElement?.getAttribute('name') === 'password'
    );

    const focusedElement2 = await basePage.evaluate(() =>
      document.activeElement?.getAttribute('name')
    );
    expect(focusedElement2).toBe('password');

    // Tab to password toggle button
    await basePage.pressKey('Tab');

    // Wait for focus to change to password toggle button
    await basePage.waitForFunction(
      () => document.activeElement?.getAttribute('id') === 'toggle-password-visibility'
    );

    const focusedElement3 = await basePage.evaluate(() =>
      document.activeElement?.getAttribute('id')
    );
    expect(focusedElement3).toBe('toggle-password-visibility');

    // Tab to submit button
    await basePage.pressKey('Tab');

    // Wait for focus to change to submit button
    await basePage.waitForFunction(() => document.activeElement?.getAttribute('type') === 'submit');

    const focusedElement4 = await basePage.evaluate(() =>
      document.activeElement?.getAttribute('type')
    );
    expect(focusedElement4).toBe('submit');
  });

  test('Navigation should be keyboard accessible', async () => {
    // Use login page since it has header navigation
    await loginPage.goto();
    await basePage.waitForNavigation();

    // Wait for header navigation to be present - check for non-authenticated state elements
    await header.loginLink.waitFor({ state: 'visible' });
    await header.registerLink.waitFor({ state: 'visible' });
    await basePage.waitForTimeout(500);

    // Start from the skip link (first focusable element)
    await basePage.pressKey('Tab');

    // Wait for an element to receive focus
    await basePage.waitForFunction(() => document.activeElement !== document.body);

    // Look for focused navigation elements
    const focusedElement = await basePage.getFocusedElement();
    const tagName = await focusedElement.evaluate(el => el.tagName.toLowerCase());

    // Should focus on interactive elements (links, buttons, inputs)
    expect(['a', 'button', 'input']).toContain(tagName);

    // Test that we can navigate through multiple focusable elements
    const initialFocusedElement = await basePage.evaluate(() => document.activeElement?.outerHTML);

    // Tab to next element
    await basePage.pressKey('Tab');
    await basePage.waitForTimeout(100);

    const nextFocusedElement = await basePage.evaluate(() => document.activeElement?.outerHTML);

    // Verify focus changed to a different element
    expect(nextFocusedElement).not.toBe(initialFocusedElement);
  });
});

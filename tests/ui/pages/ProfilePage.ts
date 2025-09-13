import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object representing the user profile page
 */
export class ProfilePage extends BasePage {
  readonly userProfileSection: Locator;
  readonly userRolesList: Locator;

  constructor(page: Page) {
    super(page);
    this.userProfileSection = page.locator('#user-profile-section');
    this.userRolesList = page.locator('#user-roles-list');
  }

  /**
   * Navigate to the profile page
   */
  async goto() {
    await super.goto('/profile');
    // Wait for redirect to dashboard?view=profile and for content to load
    await this.page.waitForURL('**/dashboard?view=profile');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Check if the profile page has loaded properly
   */
  async expectProfileLoaded() {
    await expect(this.userProfileSection).toBeVisible();
    await expect(this.userRolesList).toBeVisible();
  }

  /**
   * Check if a specific role is displayed in the user profile
   */
  async expectHasRole(role: string) {
    // Use the user-roles-list element and look for a role-specific ID element
    const formattedRole = role.toLowerCase().replace('-', '');
    const roleLocator = this.page.locator(`#role-${formattedRole}`);
    await expect(roleLocator).toBeVisible();
  }
}

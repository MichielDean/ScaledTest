import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object representing the team management page
 */
export class AdminTeamsPage extends BasePage {
  readonly teamsTable: Locator;
  readonly tableRows: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly pageTitle: Locator;
  readonly createTeamButton: Locator;
  readonly createTeamForm: Locator;
  readonly teamNameInput: Locator;
  readonly teamDescriptionInput: Locator;

  constructor(page: Page) {
    super(page);
    this.teamsTable = page.locator('#teams-table');
    this.tableRows = page.locator('#teams-table tbody tr');
    this.successMessage = page.locator('#success-message');
    this.errorMessage = page.locator('#error-message');
    this.pageTitle = page.locator('#page-title');
    this.createTeamButton = page.locator('#create-team-button');
    this.createTeamForm = page.locator('#create-team-form');
    this.teamNameInput = page.locator('#team-name');
    this.teamDescriptionInput = page.locator('#team-description');
  }

  /**
   * Navigate to the team management page
   */
  async goto() {
    await super.goto('/admin/teams');
  }

  /**
   * Check if the team management page is loaded properly
   */
  async expectPageLoaded() {
    await expect(this.pageTitle).toBeVisible();
    await expect(this.teamsTable).toBeVisible();
  }

  /**
   * Check if a specific team is listed in the table
   */
  async expectTeamListed(teamName: string) {
    // Find the row containing the team name
    const teamRow = this.page.locator(`#teams-table tbody tr`).filter({
      hasText: teamName,
    });
    await expect(teamRow).toBeVisible();
  }

  /**
   * Get the number of listed teams
   */
  async getTeamCount(): Promise<number> {
    return await this.tableRows.count();
  }

  /**
   * Create a new team
   */
  async createTeam(name: string, description?: string) {
    // Click create team button
    await this.createTeamButton.click();

    // Wait for form to appear
    await expect(this.createTeamForm).toBeVisible();

    // Fill in team details
    await this.teamNameInput.fill(name);
    if (description) {
      await this.teamDescriptionInput.fill(description);
    }

    // Submit form
    const submitButton = this.createTeamForm.locator('button[type="submit"]');
    await submitButton.click();

    // Wait for navigation or success message
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Delete a team
   */
  async deleteTeam(teamName: string) {
    // Find the team row and delete button
    const teamRow = this.page.locator(`#teams-table tbody tr`).filter({
      hasText: teamName,
    });

    const deleteButton = teamRow.locator('button', { hasText: 'Delete' });
    await deleteButton.click();

    // Wait for navigation or success message
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Check if unauthorized page is shown when accessing without proper permissions
   */
  async expectUnauthorizedPage() {
    try {
      // We expect to be redirected to the unauthorized page with a timeout
      await expect(this.page).toHaveURL(/\/unauthorized/, { timeout: 10000 });
      // Check for the unauthorized title which should be present on the unauthorized page
      const unauthorizedTitle = this.page.locator('#unauthorized-title');
      await expect(unauthorizedTitle).toBeVisible();
      // Check for the return button
      const returnButton = this.page.locator('#return-to-previous');
      await expect(returnButton).toBeVisible();
    } catch {
      // If not redirected, check that we're still on the admin page but don't see team data
      // This is an acceptable state for the test as the protection can be done either via
      // redirect or by hiding content
      await expect(this.page).toHaveURL(/\/admin\/teams/);
      // Verify we don't see the teams table (protection by hiding content)
      await expect(this.teamsTable).not.toBeVisible();
    }
  }
}

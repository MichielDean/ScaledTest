import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { HeaderComponent } from './pages/HeaderComponent';
import { UserManagementPage } from './pages/UserManagementPage';
import { AdminTeamsPage } from './pages/AdminTeamsPage';
import { TestUsers } from './models/TestUsers';
import { setupPlaywright } from './playwrightSetup';

describe('Admin Workflows E2E Tests', () => {
  const playwrightContext = setupPlaywright();
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let headerComponent: HeaderComponent;
  let userManagementPage: UserManagementPage;
  let adminTeamsPage: AdminTeamsPage;

  beforeAll(async () => {
    loginPage = new LoginPage(playwrightContext.page);
    dashboardPage = new DashboardPage(playwrightContext.page);
    headerComponent = new HeaderComponent(playwrightContext.page);
    userManagementPage = new UserManagementPage(playwrightContext.page);
    adminTeamsPage = new AdminTeamsPage(playwrightContext.page);
  });

  describe('Owner: Full Admin Workflow', () => {
    beforeAll(async () => {
      await loginPage.loginWithUser(TestUsers.OWNER);
      await dashboardPage.expectDashboardLoaded();
    });

    afterAll(async () => {
      await loginPage.logout();
    });

    it('should navigate to user management via sidebar', async () => {
      await headerComponent.navigateToUserManagement();
      await userManagementPage.expectPageLoaded();
    });

    it('should display users table with user data', async () => {
      await userManagementPage.goto();
      await userManagementPage.expectPageLoaded();

      const userCount = await userManagementPage.getUserCount();
      expect(userCount).toBeGreaterThan(0);
    });

    it('should show users table columns (Username, Email, Teams, Actions)', async () => {
      await userManagementPage.goto();
      await userManagementPage.expectPageLoaded();

      const page = playwrightContext.page;
      const headers = page.locator('#users-table thead th');
      const headerTexts = await headers.allTextContents();

      expect(headerTexts).toContain('Username');
      expect(headerTexts).toContain('Email');
      expect(headerTexts).toContain('Teams');
      expect(headerTexts).toContain('Actions');
    });

    it('should show delete user button with confirmation dialog', async () => {
      await userManagementPage.goto();
      await userManagementPage.expectPageLoaded();

      const page = playwrightContext.page;

      // Find a delete button in the users table
      const deleteButton = page.locator('#users-table button:has-text("Delete User")').first();
      await deleteButton.waitFor({ state: 'visible', timeout: 5000 });

      // Click to open confirmation dialog
      await deleteButton.click();

      // Verify confirmation dialog appears
      const dialogTitle = page.locator('text=Delete User').first();
      await dialogTitle.waitFor({ state: 'visible', timeout: 5000 });

      const dialogDescription = page.locator('text=This action cannot be undone');
      expect(await dialogDescription.isVisible()).toBe(true);

      // Cancel the deletion
      const cancelButton = page.locator('button:has-text("Cancel")');
      await cancelButton.click();
    });

    it('should navigate to team management via sidebar', async () => {
      await headerComponent.navigateToTeamManagement();

      const page = playwrightContext.page;
      const teamsTitle = page.locator('#admin-teams-title');
      await teamsTitle.waitFor({ state: 'visible', timeout: 10000 });
      const titleText = await teamsTitle.textContent();
      expect(titleText).toBe('Team Management');
    });

    it('should display teams table with team data', async () => {
      await adminTeamsPage.goto();
      await adminTeamsPage.expectPageLoaded();

      const page = playwrightContext.page;
      const table = page.locator('table');
      await table.waitFor({ state: 'visible', timeout: 10000 });

      const headers = page.locator('table thead th');
      const headerTexts = await headers.allTextContents();

      expect(headerTexts).toContain('Team Name');
      expect(headerTexts).toContain('Description');
      expect(headerTexts).toContain('Members');
      expect(headerTexts).toContain('Actions');
    });

    it('should show create team button for owner', async () => {
      await adminTeamsPage.goto();
      await adminTeamsPage.expectPageLoaded();

      const createButton = playwrightContext.page.locator('#create-team-button');
      await createButton.waitFor({ state: 'visible', timeout: 5000 });
      expect(await createButton.isVisible()).toBe(true);
    });

    it('should open and close create team modal', async () => {
      await adminTeamsPage.goto();
      await adminTeamsPage.expectPageLoaded();

      const page = playwrightContext.page;

      // Click create team button
      const createButton = page.locator('#create-team-button');
      await createButton.click();

      // Verify modal opens
      const modal = page.locator('#create-team-modal');
      await modal.waitFor({ state: 'visible', timeout: 5000 });

      // Verify form fields are present
      const nameInput = page.locator('#team-name-input');
      const descInput = page.locator('#team-description-input');
      expect(await nameInput.isVisible()).toBe(true);
      expect(await descInput.isVisible()).toBe(true);

      // Cancel to close modal
      const cancelButton = page.locator('#cancel-create-team-button');
      await cancelButton.click();

      // Verify modal is closed
      await modal.waitFor({ state: 'hidden', timeout: 5000 });
    });

    it('should create a new team', async () => {
      await adminTeamsPage.goto();
      await adminTeamsPage.expectPageLoaded();

      const page = playwrightContext.page;
      const teamName = `E2E Test Team ${Date.now()}`;

      // Open create team modal
      const createButton = page.locator('#create-team-button');
      await createButton.click();

      const modal = page.locator('#create-team-modal');
      await modal.waitFor({ state: 'visible', timeout: 5000 });

      // Fill in team details
      await page.locator('#team-name-input').fill(teamName);
      await page.locator('#team-description-input').fill('Created by E2E admin workflow test');

      // Submit the form
      const submitButton = page.locator('#submit-create-team-button');
      await submitButton.click();

      // Wait for modal to close (indicates success)
      await modal.waitFor({ state: 'hidden', timeout: 10000 });

      // Verify the new team appears in the table
      await page.waitForLoadState('networkidle');
      const teamRow = page.locator('table tbody tr').filter({ hasText: teamName });
      await teamRow.waitFor({ state: 'visible', timeout: 10000 });
      expect(await teamRow.isVisible()).toBe(true);
    });

    it('should navigate between user management and team management', async () => {
      // Navigate to user management
      await headerComponent.navigateToUserManagement();
      await userManagementPage.expectPageLoaded();

      // Navigate to team management
      await headerComponent.navigateToTeamManagement();
      const teamsTitle = playwrightContext.page.locator('#admin-teams-title');
      await teamsTitle.waitFor({ state: 'visible', timeout: 10000 });

      // Navigate back to user management
      await headerComponent.navigateToUserManagement();
      await userManagementPage.expectPageLoaded();
    });
  });

  describe('Permission Boundaries: Readonly User', () => {
    beforeAll(async () => {
      await loginPage.loginWithUser(TestUsers.READONLY);
      await dashboardPage.expectDashboardLoaded();
    });

    afterAll(async () => {
      await loginPage.logout();
    });

    it('should not see admin navigation in sidebar', async () => {
      await headerComponent.expectNoAdminAccess();
    });

    it('should be denied access to user management', async () => {
      await userManagementPage.goto();
      await userManagementPage.expectUnauthorizedPage();
    });

    it('should be denied access to team management', async () => {
      await adminTeamsPage.goto();
      await adminTeamsPage.expectUnauthorizedPage();
    });
  });

  describe('Permission Boundaries: Maintainer User', () => {
    beforeAll(async () => {
      await loginPage.loginWithUser(TestUsers.MAINTAINER);
      await dashboardPage.expectDashboardLoaded();
    });

    afterAll(async () => {
      await loginPage.logout();
    });

    it('should see admin navigation in sidebar', async () => {
      await headerComponent.expectAdminAccess();
    });

    it('should be denied access to user management (owner only)', async () => {
      await userManagementPage.goto();
      await userManagementPage.expectAccessDenied();
    });

    it('should have access to team management', async () => {
      await headerComponent.navigateToTeamManagement();

      const teamsTitle = playwrightContext.page.locator('#admin-teams-title');
      await teamsTitle.waitFor({ state: 'visible', timeout: 10000 });
      expect(await teamsTitle.isVisible()).toBe(true);
    });

    it('should see teams table on team management page', async () => {
      await adminTeamsPage.goto();
      await adminTeamsPage.expectPageLoaded();

      const page = playwrightContext.page;
      const table = page.locator('table');
      await table.waitFor({ state: 'visible', timeout: 10000 });
    });
  });

  describe('Persistence: Changes Survive Page Reload', () => {
    beforeAll(async () => {
      await loginPage.loginWithUser(TestUsers.OWNER);
      await dashboardPage.expectDashboardLoaded();
    });

    afterAll(async () => {
      await loginPage.logout();
    });

    it('should persist user list after page reload', async () => {
      await userManagementPage.goto();
      await userManagementPage.expectPageLoaded();

      const initialCount = await userManagementPage.getUserCount();

      // Reload the page
      await playwrightContext.page.reload();
      await userManagementPage.expectPageLoaded();

      const reloadedCount = await userManagementPage.getUserCount();
      expect(reloadedCount).toBe(initialCount);
    });

    it('should persist teams list after page reload', async () => {
      await adminTeamsPage.goto();
      await adminTeamsPage.expectPageLoaded();

      const page = playwrightContext.page;
      const initialRows = await page.locator('table tbody tr').count();

      // Reload the page
      await page.reload();
      await adminTeamsPage.expectPageLoaded();

      const reloadedRows = await page.locator('table tbody tr').count();
      expect(reloadedRows).toBe(initialRows);
    });
  });
});

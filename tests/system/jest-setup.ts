/**
 * Jest Setup for System Tests
 *
 * This file sets up mocks and configurations that need to run within the Jest environment.
 * It runs after Jest has been initialized, so Jest APIs like jest.mock are available.
 */

// Mock the migration module to prevent actual migrations during tests
jest.mock('../../src/lib/migrations', () => ({
  runMigrations: jest.fn().mockResolvedValue(undefined),
  checkMigrationStatus: jest.fn().mockResolvedValue(false), // No pending migrations
  ensureDatabaseSchema: jest.fn().mockResolvedValue(undefined),
}));

import { setupTestEnv } from '../setup/environmentConfiguration';

setupTestEnv();

// Mock the migration module to prevent actual migrations during tests
jest.mock('../../src/lib/migrations', () => ({
  runMigrations: jest.fn().mockResolvedValue(undefined),
  checkMigrationStatus: jest.fn().mockResolvedValue(false), // No pending migrations
  ensureDatabaseSchema: jest.fn().mockResolvedValue(undefined),
}));

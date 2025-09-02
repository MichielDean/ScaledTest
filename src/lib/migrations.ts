import { spawn } from 'child_process';
import { dbLogger as logger } from '../logging/logger';

/**
 * Runs database migrations programmatically for both databases
 * This allows the application to automatically update both auth and scaledtest database schemas on startup
 */
export const runMigrations = async (): Promise<void> => {
  logger.info('Running database migrations for both databases...');

  // Run auth migrations first
  await runSingleDatabaseMigration(
    'auth',
    'postgresql://scaledtest:password@localhost:5432/auth',
    'migrations/auth'
  );

  // Then run scaledtest migrations
  await runSingleDatabaseMigration(
    'scaledtest',
    'postgresql://scaledtest:password@localhost:5432/scaledtest',
    'migrations/scaledtest'
  );

  logger.info('All database migrations completed successfully');
};

/**
 * Runs migrations for a single database
 */
const runSingleDatabaseMigration = async (
  dbName: string,
  databaseUrl: string,
  migrationsDir: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    logger.info(`Running ${dbName} database migrations...`);

    const migrationProcess = spawn(
      'npx',
      [
        'node-pg-migrate',
        '--migrations-dir',
        migrationsDir,
        'up',
        '--check-order',
        'false',
        '--verbose',
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
      }
    );

    let stdout = '';
    let stderr = '';

    migrationProcess.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    migrationProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    migrationProcess.on('close', (code: number) => {
      if (code === 0) {
        logger.info(`${dbName} database migrations completed successfully`, {
          output: stdout.trim() || 'No pending migrations',
        });
        resolve();
      } else {
        logger.error(`${dbName} database migrations failed`, {
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
        reject(new Error(`${dbName} migration failed with exit code ${code}: ${stderr.trim()}`));
      }
    });

    migrationProcess.on('error', (error: Error) => {
      logger.error(`Failed to start ${dbName} migration process`, { error: error.message });
      reject(error);
    });
  });
};

/**
 * Checks if migrations are needed for both databases
 */
export const checkMigrationStatus = async (): Promise<boolean> => {
  logger.info('Checking migration status for both databases...');

  const authNeedsMigrations = await checkSingleDatabaseMigrationStatus(
    'auth',
    'postgresql://scaledtest:password@localhost:5432/auth',
    'migrations/auth'
  );

  const scaledtestNeedsMigrations = await checkSingleDatabaseMigrationStatus(
    'scaledtest',
    'postgresql://scaledtest:password@localhost:5432/scaledtest',
    'migrations/scaledtest'
  );

  return authNeedsMigrations || scaledtestNeedsMigrations;
};

/**
 * Checks if migrations are needed for a single database
 */
const checkSingleDatabaseMigrationStatus = async (
  dbName: string,
  databaseUrl: string,
  migrationsDir: string
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const statusProcess = spawn(
      'npx',
      [
        'node-pg-migrate',
        '--migrations-dir',
        migrationsDir,
        'up',
        '--dry-run',
        '--check-order',
        'false',
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
      }
    );

    let stdout = '';
    let stderr = '';

    statusProcess.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    statusProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    statusProcess.on('close', (code: number) => {
      if (code === 0) {
        // Check if there are pending migrations
        const hasPendingMigrations = stdout.includes('Would run') || stdout.includes('migration');
        logger.debug(`${dbName} migration status check completed`, {
          hasPendingMigrations,
          output: stdout.trim(),
        });
        resolve(hasPendingMigrations);
      } else {
        logger.error(`${dbName} migration status check failed`, {
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
        reject(new Error(`${dbName} migration status check failed: ${stderr.trim()}`));
      }
    });

    statusProcess.on('error', (error: Error) => {
      logger.error(`Failed to check ${dbName} migration status`, { error: error.message });
      reject(error);
    });
  });
};

/**
 * Ensures database schema is up to date by running migrations if needed
 * This is the main function to call during application startup
 */
export const ensureDatabaseSchema = async (): Promise<void> => {
  try {
    logger.info('Checking database schema status...');

    // Check if migrations are needed
    const needsMigrations = await checkMigrationStatus();

    if (needsMigrations) {
      logger.info('Pending migrations detected, running migrations...');
      await runMigrations();
    } else {
      logger.info('Database schema is up to date');
    }
  } catch (error) {
    logger.error('Failed to ensure database schema is up to date', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

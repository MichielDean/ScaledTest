#!/usr/bin/env npx tsx

/**
 * Ensure all users are marked as email verified since we've disabled email verification completely.
 * This script should be run after disabling email verification to update existing users.
 */

import { Pool } from 'pg';
import { getRequiredEnvVar } from '../src/environment/env';
import { logger } from '../src/logging/logger';

async function ensureAllUsersVerified() {
  const pool = new Pool({
    connectionString: getRequiredEnvVar(
      'DATABASE_URL',
      'Database connection required to update user verification status'
    ),
  });

  try {
    logger.info('Starting to mark all users as email verified...');

    // Get current unverified users
    const unverifiedUsers = await pool.query(
      'SELECT id, email, name FROM "user" WHERE "emailVerified" = false'
    );

    if (unverifiedUsers.rows.length === 0) {
      logger.info('All users are already marked as verified');
      return;
    }

    logger.info(`Found ${unverifiedUsers.rows.length} unverified users:`);
    unverifiedUsers.rows.forEach(user => {
      logger.info(`  - ${user.email} (${user.name})`);
    });

    // Mark all users as verified
    const result = await pool.query(`
      UPDATE "user" 
      SET "emailVerified" = true, "updatedAt" = NOW()
      WHERE "emailVerified" = false
      RETURNING id, email, name
    `);

    logger.info(`Successfully marked ${result.rows.length} users as verified:`);
    result.rows.forEach(user => {
      logger.info(`  ✓ ${user.email} (${user.name})`);
    });

    logger.info('All users are now marked as email verified');
  } catch (error) {
    logger.error({ error }, 'Failed to update user verification status');
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the script
ensureAllUsersVerified()
  .then(() => {
    logger.info('Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed with error:', error);
    logger.error({ error: error.message || error }, 'Script failed');
    process.exit(1);
  });

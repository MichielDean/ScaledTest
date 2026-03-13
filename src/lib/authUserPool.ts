/**
 * Singleton database pool for auth user queries (admin endpoints).
 *
 * Previously, admin/users.ts created a new Pool on every request and then
 * destroyed it — causing connection churn and potential exhaustion under load.
 * This module provides a shared, lazily initialised pool instead.
 */
import { Pool } from 'pg';
import { dbLogger } from '../logging/logger';
import { getRequiredEnvVar } from '../environment/env';

let pool: Pool | null = null;

export function getAuthUserPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getRequiredEnvVar('DATABASE_URL', 'Auth user queries require DATABASE_URL'),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on('error', err => {
      dbLogger.error({ error: err.message }, 'Auth user pool error');
    });
  }
  return pool;
}

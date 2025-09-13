// Better Auth integration - prefer server-side admin API when available.
// Import the shared Better Auth instance. We use feature detection at runtime
// so this module remains robust in environments where the admin API might
// not be wired or available (for example, during some tests).
import { auth } from './auth';
import { createAuthAdapter } from './auth-adapter';
import { Team, TeamWithMemberCount } from '../types/team';
import { AuthWithAdminApi } from '../types/auth';
import { Pool } from 'pg';
import { dbLogger } from '../logging/logger';
import { getRequiredEnvVar } from '../environment/env';

/**
 * Team management with proper database storage
 * Provides team-related functionality for users using PostgreSQL backend
 */

// Singleton database pool instances
let dbPool: Pool | null = null;
let authDbPool: Pool | null = null; // kept for backward-compat type, but no longer used for auth lookups

/**
 * Get or create the singleton database connection pool for the main application (scaledtest)
 * Reuses the same pool instance across all function calls to prevent connection exhaustion
 */
export function getDbPool(): Pool {
  if (!dbPool) {
    // Team management uses the main application database (scaledtest)
    const databaseUrl = getRequiredEnvVar(
      'TIMESCALE_DATABASE_URL',
      'Team management requires a valid database connection'
    );

    dbPool = new Pool({
      connectionString: databaseUrl,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close clients after 30 seconds of inactivity
      connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection could not be established
    });

    // Handle pool errors
    dbPool.on('error', err => {
      dbLogger.error({ error: err.message }, 'Database pool error');
    });

    // Log when pool is created
    dbLogger.debug('Database connection pool created for team management');
  }

  return dbPool;
}

/**
 * Type guard to check if the auth object has admin API methods
 */
function hasAuthApi(obj: unknown): obj is AuthWithAdminApi {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const authObj = obj as Record<string, unknown>;
  if (!('api' in authObj) || typeof authObj.api !== 'object' || authObj.api === null) {
    return false;
  }

  return true;
}

/**
 * Type guard to check if the API object has the expected Better Auth admin methods
 */
function isBetterAuthAdminApi(api: unknown): api is Record<string, unknown> {
  if (typeof api !== 'object' || api === null) {
    return false;
  }

  const apiObj = api as Record<string, unknown>;
  return (
    typeof apiObj.getUser === 'function' ||
    typeof apiObj.getSession === 'function' ||
    typeof apiObj.updateUser === 'function' ||
    typeof apiObj.deleteUser === 'function'
  );
}

/**
 * Feature-detect whether the Better Auth admin API surface is available.
 * We check for the presence of auth.api and a likely admin method. This
 * keeps the module resilient while the project migrates to the latest
 * Better Auth API.
 */
function isAuthApiAvailable(): boolean {
  try {
    if (!hasAuthApi(auth)) {
      return false;
    }

    // Use proper type checking instead of casting to any
    return isBetterAuthAdminApi(auth.api);
  } catch (err) {
    dbLogger.debug({ err }, 'Error during Better Auth API availability check');
    return false;
  }
} /**
 * Verify a user exists using Better Auth admin API when available.
 * Uses an adapter pattern to provide a stable interface over Better Auth API variations.
 */
export async function verifyUserExists(userId: string): Promise<boolean> {
  // Prefer using Better Auth admin API if present
  if (isAuthApiAvailable()) {
    try {
      // Use safe casting approach to avoid 'any' while working with dynamic API structure
      const authWithApi = auth as unknown as AuthWithAdminApi;
      const api = authWithApi.api;

      if (!api || !isBetterAuthAdminApi(api)) {
        dbLogger.debug(
          { userId },
          "Better Auth admin API not available or doesn't have expected methods"
        );
        return false;
      }

      // Use the adapter pattern to handle API version differences cleanly
      const authAdapter = createAuthAdapter(authWithApi);
      const userExists = await authAdapter.userExists(userId);

      if (userExists) {
        dbLogger.debug({ userId, userFound: true }, 'User found via Better Auth admin API adapter');
        return true;
      }

      dbLogger.debug({ userId }, 'User not found via Better Auth admin API adapter');
    } catch (err) {
      dbLogger.warn({ userId, error: err }, 'Error during Better Auth API user verification');
    }
  }

  // Do NOT fall back to direct auth DB queries. If the admin API is not
  // available or did not confirm the user, treat the user as non-existent.
  dbLogger.debug(
    { userId },
    'Auth admin API not available or user not found; not falling back to auth DB'
  );
  return false;
}

/**
 * Factory: create a new DB pool instance. Caller manages lifecycle.
 * Useful for tests or DI where module-level singletons are undesirable.
 */
export function createDbPool(): Pool {
  const databaseUrl = getRequiredEnvVar(
    'TIMESCALE_DATABASE_URL',
    'Team management requires a valid database connection'
  );

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', err => {
    dbLogger.error({ error: err.message }, 'Database pool error');
  });

  dbLogger.debug('Database connection pool created (factory) for team management');
  return pool;
}

/**
 * Get or create the singleton database connection pool for authentication (auth)
 * Reuses the same pool instance across all function calls to prevent connection exhaustion
 */
// NOTE: Direct access to the auth database has been removed. All auth
// user lookups and modifications must go through the Better Auth admin API.
// The previous `getAuthDbPool()` helper has been intentionally removed to
// prevent accidental DB fallbacks.

/**
 * Factory: create a new auth DB pool instance. Caller manages lifecycle.
 */
// createAuthDbPool removed for the same reason as getAuthDbPool.

/**
 * Gracefully shutdown the database pools
 * Should be called when the application is shutting down
 */
export async function shutdownTeamManagementPool(): Promise<void> {
  const promises = [];

  if (dbPool) {
    promises.push(dbPool.end());
    dbPool = null;
  }

  if (authDbPool) {
    promises.push(authDbPool.end());
    authDbPool = null;
  }

  await Promise.all(promises);
  dbLogger.debug('Team management database pools shutdown completed');
}

/**
 * Test / DI helper - allow overriding the module-level pools for tests or DI.
 * Use sparingly and only from test setup code.
 */
export function setTeamManagementPools(pools: { dbPool?: Pool | null }) {
  if (Object.prototype.hasOwnProperty.call(pools, 'dbPool')) {
    dbPool = pools.dbPool ?? null;
  }
}

/**
 * Get teams for a user from the database
 */
export async function getUserTeams(userId: string): Promise<Team[]> {
  const pool = getDbPool();

  try {
    const exists = await verifyUserExists(userId);
    if (!exists) {
      dbLogger.warn({ userId }, 'User does not exist according to auth provider or auth DB');
      return [];
    }

    // Query user's teams from the database
    const result = await pool.query(
      `
      SELECT 
        t.id,
        t.name,
        t.description,
        t.is_default as "isDefault",
        t.created_at as "createdAt",
        t.updated_at as "updatedAt",
        ut.assigned_at as "assignedAt"
      FROM teams t
      INNER JOIN user_teams ut ON t.id = ut.team_id
      WHERE ut.user_id = $1
      ORDER BY t.is_default DESC, t.name ASC
    `,
      [userId]
    );

    const teams: Team[] = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      isDefault: row.isDefault,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));

    dbLogger.debug(
      {
        userId,
        teamCount: teams.length,
        teamIds: teams.map(t => t.id),
      },
      'Retrieved user teams'
    );

    return teams;
  } catch (error) {
    dbLogger.error(
      {
        error,
        userId,
      },
      'Error fetching user teams'
    );
    return [];
  }
}

/**
 * Add a user to a team in the database
 */
export async function addUserToTeam(
  userId: string,
  teamId: string,
  assignedBy: string
): Promise<boolean> {
  const pool = getDbPool();

  try {
    // Verify user existence using Better Auth admin API when available and
    // fall back to the auth DB. If verification fails, throw a clear error so
    // callers can react appropriately.
    const exists = await verifyUserExists(userId);
    if (!exists) {
      dbLogger.warn({ userId }, 'User verification failed; refusing to assign to team');
      throw new Error('User not found');
    }

    // Verify team exists
    const teamCheck = await pool.query('SELECT id FROM teams WHERE id = $1', [teamId]);
    if (teamCheck.rows.length === 0) {
      throw new Error('Team not found');
    }

    // Check if user is already in the team
    const existingAssignment = await pool.query(
      'SELECT id FROM user_teams WHERE user_id = $1 AND team_id = $2',
      [userId, teamId]
    );

    if (existingAssignment.rows.length > 0) {
      dbLogger.info({ userId, teamId }, 'User already assigned to team');
      return true; // Already assigned, consider it successful
    }

    // Add user to team
    await pool.query('INSERT INTO user_teams (user_id, team_id, assigned_by) VALUES ($1, $2, $3)', [
      userId,
      teamId,
      assignedBy,
    ]);

    dbLogger.info(
      {
        userId,
        teamId,
        assignedBy,
      },
      'User successfully assigned to team'
    );

    return true;
  } catch (error) {
    dbLogger.error(
      {
        error,
        userId,
        teamId,
        assignedBy,
      },
      'Error assigning user to team'
    );
    throw error;
  }
}

/**
 * Remove a user from a team in the database
 */
export async function removeUserFromTeam(
  userId: string,
  teamId: string,
  removedBy?: string
): Promise<boolean> {
  const pool = getDbPool();

  try {
    // Verify the assignment exists
    const existingAssignment = await pool.query(
      'SELECT id FROM user_teams WHERE user_id = $1 AND team_id = $2',
      [userId, teamId]
    );

    if (existingAssignment.rows.length === 0) {
      dbLogger.info({ userId, teamId }, 'User not assigned to team');
      return true; // Not assigned, consider removal successful
    }

    // Remove user from team
    const result = await pool.query('DELETE FROM user_teams WHERE user_id = $1 AND team_id = $2', [
      userId,
      teamId,
    ]);

    dbLogger.info(
      {
        userId,
        teamId,
        removedBy: removedBy || 'system',
        removedCount: result.rowCount ?? 0,
      },
      'User successfully removed from team'
    );

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    dbLogger.error(
      {
        error,
        userId,
        teamId,
        removedBy,
      },
      'Error removing user from team'
    );
    throw error;
  }
}

/**
 * Get all teams in the system from the database with member counts
 */
export async function getAllTeams(): Promise<TeamWithMemberCount[]> {
  const pool = getDbPool();

  try {
    const result = await pool.query(`
      SELECT 
        t.id,
        t.name,
        t.description,
        t.is_default as "isDefault",
        t.created_at as "createdAt",
        t.updated_at as "updatedAt",
        COUNT(ut.user_id) as member_count
      FROM teams t
      LEFT JOIN user_teams ut ON t.id = ut.team_id
      GROUP BY t.id, t.name, t.description, t.is_default, t.created_at, t.updated_at
      ORDER BY t.is_default DESC, t.name ASC
    `);

    const teams: TeamWithMemberCount[] = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      isDefault: row.isDefault,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      memberCount: parseInt(row.member_count) || 0,
    }));

    dbLogger.debug(
      {
        teamCount: teams.length,
      },
      'Retrieved all teams'
    );

    return teams;
  } catch (error) {
    dbLogger.error({ error }, 'Error fetching all teams');
    return [];
  }
}

/**
 * Create a new team in the database
 */
export async function createTeam(
  teamData: {
    name: string;
    description?: string;
  },
  createdBy: string
): Promise<Team> {
  const pool = getDbPool();

  try {
    // Check if team name already exists
    const existingTeam = await pool.query('SELECT id FROM teams WHERE name = $1', [teamData.name]);

    if (existingTeam.rows.length > 0) {
      throw new Error('Team name already exists');
    }

    // Create the team
    const result = await pool.query(
      `
      INSERT INTO teams (name, description, created_by)
      VALUES ($1, $2, $3)
      RETURNING 
        id,
        name,
        description,
        is_default as "isDefault",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
      [teamData.name, teamData.description || null, createdBy]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to create team');
    }

    const newTeam: Team = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description || '',
      isDefault: result.rows[0].isDefault,
      createdAt: new Date(result.rows[0].createdAt),
      updatedAt: new Date(result.rows[0].updatedAt),
    };

    dbLogger.info(
      {
        teamId: newTeam.id,
        teamName: newTeam.name,
        createdBy,
      },
      'Team created successfully'
    );

    return newTeam;
  } catch (error) {
    dbLogger.error(
      {
        error,
        teamName: teamData.name,
        createdBy,
      },
      'Error creating team'
    );
    throw error;
  }
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  await shutdownTeamManagementPool();
});

process.on('SIGTERM', async () => {
  await shutdownTeamManagementPool();
});

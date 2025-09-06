// TODO: Re-enable when Better Auth v1.3.7 API is properly integrated
// import { auth } from './auth';
import { Team, TeamWithMemberCount } from '../types/team';
import { Pool } from 'pg';
import { dbLogger } from '../logging/logger';
import { getRequiredEnvVar } from '../environment/env';

/**
 * Team management with proper database storage
 * Provides team-related functionality for users using PostgreSQL backend
 */

// Singleton database pool instances
let dbPool: Pool | null = null;
let authDbPool: Pool | null = null;

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
 * Get or create the singleton database connection pool for authentication (auth)
 * Reuses the same pool instance across all function calls to prevent connection exhaustion
 */
export function getAuthDbPool(): Pool {
  if (!authDbPool) {
    // Auth database contains Better Auth tables including users
    const databaseUrl = getRequiredEnvVar(
      'DATABASE_URL',
      'Auth database connection required for user management'
    );

    authDbPool = new Pool({
      connectionString: databaseUrl,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close clients after 30 seconds of inactivity
      connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection could not be established
    });

    // Handle pool errors
    authDbPool.on('error', err => {
      dbLogger.error({ error: err.message }, 'Auth database pool error');
    });

    // Log when pool is created
    dbLogger.debug('Auth database connection pool created for user management');
  }

  return authDbPool;
}

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
 * Get teams for a user from the database
 */
export async function getUserTeams(userId: string): Promise<Team[]> {
  const pool = getDbPool();

  try {
    const authPool = getAuthDbPool();

    // Verify user existence in the authentication database
    const userResult = await authPool.query(
      `
          SELECT id FROM "user" WHERE id = $1
        `,
      [userId]
    );
    if (userResult.rowCount === 0) {
      dbLogger.warn({ userId }, 'User does not exist in authentication database');
      return [];
    }
    // NOTE: Do NOT call authPool.end() here. getAuthDbPool() returns a shared
    // singleton pool used across the application; closing it on every call
    // breaks pooling and causes connection exhaustion for subsequent requests.

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
    // Skip user verification for now since Better Auth API methods have changed
    // TODO: Update to use correct Better Auth v1.3.7 API methods
    // const user = await auth.api.getUser({
    //   body: { userId },
    // });

    // if (!user) {
    //   throw new Error('User not found');
    // }

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

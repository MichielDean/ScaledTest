import { auth } from './auth';
import { Team, TeamWithMemberCount } from '../types/team';
import { Pool } from 'pg';
import { dbLogger } from '../logging/logger';

/**
 * Team management with proper database storage
 * Provides team-related functionality for users using PostgreSQL backend
 */

// Singleton database pool instance
let dbPool: Pool | null = null;

/**
 * Get or create the singleton database connection pool
 * Reuses the same pool instance across all function calls to prevent connection exhaustion
 */
function getDbPool(): Pool {
  if (!dbPool) {
    dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close clients after 30 seconds of inactivity
      connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection could not be established
    });

    // Handle pool errors
    dbPool.on('error', err => {
      dbLogger.error('Database pool error', { error: err.message });
    });

    // Log when pool is created
    dbLogger.debug('Database connection pool created for team management');
  }

  return dbPool;
}

/**
 * Gracefully shutdown the database pool
 * Should be called when the application is shutting down
 */
export async function shutdownTeamManagementPool(): Promise<void> {
  if (dbPool) {
    await dbPool.end();
    dbPool = null;
    dbLogger.debug('Team management database pool shutdown completed');
  }
}

/**
 * Get teams for a user from the database
 */
export async function getUserTeams(userId: string): Promise<Team[]> {
  const pool = getDbPool();

  try {
    // Verify user exists first
    const user = await auth.api.getUser({
      body: { userId },
    });

    if (!user) {
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

    dbLogger.debug('Retrieved user teams', {
      userId,
      teamCount: teams.length,
      teamIds: teams.map(t => t.id),
    });

    return teams;
  } catch (error) {
    dbLogger.error('Error fetching user teams', {
      error,
      userId,
    });
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
    // Verify user exists
    const user = await auth.api.getUser({
      body: { userId },
    });

    if (!user) {
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
      dbLogger.info('User already assigned to team', { userId, teamId });
      return true; // Already assigned, consider it successful
    }

    // Add user to team
    await pool.query('INSERT INTO user_teams (user_id, team_id, assigned_by) VALUES ($1, $2, $3)', [
      userId,
      teamId,
      assignedBy,
    ]);

    dbLogger.info('User successfully assigned to team', {
      userId,
      teamId,
      assignedBy,
    });

    return true;
  } catch (error) {
    dbLogger.error('Error assigning user to team', {
      error,
      userId,
      teamId,
      assignedBy,
    });
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
      dbLogger.info('User not assigned to team', { userId, teamId });
      return true; // Not assigned, consider removal successful
    }

    // Remove user from team
    const result = await pool.query('DELETE FROM user_teams WHERE user_id = $1 AND team_id = $2', [
      userId,
      teamId,
    ]);

    dbLogger.info('User successfully removed from team', {
      userId,
      teamId,
      removedBy: removedBy || 'system',
      removedCount: result.rowCount ?? 0,
    });

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    dbLogger.error('Error removing user from team', {
      error,
      userId,
      teamId,
      removedBy,
    });
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

    dbLogger.debug('Retrieved all teams', {
      teamCount: teams.length,
    });

    return teams;
  } catch (error) {
    dbLogger.error('Error fetching all teams', { error });
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

    dbLogger.info('Team created successfully', {
      teamId: newTeam.id,
      teamName: newTeam.name,
      createdBy,
    });

    return newTeam;
  } catch (error) {
    dbLogger.error('Error creating team', {
      error,
      teamName: teamData.name,
      createdBy,
    });
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

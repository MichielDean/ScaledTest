import { Pool, PoolClient } from 'pg';
import { dbLogger as logger, logError } from '../logging/logger';
import { getRequiredEnvVar, getOptionalEnvVar, parseIntEnvVar } from '../environment/env';
import { CtrfSchema } from '../schemas/ctrf/ctrf';

// Type-safe error code extraction
const getErrorCode = (err: unknown): string => {
  if (err && typeof err === 'object' && 'code' in err) {
    return String(err.code);
  }
  return 'UNKNOWN';
};

// Performance monitoring utility
const trackQueryPerformance = async <T>(
  queryName: string,
  queryFn: () => Promise<T>
): Promise<T> => {
  const startTime = Date.now();
  try {
    const result = await queryFn();
    const duration = Date.now() - startTime;

    logger.info(
      {
        queryName,
        duration,
        status: 'success',
      },
      'Query performance'
    );

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      {
        queryName,
        duration,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Query performance'
    );
    throw error;
  }
};

// Get TimescaleDB configuration from environment variables
const host = getRequiredEnvVar('TIMESCALEDB_HOST', 'TimescaleDB configuration is incomplete.');
const port = parseInt(getOptionalEnvVar('TIMESCALEDB_PORT', '5432'), 10);
const database = getRequiredEnvVar(
  'TIMESCALEDB_DATABASE',
  'TimescaleDB configuration is incomplete.'
);
const user = getRequiredEnvVar('TIMESCALEDB_USERNAME', 'TimescaleDB configuration is incomplete.');
const password = getRequiredEnvVar(
  'TIMESCALEDB_PASSWORD',
  'TimescaleDB configuration is incomplete.'
);

let timescalePool: Pool | null = null;

// Function to get or create the singleton TimescaleDB pool
function getTimescalePool(): Pool {
  if (!timescalePool) {
    // Log configuration (without password) - only once when pool is created
    logger.debug(
      {
        host,
        port,
        database,
        user,
      },
      'Configuring TimescaleDB client'
    );

    // Read max connections from environment, default to 30
    const maxConnections = parseIntEnvVar('TIMESCALEDB_MAX_CONNECTIONS', 30);
    logger.debug({ maxConnections }, 'TimescaleDB pool max connections');

    // Create TimescaleDB connection pool with optimized settings
    const defaultStatementTimeout = parseIntEnvVar('TIMESCALEDB_STATEMENT_TIMEOUT_MS', 15000);

    timescalePool = new Pool({
      host,
      port,
      database,
      user,
      password,
      max: maxConnections,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 5000,
      statement_timeout: defaultStatementTimeout,
    });

    // Handle pool errors to prevent unhandled error crashes
    timescalePool.on('error', (err: Error) => {
      // Only log errors that occur during normal operation (not shutdown)
      logger.error(
        {
          error: err?.message || 'Unknown error',
          code: getErrorCode(err),
        },
        'TimescaleDB pool error'
      );
    });

    // Handle pool connect events for debugging
    timescalePool.on('connect', () => {
      logger.debug('TimescaleDB pool connected');
    });
  }

  return timescalePool;
}

// Test data structure for a CTRF report entry
export interface TimescaleCtrfReport extends CtrfSchema {
  reportId: string;
  storedAt: string;
  metadata: {
    uploadedBy: string;
    userTeams: string[];
    uploadedAt: string;
  };
}

// Function to check if TimescaleDB is connected
export async function checkTimescaleConnection(): Promise<boolean> {
  let client;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();
    await client.query('SELECT 1');
    return true;
  } catch (error) {
    logError(logger, 'Failed to connect to TimescaleDB', error, {
      host,
      port,
      database,
      user,
    });
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Function to ensure the test_reports hypertable is ready
export const ensureTestReportsTableExists = async (): Promise<void> => {
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'test_reports'
      ) as table_exists;
    `);

    if (!result.rows[0].table_exists) {
      throw new Error(
        'test_reports table does not exist. Database migrations may not have completed successfully. ' +
          'Check application startup logs for migration errors.'
      );
    }

    logger.debug('TimescaleDB test_reports hypertable is ready');
  } catch (error) {
    logError(logger, 'Failed to verify TimescaleDB test_reports table', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};

// Function to store a CTRF report in TimescaleDB
export const storeCtrfReport = async (report: TimescaleCtrfReport): Promise<string> => {
  return trackQueryPerformance('storeCtrfReport', async () => {
    let client: PoolClient | null = null;
    try {
      const pool = getTimescalePool();
      client = await pool.connect();

      // Insert the report into TimescaleDB
      const insertQuery = `
      INSERT INTO test_reports (
        report_id,
        report_format,
        spec_version,
        timestamp,
        stored_at,
        generated_by,
        tool_name,
        tool_version,
        tool_url,
        summary_tests,
        summary_passed,
        summary_failed,
        summary_skipped,
        summary_pending,
        summary_other,
        summary_start,
        summary_stop,
        environment_app_name,
        environment_app_version,
        environment_build_name,
        environment_build_number,
        environment_branch_name,
        environment_test_environment,
        uploaded_by,
        user_teams,
        test_data,
        environment_data,
        extra_data
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28
      )
      ON CONFLICT (report_id, timestamp) DO UPDATE SET
        stored_at = EXCLUDED.stored_at,
        test_data = EXCLUDED.test_data,
        environment_data = EXCLUDED.environment_data,
        extra_data = EXCLUDED.extra_data
      RETURNING report_id;
    `;

      const values = [
        report.reportId, // $1
        report.reportFormat || 'CTRF', // $2
        report.specVersion || '1.0.0', // $3
        report.timestamp || new Date().toISOString(), // $4
        report.storedAt || new Date().toISOString(), // $5
        report.generatedBy || null, // $6
        report.results?.tool?.name || null, // $7
        report.results?.tool?.version || null, // $8
        report.results?.tool?.url || null, // $9
        report.results?.summary?.tests || 0, // $10
        report.results?.summary?.passed || 0, // $11
        report.results?.summary?.failed || 0, // $12
        report.results?.summary?.skipped || 0, // $13
        report.results?.summary?.pending || 0, // $14
        report.results?.summary?.other || 0, // $15
        report.results?.summary?.start
          ? new Date(report.results.summary.start).toISOString()
          : null, // $16
        report.results?.summary?.stop ? new Date(report.results.summary.stop).toISOString() : null, // $17
        report.results?.environment?.appName || null, // $18
        report.results?.environment?.appVersion || null, // $19
        report.results?.environment?.buildName || null, // $20
        report.results?.environment?.buildNumber || null, // $21 - Use null for missing buildNumber
        report.results?.environment?.branchName || null, // $22
        report.results?.environment?.testEnvironment || null, // $23
        report.metadata?.uploadedBy || null, // $24
        JSON.stringify(report.metadata?.userTeams || []), // $25
        JSON.stringify(report.results || {}), // $26 - Store full test results
        JSON.stringify(
          Object.fromEntries(
            Object.entries(report.results?.environment || {}).filter(
              ([, value]) => value !== null && value !== undefined
            )
          )
        ), // $27 - Store environment data (filter out null/undefined values)
        JSON.stringify(report.extra || {}), // $28
      ];

      const result = await client.query(insertQuery, values);

      if (!result.rowCount || !result.rows[0]) {
        throw new Error('Failed to insert CTRF report: no rows returned from database.');
      }

      const storedReportId = result.rows[0].report_id;
      logger.info(
        {
          reportId: storedReportId,
          tool: report.results?.tool?.name,
          testCount: report.results?.summary?.tests,
          userTeams: report.metadata?.userTeams,
        },
        'CTRF report stored successfully in TimescaleDB'
      );

      return storedReportId;
    } catch (error) {
      logError(logger, 'Failed to store CTRF report in TimescaleDB', error, {
        reportId: report.reportId,
        tool: report.results?.tool?.name,
        testCount: report.results?.summary?.tests,
      });
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  });
};

// Function to get total count of reports in TimescaleDB
export const getTimescaleReportCount = async (): Promise<number> => {
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    const result = await client.query('SELECT COUNT(*) as count FROM test_reports');
    const count = parseInt(result.rows[0].count, 10);

    logger.debug({ count }, 'Retrieved TimescaleDB report count');
    return count;
  } catch (error) {
    logError(logger, 'Failed to get TimescaleDB report count', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};

// Function to search CTRF reports in TimescaleDB (for read migration)
export const searchCtrfReports = async (
  uploadedBy: string,
  userTeams: string[],
  filters: {
    page?: number;
    size?: number;
    status?: string;
    tool?: string;
    environment?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}
): Promise<{
  reports: Array<TimescaleCtrfReport>;
  total: number;
}> => {
  return trackQueryPerformance('searchCtrfReports', async () => {
    let client: PoolClient | null = null;
    try {
      const pool = getTimescalePool();
      client = await pool.connect();

      const { page = 1, size = 20, status, tool, environment, dateFrom, dateTo } = filters;

      const offset = (page - 1) * size;
      const limit = Math.min(size, 100);

      // Build WHERE conditions
      const conditions: string[] = [];
      const values: (string | number | boolean | string[])[] = [];
      let paramIndex = 1;

      // Team-based access control
      if (userTeams.length > 0) {
        // Check if user_teams JSON array has any overlap with user's teams using ?| operator
        conditions.push(`(
        uploaded_by = $${paramIndex} OR 
        user_teams::jsonb ?| $${paramIndex + 1}::text[]
      )`);
        values.push(uploadedBy, userTeams);
        paramIndex += 2;
      } else {
        // User with no teams - can only see their own uploads
        conditions.push(`uploaded_by = $${paramIndex}`);
        values.push(uploadedBy);
        paramIndex++;
      }

      // Additional filters
      if (tool) {
        conditions.push(`tool_name = $${paramIndex}`);
        values.push(tool);
        paramIndex++;
      }

      if (environment) {
        conditions.push(`environment_test_environment = $${paramIndex}`);
        values.push(environment);
        paramIndex++;
      }

      if (dateFrom) {
        conditions.push(`timestamp >= $${paramIndex}`);
        values.push(dateFrom);
        paramIndex++;
      }

      if (dateTo) {
        conditions.push(`timestamp <= $${paramIndex}`);
        values.push(dateTo);
        paramIndex++;
      }

      // Status filter requires JSON parsing of test_data
      if (status) {
        conditions.push(`EXISTS (
        SELECT 1 FROM jsonb_array_elements(test_data->'tests') AS test 
        WHERE test->>'status' = $${paramIndex}
      )`);
        values.push(status);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count query
      const countQuery = `
      SELECT COUNT(*) as total
      FROM test_reports
      ${whereClause}
    `;

      const countResult = await client.query(countQuery, values);
      const total = parseInt(countResult.rows[0].total, 10);

      // Data query
      const dataQuery = `
      SELECT 
        report_id,
        report_format,
        spec_version,
        timestamp,
        stored_at,
        generated_by,
        tool_name,
        tool_version,
        tool_url,
        summary_tests,
        summary_passed,
        summary_failed,
        summary_skipped,
        summary_pending,
        summary_other,
        summary_start,
        summary_stop,
        environment_app_name,
        environment_app_version,
        environment_build_name,
        environment_build_number,
        environment_branch_name,
        environment_test_environment,
        uploaded_by,
        user_teams,
        test_data,
        environment_data,
        extra_data
      FROM test_reports
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

      const dataValues = [...values, limit, offset];
      const dataResult = await client.query(dataQuery, dataValues);

      // Transform results back to TimescaleCtrfReport format
      const reports: TimescaleCtrfReport[] = dataResult.rows.map(row => {
        const testData =
          typeof row.test_data === 'string' ? JSON.parse(row.test_data) : row.test_data;
        const extraData =
          typeof row.extra_data === 'string' ? JSON.parse(row.extra_data) : row.extra_data;

        // Preserve original environment data format from JSON
        const originalEnvironment = testData?.environment || {};

        // Preserve original tool object structure from stored test_data
        const originalTool = testData?.tool || {};

        // Use the complete original tool object to preserve all fields including extra
        const toolObject = originalTool;

        // Preserve original summary data format from JSON, including start/stop field types
        const originalSummary = testData?.summary || {};

        return {
          reportId: row.report_id,
          reportFormat: row.report_format,
          specVersion: row.spec_version,
          timestamp: row.timestamp,
          storedAt: row.stored_at,
          generatedBy: row.generated_by,
          results: {
            tool: toolObject,
            summary: {
              tests: originalSummary.tests ?? row.summary_tests,
              passed: originalSummary.passed ?? row.summary_passed,
              failed: originalSummary.failed ?? row.summary_failed,
              skipped: originalSummary.skipped ?? row.summary_skipped,
              pending: originalSummary.pending ?? row.summary_pending,
              other: originalSummary.other ?? row.summary_other,
              start: originalSummary.start ?? row.summary_start,
              stop: originalSummary.stop ?? row.summary_stop,
            },
            environment: originalEnvironment,
            tests: testData?.tests || [],
          },
          metadata: {
            uploadedBy: row.uploaded_by,
            userTeams:
              typeof row.user_teams === 'string' ? JSON.parse(row.user_teams) : row.user_teams,
            uploadedAt: row.stored_at,
          },
          extra: extraData,
        };
      });

      logger.debug(
        {
          uploadedBy,
          userTeams,
          total,
          returnedCount: reports.length,
          filters,
        },
        'Retrieved CTRF reports from TimescaleDB'
      );

      return { reports, total };
    } catch (error) {
      logError(logger, 'Failed to search CTRF reports in TimescaleDB', error, {
        uploadedBy,
        userTeams,
        filters,
      });
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  });
};

// Graceful shutdown function
export const shutdownTimescaleDB = async (): Promise<void> => {
  try {
    if (timescalePool) {
      await timescalePool.end();
      timescalePool = null; // Clear the singleton instance
    }
  } catch {
    // We're shutting down, so we don't care about errors
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  await shutdownTimescaleDB();
});

process.on('SIGTERM', async () => {
  await shutdownTimescaleDB();
});

export { getTimescalePool };

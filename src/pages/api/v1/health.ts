/**
 * GET /api/v1/health
 * Database connection pool health monitoring endpoint.
 * No auth required — designed for load balancers and k8s probes.
 * Response: { success: boolean, data: { status, database: { connected, pool, timescaledb } } }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getTimescalePool } from '@/lib/timescaledb';
import { apiLogger as logger } from '@/logging/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  }

  const pool = getTimescalePool();

  const poolStats = {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };

  let connected = false;
  let timescaleInstalled = false;
  let timescaleVersion: string | null = null;
  let dbError: string | undefined;

  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      connected = true;

      try {
        const extResult = await client.query<{ extversion: string }>(
          `SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'`
        );
        if (extResult.rows.length > 0) {
          timescaleInstalled = true;
          timescaleVersion = extResult.rows[0].extversion;
        }
      } catch (extErr) {
        logger.warn({ err: extErr }, 'Failed to check TimescaleDB extension status');
      }
    } finally {
      client.release();
    }
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err }, 'Health check: database connection failed');
  }

  const status = !connected ? 'unhealthy' : !timescaleInstalled ? 'degraded' : 'healthy';

  const data = {
    status,
    database: {
      connected,
      ...(dbError ? { error: dbError } : {}),
      pool: poolStats,
      timescaledb: {
        installed: timescaleInstalled,
        version: timescaleVersion,
      },
    },
  };

  if (status === 'unhealthy') {
    return res.status(503).json({ success: false, data });
  }

  return res.json({ success: true, data });
}

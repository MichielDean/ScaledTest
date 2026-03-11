/**
 * GET /api/v1/reports/[id] — fetch a single CTRF report by ID
 *
 * Auth: readonly+ required
 *
 * Response 200: { success: true, data: CtrfReport }
 * Response 404: { success: false, error: 'Report not found' }
 */

import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { getCtrfReportById } from '@/lib/timescaledb';
import { getUserTeams } from '@/lib/teamManagement';
import { isValidUuid } from '@/lib/validation';
import { apiLogger as logger } from '@/logging/logger';

async function handleGet(req: BetterAuthenticatedRequest, res: NextApiResponse): Promise<void> {
  const { id } = req.query as { id: string };

  if (!id || !isValidUuid(id)) {
    res.status(400).json({ success: false, error: 'Invalid report ID — must be a UUID' });
    return;
  }

  try {
    const userTeams = await getUserTeams(req.user.id);
    const teamIds = userTeams.map(t => t.id);

    const report = await getCtrfReportById(id, req.user.id, teamIds);

    if (!report) {
      res.status(404).json({ success: false, error: 'Report not found' });
      return;
    }

    logger.info({ reportId: id }, 'Report fetched by ID');

    res.status(200).json({
      success: true,
      data: {
        _id: report.reportId,
        reportId: report.reportId,
        reportFormat: report.reportFormat,
        specVersion: report.specVersion,
        timestamp: report.timestamp,
        generatedBy: report.generatedBy,
        storedAt: report.storedAt,
        results: report.results,
        extra: report.extra,
      },
    });
  } catch (error) {
    logger.error({ error, reportId: id }, 'Failed to fetch report');
    res.status(500).json({ success: false, error: 'Failed to fetch report' });
  }
}

export default createBetterAuthApi({ GET: handleGet }, 'readonly');

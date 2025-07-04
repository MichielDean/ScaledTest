import { NextApiRequest, NextApiResponse } from 'next';
import opensearchClient from '../../../lib/opensearch';
import { dbLogger as logger, logError } from '../../../logging/logger';
import { verifyToken } from '../../../auth/apiAuth';

interface CustomQueryRequest {
  query: Record<string, unknown>;
}

interface CustomQueryResponse {
  success: boolean;
  data?: {
    aggregations?: Record<string, unknown>;
    hits?: {
      total: number;
      hits: unknown[];
    };
  };
  error?: string;
  meta?: {
    took: number;
    total: number;
    query: Record<string, unknown>;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CustomQueryResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }
    const token = authHeader.split(' ')[1];
    const tokenData = await verifyToken(token);

    if (!tokenData) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    const { query } = req.body as CustomQueryRequest;

    if (!query || typeof query !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid query format. Expected query object.',
      });
    }

    logger.info('Executing custom OpenSearch query', {
      userId: tokenData.sub,
      querySize: JSON.stringify(query).length,
      hasAggregations: !!query.aggs,
    });

    // Add security constraints to prevent abuse
    const secureQuery = {
      ...query,
      // Limit result size to prevent excessive data retrieval
      size: Math.min((query.size as number) || 0, 1000),
      // Add timeout to prevent long-running queries
      timeout: '30s',
    };

    // Execute the query against OpenSearch
    const startTime = Date.now();
    const response = await opensearchClient.search({
      index: 'ctrf-reports',
      body: secureQuery,
    });

    const executionTime = Date.now() - startTime; // Extract total hits safely
    const getTotalHits = (total: unknown): number => {
      if (typeof total === 'number') return total;
      if (total && typeof total === 'object' && 'value' in total) {
        return (total as { value: number }).value;
      }
      return 0;
    };

    const totalHits = getTotalHits(response.body.hits?.total);

    logger.info('Custom query executed successfully', {
      userId: tokenData.sub,
      executionTime,
      totalHits,
      hasAggregations: !!response.body.aggregations,
    });

    const responseData: CustomQueryResponse = {
      success: true,
      data: {
        aggregations: response.body.aggregations,
        hits: {
          total: totalHits,
          hits: response.body.hits?.hits || [],
        },
      },
      meta: {
        took: response.body.took,
        total: totalHits,
        query: secureQuery,
      },
    };

    return res.status(200).json(responseData);
  } catch (error) {
    logError(logger, 'Failed to execute custom OpenSearch query', error, {
      userId: req.headers.authorization ? 'authenticated' : 'anonymous',
      query: req.body?.query ? 'provided' : 'missing',
    });

    // Handle OpenSearch-specific errors
    if (error && typeof error === 'object' && 'body' in error) {
      const opensearchError = error as { body: { error: { type: string; reason: string } } };
      return res.status(400).json({
        success: false,
        error: `OpenSearch error: ${opensearchError.body?.error?.reason || 'Unknown error'}`,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error while executing query',
    });
  }
}

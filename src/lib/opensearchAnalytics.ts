// OpenSearch Analytics Service - All dashboard data comes from OpenSearch
import opensearchClient from './opensearch';
import { dbLogger as logger, logError } from '../utils/logger';
import {
  TestSuiteOverviewData,
  TestTrendsData,
  TestDurationData,
  ErrorAnalysisData,
  FlakyTestData,
} from '../types/dashboard';

/**
 * OpenSearch Analytics Service
 * This service provides all analytics data for the test results dashboard
 * All data is sourced directly from the OpenSearch 'ctrf-reports' index
 */

/**
 * Get test suite overview data from OpenSearch
 * Aggregates test results across all reports in the index
 */
export async function getTestSuiteOverviewFromOpenSearch(): Promise<TestSuiteOverviewData[]> {
  try {
    logger.info('Fetching test suite overview from OpenSearch');

    const response = await opensearchClient.search({
      index: 'ctrf-reports',
      body: {
        size: 0, // No document results, only aggregations
        aggs: {
          suites: {
            terms: {
              field: 'results.tests.suite',
              size: 100,
              missing: 'Uncategorized', // Handle tests without suite
            },
            aggs: {
              total_tests: {
                sum: {
                  field: 'results.summary.tests',
                },
              },
              passed_tests: {
                sum: {
                  field: 'results.summary.passed',
                },
              },
              failed_tests: {
                sum: {
                  field: 'results.summary.failed',
                },
              },
              skipped_tests: {
                sum: {
                  field: 'results.summary.skipped',
                },
              },
              avg_duration: {
                avg: {
                  script: {
                    source:
                      "doc['results.summary.stop'].value - doc['results.summary.start'].value",
                  },
                },
              },
            },
          },
        },
      },
    });

    const buckets = response.body.aggregations?.suites?.buckets || [];

    const data: TestSuiteOverviewData[] = buckets.map((bucket: any) => ({
      name: bucket.key,
      total: bucket.total_tests?.value || 0,
      passed: bucket.passed_tests?.value || 0,
      failed: bucket.failed_tests?.value || 0,
      skipped: bucket.skipped_tests?.value || 0,
      avgDuration: bucket.avg_duration?.value || 0,
    }));

    logger.info(
      { suitesCount: data.length },
      'Successfully retrieved test suite overview from OpenSearch'
    );
    return data;
  } catch (error) {
    logError(logger, 'Failed to get test suite overview from OpenSearch', error);
    throw new Error('OpenSearch query failed for test suite overview');
  }
}

/**
 * Get test trends data from OpenSearch
 * Shows test results over time using the storedAt timestamp
 */
export async function getTestTrendsFromOpenSearch(days: number = 30): Promise<TestTrendsData[]> {
  try {
    logger.info({ days }, 'Fetching test trends from OpenSearch');

    const response = await opensearchClient.search({
      index: 'ctrf-reports',
      body: {
        size: 0,
        query: {
          range: {
            storedAt: {
              gte: `now-${days}d/d`,
            },
          },
        },
        aggs: {
          trends: {
            date_histogram: {
              field: 'storedAt',
              calendar_interval: 'day',
              format: 'yyyy-MM-dd',
            },
            aggs: {
              total_tests: {
                sum: {
                  field: 'results.summary.tests',
                },
              },
              passed_tests: {
                sum: {
                  field: 'results.summary.passed',
                },
              },
              failed_tests: {
                sum: {
                  field: 'results.summary.failed',
                },
              },
              skipped_tests: {
                sum: {
                  field: 'results.summary.skipped',
                },
              },
            },
          },
        },
      },
    });

    const buckets = response.body.aggregations?.trends?.buckets || [];

    const data: TestTrendsData[] = buckets.map((bucket: any) => ({
      date: bucket.key_as_string,
      total: bucket.total_tests?.value || 0,
      passed: bucket.passed_tests?.value || 0,
      failed: bucket.failed_tests?.value || 0,
      skipped: bucket.skipped_tests?.value || 0,
      passRate:
        bucket.total_tests?.value > 0
          ? ((bucket.passed_tests?.value || 0) / bucket.total_tests.value) * 100
          : 0,
    }));

    logger.info({ dataPoints: data.length }, 'Successfully retrieved test trends from OpenSearch');
    return data;
  } catch (error) {
    logError(logger, 'Failed to get test trends from OpenSearch', error);
    throw new Error('OpenSearch query failed for test trends');
  }
}

/**
 * Get test duration analysis from OpenSearch
 * Analyzes test execution times and performance patterns
 */
export async function getTestDurationAnalysisFromOpenSearch(): Promise<TestDurationData[]> {
  try {
    logger.info('Fetching test duration analysis from OpenSearch');

    const response = await opensearchClient.search({
      index: 'ctrf-reports',
      body: {
        size: 0,
        aggs: {
          duration_ranges: {
            nested: {
              path: 'results.tests',
            },
            aggs: {
              duration_buckets: {
                range: {
                  field: 'results.tests.duration',
                  ranges: [
                    { key: '0-1s', to: 1000 },
                    { key: '1-5s', from: 1000, to: 5000 },
                    { key: '5-10s', from: 5000, to: 10000 },
                    { key: '10-30s', from: 10000, to: 30000 },
                    { key: '30s+', from: 30000 },
                  ],
                },
              },
              avg_duration: {
                avg: {
                  field: 'results.tests.duration',
                },
              },
              max_duration: {
                max: {
                  field: 'results.tests.duration',
                },
              },
              min_duration: {
                min: {
                  field: 'results.tests.duration',
                },
              },
            },
          },
        },
      },
    });

    const buckets = response.body.aggregations?.duration_ranges?.duration_buckets?.buckets || [];

    const data: TestDurationData[] = buckets.map((bucket: any) => ({
      range: bucket.key,
      count: bucket.doc_count,
      avgDuration: response.body.aggregations?.duration_ranges?.avg_duration?.value || 0,
      maxDuration: response.body.aggregations?.duration_ranges?.max_duration?.value || 0,
      minDuration: response.body.aggregations?.duration_ranges?.min_duration?.value || 0,
    }));

    logger.info(
      { buckets: data.length },
      'Successfully retrieved test duration analysis from OpenSearch'
    );
    return data;
  } catch (error) {
    logError(logger, 'Failed to get test duration analysis from OpenSearch', error);
    throw new Error('OpenSearch query failed for test duration analysis');
  }
}

/**
 * Get error analysis data from OpenSearch
 * Analyzes failure patterns and common error messages
 */
export async function getErrorAnalysisFromOpenSearch(): Promise<ErrorAnalysisData[]> {
  try {
    logger.info('Fetching error analysis from OpenSearch');

    const response = await opensearchClient.search({
      index: 'ctrf-reports',
      body: {
        size: 0,
        aggs: {
          failed_tests: {
            nested: {
              path: 'results.tests',
            },
            aggs: {
              failed_only: {
                filter: {
                  term: {
                    'results.tests.status': 'failed',
                  },
                },
                aggs: {
                  error_messages: {
                    terms: {
                      field: 'results.tests.message.keyword',
                      size: 20,
                      missing: 'Unknown error',
                    },
                    aggs: {
                      test_names: {
                        terms: {
                          field: 'results.tests.name.keyword',
                          size: 5,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const buckets =
      response.body.aggregations?.failed_tests?.failed_only?.error_messages?.buckets || [];

    const data: ErrorAnalysisData[] = buckets.map((bucket: any) => ({
      errorMessage: bucket.key,
      count: bucket.doc_count,
      affectedTests: bucket.test_names?.buckets?.map((test: any) => test.key) || [],
    }));

    logger.info({ errors: data.length }, 'Successfully retrieved error analysis from OpenSearch');
    return data;
  } catch (error) {
    logError(logger, 'Failed to get error analysis from OpenSearch', error);
    throw new Error('OpenSearch query failed for error analysis');
  }
}

/**
 * Get flaky test detection data from OpenSearch
 * Identifies tests that have inconsistent results across multiple runs
 */
export async function getFlakyTestsFromOpenSearch(): Promise<FlakyTestData[]> {
  try {
    logger.info('Fetching flaky test analysis from OpenSearch');

    const response = await opensearchClient.search({
      index: 'ctrf-reports',
      body: {
        size: 0,
        aggs: {
          test_results: {
            nested: {
              path: 'results.tests',
            },
            aggs: {
              by_test_name: {
                terms: {
                  field: 'results.tests.name.keyword',
                  size: 1000,
                },
                aggs: {
                  status_distribution: {
                    terms: {
                      field: 'results.tests.status',
                      size: 10,
                    },
                  },
                  marked_flaky: {
                    filter: {
                      term: {
                        'results.tests.flaky': true,
                      },
                    },
                  },
                  total_runs: {
                    value_count: {
                      field: 'results.tests.status',
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const testBuckets = response.body.aggregations?.test_results?.by_test_name?.buckets || [];

    const data: FlakyTestData[] = testBuckets
      .filter((bucket: any) => {
        // Consider a test flaky if it has multiple status types or is marked as flaky
        const statusCount = bucket.status_distribution?.buckets?.length || 0;
        const totalRuns = bucket.total_runs?.value || 0;
        const markedFlaky = bucket.marked_flaky?.doc_count > 0;

        return statusCount > 1 || markedFlaky || totalRuns > 5; // Filter for potentially flaky tests
      })
      .map((bucket: any) => {
        const statusBuckets = bucket.status_distribution?.buckets || [];
        const totalRuns = bucket.total_runs?.value || 0;

        let passed = 0,
          failed = 0,
          skipped = 0;
        statusBuckets.forEach((status: any) => {
          if (status.key === 'passed') passed = status.doc_count;
          else if (status.key === 'failed') failed = status.doc_count;
          else if (status.key === 'skipped') skipped = status.doc_count;
        });

        const flakyScore = totalRuns > 0 ? (failed / totalRuns) * 100 : 0;

        return {
          testName: bucket.key,
          totalRuns,
          passed,
          failed,
          skipped,
          flakyScore,
          isMarkedFlaky: bucket.marked_flaky?.doc_count > 0,
        };
      })
      .sort((a, b) => b.flakyScore - a.flakyScore); // Sort by flaky score descending

    logger.info(
      { flakyTests: data.length },
      'Successfully retrieved flaky test analysis from OpenSearch'
    );
    return data;
  } catch (error) {
    logError(logger, 'Failed to get flaky test analysis from OpenSearch', error);
    throw new Error('OpenSearch query failed for flaky test analysis');
  }
}

/**
 * Check OpenSearch connection and index health
 */
export async function getOpenSearchHealthStatus(): Promise<{
  connected: boolean;
  indexExists: boolean;
  documentsCount: number;
  clusterHealth: string;
}> {
  try {
    // Check cluster health
    const healthResponse = await opensearchClient.cluster.health();
    const clusterHealth = healthResponse.body.status;

    // Check if index exists
    const indexExistsResponse = await opensearchClient.indices.exists({ index: 'ctrf-reports' });
    const indexExists = indexExistsResponse.body;

    // Get document count
    let documentsCount = 0;
    if (indexExists) {
      const countResponse = await opensearchClient.count({ index: 'ctrf-reports' });
      documentsCount = countResponse.body.count;
    }

    logger.info(
      {
        clusterHealth,
        indexExists,
        documentsCount,
      },
      'OpenSearch health check completed'
    );

    return {
      connected: true,
      indexExists,
      documentsCount,
      clusterHealth,
    };
  } catch (error) {
    logError(logger, 'OpenSearch health check failed', error);
    return {
      connected: false,
      indexExists: false,
      documentsCount: 0,
      clusterHealth: 'unknown',
    };
  }
}

import opensearchClient, { ensureCtrfReportsIndexExists } from './opensearch';
import { dbLogger as logger, logError } from '../utils/logger';
import {
  TestSuiteOverviewData,
  TestTrendsData,
  TestDurationData,
  ErrorAnalysisData,
  FlakyTestData,
} from '../types/dashboard';
import { CtrfTestSource } from '../types/opensearch';

// OpenSearch aggregation bucket interfaces
interface SuiteBucket {
  key: string;
  total_tests?: { value: number };
  passed_tests?: { value: number };
  failed_tests?: { value: number };
  skipped_tests?: { value: number };
  avg_duration?: { value: number };
}

interface DateBucket {
  key_as_string: string;
  total_tests: { value: number };
  passed_tests?: { value: number };
  failed_tests?: { value: number };
  skipped_tests?: { value: number };
}

interface DurationBucket {
  key: string;
  doc_count: number;
}

interface ErrorBucket {
  key: string;
  doc_count: number;
  test_names?: {
    buckets: { key: string }[];
  };
}

interface FlakyTestBucket {
  key: string;
  status_distribution?: {
    buckets: Array<{
      key: string;
      doc_count: number;
    }>;
  };
  marked_flaky?: {
    doc_count: number;
  };
  total_runs?: {
    value: number;
  };
  avg_duration?: {
    value: number;
  };
}

// OpenSearch aggregation response interfaces
/*
interface OpenSearchAggregations {
  suites?: {
    buckets: SuiteBucket[];
  };
  tests_over_time?: {
    buckets: DateBucket[];
  };
  duration_ranges?: {
    buckets: DurationBucket[];
  };
  failed_tests?: {
    failed_only?: {
      error_messages?: {
        buckets: ErrorBucket[];
      };
    };
  };
  test_status_aggregation?: {
    buckets: Array<{
      key: string;
      doc_count: number;
      test_info?: {
        buckets: Array<{
          key: string;
          doc_count: number;
          first_occurrence?: {
            hits?: {
              hits?: Array<{
                _source?: {
                  results?: {
                    tests?: Array<{
                      flaky?: boolean;
                    }>;
                  };
                };
              }>;
            };
          };
        }>;
      };
    }>;
  };
}
*/

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
  return withIndexEnsured(async () => {
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

      const buckets =
        (response.body.aggregations?.suites as { buckets: SuiteBucket[] })?.buckets || [];

      const data: TestSuiteOverviewData[] = buckets.map((bucket: SuiteBucket) => {
        const total = bucket.total_tests?.value || 0;
        const passed = bucket.passed_tests?.value || 0;
        return {
          name: bucket.key,
          total,
          passed,
          failed: bucket.failed_tests?.value || 0,
          skipped: bucket.skipped_tests?.value || 0,
          passRate: total > 0 ? (passed / total) * 100 : 0,
          avgDuration: bucket.avg_duration?.value || 0,
        };
      });

      logger.info(
        { suitesCount: data.length },
        'Successfully retrieved test suite overview from OpenSearch'
      );
      return data;
    } catch (error) {
      logError(logger, 'Failed to get test suite overview from OpenSearch', error);
      throw new Error('OpenSearch query failed for test suite overview');
    }
  });
}

/**
 * Get test trends data from OpenSearch
 * Shows test results over time using CTRF summary.start timestamp (actual test execution time)
 * Data is aggregated by hour to show multiple results per day on the same line graph
 */
export async function getTestTrendsFromOpenSearch(days: number = 30): Promise<TestTrendsData[]> {
  return withIndexEnsured(async () => {
    try {
      logger.info({ days }, 'Fetching test trends from OpenSearch');

      const response = await opensearchClient.search({
        index: 'ctrf-reports',
        body: {
          size: 0,
          query: {
            range: {
              'results.summary.start': {
                gte: `now-${days}d/d`,
              },
            },
          },
          aggs: {
            trends: {
              date_histogram: {
                field: 'results.summary.start',
                calendar_interval: 'hour',
                format: 'yyyy-MM-dd HH:mm',
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

      const buckets =
        (response.body.aggregations?.trends as { buckets: DateBucket[] })?.buckets || [];

      // Filter out buckets with no actual test data to avoid empty dots on charts
      const data: TestTrendsData[] = buckets
        .filter((bucket: DateBucket) => (bucket.total_tests?.value || 0) > 0)
        .map((bucket: DateBucket) => ({
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

      logger.info(
        { dataPoints: data.length },
        'Successfully retrieved test trends from OpenSearch'
      );
      return data;
    } catch (error) {
      logError(logger, 'Failed to get test trends from OpenSearch', error);
      throw new Error('OpenSearch query failed for test trends');
    }
  });
}

/**
 * Get test duration analysis from OpenSearch
 * Analyzes test execution times and performance patterns
 */
export async function getTestDurationAnalysisFromOpenSearch(): Promise<TestDurationData[]> {
  return withIndexEnsured(async () => {
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

      const buckets =
        (
          response.body.aggregations?.duration_ranges as {
            duration_buckets: { buckets: DurationBucket[] };
          }
        )?.duration_buckets?.buckets || [];

      const data: TestDurationData[] = buckets.map((bucket: DurationBucket) => ({
        range: bucket.key,
        count: bucket.doc_count,
        avgDuration:
          (response.body.aggregations?.duration_ranges as { avg_duration: { value: number } })
            ?.avg_duration?.value || 0,
        maxDuration:
          (response.body.aggregations?.duration_ranges as { max_duration: { value: number } })
            ?.max_duration?.value || 0,
        minDuration:
          (response.body.aggregations?.duration_ranges as { min_duration: { value: number } })
            ?.min_duration?.value || 0,
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
  });
}

/**
 * Get error analysis data from OpenSearch
 * Analyzes failure patterns and common error messages
 */
export async function getErrorAnalysisFromOpenSearch(): Promise<ErrorAnalysisData[]> {
  return withIndexEnsured(async () => {
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
        (
          response.body.aggregations?.failed_tests as {
            failed_only: { error_messages: { buckets: ErrorBucket[] } };
          }
        )?.failed_only?.error_messages?.buckets || [];

      const data: ErrorAnalysisData[] = buckets.map((bucket: ErrorBucket) => ({
        errorMessage: bucket.key,
        count: bucket.doc_count,
        affectedTests: bucket.test_names?.buckets?.map((test: { key: string }) => test.key) || [],
      }));

      logger.info({ errors: data.length }, 'Successfully retrieved error analysis from OpenSearch');
      return data;
    } catch (error) {
      logError(logger, 'Failed to get error analysis from OpenSearch', error);
      throw new Error('OpenSearch query failed for error analysis');
    }
  });
}

/**
 * Individual test run data for flaky test visualization
 */
export interface TestRunData {
  testName: string;
  suite: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  message?: string;
  trace?: string;
  timestamp: string;
  reportId: string;
}

/**
 * Enhanced flaky test data with individual test runs
 */
export interface FlakyTestWithRuns extends FlakyTestData {
  testRuns: TestRunData[];
}

/**
 * Get individual test runs for flaky tests from OpenSearch
 * Returns detailed run-by-run data for grid visualization
 */
export async function getFlakyTestRunsFromOpenSearch(): Promise<FlakyTestWithRuns[]> {
  return withIndexEnsured(async () => {
    try {
      logger.info('Fetching flaky test runs with individual execution details from OpenSearch');

      // First, get flaky test names
      const flakyTests = await getFlakyTestsFromOpenSearch();
      const flakyTestNames = flakyTests.map(test => test.testName);

      if (flakyTestNames.length === 0) {
        return [];
      }

      // Then get individual test runs for these flaky tests
      const response = await opensearchClient.search({
        index: 'ctrf-reports',
        body: {
          size: 1000, // Limit to prevent overwhelming response
          query: {
            nested: {
              path: 'results.tests',
              query: {
                bool: {
                  must: [
                    {
                      terms: {
                        'results.tests.name.keyword': flakyTestNames,
                      },
                    },
                  ],
                },
              },
            },
          },
          _source: ['reportId', 'timestamp', 'results.tests'],
          sort: [{ timestamp: { order: 'desc' } }],
        },
      });

      // Process the results
      const testRunsMap = new Map<string, TestRunData[]>();

      response.body.hits.hits.forEach(hit => {
        const source = hit._source as CtrfTestSource;
        if (!source) return;

        const reportId = source.reportId;
        const timestamp = source.timestamp;
        const tests = source.results?.tests || [];

        tests.forEach(test => {
          if (flakyTestNames.includes(test.name)) {
            const testRun: TestRunData = {
              testName: test.name,
              suite: test.suite || 'Unknown',
              status: test.status as 'passed' | 'failed' | 'skipped',
              duration: test.duration || 0,
              message: test.message,
              trace: test.trace,
              timestamp: timestamp,
              reportId: reportId,
            };

            if (!testRunsMap.has(test.name)) {
              testRunsMap.set(test.name, []);
            }
            testRunsMap.get(test.name)!.push(testRun);
          }
        });
      });

      // Combine flaky test data with individual runs
      const result: FlakyTestWithRuns[] = flakyTests
        .map(flakyTest => ({
          ...flakyTest,
          testRuns: testRunsMap.get(flakyTest.testName) || [],
        }))
        .filter(test => test.testRuns.length > 0);

      logger.info(
        {
          flakyTestsWithRuns: result.length,
          totalTestRuns: result.reduce((sum, test) => sum + test.testRuns.length, 0),
        },
        'Successfully retrieved flaky test runs from OpenSearch'
      );
      return result;
    } catch (error) {
      logError(logger, 'Failed to get flaky test runs from OpenSearch', error);
      throw new Error('OpenSearch query failed for flaky test runs');
    }
  });
}

/**
 * Get flaky test detection data from OpenSearch
 * Identifies tests that have inconsistent results across multiple runs
 */
export async function getFlakyTestsFromOpenSearch(): Promise<FlakyTestData[]> {
  return withIndexEnsured(async () => {
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

      const testBuckets =
        (
          response.body.aggregations?.test_results as {
            by_test_name: { buckets: FlakyTestBucket[] };
          }
        )?.by_test_name?.buckets || [];

      const data: FlakyTestData[] = testBuckets
        .filter((bucket: FlakyTestBucket) => {
          // Consider a test flaky if it has multiple status types or is marked as flaky
          const statusCount = bucket.status_distribution?.buckets?.length || 0;
          const markedFlaky = (bucket.marked_flaky?.doc_count || 0) > 0;
          return statusCount > 1 || markedFlaky; // Any test with mixed results or marked as flaky
        })
        .map((bucket: FlakyTestBucket) => {
          const statusBuckets = bucket.status_distribution?.buckets || [];
          const totalRuns = bucket.total_runs?.value || 0;

          let passed = 0,
            failed = 0,
            skipped = 0;
          statusBuckets.forEach((status: { key: string; doc_count: number }) => {
            if (status.key === 'passed') passed = status.doc_count;
            else if (status.key === 'failed') failed = status.doc_count;
            else if (status.key === 'skipped') skipped = status.doc_count;
          });

          const flakyScore = totalRuns > 0 ? (failed / totalRuns) * 100 : 0;
          const avgDuration = bucket.avg_duration?.value || 0;
          // Consider flaky if it has both passes and failures (any ratio)
          const isFlaky = passed > 0 && failed > 0;

          return {
            testName: bucket.key,
            suite: 'OpenSearch Analysis', // Default suite name since we don't have suite-level aggregation
            totalRuns,
            passed,
            failed,
            skipped,
            flakyScore,
            avgDuration: Math.round(avgDuration),
            isMarkedFlaky: (bucket.marked_flaky?.doc_count || 0) > 0,
            isFlaky,
          };
        })
        .sort((a: FlakyTestData, b: FlakyTestData) => b.flakyScore - a.flakyScore); // Sort by flaky score descending

      logger.info(
        { flakyTests: data.length },
        'Successfully retrieved flaky test analysis from OpenSearch'
      );
      return data;
    } catch (error) {
      logError(logger, 'Failed to get flaky test analysis from OpenSearch', error);
      throw new Error('OpenSearch query failed for flaky test analysis');
    }
  });
}

/**
 * Ensure index exists and execute OpenSearch query with automatic index creation
 * This centralizes the index creation logic to avoid duplication across analytics functions
 */
async function withIndexEnsured<T>(queryFn: () => Promise<T>): Promise<T> {
  const healthStatus = await getOpenSearchHealthStatus();

  if (!healthStatus.connected) {
    throw new Error('OpenSearch is not accessible - Cannot connect to OpenSearch cluster');
  }

  if (!healthStatus.indexExists) {
    logger.info('OpenSearch index does not exist, creating it automatically');
    try {
      await ensureCtrfReportsIndexExists();
      logger.info('Successfully created ctrf-reports index');
    } catch (error) {
      logError(logger, 'Failed to create OpenSearch index', error);
      throw new Error(
        `Failed to create OpenSearch index: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return queryFn();
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

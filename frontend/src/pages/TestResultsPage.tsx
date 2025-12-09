import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { createApiClient } from "../lib/api";
import type { TestRun, TestStatistics } from "../types";

const TestResultsPage: React.FC = () => {
  const { session } = useAuth();
  const api = createApiClient(() => session?.accessToken || null);

  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [statistics, setStatistics] = useState<TestStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    loadTestResults();
    loadStatistics();
  }, [page]);

  const loadTestResults = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.getTestRuns(page, 20);

      if (response.error) {
        setError(response.error);
      } else if (response.data) {
        setTestRuns(response.data.reports);
        setTotalCount(response.data.total_count);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load test results",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const response = await api.getTestStatistics();

      if (response.data) {
        setStatistics(response.data);
      }
    } catch (err) {
      // Silent fail for statistics
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStatusColor = (passRate: number) => {
    if (passRate >= 90) return "text-green-700";
    if (passRate >= 70) return "text-yellow-700";
    return "text-red-600";
  };

  return (
    <div
      id="test-results-container"
      className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8"
    >
      <h1 className="text-3xl font-bold mb-6">Test Results</h1>

      {statistics && (
        <div id="statistics-grid" className="grid gap-6 md:grid-cols-4 mb-8">
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Total Runs</p>
            <p className="text-3xl font-bold">{statistics.total_runs}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Total Tests</p>
            <p className="text-3xl font-bold">{statistics.total_tests}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Pass Rate</p>
            <p
              className={`text-3xl font-bold ${getStatusColor(statistics.pass_rate)}`}
            >
              {statistics.pass_rate.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Avg Duration</p>
            <p className="text-3xl font-bold">
              {formatDuration(statistics.avg_duration_ms)}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div
          id="error-message"
          className="mb-4 rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-900 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading test results...</p>
        </div>
      ) : (
        <>
          <div id="test-runs-list" className="space-y-4">
            {testRuns.map((run) => {
              const passRate =
                run.tests && run.passed ? (run.passed / run.tests) * 100 : 0;

              return (
                <div
                  key={run.id}
                  id={`test-run-${run.id}`}
                  className="rounded-lg border border-border bg-card p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-lg font-semibold">
                          Run #{run.id.substring(0, 8)}
                        </h2>
                        {run.branch && (
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {run.branch}
                          </span>
                        )}
                      </div>

                      {run.commit && (
                        <p className="text-sm text-muted-foreground mb-2">
                          Commit: {run.commit.substring(0, 7)}
                        </p>
                      )}

                      <div className="flex gap-6 text-sm">
                        <span className="text-green-700">
                          ✓ {run.passed || 0} passed
                        </span>
                        <span className="text-red-600">
                          ✗ {run.failed || 0} failed
                        </span>
                        <span className="text-yellow-700">
                          ⊘ {run.skipped || 0} skipped
                        </span>
                        <span className="text-muted-foreground">
                          Duration: {formatDuration(run.duration_ms || 0)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p
                        className={`text-2xl font-bold ${getStatusColor(passRate)}`}
                      >
                        {passRate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(run.created_at).toLocaleString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {testRuns.length === 0 && (
            <div
              id="no-results-message"
              className="rounded-lg border border-dashed border-border p-12 text-center"
            >
              <p className="text-muted-foreground">No test results yet.</p>
            </div>
          )}

          {totalCount > 20 && (
            <div id="pagination" className="mt-6 flex justify-center gap-2">
              <button
                id="previous-page"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-border px-4 py-2 hover:bg-accent disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4 py-2">
                Page {page} of {Math.ceil(totalCount / 20)}
              </span>
              <button
                id="next-page"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(totalCount / 20)}
                className="rounded-md border border-border px-4 py-2 hover:bg-accent disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TestResultsPage;

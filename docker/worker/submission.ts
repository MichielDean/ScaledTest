/**
 * Worker submission URL routing helper.
 *
 * Centralises the logic for determining which API endpoint the worker should
 * POST results to:
 *
 *   - When EXECUTION_ID is set: POST /api/v1/executions/:id/results
 *     This is the new execution-scoped worker callback endpoint (SCA-9).
 *     It accepts a worker bearer token and links the CTRF report to the
 *     specific execution, incrementing completedPods so the orchestrator
 *     knows when all pods have reported in.
 *
 *   - When EXECUTION_ID is absent: fall back to POST /api/v1/reports
 *     Legacy path; kept so the worker remains functional outside of
 *     execution-managed flows (e.g. standalone runs without K8s).
 */

/**
 * Return the URL the worker should POST CTRF results to.
 *
 * @param apiUrl      Base API URL, e.g. "http://scaledtest-service/api/v1"
 * @param executionId EXECUTION_ID env var value (may be empty/undefined)
 */
export function buildSubmissionUrl(apiUrl: string, executionId?: string): string {
  const id = executionId?.trim();
  if (id) {
    return `${apiUrl}/executions/${id}/results`;
  }
  return `${apiUrl}/reports`;
}

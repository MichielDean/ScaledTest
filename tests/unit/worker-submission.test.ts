/**
 * Tests for worker submission URL routing logic.
 *
 * TDD: written before the implementation change.
 *
 * SCA-9 blocking fix: worker.ts must post to /executions/:id/results when
 * EXECUTION_ID is set, not to /reports.
 *
 * We extract the URL-selection logic into a pure helper function so it can
 * be unit-tested without running the top-level-await worker script.
 */
import { buildSubmissionUrl } from '../../docker/worker/submission';

const BASE_URL = 'http://scaledtest-service/api/v1';

describe('buildSubmissionUrl', () => {
  it('uses /executions/:id/results when executionId is set', () => {
    const url = buildSubmissionUrl(BASE_URL, '550e8400-e29b-41d4-a716-446655440000');
    expect(url).toBe(
      'http://scaledtest-service/api/v1/executions/550e8400-e29b-41d4-a716-446655440000/results'
    );
  });

  it('falls back to /reports when executionId is empty string', () => {
    const url = buildSubmissionUrl(BASE_URL, '');
    expect(url).toBe('http://scaledtest-service/api/v1/reports');
  });

  it('falls back to /reports when executionId is not provided', () => {
    const url = buildSubmissionUrl(BASE_URL);
    expect(url).toBe('http://scaledtest-service/api/v1/reports');
  });

  it('preserves trailing slash behaviour of the base URL', () => {
    const url = buildSubmissionUrl('http://api.example.com/api/v1', 'abc-123');
    expect(url).toBe('http://api.example.com/api/v1/executions/abc-123/results');
  });

  it('works with a custom API base path', () => {
    const url = buildSubmissionUrl('http://localhost:3000/api/v1', 'exec-id-here');
    expect(url).toBe('http://localhost:3000/api/v1/executions/exec-id-here/results');
  });

  it('falls back to /reports when executionId is whitespace-only', () => {
    const url = buildSubmissionUrl(BASE_URL, '   ');
    expect(url).toBe('http://scaledtest-service/api/v1/reports');
  });
});

-- Add triage_github_status to test_reports to enable per-report opt-in for
-- GitHub commit status posting after triage completes.
ALTER TABLE test_reports
    ADD COLUMN triage_github_status BOOLEAN NOT NULL DEFAULT FALSE;

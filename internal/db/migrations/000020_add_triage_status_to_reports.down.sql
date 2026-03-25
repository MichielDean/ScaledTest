DROP INDEX IF EXISTS idx_test_reports_triage_status;
ALTER TABLE test_reports DROP COLUMN IF EXISTS triage_status;

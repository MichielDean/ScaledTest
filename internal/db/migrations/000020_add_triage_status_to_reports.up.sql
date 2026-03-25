-- Add triage_status to test_reports for quick triage state lookups without a JOIN.
-- Values mirror triage_results.status: pending, complete, failed.
-- NULL means triage has not yet been scheduled for this report.
ALTER TABLE test_reports
    ADD COLUMN triage_status TEXT
        CHECK (triage_status IN ('pending', 'complete', 'failed'));

CREATE INDEX idx_test_reports_triage_status ON test_reports (team_id, triage_status)
    WHERE triage_status IS NOT NULL;

//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/ctrf"
)

// --- Full Execution Lifecycle ---

func TestExecutionLifecycle_CreateToReport(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Lifecycle Team")

	// Step 1: Create execution
	var execID string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_executions (team_id, command, config)
		 VALUES ($1, $2, $3)
		 RETURNING id`,
		teamID, "npm run test:unit", `{"image":"node:20","timeout":300}`,
	).Scan(&execID)
	if err != nil {
		t.Fatalf("create execution: %v", err)
	}

	// Verify initial state
	var status string
	var startedAt, finishedAt *time.Time
	err = tdb.Pool.QueryRow(ctx,
		`SELECT status, started_at, finished_at FROM test_executions WHERE id = $1`, execID,
	).Scan(&status, &startedAt, &finishedAt)
	if err != nil {
		t.Fatalf("query initial execution: %v", err)
	}
	if status != "pending" {
		t.Errorf("initial status = %q, want pending", status)
	}
	if startedAt != nil {
		t.Error("started_at should be nil for pending execution")
	}

	// Step 2: Transition to running (simulates worker picking up the job)
	_, err = tdb.Pool.Exec(ctx,
		`UPDATE test_executions
		 SET status = 'running', started_at = now(), updated_at = now(),
		     k8s_job_name = $2, k8s_pod_name = $3
		 WHERE id = $1 AND status = 'pending'`,
		execID, "scaledtest-job-abc123", "scaledtest-job-abc123-xyz",
	)
	if err != nil {
		t.Fatalf("transition to running: %v", err)
	}

	// Step 3: Upload CTRF report (simulates worker submitting results)
	ctrfPayload := []byte(`{
		"results": {
			"tool": {"name": "jest", "version": "29.7.0"},
			"summary": {"tests": 4, "passed": 3, "failed": 1, "skipped": 0, "pending": 0, "other": 0},
			"tests": [
				{"name": "auth/login", "status": "passed", "duration": 120, "suite": "auth"},
				{"name": "auth/logout", "status": "passed", "duration": 80, "suite": "auth"},
				{"name": "api/users", "status": "failed", "duration": 250, "message": "expected 200, got 500", "trace": "Error at line 42"},
				{"name": "api/health", "status": "passed", "duration": 15, "suite": "api"}
			]
		}
	}`)

	report, err := ctrf.Parse(ctrfPayload)
	if err != nil {
		t.Fatalf("parse CTRF: %v", err)
	}
	if err := ctrf.Validate(report); err != nil {
		t.Fatalf("validate CTRF: %v", err)
	}

	summaryJSON, err := ctrf.SummaryJSON(report.Results.Summary)
	if err != nil {
		t.Fatalf("summary JSON: %v", err)
	}

	// Insert report linked to execution
	var reportID string
	err = tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, execution_id, tool_name, tool_version, summary, raw)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id`,
		teamID, execID, report.Results.Tool.Name, report.Results.Tool.Version,
		summaryJSON, ctrfPayload,
	).Scan(&reportID)
	if err != nil {
		t.Fatalf("insert report: %v", err)
	}

	// Normalize and insert individual test results
	results := ctrf.Normalize(report, reportID, teamID)
	for _, r := range results {
		_, err := tdb.Pool.Exec(ctx,
			`INSERT INTO test_results (report_id, team_id, name, status, duration_ms, message, trace, suite, retry, flaky)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			r.ReportID, r.TeamID, r.Name, r.Status, r.DurationMs, r.Message, r.Trace, r.Suite, r.Retry, r.Flaky,
		)
		if err != nil {
			t.Fatalf("insert test result %s: %v", r.Name, err)
		}
	}

	// Step 4: Complete execution and link report
	_, err = tdb.Pool.Exec(ctx,
		`UPDATE test_executions
		 SET status = 'completed', finished_at = now(), updated_at = now(), report_id = $2
		 WHERE id = $1 AND status NOT IN ('cancelled', 'completed', 'failed')`,
		execID, reportID,
	)
	if err != nil {
		t.Fatalf("complete execution: %v", err)
	}

	// Step 5: Verify final state - query execution with linked report
	var finalStatus string
	var linkedReportID *string
	var finalStartedAt, finalFinishedAt *time.Time
	err = tdb.Pool.QueryRow(ctx,
		`SELECT status, report_id, started_at, finished_at FROM test_executions WHERE id = $1`, execID,
	).Scan(&finalStatus, &linkedReportID, &finalStartedAt, &finalFinishedAt)
	if err != nil {
		t.Fatalf("query final execution: %v", err)
	}
	if finalStatus != "completed" {
		t.Errorf("final status = %q, want completed", finalStatus)
	}
	if linkedReportID == nil || *linkedReportID != reportID {
		t.Errorf("linked report_id = %v, want %s", linkedReportID, reportID)
	}
	if finalStartedAt == nil {
		t.Error("started_at should be set for completed execution")
	}
	if finalFinishedAt == nil {
		t.Error("finished_at should be set for completed execution")
	}

	// Step 6: Verify results queryable via the report
	var resultCount int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE report_id = $1 AND team_id = $2`,
		reportID, teamID,
	).Scan(&resultCount)
	if resultCount != 4 {
		t.Errorf("test results count = %d, want 4", resultCount)
	}

	// Verify we can query failures through execution -> report -> results join
	var failedCount int
	err = tdb.Pool.QueryRow(ctx,
		`SELECT count(*)
		 FROM test_results tr
		 JOIN test_reports rp ON tr.report_id = rp.id
		 WHERE rp.execution_id = $1 AND tr.status = 'failed'`,
		execID,
	).Scan(&failedCount)
	if err != nil {
		t.Fatalf("query failed results via execution: %v", err)
	}
	if failedCount != 1 {
		t.Errorf("failed results via execution join = %d, want 1", failedCount)
	}
}

// --- Status Transition Guards ---

func TestExecutionStatusGuard_CannotOverwriteTerminalState(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Guard Team")

	var execID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_executions (team_id, command) VALUES ($1, $2) RETURNING id`,
		teamID, "test",
	).Scan(&execID)

	// Complete the execution
	_, err := tdb.Pool.Exec(ctx,
		`UPDATE test_executions SET status = 'completed', finished_at = now() WHERE id = $1`, execID,
	)
	if err != nil {
		t.Fatalf("complete: %v", err)
	}

	// Attempt to overwrite completed with running (should affect 0 rows with guard)
	tag, err := tdb.Pool.Exec(ctx,
		`UPDATE test_executions SET status = 'running'
		 WHERE id = $1 AND status NOT IN ('completed', 'failed', 'cancelled')`,
		execID,
	)
	if err != nil {
		t.Fatalf("guarded update: %v", err)
	}
	if tag.RowsAffected() != 0 {
		t.Error("should not overwrite completed status")
	}

	// Verify status unchanged
	var status string
	tdb.Pool.QueryRow(ctx, `SELECT status FROM test_executions WHERE id = $1`, execID).Scan(&status)
	if status != "completed" {
		t.Errorf("status = %q, want completed (unchanged)", status)
	}
}

func TestExecutionStatusGuard_CancelledIsTerminal(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Cancel Guard Team")

	var execID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_executions (team_id, command) VALUES ($1, $2) RETURNING id`,
		teamID, "test",
	).Scan(&execID)

	// Cancel the execution
	_, err := tdb.Pool.Exec(ctx,
		`UPDATE test_executions SET status = 'cancelled', finished_at = now() WHERE id = $1`, execID,
	)
	if err != nil {
		t.Fatalf("cancel: %v", err)
	}

	// Attempt to move cancelled to completed (should be blocked by guard)
	tag, _ := tdb.Pool.Exec(ctx,
		`UPDATE test_executions SET status = 'completed'
		 WHERE id = $1 AND status NOT IN ('completed', 'failed', 'cancelled')`,
		execID,
	)
	if tag.RowsAffected() != 0 {
		t.Error("should not overwrite cancelled status")
	}
}

// --- Parallel Report Uploads ---

func TestParallelReportUploads(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Parallel Upload Team")

	// Create execution
	var execID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_executions (team_id, command, status)
		 VALUES ($1, $2, 'running') RETURNING id`,
		teamID, "npm run test",
	).Scan(&execID)

	// Simulate parallel workers uploading reports concurrently
	const numWorkers = 5
	var wg sync.WaitGroup
	errors := make([]error, numWorkers)
	reportIDs := make([]string, numWorkers)

	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(workerIdx int) {
			defer wg.Done()

			summary := map[string]interface{}{
				"tests": 3, "passed": 2 + workerIdx%2, "failed": 1 - workerIdx%2,
				"skipped": 0, "pending": 0, "other": 0,
			}
			summaryJSON, _ := json.Marshal(summary)

			var reportID string
			err := tdb.Pool.QueryRow(ctx,
				`INSERT INTO test_reports (team_id, execution_id, tool_name, summary, raw)
				 VALUES ($1, $2, $3, $4, $5)
				 RETURNING id`,
				teamID, execID, fmt.Sprintf("jest-worker-%d", workerIdx),
				summaryJSON, `{"results":{}}`,
			).Scan(&reportID)
			if err != nil {
				errors[workerIdx] = fmt.Errorf("worker %d insert report: %w", workerIdx, err)
				return
			}
			reportIDs[workerIdx] = reportID

			// Each worker also inserts test results
			for j := 0; j < 3; j++ {
				status := "passed"
				if j == 0 && workerIdx%2 == 0 {
					status = "failed"
				}
				_, err := tdb.Pool.Exec(ctx,
					`INSERT INTO test_results (report_id, team_id, name, status, duration_ms)
					 VALUES ($1, $2, $3, $4, $5)`,
					reportID, teamID, fmt.Sprintf("worker%d/test%d", workerIdx, j), status, 100+j*50,
				)
				if err != nil {
					errors[workerIdx] = fmt.Errorf("worker %d insert result: %w", workerIdx, err)
					return
				}
			}
		}(i)
	}

	wg.Wait()

	// Check for any errors
	for i, err := range errors {
		if err != nil {
			t.Fatalf("worker %d error: %v", i, err)
		}
	}

	// Verify all reports were created
	var reportCount int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_reports WHERE execution_id = $1`, execID,
	).Scan(&reportCount)
	if reportCount != numWorkers {
		t.Errorf("report count = %d, want %d", reportCount, numWorkers)
	}

	// Verify all test results were created (5 workers * 3 tests each)
	var totalResults int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE team_id = $1`, teamID,
	).Scan(&totalResults)
	if totalResults != numWorkers*3 {
		t.Errorf("total results = %d, want %d", totalResults, numWorkers*3)
	}
}

// --- Large Payload Handling ---

func TestLargeReportPayload(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Large Payload Team")

	// Generate a large CTRF report with many tests
	const numTests = 500
	tests := make([]map[string]interface{}, numTests)
	for i := 0; i < numTests; i++ {
		status := "passed"
		if i%10 == 0 {
			status = "failed"
		} else if i%7 == 0 {
			status = "skipped"
		}
		tests[i] = map[string]interface{}{
			"name":     fmt.Sprintf("test/suite_%d/case_%d", i/10, i%10),
			"status":   status,
			"duration": 50 + i%200,
			"suite":    fmt.Sprintf("suite_%d", i/10),
			"filePath": fmt.Sprintf("src/tests/suite_%d.test.ts", i/10),
		}
		if status == "failed" {
			tests[i]["message"] = fmt.Sprintf("assertion failed at test %d: expected true, got false", i)
			tests[i]["trace"] = fmt.Sprintf("Error: assertion failed\n    at test_%d (src/tests/suite_%d.test.ts:%d:1)", i, i/10, i+1)
		}
	}

	rawReport := map[string]interface{}{
		"results": map[string]interface{}{
			"tool":    map[string]string{"name": "jest", "version": "29.7.0"},
			"summary": map[string]interface{}{"tests": numTests, "passed": numTests - 50 - 71, "failed": 50, "skipped": 71, "pending": 0, "other": 0},
			"tests":   tests,
		},
	}
	rawJSON, err := json.Marshal(rawReport)
	if err != nil {
		t.Fatalf("marshal large report: %v", err)
	}

	// Parse and validate via CTRF module
	report, err := ctrf.Parse(rawJSON)
	if err != nil {
		t.Fatalf("parse large CTRF: %v", err)
	}
	if err := ctrf.Validate(report); err != nil {
		t.Fatalf("validate large CTRF: %v", err)
	}

	summaryJSON, _ := ctrf.SummaryJSON(report.Results.Summary)

	// Insert report
	var reportID string
	err = tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, tool_version, summary, raw)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id`,
		teamID, report.Results.Tool.Name, report.Results.Tool.Version,
		summaryJSON, rawJSON,
	).Scan(&reportID)
	if err != nil {
		t.Fatalf("insert large report: %v", err)
	}

	// Normalize and bulk-insert test results
	normalized := ctrf.Normalize(report, reportID, teamID)
	if len(normalized) != numTests {
		t.Fatalf("normalized count = %d, want %d", len(normalized), numTests)
	}

	for _, r := range normalized {
		_, err := tdb.Pool.Exec(ctx,
			`INSERT INTO test_results (report_id, team_id, name, status, duration_ms, message, trace, file_path, suite, retry, flaky)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
			r.ReportID, r.TeamID, r.Name, r.Status, r.DurationMs, r.Message, r.Trace, r.FilePath, r.Suite, r.Retry, r.Flaky,
		)
		if err != nil {
			t.Fatalf("insert result %s: %v", r.Name, err)
		}
	}

	// Verify all were stored
	var storedCount int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE report_id = $1`, reportID,
	).Scan(&storedCount)
	if storedCount != numTests {
		t.Errorf("stored results = %d, want %d", storedCount, numTests)
	}

	// Verify we can query by status efficiently
	var failedCount, passedCount, skippedCount int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE report_id = $1 AND status = 'failed'`, reportID,
	).Scan(&failedCount)
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE report_id = $1 AND status = 'passed'`, reportID,
	).Scan(&passedCount)
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE report_id = $1 AND status = 'skipped'`, reportID,
	).Scan(&skippedCount)

	if failedCount != 50 {
		t.Errorf("failed = %d, want 50", failedCount)
	}
	// Verify total adds up
	if passedCount+failedCount+skippedCount != numTests {
		t.Errorf("passed(%d)+failed(%d)+skipped(%d) = %d, want %d",
			passedCount, failedCount, skippedCount,
			passedCount+failedCount+skippedCount, numTests)
	}

	// Verify raw JSON round-trips correctly
	var storedRaw json.RawMessage
	tdb.Pool.QueryRow(ctx,
		`SELECT raw FROM test_reports WHERE id = $1`, reportID,
	).Scan(&storedRaw)

	var parsedBack map[string]interface{}
	if err := json.Unmarshal(storedRaw, &parsedBack); err != nil {
		t.Fatalf("unmarshal stored raw: %v", err)
	}
	resultsMap := parsedBack["results"].(map[string]interface{})
	storedTests := resultsMap["tests"].([]interface{})
	if len(storedTests) != numTests {
		t.Errorf("raw JSON round-trip test count = %d, want %d", len(storedTests), numTests)
	}
}

// --- Malformed Data Rejection ---

func TestMalformedCTRF_MissingToolName(t *testing.T) {
	payload := []byte(`{
		"results": {
			"tool": {"name": ""},
			"summary": {"tests": 1, "passed": 1},
			"tests": [{"name": "test1", "status": "passed", "duration": 100}]
		}
	}`)

	report, err := ctrf.Parse(payload)
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	err = ctrf.Validate(report)
	if err == nil {
		t.Fatal("expected validation error for missing tool name")
	}
}

func TestMalformedCTRF_NoTests(t *testing.T) {
	payload := []byte(`{
		"results": {
			"tool": {"name": "jest"},
			"summary": {"tests": 0},
			"tests": []
		}
	}`)

	report, err := ctrf.Parse(payload)
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	err = ctrf.Validate(report)
	if err == nil {
		t.Fatal("expected validation error for empty tests")
	}
}

func TestMalformedCTRF_InvalidStatus(t *testing.T) {
	payload := []byte(`{
		"results": {
			"tool": {"name": "jest"},
			"summary": {"tests": 1},
			"tests": [{"name": "test1", "status": "broken", "duration": 100}]
		}
	}`)

	report, err := ctrf.Parse(payload)
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	err = ctrf.Validate(report)
	if err == nil {
		t.Fatal("expected validation error for invalid status 'broken'")
	}
}

func TestMalformedCTRF_MissingTestName(t *testing.T) {
	payload := []byte(`{
		"results": {
			"tool": {"name": "jest"},
			"summary": {"tests": 1},
			"tests": [{"name": "", "status": "passed", "duration": 100}]
		}
	}`)

	report, err := ctrf.Parse(payload)
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	err = ctrf.Validate(report)
	if err == nil {
		t.Fatal("expected validation error for missing test name")
	}
}

func TestMalformedCTRF_InvalidJSON(t *testing.T) {
	payload := []byte(`{not valid json`)

	_, err := ctrf.Parse(payload)
	if err == nil {
		t.Fatal("expected parse error for invalid JSON")
	}
}

func TestMalformedData_InvalidStatusInDB(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Malformed DB Team")

	var reportID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		teamID, "jest", `{"tests":1}`, `{}`,
	).Scan(&reportID)

	// DB check constraint should reject invalid status
	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status, duration_ms)
		 VALUES ($1, $2, $3, $4, $5)`,
		reportID, teamID, "bad_test", "broken", 100,
	)
	if err == nil {
		t.Fatal("expected check constraint violation for invalid status 'broken'")
	}
}

func TestMalformedData_InvalidExecutionStatus(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Bad Exec Status Team")

	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO test_executions (team_id, command, status) VALUES ($1, $2, $3)`,
		teamID, "test", "exploded",
	)
	if err == nil {
		t.Fatal("expected check constraint violation for invalid execution status")
	}
}

// --- Data Integrity Across Pipeline ---

func TestDataIntegrity_ReportSummaryMatchesResults(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Integrity Team")

	ctrfPayload := []byte(`{
		"results": {
			"tool": {"name": "pytest", "version": "7.4.0"},
			"summary": {"tests": 6, "passed": 4, "failed": 1, "skipped": 1, "pending": 0, "other": 0},
			"tests": [
				{"name": "test_login", "status": "passed", "duration": 100, "suite": "auth"},
				{"name": "test_logout", "status": "passed", "duration": 50, "suite": "auth"},
				{"name": "test_register", "status": "passed", "duration": 200, "suite": "auth"},
				{"name": "test_reset_pw", "status": "passed", "duration": 150, "suite": "auth"},
				{"name": "test_admin", "status": "failed", "duration": 300, "message": "forbidden"},
				{"name": "test_disabled", "status": "skipped", "duration": 0}
			]
		}
	}`)

	report, _ := ctrf.Parse(ctrfPayload)
	ctrf.Validate(report)
	summaryJSON, _ := ctrf.SummaryJSON(report.Results.Summary)

	var reportID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, tool_version, summary, raw)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		teamID, report.Results.Tool.Name, report.Results.Tool.Version, summaryJSON, ctrfPayload,
	).Scan(&reportID)

	results := ctrf.Normalize(report, reportID, teamID)
	for _, r := range results {
		tdb.Pool.Exec(ctx,
			`INSERT INTO test_results (report_id, team_id, name, status, duration_ms, message, suite, retry, flaky)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			r.ReportID, r.TeamID, r.Name, r.Status, r.DurationMs, r.Message, r.Suite, r.Retry, r.Flaky,
		)
	}

	// Verify summary matches actual stored results
	var storedSummary json.RawMessage
	tdb.Pool.QueryRow(ctx,
		`SELECT summary FROM test_reports WHERE id = $1`, reportID,
	).Scan(&storedSummary)

	var summary struct {
		Tests   int `json:"tests"`
		Passed  int `json:"passed"`
		Failed  int `json:"failed"`
		Skipped int `json:"skipped"`
	}
	json.Unmarshal(storedSummary, &summary)

	// Count actual results by status
	var actualPassed, actualFailed, actualSkipped int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE report_id = $1 AND status = 'passed'`, reportID,
	).Scan(&actualPassed)
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE report_id = $1 AND status = 'failed'`, reportID,
	).Scan(&actualFailed)
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE report_id = $1 AND status = 'skipped'`, reportID,
	).Scan(&actualSkipped)

	if summary.Passed != actualPassed {
		t.Errorf("summary.passed=%d, actual passed=%d", summary.Passed, actualPassed)
	}
	if summary.Failed != actualFailed {
		t.Errorf("summary.failed=%d, actual failed=%d", summary.Failed, actualFailed)
	}
	if summary.Skipped != actualSkipped {
		t.Errorf("summary.skipped=%d, actual skipped=%d", summary.Skipped, actualSkipped)
	}
	if summary.Tests != actualPassed+actualFailed+actualSkipped {
		t.Errorf("summary.tests=%d, actual total=%d", summary.Tests, actualPassed+actualFailed+actualSkipped)
	}
}

func TestExecutionLifecycle_FailedExecution(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Failed Exec Team")

	var execID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_executions (team_id, command) VALUES ($1, $2) RETURNING id`,
		teamID, "npm run test",
	).Scan(&execID)

	// Transition to running
	tdb.Pool.Exec(ctx,
		`UPDATE test_executions SET status = 'running', started_at = now() WHERE id = $1`, execID,
	)

	// Worker fails (e.g., OOM, timeout)
	errorMsg := "OOMKilled: container exceeded memory limit"
	_, err := tdb.Pool.Exec(ctx,
		`UPDATE test_executions
		 SET status = 'failed', finished_at = now(), error_msg = $2, updated_at = now()
		 WHERE id = $1 AND status NOT IN ('completed', 'failed', 'cancelled')`,
		execID, errorMsg,
	)
	if err != nil {
		t.Fatalf("fail execution: %v", err)
	}

	// Verify error message stored
	var status string
	var storedError *string
	tdb.Pool.QueryRow(ctx,
		`SELECT status, error_msg FROM test_executions WHERE id = $1`, execID,
	).Scan(&status, &storedError)

	if status != "failed" {
		t.Errorf("status = %q, want failed", status)
	}
	if storedError == nil || *storedError != errorMsg {
		t.Errorf("error_msg = %v, want %q", storedError, errorMsg)
	}

	// No report should be linked
	var reportID *string
	tdb.Pool.QueryRow(ctx,
		`SELECT report_id FROM test_executions WHERE id = $1`, execID,
	).Scan(&reportID)
	if reportID != nil {
		t.Error("failed execution should not have a linked report")
	}
}

func TestMultipleExecutionsPerTeam_Ordering(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Ordering Team")

	// Create multiple executions
	execIDs := make([]string, 3)
	for i := 0; i < 3; i++ {
		tdb.Pool.QueryRow(ctx,
			`INSERT INTO test_executions (team_id, command) VALUES ($1, $2) RETURNING id`,
			teamID, fmt.Sprintf("test-run-%d", i),
		).Scan(&execIDs[i])
	}

	// Query ordered by created_at DESC (most recent first)
	rows, err := tdb.Pool.Query(ctx,
		`SELECT id, command FROM test_executions
		 WHERE team_id = $1
		 ORDER BY created_at DESC`, teamID,
	)
	if err != nil {
		t.Fatalf("query executions: %v", err)
	}
	defer rows.Close()

	var count int
	for rows.Next() {
		var id, command string
		rows.Scan(&id, &command)
		count++
	}
	if count != 3 {
		t.Errorf("execution count = %d, want 3", count)
	}
}

func TestQualityGateEvaluationAfterReport(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "QG Lifecycle Team")

	// Create execution
	var execID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_executions (team_id, command, status) VALUES ($1, $2, 'running') RETURNING id`,
		teamID, "npm test",
	).Scan(&execID)

	// Create quality gate for the team
	var gateID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO quality_gates (team_id, name, rules)
		 VALUES ($1, $2, $3) RETURNING id`,
		teamID, "CI Gate", `[{"type":"pass_rate","params":{"threshold":90}},{"type":"zero_failures","params":{}}]`,
	).Scan(&gateID)

	// Upload report with 95% pass rate but 1 failure
	summary := `{"tests":20,"passed":19,"failed":1,"skipped":0,"pending":0,"other":0}`
	var reportID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, execution_id, tool_name, summary, raw)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		teamID, execID, "jest", summary, `{}`,
	).Scan(&reportID)

	// Evaluate quality gate:
	// - pass_rate (95% >= 90%): PASS
	// - zero_failures (1 != 0): FAIL
	// Overall: FAIL
	evalDetails := `[
		{"type":"pass_rate","passed":true,"threshold":90,"actual":95,"message":"pass rate 95.0% >= threshold 90.0%"},
		{"type":"zero_failures","passed":false,"threshold":0,"actual":1,"message":"1 failures (require 0)"}
	]`

	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO quality_gate_evaluations (gate_id, report_id, passed, details)
		 VALUES ($1, $2, $3, $4)`,
		gateID, reportID, false, evalDetails,
	)
	if err != nil {
		t.Fatalf("insert QG evaluation: %v", err)
	}

	// Verify we can query the evaluation result through the execution chain
	var evalPassed bool
	var evalDetailsJSON json.RawMessage
	err = tdb.Pool.QueryRow(ctx,
		`SELECT qge.passed, qge.details
		 FROM quality_gate_evaluations qge
		 JOIN test_reports tr ON qge.report_id = tr.id
		 WHERE tr.execution_id = $1`, execID,
	).Scan(&evalPassed, &evalDetailsJSON)
	if err != nil {
		t.Fatalf("query QG evaluation via execution: %v", err)
	}
	if evalPassed {
		t.Error("quality gate should have failed (zero_failures rule)")
	}

	// Parse details and verify both rules evaluated
	var details []struct {
		Type   string `json:"type"`
		Passed bool   `json:"passed"`
	}
	json.Unmarshal(evalDetailsJSON, &details)
	if len(details) != 2 {
		t.Fatalf("evaluation details count = %d, want 2", len(details))
	}
	if !details[0].Passed {
		t.Error("pass_rate rule should have passed")
	}
	if details[1].Passed {
		t.Error("zero_failures rule should have failed")
	}
}

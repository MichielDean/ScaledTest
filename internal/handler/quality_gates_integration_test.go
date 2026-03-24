//go:build integration

package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/integration"
	"github.com/scaledtest/scaledtest/internal/store"
)

// insertTestReportAt inserts a test report with the given created_at timestamp and
// returns the report ID.
func insertTestReportAt(t *testing.T, ctx context.Context, tdb *integration.TestDB, teamID string, tests, passed, failed, skipped int, createdAt time.Time) string {
	t.Helper()
	summary, _ := json.Marshal(map[string]int{
		"tests":   tests,
		"passed":  passed,
		"failed":  failed,
		"skipped": skipped,
	})
	var id string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw, created_at)
		 VALUES ($1, 'jest', $2, '{"results":{"tool":{"name":"jest"}}}'::jsonb, $3)
		 RETURNING id`,
		teamID, summary, createdAt,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insertTestReportAt: %v", err)
	}
	return id
}

// insertResult inserts a single test result row.
func insertResult(t *testing.T, ctx context.Context, tdb *integration.TestDB, reportID, teamID, name, status string) {
	t.Helper()
	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status, duration_ms, flaky)
		 VALUES ($1, $2, $3, $4, 100, false)`,
		reportID, teamID, name, status,
	)
	if err != nil {
		t.Fatalf("insertResult %s/%s: %v", name, status, err)
	}
}

// insertNoNewFailuresGate inserts a quality gate with a single no_new_failures rule and
// returns its ID.
func insertNoNewFailuresGate(t *testing.T, ctx context.Context, tdb *integration.TestDB, teamID string) string {
	t.Helper()
	var id string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO quality_gates (team_id, name, rules)
		 VALUES ($1, 'No New Failures', '[{"type":"no_new_failures"}]'::jsonb)
		 RETURNING id`,
		teamID,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insertNoNewFailuresGate: %v", err)
	}
	return id
}

// callEvaluateHandler posts to the Evaluate handler and returns the recorder.
func callEvaluateHandler(t *testing.T, tdb *integration.TestDB, teamID, gateID, reportID string) *httptest.ResponseRecorder {
	t.Helper()
	h := &QualityGatesHandler{
		Store: store.NewQualityGateStore(tdb.Pool),
		DB:    tdb.Pool,
	}
	body := fmt.Sprintf(`{"report_id":%q}`, reportID)
	req := httptest.NewRequest("POST",
		"/api/v1/teams/"+teamID+"/quality-gates/"+gateID+"/evaluate",
		strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = testWithClaimsAndParams(req, &auth.Claims{
		UserID: "user-1",
		Email:  "test@example.com",
		Role:   "owner",
		TeamID: teamID,
	}, map[string]string{"teamID": teamID, "gateID": gateID})
	w := httptest.NewRecorder()
	h.Evaluate(w, req)
	return w
}

// TestEvaluateHandler_NoNewFailures_NewFailureDetected verifies that the Evaluate
// handler returns passed=false when the current report introduces a test failure not
// present in the prior report. This directly exercises the fetchPreviousFailedTests
// call added to the handler.
//
// Given: report 1 has test-a failing; report 2 introduces test-b as a new failure.
// When:  Evaluate is called against report 2 with a no_new_failures gate.
// Then:  the handler returns passed=false.
func TestEvaluateHandler_NoNewFailures_NewFailureDetected(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "eval-nnf-fail-team")

	// Prior report: test-a is failing.
	now := time.Now()
	report1ID := insertTestReportAt(t, ctx, tdb, teamID, 1, 0, 1, 0, now.Add(-2*time.Minute))
	insertResult(t, ctx, tdb, report1ID, teamID, "test-a", "failed")

	// Current report: test-a still failing AND test-b is a new failure.
	report2ID := insertTestReportAt(t, ctx, tdb, teamID, 2, 0, 2, 0, now.Add(-1*time.Minute))
	insertResult(t, ctx, tdb, report2ID, teamID, "test-a", "failed")
	insertResult(t, ctx, tdb, report2ID, teamID, "test-b", "failed")

	gateID := insertNoNewFailuresGate(t, ctx, tdb, teamID)

	w := callEvaluateHandler(t, tdb, teamID, gateID, report2ID)

	if w.Code != http.StatusOK {
		t.Fatalf("Evaluate status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}
	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["passed"] != false {
		t.Errorf("passed = %v, want false — test-b is a new failure not present in prior report", resp["passed"])
	}
}

// TestEvaluateHandler_NoNewFailures_NoNewFailuresPass verifies that the Evaluate
// handler returns passed=true when the current report has no failures beyond those
// already present in the prior report. This directly exercises the
// fetchPreviousFailedTests call added to the handler.
//
// Given: report 1 has test-a failing; report 2 still has only test-a failing.
// When:  Evaluate is called against report 2 with a no_new_failures gate.
// Then:  the handler returns passed=true.
func TestEvaluateHandler_NoNewFailures_NoNewFailuresPass(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "eval-nnf-pass-team")

	// Prior report: test-a is failing.
	now := time.Now()
	report1ID := insertTestReportAt(t, ctx, tdb, teamID, 1, 0, 1, 0, now.Add(-2*time.Minute))
	insertResult(t, ctx, tdb, report1ID, teamID, "test-a", "failed")

	// Current report: test-a still failing — no new failures.
	report2ID := insertTestReportAt(t, ctx, tdb, teamID, 1, 0, 1, 0, now.Add(-1*time.Minute))
	insertResult(t, ctx, tdb, report2ID, teamID, "test-a", "failed")

	gateID := insertNoNewFailuresGate(t, ctx, tdb, teamID)

	w := callEvaluateHandler(t, tdb, teamID, gateID, report2ID)

	if w.Code != http.StatusOK {
		t.Fatalf("Evaluate status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}
	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["passed"] != true {
		t.Errorf("passed = %v, want true — test-a was already failing in prior report", resp["passed"])
	}
}

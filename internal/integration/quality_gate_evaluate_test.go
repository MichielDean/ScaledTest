//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/handler"
	"github.com/scaledtest/scaledtest/internal/store"
)

// insertQGReport inserts a test_reports row at the given time and returns its ID.
// Tests are inserted individually via insertQGResult.
func insertQGReport(t *testing.T, ctx context.Context, tdb *TestDB, teamID string, total, passed, failed int, createdAt time.Time) string {
	t.Helper()
	summary, _ := json.Marshal(map[string]int{
		"tests":   total,
		"passed":  passed,
		"failed":  failed,
		"skipped": 0,
	})
	var id string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw, created_at)
		 VALUES ($1, 'jest', $2, '{"results":{"tool":{"name":"jest"}}}'::jsonb, $3)
		 RETURNING id`,
		teamID, summary, createdAt,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insertQGReport: %v", err)
	}
	return id
}

// insertQGResult inserts a single test_results row for quality gate tests.
func insertQGResult(t *testing.T, ctx context.Context, tdb *TestDB, reportID, teamID, name, status string) {
	t.Helper()
	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status, duration_ms, flaky)
		 VALUES ($1, $2, $3, $4, 100, false)`,
		reportID, teamID, name, status,
	)
	if err != nil {
		t.Fatalf("insertQGResult %s/%s: %v", name, status, err)
	}
}

// insertNoNewFailuresGateForTeam inserts a quality gate with a single
// no_new_failures rule and returns its ID.
func insertNoNewFailuresGateForTeam(t *testing.T, ctx context.Context, tdb *TestDB, teamID string) string {
	t.Helper()
	var id string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO quality_gates (team_id, name, rules)
		 VALUES ($1, 'No New Failures Gate', '[{"type":"no_new_failures"}]'::jsonb)
		 RETURNING id`,
		teamID,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insertNoNewFailuresGateForTeam: %v", err)
	}
	return id
}

// postEvaluateQG calls QualityGatesHandler.Evaluate via httptest with the given
// team, gate, and report IDs, and returns the response recorder.
func postEvaluateQG(t *testing.T, tdb *TestDB, teamID, gateID, reportID string) *httptest.ResponseRecorder {
	t.Helper()

	h := &handler.QualityGatesHandler{
		Store: store.NewQualityGateStore(tdb.Pool),
		DB:    tdb.Pool,
	}

	body := fmt.Sprintf(`{"report_id":%q}`, reportID)
	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/teams/"+teamID+"/quality-gates/"+gateID+"/evaluate",
		strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("teamID", teamID)
	rctx.URLParams.Add("gateID", gateID)
	reqCtx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	reqCtx = auth.SetClaims(reqCtx, &auth.Claims{
		UserID: "user-1",
		Email:  "test@example.com",
		Role:   "owner",
		TeamID: teamID,
	})
	req = req.WithContext(reqCtx)

	w := httptest.NewRecorder()
	h.Evaluate(w, req)
	return w
}

// assertEvalResponse decodes the response body and fails the test if the HTTP
// status or the "passed" field do not match expectations.
func assertEvalResponse(t *testing.T, w *httptest.ResponseRecorder, wantPassed bool, label string) {
	t.Helper()
	if w.Code != http.StatusOK {
		t.Fatalf("%s: Evaluate status = %d, want 200; body: %s", label, w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("%s: decode response: %v", label, err)
	}
	if resp["passed"] != wantPassed {
		t.Errorf("%s: response passed = %v, want %v", label, resp["passed"], wantPassed)
	}
}

// assertStoredEvaluation queries quality_gate_evaluations and fails if the
// stored passed value does not match wantPassed.
func assertStoredEvaluation(t *testing.T, ctx context.Context, tdb *TestDB, gateID, reportID string, wantPassed bool, label string) {
	t.Helper()
	var dbPassed bool
	if err := tdb.Pool.QueryRow(ctx,
		`SELECT passed FROM quality_gate_evaluations WHERE gate_id = $1 AND report_id = $2`,
		gateID, reportID,
	).Scan(&dbPassed); err != nil {
		t.Fatalf("%s: query stored evaluation: %v", label, err)
	}
	if dbPassed != wantPassed {
		t.Errorf("%s: stored evaluation passed = %v, want %v", label, dbPassed, wantPassed)
	}
}

// TestQualityGateEvaluate_NoNewFailures_EndToEnd covers the full evaluation flow
// for the no_new_failures rule, from API request through to database-persisted result.
//
// Scenario:
//   - Report A: [test1=pass, test2=fail]
//   - Report B: [test1=fail, test2=fail, test3=fail] — test3 is a new failure
//   - Evaluate B: fetchPreviousFailedTests returns {test2} from A. test1 and test3
//     are new failures → passed=false; DB evaluation record reflects passed=false.
//   - Report C: [test1=pass, test2=fail] — failures are a subset of B's failures.
//     When evaluating C, the prior report is B (most recent before C). B had
//     test1, test2, test3 failing; C only has test2 which was already in B
//     → no new failures → passed=true; DB evaluation record reflects passed=true.
func TestQualityGateEvaluate_NoNewFailures_EndToEnd(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "QG Evaluate E2E Team")

	now := time.Now()

	// Step 1/2: Create team and insert two test reports.
	//
	// Report A (prior): test1=pass, test2=fail
	reportAID := insertQGReport(t, ctx, tdb, teamID, 2, 1, 1, now.Add(-4*time.Minute))
	insertQGResult(t, ctx, tdb, reportAID, teamID, "test1", "passed")
	insertQGResult(t, ctx, tdb, reportAID, teamID, "test2", "failed")

	// Report B (current): test1=fail, test2=fail, test3=fail — test3 is a new failure
	reportBID := insertQGReport(t, ctx, tdb, teamID, 3, 0, 3, now.Add(-2*time.Minute))
	insertQGResult(t, ctx, tdb, reportBID, teamID, "test1", "failed")
	insertQGResult(t, ctx, tdb, reportBID, teamID, "test2", "failed")
	insertQGResult(t, ctx, tdb, reportBID, teamID, "test3", "failed")

	// Step 3: Create quality gate with no_new_failures rule.
	gateID := insertNoNewFailuresGateForTeam(t, ctx, tdb, teamID)

	// Steps 4–5: POST /evaluate against report B; assert response passed=false.
	// Prior report is A: {test2} failing. test1 and test3 are new → gate fails.
	w := postEvaluateQG(t, tdb, teamID, gateID, reportBID)
	assertEvalResponse(t, w, false, "report B")

	// Step 6: Assert the stored evaluation record in DB reflects passed=false.
	assertStoredEvaluation(t, ctx, tdb, gateID, reportBID, false, "report B stored")

	// Step 7: Repeat with report C where all failures were also in report A.
	// Report C: test1=pass, test2=fail — only test2 fails, which was in A and in B.
	// Prior report for C is B (most recent before C). B has {test1, test2, test3}
	// failing; test2 is already in that set → no new failures → gate passes.
	reportCID := insertQGReport(t, ctx, tdb, teamID, 2, 1, 1, now)
	insertQGResult(t, ctx, tdb, reportCID, teamID, "test1", "passed")
	insertQGResult(t, ctx, tdb, reportCID, teamID, "test2", "failed")

	wC := postEvaluateQG(t, tdb, teamID, gateID, reportCID)
	assertEvalResponse(t, wC, true, "report C")
	assertStoredEvaluation(t, ctx, tdb, gateID, reportCID, true, "report C stored")
}

// TestQualityGateEvaluate_NoNewFailures_FirstReport_NoBaseline tests the degenerate
// case: evaluating the very first report for a team when no prior report exists.
//
// When there is no prior report, fetchPreviousFailedTests returns nil (the query
// finds no previous report and returns early). In evalNoNewFailures, a nil
// PreviousFailedTests map causes every current failure to be counted as "new"
// (the check is: PreviousFailedTests==nil || !PreviousFailedTests[name]).
//
// Documented behavior: with no prior-run baseline, no_new_failures treats all
// failures in the first report as regressions and returns passed=false. Teams
// adopting this rule should be aware that the very first evaluation against a report
// with failures will always fail. Submitting an all-passing report first establishes
// a clean baseline so subsequent reports are correctly compared.
func TestQualityGateEvaluate_NoNewFailures_FirstReport_NoBaseline(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "QG Evaluate No Baseline Team")

	// Insert the only report for this team — no prior report exists.
	reportID := insertQGReport(t, ctx, tdb, teamID, 2, 1, 1, time.Now())
	insertQGResult(t, ctx, tdb, reportID, teamID, "test1", "passed")
	insertQGResult(t, ctx, tdb, reportID, teamID, "test2", "failed")

	gateID := insertNoNewFailuresGateForTeam(t, ctx, tdb, teamID)

	w := postEvaluateQG(t, tdb, teamID, gateID, reportID)

	// No prior report → fetchPreviousFailedTests returns nil → evalNoNewFailures
	// counts test2 as a new failure → passed=false.
	assertEvalResponse(t, w, false, "first report with no baseline")
}

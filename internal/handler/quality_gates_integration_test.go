//go:build integration

package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/integration"
	"github.com/scaledtest/scaledtest/internal/testutil"
)

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
	report1ID := testutil.InsertQGReport(t, ctx, tdb.Pool, teamID, 1, 0, 1, now.Add(-2*time.Minute))
	testutil.InsertQGResult(t, ctx, tdb.Pool, report1ID, teamID, "test-a", "failed")

	// Current report: test-a still failing AND test-b is a new failure.
	report2ID := testutil.InsertQGReport(t, ctx, tdb.Pool, teamID, 2, 0, 2, now.Add(-1*time.Minute))
	testutil.InsertQGResult(t, ctx, tdb.Pool, report2ID, teamID, "test-a", "failed")
	testutil.InsertQGResult(t, ctx, tdb.Pool, report2ID, teamID, "test-b", "failed")

	gateID := testutil.InsertNoNewFailuresGate(t, ctx, tdb.Pool, teamID)

	w := testutil.PostEvaluateQG(t, tdb.Pool, teamID, gateID, report2ID)

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
	report1ID := testutil.InsertQGReport(t, ctx, tdb.Pool, teamID, 1, 0, 1, now.Add(-2*time.Minute))
	testutil.InsertQGResult(t, ctx, tdb.Pool, report1ID, teamID, "test-a", "failed")

	// Current report: test-a still failing — no new failures.
	report2ID := testutil.InsertQGReport(t, ctx, tdb.Pool, teamID, 1, 0, 1, now.Add(-1*time.Minute))
	testutil.InsertQGResult(t, ctx, tdb.Pool, report2ID, teamID, "test-a", "failed")

	gateID := testutil.InsertNoNewFailuresGate(t, ctx, tdb.Pool, teamID)

	w := testutil.PostEvaluateQG(t, tdb.Pool, teamID, gateID, report2ID)

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

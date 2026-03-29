//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/db"
	"github.com/scaledtest/scaledtest/internal/handler"
	"github.com/scaledtest/scaledtest/internal/testutil"
)

// postCompare calls ReportsHandler.Compare via httptest with the given report IDs.
func postCompare(t *testing.T, pool *db.Pool, teamID, baseID, headID string) *httptest.ResponseRecorder {
	t.Helper()
	h := &handler.ReportsHandler{
		DB: pool,
	}
	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/v1/reports/compare?base=%s&head=%s", baseID, headID),
		nil)

	rctx := chi.NewRouteContext()
	reqCtx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	reqCtx = auth.SetClaims(reqCtx, &auth.Claims{
		UserID: "user-1",
		Email:  "test@example.com",
		Role:   "owner",
		TeamID: teamID,
	})
	req = req.WithContext(reqCtx)

	w := httptest.NewRecorder()
	h.Compare(w, req)
	return w
}

// TestCompareReports_NullOptionalFields verifies that the Compare handler returns
// 200 OK when test results have NULL optional fields (message, trace, file_path, suite).
//
// Before the fix, the fetchResults query scanned nullable TEXT columns directly
// into string destinations. pgx v5 returns "cannot scan NULL into *string" for
// NULL TEXT values, causing a 500. The fix uses COALESCE to convert NULL to ''.
//
// Given: two reports whose test results have no message, trace, file_path, or suite
// When: the Compare endpoint is called with those report IDs
// Then: response is 200 OK with a valid diff payload
func TestCompareReports_NullOptionalFields(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "Compare Null Fields Team")

	now := time.Now()

	// Base report: two passing tests — all optional fields absent (NULL in DB)
	baseID := testutil.InsertQGReport(t, ctx, tdb.Pool, teamID, 2, 2, 0, now.Add(-2*time.Minute))
	testutil.InsertQGResult(t, ctx, tdb.Pool, baseID, teamID, "test/login", "passed")
	testutil.InsertQGResult(t, ctx, tdb.Pool, baseID, teamID, "test/signup", "passed")

	// Head report: one passing, one new failure — optional fields absent (NULL in DB)
	headID := testutil.InsertQGReport(t, ctx, tdb.Pool, teamID, 2, 1, 1, now)
	testutil.InsertQGResult(t, ctx, tdb.Pool, headID, teamID, "test/login", "passed")
	testutil.InsertQGResult(t, ctx, tdb.Pool, headID, teamID, "test/signup", "failed")

	w := postCompare(t, tdb.Pool, teamID, baseID, headID)

	if w.Code != http.StatusOK {
		t.Fatalf("Compare: got %d, want 200; body: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode compare response: %v", err)
	}

	// Verify the diff structure is present
	diff, ok := resp["diff"].(map[string]interface{})
	if !ok {
		t.Fatalf("response missing 'diff' field; got: %v", resp)
	}

	summary, ok := diff["summary"].(map[string]interface{})
	if !ok {
		t.Fatalf("diff missing 'summary' field; got: %v", diff)
	}

	// base has 2 tests, head has 2 tests — verify summary counts
	if summary["base_tests"] != float64(2) {
		t.Errorf("summary.base_tests = %v, want 2", summary["base_tests"])
	}
	if summary["head_tests"] != float64(2) {
		t.Errorf("summary.head_tests = %v, want 2", summary["head_tests"])
	}

	// test/signup was passing in base, failing in head → 1 new failure
	if summary["new_failures"] != float64(1) {
		t.Errorf("summary.new_failures = %v, want 1", summary["new_failures"])
	}

	// Verify the new failure entry contains expected test name
	newFailures, ok := diff["new_failures"].([]interface{})
	if !ok || len(newFailures) != 1 {
		t.Fatalf("diff.new_failures = %v, want 1 entry", diff["new_failures"])
	}
	failure, ok := newFailures[0].(map[string]interface{})
	if !ok {
		t.Fatalf("new_failures[0] is not an object: %T", newFailures[0])
	}
	if failure["name"] != "test/signup" {
		t.Errorf("new failure name = %v, want test/signup", failure["name"])
	}

	// Verify 'strings' containing nil values are returned as empty strings (not null)
	if msg, ok := failure["message"]; ok && msg != "" && msg != nil {
		t.Errorf("failure.message = %v, want empty or absent", msg)
	}
}

// TestCompareReports_NullOptionalFields_WithStrings verifies that message and trace
// fields are included in diff entries when they contain actual values.
func TestCompareReports_NullOptionalFields_WithStrings(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "Compare With Strings Team")

	now := time.Now()

	baseID := testutil.InsertQGReport(t, ctx, tdb.Pool, teamID, 1, 1, 0, now.Add(-2*time.Minute))
	testutil.InsertQGResult(t, ctx, tdb.Pool, baseID, teamID, "test/api", "passed")

	headID := testutil.InsertQGReport(t, ctx, tdb.Pool, teamID, 1, 0, 1, now)

	// Insert head result with a message (non-NULL optional field)
	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status, duration_ms, message, flaky)
		 VALUES ($1, $2, $3, $4, 500, $5, false)`,
		headID, teamID, "test/api", "failed", "Expected 200 got 500",
	)
	if err != nil {
		t.Fatalf("insert head result with message: %v", err)
	}

	w := postCompare(t, tdb.Pool, teamID, baseID, headID)

	if w.Code != http.StatusOK {
		t.Fatalf("Compare: got %d, want 200; body: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	diff := resp["diff"].(map[string]interface{})
	newFailures := diff["new_failures"].([]interface{})
	if len(newFailures) != 1 {
		t.Fatalf("new_failures length = %d, want 1", len(newFailures))
	}

	failure := newFailures[0].(map[string]interface{})
	if failure["message"] != "Expected 200 got 500" {
		t.Errorf("failure.message = %v, want 'Expected 200 got 500'", failure["message"])
	}
}

// TestCompareReports_CrossTeam_ReturnsNotFound verifies team isolation:
// a report from another team cannot be used in a compare.
func TestCompareReports_CrossTeam_ReturnsNotFound(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamA := tdb.CreateTeam(t, "Compare TeamA")
	teamB := tdb.CreateTeam(t, "Compare TeamB")

	now := time.Now()

	// Both reports belong to teamA
	baseID := testutil.InsertQGReport(t, ctx, tdb.Pool, teamA, 1, 1, 0, now.Add(-time.Minute))
	headID := testutil.InsertQGReport(t, ctx, tdb.Pool, teamA, 1, 0, 1, now)
	testutil.InsertQGResult(t, ctx, tdb.Pool, baseID, teamA, "test/x", "passed")
	testutil.InsertQGResult(t, ctx, tdb.Pool, headID, teamA, "test/x", "failed")

	// But we're calling as teamB — should not see teamA's reports
	h := &handler.ReportsHandler{
		DB: tdb.Pool,
	}
	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/v1/reports/compare?base=%s&head=%s", baseID, headID),
		nil)
	rctx := chi.NewRouteContext()
	reqCtx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	reqCtx = auth.SetClaims(reqCtx, &auth.Claims{
		UserID: "user-b",
		Email:  "b@example.com",
		Role:   "owner",
		TeamID: teamB, // different team
	})
	req = req.WithContext(reqCtx)
	w := httptest.NewRecorder()
	h.Compare(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("cross-team compare: got %d, want 404", w.Code)
	}
}

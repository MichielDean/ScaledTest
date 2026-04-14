//go:build integration

// Package testutil provides shared test helpers for integration tests.
package testutil

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
	"github.com/scaledtest/scaledtest/internal/db"
	"github.com/scaledtest/scaledtest/internal/handler"
	"github.com/scaledtest/scaledtest/internal/store"
)

// InsertQGReport inserts a test_reports row at the given created_at time and
// returns the new report ID. Tests and skipped counts are hardcoded as 0 for
// skipped; use total/passed/failed to describe the summary.
func InsertQGReport(t *testing.T, ctx context.Context, pool *db.Pool, teamID string, total, passed, failed int, createdAt time.Time) string {
	t.Helper()
	summary, _ := json.Marshal(map[string]int{
		"tests":   total,
		"passed":  passed,
		"failed":  failed,
		"skipped": 0,
	})
	var id string
	err := pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, tool_version, summary, raw, created_at)
		 VALUES ($1, 'jest', '1.0.0', $2, '{"results":{"tool":{"name":"jest"}}}'::jsonb, $3)
		 RETURNING id`,
		teamID, summary, createdAt,
	).Scan(&id)
	if err != nil {
		t.Fatalf("InsertQGReport: %v", err)
	}
	return id
}

// InsertQGResult inserts a single test_results row for the given report.
func InsertQGResult(t *testing.T, ctx context.Context, pool *db.Pool, reportID, teamID, name, status string) {
	t.Helper()
	_, err := pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status, duration_ms, flaky)
		 VALUES ($1, $2, $3, $4, 100, false)`,
		reportID, teamID, name, status,
	)
	if err != nil {
		t.Fatalf("InsertQGResult %s/%s: %v", name, status, err)
	}
}

// InsertNoNewFailuresGate inserts a quality gate with a single no_new_failures
// rule for the given team and returns its ID.
func InsertNoNewFailuresGate(t *testing.T, ctx context.Context, pool *db.Pool, teamID string) string {
	t.Helper()
	var id string
	err := pool.QueryRow(ctx,
		`INSERT INTO quality_gates (team_id, name, rules)
		 VALUES ($1, 'No New Failures Gate', '[{"type":"no_new_failures"}]'::jsonb)
		 RETURNING id`,
		teamID,
	).Scan(&id)
	if err != nil {
		t.Fatalf("InsertNoNewFailuresGate: %v", err)
	}
	return id
}

// PostEvaluateQG calls QualityGatesHandler.Evaluate via httptest with the given
// team, gate, and report IDs, and returns the response recorder.
func PostEvaluateQG(t *testing.T, pool *db.Pool, teamID, gateID, reportID string) *httptest.ResponseRecorder {
	t.Helper()
	h := &handler.QualityGatesHandler{
		Store: store.NewQualityGateStore(pool),
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

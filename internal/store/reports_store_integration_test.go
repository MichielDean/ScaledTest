//go:build integration

package store_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/integration"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/store"
)

func TestReportsStore_CreateWithResults_BulkInsert(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "reports-bulk-test-team")
	s := store.NewReportsStore(tdb.Pool)

	summary, _ := json.Marshal(map[string]int{"tests": 100, "passed": 90, "failed": 8, "skipped": 2})
	raw, _ := json.Marshal(map[string]interface{}{"results": map[string]interface{}{"tool": map[string]interface{}{"name": "jest"}}})

	params := store.CreateReportParams{
		ID:          "rpt-bulk-001",
		TeamID:      teamID,
		ToolName:    "jest",
		ToolVersion: "1.0.0",
		Summary:     summary,
		Raw:         raw,
		CreatedAt:   time.Now(),
	}

	results := make([]model.TestResult, 100)
	for i := range results {
		status := "passed"
		if i%10 == 0 {
			status = "failed"
		}
		if i%25 == 0 {
			status = "skipped"
		}
		results[i] = model.TestResult{
			ReportID:   "rpt-bulk-001",
			TeamID:     teamID,
			Name:       "test-bulk-" + string(rune('A'+i%26)) + string(rune('0'+i%10)),
			Status:     status,
			DurationMs: int64(i * 10),
		}
	}

	err := s.CreateWithResults(ctx, params, results)
	if err != nil {
		t.Fatalf("CreateWithResults with 100 results: %v", err)
	}

	rpt, found, err := s.GetReportAndResults(ctx, "rpt-bulk-001", teamID)
	if err != nil {
		t.Fatalf("GetReportAndResults: %v", err)
	}
	if rpt == nil {
		t.Fatal("expected report, got nil")
	}
	if len(found) != 100 {
		t.Errorf("expected 100 results, got %d", len(found))
	}
}

func TestReportsStore_CreateWithResults_BulkInsert_1000Results(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "reports-bulk-1k-test-team")
	s := store.NewReportsStore(tdb.Pool)

	summary, _ := json.Marshal(map[string]int{"tests": 1000, "passed": 900, "failed": 50, "skipped": 50})
	raw, _ := json.Marshal(map[string]interface{}{"results": map[string]interface{}{"tool": map[string]interface{}{"name": "jest"}}})

	params := store.CreateReportParams{
		ID:          "rpt-bulk-1k",
		TeamID:      teamID,
		ToolName:    "jest",
		ToolVersion: "1.0.0",
		Summary:     summary,
		Raw:         raw,
		CreatedAt:   time.Now(),
	}

	results := make([]model.TestResult, 1000)
	for i := range results {
		status := "passed"
		if i%20 == 0 {
			status = "failed"
		}
		if i%50 == 0 {
			status = "skipped"
		}
		results[i] = model.TestResult{
			ReportID:   "rpt-bulk-1k",
			TeamID:     teamID,
			Name:       "test-1k-" + string(rune('A'+i%26)) + string(rune('0'+i%10)) + string(rune('0'+i/10%10)),
			Status:     status,
			DurationMs: int64(i * 5),
		}
	}

	err := s.CreateWithResults(ctx, params, results)
	if err != nil {
		t.Fatalf("CreateWithResults with 1000 results: %v", err)
	}

	rpt, found, err := s.GetReportAndResults(ctx, "rpt-bulk-1k", teamID)
	if err != nil {
		t.Fatalf("GetReportAndResults: %v", err)
	}
	if rpt == nil {
		t.Fatal("expected report, got nil")
	}
	if len(found) != 1000 {
		t.Errorf("expected 1000 results, got %d", len(found))
	}
}

// +build integration

package services

import (
	"context"
	"testing"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
)

func TestTestResultServiceIntegration_UploadAndGetResults(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()
	service := NewTestResultService(testDB, testLogger)

	// Setup: Create test team
	teamID := "test-team-results-1"
	createTestTeam(t, ctx, teamID, "Test Results Team", "")
	defer cleanupTestData(t, ctx)

	var resultID string

	t.Run("Success - Upload test results", func(t *testing.T) {
		req := &proto.UploadTestResultsRequest{
			TeamId:      teamID,
			ProjectName: "Integration Test Project",
			Branch:      "main",
			CommitSha:   "abc123def456",
			Summary: &proto.TestSummary{
				Total:      10,
				Passed:     8,
				Failed:     2,
				Skipped:    0,
				Pending:    0,
				DurationMs: 5000,
			},
			Tests: []*proto.TestCase{
				{
					Name:       "test_login",
					Suite:      "authentication",
					Status:     "passed",
					DurationMs: 100,
				},
				{
					Name:         "test_invalid_password",
					Suite:        "authentication",
					Status:       "failed",
					DurationMs:   150,
					ErrorMessage: stringPtr("Invalid password"),
				},
			},
			Environment: map[string]string{
				"os":      "linux",
				"browser": "chrome",
			},
		}

		resp, err := service.UploadTestResults(ctx, req)
		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if !resp.Success {
			t.Error("Expected success to be true")
		}

		if resp.ResultId == "" {
			t.Error("Expected result ID to be set")
		}

		resultID = resp.ResultId

		// Verify test run was created
		var count int
		err = testDB.QueryRow(ctx, "SELECT COUNT(*) FROM public.test_runs WHERE id = $1", resultID).Scan(&count)
		if err != nil {
			t.Fatalf("Failed to verify test run creation: %v", err)
		}

		if count != 1 {
			t.Errorf("Expected 1 test run, found %d", count)
		}

		// Verify test cases were created
		err = testDB.QueryRow(ctx, "SELECT COUNT(*) FROM public.test_cases WHERE test_run_id = $1", resultID).Scan(&count)
		if err != nil {
			t.Fatalf("Failed to verify test cases creation: %v", err)
		}

		if count != 2 {
			t.Errorf("Expected 2 test cases, found %d", count)
		}
	})

	t.Run("Success - Get test results", func(t *testing.T) {
		req := &proto.GetTestResultsRequest{ResultId: resultID}
		resp, err := service.GetTestResults(ctx, req)

		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if resp.Id != resultID {
			t.Errorf("Expected result ID %s, got %s", resultID, resp.Id)
		}

		if resp.ProjectName != "Integration Test Project" {
			t.Errorf("Expected project name 'Integration Test Project', got '%s'", resp.ProjectName)
		}

		if resp.Summary.Total != 10 {
			t.Errorf("Expected total 10, got %d", resp.Summary.Total)
		}

		if resp.Summary.Passed != 8 {
			t.Errorf("Expected passed 8, got %d", resp.Summary.Passed)
		}

		if len(resp.Tests) != 2 {
			t.Errorf("Expected 2 tests, got %d", len(resp.Tests))
		}

		// Verify environment was preserved
		if resp.Environment["os"] != "linux" {
			t.Errorf("Expected environment os 'linux', got '%s'", resp.Environment["os"])
		}
	})
}

func TestTestResultServiceIntegration_ListResults(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()
	service := NewTestResultService(testDB, testLogger)

	// Setup: Create test team and upload multiple results
	teamID := "test-team-list-results-1"
	createTestTeam(t, ctx, teamID, "List Results Team", "")
	defer cleanupTestData(t, ctx)

	// Upload first result
	uploadReq1 := &proto.UploadTestResultsRequest{
		TeamId:      teamID,
		ProjectName: "Project A",
		Branch:      "main",
		Summary: &proto.TestSummary{
			Total:      5,
			Passed:     5,
			Failed:     0,
			DurationMs: 1000,
		},
	}
	_, err := service.UploadTestResults(ctx, uploadReq1)
	if err != nil {
		t.Fatalf("Failed to upload first result: %v", err)
	}

	// Upload second result
	uploadReq2 := &proto.UploadTestResultsRequest{
		TeamId:      teamID,
		ProjectName: "Project B",
		Branch:      "dev",
		Summary: &proto.TestSummary{
			Total:      3,
			Passed:     2,
			Failed:     1,
			DurationMs: 500,
		},
	}
	_, err = service.UploadTestResults(ctx, uploadReq2)
	if err != nil {
		t.Fatalf("Failed to upload second result: %v", err)
	}

	t.Run("Success - List all results", func(t *testing.T) {
		req := &proto.ListTestResultsRequest{
			TeamId:   teamID,
			Page:     1,
			PageSize: 10,
		}

		resp, err := service.ListTestResults(ctx, req)
		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if len(resp.Results) != 2 {
			t.Errorf("Expected 2 results, got %d", len(resp.Results))
		}

		if resp.TotalCount != 2 {
			t.Errorf("Expected total count 2, got %d", resp.TotalCount)
		}
	})

	t.Run("Success - List with project filter", func(t *testing.T) {
		projectName := "Project A"
		req := &proto.ListTestResultsRequest{
			TeamId:      teamID,
			Page:        1,
			PageSize:    10,
			ProjectName: &projectName,
		}

		resp, err := service.ListTestResults(ctx, req)
		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if len(resp.Results) != 1 {
			t.Errorf("Expected 1 result, got %d", len(resp.Results))
		}

		if len(resp.Results) > 0 && resp.Results[0].ProjectName != "Project A" {
			t.Errorf("Expected project 'Project A', got '%s'", resp.Results[0].ProjectName)
		}
	})
}

func TestTestResultServiceIntegration_GetStatistics(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()
	service := NewTestResultService(testDB, testLogger)

	// Setup: Create test team and upload results
	teamID := "test-team-stats-1"
	createTestTeam(t, ctx, teamID, "Stats Team", "")
	defer cleanupTestData(t, ctx)

	// Upload multiple results for statistics
	for i := 0; i < 3; i++ {
		req := &proto.UploadTestResultsRequest{
			TeamId:      teamID,
			ProjectName: "Stats Project",
			Branch:      "main",
			Summary: &proto.TestSummary{
				Total:      10,
				Passed:     8,
				Failed:     2,
				Skipped:    0,
				Pending:    0,
				DurationMs: 1000,
			},
		}
		_, err := service.UploadTestResults(ctx, req)
		if err != nil {
			t.Fatalf("Failed to upload result %d: %v", i, err)
		}
	}

	t.Run("Success - Get statistics", func(t *testing.T) {
		req := &proto.GetTestStatisticsRequest{TeamId: teamID}
		resp, err := service.GetTestStatistics(ctx, req)

		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if resp.TotalRuns != 3 {
			t.Errorf("Expected 3 total runs, got %d", resp.TotalRuns)
		}

		if resp.TotalTests != 30 { // 3 runs * 10 tests each
			t.Errorf("Expected 30 total tests, got %d", resp.TotalTests)
		}

		if resp.PassRate == 0 {
			t.Error("Expected pass rate to be calculated")
		}

		// Pass rate should be 80% (8 passed out of 10)
		expectedPassRate := float64(80.0)
		if resp.PassRate < expectedPassRate-0.1 || resp.PassRate > expectedPassRate+0.1 {
			t.Errorf("Expected pass rate ~%.1f%%, got %.1f%%", expectedPassRate, resp.PassRate)
		}
	})
}

// Helper function
func stringPtr(s string) *string {
	return &s
}

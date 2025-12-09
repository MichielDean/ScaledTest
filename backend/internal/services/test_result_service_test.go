package services

import (
	"context"
	"database/sql"
	"testing"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/pashagolub/pgxmock/v4"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// contextWithUserID creates a context with user_id set
func contextWithUserID(userID string) context.Context {
	return context.WithValue(context.Background(), "user_id", userID)
}

func TestTestResultService_UploadTestResults(t *testing.T) {
	logger, _ := zap.NewDevelopment()

	t.Run("Success - Upload test results", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := contextWithUserID("user-123")

		mock.ExpectBegin()

		// Mock test run insert
		runRows := pgxmock.NewRows([]string{"created_at"}).AddRow(nil)
		mock.ExpectQuery("INSERT INTO public.test_runs").
			WithArgs(
				pgxmock.AnyArg(), // id
				"user-123",       // uploaded_by
				"main",           // branch
				"abc123",         // commit_sha
				int32(2),         // total_tests
				int32(1),         // passed_tests
				int32(1),         // failed_tests
				int32(0),         // skipped_tests
				int32(0),         // pending_tests
				int64(1000),      // total_duration_ms
				pgxmock.AnyArg(), // environment JSON
			).
			WillReturnRows(runRows)

		// Mock test case inserts
		for i := 0; i < 2; i++ {
			mock.ExpectExec("INSERT INTO public.test_cases").
				WithArgs(
					pgxmock.AnyArg(), // id
					pgxmock.AnyArg(), // test_run_id
					pgxmock.AnyArg(), // name
					pgxmock.AnyArg(), // suite
					pgxmock.AnyArg(), // status
					pgxmock.AnyArg(), // duration_ms
					pgxmock.AnyArg(), // error_message
					pgxmock.AnyArg(), // stack_trace
				).
				WillReturnResult(pgxmock.NewResult("INSERT", 1))
		}

		mock.ExpectCommit()

		req := &proto.UploadTestResultsRequest{
			Branch:    "main",
			CommitSha: "abc123",
			Summary: &proto.TestSummary{
				Total:      2,
				Passed:     1,
				Failed:     1,
				Skipped:    0,
				Pending:    0,
				DurationMs: 1000,
			},
			Tests: []*proto.TestCase{
				{
					Name:       "test 1",
					Suite:      "suite 1",
					Status:     "passed",
					DurationMs: 500,
				},
				{
					Name:       "test 2",
					Suite:      "suite 1",
					Status:     "failed",
					DurationMs: 500,
				},
			},
			Environment: map[string]string{
				"os": "linux",
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

		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("Unfulfilled expectations: %s", err)
		}
	})

	t.Run("Error - Unauthenticated (no user_id in context)", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := context.Background() // No user_id

		req := &proto.UploadTestResultsRequest{
			Branch: "main",
		}

		_, err = service.UploadTestResults(ctx, req)

		if err == nil {
			t.Fatal("Expected error, got nil")
		}

		st, ok := status.FromError(err)
		if !ok {
			t.Fatal("Expected gRPC status error")
		}

		if st.Code() != codes.Unauthenticated {
			t.Errorf("Expected Unauthenticated status, got %v", st.Code())
		}
	})

	t.Run("Error - Database transaction fails", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := contextWithUserID("user-123")

		mock.ExpectBegin().WillReturnError(sql.ErrConnDone)

		req := &proto.UploadTestResultsRequest{
			Branch: "main",
			Summary: &proto.TestSummary{
				Total:      1,
				Passed:     1,
				DurationMs: 1000,
			},
		}

		_, err = service.UploadTestResults(ctx, req)

		if err == nil {
			t.Fatal("Expected error, got nil")
		}

		st, ok := status.FromError(err)
		if !ok {
			t.Fatal("Expected gRPC status error")
		}

		if st.Code() != codes.Internal {
			t.Errorf("Expected Internal status, got %v", st.Code())
		}
	})

	t.Run("Error - Insert test run fails", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := contextWithUserID("user-123")

		mock.ExpectBegin()
		mock.ExpectQuery("INSERT INTO public.test_runs").
			WillReturnError(sql.ErrConnDone)
		mock.ExpectRollback()

		req := &proto.UploadTestResultsRequest{
			Branch: "main",
			Summary: &proto.TestSummary{
				Total:      1,
				Passed:     1,
				DurationMs: 1000,
			},
		}

		_, err = service.UploadTestResults(ctx, req)

		if err == nil {
			t.Fatal("Expected error, got nil")
		}
	})

	t.Run("Success - Upload with no test cases", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := contextWithUserID("user-123")

		mock.ExpectBegin()

		// Mock test run insert - with proper args matching
		runRows := pgxmock.NewRows([]string{"created_at"}).AddRow(nil)
		mock.ExpectQuery("INSERT INTO public.test_runs").
			WithArgs(
				pgxmock.AnyArg(), // id
				"user-123",       // uploaded_by
				"main",           // branch
				"",               // commit_sha
				int32(0),         // total_tests
				int32(0),         // passed_tests
				int32(0),         // failed_tests
				int32(0),         // skipped_tests
				int32(0),         // pending_tests
				int64(0),         // total_duration_ms
				pgxmock.AnyArg(), // environment JSON
			).
			WillReturnRows(runRows)

		mock.ExpectCommit()

		req := &proto.UploadTestResultsRequest{
			Branch: "main",
			Summary: &proto.TestSummary{
				Total:      0,
				Passed:     0,
				DurationMs: 0,
			},
			Tests: []*proto.TestCase{},
		}

		resp, err := service.UploadTestResults(ctx, req)

		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if !resp.Success {
			t.Error("Expected success to be true")
		}

		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("Unfulfilled expectations: %s", err)
		}
	})

	t.Run("Success - Upload with large number of test cases", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := contextWithUserID("user-123")

		mock.ExpectBegin()

		// Mock test run insert - with proper args matching
		runRows := pgxmock.NewRows([]string{"created_at"}).AddRow(nil)
		mock.ExpectQuery("INSERT INTO public.test_runs").
			WithArgs(
				pgxmock.AnyArg(), // id
				"user-123",       // uploaded_by
				"main",           // branch
				"",               // commit_sha
				int32(5),         // total_tests
				int32(5),         // passed_tests
				int32(0),         // failed_tests
				int32(0),         // skipped_tests
				int32(0),         // pending_tests
				int64(500),       // total_duration_ms
				pgxmock.AnyArg(), // environment JSON
			).
			WillReturnRows(runRows)

		// Mock 5 test case inserts - with proper args matching
		testCases := make([]*proto.TestCase, 5)
		for i := 0; i < 5; i++ {
			testCases[i] = &proto.TestCase{
				Name:       "test",
				Suite:      "suite",
				Status:     "passed",
				DurationMs: 100,
			}
			mock.ExpectExec("INSERT INTO public.test_cases").
				WithArgs(
					pgxmock.AnyArg(), // id
					pgxmock.AnyArg(), // test_run_id
					"test",           // name
					"suite",          // suite
					"passed",         // status
					int64(100),       // duration_ms
					pgxmock.AnyArg(), // error_message
					pgxmock.AnyArg(), // stack_trace
				).
				WillReturnResult(pgxmock.NewResult("INSERT", 1))
		}

		mock.ExpectCommit()

		req := &proto.UploadTestResultsRequest{
			Branch: "main",
			Summary: &proto.TestSummary{
				Total:      5,
				Passed:     5,
				DurationMs: 500,
			},
			Tests: testCases,
		}

		resp, err := service.UploadTestResults(ctx, req)

		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if !resp.Success {
			t.Error("Expected success to be true")
		}

		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("Unfulfilled expectations: %s", err)
		}
	})
}

func TestTestResultService_GetTestResults(t *testing.T) {
	logger, _ := zap.NewDevelopment()

	t.Run("Success - Get test results", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := contextWithUserID("user-123")

		// Mock test run query
		runRows := pgxmock.NewRows([]string{
			"id", "uploaded_by", "branch", "commit_sha",
			"total_tests", "passed_tests", "failed_tests", "skipped_tests", "pending_tests",
			"total_duration_ms", "environment", "created_at",
		}).AddRow(
			"run-123", "user-123", "main", "abc123",
			int32(2), int32(1), int32(1), int32(0), int32(0),
			int64(1000), []byte(`{"os":"linux"}`), nil,
		)

		mock.ExpectQuery("SELECT (.+) FROM public.test_runs WHERE id").
			WithArgs("run-123").
			WillReturnRows(runRows)

		// Mock test cases query
		testRows := pgxmock.NewRows([]string{
			"id", "name", "suite", "status", "duration_ms",
			"error_message", "stack_trace", "created_at",
		}).
			AddRow("test-1", "test 1", "suite 1", "passed", int64(500), nil, nil, nil).
			AddRow("test-2", "test 2", "suite 1", "failed", int64(500), nil, nil, nil)

		mock.ExpectQuery("SELECT (.+) FROM public.test_cases WHERE test_run_id").
			WithArgs("run-123").
			WillReturnRows(testRows)

		req := &proto.GetTestResultsRequest{ResultId: "run-123"}
		resp, err := service.GetTestResults(ctx, req)

		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if resp.Id != "run-123" {
			t.Errorf("Expected run ID 'run-123', got '%s'", resp.Id)
		}

		if resp.UploadedBy != "user-123" {
			t.Errorf("Expected uploaded_by 'user-123', got '%s'", resp.UploadedBy)
		}

		if len(resp.Tests) != 2 {
			t.Errorf("Expected 2 tests, got %d", len(resp.Tests))
		}

		if resp.Summary.Total != 2 {
			t.Errorf("Expected total 2, got %d", resp.Summary.Total)
		}

		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("Unfulfilled expectations: %s", err)
		}
	})

	t.Run("Error - Unauthenticated", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := context.Background() // No user_id

		req := &proto.GetTestResultsRequest{ResultId: "run-123"}
		_, err = service.GetTestResults(ctx, req)

		if err == nil {
			t.Fatal("Expected error, got nil")
		}

		st, ok := status.FromError(err)
		if !ok {
			t.Fatal("Expected gRPC status error")
		}

		if st.Code() != codes.Unauthenticated {
			t.Errorf("Expected Unauthenticated status, got %v", st.Code())
		}
	})

	t.Run("Error - Missing result ID", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := contextWithUserID("user-123")

		req := &proto.GetTestResultsRequest{ResultId: ""}
		_, err = service.GetTestResults(ctx, req)

		if err == nil {
			t.Fatal("Expected error, got nil")
		}

		st, ok := status.FromError(err)
		if !ok {
			t.Fatal("Expected gRPC status error")
		}

		if st.Code() != codes.InvalidArgument {
			t.Errorf("Expected InvalidArgument status, got %v", st.Code())
		}
	})

	t.Run("Error - Result not found", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := contextWithUserID("user-123")

		mock.ExpectQuery("SELECT (.+) FROM public.test_runs WHERE id").
			WithArgs("nonexistent").
			WillReturnError(sql.ErrNoRows)

		req := &proto.GetTestResultsRequest{ResultId: "nonexistent"}
		_, err = service.GetTestResults(ctx, req)

		if err == nil {
			t.Fatal("Expected error, got nil")
		}

		st, ok := status.FromError(err)
		if !ok {
			t.Fatal("Expected gRPC status error")
		}

		if st.Code() != codes.NotFound {
			t.Errorf("Expected NotFound status, got %v", st.Code())
		}
	})
}

func TestTestResultService_ListTestResults(t *testing.T) {
	logger, _ := zap.NewDevelopment()

	t.Run("Success - List test results with pagination", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := contextWithUserID("user-123")

		// Mock count query
		countRows := pgxmock.NewRows([]string{"count"}).AddRow(int32(2))
		mock.ExpectQuery("SELECT COUNT").
			WillReturnRows(countRows)

		// Mock list query
		listRows := pgxmock.NewRows([]string{
			"id", "uploaded_by", "branch", "commit_sha",
			"total_tests", "passed_tests", "failed_tests", "skipped_tests", "pending_tests",
			"total_duration_ms", "environment", "created_at",
		}).
			AddRow("run-1", "user-123", "main", "abc123", int32(10), int32(8), int32(2), int32(0), int32(0), int64(5000), []byte(`{}`), nil).
			AddRow("run-2", "user-123", "dev", "def456", int32(5), int32(5), int32(0), int32(0), int32(0), int64(2000), []byte(`{}`), nil)

		mock.ExpectQuery("SELECT (.+) FROM public.test_runs").
			WithArgs(int32(20), int32(0)).
			WillReturnRows(listRows)

		req := &proto.ListTestResultsRequest{
			Page:     1,
			PageSize: 20,
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

		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("Unfulfilled expectations: %s", err)
		}
	})

	t.Run("Error - Unauthenticated", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := context.Background() // No user_id

		req := &proto.ListTestResultsRequest{
			Page:     1,
			PageSize: 20,
		}

		_, err = service.ListTestResults(ctx, req)

		if err == nil {
			t.Fatal("Expected error, got nil")
		}

		st, ok := status.FromError(err)
		if !ok {
			t.Fatal("Expected gRPC status error")
		}

		if st.Code() != codes.Unauthenticated {
			t.Errorf("Expected Unauthenticated status, got %v", st.Code())
		}
	})

	t.Run("Success - List with branch filter", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := contextWithUserID("user-123")

		branch := "main"

		// Mock count query with filter
		countRows := pgxmock.NewRows([]string{"count"}).AddRow(int32(1))
		mock.ExpectQuery("SELECT COUNT(.+) FROM public.test_runs WHERE (.+) AND branch").
			WithArgs("main").
			WillReturnRows(countRows)

		// Mock list query with filter
		listRows := pgxmock.NewRows([]string{
			"id", "uploaded_by", "branch", "commit_sha",
			"total_tests", "passed_tests", "failed_tests", "skipped_tests", "pending_tests",
			"total_duration_ms", "environment", "created_at",
		}).AddRow("run-1", "user-123", "main", "abc123", int32(10), int32(8), int32(2), int32(0), int32(0), int64(5000), []byte(`{}`), nil)

		mock.ExpectQuery("SELECT (.+) FROM public.test_runs WHERE (.+) AND branch").
			WithArgs("main", int32(20), int32(0)).
			WillReturnRows(listRows)

		req := &proto.ListTestResultsRequest{
			Page:     1,
			PageSize: 20,
			Branch:   &branch,
		}

		resp, err := service.ListTestResults(ctx, req)

		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if len(resp.Results) != 1 {
			t.Errorf("Expected 1 result, got %d", len(resp.Results))
		}

		if resp.Results[0].Branch != "main" {
			t.Errorf("Expected branch 'main', got '%s'", resp.Results[0].Branch)
		}

		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("Unfulfilled expectations: %s", err)
		}
	})
}

func TestTestResultService_GetTestStatistics(t *testing.T) {
	logger, _ := zap.NewDevelopment()

	t.Run("Success - Get test statistics", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := contextWithUserID("user-123")

		// Mock statistics query
		statsRows := pgxmock.NewRows([]string{
			"total_runs", "total_tests", "total_passed", "total_failed", "total_skipped", "avg_duration", "first_run", "last_run",
		}).AddRow(int32(10), int64(100), int64(80), int64(15), int64(5), float64(3000), nil, nil)

		mock.ExpectQuery("SELECT (.+) as total_runs").
			WillReturnRows(statsRows)

		req := &proto.GetTestStatisticsRequest{}

		resp, err := service.GetTestStatistics(ctx, req)

		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if resp.TotalRuns != 10 {
			t.Errorf("Expected 10 total runs, got %d", resp.TotalRuns)
		}

		if resp.TotalTests != 100 {
			t.Errorf("Expected 100 total tests, got %d", resp.TotalTests)
		}

		if resp.PassRate == 0 {
			t.Error("Expected pass rate to be calculated")
		}

		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("Unfulfilled expectations: %s", err)
		}
	})

	t.Run("Error - Unauthenticated", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		if err != nil {
			t.Fatal(err)
		}
		defer mock.Close()

		service := NewTestResultService(mock, logger)
		ctx := context.Background() // No user_id

		req := &proto.GetTestStatisticsRequest{}

		_, err = service.GetTestStatistics(ctx, req)

		if err == nil {
			t.Fatal("Expected error, got nil")
		}

		st, ok := status.FromError(err)
		if !ok {
			t.Fatal("Expected gRPC status error")
		}

		if st.Code() != codes.Unauthenticated {
			t.Errorf("Expected Unauthenticated status, got %v", st.Code())
		}
	})
}

package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/database"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// CtrfUploadResult is returned when uploading a CTRF report
type CtrfUploadResult struct {
	ID        string `json:"id"`
	ReportID  string `json:"report_id"`
	Message   string `json:"message"`
}

// CtrfUpsertResult is returned when upserting a CTRF report by run ID
type CtrfUpsertResult struct {
	ID                 string `json:"id"`
	TestRunID          string `json:"test_run_id"`
	JobCompletionIndex int    `json:"job_completion_index"`
	JobStatus          string `json:"job_status"`
	Message            string `json:"message"`
}

// CtrfReportSummary is a summary view of a CTRF report for listing
type CtrfReportSummary struct {
	ID          string     `json:"id"`
	ReportID    *string    `json:"report_id"`
	Timestamp   time.Time  `json:"timestamp"`
	GeneratedBy *string    `json:"generated_by"`
	CreatedAt   time.Time  `json:"created_at"`
	Tests       *int       `json:"tests"`
	Passed      *int       `json:"passed"`
	Failed      *int       `json:"failed"`
	Skipped     *int       `json:"skipped"`
	Duration    *int       `json:"duration_ms"`
	Branch      *string    `json:"branch"`
	Commit      *string    `json:"commit"`
}

// CtrfReportList is a paginated list of CTRF reports
type CtrfReportList struct {
	Reports    []CtrfReportSummary `json:"reports"`
	TotalCount int                 `json:"total_count"`
	Page       int                 `json:"page"`
	PageSize   int                 `json:"page_size"`
}

// CtrfStatistics contains aggregated CTRF test statistics
type CtrfStatistics struct {
	TotalRuns   int     `json:"total_runs"`
	TotalTests  int     `json:"total_tests"`
	PassedTests int     `json:"passed_tests"`
	FailedTests int     `json:"failed_tests"`
	PassRate    float64 `json:"pass_rate"`
	AvgDuration int     `json:"avg_duration_ms"`
}

// TestResultService implements the gRPC TestResultService
type TestResultService struct {
	proto.UnimplementedTestResultServiceServer
	db     database.Executor
	logger *zap.Logger
}

// NewTestResultService creates a new TestResultService
func NewTestResultService(db database.Executor, logger *zap.Logger) *TestResultService {
	return &TestResultService{
		db:     db,
		logger: logger,
	}
}

// UploadTestResults uploads test execution results
func (s *TestResultService) UploadTestResults(ctx context.Context, req *proto.UploadTestResultsRequest) (*proto.UploadTestResultsResponse, error) {
	// Get user ID from context (set by auth middleware)
	userID, ok := ctx.Value(models.UserIDKey).(string)
	if !ok {
		s.logger.Error("User ID not found in context")
		return nil, status.Error(codes.Unauthenticated, "User not authenticated")
	}

	s.logger.Info("Uploading test results",
		zap.String("user_id", userID),
		zap.String("branch", req.Branch),
	)

	// Start transaction
	tx, err := s.db.Begin(ctx)
	if err != nil {
		s.logger.Error("Failed to begin transaction", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to upload test results")
	}
	defer tx.Rollback(ctx)

	// Create test run
	runID := uuid.New().String()
	var createdAt time.Time

	environmentJSON, _ := json.Marshal(req.Environment)

	query := `
		INSERT INTO public.test_runs (
			id, uploaded_by, branch, commit_sha,
			total_tests, passed_tests, failed_tests, skipped_tests, pending_tests,
			total_duration_ms, environment, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
		RETURNING created_at
	`

	err = tx.QueryRow(ctx, query,
		runID,
		userID,
		req.Branch,
		req.CommitSha,
		req.Summary.Total,
		req.Summary.Passed,
		req.Summary.Failed,
		req.Summary.Skipped,
		req.Summary.Pending,
		req.Summary.DurationMs,
		environmentJSON,
	).Scan(&createdAt)

	if err != nil {
		s.logger.Error("Failed to insert test run", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to upload test results")
	}

	// Insert test cases in batch
	if len(req.Tests) > 0 {
		testQuery := `
			INSERT INTO public.test_cases (
				id, test_run_id, name, suite, status, duration_ms,
				error_message, stack_trace, created_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
		`

		for _, test := range req.Tests {
			testID := uuid.New().String()
			_, err := tx.Exec(ctx, testQuery,
				testID,
				runID,
				test.Name,
				test.Suite,
				test.Status,
				test.DurationMs,
				test.ErrorMessage,
				test.StackTrace,
			)
			if err != nil {
				s.logger.Error("Failed to insert test case", zap.Error(err), zap.String("test_name", test.Name))
				// Continue with other tests instead of failing the entire upload
			}
		}
	}

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		s.logger.Error("Failed to commit transaction", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to upload test results")
	}

	return &proto.UploadTestResultsResponse{
		ResultId: runID,
		Success:  true,
		Message:  fmt.Sprintf("Uploaded %d test cases successfully", len(req.Tests)),
	}, nil
}

// GetTestResults retrieves test results by run ID
func (s *TestResultService) GetTestResults(ctx context.Context, req *proto.GetTestResultsRequest) (*proto.TestResultsResponse, error) {
	// Get user ID from context
	userID, ok := ctx.Value(models.UserIDKey).(string)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "User not authenticated")
	}

	s.logger.Info("Getting test results", zap.String("result_id", req.ResultId), zap.String("user_id", userID))

	if req.ResultId == "" {
		return nil, status.Error(codes.InvalidArgument, "result_id is required")
	}

	// Get test run
	query := `
		SELECT id, uploaded_by, branch, commit_sha,
			   total_tests, passed_tests, failed_tests, skipped_tests, pending_tests,
			   total_duration_ms, environment, created_at
		FROM public.test_runs
		WHERE id = $1
	`

	var (
		id              string
		uploadedBy      string
		branch          sql.NullString
		commitSha       sql.NullString
		totalTests      int32
		passedTests     int32
		failedTests     int32
		skippedTests    int32
		pendingTests    int32
		totalDurationMs int64
		environmentJSON []byte
		createdAt       time.Time
	)

	err := s.db.QueryRow(ctx, query, req.ResultId).Scan(
		&id, &uploadedBy, &branch, &commitSha,
		&totalTests, &passedTests, &failedTests, &skippedTests, &pendingTests,
		&totalDurationMs, &environmentJSON, &createdAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, status.Error(codes.NotFound, "test run not found")
		}
		s.logger.Error("Failed to query test run", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to retrieve test results")
	}

	var environment map[string]string
	if len(environmentJSON) > 0 {
		json.Unmarshal(environmentJSON, &environment)
	}

	// Get test cases
	testsQuery := `
		SELECT id, name, suite, status, duration_ms,
			   error_message, stack_trace, created_at
		FROM public.test_cases
		WHERE test_run_id = $1
		ORDER BY created_at
	`

	rows, err := s.db.Query(ctx, testsQuery, req.ResultId)
	if err != nil {
		s.logger.Error("Failed to query test cases", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to retrieve test cases")
	}
	defer rows.Close()

	tests := make([]*proto.TestCase, 0)
	for rows.Next() {
		var (
			testID       string
			name         string
			suite        string
			status       string
			durationMs   int64
			errorMessage sql.NullString
			stackTrace   sql.NullString
			testCreated  time.Time
		)

		err := rows.Scan(&testID, &name, &suite, &status, &durationMs,
			&errorMessage, &stackTrace, &testCreated)
		if err != nil {
			s.logger.Error("Failed to scan test case row", zap.Error(err))
			continue
		}

		var errorMsgPtr *string
		if errorMessage.Valid {
			errorMsgPtr = &errorMessage.String
		}

		var stackTracePtr *string
		if stackTrace.Valid {
			stackTracePtr = &stackTrace.String
		}

		test := &proto.TestCase{
			Name:         name,
			Suite:        suite,
			Status:       status,
			DurationMs:   durationMs,
			ErrorMessage: errorMsgPtr,
			StackTrace:   stackTracePtr,
		}

		tests = append(tests, test)
	}

	response := &proto.TestResultsResponse{
		Id:         id,
		UploadedBy: uploadedBy,
		Branch:     branch.String,
		CommitSha:  commitSha.String,
		Summary: &proto.TestSummary{
			Total:      totalTests,
			Passed:     passedTests,
			Failed:     failedTests,
			Skipped:    skippedTests,
			Pending:    pendingTests,
			DurationMs: totalDurationMs,
		},
		Tests:       tests,
		Environment: environment,
		CreatedAt:   timestamppb.New(createdAt),
	}

	return response, nil
}

// ListTestResults lists test results for a project with pagination
func (s *TestResultService) ListTestResults(ctx context.Context, req *proto.ListTestResultsRequest) (*proto.ListTestResultsResponse, error) {
	// Get user ID from context
	userID, ok := ctx.Value(models.UserIDKey).(string)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "User not authenticated")
	}

	s.logger.Info("Listing test results",
		zap.String("user_id", userID),
		zap.Int32("page", req.Page),
		zap.Int32("page_size", req.PageSize),
	)

	// Set defaults
	page := req.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize

	// Build query with filters
	query := `
		SELECT id, uploaded_by, branch, commit_sha,
			   total_tests, passed_tests, failed_tests, skipped_tests, pending_tests,
			   total_duration_ms, environment, created_at
		FROM public.test_runs
		WHERE 1=1
	`
	countQuery := `SELECT COUNT(*) FROM public.test_runs WHERE 1=1`
	args := []interface{}{}
	argPos := 1

	if req.Branch != nil && *req.Branch != "" {
		branchClause := fmt.Sprintf(" AND branch = $%d", argPos)
		query += branchClause
		countQuery += branchClause
		args = append(args, *req.Branch)
		argPos++
	}

	if req.StartDate != nil {
		dateClause := fmt.Sprintf(" AND created_at >= $%d", argPos)
		query += dateClause
		countQuery += dateClause
		args = append(args, req.StartDate.AsTime())
		argPos++
	}

	if req.EndDate != nil {
		dateClause := fmt.Sprintf(" AND created_at <= $%d", argPos)
		query += dateClause
		countQuery += dateClause
		args = append(args, req.EndDate.AsTime())
		argPos++
	}

	// Get total count
	var totalCount int32
	err := s.db.QueryRow(ctx, countQuery, args...).Scan(&totalCount)
	if err != nil {
		s.logger.Error("Failed to count test runs", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to count test runs")
	}

	// Add pagination
	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", argPos, argPos+1)
	args = append(args, pageSize, offset)

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		s.logger.Error("Failed to query test runs", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to list test results")
	}
	defer rows.Close()

	results := make([]*proto.TestResultsResponse, 0)
	for rows.Next() {
		var (
			id              string
			uploadedBy      string
			branch          sql.NullString
			commitSha       sql.NullString
			totalTests      int32
			passedTests     int32
			failedTests     int32
			skippedTests    int32
			pendingTests    int32
			totalDurationMs int64
			environmentJSON []byte
			createdAt       time.Time
		)

		err := rows.Scan(&id, &uploadedBy, &branch, &commitSha,
			&totalTests, &passedTests, &failedTests, &skippedTests, &pendingTests,
			&totalDurationMs, &environmentJSON, &createdAt)
		if err != nil {
			s.logger.Error("Failed to scan test run row", zap.Error(err))
			continue
		}

		var environment map[string]string
		if len(environmentJSON) > 0 {
			json.Unmarshal(environmentJSON, &environment)
		}

		result := &proto.TestResultsResponse{
			Id:         id,
			UploadedBy: uploadedBy,
			Branch:     branch.String,
			CommitSha:  commitSha.String,
			Summary: &proto.TestSummary{
				Total:      totalTests,
				Passed:     passedTests,
				Failed:     failedTests,
				Skipped:    skippedTests,
				Pending:    pendingTests,
				DurationMs: totalDurationMs,
			},
			Tests:       []*proto.TestCase{}, // Don't load test cases for list view
			Environment: environment,
			CreatedAt:   timestamppb.New(createdAt),
		}

		results = append(results, result)
	}

	return &proto.ListTestResultsResponse{
		Results:    results,
		TotalCount: totalCount,
		Page:       page,
		PageSize:   pageSize,
	}, nil
}

// GetTestStatistics retrieves aggregated test statistics
func (s *TestResultService) GetTestStatistics(ctx context.Context, req *proto.GetTestStatisticsRequest) (*proto.TestStatisticsResponse, error) {
	// Get user ID from context
	userID, ok := ctx.Value(models.UserIDKey).(string)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "User not authenticated")
	}

	s.logger.Info("Getting test statistics",
		zap.String("user_id", userID),
	)

	// Build query with filters
	query := `
		SELECT
			COUNT(*) as total_runs,
			SUM(total_tests) as total_tests,
			SUM(passed_tests) as total_passed,
			SUM(failed_tests) as total_failed,
			SUM(skipped_tests) as total_skipped,
			AVG(total_duration_ms) as avg_duration,
			MIN(created_at) as first_run,
			MAX(created_at) as last_run
		FROM public.test_runs
		WHERE 1=1
	`
	args := []interface{}{}
	argPos := 1

	if req.Branch != nil && *req.Branch != "" {
		query += fmt.Sprintf(" AND branch = $%d", argPos)
		args = append(args, *req.Branch)
		argPos++
	}

	if req.Days != nil && *req.Days > 0 {
		query += fmt.Sprintf(" AND created_at >= NOW() - INTERVAL '%d days'", *req.Days)
	}

	var (
		totalRuns    int32
		totalTests   sql.NullInt64
		totalPassed  sql.NullInt64
		totalFailed  sql.NullInt64
		totalSkipped sql.NullInt64
		avgDuration  sql.NullFloat64
		firstRun     sql.NullTime
		lastRun      sql.NullTime
	)

	err := s.db.QueryRow(ctx, query, args...).Scan(
		&totalRuns, &totalTests, &totalPassed, &totalFailed, &totalSkipped,
		&avgDuration, &firstRun, &lastRun,
	)

	if err != nil {
		s.logger.Error("Failed to query test statistics", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to retrieve test statistics")
	}

	response := &proto.TestStatisticsResponse{
		TotalRuns:     totalRuns,
		TotalTests:    int32(totalTests.Int64),
		AvgDurationMs: int64(avgDuration.Float64),
		DailyStats:    []*proto.DailyStats{}, // Placeholder
		FlakyTests:    []string{},            // Placeholder
	}

	// Calculate pass rate as percentage
	if totalTests.Int64 > 0 {
		response.PassRate = (float64(totalPassed.Int64) / float64(totalTests.Int64)) * 100.0
	}

	return response, nil
}

// StreamTestResults streams test results in real-time (placeholder implementation)
func (s *TestResultService) StreamTestResults(req *proto.StreamTestResultsRequest, stream proto.TestResultService_StreamTestResultsServer) error {
	// Get user ID from context
	ctx := stream.Context()
	userID, ok := ctx.Value(models.UserIDKey).(string)
	if !ok {
		return status.Error(codes.Unauthenticated, "User not authenticated")
	}

	s.logger.Info("Streaming test results", zap.String("user_id", userID))

	// This is a simplified implementation
	// In a real-world scenario, you'd use pub/sub or polling to get real-time updates

	// Query recent test results
	query := `
		SELECT id, uploaded_by, branch, commit_sha,
			   total_tests, passed_tests, failed_tests, skipped_tests, pending_tests,
			   total_duration_ms, created_at
		FROM public.test_runs
		ORDER BY created_at DESC
		LIMIT 10
	`

	rows, err := s.db.Query(ctx, query)
	if err != nil {
		s.logger.Error("Failed to query test runs for streaming", zap.Error(err))
		return status.Error(codes.Internal, "failed to stream test results")
	}
	defer rows.Close()

	for rows.Next() {
		var (
			id              string
			uploadedBy      string
			branch          sql.NullString
			commitSha       sql.NullString
			totalTests      int32
			passedTests     int32
			failedTests     int32
			skippedTests    int32
			pendingTests    int32
			totalDurationMs int64
			createdAt       time.Time
		)

		err := rows.Scan(&id, &uploadedBy, &branch, &commitSha,
			&totalTests, &passedTests, &failedTests, &skippedTests, &pendingTests,
			&totalDurationMs, &createdAt)
		if err != nil {
			s.logger.Error("Failed to scan test run row", zap.Error(err))
			continue
		}

		result := &proto.TestResultsResponse{
			Id:         id,
			UploadedBy: uploadedBy,
			Branch:     branch.String,
			CommitSha:  commitSha.String,
			Summary: &proto.TestSummary{
				Total:      totalTests,
				Passed:     passedTests,
				Failed:     failedTests,
				Skipped:    skippedTests,
				Pending:    pendingTests,
				DurationMs: totalDurationMs,
			},
			Tests:     []*proto.TestCase{},
			CreatedAt: timestamppb.New(createdAt),
		}

		if err := stream.Send(result); err != nil {
			s.logger.Error("Failed to send test result", zap.Error(err))
			return err
		}
	}

	return nil
}

// UploadCtrfReport uploads a CTRF test report
func (s *TestResultService) UploadCtrfReport(ctx context.Context, report *models.CtrfSchemaJson, userID string) (*CtrfUploadResult, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		s.logger.Error("Failed to start transaction", zap.Error(err))
		return nil, fmt.Errorf("failed to upload test results")
	}
	defer tx.Rollback(ctx)

	reportID := uuid.New()
	timestamp := time.Now()
	if report.Timestamp != nil {
		timestamp = *report.Timestamp
	}

	result, err := s.insertCtrfReport(ctx, tx, reportID, report, timestamp, nil, 0)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		s.logger.Error("Failed to commit transaction", zap.Error(err))
		return nil, fmt.Errorf("failed to upload test results")
	}

	s.logger.Info("CTRF test results uploaded",
		zap.String("reportId", reportID.String()),
		zap.String("uploadedBy", userID),
		zap.Int("totalTests", report.Results.Summary.Tests))

	return result, nil
}

// UpsertCtrfReportByRunID upserts a CTRF report, aggregating by test_run_id
func (s *TestResultService) UpsertCtrfReportByRunID(ctx context.Context, report *models.CtrfSchemaJson, testRunID string, jobCompletionIndex int, userID string) (*CtrfUpsertResult, error) {
	testRunUUID, err := uuid.Parse(testRunID)
	if err != nil {
		return nil, fmt.Errorf("invalid test_run_id format")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		s.logger.Error("Failed to start transaction", zap.Error(err))
		return nil, fmt.Errorf("failed to upload test results")
	}
	defer tx.Rollback(ctx)

	// Check if report exists for this test_run_id
	var existingReportID uuid.UUID
	err = tx.QueryRow(ctx,
		`SELECT id FROM public.ctrf_reports WHERE test_run_id = $1 LIMIT 1`,
		testRunUUID).Scan(&existingReportID)

	var reportID uuid.UUID
	timestamp := time.Now()
	if report.Timestamp != nil {
		timestamp = *report.Timestamp
	}

	if err == pgx.ErrNoRows {
		// First report for this test run
		uploadResult, err := s.insertCtrfReport(ctx, tx, uuid.New(), report, timestamp, &testRunUUID, jobCompletionIndex)
		if err != nil {
			return nil, err
		}
		reportID, _ = uuid.Parse(uploadResult.ID)
	} else if err != nil {
		s.logger.Error("Failed to check existing report", zap.Error(err))
		return nil, fmt.Errorf("failed to upload test results")
	} else {
		// Report exists - update summary and add tests
		reportID = existingReportID
		if err := s.updateCtrfSummary(ctx, tx, reportID, report.Results.Summary); err != nil {
			return nil, err
		}
		if err := s.insertCtrfTests(ctx, tx, reportID, report.Results.Tests, timestamp); err != nil {
			return nil, err
		}
	}

	// Update test_jobs status
	jobStatus := "succeeded"
	if report.Results.Summary.Failed > 0 {
		jobStatus = "failed"
	}
	s.updateTestJobStatus(ctx, tx, testRunUUID, jobCompletionIndex, reportID, jobStatus)

	if err := tx.Commit(ctx); err != nil {
		s.logger.Error("Failed to commit transaction", zap.Error(err))
		return nil, fmt.Errorf("failed to upload test results")
	}

	s.logger.Info("CTRF test results upserted",
		zap.String("reportId", reportID.String()),
		zap.String("testRunId", testRunID),
		zap.Int("jobCompletionIndex", jobCompletionIndex),
		zap.String("uploadedBy", userID),
		zap.Int("testsInBatch", report.Results.Summary.Tests))

	return &CtrfUpsertResult{
		ID:                 reportID.String(),
		TestRunID:          testRunID,
		JobCompletionIndex: jobCompletionIndex,
		JobStatus:          jobStatus,
		Message:            "Test results uploaded successfully",
	}, nil
}

// GetCtrfReport retrieves a CTRF report by ID
func (s *TestResultService) GetCtrfReport(ctx context.Context, reportIDStr string) (*models.CtrfSchemaJson, error) {
	reportID, err := uuid.Parse(reportIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid report ID")
	}

	var report models.CtrfSchemaJson
	var extraJSON []byte
	var timestamp time.Time
	var reportUUIDStr, generatedBy *string

	err = s.db.QueryRow(ctx,
		`SELECT report_format, spec_version, report_id, timestamp, generated_by, extra
		 FROM public.ctrf_reports WHERE id = $1`,
		reportID).Scan(&report.ReportFormat, &report.SpecVersion, &reportUUIDStr,
		&timestamp, &generatedBy, &extraJSON)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("test report not found")
		}
		s.logger.Error("Failed to query CTRF report", zap.Error(err))
		return nil, fmt.Errorf("failed to retrieve test results")
	}

	report.Timestamp = &timestamp
	report.ReportId = reportUUIDStr
	report.GeneratedBy = generatedBy
	if len(extraJSON) > 0 {
		json.Unmarshal(extraJSON, &report.Extra)
	}

	// Get tool, summary, environment, tests
	s.loadCtrfReportDetails(ctx, reportID, &report)

	return &report, nil
}

// ListCtrfReports lists CTRF reports with pagination
func (s *TestResultService) ListCtrfReports(ctx context.Context, page, pageSize int) (*CtrfReportList, error) {
	if pageSize > 100 {
		pageSize = 100
	}
	offset := (page - 1) * pageSize

	rows, err := s.db.Query(ctx,
		`SELECT r.id, r.report_id, r.timestamp, r.generated_by, r.created_at,
		        s.tests, s.passed, s.failed, s.skipped, s.duration,
		        e.branch_name, e.commit
		 FROM public.ctrf_reports r
		 LEFT JOIN public.ctrf_summaries s ON r.id = s.report_id
		 LEFT JOIN public.ctrf_environments e ON r.id = e.report_id
		 ORDER BY r.timestamp DESC
		 LIMIT $1 OFFSET $2`,
		pageSize, offset)

	if err != nil {
		s.logger.Error("Failed to query CTRF reports", zap.Error(err))
		return nil, fmt.Errorf("failed to list test results")
	}
	defer rows.Close()

	reports := []CtrfReportSummary{}
	for rows.Next() {
		var report CtrfReportSummary
		err := rows.Scan(&report.ID, &report.ReportID, &report.Timestamp, &report.GeneratedBy,
			&report.CreatedAt, &report.Tests, &report.Passed, &report.Failed, &report.Skipped,
			&report.Duration, &report.Branch, &report.Commit)
		if err != nil {
			s.logger.Error("Failed to scan CTRF report summary", zap.Error(err))
			continue
		}
		reports = append(reports, report)
	}

	var totalCount int
	err = s.db.QueryRow(ctx, `SELECT COUNT(*) FROM public.ctrf_reports`).Scan(&totalCount)
	if err != nil {
		s.logger.Error("Failed to count CTRF reports", zap.Error(err))
		totalCount = len(reports)
	}

	return &CtrfReportList{
		Reports:    reports,
		TotalCount: totalCount,
		Page:       page,
		PageSize:   pageSize,
	}, nil
}

// GetCtrfStatistics retrieves aggregated CTRF statistics
func (s *TestResultService) GetCtrfStatistics(ctx context.Context) (*CtrfStatistics, error) {
	var stats CtrfStatistics

	err := s.db.QueryRow(ctx,
		`SELECT COUNT(*) as total_runs,
		        COALESCE(SUM(tests), 0) as total_tests,
		        COALESCE(SUM(passed), 0) as passed_tests,
		        COALESCE(SUM(failed), 0) as failed_tests,
		        COALESCE(AVG(duration), 0) as avg_duration
		 FROM public.ctrf_summaries`).Scan(&stats.TotalRuns, &stats.TotalTests,
		&stats.PassedTests, &stats.FailedTests, &stats.AvgDuration)

	if err != nil {
		s.logger.Error("Failed to query CTRF statistics", zap.Error(err))
		return nil, fmt.Errorf("failed to retrieve test statistics")
	}

	if stats.TotalTests > 0 {
		stats.PassRate = (float64(stats.PassedTests) / float64(stats.TotalTests)) * 100.0
	}

	return &stats, nil
}

// Helper methods for CTRF operations

func (s *TestResultService) insertCtrfReport(ctx context.Context, tx pgx.Tx, reportID uuid.UUID, report *models.CtrfSchemaJson, timestamp time.Time, testRunID *uuid.UUID, jobCompletionIndex int) (*CtrfUploadResult, error) {
	var extraJSON, toolExtraJSON, summaryExtraJSON, envExtraJSON []byte
	if report.Extra != nil {
		extraJSON, _ = json.Marshal(report.Extra)
	}
	if report.Results.Tool.Extra != nil {
		toolExtraJSON, _ = json.Marshal(report.Results.Tool.Extra)
	}
	if report.Results.Summary.Extra != nil {
		summaryExtraJSON, _ = json.Marshal(report.Results.Summary.Extra)
	}
	if report.Results.Environment != nil && report.Results.Environment.Extra != nil {
		envExtraJSON, _ = json.Marshal(report.Results.Environment.Extra)
	}

	reportUUID := reportID
	if report.ReportId != nil {
		if parsed, err := uuid.Parse(*report.ReportId); err == nil {
			reportUUID = parsed
		}
	}

	// Insert report
	var query string
	var args []interface{}
	if testRunID != nil {
		query = `INSERT INTO public.ctrf_reports 
			 (id, report_format, spec_version, report_id, timestamp, generated_by, extra, test_run_id, job_completion_index)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
		args = []interface{}{reportID, report.ReportFormat, report.SpecVersion, reportUUID, timestamp, report.GeneratedBy, extraJSON, testRunID, jobCompletionIndex}
	} else {
		query = `INSERT INTO public.ctrf_reports 
			 (id, report_format, spec_version, report_id, timestamp, generated_by, extra)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`
		args = []interface{}{reportID, report.ReportFormat, report.SpecVersion, reportUUID, timestamp, report.GeneratedBy, extraJSON}
	}

	if _, err := tx.Exec(ctx, query, args...); err != nil {
		s.logger.Error("Failed to insert CTRF report", zap.Error(err))
		return nil, fmt.Errorf("failed to upload test results")
	}

	// Insert tool
	if _, err := tx.Exec(ctx,
		`INSERT INTO public.ctrf_tools (report_id, name, version, extra)
		 VALUES ($1, $2, $3, $4)`,
		reportID, report.Results.Tool.Name, report.Results.Tool.Version, toolExtraJSON); err != nil {
		s.logger.Error("Failed to insert CTRF tool", zap.Error(err))
		return nil, fmt.Errorf("failed to upload test results")
	}

	// Insert summary
	summary := report.Results.Summary
	if _, err := tx.Exec(ctx,
		`INSERT INTO public.ctrf_summaries 
		 (report_id, tests, passed, failed, skipped, pending, other, flaky, suites, start, stop, duration, extra)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
		reportID, summary.Tests, summary.Passed, summary.Failed, summary.Skipped,
		summary.Pending, summary.Other, summary.Flaky, summary.Suites,
		summary.Start, summary.Stop, summary.Duration, summaryExtraJSON); err != nil {
		s.logger.Error("Failed to insert CTRF summary", zap.Error(err))
		return nil, fmt.Errorf("failed to upload test results")
	}

	// Insert environment
	if report.Results.Environment != nil {
		env := report.Results.Environment
		if _, err := tx.Exec(ctx,
			`INSERT INTO public.ctrf_environments 
			 (report_id, report_name, app_name, app_version, build_id, build_name, build_number, 
			  build_url, repository_name, repository_url, commit, branch_name, os_platform, 
			  os_release, os_version, test_environment, extra)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
			reportID, env.ReportName, env.AppName, env.AppVersion, env.BuildId, env.BuildName,
			env.BuildNumber, env.BuildUrl, env.RepositoryName, env.RepositoryUrl, env.Commit,
			env.BranchName, env.OsPlatform, env.OsRelease, env.OsVersion, env.TestEnvironment, envExtraJSON); err != nil {
			s.logger.Error("Failed to insert CTRF environment", zap.Error(err))
			return nil, fmt.Errorf("failed to upload test results")
		}
	}

	// Insert tests
	if err := s.insertCtrfTests(ctx, tx, reportID, report.Results.Tests, timestamp); err != nil {
		return nil, err
	}

	return &CtrfUploadResult{
		ID:       reportID.String(),
		ReportID: reportUUID.String(),
		Message:  "Test results uploaded successfully",
	}, nil
}

func (s *TestResultService) insertCtrfTests(ctx context.Context, tx pgx.Tx, reportID uuid.UUID, tests []models.CtrfSchemaJsonResultsTestsElem, timestamp time.Time) error {
	for _, test := range tests {
		testID := uuid.New()
		if test.Id != nil {
			if parsed, err := uuid.Parse(*test.Id); err == nil {
				testID = parsed
			}
		}

		var testExtraJSON []byte
		if test.Extra != nil {
			testExtraJSON, _ = json.Marshal(test.Extra)
		}

		_, err := tx.Exec(ctx,
			`INSERT INTO public.ctrf_tests 
			 (id, report_id, timestamp, test_id, name, status, duration, start_time, stop_time, 
			  suite, message, trace, snippet, ai, line, raw_status, tags, type, file_path, 
			  retries, flaky, browser, device, screenshot, extra)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
			uuid.New(), reportID, timestamp, testID, test.Name, string(test.Status), test.Duration,
			test.Start, test.Stop, test.Suite, test.Message, test.Trace, test.Snippet, test.Ai,
			test.Line, test.RawStatus, test.Tags, test.Type, test.FilePath, test.Retries,
			test.Flaky, test.Browser, test.Device, test.Screenshot, testExtraJSON)

		if err != nil {
			s.logger.Error("Failed to insert CTRF test", zap.Error(err), zap.String("testName", test.Name))
			// Continue with other tests
		}
	}
	return nil
}

func (s *TestResultService) updateCtrfSummary(ctx context.Context, tx pgx.Tx, reportID uuid.UUID, summary models.CtrfSchemaJsonResultsSummary) error {
	_, err := tx.Exec(ctx,
		`UPDATE public.ctrf_summaries 
		 SET tests = tests + $2,
		     passed = passed + $3,
		     failed = failed + $4,
		     skipped = skipped + $5,
		     pending = pending + $6,
		     other = other + $7,
		     flaky = COALESCE(flaky, 0) + COALESCE($8, 0),
		     stop = $9,
		     duration = COALESCE(duration, 0) + COALESCE($10, 0)
		 WHERE report_id = $1`,
		reportID, summary.Tests, summary.Passed, summary.Failed, summary.Skipped,
		summary.Pending, summary.Other, summary.Flaky, summary.Stop, summary.Duration)

	if err != nil {
		s.logger.Error("Failed to update CTRF summary", zap.Error(err))
		return fmt.Errorf("failed to upload test results")
	}
	return nil
}

func (s *TestResultService) updateTestJobStatus(ctx context.Context, tx pgx.Tx, testRunID uuid.UUID, jobCompletionIndex int, reportID uuid.UUID, jobStatus string) {
	result, err := tx.Exec(ctx,
		`UPDATE public.test_jobs
		 SET status = $1, 
		     ctrf_report_id = $2,
		     started_at = COALESCE(started_at, NOW()),
		     completed_at = NOW(),
		     duration_ms = EXTRACT(EPOCH FROM (NOW() - COALESCE(started_at, NOW()))) * 1000,
		     updated_at = NOW()
		 WHERE test_run_id = $3 AND job_index = $4`,
		jobStatus, reportID, testRunID, jobCompletionIndex)

	if err != nil {
		s.logger.Warn("Failed to update test_jobs status",
			zap.Error(err),
			zap.String("test_run_id", testRunID.String()),
			zap.Int("job_index", jobCompletionIndex))
	} else if result.RowsAffected() == 0 {
		s.logger.Warn("No test_jobs row was updated",
			zap.String("test_run_id", testRunID.String()),
			zap.Int("job_index", jobCompletionIndex))
	}
}

func (s *TestResultService) loadCtrfReportDetails(ctx context.Context, reportID uuid.UUID, report *models.CtrfSchemaJson) {
	// Get tool
	var tool models.CtrfSchemaJsonResultsTool
	var toolExtraJSON []byte
	err := s.db.QueryRow(ctx,
		`SELECT name, version, extra FROM public.ctrf_tools WHERE report_id = $1`,
		reportID).Scan(&tool.Name, &tool.Version, &toolExtraJSON)
	if err == nil {
		if len(toolExtraJSON) > 0 {
			json.Unmarshal(toolExtraJSON, &tool.Extra)
		}
		report.Results.Tool = tool
	}

	// Get summary
	var summary models.CtrfSchemaJsonResultsSummary
	var summaryExtraJSON []byte
	err = s.db.QueryRow(ctx,
		`SELECT tests, passed, failed, skipped, pending, other, flaky, suites, start, stop, duration, extra
		 FROM public.ctrf_summaries WHERE report_id = $1`,
		reportID).Scan(&summary.Tests, &summary.Passed, &summary.Failed, &summary.Skipped,
		&summary.Pending, &summary.Other, &summary.Flaky, &summary.Suites,
		&summary.Start, &summary.Stop, &summary.Duration, &summaryExtraJSON)
	if err == nil {
		if len(summaryExtraJSON) > 0 {
			json.Unmarshal(summaryExtraJSON, &summary.Extra)
		}
		report.Results.Summary = summary
	}

	// Get environment
	var env models.CtrfSchemaJsonResultsEnvironment
	var envExtraJSON []byte
	err = s.db.QueryRow(ctx,
		`SELECT report_name, app_name, app_version, build_id, build_name, build_number,
		        build_url, repository_name, repository_url, commit, branch_name, os_platform,
		        os_release, os_version, test_environment, extra
		 FROM public.ctrf_environments WHERE report_id = $1`,
		reportID).Scan(&env.ReportName, &env.AppName, &env.AppVersion, &env.BuildId,
		&env.BuildName, &env.BuildNumber, &env.BuildUrl, &env.RepositoryName,
		&env.RepositoryUrl, &env.Commit, &env.BranchName, &env.OsPlatform,
		&env.OsRelease, &env.OsVersion, &env.TestEnvironment, &envExtraJSON)
	if err == nil {
		if len(envExtraJSON) > 0 {
			json.Unmarshal(envExtraJSON, &env.Extra)
		}
		report.Results.Environment = &env
	}

	// Get tests
	rows, err := s.db.Query(ctx,
		`SELECT test_id, name, status, duration, start_time, stop_time, suite, message, trace,
		        snippet, ai, line, raw_status, tags, type, file_path, retries, flaky, browser,
		        device, screenshot, extra
		 FROM public.ctrf_tests WHERE report_id = $1 ORDER BY start_time`,
		reportID)
	if err != nil {
		return
	}
	defer rows.Close()

	tests := []models.CtrfSchemaJsonResultsTestsElem{}
	for rows.Next() {
		var test models.CtrfSchemaJsonResultsTestsElem
		var testIDStr *string
		var statusStr string
		var testExtraJSON []byte

		err := rows.Scan(&testIDStr, &test.Name, &statusStr, &test.Duration, &test.Start, &test.Stop,
			&test.Suite, &test.Message, &test.Trace, &test.Snippet, &test.Ai, &test.Line,
			&test.RawStatus, &test.Tags, &test.Type, &test.FilePath, &test.Retries, &test.Flaky,
			&test.Browser, &test.Device, &test.Screenshot, &testExtraJSON)
		if err != nil {
			continue
		}

		test.Id = testIDStr
		test.Status = models.CtrfSchemaJsonResultsTestsElemStatus(statusStr)
		if len(testExtraJSON) > 0 {
			json.Unmarshal(testExtraJSON, &test.Extra)
		}
		tests = append(tests, test)
	}
	report.Results.Tests = tests
}

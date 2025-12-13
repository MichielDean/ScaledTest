package handlers

import (
	"context"
	"encoding/json"
	"errors"

	"connectrpc.com/connect"
	pb "github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"go.uber.org/zap"
)

// TestResultServiceHandler implements the Connect TestResultService.
type TestResultServiceHandler struct {
	testResultService services.TestResultManager
	logger            *zap.Logger
}

// NewTestResultServiceHandler creates a new TestResultServiceHandler.
func NewTestResultServiceHandler(testResultService services.TestResultManager, logger *zap.Logger) *TestResultServiceHandler {
	return &TestResultServiceHandler{
		testResultService: testResultService,
		logger:            logger,
	}
}

// UploadTestResults uploads test results.
func (h *TestResultServiceHandler) UploadTestResults(
	ctx context.Context,
	req *connect.Request[pb.UploadTestResultsRequest],
) (*connect.Response[pb.UploadTestResultsResponse], error) {
	resp, err := h.testResultService.UploadTestResults(ctx, req.Msg)
	if err != nil {
		h.logger.Error("Failed to upload test results", zap.Error(err))
		return nil, mapGrpcErrorToConnect(err)
	}
	return connect.NewResponse(resp), nil
}

// UpsertTestResultsByRunID upserts test results by run ID.
// This endpoint is designed for K8s job pods to upload CTRF results.
// It uses UpsertCtrfReportByRunID which properly handles test_jobs table updates.
func (h *TestResultServiceHandler) UpsertTestResultsByRunID(
	ctx context.Context,
	req *connect.Request[pb.UpsertTestResultsByRunIDRequest],
) (*connect.Response[pb.UploadTestResultsResponse], error) {
	// Validate required fields
	if req.Msg.TestRunId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("test_run_id is required"))
	}

	// CTRF data is required for this endpoint
	if req.Msg.CtrfData == "" {
		h.logger.Error("No CTRF data provided",
			zap.String("test_run_id", req.Msg.TestRunId),
		)
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("ctrf_data is required"))
	}

	h.logger.Info("Parsing CTRF data from test runner",
		zap.String("test_run_id", req.Msg.TestRunId),
		zap.Int32("job_completion_index", req.Msg.JobCompletionIndex),
		zap.Int("ctrf_data_length", len(req.Msg.CtrfData)),
	)

	// Parse CTRF JSON into the proper model
	var ctrfReport models.CtrfSchemaJson
	if err := json.Unmarshal([]byte(req.Msg.CtrfData), &ctrfReport); err != nil {
		h.logger.Error("Failed to parse CTRF JSON",
			zap.String("test_run_id", req.Msg.TestRunId),
			zap.Error(err),
		)
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid CTRF data format"))
	}

	// Validate CTRF format
	if ctrfReport.ReportFormat != models.CtrfSchemaJsonReportFormatCTRF {
		h.logger.Error("Invalid CTRF report format",
			zap.String("test_run_id", req.Msg.TestRunId),
			zap.String("format", string(ctrfReport.ReportFormat)),
		)
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid reportFormat, must be 'CTRF'"))
	}

	// Get user ID from context (for job tokens, this will be "job-{job-name}")
	userID, _ := ctx.Value(models.UserIDKey).(string)

	// Call the proper service method that handles CTRF reports and test_jobs table
	result, err := h.testResultService.UpsertCtrfReportByRunID(
		ctx,
		&ctrfReport,
		req.Msg.TestRunId,
		int(req.Msg.JobCompletionIndex),
		userID,
	)
	if err != nil {
		h.logger.Error("Failed to upsert CTRF report",
			zap.String("test_run_id", req.Msg.TestRunId),
			zap.Error(err),
		)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to upload test results"))
	}

	h.logger.Info("CTRF report upserted successfully",
		zap.String("report_id", result.ID),
		zap.String("test_run_id", result.TestRunID),
		zap.Int("job_completion_index", result.JobCompletionIndex),
		zap.String("job_status", result.JobStatus),
	)

	return connect.NewResponse(&pb.UploadTestResultsResponse{
		ResultId: result.ID,
		Success:  true,
		Message:  result.Message,
	}), nil
}

// GetTestResults retrieves test results by ID.
func (h *TestResultServiceHandler) GetTestResults(
	ctx context.Context,
	req *connect.Request[pb.GetTestResultsRequest],
) (*connect.Response[pb.TestResultsResponse], error) {
	if req.Msg.ResultId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("result_id is required"))
	}

	resp, err := h.testResultService.GetTestResults(ctx, req.Msg)
	if err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}
	return connect.NewResponse(resp), nil
}

// ListTestResults lists test results.
func (h *TestResultServiceHandler) ListTestResults(
	ctx context.Context,
	req *connect.Request[pb.ListTestResultsRequest],
) (*connect.Response[pb.ListTestResultsResponse], error) {
	resp, err := h.testResultService.ListTestResults(ctx, req.Msg)
	if err != nil {
		h.logger.Error("Failed to list test results", zap.Error(err))
		return nil, mapGrpcErrorToConnect(err)
	}
	return connect.NewResponse(resp), nil
}

// GetTestStatistics retrieves test statistics.
func (h *TestResultServiceHandler) GetTestStatistics(
	ctx context.Context,
	req *connect.Request[pb.GetTestStatisticsRequest],
) (*connect.Response[pb.TestStatisticsResponse], error) {
	resp, err := h.testResultService.GetTestStatistics(ctx, req.Msg)
	if err != nil {
		h.logger.Error("Failed to get test statistics", zap.Error(err))
		return nil, mapGrpcErrorToConnect(err)
	}
	return connect.NewResponse(resp), nil
}

// StreamTestResults streams test results.
func (h *TestResultServiceHandler) StreamTestResults(
	ctx context.Context,
	req *connect.Request[pb.StreamTestResultsRequest],
	stream *connect.ServerStream[pb.TestResultsResponse],
) error {
	return connect.NewError(connect.CodeUnimplemented, errors.New("StreamTestResults not yet implemented for Connect"))
}

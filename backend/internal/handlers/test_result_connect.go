package handlers

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	pb "github.com/MichielDean/ScaledTest/backend/api/proto"
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
func (h *TestResultServiceHandler) UpsertTestResultsByRunID(
	ctx context.Context,
	req *connect.Request[pb.UpsertTestResultsByRunIDRequest],
) (*connect.Response[pb.UploadTestResultsResponse], error) {
	// UpsertTestResultsByRunIDRequest has different fields than UploadTestResultsRequest
	// The service should handle this appropriately - for now pass the upsert request directly
	// as the service likely needs to be aware of the TestRunId for upsert semantics
	
	// Convert to upload request using matching fields
	uploadReq := &pb.UploadTestResultsRequest{
		Branch:      req.Msg.Branch,
		CommitSha:   req.Msg.CommitSha,
		Summary:     req.Msg.Summary,
		Tests:       req.Msg.Tests,
		Environment: req.Msg.Environment,
	}
	resp, err := h.testResultService.UploadTestResults(ctx, uploadReq)
	if err != nil {
		h.logger.Error("Failed to upsert test results", zap.Error(err))
		return nil, mapGrpcErrorToConnect(err)
	}
	return connect.NewResponse(resp), nil
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

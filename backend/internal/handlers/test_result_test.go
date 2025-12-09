package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// MockTestResultManager implements services.TestResultManager for testing.
type MockTestResultManager struct {
	UploadTestResultsFunc        func(ctx context.Context, req *proto.UploadTestResultsRequest) (*proto.UploadTestResultsResponse, error)
	GetTestResultsFunc           func(ctx context.Context, req *proto.GetTestResultsRequest) (*proto.TestResultsResponse, error)
	ListTestResultsFunc          func(ctx context.Context, req *proto.ListTestResultsRequest) (*proto.ListTestResultsResponse, error)
	GetTestStatisticsFunc        func(ctx context.Context, req *proto.GetTestStatisticsRequest) (*proto.TestStatisticsResponse, error)
	StreamTestResultsFunc        func(req *proto.StreamTestResultsRequest, stream proto.TestResultService_StreamTestResultsServer) error
	UploadCtrfReportFunc         func(ctx context.Context, report *models.CtrfSchemaJson, userID string) (*services.CtrfUploadResult, error)
	UpsertCtrfReportByRunIDFunc  func(ctx context.Context, report *models.CtrfSchemaJson, testRunID string, jobCompletionIndex int, userID string) (*services.CtrfUpsertResult, error)
	GetCtrfReportFunc            func(ctx context.Context, reportID string) (*models.CtrfSchemaJson, error)
	ListCtrfReportsFunc          func(ctx context.Context, page, pageSize int) (*services.CtrfReportList, error)
	GetCtrfStatisticsFunc        func(ctx context.Context) (*services.CtrfStatistics, error)
}

func (m *MockTestResultManager) UploadTestResults(ctx context.Context, req *proto.UploadTestResultsRequest) (*proto.UploadTestResultsResponse, error) {
	if m.UploadTestResultsFunc != nil {
		return m.UploadTestResultsFunc(ctx, req)
	}
	return nil, errors.New("not implemented")
}

func (m *MockTestResultManager) GetTestResults(ctx context.Context, req *proto.GetTestResultsRequest) (*proto.TestResultsResponse, error) {
	if m.GetTestResultsFunc != nil {
		return m.GetTestResultsFunc(ctx, req)
	}
	return nil, errors.New("not implemented")
}

func (m *MockTestResultManager) ListTestResults(ctx context.Context, req *proto.ListTestResultsRequest) (*proto.ListTestResultsResponse, error) {
	if m.ListTestResultsFunc != nil {
		return m.ListTestResultsFunc(ctx, req)
	}
	return nil, errors.New("not implemented")
}

func (m *MockTestResultManager) GetTestStatistics(ctx context.Context, req *proto.GetTestStatisticsRequest) (*proto.TestStatisticsResponse, error) {
	if m.GetTestStatisticsFunc != nil {
		return m.GetTestStatisticsFunc(ctx, req)
	}
	return nil, errors.New("not implemented")
}

func (m *MockTestResultManager) StreamTestResults(req *proto.StreamTestResultsRequest, stream proto.TestResultService_StreamTestResultsServer) error {
	if m.StreamTestResultsFunc != nil {
		return m.StreamTestResultsFunc(req, stream)
	}
	return errors.New("not implemented")
}

func (m *MockTestResultManager) UploadCtrfReport(ctx context.Context, report *models.CtrfSchemaJson, userID string) (*services.CtrfUploadResult, error) {
	if m.UploadCtrfReportFunc != nil {
		return m.UploadCtrfReportFunc(ctx, report, userID)
	}
	return nil, errors.New("not implemented")
}

func (m *MockTestResultManager) UpsertCtrfReportByRunID(ctx context.Context, report *models.CtrfSchemaJson, testRunID string, jobCompletionIndex int, userID string) (*services.CtrfUpsertResult, error) {
	if m.UpsertCtrfReportByRunIDFunc != nil {
		return m.UpsertCtrfReportByRunIDFunc(ctx, report, testRunID, jobCompletionIndex, userID)
	}
	return nil, errors.New("not implemented")
}

func (m *MockTestResultManager) GetCtrfReport(ctx context.Context, reportID string) (*models.CtrfSchemaJson, error) {
	if m.GetCtrfReportFunc != nil {
		return m.GetCtrfReportFunc(ctx, reportID)
	}
	return nil, errors.New("not implemented")
}

func (m *MockTestResultManager) ListCtrfReports(ctx context.Context, page, pageSize int) (*services.CtrfReportList, error) {
	if m.ListCtrfReportsFunc != nil {
		return m.ListCtrfReportsFunc(ctx, page, pageSize)
	}
	return nil, errors.New("not implemented")
}

func (m *MockTestResultManager) GetCtrfStatistics(ctx context.Context) (*services.CtrfStatistics, error) {
	if m.GetCtrfStatisticsFunc != nil {
		return m.GetCtrfStatisticsFunc(ctx)
	}
	return nil, errors.New("not implemented")
}

func TestTestResultHandler_UpsertTestResultsByRunID(t *testing.T) {
	logger := zap.NewNop()
	testRunID := uuid.New()

	t.Run("Success - First completion creates new report", func(t *testing.T) {
		mockService := &MockTestResultManager{
			UpsertCtrfReportByRunIDFunc: func(ctx context.Context, report *models.CtrfSchemaJson, runID string, idx int, userID string) (*services.CtrfUpsertResult, error) {
				return &services.CtrfUpsertResult{
					ID:                 uuid.New().String(),
					TestRunID:          runID,
					JobCompletionIndex: idx,
					JobStatus:          "created",
					Message:            "Report created",
				}, nil
			},
		}

		handler := NewTestResultHandler(mockService, logger)
		app := fiber.New()
		app.Post("/test-results/upsert", func(c *fiber.Ctx) error {
			c.Locals("user_id", "user-123")
			return handler.UpsertTestResultsByRunID(c)
		})

		now := time.Now()
		ctrfReport := models.CtrfSchemaJson{
			ReportFormat: models.CtrfSchemaJsonReportFormatCTRF,
			SpecVersion:  "0.0.0",
			Timestamp:    &now,
			GeneratedBy:  ptrString("test-runner"),
			Extra: map[string]interface{}{
				"testRunId":          testRunID.String(),
				"jobCompletionIndex": "0",
			},
			Results: models.CtrfSchemaJsonResults{
				Tool: models.CtrfSchemaJsonResultsTool{
					Name:    "playwright",
					Version: ptrString("1.56.1"),
				},
				Summary: models.CtrfSchemaJsonResultsSummary{
					Tests:    1,
					Passed:   1,
					Failed:   0,
					Skipped:  0,
					Pending:  0,
					Other:    0,
					Start:    1234567890000,
					Stop:     1234567895000,
					Duration: ptrInt(5000),
				},
				Tests: []models.CtrfSchemaJsonResultsTestsElem{
					{
						Name:     "Login test - should display login form",
						Status:   models.CtrfSchemaJsonResultsTestsElemStatusPassed,
						Duration: 5000,
					},
				},
			},
		}

		reqBody, _ := json.Marshal(ctrfReport)

		req := httptest.NewRequest("POST", "/test-results/upsert?test_run_id="+testRunID.String(), bytes.NewReader(reqBody))
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}

		var response map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&response)

		if response["test_run_id"] != testRunID.String() {
			t.Errorf("Expected test_run_id %s, got %v", testRunID.String(), response["test_run_id"])
		}

		if response["job_completion_index"] != float64(0) {
			t.Errorf("Expected job_completion_index 0, got %v", response["job_completion_index"])
		}
	})

	t.Run("Error - Missing test_run_id", func(t *testing.T) {
		mockService := &MockTestResultManager{}

		handler := NewTestResultHandler(mockService, logger)
		app := fiber.New()
		app.Post("/test-results/upsert", func(c *fiber.Ctx) error {
			c.Locals("user_id", "user-123")
			return handler.UpsertTestResultsByRunID(c)
		})

		now := time.Now()
		ctrfReport := models.CtrfSchemaJson{
			ReportFormat: models.CtrfSchemaJsonReportFormatCTRF,
			SpecVersion:  "0.0.0",
			Timestamp:    &now,
			Results: models.CtrfSchemaJsonResults{
				Tool: models.CtrfSchemaJsonResultsTool{
					Name: "playwright",
				},
				Summary: models.CtrfSchemaJsonResultsSummary{
					Tests: 0,
					Start: 1234567890000,
					Stop:  1234567895000,
				},
				Tests: []models.CtrfSchemaJsonResultsTestsElem{},
			},
		}

		reqBody, _ := json.Marshal(ctrfReport)

		req := httptest.NewRequest("POST", "/test-results/upsert", bytes.NewReader(reqBody))
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusBadRequest {
			t.Errorf("Expected status 400, got %d", resp.StatusCode)
		}

		var response map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&response)

		if response["error"] != "test_run_id required (as query param or in extra field)" {
			t.Errorf("Unexpected error message: %v", response["error"])
		}
	})

	t.Run("Error - Invalid CTRF format", func(t *testing.T) {
		mockService := &MockTestResultManager{}

		handler := NewTestResultHandler(mockService, logger)
		app := fiber.New()
		app.Post("/test-results/upsert", func(c *fiber.Ctx) error {
			c.Locals("user_id", "user-123")
			return handler.UpsertTestResultsByRunID(c)
		})

		now := time.Now()
		ctrfReport := models.CtrfSchemaJson{
			ReportFormat: "INVALID",
			SpecVersion:  "0.0.0",
			Timestamp:    &now,
			Results: models.CtrfSchemaJsonResults{
				Tool: models.CtrfSchemaJsonResultsTool{
					Name: "playwright",
				},
				Summary: models.CtrfSchemaJsonResultsSummary{
					Tests: 0,
					Start: 1234567890000,
					Stop:  1234567895000,
				},
				Tests: []models.CtrfSchemaJsonResultsTestsElem{},
			},
		}

		reqBody, _ := json.Marshal(ctrfReport)

		req := httptest.NewRequest("POST", "/test-results/upsert?test_run_id="+testRunID.String(), bytes.NewReader(reqBody))
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusBadRequest {
			t.Errorf("Expected status 400, got %d", resp.StatusCode)
		}

		var response map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&response)

		if response["error"] != "Invalid reportFormat, must be 'CTRF'" {
			t.Errorf("Unexpected error message: %v", response["error"])
		}
	})

	t.Run("Error - Service returns error", func(t *testing.T) {
		mockService := &MockTestResultManager{
			UpsertCtrfReportByRunIDFunc: func(ctx context.Context, report *models.CtrfSchemaJson, runID string, idx int, userID string) (*services.CtrfUpsertResult, error) {
				return nil, errors.New("database error")
			},
		}

		handler := NewTestResultHandler(mockService, logger)
		app := fiber.New()
		app.Post("/test-results/upsert", func(c *fiber.Ctx) error {
			c.Locals("user_id", "user-123")
			return handler.UpsertTestResultsByRunID(c)
		})

		now := time.Now()
		ctrfReport := models.CtrfSchemaJson{
			ReportFormat: models.CtrfSchemaJsonReportFormatCTRF,
			SpecVersion:  "0.0.0",
			Timestamp:    &now,
			Results: models.CtrfSchemaJsonResults{
				Tool: models.CtrfSchemaJsonResultsTool{
					Name: "playwright",
				},
				Summary: models.CtrfSchemaJsonResultsSummary{
					Tests: 0,
					Start: 1234567890000,
					Stop:  1234567895000,
				},
				Tests: []models.CtrfSchemaJsonResultsTestsElem{},
			},
		}

		reqBody, _ := json.Marshal(ctrfReport)

		req := httptest.NewRequest("POST", "/test-results/upsert?test_run_id="+testRunID.String(), bytes.NewReader(reqBody))
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusInternalServerError {
			t.Errorf("Expected status 500, got %d", resp.StatusCode)
		}
	})
}

func TestTestResultHandler_GetTestResults(t *testing.T) {
	logger := zap.NewNop()

	t.Run("Success - Get report by ID", func(t *testing.T) {
		reportID := uuid.New().String()
		now := time.Now()
		mockService := &MockTestResultManager{
			GetCtrfReportFunc: func(ctx context.Context, id string) (*models.CtrfSchemaJson, error) {
				return &models.CtrfSchemaJson{
					ReportFormat: models.CtrfSchemaJsonReportFormatCTRF,
					SpecVersion:  "0.0.0",
					Timestamp:    &now,
					Results: models.CtrfSchemaJsonResults{
						Tool: models.CtrfSchemaJsonResultsTool{
							Name: "playwright",
						},
						Summary: models.CtrfSchemaJsonResultsSummary{
							Tests:  5,
							Passed: 4,
							Failed: 1,
						},
						Tests: []models.CtrfSchemaJsonResultsTestsElem{},
					},
				}, nil
			},
		}

		handler := NewTestResultHandler(mockService, logger)
		app := fiber.New()
		app.Get("/test-results/:id", handler.GetTestResults)

		req := httptest.NewRequest("GET", "/test-results/"+reportID, nil)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}
	})

	t.Run("Error - Report not found", func(t *testing.T) {
		mockService := &MockTestResultManager{
			GetCtrfReportFunc: func(ctx context.Context, id string) (*models.CtrfSchemaJson, error) {
				return nil, errors.New("report not found")
			},
		}

		handler := NewTestResultHandler(mockService, logger)
		app := fiber.New()
		app.Get("/test-results/:id", handler.GetTestResults)

		req := httptest.NewRequest("GET", "/test-results/"+uuid.New().String(), nil)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusNotFound {
			t.Errorf("Expected status 404, got %d", resp.StatusCode)
		}
	})
}

func TestTestResultHandler_ListTestResults(t *testing.T) {
	logger := zap.NewNop()

	t.Run("Success - List reports", func(t *testing.T) {
		mockService := &MockTestResultManager{
			ListCtrfReportsFunc: func(ctx context.Context, page, pageSize int) (*services.CtrfReportList, error) {
				return &services.CtrfReportList{
					Reports:    []services.CtrfReportSummary{},
					TotalCount: 0,
					Page:       page,
					PageSize:   pageSize,
				}, nil
			},
		}

		handler := NewTestResultHandler(mockService, logger)
		app := fiber.New()
		app.Get("/test-results", handler.ListTestResults)

		req := httptest.NewRequest("GET", "/test-results?page=1&page_size=20", nil)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}
	})
}

func TestTestResultHandler_GetTestStatistics(t *testing.T) {
	logger := zap.NewNop()

	t.Run("Success - Get statistics", func(t *testing.T) {
		mockService := &MockTestResultManager{
			GetCtrfStatisticsFunc: func(ctx context.Context) (*services.CtrfStatistics, error) {
				return &services.CtrfStatistics{
					TotalRuns:   100,
					TotalTests:  500,
					PassedTests: 450,
					FailedTests: 50,
					PassRate:    0.9,
					AvgDuration: 5000,
				}, nil
			},
		}

		handler := NewTestResultHandler(mockService, logger)
		app := fiber.New()
		app.Get("/test-results/stats", handler.GetTestStatistics)

		req := httptest.NewRequest("GET", "/test-results/stats", nil)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}
	})
}

// Helper functions
func ptrString(s string) *string {
	return &s
}

func ptrInt(i int) *int {
	return &i
}

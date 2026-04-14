package handler

import (
	"context"
	"encoding/json"
	"net"
	"time"

	"github.com/scaledtest/scaledtest/internal/model"
)

// authStore abstracts auth persistence operations.
type authStore interface {
	GetUserByEmail(ctx context.Context, email string) (*model.User, error)
	GetUserByID(ctx context.Context, id string) (*model.User, error)
	EmailExists(ctx context.Context, email string) (bool, error)
	CreateUser(ctx context.Context, email, passwordHash, displayName, role string) (userID, returnedRole string, err error)
	CreateUserWithRole(ctx context.Context, email, passwordHash, displayName, role string) (userID string, err error)
	UpdatePassword(ctx context.Context, userID, passwordHash string) (int64, error)
	UpdateProfile(ctx context.Context, userID, displayName string) (*model.User, error)
	GetPrimaryTeamID(ctx context.Context, userID string) (string, error)
	CreateSession(ctx context.Context, userID, refreshToken string, userAgent string, ipAddr net.IP, expiresAt time.Time) error
	GetSessionByRefreshToken(ctx context.Context, refreshToken string) (*storeSessionInfo, error)
	DeleteSession(ctx context.Context, sessionID string) error
	DeleteSessionByRefreshToken(ctx context.Context, refreshToken string) error
}

type storeSessionInfo struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
}

// analyticsStore abstracts analytics query operations.
type analyticsStore interface {
	QueryTrends(ctx context.Context, groupBy, teamID string, start, end time.Time) ([]analyticsTrendRow, error)
	QueryDurationBuckets(ctx context.Context, teamID string, start, end time.Time) ([]int64, error)
	QueryErrorClusters(ctx context.Context, teamID string, start, end time.Time, limit int) ([]analyticsErrorClusterRow, error)
	QueryFlakyTests(ctx context.Context, teamID string, cutoff time.Time, minRuns int) ([]analyticsFlakyRow, error)
}

type analyticsTrendRow struct {
	Date     time.Time
	Total    int
	Passed   int
	Failed   int
	Skipped  int
	PassRate float64
}

type analyticsErrorClusterRow struct {
	Message   string
	Count     int
	TestNames []string
	FirstSeen time.Time
	LastSeen  time.Time
}

type analyticsFlakyRow struct {
	Name       string
	Suite      string
	FilePath   string
	Statuses   []string
	LastStatus string
	TotalRuns  int
}

// executionsStore abstracts execution persistence operations.
type executionsStore interface {
	List(ctx context.Context, teamID string, limit, offset int) ([]model.TestExecution, int, error)
	Create(ctx context.Context, teamID, command string, configJSON []byte) (string, error)
	Get(ctx context.Context, id, teamID string) (*model.TestExecution, error)
	Cancel(ctx context.Context, id, teamID string, now time.Time) (int64, error)
	UpdateStatus(ctx context.Context, id, teamID, status string, now time.Time, errorMsg *string) (int64, error)
	Exists(ctx context.Context, id, teamID string) (bool, error)
	GetK8sJobName(ctx context.Context, id string) (*string, error)
	SetK8sJobName(ctx context.Context, id, jobName string, now time.Time) error
	MarkFailed(ctx context.Context, id, errorMsg string, now time.Time) error
}

// reportsStore abstracts report persistence operations.
type reportsStore interface {
	List(ctx context.Context, filter reportsListFilter) ([]map[string]interface{}, int, error)
	CreateWithResults(ctx context.Context, p createReportParams, results []model.TestResult) error
	Get(ctx context.Context, id, teamID string) (*model.TestReport, error)
	Delete(ctx context.Context, id, teamID string) (int64, error)
	ExecutionExists(ctx context.Context, executionID, teamID string) (bool, error)
	GetReportAndResults(ctx context.Context, id, teamID string) (*model.TestReport, map[string]*model.TestResult, error)
	GetPreviousFailedTests(ctx context.Context, teamID, currentReportID string) (map[string]bool, error)
}

type reportsListFilter struct {
	TeamID string
	Since  *time.Time
	Until  *time.Time
	Limit  int
	Offset int
}

type createReportParams struct {
	ID                 string
	TeamID             string
	ExecutionID        *string
	ToolName           string
	ToolVersion        string
	Environment        json.RawMessage
	Summary            json.RawMessage
	Raw                json.RawMessage
	CreatedAt          time.Time
	TriageGitHubStatus bool
}

// adminStore abstracts admin query operations.
type adminStore interface {
	ListUsers(ctx context.Context, limit, offset int) ([]model.User, int, error)
}

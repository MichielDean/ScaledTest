package handler

import (
	"context"
	"net"
	"time"

	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/store"
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
	CreateSession(ctx context.Context, userID, refreshToken, userAgent string, ipAddr net.IP, expiresAt time.Time) error
	GetSessionByRefreshToken(ctx context.Context, refreshToken string) (*store.SessionInfo, error)
	DeleteSession(ctx context.Context, sessionID string) error
	DeleteSessionByRefreshToken(ctx context.Context, refreshToken string) error
}

// analyticsStore abstracts analytics query operations.
type analyticsStore interface {
	QueryTrends(ctx context.Context, groupBy, teamID string, start, end time.Time) ([]store.TrendRow, error)
	QueryDurationBuckets(ctx context.Context, teamID string, start, end time.Time) ([]int64, error)
	QueryErrorClusters(ctx context.Context, teamID string, start, end time.Time, limit int) ([]store.ErrorClusterRow, error)
	QueryFlakyTests(ctx context.Context, teamID string, cutoff time.Time, minRuns int) ([]store.FlakyRow, error)
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
	List(ctx context.Context, filter store.ReportListFilter) ([]map[string]interface{}, int, error)
	CreateWithResults(ctx context.Context, p store.CreateReportParams, results []model.TestResult) error
	Get(ctx context.Context, id, teamID string) (*model.TestReport, error)
	Delete(ctx context.Context, id, teamID string) (int64, error)
	ExecutionExists(ctx context.Context, executionID, teamID string) (bool, error)
	GetReportAndResults(ctx context.Context, id, teamID string) (*model.TestReport, map[string]*model.TestResult, error)
	GetPreviousFailedTests(ctx context.Context, teamID, currentReportID string) (map[string]bool, error)
}

// teamsStore abstracts team and token data operations for testable handlers.
type teamsStore interface {
	ListTeams(ctx context.Context, userID string) ([]store.TeamWithRole, error)
	GetTeam(ctx context.Context, teamID, userID string) (*store.TeamWithRole, error)
	GetUserRole(ctx context.Context, userID, teamID string) (string, error)
	CreateTeam(ctx context.Context, userID, name string) (*model.Team, error)
	DeleteTeam(ctx context.Context, teamID string) error
	ListTokens(ctx context.Context, teamID string) ([]model.APIToken, error)
	CreateToken(ctx context.Context, teamID, userID, name, tokenHash, prefix string) (*model.APIToken, error)
	DeleteToken(ctx context.Context, teamID, tokenID string) (int64, error)
}

// adminStore abstracts admin query operations.
type adminStore interface {
	ListUsers(ctx context.Context, limit, offset int) ([]model.User, int, error)
}

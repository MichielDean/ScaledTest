package handler

import (
	"context"
	"net"
	"time"

	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/store"
)

type AuthStoreAdapter struct {
	Inner *store.AuthStore
}

func (a *AuthStoreAdapter) GetUserByEmail(ctx context.Context, email string) (*model.User, error) {
	return a.Inner.GetUserByEmail(ctx, email)
}
func (a *AuthStoreAdapter) GetUserByID(ctx context.Context, id string) (*model.User, error) {
	return a.Inner.GetUserByID(ctx, id)
}
func (a *AuthStoreAdapter) EmailExists(ctx context.Context, email string) (bool, error) {
	return a.Inner.EmailExists(ctx, email)
}
func (a *AuthStoreAdapter) CreateUser(ctx context.Context, email, passwordHash, displayName, role string) (string, string, error) {
	return a.Inner.CreateUser(ctx, email, passwordHash, displayName, role)
}
func (a *AuthStoreAdapter) CreateUserWithRole(ctx context.Context, email, passwordHash, displayName, role string) (string, error) {
	return a.Inner.CreateUserWithRole(ctx, email, passwordHash, displayName, role)
}
func (a *AuthStoreAdapter) UpdatePassword(ctx context.Context, userID, passwordHash string) (int64, error) {
	return a.Inner.UpdatePassword(ctx, userID, passwordHash)
}
func (a *AuthStoreAdapter) UpdateProfile(ctx context.Context, userID, displayName string) (*model.User, error) {
	return a.Inner.UpdateProfile(ctx, userID, displayName)
}
func (a *AuthStoreAdapter) GetPrimaryTeamID(ctx context.Context, userID string) (string, error) {
	return a.Inner.GetPrimaryTeamID(ctx, userID)
}
func (a *AuthStoreAdapter) CreateSession(ctx context.Context, userID, refreshToken string, userAgent string, ipAddr net.IP, expiresAt time.Time) error {
	return a.Inner.CreateSession(ctx, userID, refreshToken, userAgent, ipAddr, expiresAt)
}
func (a *AuthStoreAdapter) GetSessionByRefreshToken(ctx context.Context, refreshToken string) (*storeSessionInfo, error) {
	si, err := a.Inner.GetSessionByRefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, err
	}
	return &storeSessionInfo{ID: si.ID, UserID: si.UserID, ExpiresAt: si.ExpiresAt}, nil
}
func (a *AuthStoreAdapter) DeleteSession(ctx context.Context, sessionID string) error {
	return a.Inner.DeleteSession(ctx, sessionID)
}
func (a *AuthStoreAdapter) DeleteSessionByRefreshToken(ctx context.Context, refreshToken string) error {
	return a.Inner.DeleteSessionByRefreshToken(ctx, refreshToken)
}

type AnalyticsStoreAdapter struct {
	Inner *store.AnalyticsStore
}

func (a *AnalyticsStoreAdapter) QueryTrends(ctx context.Context, groupBy, teamID string, start, end time.Time) ([]analyticsTrendRow, error) {
	rows, err := a.Inner.QueryTrends(ctx, groupBy, teamID, start, end)
	if err != nil {
		return nil, err
	}
	result := make([]analyticsTrendRow, len(rows))
	for i, r := range rows {
		result[i] = analyticsTrendRow{
			Date:     r.Date,
			Total:    r.Total,
			Passed:   r.Passed,
			Failed:   r.Failed,
			Skipped:  r.Skipped,
			PassRate: r.PassRate,
		}
	}
	return result, nil
}
func (a *AnalyticsStoreAdapter) QueryDurationBuckets(ctx context.Context, teamID string, start, end time.Time) ([]int64, error) {
	return a.Inner.QueryDurationBuckets(ctx, teamID, start, end)
}
func (a *AnalyticsStoreAdapter) QueryErrorClusters(ctx context.Context, teamID string, start, end time.Time, limit int) ([]analyticsErrorClusterRow, error) {
	rows, err := a.Inner.QueryErrorClusters(ctx, teamID, start, end, limit)
	if err != nil {
		return nil, err
	}
	result := make([]analyticsErrorClusterRow, len(rows))
	for i, r := range rows {
		result[i] = analyticsErrorClusterRow{
			Message:   r.Message,
			Count:     r.Count,
			TestNames: r.TestNames,
			FirstSeen: r.FirstSeen,
			LastSeen:  r.LastSeen,
		}
	}
	return result, nil
}
func (a *AnalyticsStoreAdapter) QueryFlakyTests(ctx context.Context, teamID string, cutoff time.Time, minRuns int) ([]analyticsFlakyRow, error) {
	rows, err := a.Inner.QueryFlakyTests(ctx, teamID, cutoff, minRuns)
	if err != nil {
		return nil, err
	}
	result := make([]analyticsFlakyRow, len(rows))
	for i, r := range rows {
		result[i] = analyticsFlakyRow{
			Name:       r.Name,
			Suite:      r.Suite,
			FilePath:   r.FilePath,
			Statuses:   r.Statuses,
			LastStatus: r.LastStatus,
			TotalRuns:  r.TotalRuns,
		}
	}
	return result, nil
}

type ExecutionsStoreAdapter struct {
	Inner *store.ExecutionsStore
}

func (a *ExecutionsStoreAdapter) List(ctx context.Context, teamID string, limit, offset int) ([]model.TestExecution, int, error) {
	return a.Inner.List(ctx, teamID, limit, offset)
}
func (a *ExecutionsStoreAdapter) Create(ctx context.Context, teamID, command string, configJSON []byte) (string, error) {
	return a.Inner.Create(ctx, teamID, command, configJSON)
}
func (a *ExecutionsStoreAdapter) Get(ctx context.Context, id, teamID string) (*model.TestExecution, error) {
	return a.Inner.Get(ctx, id, teamID)
}
func (a *ExecutionsStoreAdapter) Cancel(ctx context.Context, id, teamID string, now time.Time) (int64, error) {
	return a.Inner.Cancel(ctx, id, teamID, now)
}
func (a *ExecutionsStoreAdapter) UpdateStatus(ctx context.Context, id, teamID, status string, now time.Time, errorMsg *string) (int64, error) {
	return a.Inner.UpdateStatus(ctx, id, teamID, status, now, errorMsg)
}
func (a *ExecutionsStoreAdapter) Exists(ctx context.Context, id, teamID string) (bool, error) {
	return a.Inner.Exists(ctx, id, teamID)
}
func (a *ExecutionsStoreAdapter) GetK8sJobName(ctx context.Context, id string) (*string, error) {
	return a.Inner.GetK8sJobName(ctx, id)
}
func (a *ExecutionsStoreAdapter) SetK8sJobName(ctx context.Context, id, jobName string, now time.Time) error {
	return a.Inner.SetK8sJobName(ctx, id, jobName, now)
}
func (a *ExecutionsStoreAdapter) MarkFailed(ctx context.Context, id, errorMsg string, now time.Time) error {
	return a.Inner.MarkFailed(ctx, id, errorMsg, now)
}

type ReportsStoreAdapter struct {
	Inner *store.ReportsStore
}

func (a *ReportsStoreAdapter) List(ctx context.Context, filter reportsListFilter) ([]map[string]interface{}, int, error) {
	f := store.ReportListFilter{
		TeamID: filter.TeamID,
		Since:  filter.Since,
		Until:  filter.Until,
		Limit:  filter.Limit,
		Offset: filter.Offset,
	}
	return a.Inner.List(ctx, f)
}
func (a *ReportsStoreAdapter) CreateWithResults(ctx context.Context, p createReportParams, results []model.TestResult) error {
	cp := store.CreateReportParams{
		ID:                 p.ID,
		TeamID:             p.TeamID,
		ExecutionID:        p.ExecutionID,
		ToolName:           p.ToolName,
		ToolVersion:        p.ToolVersion,
		Environment:        p.Environment,
		Summary:            p.Summary,
		Raw:                p.Raw,
		CreatedAt:          p.CreatedAt,
		TriageGitHubStatus: p.TriageGitHubStatus,
	}
	return a.Inner.CreateWithResults(ctx, cp, results)
}
func (a *ReportsStoreAdapter) Get(ctx context.Context, id, teamID string) (*model.TestReport, error) {
	return a.Inner.Get(ctx, id, teamID)
}
func (a *ReportsStoreAdapter) Delete(ctx context.Context, id, teamID string) (int64, error) {
	return a.Inner.Delete(ctx, id, teamID)
}
func (a *ReportsStoreAdapter) ExecutionExists(ctx context.Context, executionID, teamID string) (bool, error) {
	return a.Inner.ExecutionExists(ctx, executionID, teamID)
}
func (a *ReportsStoreAdapter) GetReportAndResults(ctx context.Context, id, teamID string) (*model.TestReport, map[string]*model.TestResult, error) {
	return a.Inner.GetReportAndResults(ctx, id, teamID)
}
func (a *ReportsStoreAdapter) GetPreviousFailedTests(ctx context.Context, teamID, currentReportID string) (map[string]bool, error) {
	return a.Inner.GetPreviousFailedTests(ctx, teamID, currentReportID)
}

type AdminStoreAdapter struct {
	Inner *store.AdminStore
}

func (a *AdminStoreAdapter) ListUsers(ctx context.Context, limit, offset int) ([]model.User, int, error) {
	return a.Inner.ListUsers(ctx, limit, offset)
}

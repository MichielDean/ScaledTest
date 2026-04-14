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
func (a *AuthStoreAdapter) CreateSession(ctx context.Context, userID, refreshToken, userAgent string, ipAddr net.IP, expiresAt time.Time) error {
	return a.Inner.CreateSession(ctx, userID, refreshToken, userAgent, ipAddr, expiresAt)
}
func (a *AuthStoreAdapter) GetSessionByRefreshToken(ctx context.Context, refreshToken string) (*store.SessionInfo, error) {
	return a.Inner.GetSessionByRefreshToken(ctx, refreshToken)
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

func (a *AnalyticsStoreAdapter) QueryTrends(ctx context.Context, groupBy, teamID string, start, end time.Time) ([]store.TrendRow, error) {
	return a.Inner.QueryTrends(ctx, groupBy, teamID, start, end)
}
func (a *AnalyticsStoreAdapter) QueryDurationBuckets(ctx context.Context, teamID string, start, end time.Time) ([]int64, error) {
	return a.Inner.QueryDurationBuckets(ctx, teamID, start, end)
}
func (a *AnalyticsStoreAdapter) QueryErrorClusters(ctx context.Context, teamID string, start, end time.Time, limit int) ([]store.ErrorClusterRow, error) {
	return a.Inner.QueryErrorClusters(ctx, teamID, start, end, limit)
}
func (a *AnalyticsStoreAdapter) QueryFlakyTests(ctx context.Context, teamID string, cutoff time.Time, minRuns int) ([]store.FlakyRow, error) {
	return a.Inner.QueryFlakyTests(ctx, teamID, cutoff, minRuns)
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

func (a *ReportsStoreAdapter) List(ctx context.Context, filter store.ReportListFilter) ([]map[string]interface{}, int, error) {
	return a.Inner.List(ctx, filter)
}
func (a *ReportsStoreAdapter) CreateWithResults(ctx context.Context, p store.CreateReportParams, results []model.TestResult) error {
	return a.Inner.CreateWithResults(ctx, p, results)
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

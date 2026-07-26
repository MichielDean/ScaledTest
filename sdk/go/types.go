package scaledtest

import (
	"encoding/json"
	"time"
)

// ── Reports ──────────────────────────────────────────────────────────────────

// CtrfReport is the CTRF report payload submitted to UploadReport. The
// structure mirrors the CTRF specification as accepted by the ScaledTest
// ingest endpoint.
type CtrfReport struct {
	Results CtrfResults `json:"results"`
}

// CtrfResults is the top-level results container of a CTRF report.
type CtrfResults struct {
	Tool        CtrfTool               `json:"tool"`
	Environment map[string]interface{} `json:"environment,omitempty"`
	Summary     CtrfSummary            `json:"summary"`
	Tests       []CtrfTest             `json:"tests"`
}

// CtrfTool identifies the test runner that produced the report.
type CtrfTool struct {
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
}

// CtrfSummary holds the aggregate counts for a CTRF report.
type CtrfSummary struct {
	Tests   int   `json:"tests"`
	Passed  int   `json:"passed"`
	Failed  int   `json:"failed"`
	Skipped int   `json:"skipped"`
	Pending int   `json:"pending"`
	Other   int   `json:"other"`
	Start   int64 `json:"start,omitempty"`
	Stop    int64 `json:"stop,omitempty"`
}

// CtrfTest is a single test entry within a CTRF report.
type CtrfTest struct {
	Name     string   `json:"name"`
	Status   string   `json:"status"`
	Duration int64    `json:"duration"`
	Message  string   `json:"message,omitempty"`
	Trace    string   `json:"trace,omitempty"`
	Suite    string   `json:"suite,omitempty"`
	Tags     []string `json:"tags,omitempty"`
	Flaky    bool     `json:"flaky,omitempty"`
	Retry    int      `json:"retry,omitempty"`
	FilePath string   `json:"filePath,omitempty"`
}

// Report is the API representation of a stored test report.
type Report struct {
	ID          string          `json:"id"`
	TeamID      string          `json:"team_id"`
	Name        string          `json:"name"`
	ToolName    string          `json:"tool_name,omitempty"`
	ToolVersion string          `json:"tool_version,omitempty"`
	Summary     json.RawMessage `json:"summary"`
	TestCount   int             `json:"test_count,omitempty"`
	Passed      int             `json:"passed,omitempty"`
	Failed      int             `json:"failed,omitempty"`
	Skipped     int             `json:"skipped,omitempty"`
	Pending     int             `json:"pending,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	ExecutionID string          `json:"execution_id,omitempty"`
	Environment json.RawMessage `json:"environment,omitempty"`
}

// ListReportsResponse is returned by Reports.List.
type ListReportsResponse struct {
	Reports []Report `json:"reports"`
	Total   int      `json:"total"`
}

// DeleteReportResponse is returned by Reports.Delete.
type DeleteReportResponse struct {
	ID      string `json:"id"`
	Deleted bool   `json:"deleted"`
}

// UploadReportResponse is returned by Reports.Upload.
type UploadReportResponse struct {
	ID                 string                  `json:"id"`
	Message            string                  `json:"message"`
	Tool               string                  `json:"tool"`
	Tests              int                     `json:"tests"`
	Results            int                     `json:"results"`
	ExecutionID        string                  `json:"execution_id,omitempty"`
	TriageGitHubStatus bool                    `json:"triage_github_status,omitempty"`
	QualityGate        *UploadQualityGateBlock `json:"qualityGate,omitempty"`
}

// UploadQualityGateBlock is the quality gate section of an upload response.
type UploadQualityGateBlock struct {
	Passed bool                     `json:"passed"`
	Gates  []UploadQualityGateEntry `json:"gates"`
}

// UploadQualityGateEntry is one gate's evaluation in the upload response.
type UploadQualityGateEntry struct {
	ID     string                  `json:"id"`
	Name   string                  `json:"name"`
	Passed bool                    `json:"passed"`
	Rules  []QualityGateRuleResult `json:"rules"`
}

// CompareReport is one side of a report comparison.
type CompareReport struct {
	ID          string          `json:"id"`
	TeamID      string          `json:"team_id"`
	ToolName    string          `json:"tool_name,omitempty"`
	ToolVersion string          `json:"tool_version,omitempty"`
	Summary     json.RawMessage `json:"summary"`
	CreatedAt   time.Time       `json:"created_at"`
	ExecutionID string          `json:"execution_id,omitempty"`
	Environment json.RawMessage `json:"environment,omitempty"`
}

// ReportTestDiff is a single per-test diff entry from CompareReports.
type ReportTestDiff struct {
	Name             string  `json:"name"`
	Suite            string  `json:"suite,omitempty"`
	FilePath         string  `json:"file_path,omitempty"`
	BaseStatus       string  `json:"base_status,omitempty"`
	HeadStatus       string  `json:"head_status,omitempty"`
	BaseDurationMs   int64   `json:"base_duration_ms,omitempty"`
	HeadDurationMs   int64   `json:"head_duration_ms,omitempty"`
	DurationDeltaMs  int64   `json:"duration_delta_ms,omitempty"`
	DurationDeltaPct float64 `json:"duration_delta_pct,omitempty"`
	Message          string  `json:"message,omitempty"`
}

// ReportDiffSummary is the aggregate summary of a comparison.
type ReportDiffSummary struct {
	BaseTests           int `json:"base_tests"`
	HeadTests           int `json:"head_tests"`
	NewFailures         int `json:"new_failures"`
	Fixed               int `json:"fixed"`
	DurationRegressions int `json:"duration_regressions"`
}

// ReportDiff is the diff block of a comparison response.
type ReportDiff struct {
	NewFailures         []ReportTestDiff  `json:"new_failures"`
	Fixed               []ReportTestDiff  `json:"fixed"`
	DurationRegressions []ReportTestDiff  `json:"duration_regressions"`
	Summary             ReportDiffSummary `json:"summary"`
}

// ReportCompareResult is returned by Reports.Compare.
type ReportCompareResult struct {
	Base CompareReport `json:"base"`
	Head CompareReport `json:"head"`
	Diff ReportDiff    `json:"diff"`
}

// TriageFailureEntry is a single failure classified by triage.
type TriageFailureEntry struct {
	TestResultID   string `json:"test_result_id"`
	Classification string `json:"classification"`
}

// TriageCluster is a group of failures sharing a root cause.
type TriageCluster struct {
	ID        string               `json:"id"`
	RootCause string               `json:"root_cause"`
	Failures  []TriageFailureEntry `json:"failures"`
	Label     string               `json:"label,omitempty"`
}

// ReportTriageMetadata is the metadata block of a triage result.
type ReportTriageMetadata struct {
	GeneratedAt time.Time `json:"generated_at"`
	Model       string    `json:"model,omitempty"`
}

// ReportTriageResult is returned by Reports.GetTriage.
type ReportTriageResult struct {
	TriageStatus        string                `json:"triage_status"`
	Clusters            []TriageCluster       `json:"clusters,omitempty"`
	UnclusteredFailures []TriageFailureEntry  `json:"unclustered_failures,omitempty"`
	Summary             string                `json:"summary,omitempty"`
	Error               string                `json:"error,omitempty"`
	Metadata            *ReportTriageMetadata `json:"metadata,omitempty"`
}

// RetryTriageResponse is returned by Reports.RetryTriage.
type RetryTriageResponse struct {
	TriageStatus string `json:"triage_status"`
}

// ── Executions ───────────────────────────────────────────────────────────────

// ExecutionStatus is the lifecycle state of a test execution.
type ExecutionStatus string

const (
	ExecutionStatusPending   ExecutionStatus = "pending"
	ExecutionStatusRunning   ExecutionStatus = "running"
	ExecutionStatusCompleted ExecutionStatus = "completed"
	ExecutionStatusFailed    ExecutionStatus = "failed"
	ExecutionStatusCancelled ExecutionStatus = "cancelled"
)

// UpdateExecutionStatus is the subset of statuses accepted by UpdateStatus.
type UpdateExecutionStatus string

const (
	UpdateExecutionRunning   UpdateExecutionStatus = "running"
	UpdateExecutionCompleted UpdateExecutionStatus = "completed"
	UpdateExecutionFailed    UpdateExecutionStatus = "failed"
	UpdateExecutionCancelled UpdateExecutionStatus = "cancelled"
)

// TestResultStatus is the status of a single test result.
type TestResultStatus string

const (
	TestResultPassed  TestResultStatus = "passed"
	TestResultFailed  TestResultStatus = "failed"
	TestResultSkipped TestResultStatus = "skipped"
	TestResultPending TestResultStatus = "pending"
	TestResultOther   TestResultStatus = "other"
)

// WorkerStatus is the lifecycle state of a sharded worker.
type WorkerStatus string

const (
	WorkerStatusStarting  WorkerStatus = "starting"
	WorkerStatusRunning   WorkerStatus = "running"
	WorkerStatusIdle      WorkerStatus = "idle"
	WorkerStatusCompleted WorkerStatus = "completed"
	WorkerStatusFailed    WorkerStatus = "failed"
)

// Execution is the API representation of a test execution.
type Execution struct {
	ID         string          `json:"id"`
	TeamID     string          `json:"team_id"`
	Command    string          `json:"command"`
	Status     ExecutionStatus `json:"status"`
	Config     json.RawMessage `json:"config,omitempty"`
	ReportID   string          `json:"report_id,omitempty"`
	K8sJobName string          `json:"k8s_job_name,omitempty"`
	K8sPodName string          `json:"k8s_pod_name,omitempty"`
	ErrorMsg   string          `json:"error_msg,omitempty"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
	StartedAt  *time.Time      `json:"started_at,omitempty"`
	FinishedAt *time.Time      `json:"finished_at,omitempty"`
}

// ListExecutionsResponse is returned by Executions.List.
type ListExecutionsResponse struct {
	Executions []Execution `json:"executions"`
	Total      int         `json:"total"`
}

// CreateExecutionResponse is returned by Executions.Create.
type CreateExecutionResponse struct {
	ID      string `json:"id"`
	Status  string `json:"status"`
	Command string `json:"command"`
}

// CancelExecutionResponse is returned by Executions.Cancel.
type CancelExecutionResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// UpdateExecutionStatusResponse is returned by Executions.UpdateStatus.
type UpdateExecutionStatusResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// ExecutionProgress is the body for ReportProgress.
type ExecutionProgress struct {
	Passed              int     `json:"passed"`
	Failed              int     `json:"failed"`
	Skipped             int     `json:"skipped"`
	Total               int     `json:"total"`
	DurationMs          int64   `json:"duration_ms,omitempty"`
	EstimatedETASeconds float64 `json:"estimated_eta_seconds,omitempty"`
}

// ExecutionProgressResponse is returned by ReportProgress.
type ExecutionProgressResponse struct {
	ExecutionID string `json:"execution_id"`
	Received    bool   `json:"received"`
}

// TestResultEvent is the body for ReportTestResult.
type TestResultEvent struct {
	Name       string           `json:"name"`
	Status     TestResultStatus `json:"status"`
	DurationMs int64            `json:"duration_ms,omitempty"`
	Message    string           `json:"message,omitempty"`
	Suite      string           `json:"suite,omitempty"`
	WorkerID   string           `json:"worker_id,omitempty"`
}

// WorkerStatusEvent is the body for ReportWorkerStatus.
type WorkerStatusEvent struct {
	WorkerID       string       `json:"worker_id"`
	Status         WorkerStatus `json:"status"`
	Message        string       `json:"message,omitempty"`
	TestsAssigned  int          `json:"tests_assigned,omitempty"`
	TestsCompleted int          `json:"tests_completed,omitempty"`
}

// ExecutionReceivedResponse is returned by ReportTestResult and ReportWorkerStatus.
type ExecutionReceivedResponse struct {
	ExecutionID string `json:"execution_id"`
	Received    bool   `json:"received"`
}

// ── Analytics ────────────────────────────────────────────────────────────────

// TrendPoint is a single point in a pass/fail trend.
type TrendPoint struct {
	Date     string  `json:"date"`
	PassRate float64 `json:"pass_rate"`
	Total    int     `json:"total"`
	Passed   int     `json:"passed"`
	Failed   int     `json:"failed"`
	Skipped  int     `json:"skipped"`
}

// TrendsResponse is returned by Analytics.GetTrends.
type TrendsResponse struct {
	Trends []TrendPoint `json:"trends"`
}

// FlakyTest is a test detected as flaky.
type FlakyTest struct {
	Name       string  `json:"name"`
	Suite      string  `json:"suite,omitempty"`
	FilePath   string  `json:"file_path,omitempty"`
	FlipCount  int     `json:"flip_count"`
	TotalRuns  int     `json:"total_runs"`
	FlipRate   float64 `json:"flip_rate"`
	LastStatus string  `json:"last_status"`
}

// FlakyTestsResponse is returned by Analytics.GetFlakyTests.
type FlakyTestsResponse struct {
	FlakyTests []FlakyTest `json:"flaky_tests"`
}

// ErrorCluster groups similar error messages.
type ErrorCluster struct {
	Message   string    `json:"message"`
	Count     int       `json:"count"`
	TestNames []string  `json:"test_names"`
	FirstSeen time.Time `json:"first_seen"`
	LastSeen  time.Time `json:"last_seen"`
}

// ErrorAnalysisResponse is returned by Analytics.GetErrorAnalysis.
type ErrorAnalysisResponse struct {
	Errors []ErrorCluster `json:"errors"`
}

// DurationBucket is a histogram bucket.
type DurationBucket struct {
	Range string `json:"range"`
	MinMs int64  `json:"min_ms"`
	MaxMs int64  `json:"max_ms"`
	Count int    `json:"count"`
}

// DurationDistributionResponse is returned by Analytics.GetDurationDistribution.
type DurationDistributionResponse struct {
	Distribution []DurationBucket `json:"distribution"`
}

// ── Quality Gates ────────────────────────────────────────────────────────────

// QualityGateRule is a single rule in a quality gate. Params is an opaque
// JSON object whose shape depends on the rule type.
type QualityGateRule struct {
	Type   string          `json:"type"`
	Params json.RawMessage `json:"params"`
}

// QualityGate is a configured quality gate.
type QualityGate struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	TeamID      string          `json:"team_id"`
	Description string          `json:"description,omitempty"`
	Rules       json.RawMessage `json:"rules"`
	Enabled     bool            `json:"enabled"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// ListQualityGatesResponse is returned by QualityGates.List.
type ListQualityGatesResponse struct {
	QualityGates []QualityGate `json:"quality_gates"`
	Total        int           `json:"total"`
}

// QualityGateRuleResult is a single rule evaluation result.
type QualityGateRuleResult struct {
	Metric    string      `json:"metric"`
	Threshold interface{} `json:"threshold"`
	Actual    interface{} `json:"actual"`
	Passed    bool        `json:"passed"`
	Message   string      `json:"message"`
}

// QualityGateEvalRuleResult is a single rule result in an evaluation record.
type QualityGateEvalRuleResult struct {
	Type      string      `json:"type"`
	Passed    bool        `json:"passed"`
	Threshold interface{} `json:"threshold"`
	Actual    interface{} `json:"actual"`
	Message   string      `json:"message"`
}

// EvaluateQualityGateResponse is returned by QualityGates.Evaluate.
type EvaluateQualityGateResponse struct {
	ID       string                  `json:"id"`
	GateID   string                  `json:"gate_id"`
	ReportID string                  `json:"report_id"`
	Passed   bool                    `json:"passed"`
	Rules    []QualityGateRuleResult `json:"rules"`
}

// QualityGateEvaluation is a persisted evaluation record.
type QualityGateEvaluation struct {
	ID        string          `json:"id"`
	GateID    string          `json:"gate_id"`
	ReportID  string          `json:"report_id"`
	Passed    bool            `json:"passed"`
	Details   json.RawMessage `json:"details"`
	CreatedAt time.Time       `json:"created_at"`
}

// ListEvaluationsResponse is returned by QualityGates.ListEvaluations.
type ListEvaluationsResponse struct {
	Evaluations []QualityGateEvaluation `json:"evaluations"`
	Total       int                     `json:"total"`
}

// DeleteQualityGateResponse is returned by QualityGates.Delete.
type DeleteQualityGateResponse struct {
	Message string `json:"message"`
}

// ── Teams ────────────────────────────────────────────────────────────────────

// Team is a team record.
type Team struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// TeamWithRole is a team paired with the caller's role.
type TeamWithRole struct {
	Team
	Role string `json:"role"`
}

// ListTeamsResponse is returned by Teams.List.
type ListTeamsResponse struct {
	Teams []TeamWithRole `json:"teams"`
}

// GetTeamResponse is returned by Teams.Get.
type GetTeamResponse struct {
	Team Team   `json:"team"`
	Role string `json:"role"`
}

// DeleteTeamResponse is returned by Teams.Delete.
type DeleteTeamResponse struct {
	Message string `json:"message"`
}

// TeamToken is a (redacted) API token record.
type TeamToken struct {
	ID         string     `json:"id"`
	TeamID     string     `json:"team_id"`
	UserID     string     `json:"user_id"`
	Name       string     `json:"name"`
	Prefix     string     `json:"prefix"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// ListTokensResponse is returned by Teams.ListTokens.
type ListTokensResponse struct {
	Tokens []TeamToken `json:"tokens"`
}

// CreateTokenResponse is returned by Teams.CreateToken. The Token field
// contains the full token value and is only returned once at creation time.
type CreateTokenResponse struct {
	Token     string    `json:"token"`
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Prefix    string    `json:"prefix"`
	CreatedAt time.Time `json:"created_at"`
}

// DeleteTokenResponse is returned by Teams.DeleteToken.
type DeleteTokenResponse struct {
	Message string `json:"message"`
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

// WebhookEventType is a supported webhook event.
type WebhookEventType string

const (
	WebhookEventReportSubmitted    WebhookEventType = "report.submitted"
	WebhookEventGateFailed         WebhookEventType = "gate.failed"
	WebhookEventExecutionCompleted WebhookEventType = "execution.completed"
	WebhookEventExecutionFailed    WebhookEventType = "execution.failed"
	WebhookEventRunTriageComplete  WebhookEventType = "run.triage_complete"
)

// Webhook is a webhook subscription.
type Webhook struct {
	ID        string             `json:"id"`
	TeamID    string             `json:"team_id"`
	URL       string             `json:"url"`
	Events    []WebhookEventType `json:"events"`
	Enabled   bool               `json:"enabled"`
	CreatedAt time.Time          `json:"created_at"`
	UpdatedAt time.Time          `json:"updated_at"`
}

// ListWebhooksResponse is returned by Teams.ListWebhooks.
type ListWebhooksResponse struct {
	Webhooks []Webhook `json:"webhooks"`
	Total    int       `json:"total"`
}

// CreateWebhookResponse is returned by Teams.CreateWebhook. The Secret is
// only returned once at creation time.
type CreateWebhookResponse struct {
	Webhook Webhook `json:"webhook"`
	Secret  string  `json:"secret"`
}

// DeleteWebhookResponse is returned by Teams.DeleteWebhook.
type DeleteWebhookResponse struct {
	Message string `json:"message"`
}

// WebhookDelivery is a single delivery attempt record.
type WebhookDelivery struct {
	ID          string          `json:"id"`
	WebhookID   string          `json:"webhook_id"`
	URL         string          `json:"url"`
	EventType   string          `json:"event_type"`
	Attempt     int             `json:"attempt"`
	StatusCode  int             `json:"status_code"`
	DurationMs  int             `json:"duration_ms"`
	Error       string          `json:"error,omitempty"`
	Payload     json.RawMessage `json:"payload,omitempty"`
	DeliveredAt time.Time       `json:"delivered_at"`
}

// ListWebhookDeliveriesResponse is returned by Teams.ListWebhookDeliveries.
type ListWebhookDeliveriesResponse struct {
	Deliveries []WebhookDelivery `json:"deliveries"`
	Total      int               `json:"total"`
}

// RetryWebhookDeliveryResponse is returned by Teams.RetryWebhookDelivery.
type RetryWebhookDeliveryResponse struct {
	Success    bool   `json:"success"`
	StatusCode int    `json:"status_code"`
	Attempt    int    `json:"attempt"`
	DurationMs int    `json:"duration_ms"`
	Error      string `json:"error"`
}

// ── Invitations ──────────────────────────────────────────────────────────────

// Invitation is a pending or accepted team invitation.
type Invitation struct {
	ID         string     `json:"id"`
	TeamID     string     `json:"team_id"`
	Email      string     `json:"email"`
	Role       string     `json:"role"`
	InvitedBy  string     `json:"invited_by,omitempty"`
	ExpiresAt  time.Time  `json:"expires_at"`
	AcceptedAt *time.Time `json:"accepted_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// ListInvitationsResponse is returned by Teams.ListInvitations.
type ListInvitationsResponse struct {
	Invitations []Invitation `json:"invitations"`
}

// CreateInvitationResponse is returned by Teams.CreateInvitation. The Token
// is only returned once at creation time.
type CreateInvitationResponse struct {
	Invitation Invitation `json:"invitation"`
	Token      string     `json:"token"`
}

// InvitationPreview is returned by Teams.PreviewInvitation.
type InvitationPreview struct {
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	TeamName  string    `json:"team_name"`
	ExpiresAt time.Time `json:"expires_at"`
}

// AcceptInvitationResponse is returned by Teams.AcceptInvitation.
type AcceptInvitationResponse struct {
	Message string `json:"message"`
	UserID  string `json:"user_id"`
	TeamID  string `json:"team_id"`
	Role    string `json:"role"`
}

// RevokeInvitationResponse is returned by Teams.RevokeInvitation.
type RevokeInvitationResponse struct {
	Message string `json:"message"`
}

// ── Sharding ─────────────────────────────────────────────────────────────────

// Shard is one worker's assigned tests in a shard plan.
type Shard struct {
	WorkerID      string   `json:"worker_id"`
	TestNames     []string `json:"test_names"`
	EstDurationMs int64    `json:"est_duration_ms"`
	TestCount     int      `json:"test_count"`
}

// ShardPlan is the complete distribution plan for a sharded execution.
type ShardPlan struct {
	ExecutionID    string  `json:"execution_id"`
	TotalWorkers   int     `json:"total_workers"`
	Strategy       string  `json:"strategy"`
	Shards         []Shard `json:"shards"`
	EstTotalMs     int64   `json:"est_total_ms"`
	EstWallClockMs int64   `json:"est_wall_clock_ms"`
}

// CreateShardPlanRequest is the body for Sharding.CreatePlan.
type CreateShardPlanRequest struct {
	TestNames    []string            `json:"test_names"`
	NumWorkers   int                 `json:"num_workers"`
	Strategy     string              `json:"strategy,omitempty"`
	ExecutionID  string              `json:"execution_id,omitempty"`
	Dependencies map[string][]string `json:"dependencies,omitempty"`
}

// RebalanceShardsRequest is the body for Sharding.Rebalance.
type RebalanceShardsRequest struct {
	ExecutionID    string    `json:"execution_id"`
	FailedWorkerID string    `json:"failed_worker_id"`
	CurrentPlan    ShardPlan `json:"current_plan"`
	CompletedTests []string  `json:"completed_tests,omitempty"`
}

// TestDurationHistory is historical duration data for a single test.
type TestDurationHistory struct {
	ID            string    `json:"id"`
	TestName      string    `json:"test_name"`
	Suite         string    `json:"suite"`
	TeamID        string    `json:"team_id"`
	AvgDurationMs int64     `json:"avg_duration_ms"`
	MinDurationMs int64     `json:"min_duration_ms"`
	MaxDurationMs int64     `json:"max_duration_ms"`
	P95DurationMs int64     `json:"p95_duration_ms"`
	RunCount      int       `json:"run_count"`
	LastStatus    string    `json:"last_status"`
	UpdatedAt     time.Time `json:"updated_at"`
	CreatedAt     time.Time `json:"created_at"`
}

// ListShardDurationsResponse is returned by Sharding.ListDurations.
type ListShardDurationsResponse struct {
	Durations []TestDurationHistory `json:"durations"`
	Total     int                   `json:"total"`
}

// ── Auth ─────────────────────────────────────────────────────────────────────

// UserProfile is the authenticated user's profile.
type UserProfile struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
}

// AuthResponse is returned by Register and Login.
type AuthResponse struct {
	User        UserProfile `json:"user"`
	AccessToken string      `json:"access_token"`
	ExpiresAt   time.Time   `json:"expires_at"`
}

// RegisterRequest is the body for Auth.Register.
type RegisterRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

// LoginRequest is the body for Auth.Login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// RefreshTokenResponse is returned by Auth.Refresh. The ScaledTest API uses
// an HttpOnly refresh_token cookie for refresh; this struct captures only the
// JSON body. Callers using Refresh should provide the refresh token via
// WithRefreshToken on the request or by setting a cookie jar on the client.
type RefreshTokenResponse struct {
	User        UserProfile `json:"user"`
	AccessToken string      `json:"access_token"`
	ExpiresAt   time.Time   `json:"expires_at"`
}

// ChangePasswordRequest is the body for Auth.ChangePassword.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePasswordResponse is returned by Auth.ChangePassword.
type ChangePasswordResponse struct {
	Message string `json:"message"`
}

// UpdateProfileRequest is the body for Auth.UpdateProfile.
type UpdateProfileRequest struct {
	DisplayName string `json:"display_name"`
}

// ── Admin ────────────────────────────────────────────────────────────────────

// AdminUser is a user record returned by admin endpoints.
type AdminUser struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	Role        string    `json:"role"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ListUsersResponse is returned by Admin.ListUsers.
type ListUsersResponse struct {
	Users []AdminUser `json:"users"`
	Total int         `json:"total"`
}

// AuditLog is a single audit log entry.
type AuditLog struct {
	ID           string          `json:"id"`
	ActorID      string          `json:"actor_id"`
	ActorEmail   string          `json:"actor_email"`
	TeamID       string          `json:"team_id,omitempty"`
	TeamName     string          `json:"team_name,omitempty"`
	Action       string          `json:"action"`
	ResourceType string          `json:"resource_type,omitempty"`
	ResourceID   string          `json:"resource_id,omitempty"`
	Metadata     json.RawMessage `json:"metadata,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
}

// ListAuditLogResponse is returned by Admin.ListAuditLog.
type ListAuditLogResponse struct {
	AuditLog []AuditLog `json:"audit_log"`
	Total    int        `json:"total"`
}

// ── Health ───────────────────────────────────────────────────────────────────

// HealthResponse is returned by Health.Check.
type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
}

package model

import (
	"encoding/json"
	"net"
	"time"
)

// User represents an authenticated user.
type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	DisplayName  string    `json:"display_name"`
	Role         string    `json:"role"` // readonly, maintainer, owner
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// OAuthAccount links an external OAuth provider to a user.
type OAuthAccount struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	Provider     string    `json:"provider"` // github, google
	ProviderID   string    `json:"provider_id"`
	AccessToken  string    `json:"-"`
	RefreshToken string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

// Session represents a JWT refresh token session.
type Session struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	RefreshToken string    `json:"-"`
	UserAgent    string    `json:"user_agent,omitempty"`
	IPAddress    net.IP    `json:"ip_address,omitempty"`
	ExpiresAt    time.Time `json:"expires_at"`
	CreatedAt    time.Time `json:"created_at"`
}

// Team represents a team for multi-tenant scoping.
type Team struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// UserTeam represents a user's membership in a team.
type UserTeam struct {
	UserID   string    `json:"user_id"`
	TeamID   string    `json:"team_id"`
	Role     string    `json:"role"` // readonly, maintainer, owner
	JoinedAt time.Time `json:"joined_at"`
}

// APIToken represents an sct_* API token.
type APIToken struct {
	ID         string     `json:"id"`
	TeamID     string     `json:"team_id"`
	UserID     string     `json:"user_id"`
	Name       string     `json:"name"`
	TokenHash  string     `json:"-"`
	Prefix     string     `json:"prefix"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// TestExecution tracks a K8s Job-based test execution.
type TestExecution struct {
	ID         string           `json:"id"`
	TeamID     string           `json:"team_id"`
	Status     string           `json:"status"` // pending, running, completed, failed, cancelled
	Command    string           `json:"command"`
	Config     json.RawMessage  `json:"config,omitempty"`
	ReportID   *string          `json:"report_id,omitempty"`
	K8sJobName *string          `json:"k8s_job_name,omitempty"`
	K8sPodName *string          `json:"k8s_pod_name,omitempty"`
	ErrorMsg   *string          `json:"error_msg,omitempty"`
	StartedAt  *time.Time       `json:"started_at,omitempty"`
	FinishedAt *time.Time       `json:"finished_at,omitempty"`
	CreatedAt  time.Time        `json:"created_at"`
	UpdatedAt  time.Time        `json:"updated_at"`
}

// TestReport represents a CTRF test report.
type TestReport struct {
	ID          string          `json:"id"`
	TeamID      string          `json:"team_id"`
	ExecutionID *string         `json:"execution_id,omitempty"`
	ToolName    string          `json:"tool_name,omitempty"`
	ToolVersion string          `json:"tool_version,omitempty"`
	Environment json.RawMessage `json:"environment,omitempty"`
	Summary     json.RawMessage `json:"summary"`
	Raw         json.RawMessage `json:"-"`
	CreatedAt   time.Time       `json:"created_at"`
}

// ReportSummary is the parsed CTRF results summary.
type ReportSummary struct {
	Tests   int   `json:"tests"`
	Passed  int   `json:"passed"`
	Failed  int   `json:"failed"`
	Skipped int   `json:"skipped"`
	Pending int   `json:"pending"`
	Other   int   `json:"other"`
	Start   int64 `json:"start,omitempty"`
	Stop    int64 `json:"stop,omitempty"`
}

// TestResult is a normalized per-test row extracted from a CTRF report.
type TestResult struct {
	ID         string    `json:"id"`
	ReportID   string    `json:"report_id"`
	TeamID     string    `json:"team_id"`
	Name       string    `json:"name"`
	Status     string    `json:"status"` // passed, failed, skipped, pending, other
	DurationMs int64     `json:"duration_ms"`
	Message    string    `json:"message,omitempty"`
	Trace      string    `json:"trace,omitempty"`
	FilePath   string    `json:"file_path,omitempty"`
	Suite      string    `json:"suite,omitempty"`
	Tags       []string  `json:"tags,omitempty"`
	Retry      int       `json:"retry"`
	Flaky      bool      `json:"flaky"`
	CreatedAt  time.Time `json:"created_at"`
}

// QualityGate defines a set of rules to evaluate against test results.
type QualityGate struct {
	ID          string          `json:"id"`
	TeamID      string          `json:"team_id"`
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Rules       json.RawMessage `json:"rules"`
	Active      bool            `json:"active"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// QualityGateEvaluation records a pass/fail evaluation of a quality gate.
type QualityGateEvaluation struct {
	ID        string          `json:"id"`
	GateID    string          `json:"gate_id"`
	ReportID  string          `json:"report_id"`
	Passed    bool            `json:"passed"`
	Details   json.RawMessage `json:"details"`
	CreatedAt time.Time       `json:"created_at"`
}

// TestDurationHistory tracks historical test durations for intelligent sharding.
type TestDurationHistory struct {
	ID             string    `json:"id"`
	TeamID         string    `json:"team_id"`
	TestName       string    `json:"test_name"`
	Suite          string    `json:"suite"`
	AvgDurationMs  int64     `json:"avg_duration_ms"`
	P95DurationMs  int64     `json:"p95_duration_ms"`
	MinDurationMs  int64     `json:"min_duration_ms"`
	MaxDurationMs  int64     `json:"max_duration_ms"`
	RunCount       int       `json:"run_count"`
	LastStatus     string    `json:"last_status"`
	UpdatedAt      time.Time `json:"updated_at"`
	CreatedAt      time.Time `json:"created_at"`
}

// AuditLog records a user action for compliance and observability.
type AuditLog struct {
	ID           string          `json:"id"`
	ActorID      string          `json:"actor_id"`
	ActorEmail   string          `json:"actor_email"`
	TeamID       *string         `json:"team_id,omitempty"`
	Action       string          `json:"action"`
	ResourceType *string         `json:"resource_type,omitempty"`
	ResourceID   *string         `json:"resource_id,omitempty"`
	Metadata     json.RawMessage `json:"metadata,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
}

// ShardAssignment represents a test assigned to a specific worker shard.
type ShardAssignment struct {
	WorkerID       string `json:"worker_id"`
	TestName       string `json:"test_name"`
	Suite          string `json:"suite,omitempty"`
	EstDurationMs  int64  `json:"est_duration_ms"`
}

// ShardPlan is the complete distribution plan for a sharded execution.
type ShardPlan struct {
	ExecutionID    string            `json:"execution_id"`
	TotalWorkers   int               `json:"total_workers"`
	Strategy       string            `json:"strategy"` // duration_balanced, round_robin, suite_grouped
	Shards         []Shard           `json:"shards"`
	EstTotalMs     int64             `json:"est_total_ms"`
	EstWallClockMs int64             `json:"est_wall_clock_ms"`
}

// Shard represents one worker's assigned tests.
type Shard struct {
	WorkerID       string   `json:"worker_id"`
	TestNames      []string `json:"test_names"`
	EstDurationMs  int64    `json:"est_duration_ms"`
	TestCount      int      `json:"test_count"`
}

// Webhook represents a webhook subscription.
type Webhook struct {
	ID        string    `json:"id"`
	TeamID    string    `json:"team_id"`
	URL       string    `json:"url"`
	Events    []string  `json:"events"`
	Secret    string    `json:"-"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

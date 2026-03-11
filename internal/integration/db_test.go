//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/auth"
)

// --- User CRUD ---

func TestUserCreation(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	hash, err := auth.HashPassword("testpassword")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}

	userID := tdb.CreateUser(t, "alice@example.com", hash, "Alice", "maintainer")

	// Verify user was created
	var email, displayName, role string
	err = tdb.Pool.QueryRow(ctx,
		`SELECT email, display_name, role FROM users WHERE id = $1`, userID,
	).Scan(&email, &displayName, &role)
	if err != nil {
		t.Fatalf("query user: %v", err)
	}

	if email != "alice@example.com" {
		t.Errorf("email = %q, want %q", email, "alice@example.com")
	}
	if displayName != "Alice" {
		t.Errorf("display_name = %q, want %q", displayName, "Alice")
	}
	if role != "maintainer" {
		t.Errorf("role = %q, want %q", role, "maintainer")
	}
}

func TestUserUniqueEmail(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	tdb.CreateUser(t, "duplicate@example.com", "hash1", "User1", "maintainer")

	// Attempting to create a second user with the same email should fail
	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3)`,
		"duplicate@example.com", "hash2", "User2",
	)
	if err == nil {
		t.Fatal("expected unique constraint violation for duplicate email")
	}
}

func TestUserRoleConstraint(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	// Invalid role should fail check constraint
	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4)`,
		"bad@example.com", "hash", "Bad", "superadmin",
	)
	if err == nil {
		t.Fatal("expected check constraint violation for invalid role")
	}
}

func TestPasswordVerification(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	password := "securepassword123"
	hash, _ := auth.HashPassword(password)
	userID := tdb.CreateUser(t, "verify@example.com", hash, "Verify", "maintainer")

	// Fetch hash from DB and verify
	var storedHash string
	err := tdb.Pool.QueryRow(ctx,
		`SELECT password_hash FROM users WHERE id = $1`, userID,
	).Scan(&storedHash)
	if err != nil {
		t.Fatalf("query password_hash: %v", err)
	}

	if !auth.CheckPassword(password, storedHash) {
		t.Error("CheckPassword returned false for correct password")
	}
	if auth.CheckPassword("wrongpassword", storedHash) {
		t.Error("CheckPassword returned true for wrong password")
	}
}

// --- Session Management ---

func TestSessionCRUD(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	userID := tdb.CreateUser(t, "session@example.com", "hash", "Session", "maintainer")

	// Create session
	refreshToken := "test-refresh-token-abc123"
	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO sessions (user_id, refresh_token, user_agent, expires_at)
		 VALUES ($1, $2, $3, $4)`,
		userID, refreshToken, "TestAgent/1.0", expiresAt,
	)
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	// Look up session by refresh token
	var foundUserID string
	var foundExpires time.Time
	err = tdb.Pool.QueryRow(ctx,
		`SELECT user_id, expires_at FROM sessions WHERE refresh_token = $1`,
		refreshToken,
	).Scan(&foundUserID, &foundExpires)
	if err != nil {
		t.Fatalf("query session: %v", err)
	}
	if foundUserID != userID {
		t.Errorf("session user_id = %q, want %q", foundUserID, userID)
	}

	// Delete session (logout)
	tag, err := tdb.Pool.Exec(ctx,
		`DELETE FROM sessions WHERE refresh_token = $1`, refreshToken,
	)
	if err != nil {
		t.Fatalf("delete session: %v", err)
	}
	if tag.RowsAffected() != 1 {
		t.Errorf("delete affected %d rows, want 1", tag.RowsAffected())
	}
}

func TestSessionCascadeOnUserDelete(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	userID := tdb.CreateUser(t, "cascade@example.com", "hash", "Cascade", "maintainer")

	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO sessions (user_id, refresh_token, expires_at)
		 VALUES ($1, $2, $3)`,
		userID, "cascade-token", time.Now().Add(time.Hour),
	)
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	// Delete user — session should cascade
	_, err = tdb.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		t.Fatalf("delete user: %v", err)
	}

	var count int
	tdb.Pool.QueryRow(ctx, `SELECT count(*) FROM sessions WHERE user_id = $1`, userID).Scan(&count)
	if count != 0 {
		t.Errorf("sessions remaining after user delete: %d, want 0", count)
	}
}

// --- Teams & User-Teams ---

func TestTeamCRUD(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Test Team Alpha")

	var name string
	err := tdb.Pool.QueryRow(ctx, `SELECT name FROM teams WHERE id = $1`, teamID).Scan(&name)
	if err != nil {
		t.Fatalf("query team: %v", err)
	}
	if name != "Test Team Alpha" {
		t.Errorf("team name = %q, want %q", name, "Test Team Alpha")
	}
}

func TestUserTeamMembership(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	userID := tdb.CreateUser(t, "member@example.com", "hash", "Member", "maintainer")
	teamA := tdb.CreateTeam(t, "Team A")
	teamB := tdb.CreateTeam(t, "Team B")

	tdb.AddUserToTeam(t, userID, teamA, "owner")
	tdb.AddUserToTeam(t, userID, teamB, "readonly")

	// Query memberships
	rows, err := tdb.Pool.Query(ctx,
		`SELECT team_id, role FROM user_teams WHERE user_id = $1 ORDER BY role`, userID,
	)
	if err != nil {
		t.Fatalf("query memberships: %v", err)
	}
	defer rows.Close()

	var memberships []struct{ TeamID, Role string }
	for rows.Next() {
		var m struct{ TeamID, Role string }
		if err := rows.Scan(&m.TeamID, &m.Role); err != nil {
			t.Fatalf("scan: %v", err)
		}
		memberships = append(memberships, m)
	}

	if len(memberships) != 2 {
		t.Fatalf("memberships count = %d, want 2", len(memberships))
	}
}

// --- Test Executions ---

func TestExecutionCRUD(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Exec Team")

	// Create execution
	var execID string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_executions (team_id, command, config)
		 VALUES ($1, $2, $3)
		 RETURNING id`,
		teamID, "npm run test", `{"image": "node:20"}`,
	).Scan(&execID)
	if err != nil {
		t.Fatalf("create execution: %v", err)
	}

	// Verify default status is pending
	var status string
	err = tdb.Pool.QueryRow(ctx,
		`SELECT status FROM test_executions WHERE id = $1`, execID,
	).Scan(&status)
	if err != nil {
		t.Fatalf("query execution: %v", err)
	}
	if status != "pending" {
		t.Errorf("default status = %q, want %q", status, "pending")
	}

	// Update status to running
	_, err = tdb.Pool.Exec(ctx,
		`UPDATE test_executions SET status = 'running', started_at = now(), updated_at = now()
		 WHERE id = $1`, execID,
	)
	if err != nil {
		t.Fatalf("update execution: %v", err)
	}

	// Update to completed
	_, err = tdb.Pool.Exec(ctx,
		`UPDATE test_executions SET status = 'completed', finished_at = now(), updated_at = now()
		 WHERE id = $1`, execID,
	)
	if err != nil {
		t.Fatalf("complete execution: %v", err)
	}

	err = tdb.Pool.QueryRow(ctx,
		`SELECT status FROM test_executions WHERE id = $1`, execID,
	).Scan(&status)
	if err != nil {
		t.Fatalf("query final status: %v", err)
	}
	if status != "completed" {
		t.Errorf("final status = %q, want %q", status, "completed")
	}
}

func TestExecutionStatusConstraint(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Status Team")

	// Invalid status should fail
	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO test_executions (team_id, command, status) VALUES ($1, $2, $3)`,
		teamID, "test", "invalid_status",
	)
	if err == nil {
		t.Fatal("expected check constraint violation for invalid status")
	}
}

// --- Report Ingestion ---

func TestReportIngestion(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Report Team")

	summary := map[string]interface{}{
		"tests": 5, "passed": 3, "failed": 1, "skipped": 1, "pending": 0, "other": 0,
	}
	summaryJSON, _ := json.Marshal(summary)

	rawReport := map[string]interface{}{
		"results": map[string]interface{}{
			"tool":    map[string]string{"name": "jest", "version": "29.0"},
			"summary": summary,
			"tests": []map[string]interface{}{
				{"name": "test1", "status": "passed", "duration": 100},
				{"name": "test2", "status": "failed", "duration": 200, "message": "assertion failed"},
				{"name": "test3", "status": "passed", "duration": 50},
				{"name": "test4", "status": "passed", "duration": 75},
				{"name": "test5", "status": "skipped", "duration": 0},
			},
		},
	}
	rawJSON, _ := json.Marshal(rawReport)

	// Insert report
	var reportID string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, tool_version, summary, raw)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id`,
		teamID, "jest", "29.0", summaryJSON, rawJSON,
	).Scan(&reportID)
	if err != nil {
		t.Fatalf("insert report: %v", err)
	}

	// Insert test results
	tests := []struct {
		name       string
		status     string
		durationMs int64
		message    string
	}{
		{"test1", "passed", 100, ""},
		{"test2", "failed", 200, "assertion failed"},
		{"test3", "passed", 50, ""},
		{"test4", "passed", 75, ""},
		{"test5", "skipped", 0, ""},
	}

	for _, tt := range tests {
		_, err := tdb.Pool.Exec(ctx,
			`INSERT INTO test_results (report_id, team_id, name, status, duration_ms, message)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			reportID, teamID, tt.name, tt.status, tt.durationMs, tt.message,
		)
		if err != nil {
			t.Fatalf("insert test result %s: %v", tt.name, err)
		}
	}

	// Query report and verify
	var toolName string
	var storedSummary json.RawMessage
	err = tdb.Pool.QueryRow(ctx,
		`SELECT tool_name, summary FROM test_reports WHERE id = $1`, reportID,
	).Scan(&toolName, &storedSummary)
	if err != nil {
		t.Fatalf("query report: %v", err)
	}
	if toolName != "jest" {
		t.Errorf("tool_name = %q, want %q", toolName, "jest")
	}

	// Verify test results count
	var resultCount int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE report_id = $1`, reportID,
	).Scan(&resultCount)
	if resultCount != 5 {
		t.Errorf("test results count = %d, want 5", resultCount)
	}

	// Verify status breakdown
	var passedCount, failedCount, skippedCount int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE report_id = $1 AND status = 'passed'`, reportID,
	).Scan(&passedCount)
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE report_id = $1 AND status = 'failed'`, reportID,
	).Scan(&failedCount)
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE report_id = $1 AND status = 'skipped'`, reportID,
	).Scan(&skippedCount)

	if passedCount != 3 {
		t.Errorf("passed = %d, want 3", passedCount)
	}
	if failedCount != 1 {
		t.Errorf("failed = %d, want 1", failedCount)
	}
	if skippedCount != 1 {
		t.Errorf("skipped = %d, want 1", skippedCount)
	}
}

func TestReportLinkedToExecution(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Linked Team")

	// Create execution
	var execID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_executions (team_id, command) VALUES ($1, $2) RETURNING id`,
		teamID, "npm test",
	).Scan(&execID)

	// Create report linked to execution
	var reportID string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, execution_id, tool_name, summary, raw)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id`,
		teamID, execID, "jest", `{"tests":1}`, `{"results":{}}`,
	).Scan(&reportID)
	if err != nil {
		t.Fatalf("insert linked report: %v", err)
	}

	// Verify link
	var linkedExecID string
	tdb.Pool.QueryRow(ctx,
		`SELECT execution_id FROM test_reports WHERE id = $1`, reportID,
	).Scan(&linkedExecID)
	if linkedExecID != execID {
		t.Errorf("execution_id = %q, want %q", linkedExecID, execID)
	}
}

func TestResultStatusConstraint(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Constraint Team")

	var reportID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		teamID, "jest", `{"tests":1}`, `{}`,
	).Scan(&reportID)

	// Invalid test result status
	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status) VALUES ($1, $2, $3, $4)`,
		reportID, teamID, "bad_test", "invalid_status",
	)
	if err == nil {
		t.Fatal("expected check constraint violation for invalid test result status")
	}
}

// --- Team Isolation ---

func TestTeamIsolationExecutions(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamA := tdb.CreateTeam(t, "Team Alpha")
	teamB := tdb.CreateTeam(t, "Team Beta")

	// Create executions in each team
	var execA, execB string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_executions (team_id, command) VALUES ($1, $2) RETURNING id`,
		teamA, "test-alpha",
	).Scan(&execA)
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_executions (team_id, command) VALUES ($1, $2) RETURNING id`,
		teamB, "test-beta",
	).Scan(&execB)

	// Query filtered by team A — should only see team A's execution
	var count int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_executions WHERE team_id = $1`, teamA,
	).Scan(&count)
	if count != 1 {
		t.Errorf("team A executions = %d, want 1", count)
	}

	// Verify team A can't see team B's data
	var foundID string
	err := tdb.Pool.QueryRow(ctx,
		`SELECT id FROM test_executions WHERE id = $1 AND team_id = $2`, execB, teamA,
	).Scan(&foundID)
	if err == nil {
		t.Error("team A should not be able to query team B's execution")
	}
}

func TestTeamIsolationReports(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamA := tdb.CreateTeam(t, "Report Team A")
	teamB := tdb.CreateTeam(t, "Report Team B")

	// Insert reports for each team
	for i := 0; i < 3; i++ {
		tdb.Pool.Exec(ctx,
			`INSERT INTO test_reports (team_id, tool_name, summary, raw)
			 VALUES ($1, $2, $3, $4)`,
			teamA, "jest", `{"tests":1}`, `{}`,
		)
	}
	for i := 0; i < 2; i++ {
		tdb.Pool.Exec(ctx,
			`INSERT INTO test_reports (team_id, tool_name, summary, raw)
			 VALUES ($1, $2, $3, $4)`,
			teamB, "pytest", `{"tests":1}`, `{}`,
		)
	}

	// Verify team-scoped counts
	var countA, countB int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_reports WHERE team_id = $1`, teamA,
	).Scan(&countA)
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_reports WHERE team_id = $1`, teamB,
	).Scan(&countB)

	if countA != 3 {
		t.Errorf("team A reports = %d, want 3", countA)
	}
	if countB != 2 {
		t.Errorf("team B reports = %d, want 2", countB)
	}
}

func TestTeamIsolationTestResults(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamA := tdb.CreateTeam(t, "Results Team A")
	teamB := tdb.CreateTeam(t, "Results Team B")

	// Create reports and results for each team
	var reportA, reportB string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw) VALUES ($1, $2, $3, $4) RETURNING id`,
		teamA, "jest", `{"tests":2}`, `{}`,
	).Scan(&reportA)
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw) VALUES ($1, $2, $3, $4) RETURNING id`,
		teamB, "pytest", `{"tests":1}`, `{}`,
	).Scan(&reportB)

	tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status, duration_ms) VALUES ($1, $2, $3, $4, $5)`,
		reportA, teamA, "alpha_test_1", "passed", 100,
	)
	tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status, duration_ms) VALUES ($1, $2, $3, $4, $5)`,
		reportA, teamA, "alpha_test_2", "failed", 200,
	)
	tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status, duration_ms) VALUES ($1, $2, $3, $4, $5)`,
		reportB, teamB, "beta_test_1", "passed", 50,
	)

	// Team A should see only its results
	var countA int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE team_id = $1`, teamA,
	).Scan(&countA)
	if countA != 2 {
		t.Errorf("team A results = %d, want 2", countA)
	}

	// Team B should see only its results
	var countB int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM test_results WHERE team_id = $1`, teamB,
	).Scan(&countB)
	if countB != 1 {
		t.Errorf("team B results = %d, want 1", countB)
	}
}

func TestTeamIsolationQualityGates(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamA := tdb.CreateTeam(t, "QG Team A")
	teamB := tdb.CreateTeam(t, "QG Team B")

	// Create quality gates for each team
	tdb.Pool.Exec(ctx,
		`INSERT INTO quality_gates (team_id, name, rules) VALUES ($1, $2, $3)`,
		teamA, "Alpha Gate", `[{"type":"pass_rate","params":{"min":90}}]`,
	)
	tdb.Pool.Exec(ctx,
		`INSERT INTO quality_gates (team_id, name, rules) VALUES ($1, $2, $3)`,
		teamB, "Beta Gate", `[{"type":"pass_rate","params":{"min":95}}]`,
	)

	var countA, countB int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM quality_gates WHERE team_id = $1`, teamA,
	).Scan(&countA)
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM quality_gates WHERE team_id = $1`, teamB,
	).Scan(&countB)

	if countA != 1 {
		t.Errorf("team A quality gates = %d, want 1", countA)
	}
	if countB != 1 {
		t.Errorf("team B quality gates = %d, want 1", countB)
	}
}

// --- Analytics Queries ---

func TestAnalyticsTrendQuery(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Analytics Team")

	// Insert multiple reports over time
	for i := 0; i < 5; i++ {
		summary := map[string]interface{}{
			"tests": 10, "passed": 10 - i, "failed": i, "skipped": 0, "pending": 0, "other": 0,
		}
		summaryJSON, _ := json.Marshal(summary)

		tdb.Pool.Exec(ctx,
			`INSERT INTO test_reports (team_id, tool_name, summary, raw, created_at)
			 VALUES ($1, $2, $3, $4, now() - $5::interval)`,
			teamID, "jest", summaryJSON, `{}`, time.Duration(i)*24*time.Hour,
		)
	}

	// Query: get reports ordered by time for trend analysis
	rows, err := tdb.Pool.Query(ctx,
		`SELECT summary->>'passed' as passed, summary->>'failed' as failed
		 FROM test_reports
		 WHERE team_id = $1
		 ORDER BY created_at ASC`, teamID,
	)
	if err != nil {
		t.Fatalf("trend query: %v", err)
	}
	defer rows.Close()

	var count int
	for rows.Next() {
		var passed, failed string
		rows.Scan(&passed, &failed)
		count++
	}
	if count != 5 {
		t.Errorf("trend data points = %d, want 5", count)
	}
}

func TestAnalyticsFlakyTestDetection(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Flaky Team")

	// Create two reports
	var reportID1, reportID2 string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw) VALUES ($1, $2, $3, $4) RETURNING id`,
		teamID, "jest", `{"tests":2}`, `{}`,
	).Scan(&reportID1)
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw) VALUES ($1, $2, $3, $4) RETURNING id`,
		teamID, "jest", `{"tests":2}`, `{}`,
	).Scan(&reportID2)

	// Same test, different outcomes → flaky
	tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status, duration_ms)
		 VALUES ($1, $2, $3, $4, $5)`,
		reportID1, teamID, "flaky_test", "passed", 100,
	)
	tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status, duration_ms)
		 VALUES ($1, $2, $3, $4, $5)`,
		reportID2, teamID, "flaky_test", "failed", 150,
	)

	// A stable test for comparison
	tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status, duration_ms)
		 VALUES ($1, $2, $3, $4, $5)`,
		reportID1, teamID, "stable_test", "passed", 50,
	)
	tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status, duration_ms)
		 VALUES ($1, $2, $3, $4, $5)`,
		reportID2, teamID, "stable_test", "passed", 55,
	)

	// Query for flaky tests: tests with both passed and failed results
	rows, err := tdb.Pool.Query(ctx,
		`SELECT name, count(DISTINCT status) as status_count
		 FROM test_results
		 WHERE team_id = $1
		 GROUP BY name
		 HAVING count(DISTINCT status) > 1`, teamID,
	)
	if err != nil {
		t.Fatalf("flaky query: %v", err)
	}
	defer rows.Close()

	var flakyTests []string
	for rows.Next() {
		var name string
		var statusCount int
		rows.Scan(&name, &statusCount)
		flakyTests = append(flakyTests, name)
	}

	if len(flakyTests) != 1 || flakyTests[0] != "flaky_test" {
		t.Errorf("flaky tests = %v, want [flaky_test]", flakyTests)
	}
}

func TestAnalyticsDurationDistribution(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Duration Team")

	var reportID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw) VALUES ($1, $2, $3, $4) RETURNING id`,
		teamID, "jest", `{"tests":4}`, `{}`,
	).Scan(&reportID)

	// Insert tests with varying durations
	durations := []int64{10, 50, 100, 500, 1000, 5000}
	for i, d := range durations {
		tdb.Pool.Exec(ctx,
			`INSERT INTO test_results (report_id, team_id, name, status, duration_ms)
			 VALUES ($1, $2, $3, $4, $5)`,
			reportID, teamID, fmt.Sprintf("test_%d", i), "passed", d,
		)
	}

	// Query duration statistics
	var avgDuration, minDuration, maxDuration float64
	err := tdb.Pool.QueryRow(ctx,
		`SELECT avg(duration_ms), min(duration_ms), max(duration_ms)
		 FROM test_results WHERE team_id = $1`, teamID,
	).Scan(&avgDuration, &minDuration, &maxDuration)
	if err != nil {
		t.Fatalf("duration stats query: %v", err)
	}

	if minDuration != 10 {
		t.Errorf("min duration = %v, want 10", minDuration)
	}
	if maxDuration != 5000 {
		t.Errorf("max duration = %v, want 5000", maxDuration)
	}
}

// --- API Tokens ---

func TestAPITokenCRUD(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	userID := tdb.CreateUser(t, "tokenuser@example.com", "hash", "TokenUser", "maintainer")
	teamID := tdb.CreateTeam(t, "Token Team")
	tdb.AddUserToTeam(t, userID, teamID, "maintainer")

	// Generate token
	result, err := auth.GenerateAPIToken()
	if err != nil {
		t.Fatalf("generate API token: %v", err)
	}

	// Store in DB
	_, err = tdb.Pool.Exec(ctx,
		`INSERT INTO api_tokens (team_id, user_id, name, token_hash, prefix)
		 VALUES ($1, $2, $3, $4, $5)`,
		teamID, userID, "CI Token", result.Hash, result.Prefix,
	)
	if err != nil {
		t.Fatalf("insert API token: %v", err)
	}

	// Look up by hash (simulating auth middleware)
	computedHash := auth.HashAPIToken(result.Token)
	var foundTeamID, foundUserID string
	err = tdb.Pool.QueryRow(ctx,
		`SELECT team_id, user_id FROM api_tokens WHERE token_hash = $1`, computedHash,
	).Scan(&foundTeamID, &foundUserID)
	if err != nil {
		t.Fatalf("lookup API token: %v", err)
	}
	if foundTeamID != teamID {
		t.Errorf("token team_id = %q, want %q", foundTeamID, teamID)
	}
	if foundUserID != userID {
		t.Errorf("token user_id = %q, want %q", foundUserID, userID)
	}
}

// --- Quality Gate Evaluation ---

func TestQualityGateEvaluation(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "QG Eval Team")

	// Create quality gate
	var gateID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO quality_gates (team_id, name, rules)
		 VALUES ($1, $2, $3) RETURNING id`,
		teamID, "Pass Rate Gate", `[{"type":"pass_rate","params":{"min":80}}]`,
	).Scan(&gateID)

	// Create report
	var reportID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		teamID, "jest", `{"tests":10,"passed":9,"failed":1}`, `{}`,
	).Scan(&reportID)

	// Record evaluation
	details := `[{"rule":"pass_rate","passed":true,"actual":90,"threshold":80}]`
	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO quality_gate_evaluations (gate_id, report_id, passed, details)
		 VALUES ($1, $2, $3, $4)`,
		gateID, reportID, true, details,
	)
	if err != nil {
		t.Fatalf("insert evaluation: %v", err)
	}

	// Query evaluation
	var passed bool
	var storedDetails json.RawMessage
	err = tdb.Pool.QueryRow(ctx,
		`SELECT passed, details FROM quality_gate_evaluations
		 WHERE gate_id = $1 AND report_id = $2`, gateID, reportID,
	).Scan(&passed, &storedDetails)
	if err != nil {
		t.Fatalf("query evaluation: %v", err)
	}
	if !passed {
		t.Error("evaluation should have passed")
	}
}

// --- Cascade Deletes ---

func TestTeamDeleteCascade(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Cascade Team")
	userID := tdb.CreateUser(t, "cascade-team@example.com", "hash", "CascadeUser", "maintainer")
	tdb.AddUserToTeam(t, userID, teamID, "owner")

	// Create resources under the team
	tdb.Pool.Exec(ctx,
		`INSERT INTO test_executions (team_id, command) VALUES ($1, $2)`, teamID, "test",
	)
	var reportID string
	tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw) VALUES ($1, $2, $3, $4) RETURNING id`,
		teamID, "jest", `{"tests":1}`, `{}`,
	).Scan(&reportID)
	tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status) VALUES ($1, $2, $3, $4)`,
		reportID, teamID, "test1", "passed",
	)
	tdb.Pool.Exec(ctx,
		`INSERT INTO quality_gates (team_id, name, rules) VALUES ($1, $2, $3)`,
		teamID, "Gate", `[]`,
	)

	// Delete team
	_, err := tdb.Pool.Exec(ctx, `DELETE FROM teams WHERE id = $1`, teamID)
	if err != nil {
		t.Fatalf("delete team: %v", err)
	}

	// Verify all team resources were cascaded
	tables := []string{"test_executions", "test_reports", "test_results", "quality_gates", "user_teams"}
	for _, table := range tables {
		var count int
		tdb.Pool.QueryRow(ctx,
			fmt.Sprintf(`SELECT count(*) FROM %s WHERE team_id = $1`, table), teamID,
		).Scan(&count)
		if count != 0 {
			t.Errorf("after team delete, %s has %d rows (want 0)", table, count)
		}
	}
}

// --- Webhook CRUD ---

func TestWebhookCRUD(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	teamID := tdb.CreateTeam(t, "Webhook Team")

	// Create webhook
	var webhookID string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO webhooks (team_id, url, events, secret)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		teamID, "https://example.com/webhook", `{report.created,execution.completed}`, "webhook-secret",
	).Scan(&webhookID)
	if err != nil {
		t.Fatalf("insert webhook: %v", err)
	}

	// Query active webhooks for team
	var url string
	var active bool
	err = tdb.Pool.QueryRow(ctx,
		`SELECT url, active FROM webhooks WHERE team_id = $1 AND active = true`, teamID,
	).Scan(&url, &active)
	if err != nil {
		t.Fatalf("query webhook: %v", err)
	}
	if url != "https://example.com/webhook" {
		t.Errorf("webhook url = %q", url)
	}
	if !active {
		t.Error("webhook should be active by default")
	}

	// Deactivate
	_, err = tdb.Pool.Exec(ctx,
		`UPDATE webhooks SET active = false WHERE id = $1`, webhookID,
	)
	if err != nil {
		t.Fatalf("deactivate webhook: %v", err)
	}

	// Verify no active webhooks
	var count int
	tdb.Pool.QueryRow(ctx,
		`SELECT count(*) FROM webhooks WHERE team_id = $1 AND active = true`, teamID,
	).Scan(&count)
	if count != 0 {
		t.Errorf("active webhooks after deactivation = %d, want 0", count)
	}
}

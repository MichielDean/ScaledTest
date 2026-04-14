//go:build integration

// Package integration provides a test harness for running integration tests
// against a real PostgreSQL/TimescaleDB instance.
//
// Tests require TEST_DATABASE_URL to be set (e.g., postgres://user:pass@localhost:5432/scaledtest_test).
// The harness runs all migrations and provides cleanup between tests.
package integration

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/db"
)

var (
	migrateOnce sync.Once
	migrateErr  error
)

// TestDB wraps a pgxpool.Pool for integration testing.
type TestDB struct {
	Pool *db.Pool
	URL  string
}

// Setup connects to the test database and runs all migrations.
// It skips the test if TEST_DATABASE_URL is not set.
// Migrations are run once per package via sync.Once to avoid repeated work
// and migration locking contention when tests run in parallel.
func Setup(t *testing.T) *TestDB {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set, skipping integration test")
	}

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("connect to test database: %v", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Fatalf("ping test database: %v", err)
	}

	// Run migrations once per package.
	// If the database is dirty from a prior partial migration, drop everything and retry.
	migrateOnce.Do(func() {
		migrateErr = db.MigrateUp(url)
		if migrateErr != nil && strings.Contains(migrateErr.Error(), "Dirty") {
			log.Warn().Err(migrateErr).Msg("dirty database detected, dropping and retrying migrations")
			if dropErr := db.MigrateDrop(url); dropErr != nil {
				migrateErr = fmt.Errorf("drop dirty database: %w", dropErr)
				return
			}
			migrateErr = db.MigrateUp(url)
		}
	})
	if migrateErr != nil {
		pool.Close()
		t.Fatalf("run migrations: %v", migrateErr)
	}

	tdb := &TestDB{Pool: pool, URL: url}

	t.Cleanup(func() {
		tdb.Truncate(t)
		pool.Close()
	})

	// Start clean
	tdb.Truncate(t)

	return tdb
}

// truncateTables is the list of application tables to clean between tests.
var truncateTables = []string{
	"audit_logs",
	"quality_gate_evaluations",
	"quality_gates",
	"webhook_deliveries",
	"webhooks",
	"triage_failure_classifications",
	"triage_clusters",
	"triage_results",
	"test_duration_history",
	"test_results",
	"test_reports",
	"test_executions",
	"api_tokens",
	"invitations",
	"user_teams",
	"sessions",
	"oauth_accounts",
	"teams",
	"users",
}

// Truncate removes all data from all application tables (preserving schema).
// Uses TRUNCATE ... CASCADE for speed and to avoid FK-order issues.
func (tdb *TestDB) Truncate(t *testing.T) {
	t.Helper()

	ctx := context.Background()
	stmt := fmt.Sprintf("TRUNCATE %s RESTART IDENTITY CASCADE", strings.Join(truncateTables, ", "))
	_, err := tdb.Pool.Exec(ctx, stmt)
	if err != nil {
		t.Fatalf("truncate tables: %v", err)
	}
}

// CreateUser inserts a test user and returns the user ID.
func (tdb *TestDB) CreateUser(t *testing.T, email, passwordHash, displayName, role string) string {
	t.Helper()

	var id string
	err := tdb.Pool.QueryRow(context.Background(),
		`INSERT INTO users (email, password_hash, display_name, role)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id`,
		email, passwordHash, displayName, role,
	).Scan(&id)
	if err != nil {
		t.Fatalf("create user %s: %v", email, err)
	}
	return id
}

// CreateTeam inserts a test team and returns the team ID.
func (tdb *TestDB) CreateTeam(t *testing.T, name string) string {
	t.Helper()

	var id string
	err := tdb.Pool.QueryRow(context.Background(),
		`INSERT INTO teams (name) VALUES ($1) RETURNING id`, name,
	).Scan(&id)
	if err != nil {
		t.Fatalf("create team %s: %v", name, err)
	}
	return id
}

// AddUserToTeam adds a user to a team with the given role.
func (tdb *TestDB) AddUserToTeam(t *testing.T, userID, teamID, role string) {
	t.Helper()

	_, err := tdb.Pool.Exec(context.Background(),
		`INSERT INTO user_teams (user_id, team_id, role) VALUES ($1, $2, $3)`,
		userID, teamID, role,
	)
	if err != nil {
		t.Fatalf("add user %s to team %s: %v", userID, teamID, err)
	}
}

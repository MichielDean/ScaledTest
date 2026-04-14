package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/model"
)

// DBTX is the common interface satisfied by pgxpool.Pool and pgx.Tx.
type DBTX interface {
	Exec(ctx context.Context, sql string, arguments ...interface{}) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, optionsAndArgs ...interface{}) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, optionsAndArgs ...interface{}) pgx.Row
}

// DurationStore handles test duration history persistence.
type DurationStore struct {
	pool *pgxpool.Pool
}

// NewDurationStore creates a new duration store.
func NewDurationStore(pool *pgxpool.Pool) *DurationStore {
	return &DurationStore{pool: pool}
}

// GetByTeam returns all duration history entries for a team.
func (s *DurationStore) GetByTeam(ctx context.Context, teamID string) ([]model.TestDurationHistory, error) {
	return queryDurations(ctx, s.pool,
		`SELECT id, team_id, test_name, suite, avg_duration_ms, p95_duration_ms,
		        min_duration_ms, max_duration_ms, run_count, last_status, updated_at, created_at
		 FROM test_duration_history
		 WHERE team_id = $1
		 ORDER BY test_name`, teamID)
}

// GetByTeamAndTest returns duration history entries for a specific test name within a team.
func (s *DurationStore) GetByTeamAndTest(ctx context.Context, teamID, testName string) ([]model.TestDurationHistory, error) {
	return queryDurations(ctx, s.pool,
		`SELECT id, team_id, test_name, suite, avg_duration_ms, p95_duration_ms,
		        min_duration_ms, max_duration_ms, run_count, last_status, updated_at, created_at
		 FROM test_duration_history
		 WHERE team_id = $1 AND test_name = $2
		 ORDER BY suite`, teamID, testName)
}

// DurationMapKey returns a unique key for a test duration entry combining
// test name and suite. This avoids collisions when the same test name appears
// in multiple suites — the database UNIQUE constraint is (team_id, test_name, suite).
func DurationMapKey(testName, suite string) string {
	return testName + "\x00" + suite
}

// GetByTeamMap returns duration history as a map keyed by composite "testName\x00suite".
// This preserves all entries including same-named tests across different suites.
func (s *DurationStore) GetByTeamMap(ctx context.Context, teamID string) (map[string]*model.TestDurationHistory, error) {
	entries, err := s.GetByTeam(ctx, teamID)
	if err != nil {
		return nil, err
	}
	m := make(map[string]*model.TestDurationHistory, len(entries))
	for i := range entries {
		m[DurationMapKey(entries[i].TestName, entries[i].Suite)] = &entries[i]
	}
	return m, nil
}

// UpsertFromResults updates duration history from a set of test results.
// Uses a rolling average: new_avg = ((old_avg * old_count) + new_duration) / (old_count + 1).
// When db is a pgx.Tx the caller is responsible for committing the transaction.
// When db is a pgxpool.Pool this method creates and commits its own transaction.
func (s *DurationStore) UpsertFromResults(ctx context.Context, teamID string, results []model.TestResult, db DBTX) error {
	if len(results) == 0 {
		return nil
	}

	shouldCommit := false
	var tx pgx.Tx
	var err error

	switch d := db.(type) {
	case *pgxpool.Pool:
		tx, err = d.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin tx: %w", err)
		}
		defer tx.Rollback(ctx)
		shouldCommit = true
	case pgx.Tx:
		tx = d
	default:
		return fmt.Errorf("UpsertFromResults: unsupported DBTX type %T", db)
	}

	for _, r := range results {
		_, err := tx.Exec(ctx,
			`INSERT INTO test_duration_history (team_id, test_name, suite, avg_duration_ms, p95_duration_ms,
			     min_duration_ms, max_duration_ms, run_count, last_status, updated_at)
			 VALUES ($1, $2, $3, $4, $4, $4, $4, 1, $5, now())
			 ON CONFLICT (team_id, test_name, suite)
			 DO UPDATE SET
			     avg_duration_ms = (test_duration_history.avg_duration_ms * test_duration_history.run_count + $4) / (test_duration_history.run_count + 1),
			     p95_duration_ms = GREATEST(test_duration_history.p95_duration_ms, $4),
			     min_duration_ms = LEAST(test_duration_history.min_duration_ms, $4),
			     max_duration_ms = GREATEST(test_duration_history.max_duration_ms, $4),
			     run_count = test_duration_history.run_count + 1,
			     last_status = $5,
			     updated_at = now()`,
			teamID, r.Name, r.Suite, r.DurationMs, r.Status,
		)
		if err != nil {
			return fmt.Errorf("upsert duration for %q: %w", r.Name, err)
		}
	}

	if shouldCommit {
		return tx.Commit(ctx)
	}
	return nil
}

// GetBySuite returns duration history for tests in a specific suite.
func (s *DurationStore) GetBySuite(ctx context.Context, teamID, suite string) ([]model.TestDurationHistory, error) {
	return queryDurations(ctx, s.pool,
		`SELECT id, team_id, test_name, suite, avg_duration_ms, p95_duration_ms,
		        min_duration_ms, max_duration_ms, run_count, last_status, updated_at, created_at
		 FROM test_duration_history
		 WHERE team_id = $1 AND suite = $2
		 ORDER BY avg_duration_ms DESC`, teamID, suite)
}

func queryDurations(ctx context.Context, db DBTX, query string, args ...interface{}) ([]model.TestDurationHistory, error) {
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query duration history: %w", err)
	}
	defer rows.Close()

	var results []model.TestDurationHistory
	for rows.Next() {
		var d model.TestDurationHistory
		if err := rows.Scan(
			&d.ID, &d.TeamID, &d.TestName, &d.Suite,
			&d.AvgDurationMs, &d.P95DurationMs, &d.MinDurationMs, &d.MaxDurationMs,
			&d.RunCount, &d.LastStatus, &d.UpdatedAt, &d.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan duration history: %w", err)
		}
		results = append(results, d)
	}
	return results, rows.Err()
}

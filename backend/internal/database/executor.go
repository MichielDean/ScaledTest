// Package database provides database utilities and interfaces for the ScaledTest backend.
package database

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Executor defines the interface for database operations.
// This interface is implemented by pgxpool.Pool and can be mocked for testing.
// Use this interface in handlers, services, and repositories for database access.
type Executor interface {
	// Begin starts a new transaction
	Begin(ctx context.Context) (pgx.Tx, error)

	// Exec executes a query without returning any rows
	Exec(ctx context.Context, sql string, arguments ...interface{}) (pgconn.CommandTag, error)

	// Query executes a query that returns rows
	Query(ctx context.Context, sql string, args ...interface{}) (pgx.Rows, error)

	// QueryRow executes a query that returns at most one row
	QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row
}

// Rows is an interface for iterating over query results.
// This matches pgx.Rows and allows for easier testing.
type Rows interface {
	Next() bool
	Scan(dest ...interface{}) error
	Err() error
	Close()
}

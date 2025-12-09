// Package migrations provides embedded database migrations using goose.
// Migrations are compiled into the binary and run at application startup,
// ensuring the application controls its own schema evolution.
package migrations

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // pgx driver for database/sql
	"github.com/pressly/goose/v3"
	"go.uber.org/zap"
)

//go:embed sql/*.sql
var embedMigrations embed.FS

// Config holds database connection configuration for migrations
type Config struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

// Run executes database migrations with retry logic for database readiness.
// It creates its own database connection, runs migrations, then closes the connection.
// The application's main connection pool is created separately after migrations complete.
func Run(ctx context.Context, config *Config, logger *zap.Logger) error {
	logger.Info("Starting database migrations",
		zap.String("host", config.Host),
		zap.String("database", config.DBName),
	)

	// Build connection string for database/sql (goose requires *sql.DB)
	connString := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		config.Host,
		config.Port,
		config.User,
		config.Password,
		config.DBName,
		config.SSLMode,
	)

	// Retry logic for database readiness
	var db *sql.DB
	var err error
	maxRetries := 3
	retryInterval := 5 * time.Second

	for attempt := 1; attempt <= maxRetries; attempt++ {
		db, err = sql.Open("pgx", connString)
		if err != nil {
			logger.Warn("Failed to open database connection",
				zap.Int("attempt", attempt),
				zap.Int("maxRetries", maxRetries),
				zap.Error(err),
			)
			if attempt < maxRetries {
				time.Sleep(retryInterval)
				continue
			}
			return fmt.Errorf("failed to open database after %d attempts: %w", maxRetries, err)
		}

		// Test connection
		pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err = db.PingContext(pingCtx)
		cancel()

		if err != nil {
			db.Close()
			logger.Warn("Failed to ping database",
				zap.Int("attempt", attempt),
				zap.Int("maxRetries", maxRetries),
				zap.Error(err),
			)
			if attempt < maxRetries {
				time.Sleep(retryInterval)
				continue
			}
			return fmt.Errorf("failed to connect to database after %d attempts: %w", maxRetries, err)
		}

		logger.Info("Database connection established for migrations",
			zap.Int("attempt", attempt),
		)
		break
	}
	defer db.Close()

	// Configure goose
	goose.SetBaseFS(embedMigrations)

	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("failed to set goose dialect: %w", err)
	}

	// Run migrations
	logger.Info("Running goose migrations")

	if err := goose.Up(db, "sql"); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	// Get current version for logging
	version, err := goose.GetDBVersion(db)
	if err != nil {
		logger.Warn("Failed to get migration version", zap.Error(err))
	} else {
		logger.Info("Database migrations completed successfully",
			zap.Int64("version", version),
		)
	}

	return nil
}

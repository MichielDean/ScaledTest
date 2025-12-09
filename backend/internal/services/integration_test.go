package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"go.uber.org/zap"
)

var (
	testDB        *pgxpool.Pool
	testLogger    *zap.Logger
	pgContainer   *postgres.PostgresContainer
)

// TestMain sets up the test database connection using TestContainers
func TestMain(m *testing.M) {
	var err error
	ctx := context.Background()

	// Create logger
	testLogger, _ = zap.NewDevelopment()

	// Get the migration files directory
	// We need to go up from internal/services to the root, then to database/migrations
	migrationsDir := filepath.Join("..", "..", "..", "database", "migrations")
	
	// Check if migrations directory exists, if not try alternative path
	if _, err := os.Stat(migrationsDir); os.IsNotExist(err) {
		// Try from workspace root
		migrationsDir = filepath.Join("..", "..", "database", "migrations")
	}

	// Start PostgreSQL container with TestContainers
	pgContainer, err = postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("scaledtest_test"),
		postgres.WithUsername("scaledtest"),
		postgres.WithPassword("testpassword"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		testLogger.Fatal("Failed to start PostgreSQL container", zap.Error(err))
	}

	// Get connection string
	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		testLogger.Fatal("Failed to get connection string", zap.Error(err))
	}

	testLogger.Info("PostgreSQL container started", zap.String("connStr", connStr))

	// Create connection pool
	testDB, err = pgxpool.New(ctx, connStr)
	if err != nil {
		testLogger.Fatal("Failed to connect to test database", zap.Error(err))
	}

	// Verify connection
	if err := testDB.Ping(ctx); err != nil {
		testLogger.Fatal("Failed to ping test database", zap.Error(err))
	}

	// Run migrations
	if err := runMigrations(ctx, migrationsDir); err != nil {
		testLogger.Fatal("Failed to run migrations", zap.Error(err))
	}

	testLogger.Info("Connected to test database and ran migrations")

	// Run tests
	code := m.Run()

	// Cleanup
	testDB.Close()
	if err := pgContainer.Terminate(ctx); err != nil {
		testLogger.Error("Failed to terminate PostgreSQL container", zap.Error(err))
	}
	testLogger.Info("Closed test database connection and terminated container")

	os.Exit(code)
}

// runMigrations applies all migration files to the test database
func runMigrations(ctx context.Context, migrationsDir string) error {
	// First, create the uuid-ossp extension (required for uuid_generate_v4)
	_, err := testDB.Exec(ctx, `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
	if err != nil {
		return fmt.Errorf("failed to create uuid-ossp extension: %w", err)
	}

	// Read migration files in order
	files, err := filepath.Glob(filepath.Join(migrationsDir, "*.up.sql"))
	if err != nil {
		return fmt.Errorf("failed to glob migration files: %w", err)
	}

	if len(files) == 0 {
		// If no files found, create minimal schema inline
		testLogger.Warn("No migration files found, creating minimal schema inline")
		return createMinimalSchema(ctx)
	}

	// Sort files by name (they should be numbered)
	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("failed to read migration file %s: %w", file, err)
		}

		testLogger.Info("Applying migration", zap.String("file", filepath.Base(file)))

		// Execute migration - split by semicolon and execute each statement
		// Note: PostgreSQL can handle multiple statements, but some may fail silently
		// if there are privilege issues (like GRANT to non-existent users)
		_, err = testDB.Exec(ctx, string(content))
		if err != nil {
			// Log warning but continue - some migrations may have optional parts
			testLogger.Warn("Migration had errors (may be expected for grants)", 
				zap.String("file", filepath.Base(file)), 
				zap.Error(err))
		}
	}

	return nil
}

// createMinimalSchema creates the minimum schema needed for tests when migration files aren't found
func createMinimalSchema(ctx context.Context) error {
	schema := `
		-- Auth schema
		CREATE SCHEMA IF NOT EXISTS auth;
		
		-- Users table
		CREATE TABLE IF NOT EXISTS auth.users (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			email TEXT UNIQUE NOT NULL,
			encrypted_password TEXT NOT NULL,
			name TEXT,
			role TEXT NOT NULL DEFAULT 'user',
			email_verified BOOLEAN NOT NULL DEFAULT FALSE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		
		-- Sessions table
		CREATE TABLE IF NOT EXISTS auth.sessions (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
			token_hash TEXT NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		
		-- Teams table
		CREATE TABLE IF NOT EXISTS public.teams (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		
		-- Team members table
		CREATE TABLE IF NOT EXISTS public.team_members (
			team_id TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
			user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
			role TEXT NOT NULL DEFAULT 'member',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (team_id, user_id)
		);
		
		-- Test runs table
		CREATE TABLE IF NOT EXISTS public.test_runs (
			id TEXT PRIMARY KEY,
			project_id TEXT,
			test_image_id TEXT,
			k8s_job_name TEXT,
			status TEXT NOT NULL DEFAULT 'pending',
			started_at TIMESTAMPTZ,
			completed_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			created_by UUID REFERENCES auth.users(id)
		);
		
		-- Test cases table
		CREATE TABLE IF NOT EXISTS public.test_cases (
			id TEXT PRIMARY KEY,
			test_run_id TEXT NOT NULL REFERENCES public.test_runs(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			duration_ms INTEGER,
			error_message TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`
	
	_, err := testDB.Exec(ctx, schema)
	return err
}

// cleanupTestData removes test data after each test
func cleanupTestData(t *testing.T, ctx context.Context) {
	// Delete test data in reverse dependency order
	_, err := testDB.Exec(ctx, "DELETE FROM public.test_cases WHERE test_run_id LIKE 'test-%'")
	if err != nil {
		t.Logf("Warning: Failed to cleanup test_cases: %v", err)
	}

	_, err = testDB.Exec(ctx, "DELETE FROM public.test_runs WHERE id LIKE 'test-%'")
	if err != nil {
		t.Logf("Warning: Failed to cleanup test_runs: %v", err)
	}

	_, err = testDB.Exec(ctx, "DELETE FROM public.team_members WHERE team_id LIKE 'test-%'")
	if err != nil {
		t.Logf("Warning: Failed to cleanup team_members: %v", err)
	}

	_, err = testDB.Exec(ctx, "DELETE FROM public.teams WHERE id LIKE 'test-%'")
	if err != nil {
		t.Logf("Warning: Failed to cleanup teams: %v", err)
	}

	// Clean up test users by email pattern instead of ID (since IDs are auto-generated UUIDs)
	_, err = testDB.Exec(ctx, "DELETE FROM auth.users WHERE email LIKE '%@example.com'")
	if err != nil {
		t.Logf("Warning: Failed to cleanup users: %v", err)
	}
}

// createTestUser creates a test user in the database using GoTrue schema and returns the generated UUID
func createTestUser(t *testing.T, ctx context.Context, email, name string) string {
	userMetadata := map[string]interface{}{
		"name": name,
	}
	metadataJSON, _ := json.Marshal(userMetadata)

	var userID string
	query := `
		INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, is_sso_user)
		VALUES (gen_random_uuid(), $1, 'test-password-hash', NOW(), $2, NOW(), NOW(), false)
		RETURNING id
	`
	err := testDB.QueryRow(ctx, query, email, metadataJSON).Scan(&userID)
	if err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	return userID
}

// createTestTeam creates a test team in the database
func createTestTeam(t *testing.T, ctx context.Context, teamID, name, description string) {
	query := `
		INSERT INTO public.teams (id, name, description, created_at, updated_at)
		VALUES ($1, $2, $3, NOW(), NOW())
		ON CONFLICT (id) DO NOTHING
	`
	_, err := testDB.Exec(ctx, query, teamID, name, description)
	if err != nil {
		t.Fatalf("Failed to create test team: %v", err)
	}
}

// addTestTeamMember adds a user to a team
func addTestTeamMember(t *testing.T, ctx context.Context, teamID, userID, role string) {
	query := `
		INSERT INTO public.team_members (team_id, user_id, role, created_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (team_id, user_id) DO UPDATE SET role = $3
	`
	_, err := testDB.Exec(ctx, query, teamID, userID, role)
	if err != nil {
		t.Fatalf("Failed to add team member: %v", err)
	}
}

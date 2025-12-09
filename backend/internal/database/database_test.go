package database

import (
	"context"
	"os"
	"testing"
	"time"

	"go.uber.org/zap"
)

func TestNewConfigFromEnv(t *testing.T) {
	t.Run("Success - Load from environment variables", func(t *testing.T) {
		// Set environment variables
		os.Setenv("DB_HOST", "test-host")
		os.Setenv("DB_PORT", "5433")
		os.Setenv("DB_USER", "test-user")
		os.Setenv("DB_PASSWORD", "test-password")
		os.Setenv("DB_NAME", "test-db")
		os.Setenv("DB_SSL_MODE", "require")

		defer func() {
			os.Unsetenv("DB_HOST")
			os.Unsetenv("DB_PORT")
			os.Unsetenv("DB_USER")
			os.Unsetenv("DB_PASSWORD")
			os.Unsetenv("DB_NAME")
			os.Unsetenv("DB_SSL_MODE")
		}()

		config := NewConfigFromEnv()

		if config.Host != "test-host" {
			t.Errorf("Expected host 'test-host', got '%s'", config.Host)
		}
		if config.Port != "5433" {
			t.Errorf("Expected port '5433', got '%s'", config.Port)
		}
		if config.User != "test-user" {
			t.Errorf("Expected user 'test-user', got '%s'", config.User)
		}
		if config.Password != "test-password" {
			t.Errorf("Expected password 'test-password', got '%s'", config.Password)
		}
		if config.DBName != "test-db" {
			t.Errorf("Expected dbname 'test-db', got '%s'", config.DBName)
		}
		if config.SSLMode != "require" {
			t.Errorf("Expected sslmode 'require', got '%s'", config.SSLMode)
		}
	})

	t.Run("Success - Use default values", func(t *testing.T) {
		// Clear environment variables
		os.Unsetenv("DB_HOST")
		os.Unsetenv("DB_PORT")
		os.Unsetenv("DB_USER")
		os.Unsetenv("DB_PASSWORD")
		os.Unsetenv("DB_NAME")
		os.Unsetenv("DB_SSL_MODE")

		config := NewConfigFromEnv()

		if config.Host != "localhost" {
			t.Errorf("Expected default host 'localhost', got '%s'", config.Host)
		}
		if config.Port != "5432" {
			t.Errorf("Expected default port '5432', got '%s'", config.Port)
		}
		if config.User != "scaledtest_user" {
			t.Errorf("Expected default user 'scaledtest_user', got '%s'", config.User)
		}
		if config.SSLMode != "disable" {
			t.Errorf("Expected default sslmode 'disable', got '%s'", config.SSLMode)
		}
	})
}

func TestConnect_InvalidConfig(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	t.Run("Error - Invalid connection string", func(t *testing.T) {
		config := &Config{
			Host:     "invalid-host-12345",
			Port:     "9999",
			User:     "invalid-user",
			Password: "invalid-password",
			DBName:   "invalid-db",
			SSLMode:  "disable",
		}

		db, err := Connect(ctx, config, logger)
		if err == nil {
			if db != nil {
				db.Close()
			}
			t.Error("Expected error for invalid connection, got nil")
		}
	})

	t.Run("Error - Invalid port", func(t *testing.T) {
		config := &Config{
			Host:     "localhost",
			Port:     "invalid-port",
			User:     "test",
			Password: "test",
			DBName:   "test",
			SSLMode:  "disable",
		}

		_, err := Connect(ctx, config, logger)
		if err == nil {
			t.Error("Expected error for invalid port, got nil")
		}
	})
}

func TestDatabase_Close(t *testing.T) {
	t.Run("Success - Close nil pool", func(t *testing.T) {
		db := &Database{Pool: nil}
		// Should not panic
		db.Close()
	})
}

func TestDatabase_Health(t *testing.T) {
	t.Run("Error - Nil pool", func(t *testing.T) {
		db := &Database{Pool: nil}
		ctx := context.Background()

		// This will panic with nil pool, which is expected behavior
		defer func() {
			if r := recover(); r == nil {
				t.Error("Expected panic with nil pool")
			}
		}()

		db.Health(ctx)
	})
}

func TestGetEnv(t *testing.T) {
	t.Run("Success - Get environment variable", func(t *testing.T) {
		os.Setenv("TEST_VAR", "test-value")
		defer os.Unsetenv("TEST_VAR")

		value := getEnv("TEST_VAR", "fallback")
		if value != "test-value" {
			t.Errorf("Expected 'test-value', got '%s'", value)
		}
	})

	t.Run("Success - Use fallback value", func(t *testing.T) {
		os.Unsetenv("NONEXISTENT_VAR")

		value := getEnv("NONEXISTENT_VAR", "fallback")
		if value != "fallback" {
			t.Errorf("Expected 'fallback', got '%s'", value)
		}
	})

	t.Run("Success - Empty environment variable uses fallback", func(t *testing.T) {
		os.Setenv("EMPTY_VAR", "")
		defer os.Unsetenv("EMPTY_VAR")

		value := getEnv("EMPTY_VAR", "fallback")
		if value != "fallback" {
			t.Errorf("Expected 'fallback', got '%s'", value)
		}
	})
}

func TestConfig(t *testing.T) {
	t.Run("Success - Create config manually", func(t *testing.T) {
		config := &Config{
			Host:     "custom-host",
			Port:     "5433",
			User:     "custom-user",
			Password: "custom-password",
			DBName:   "custom-db",
			SSLMode:  "require",
		}

		if config.Host != "custom-host" {
			t.Errorf("Expected host 'custom-host', got '%s'", config.Host)
		}
		if config.Port != "5433" {
			t.Errorf("Expected port '5433', got '%s'", config.Port)
		}
	})
}

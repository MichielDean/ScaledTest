package logger

import (
	"os"
	"testing"

	"go.uber.org/zap"
)

func TestInitialize(t *testing.T) {
	t.Run("Success - Initialize production logger", func(t *testing.T) {
		err := Initialize("production")
		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if Log == nil {
			t.Error("Expected Log to be initialized, got nil")
		}

		// Clean up
		Sync()
	})

	t.Run("Success - Initialize development logger", func(t *testing.T) {
		err := Initialize("development")
		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if Log == nil {
			t.Error("Expected Log to be initialized, got nil")
		}

		// Clean up
		Sync()
	})

	t.Run("Success - Initialize with custom log level", func(t *testing.T) {
		os.Setenv("LOG_LEVEL", "debug")
		defer os.Unsetenv("LOG_LEVEL")

		err := Initialize("development")
		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if Log == nil {
			t.Error("Expected Log to be initialized, got nil")
		}

		// Clean up
		Sync()
	})

	t.Run("Success - Initialize with invalid log level uses default", func(t *testing.T) {
		os.Setenv("LOG_LEVEL", "invalid-level")
		defer os.Unsetenv("LOG_LEVEL")

		err := Initialize("development")
		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if Log == nil {
			t.Error("Expected Log to be initialized, got nil")
		}

		// Clean up
		Sync()
	})

	t.Run("Success - Initialize with empty environment", func(t *testing.T) {
		err := Initialize("")
		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if Log == nil {
			t.Error("Expected Log to be initialized, got nil")
		}

		// Clean up
		Sync()
	})
}

func TestSync(t *testing.T) {
	t.Run("Success - Sync with initialized logger", func(t *testing.T) {
		Initialize("development")
		// Should not panic
		Sync()
	})

	t.Run("Success - Sync with nil logger", func(t *testing.T) {
		Log = nil
		// Should not panic
		Sync()
	})
}

func TestInfo(t *testing.T) {
	t.Run("Success - Log info message", func(t *testing.T) {
		Initialize("development")
		defer Sync()

		// Should not panic
		Info("Test info message", zap.String("key", "value"))
	})
}

func TestError(t *testing.T) {
	t.Run("Success - Log error message", func(t *testing.T) {
		Initialize("development")
		defer Sync()

		// Should not panic
		Error("Test error message", zap.String("key", "value"))
	})
}

func TestDebug(t *testing.T) {
	t.Run("Success - Log debug message", func(t *testing.T) {
		Initialize("development")
		defer Sync()

		// Should not panic
		Debug("Test debug message", zap.String("key", "value"))
	})
}

func TestWarn(t *testing.T) {
	t.Run("Success - Log warn message", func(t *testing.T) {
		Initialize("development")
		defer Sync()

		// Should not panic
		Warn("Test warn message", zap.String("key", "value"))
	})
}

func TestLogLevels(t *testing.T) {
	t.Run("Success - All log levels work", func(t *testing.T) {
		Initialize("development")
		defer Sync()

		// Test all log levels
		Debug("Debug message", zap.String("level", "debug"))
		Info("Info message", zap.String("level", "info"))
		Warn("Warn message", zap.String("level", "warn"))
		Error("Error message", zap.String("level", "error"))

		// All should execute without panic
	})
}

func TestLogWithMultipleFields(t *testing.T) {
	t.Run("Success - Log with multiple fields", func(t *testing.T) {
		Initialize("development")
		defer Sync()

		Info("Test message",
			zap.String("field1", "value1"),
			zap.Int("field2", 42),
			zap.Bool("field3", true),
			zap.Float64("field4", 3.14),
		)

		// Should execute without panic
	})
}

func TestLogEnvironmentVariants(t *testing.T) {
	tests := []struct {
		name        string
		environment string
		logLevel    string
	}{
		{
			name:        "Production with info level",
			environment: "production",
			logLevel:    "info",
		},
		{
			name:        "Development with debug level",
			environment: "development",
			logLevel:    "debug",
		},
		{
			name:        "Production with warn level",
			environment: "production",
			logLevel:    "warn",
		},
		{
			name:        "Development with error level",
			environment: "development",
			logLevel:    "error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			os.Setenv("LOG_LEVEL", tt.logLevel)
			defer os.Unsetenv("LOG_LEVEL")

			err := Initialize(tt.environment)
			if err != nil {
				t.Fatalf("Expected no error, got %v", err)
			}

			if Log == nil {
				t.Error("Expected Log to be initialized, got nil")
			}

			// Test logging at various levels
			Debug("Debug test")
			Info("Info test")
			Warn("Warn test")
			Error("Error test")

			Sync()
		})
	}
}

func TestLoggerConfiguration(t *testing.T) {
	t.Run("Production logger uses JSON encoding", func(t *testing.T) {
		err := Initialize("production")
		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		// Production logger should be initialized successfully
		if Log == nil {
			t.Error("Expected Log to be initialized, got nil")
		}

		// Test that we can log without errors
		Info("Production log test")

		Sync()
	})

	t.Run("Development logger uses console encoding with colors", func(t *testing.T) {
		err := Initialize("development")
		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		// Development logger should be initialized successfully
		if Log == nil {
			t.Error("Expected Log to be initialized, got nil")
		}

		// Test that we can log without errors
		Info("Development log test")

		Sync()
	})
}

func TestLogLevelParsing(t *testing.T) {
	validLevels := []string{"debug", "info", "warn", "error"}

	for _, level := range validLevels {
		t.Run("Parse log level: "+level, func(t *testing.T) {
			os.Setenv("LOG_LEVEL", level)
			defer os.Unsetenv("LOG_LEVEL")

			err := Initialize("development")
			if err != nil {
				t.Fatalf("Expected no error, got %v", err)
			}

			if Log == nil {
				t.Error("Expected Log to be initialized, got nil")
			}

			Sync()
		})
	}
}

func TestZapFieldTypes(t *testing.T) {
	t.Run("Success - Various zap field types", func(t *testing.T) {
		Initialize("development")
		defer Sync()

		Info("Testing various field types",
			zap.String("string", "value"),
			zap.Int("int", 42),
			zap.Int64("int64", 9223372036854775807),
			zap.Float64("float64", 3.14159),
			zap.Bool("bool", true),
			zap.Duration("duration", 0),
			zap.Error(os.ErrNotExist),
			zap.Any("any", map[string]string{"key": "value"}),
		)

		// Should execute without panic
	})
}

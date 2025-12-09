package logger

import (
	"os"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var Log *zap.Logger

// Initialize sets up the structured logger
func Initialize(environment string) error {
	var config zap.Config

	if environment == "production" {
		config = zap.NewProductionConfig()
	} else {
		config = zap.NewDevelopmentConfig()
		config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	}

	// Set log level from environment or default to info
	logLevel := os.Getenv("LOG_LEVEL")
	if logLevel != "" {
		var level zapcore.Level
		if err := level.UnmarshalText([]byte(logLevel)); err == nil {
			config.Level = zap.NewAtomicLevelAt(level)
		}
	}

	logger, err := config.Build()
	if err != nil {
		return err
	}

	Log = logger
	return nil
}

// Sync flushes any buffered log entries
func Sync() {
	if Log != nil {
		_ = Log.Sync()
	}
}

// Info logs an info message with structured fields
func Info(msg string, fields ...zap.Field) {
	Log.Info(msg, fields...)
}

// Error logs an error message with structured fields
func Error(msg string, fields ...zap.Field) {
	Log.Error(msg, fields...)
}

// Debug logs a debug message with structured fields
func Debug(msg string, fields ...zap.Field) {
	Log.Debug(msg, fields...)
}

// Warn logs a warning message with structured fields
func Warn(msg string, fields ...zap.Field) {
	Log.Warn(msg, fields...)
}

// Fatal logs a fatal message and exits
func Fatal(msg string, fields ...zap.Field) {
	Log.Fatal(msg, fields...)
}

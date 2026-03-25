package config

import (
	"os"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	if cfg.Port != 8080 {
		t.Errorf("Port = %d, want 8080", cfg.Port)
	}
	if cfg.LogLevel != "info" {
		t.Errorf("LogLevel = %q, want %q", cfg.LogLevel, "info")
	}
	if cfg.LogFormat != "json" {
		t.Errorf("LogFormat = %q, want %q", cfg.LogFormat, "json")
	}
	if cfg.K8sNamespace != "default" {
		t.Errorf("K8sNamespace = %q, want %q", cfg.K8sNamespace, "default")
	}
}

func TestLoadLLMConfig(t *testing.T) {
	os.Setenv("ST_LLM_PROVIDER", "openai")
	os.Setenv("ST_LLM_COMMAND", "/usr/bin/fakecli")
	t.Cleanup(func() {
		os.Unsetenv("ST_LLM_PROVIDER")
		os.Unsetenv("ST_LLM_COMMAND")
	})

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	if cfg.LLMProvider != "openai" {
		t.Errorf("LLMProvider = %q, want %q", cfg.LLMProvider, "openai")
	}
	if cfg.LLMCommand != "/usr/bin/fakecli" {
		t.Errorf("LLMCommand = %q, want %q", cfg.LLMCommand, "/usr/bin/fakecli")
	}
}

func TestLoadFromEnv(t *testing.T) {
	os.Setenv("ST_PORT", "9090")
	os.Setenv("ST_LOG_LEVEL", "debug")
	os.Setenv("ST_DATABASE_URL", "postgres://localhost/test")
	t.Cleanup(func() {
		os.Unsetenv("ST_PORT")
		os.Unsetenv("ST_LOG_LEVEL")
		os.Unsetenv("ST_DATABASE_URL")
	})

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	if cfg.Port != 9090 {
		t.Errorf("Port = %d, want 9090", cfg.Port)
	}
	if cfg.LogLevel != "debug" {
		t.Errorf("LogLevel = %q, want %q", cfg.LogLevel, "debug")
	}
	if cfg.DatabaseURL != "postgres://localhost/test" {
		t.Errorf("DatabaseURL = %q, want %q", cfg.DatabaseURL, "postgres://localhost/test")
	}
}

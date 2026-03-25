// Package llm provides a provider-agnostic abstraction for single-shot LLM
// queries used by the ScaledTest triage pipeline.
//
// Providers execute a prompt by invoking an agent CLI in non-interactive mode
// (e.g. "claude --print -p <prompt>"). No SDK dependencies are required;
// provider selection and credentials are driven by environment configuration.
package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"
)

// ErrMissingCredential is returned by New when a required API key env var is not set.
var ErrMissingCredential = errors.New("llm: missing credential")

// ErrUnknownProvider is returned by New when the configured provider name is not recognised.
var ErrUnknownProvider = errors.New("llm: unknown provider")

// Provider executes a single-shot LLM query and returns the raw JSON response.
type Provider interface {
	Analyze(ctx context.Context, prompt string) (json.RawMessage, error)
}

// Config holds settings for creating a Provider.
type Config struct {
	// Provider selects the backend: "anthropic" (default) or "openai".
	Provider string

	// Command overrides the CLI binary path.
	// When empty the preset default is used ("claude" or "codex").
	// Set this in tests to point at a fake binary.
	Command string

	// Timeout is the per-call deadline applied to each CLI invocation.
	// Defaults to 120 s when zero.
	Timeout time.Duration

	// MaxRetries is the number of additional attempts after the first failure.
	// Defaults to 2 (3 total attempts) when zero.
	MaxRetries int
}

// New creates a Provider from cfg.
// It verifies that the required credential env var is present before returning.
func New(cfg Config) (Provider, error) {
	if cfg.Provider == "" {
		cfg.Provider = "anthropic"
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 120 * time.Second
	}
	if cfg.MaxRetries == 0 {
		cfg.MaxRetries = 2
	}

	preset, ok := presets[cfg.Provider]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrUnknownProvider, cfg.Provider)
	}

	for _, key := range preset.requiredEnv {
		if os.Getenv(key) == "" {
			return nil, fmt.Errorf("%w: %s is not set", ErrMissingCredential, key)
		}
	}

	cmd := preset.command
	if cfg.Command != "" {
		cmd = cfg.Command
	}

	return &cliProvider{
		command:    cmd,
		preset:     preset,
		timeout:    cfg.Timeout,
		maxRetries: cfg.MaxRetries,
	}, nil
}

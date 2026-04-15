package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"time"
)

// providerPreset describes how to invoke an agent CLI in non-interactive mode.
type providerPreset struct {
	command     string   // default binary name
	subcommand  string   // positional subcommand inserted before fixed args (e.g. "exec" for codex)
	fixedArgs   []string // args always appended before the prompt flags
	printFlag   string   // causes the CLI to print its response to stdout (e.g. "--print")
	modelFlag   string   // selects the model (e.g. "--model")
	model       string   // model identifier to pass via modelFlag
	promptFlag  string   // flag preceding the prompt text (e.g. "-p")
	requiredEnv []string // env vars that must be present in os.Environ
}

// presets maps provider name → preset configuration.
var presets = map[string]providerPreset{
	"anthropic": {
		command:     "claude",
		fixedArgs:   []string{"--dangerously-skip-permissions"},
		printFlag:   "--print",
		modelFlag:   "--model",
		model:       "claude-sonnet-4-6",
		promptFlag:  "-p",
		requiredEnv: []string{"ANTHROPIC_API_KEY"},
	},
	"openai": {
		command:     "codex",
		subcommand:  "exec",
		modelFlag:   "--model",
		model:       "gpt-4o",
		promptFlag:  "-p",
		requiredEnv: []string{"OPENAI_API_KEY"},
	},
}

// retryBackoff returns the wait duration before attempt n (0-indexed).
// It is a variable so tests can replace it with a zero-delay function.
var retryBackoff = func(attempt int) time.Duration {
	d := time.Duration(1<<uint(attempt)) * 500 * time.Millisecond
	if d > 5*time.Second {
		d = 5 * time.Second
	}
	return d
}

// cliProvider implements Provider by shelling out to an agent CLI.
type cliProvider struct {
	command    string
	preset     providerPreset
	timeout    time.Duration
	maxRetries int
}

// Analyze invokes the CLI with prompt and returns the JSON response.
// It retries on transient exec failures (timeouts, process signals) with
// configurable back-off. Client errors (syntax errors, invalid model names)
// are not retried — only transient failures where the CLI exited with a signal
// or the context deadline was exceeded.
func (c *cliProvider) Analyze(ctx context.Context, prompt string) (json.RawMessage, error) {
	var (
		out []byte
		err error
	)
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		callCtx, cancel := context.WithTimeout(ctx, c.timeout)
		out, err = c.run(callCtx, prompt)
		cancel()
		if err == nil {
			break
		}
		if !isTransientCLIError(err) {
			return nil, err
		}
		if attempt < c.maxRetries {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(retryBackoff(attempt)):
			}
		}
	}
	if err != nil {
		return nil, err
	}
	out = bytes.TrimSpace(out)
	if !json.Valid(out) {
		return nil, fmt.Errorf("llm: response is not valid JSON: %q", truncate(string(out), 200))
	}
	return json.RawMessage(out), nil
}

// isTransientCLIError returns true for errors that are worth retrying:
// context deadlines/timeouts and process signals (killed by SIGKILL from
// timeout). Non-transient errors like invalid model names or syntax errors
// (exit code 1) are NOT retried.
func isTransientCLIError(err error) bool {
	if err == nil {
		return false
	}
	// Context deadline/timeout errors are transient.
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	// Process killed by a signal (e.g. SIGKILL from timeout) is transient.
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		return !ee.Exited()
	}
	// Other errors (network, exec failures) fall through here and are
	// NOT retried — only the explicit cases above are transient.
	// Client errors that produce normal exit codes are also NOT transient.
	return false
}

// run executes one CLI invocation and returns its stdout.
func (c *cliProvider) run(ctx context.Context, prompt string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, c.command, c.buildArgs(prompt)...)
	// WaitDelay ensures that if the CLI spawns child processes that hold the
	// stdout pipe open after the parent is killed, Go forcibly closes the
	// reading end and cmd.Output returns rather than blocking indefinitely.
	cmd.WaitDelay = 5 * time.Second
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("llm: %s: %w", c.command, ctx.Err())
		}
		if ee, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("llm: %s exited %d: %s",
				c.command, ee.ExitCode(), truncate(stderr.String(), 200))
		}
		return nil, fmt.Errorf("llm: exec %s: %w", c.command, err)
	}
	return out, nil
}

// buildArgs constructs the argument list for a single CLI invocation.
func (c *cliProvider) buildArgs(prompt string) []string {
	var args []string
	if c.preset.subcommand != "" {
		args = append(args, c.preset.subcommand)
	}
	args = append(args, c.preset.fixedArgs...)
	if c.preset.printFlag != "" {
		args = append(args, c.preset.printFlag)
	}
	if c.preset.modelFlag != "" && c.preset.model != "" {
		args = append(args, c.preset.modelFlag, c.preset.model)
	}
	if c.preset.promptFlag != "" {
		args = append(args, c.preset.promptFlag)
	}
	args = append(args, prompt)
	return args
}

// truncate shortens s to max bytes, appending "…" if truncated.
func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

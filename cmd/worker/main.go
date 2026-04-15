package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	netURL "net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/sanitize"
)

func main() {
	zerolog.SetGlobalLevel(zerolog.InfoLevel)
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	apiURL := requireEnv("ST_API_URL")
	workerToken := requireEnv("ST_WORKER_TOKEN")
	executionID := requireEnv("ST_EXECUTION_ID")
	command := requireEnv("ST_COMMAND")

	if err := sanitize.ValidateCommand(command); err != nil {
		log.Error().Err(err).Str("command", command).Msg("command validation failed")
		reportStatus(apiURL, workerToken, executionID, "failed", "command rejected: "+err.Error())
		os.Exit(1)
	}

	log.Info().
		Str("execution_id", executionID).
		Str("command", command).
		Msg("worker starting")

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Report status: running
	reportStatus(apiURL, workerToken, executionID, "running", "")

	// Execute the test command
	exitCode, output, err := runCommand(ctx, command)

	if ctx.Err() != nil {
		log.Warn().Msg("worker cancelled")
		reportStatus(apiURL, workerToken, executionID, "cancelled", "execution cancelled")
		os.Exit(130)
	}

	if err != nil {
		log.Error().Err(err).Int("exit_code", exitCode).Msg("command failed")
		reportStatus(apiURL, workerToken, executionID, "failed", fmt.Sprintf("exit code %d: %s", exitCode, err.Error()))
		os.Exit(1)
	}

	log.Info().Int("exit_code", exitCode).Msg("command completed")

	// Look for CTRF report file
	reportFile := findCTRFReport()
	if reportFile != "" {
		log.Info().Str("file", reportFile).Msg("found CTRF report")
		if err := submitReport(apiURL, workerToken, executionID, reportFile); err != nil {
			log.Error().Err(err).Msg("failed to submit report")
			reportStatus(apiURL, workerToken, executionID, "failed", "report submission failed: "+err.Error())
			os.Exit(1)
		}
	} else {
		log.Warn().Msg("no CTRF report found")
	}

	_ = output // Could be logged or sent as execution output

	reportStatus(apiURL, workerToken, executionID, "completed", "")
	log.Info().Msg("worker done")
}

func requireEnv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		fmt.Fprintf(os.Stderr, "required environment variable %s is not set\n", key)
		os.Exit(1)
	}
	return val
}

func runCommand(ctx context.Context, command string) (int, string, error) {
	parts := strings.Fields(command)
	if len(parts) == 0 {
		return -1, "", fmt.Errorf("empty command")
	}
	cmd := exec.CommandContext(ctx, parts[0], parts[1:]...)
	cmd.Dir = "/workspace"

	// Capture output
	var output bytes.Buffer
	cmd.Stdout = io.MultiWriter(os.Stdout, &output)
	cmd.Stderr = io.MultiWriter(os.Stderr, &output)

	err := cmd.Run()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
		}
	}

	return exitCode, output.String(), err
}

func findCTRFReport() string {
	patterns := []string{
		"/workspace/ctrf-report.json",
		"/workspace/ctrf/*.json",
		"/workspace/test-results/ctrf-report.json",
	}

	for _, pattern := range patterns {
		matches, _ := filepath.Glob(pattern)
		if len(matches) > 0 {
			return matches[0]
		}
	}
	return ""
}

// setAuthHeader sets the Authorization header appropriate for the token type.
// sct_ API tokens are sent raw; JWTs are wrapped in "Bearer ".
func setAuthHeader(req *http.Request, token string) {
	if strings.HasPrefix(token, "sct_") {
		req.Header.Set("Authorization", token)
	} else {
		req.Header.Set("Authorization", "Bearer "+token)
	}
}

func submitReport(apiURL, token, executionID, reportFile string) error {
	data, err := os.ReadFile(reportFile)
	if err != nil {
		return fmt.Errorf("read report: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/reports?execution_id=%s", apiURL, netURL.QueryEscape(executionID))
	req, err := http.NewRequest("POST", url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	setAuthHeader(req, token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("submit report: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("report submission failed (%d): %s", resp.StatusCode, string(body))
	}

	log.Info().Str("execution_id", executionID).Msg("report submitted")
	return nil
}

func reportStatus(apiURL, token, executionID, status, errorMsg string) {
	payload := map[string]string{
		"status":    status,
		"error_msg": errorMsg,
	}
	data, _ := json.Marshal(payload)

	url := fmt.Sprintf("%s/api/v1/executions/%s/status", apiURL, executionID)
	req, err := http.NewRequest("PUT", url, bytes.NewReader(data))
	if err != nil {
		log.Error().Err(err).Msg("failed to create status request")
		return
	}
	setAuthHeader(req, token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Error().Err(err).Msg("failed to report status")
		return
	}
	resp.Body.Close()
}

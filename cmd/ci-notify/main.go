// ci-notify sends a CI test results summary to Telegram.
//
// Environment variables:
//
//	TELEGRAM_BOT_TOKEN  Telegram bot token (required; skips silently if unset)
//	TELEGRAM_CHAT_ID    Target chat or channel ID (required; skips silently if unset)
//	CI_REPO             Repository name, e.g. "org/repo"
//	CI_BRANCH           Branch name, e.g. "main"
//	CI_COMMIT_SHA       Full commit SHA
//	CI_COMMIT_MSG       Commit message
//	CI_RUN_URL          URL to the CI run
//	CI_STATUS           Override status: "passing" or "failing"
//
// Usage:
//
//	go test -json ./... > results.json
//	ci-notify -results results.json
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/scaledtest/scaledtest/internal/gotest"
	"github.com/scaledtest/scaledtest/internal/telegram"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "ci-notify: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	var resultsFile string
	flag.StringVar(&resultsFile, "results", "", "path to `go test -json` output file (reads stdin if omitted)")
	flag.Parse()

	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	chatID := os.Getenv("TELEGRAM_CHAT_ID")
	if token == "" || chatID == "" {
		fmt.Fprintln(os.Stderr, "ci-notify: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping notification")
		return nil
	}

	// Open results source.
	var src io.Reader = os.Stdin
	if resultsFile != "" {
		f, err := os.Open(resultsFile)
		if err != nil {
			return fmt.Errorf("open results file: %w", err)
		}
		defer f.Close()
		src = f
	}

	summary, err := gotest.ParseEvents(src)
	if err != nil {
		return fmt.Errorf("parse test events: %w", err)
	}

	// Determine status: prefer explicit CI_STATUS, fall back to failure count.
	status := "passing"
	if envStatus := os.Getenv("CI_STATUS"); envStatus != "" {
		status = envStatus
	} else if summary.Failed > 0 {
		status = "failing"
	}

	ciSummary := telegram.CISummary{
		Repo:      os.Getenv("CI_REPO"),
		Branch:    os.Getenv("CI_BRANCH"),
		CommitSHA: os.Getenv("CI_COMMIT_SHA"),
		CommitMsg: os.Getenv("CI_COMMIT_MSG"),
		Passed:    summary.Passed,
		Failed:    summary.Failed,
		Skipped:   summary.Skipped,
		Total:     summary.Total(),
		RunURL:    os.Getenv("CI_RUN_URL"),
		Status:    status,
	}

	msg := telegram.FormatMessage(ciSummary)

	client := telegram.NewClient(token, chatID)
	if err := client.SendMessage(context.Background(), msg); err != nil {
		return fmt.Errorf("send telegram message: %w", err)
	}

	fmt.Fprintln(os.Stdout, "ci-notify: Telegram notification sent.")
	return nil
}

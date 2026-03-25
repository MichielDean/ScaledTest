package triage

import (
	"fmt"
	"strings"

	"github.com/scaledtest/scaledtest/internal/analytics"
)

// msgLimit returns the maximum number of bytes kept from a failure's error
// message when building the prompt. The limit shrinks as the failure count
// grows to keep the overall prompt within approximately 8 k tokens.
func msgLimit(n int) int {
	switch {
	case n <= 10:
		return 500
	case n <= 25:
		return 300
	default:
		return 100
	}
}

// traceLimit returns the maximum number of bytes kept from a failure's stack
// trace when building the prompt.
func traceLimit(n int) int {
	switch {
	case n <= 10:
		return 800
	case n <= 25:
		return 500
	default:
		return 150
	}
}

// truncateStr shortens s to at most maxLen bytes, appending "…" if truncated.
// It does not split multi-byte UTF-8 runes at the boundary — it truncates
// at the byte level which may break a rune, but this is acceptable for prompt
// construction where exact byte counts matter more than rune alignment.
func truncateStr(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "…"
}

// BuildPrompt constructs the LLM triage prompt for input.
//
// The prompt includes:
//  1. Instructions describing the task and the required JSON output schema.
//  2. All failing tests with (adaptively truncated) error messages and traces.
//  3. Flakiness history for the failing tests (if available).
//  4. Code change context from the git diff (if available).
//  5. Tests that also failed in the previous run (if known).
//
// Adaptive truncation is applied so that prompts for typical runs (≤30
// failures) stay within roughly 8 k input tokens (~32 000 chars at 4
// chars/token). Very large failure sets (50+) use tighter limits.
func BuildPrompt(input TriageInput) string {
	var b strings.Builder
	n := len(input.Failures)

	writeInstructions(&b, n)
	writeFailures(&b, input.Failures, msgLimit(n), traceLimit(n))
	writeFlakinessHistory(&b, input.FlakinessHistory)
	writeGitDiff(&b, input.GitDiff)
	writePreviousFailures(&b, input.PreviousFailures)

	return b.String()
}

func writeInstructions(b *strings.Builder, failureCount int) {
	fmt.Fprintf(b, `You are a CI failure triage assistant. Analyse the %d failing test(s) below and return a JSON object.

## Instructions

1. Group failures into clusters by shared root cause (one cluster per distinct cause).
2. Classify each failure as exactly one of:
   - "new"        — test has no prior failure history and is likely a new defect
   - "flaky"      — test has a known history of intermittent failures
   - "regression" — test was passing but is now consistently failing
   - "unknown"    — cannot determine from available context
3. Write a concise 1–3 sentence summary of the overall failure pattern.
4. Every failing test must appear in exactly one cluster's classifications list.

## Response Format

Respond with ONLY a JSON object — no markdown fences, no preamble, no trailing text:

{
  "summary": "<1–3 sentence summary>",
  "clusters": [
    {
      "root_cause": "<concise root cause description>",
      "label": "<optional short label, may be omitted>",
      "classifications": [
        { "test_result_id": "<id>", "classification": "new|flaky|regression|unknown" }
      ]
    }
  ]
}

`, failureCount)
}

func writeFailures(b *strings.Builder, failures []FailureDetail, ml, tl int) {
	fmt.Fprintf(b, "## Failing Tests (%d)\n\n", len(failures))
	for _, f := range failures {
		fmt.Fprintf(b, "### test_result_id: %s\n", f.TestResultID)
		fmt.Fprintf(b, "- name: %s\n", f.Name)
		if f.Suite != "" {
			fmt.Fprintf(b, "- suite: %s\n", f.Suite)
		}
		if msg := truncateStr(strings.TrimSpace(f.Message), ml); msg != "" {
			fmt.Fprintf(b, "- error: %s\n", msg)
		}
		if trace := truncateStr(strings.TrimSpace(f.Trace), tl); trace != "" {
			fmt.Fprintf(b, "- trace: %s\n", trace)
		}
		b.WriteString("\n")
	}
}

func writeFlakinessHistory(b *strings.Builder, history []analytics.TestFlakinessSummary) {
	if len(history) == 0 {
		return
	}
	b.WriteString("## Flakiness History (last 30 days)\n\n")
	b.WriteString("| Test | Runs | Pass% | Flaky Score | Last Status |\n")
	b.WriteString("|------|------|-------|-------------|-------------|\n")
	for _, h := range history {
		if !h.HasHistory {
			fmt.Fprintf(b, "| %s | 0 | — | — | no history |\n", h.TestName)
			continue
		}
		fmt.Fprintf(b, "| %s | %d | %.0f%% | %.2f | %s |\n",
			h.TestName, h.TotalRuns, h.PassRate, h.FlakyScore, h.LastStatus)
	}
	b.WriteString("\n")
}

func writeGitDiff(b *strings.Builder, diff analytics.GitDiffSummary) {
	if diff.Repository == "" || len(diff.Files) == 0 {
		return
	}
	b.WriteString("## Code Changes\n\n")
	fmt.Fprintf(b, "Repository: %s\n", diff.Repository)
	if diff.BaseCommit != "" {
		fmt.Fprintf(b, "Base: %s → Head: %s\n", diff.BaseCommit, diff.HeadCommit)
	} else {
		fmt.Fprintf(b, "Head: %s\n", diff.HeadCommit)
	}
	if diff.Truncated {
		fmt.Fprintf(b, "(showing top %d of %d changed files by churn)\n", len(diff.Files), diff.TotalFiles)
	}
	b.WriteString("\n")
	for _, f := range diff.Files {
		fmt.Fprintf(b, "- %s (+%d/-%d churn=%d)\n", f.Path, f.Additions, f.Deletions, f.Churn)
	}
	b.WriteString("\n")
}

func writePreviousFailures(b *strings.Builder, prev []string) {
	if len(prev) == 0 {
		return
	}
	b.WriteString("## Previous Run Failures\n\n")
	b.WriteString("These tests also failed in the preceding run (may indicate regressions or persistent failures):\n\n")
	for _, name := range prev {
		fmt.Fprintf(b, "- %s\n", name)
	}
	b.WriteString("\n")
}

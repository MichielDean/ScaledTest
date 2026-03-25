package triage

import (
	"fmt"
	"strings"
	"testing"

	"github.com/scaledtest/scaledtest/internal/analytics"
)

// makeNFailures builds n synthetic FailureDetail values for testing.
func makeNFailures(n int) []FailureDetail {
	failures := make([]FailureDetail, n)
	for i := range failures {
		failures[i] = FailureDetail{
			TestResultID: fmt.Sprintf("tr-%d", i+1),
			Name:         fmt.Sprintf("suite/TestFeature%d_WhenCondition_ReturnsError", i+1),
			Suite:        "suite",
			Message:      fmt.Sprintf("expected true but got false at assertion line %d of test %d", i+10, i+1),
			Trace:        fmt.Sprintf("goroutine 1 [running]:\nsuite.TestFeature%d(0x...)\n\t/repo/suite/feature_test.go:%d\ntesting.tRunner(0x...)\n\t/usr/local/go/src/testing/testing.go:1576", i+1, i+10),
		}
	}
	return failures
}

// estimateTokens approximates the token count of a string using the
// ~4 chars-per-token heuristic common for English/code content.
func estimateTokens(s string) int {
	return len(s) / 4
}

// ----- BuildPrompt content tests ------------------------------------------

func TestBuildPrompt_ContainsAllTestResultIDs(t *testing.T) {
	failures := makeNFailures(5)
	prompt := BuildPrompt(TriageInput{Failures: failures})

	for _, f := range failures {
		if !strings.Contains(prompt, f.TestResultID) {
			t.Errorf("prompt missing test_result_id %q", f.TestResultID)
		}
	}
}

func TestBuildPrompt_ContainsAllFailureNames(t *testing.T) {
	failures := makeNFailures(5)
	prompt := BuildPrompt(TriageInput{Failures: failures})

	for _, f := range failures {
		if !strings.Contains(prompt, f.Name) {
			t.Errorf("prompt missing failure name %q", f.Name)
		}
	}
}

func TestBuildPrompt_ContainsFlakinessSection_WhenHistoryPresent(t *testing.T) {
	input := TriageInput{
		Failures: makeNFailures(2),
		FlakinessHistory: []analytics.TestFlakinessSummary{
			{
				TestName:   "suite/TestA",
				TotalRuns:  10,
				PassRate:   70.0,
				FlakyScore: 0.4,
				LastStatus: "passed",
				HasHistory: true,
			},
		},
	}

	prompt := BuildPrompt(input)

	if !strings.Contains(prompt, "Flakiness History") {
		t.Error("prompt missing Flakiness History section")
	}
	if !strings.Contains(prompt, "suite/TestA") {
		t.Error("prompt missing flakiness test name")
	}
}

func TestBuildPrompt_OmitsFlakinessSection_WhenNoHistory(t *testing.T) {
	input := TriageInput{Failures: makeNFailures(2)}
	prompt := BuildPrompt(input)

	if strings.Contains(prompt, "Flakiness History") {
		t.Error("prompt should not include Flakiness History section when history is empty")
	}
}

func TestBuildPrompt_ContainsGitDiffSection_WhenFilesPresent(t *testing.T) {
	input := TriageInput{
		Failures: makeNFailures(2),
		GitDiff: analytics.GitDiffSummary{
			Repository: "acme/myrepo",
			BaseCommit: "abc123",
			HeadCommit: "def456",
			Files: []analytics.FileDiffStat{
				{Path: "internal/handler/api.go", Additions: 50, Deletions: 20, Churn: 70},
			},
		},
	}

	prompt := BuildPrompt(input)

	if !strings.Contains(prompt, "Code Changes") {
		t.Error("prompt missing Code Changes section")
	}
	if !strings.Contains(prompt, "internal/handler/api.go") {
		t.Error("prompt missing diff file path")
	}
	if !strings.Contains(prompt, "acme/myrepo") {
		t.Error("prompt missing repository name")
	}
}

func TestBuildPrompt_OmitsGitDiffSection_WhenNoFiles(t *testing.T) {
	input := TriageInput{
		Failures: makeNFailures(2),
		GitDiff:  analytics.GitDiffSummary{Repository: "acme/myrepo", HeadCommit: "abc"},
	}

	prompt := BuildPrompt(input)

	if strings.Contains(prompt, "Code Changes") {
		t.Error("prompt should not include Code Changes section when diff has no files")
	}
}

func TestBuildPrompt_OmitsGitDiffSection_WhenRepositoryEmpty(t *testing.T) {
	input := TriageInput{
		Failures: makeNFailures(2),
		GitDiff:  analytics.GitDiffSummary{},
	}
	prompt := BuildPrompt(input)

	if strings.Contains(prompt, "Code Changes") {
		t.Error("prompt should not include Code Changes section when repository is empty")
	}
}

func TestBuildPrompt_ContainsPreviousFailuresSection_WhenPresent(t *testing.T) {
	input := TriageInput{
		Failures:         makeNFailures(2),
		PreviousFailures: []string{"suite/TestOld1", "suite/TestOld2"},
	}

	prompt := BuildPrompt(input)

	if !strings.Contains(prompt, "Previous Run Failures") {
		t.Error("prompt missing Previous Run Failures section")
	}
	if !strings.Contains(prompt, "suite/TestOld1") {
		t.Error("prompt missing first previous failure name")
	}
}

func TestBuildPrompt_OmitsPreviousFailuresSection_WhenEmpty(t *testing.T) {
	input := TriageInput{Failures: makeNFailures(2)}
	prompt := BuildPrompt(input)

	if strings.Contains(prompt, "Previous Run Failures") {
		t.Error("prompt should not include Previous Run Failures section when none provided")
	}
}

func TestBuildPrompt_TruncatesLongMessages_ForManyFailures(t *testing.T) {
	// With 50 failures, messages should be truncated to msgLimit(50).
	long := strings.Repeat("x", 5000)
	failures := make([]FailureDetail, 50)
	for i := range failures {
		failures[i] = FailureDetail{
			TestResultID: fmt.Sprintf("tr-%d", i),
			Name:         fmt.Sprintf("suite/Test%d", i),
			Message:      long,
		}
	}

	prompt := BuildPrompt(TriageInput{Failures: failures})

	limit := msgLimit(50)
	// The truncated message appears as limit bytes + "…". Check that the full
	// 5000-char string does not appear verbatim.
	if strings.Contains(prompt, long) {
		t.Errorf("prompt should have truncated 5000-char message to %d chars", limit)
	}
	// But the truncated prefix must be present.
	truncated := long[:limit]
	if !strings.Contains(prompt, truncated) {
		t.Errorf("prompt should contain the first %d chars of the message", limit)
	}
}

func TestBuildPrompt_TruncatesLongTraces_ForManyFailures(t *testing.T) {
	long := strings.Repeat("t", 5000)
	failures := make([]FailureDetail, 50)
	for i := range failures {
		failures[i] = FailureDetail{
			TestResultID: fmt.Sprintf("tr-%d", i),
			Name:         fmt.Sprintf("suite/Test%d", i),
			Trace:        long,
		}
	}

	prompt := BuildPrompt(TriageInput{Failures: failures})

	limit := traceLimit(50)
	if strings.Contains(prompt, long) {
		t.Errorf("prompt should have truncated 5000-char trace to %d chars", limit)
	}
	truncated := long[:limit]
	if !strings.Contains(prompt, truncated) {
		t.Errorf("prompt should contain the first %d chars of the trace", limit)
	}
}

func TestBuildPrompt_WithFiftyFailures_StaysWithin8kTokens(t *testing.T) {
	// Build 50 failures, each with maximum-length message and trace before
	// truncation. Adaptive limits must keep the prompt under 32 000 chars
	// (≈ 8 000 tokens at 4 chars/token).
	const maxChars = 32_000

	long := strings.Repeat("e", 5000)
	failures := make([]FailureDetail, 50)
	for i := range failures {
		failures[i] = FailureDetail{
			TestResultID: fmt.Sprintf("tr-%d", i),
			Name:         fmt.Sprintf("pkg/TestSomeLongTestName%d_GivenSomeCondition_ReturnsExpected", i),
			Suite:        "pkg",
			Message:      long,
			Trace:        long,
		}
	}
	history := make([]analytics.TestFlakinessSummary, 50)
	for i := range history {
		history[i] = analytics.TestFlakinessSummary{
			TestName:   fmt.Sprintf("pkg/TestSomeLongTestName%d_GivenSomeCondition_ReturnsExpected", i),
			TotalRuns:  20,
			PassRate:   80.0,
			FlakyScore: 0.1,
			LastStatus: "passed",
			HasHistory: true,
		}
	}
	prev := make([]string, 50)
	for i := range prev {
		prev[i] = fmt.Sprintf("pkg/TestSomeLongTestName%d_GivenSomeCondition_ReturnsExpected", i)
	}

	input := TriageInput{
		Failures:         failures,
		FlakinessHistory: history,
		GitDiff: analytics.GitDiffSummary{
			Repository: "org/myrepo",
			BaseCommit: "base123",
			HeadCommit: "head456",
			Files:      makeDiffFiles(20),
		},
		PreviousFailures: prev,
	}

	prompt := BuildPrompt(input)

	if len(prompt) > maxChars {
		t.Errorf("prompt length %d exceeds 8k-token budget (%d chars); consider tightening truncation limits",
			len(prompt), maxChars)
	}
}

func TestBuildPrompt_ContainsJSONSchemaInstruction(t *testing.T) {
	prompt := BuildPrompt(TriageInput{Failures: makeNFailures(1)})

	if !strings.Contains(prompt, `"summary"`) {
		t.Error("prompt should describe expected JSON field 'summary'")
	}
	if !strings.Contains(prompt, `"clusters"`) {
		t.Error("prompt should describe expected JSON field 'clusters'")
	}
	if !strings.Contains(prompt, `"classifications"`) {
		t.Error("prompt should describe expected JSON field 'classifications'")
	}
}

func TestBuildPrompt_EmptyFailures_ReturnsNonEmptyInstructions(t *testing.T) {
	// Even with zero failures, BuildPrompt should return a non-empty string.
	prompt := BuildPrompt(TriageInput{})
	if len(prompt) == 0 {
		t.Error("BuildPrompt with empty input should still return instructions")
	}
}

func TestMsgLimit_AdaptsToFailureCount(t *testing.T) {
	tests := []struct {
		n    int
		want int
	}{
		{1, 500},
		{10, 500},
		{11, 300},
		{25, 300},
		{26, 100},
		{50, 100},
	}
	for _, tt := range tests {
		t.Run(fmt.Sprintf("n=%d", tt.n), func(t *testing.T) {
			if got := msgLimit(tt.n); got != tt.want {
				t.Errorf("msgLimit(%d) = %d, want %d", tt.n, got, tt.want)
			}
		})
	}
}

func TestTraceLimit_AdaptsToFailureCount(t *testing.T) {
	tests := []struct {
		n    int
		want int
	}{
		{1, 800},
		{10, 800},
		{11, 500},
		{25, 500},
		{26, 150},
		{50, 150},
	}
	for _, tt := range tests {
		t.Run(fmt.Sprintf("n=%d", tt.n), func(t *testing.T) {
			if got := traceLimit(tt.n); got != tt.want {
				t.Errorf("traceLimit(%d) = %d, want %d", tt.n, got, tt.want)
			}
		})
	}
}

// makeDiffFiles creates n synthetic FileDiffStat values.
func makeDiffFiles(n int) []analytics.FileDiffStat {
	files := make([]analytics.FileDiffStat, n)
	for i := range files {
		files[i] = analytics.FileDiffStat{
			Path:      fmt.Sprintf("internal/pkg%d/file.go", i),
			Additions: 10 + i,
			Deletions: 5 + i,
			Churn:     15 + 2*i,
		}
	}
	return files
}

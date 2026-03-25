// Package triage implements the failure clustering and triage prompt engine.
//
// The engine accepts a structured set of failing test results together with
// enrichment data (flakiness history, git diff, previous run failures), builds
// a structured LLM prompt, calls the configured provider, and parses the
// JSON response into typed triage results.
//
// On any LLM or parse error the engine degrades gracefully: it returns a
// fallback TriageOutput in which every failure is classified as "unknown",
// alongside the original error so callers can record a failed triage status.
package triage

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/scaledtest/scaledtest/internal/analytics"
	"github.com/scaledtest/scaledtest/internal/llm"
)

// FailureDetail is a single failing test with its diagnostic context.
type FailureDetail struct {
	// TestResultID is the opaque identifier for this test result row. It is
	// echoed back in every ClassificationResult so callers can join results
	// with their own records.
	TestResultID string

	// Name is the fully-qualified test name (e.g. "suite/TestX_WhenY_DoesZ").
	Name string

	// Suite is the optional test suite name.
	Suite string

	// Message is the failure error message. Long messages are truncated by
	// BuildPrompt according to the adaptive limit for the failure count.
	Message string

	// Trace is the stack trace. Long traces are truncated by BuildPrompt.
	Trace string

	// DurationMs is the test duration in milliseconds (informational).
	DurationMs int64
}

// TriageInput bundles all context passed to the engine for one triage operation.
type TriageInput struct {
	// Failures is the list of failing tests to cluster and classify.
	// An empty slice causes Triage to return an empty output without calling
	// the LLM provider.
	Failures []FailureDetail

	// FlakinessHistory holds per-test flakiness metrics computed from recent
	// run history. Typically scoped to the same test names as Failures.
	FlakinessHistory []analytics.TestFlakinessSummary

	// GitDiff is the code change context for this commit. A zero value
	// (Repository == "") means no diff context is available and the section
	// is omitted from the prompt.
	GitDiff analytics.GitDiffSummary

	// PreviousFailures lists test names that also failed in the immediately
	// preceding run. Helps distinguish regressions from persistent failures.
	PreviousFailures []string
}

// ClusterResult is one root-cause group returned by the engine.
type ClusterResult struct {
	// RootCause is a concise description of the shared failure cause.
	RootCause string

	// Label is an optional short identifier for the cluster (may be empty).
	Label string
}

// ClassificationResult holds the engine's verdict for one failing test.
type ClassificationResult struct {
	// TestResultID matches the corresponding FailureDetail.TestResultID.
	TestResultID string

	// ClusterIndex is the zero-based index into TriageOutput.Clusters that
	// this failure belongs to. -1 means the failure was not assigned to any
	// cluster (only possible in fallback mode or when the LLM omits it).
	ClusterIndex int

	// Classification is one of: "new", "flaky", "regression", "unknown".
	Classification string
}

// TriageOutput is the parsed, validated result produced by the engine for
// one triage operation.
type TriageOutput struct {
	// Summary is a 1–3 sentence human-readable description of the overall
	// failure pattern. On error it contains a description of the failure.
	Summary string

	// Clusters is the ordered list of root-cause groups identified by the LLM.
	// Empty in fallback mode.
	Clusters []ClusterResult

	// Classifications holds one entry per input FailureDetail in the same
	// order as TriageInput.Failures. Always len(input.Failures) long.
	Classifications []ClassificationResult
}

// Engine constructs triage prompts, invokes the LLM, and parses the response
// into structured TriageOutput values.
type Engine struct {
	provider llm.Provider
}

// NewEngine creates an Engine backed by provider.
func NewEngine(provider llm.Provider) *Engine {
	return &Engine{provider: provider}
}

// Triage runs the full triage pipeline for input.
//
// When input.Failures is empty Triage returns an empty TriageOutput and a nil
// error without calling the provider.
//
// On LLM or parse error Triage returns both the error and a fallback
// TriageOutput in which every failure carries Classification="unknown" and
// ClusterIndex=-1. Callers should record the failure status but may still
// persist the fallback classifications.
func (e *Engine) Triage(ctx context.Context, input TriageInput) (*TriageOutput, error) {
	if len(input.Failures) == 0 {
		return &TriageOutput{Clusters: []ClusterResult{}}, nil
	}

	prompt := BuildPrompt(input)

	raw, err := e.provider.Analyze(ctx, prompt)
	if err != nil {
		return fallbackOutput(input.Failures, fmt.Sprintf("LLM call failed: %s", err.Error())), err
	}

	parsed, parseErr := parseLLMOutput(raw)
	if parseErr != nil {
		return fallbackOutput(input.Failures, fmt.Sprintf("LLM response parse error: %s", parseErr.Error())), parseErr
	}

	return buildOutput(input.Failures, parsed), nil
}

// parseLLMOutput decodes raw JSON from the LLM into an llmOutput.
// It returns an error if the JSON cannot be decoded or does not match the
// expected structure (e.g. clusters is not an array).
func parseLLMOutput(raw json.RawMessage) (*llmOutput, error) {
	var out llmOutput
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("unmarshal LLM response: %w", err)
	}
	return &out, nil
}

// buildOutput converts a decoded llmOutput into a TriageOutput.
//
// Classification values not in validClassifications are normalised to
// "unknown". Failures absent from the LLM response are appended with
// Classification="unknown" and ClusterIndex=-1.
func buildOutput(failures []FailureDetail, out *llmOutput) *TriageOutput {
	result := &TriageOutput{
		Summary:  out.Summary,
		Clusters: make([]ClusterResult, 0, len(out.Clusters)),
	}

	// Build the cluster list and collect the classification for each test ID.
	classified := make(map[string]ClassificationResult, len(failures))
	for i, c := range out.Clusters {
		result.Clusters = append(result.Clusters, ClusterResult{
			RootCause: c.RootCause,
			Label:     c.Label,
		})
		for _, cl := range c.Classifications {
			classification := cl.Classification
			if !validClassifications[classification] {
				classification = "unknown"
			}
			classified[cl.TestResultID] = ClassificationResult{
				TestResultID:   cl.TestResultID,
				ClusterIndex:   i,
				Classification: classification,
			}
		}
	}

	// Emit one ClassificationResult per input failure, in input order.
	// Fill any that the LLM omitted as unknown/unassigned.
	result.Classifications = make([]ClassificationResult, 0, len(failures))
	for _, f := range failures {
		if cr, ok := classified[f.TestResultID]; ok {
			result.Classifications = append(result.Classifications, cr)
		} else {
			result.Classifications = append(result.Classifications, ClassificationResult{
				TestResultID:   f.TestResultID,
				ClusterIndex:   -1,
				Classification: "unknown",
			})
		}
	}

	return result
}

// fallbackOutput returns a TriageOutput with every failure classified as
// "unknown" and summary set to the provided error description.
func fallbackOutput(failures []FailureDetail, summary string) *TriageOutput {
	classifications := make([]ClassificationResult, len(failures))
	for i, f := range failures {
		classifications[i] = ClassificationResult{
			TestResultID:   f.TestResultID,
			ClusterIndex:   -1,
			Classification: "unknown",
		}
	}
	return &TriageOutput{
		Summary:         summary,
		Clusters:        []ClusterResult{},
		Classifications: classifications,
	}
}

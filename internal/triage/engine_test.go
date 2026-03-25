package triage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/scaledtest/scaledtest/internal/llm"
)

// validResponse returns a well-formed JSON response that assigns every failure
// in failures to a single cluster, all classified as "new".
func validResponse(failures []FailureDetail) json.RawMessage {
	cls := make([]llmClassification, len(failures))
	for i, f := range failures {
		cls[i] = llmClassification{
			TestResultID:   f.TestResultID,
			Classification: "new",
		}
	}
	out := llmOutput{
		Summary: "All failures appear to be new defects introduced in this commit.",
		Clusters: []llmCluster{
			{
				RootCause:       "assertion failure in suite",
				Label:           "suite failures",
				Classifications: cls,
			},
		},
	}
	data, err := json.Marshal(out)
	if err != nil {
		panic(fmt.Sprintf("validResponse marshal: %v", err))
	}
	return data
}

// multiClusterResponse distributes failures across two clusters.
func multiClusterResponse(failures []FailureDetail) json.RawMessage {
	half := len(failures) / 2
	cls1 := make([]llmClassification, half)
	for i := range cls1 {
		cls1[i] = llmClassification{TestResultID: failures[i].TestResultID, Classification: "flaky"}
	}
	cls2 := make([]llmClassification, len(failures)-half)
	for i := range cls2 {
		cls2[i] = llmClassification{TestResultID: failures[half+i].TestResultID, Classification: "regression"}
	}
	out := llmOutput{
		Summary: "Failures split across two root causes.",
		Clusters: []llmCluster{
			{RootCause: "flaky database setup", Label: "db", Classifications: cls1},
			{RootCause: "API contract change", Label: "api", Classifications: cls2},
		},
	}
	data, _ := json.Marshal(out)
	return data
}

// ---- NewEngine -----------------------------------------------------------

func TestNewEngine_ReturnsNonNil(t *testing.T) {
	e := NewEngine(llm.NewMock(json.RawMessage(`{}`)))
	if e == nil {
		t.Fatal("NewEngine returned nil")
	}
}

// ---- Engine.Triage happy path -------------------------------------------

func TestEngine_Triage_HappyPath_ReturnsSummary(t *testing.T) {
	failures := makeNFailures(5)
	mock := llm.NewMock(validResponse(failures))
	e := NewEngine(mock)

	out, err := e.Triage(context.Background(), TriageInput{Failures: failures})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out.Summary == "" {
		t.Error("Summary should be non-empty on happy path")
	}
}

func TestEngine_Triage_HappyPath_ReturnsOneClusters(t *testing.T) {
	failures := makeNFailures(5)
	mock := llm.NewMock(validResponse(failures))
	e := NewEngine(mock)

	out, err := e.Triage(context.Background(), TriageInput{Failures: failures})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out.Clusters) != 1 {
		t.Fatalf("want 1 cluster, got %d", len(out.Clusters))
	}
	if out.Clusters[0].RootCause == "" {
		t.Error("cluster RootCause should be non-empty")
	}
}

func TestEngine_Triage_HappyPath_ClassifiesAllFailures(t *testing.T) {
	failures := makeNFailures(5)
	mock := llm.NewMock(validResponse(failures))
	e := NewEngine(mock)

	out, err := e.Triage(context.Background(), TriageInput{Failures: failures})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out.Classifications) != len(failures) {
		t.Fatalf("want %d classifications, got %d", len(failures), len(out.Classifications))
	}
	for _, c := range out.Classifications {
		if c.Classification == "" {
			t.Error("classification must not be empty")
		}
		if !validClassifications[c.Classification] {
			t.Errorf("classification %q is not a valid value", c.Classification)
		}
	}
}

func TestEngine_Triage_HappyPath_ClassificationsMappedToCluster(t *testing.T) {
	failures := makeNFailures(4)
	mock := llm.NewMock(validResponse(failures))
	e := NewEngine(mock)

	out, err := e.Triage(context.Background(), TriageInput{Failures: failures})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, c := range out.Classifications {
		if c.ClusterIndex < 0 || c.ClusterIndex >= len(out.Clusters) {
			t.Errorf("ClassificationResult.ClusterIndex %d out of range [0, %d)",
				c.ClusterIndex, len(out.Clusters))
		}
	}
}

func TestEngine_Triage_HappyPath_MultipleClusters(t *testing.T) {
	failures := makeNFailures(6)
	mock := llm.NewMock(multiClusterResponse(failures))
	e := NewEngine(mock)

	out, err := e.Triage(context.Background(), TriageInput{Failures: failures})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out.Clusters) != 2 {
		t.Fatalf("want 2 clusters, got %d", len(out.Clusters))
	}
	if len(out.Classifications) != len(failures) {
		t.Fatalf("want %d classifications, got %d", len(failures), len(out.Classifications))
	}
}

func TestEngine_Triage_HappyPath_SetsTestResultIDs(t *testing.T) {
	failures := makeNFailures(3)
	mock := llm.NewMock(validResponse(failures))
	e := NewEngine(mock)

	out, err := e.Triage(context.Background(), TriageInput{Failures: failures})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := map[string]bool{}
	for _, f := range failures {
		want[f.TestResultID] = true
	}
	for _, c := range out.Classifications {
		if !want[c.TestResultID] {
			t.Errorf("unexpected TestResultID %q in classifications", c.TestResultID)
		}
		delete(want, c.TestResultID)
	}
	if len(want) > 0 {
		for id := range want {
			t.Errorf("missing classification for TestResultID %q", id)
		}
	}
}

// ---- Engine.Triage LLM error handling -----------------------------------

func TestEngine_Triage_LLMError_ReturnsErrorAndFallback(t *testing.T) {
	failures := makeNFailures(3)
	mock := llm.NewMock(nil)
	mock.SetError(errors.New("service unavailable"))
	e := NewEngine(mock)

	out, err := e.Triage(context.Background(), TriageInput{Failures: failures})

	if err == nil {
		t.Fatal("expected error when LLM returns error")
	}
	// Fallback output must still classify all failures.
	if len(out.Classifications) != len(failures) {
		t.Fatalf("fallback: want %d classifications, got %d", len(failures), len(out.Classifications))
	}
	for _, c := range out.Classifications {
		if c.Classification != "unknown" {
			t.Errorf("fallback classification should be 'unknown', got %q", c.Classification)
		}
		if c.ClusterIndex != -1 {
			t.Errorf("fallback ClusterIndex should be -1, got %d", c.ClusterIndex)
		}
	}
	if out.Clusters != nil && len(out.Clusters) != 0 {
		t.Errorf("fallback should have no clusters, got %d", len(out.Clusters))
	}
}

func TestEngine_Triage_InvalidJSON_ReturnsErrorAndFallback(t *testing.T) {
	failures := makeNFailures(3)
	mock := llm.NewMock(json.RawMessage(`{"not": "the right schema", "malformed`))
	// The mock returns valid Go value (raw bytes) but they aren't valid JSON for our schema.
	// Let's make it proper invalid JSON.
	mock2 := llm.NewMock(json.RawMessage(`{"summary": 123, "clusters": "wrong"}`))
	e := NewEngine(mock2)

	out, err := e.Triage(context.Background(), TriageInput{Failures: failures})

	if err == nil {
		t.Fatal("expected error on schema mismatch")
	}
	if len(out.Classifications) != len(failures) {
		t.Fatalf("fallback: want %d classifications, got %d", len(failures), len(out.Classifications))
	}
	for _, c := range out.Classifications {
		if c.Classification != "unknown" {
			t.Errorf("fallback classification should be 'unknown', got %q", c.Classification)
		}
	}
	_ = mock // suppress unused warning
}

func TestEngine_Triage_MissingClassifications_FilledAsUnknown(t *testing.T) {
	// LLM response only classifies 2 of 4 failures; the rest must be filled as unknown.
	failures := makeNFailures(4)

	partial := llmOutput{
		Summary: "Partial triage.",
		Clusters: []llmCluster{
			{
				RootCause: "partial cause",
				Classifications: []llmClassification{
					{TestResultID: failures[0].TestResultID, Classification: "new"},
					{TestResultID: failures[1].TestResultID, Classification: "flaky"},
				},
			},
		},
	}
	data, _ := json.Marshal(partial)
	mock := llm.NewMock(data)
	e := NewEngine(mock)

	out, err := e.Triage(context.Background(), TriageInput{Failures: failures})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out.Classifications) != 4 {
		t.Fatalf("want 4 classifications, got %d", len(out.Classifications))
	}
	byID := map[string]ClassificationResult{}
	for _, c := range out.Classifications {
		byID[c.TestResultID] = c
	}
	if byID[failures[0].TestResultID].Classification != "new" {
		t.Errorf("failures[0] should be 'new', got %q", byID[failures[0].TestResultID].Classification)
	}
	if byID[failures[1].TestResultID].Classification != "flaky" {
		t.Errorf("failures[1] should be 'flaky', got %q", byID[failures[1].TestResultID].Classification)
	}
	if byID[failures[2].TestResultID].Classification != "unknown" {
		t.Errorf("failures[2] should be 'unknown', got %q", byID[failures[2].TestResultID].Classification)
	}
	if byID[failures[3].TestResultID].Classification != "unknown" {
		t.Errorf("failures[3] should be 'unknown', got %q", byID[failures[3].TestResultID].Classification)
	}
	// Missing entries should have no cluster assignment.
	if byID[failures[2].TestResultID].ClusterIndex != -1 {
		t.Errorf("unfilled failure should have ClusterIndex -1, got %d", byID[failures[2].TestResultID].ClusterIndex)
	}
}

func TestEngine_Triage_InvalidClassificationValue_NormalizedToUnknown(t *testing.T) {
	failures := makeNFailures(2)

	bad := llmOutput{
		Summary: "Bad classification values.",
		Clusters: []llmCluster{
			{
				RootCause: "some cause",
				Classifications: []llmClassification{
					{TestResultID: failures[0].TestResultID, Classification: "bogus-value"},
					{TestResultID: failures[1].TestResultID, Classification: "FLAKY"}, // wrong case
				},
			},
		},
	}
	data, _ := json.Marshal(bad)
	mock := llm.NewMock(data)
	e := NewEngine(mock)

	out, err := e.Triage(context.Background(), TriageInput{Failures: failures})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, c := range out.Classifications {
		if c.Classification != "unknown" {
			t.Errorf("invalid classification value should be normalized to 'unknown', got %q", c.Classification)
		}
	}
}

// ---- Engine.Triage empty input ------------------------------------------

func TestEngine_Triage_EmptyFailures_ReturnsEmptyOutput(t *testing.T) {
	mock := llm.NewMock(json.RawMessage(`{}`))
	e := NewEngine(mock)

	out, err := e.Triage(context.Background(), TriageInput{})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out.Classifications) != 0 {
		t.Errorf("want 0 classifications, got %d", len(out.Classifications))
	}
	if len(out.Clusters) != 0 {
		t.Errorf("want 0 clusters, got %d", len(out.Clusters))
	}
	// Provider must not be called for empty input.
	if len(mock.Calls()) != 0 {
		t.Errorf("provider should not be called for empty input, got %d calls", len(mock.Calls()))
	}
}

// ---- Engine.Triage scale tests ------------------------------------------

func TestEngine_Triage_FiveFailures_ProducesValidResult(t *testing.T) {
	failures := makeNFailures(5)
	mock := llm.NewMock(validResponse(failures))
	e := NewEngine(mock)

	out, err := e.Triage(context.Background(), TriageInput{Failures: failures})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out.Classifications) != 5 {
		t.Fatalf("want 5 classifications, got %d", len(out.Classifications))
	}
}

func TestEngine_Triage_FiftyFailures_ProducesValidResult(t *testing.T) {
	failures := makeNFailures(50)
	mock := llm.NewMock(validResponse(failures))
	e := NewEngine(mock)

	out, err := e.Triage(context.Background(), TriageInput{Failures: failures})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out.Classifications) != 50 {
		t.Fatalf("want 50 classifications, got %d", len(out.Classifications))
	}
}

func TestEngine_Triage_SendsPromptToProvider(t *testing.T) {
	failures := makeNFailures(3)
	mock := llm.NewMock(validResponse(failures))
	e := NewEngine(mock)

	e.Triage(context.Background(), TriageInput{Failures: failures}) //nolint:errcheck

	calls := mock.Calls()
	if len(calls) != 1 {
		t.Fatalf("want 1 provider call, got %d", len(calls))
	}
	// The prompt should contain the test result IDs.
	for _, f := range failures {
		if !strings.Contains(calls[0], f.TestResultID) {
			t.Errorf("prompt sent to provider is missing test_result_id %q", f.TestResultID)
		}
	}
}

// ---- buildOutput (internal) unit tests ----------------------------------

func TestBuildOutput_PreservesClusterOrder(t *testing.T) {
	failures := makeNFailures(4)
	out := llmOutput{
		Summary: "test",
		Clusters: []llmCluster{
			{
				RootCause: "first",
				Classifications: []llmClassification{
					{TestResultID: failures[0].TestResultID, Classification: "new"},
					{TestResultID: failures[1].TestResultID, Classification: "new"},
				},
			},
			{
				RootCause: "second",
				Classifications: []llmClassification{
					{TestResultID: failures[2].TestResultID, Classification: "flaky"},
					{TestResultID: failures[3].TestResultID, Classification: "regression"},
				},
			},
		},
	}

	result := buildOutput(failures, &out)

	if len(result.Clusters) != 2 {
		t.Fatalf("want 2 clusters, got %d", len(result.Clusters))
	}
	if result.Clusters[0].RootCause != "first" {
		t.Errorf("cluster[0].RootCause = %q, want %q", result.Clusters[0].RootCause, "first")
	}
	if result.Clusters[1].RootCause != "second" {
		t.Errorf("cluster[1].RootCause = %q, want %q", result.Clusters[1].RootCause, "second")
	}
}

func TestBuildOutput_ClassificationIndicesMatchClusters(t *testing.T) {
	failures := makeNFailures(4)
	out := llmOutput{
		Summary: "test",
		Clusters: []llmCluster{
			{
				RootCause: "cluster A",
				Classifications: []llmClassification{
					{TestResultID: failures[0].TestResultID, Classification: "new"},
					{TestResultID: failures[1].TestResultID, Classification: "new"},
				},
			},
			{
				RootCause: "cluster B",
				Classifications: []llmClassification{
					{TestResultID: failures[2].TestResultID, Classification: "flaky"},
					{TestResultID: failures[3].TestResultID, Classification: "flaky"},
				},
			},
		},
	}

	result := buildOutput(failures, &out)

	byID := map[string]ClassificationResult{}
	for _, c := range result.Classifications {
		byID[c.TestResultID] = c
	}
	if byID[failures[0].TestResultID].ClusterIndex != 0 {
		t.Errorf("failures[0] should be in cluster 0, got %d", byID[failures[0].TestResultID].ClusterIndex)
	}
	if byID[failures[2].TestResultID].ClusterIndex != 1 {
		t.Errorf("failures[2] should be in cluster 1, got %d", byID[failures[2].TestResultID].ClusterIndex)
	}
}

// ---- fallbackOutput (internal) unit tests --------------------------------

func TestFallbackOutput_AllClassifiedAsUnknown(t *testing.T) {
	failures := makeNFailures(5)
	out := fallbackOutput(failures, "something went wrong")

	if out.Summary != "something went wrong" {
		t.Errorf("Summary = %q, want %q", out.Summary, "something went wrong")
	}
	if len(out.Classifications) != 5 {
		t.Fatalf("want 5 classifications, got %d", len(out.Classifications))
	}
	for _, c := range out.Classifications {
		if c.Classification != "unknown" {
			t.Errorf("classification = %q, want 'unknown'", c.Classification)
		}
		if c.ClusterIndex != -1 {
			t.Errorf("ClusterIndex = %d, want -1", c.ClusterIndex)
		}
	}
	if len(out.Clusters) != 0 {
		t.Errorf("want 0 clusters, got %d", len(out.Clusters))
	}
}

func TestFallbackOutput_PreservesTestResultIDs(t *testing.T) {
	failures := makeNFailures(3)
	out := fallbackOutput(failures, "error")

	for i, c := range out.Classifications {
		if c.TestResultID != failures[i].TestResultID {
			t.Errorf("[%d] TestResultID = %q, want %q", i, c.TestResultID, failures[i].TestResultID)
		}
	}
}

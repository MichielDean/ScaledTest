package quality

import (
	"encoding/json"
	"testing"

	"github.com/scaledtest/scaledtest/internal/analytics"
)

func TestEvaluatePassRate(t *testing.T) {
	rules := `[{"type":"pass_rate","params":{"threshold":90.0}}]`
	data := &ReportData{TotalTests: 100, PassedTests: 95, FailedTests: 5}

	result, err := Evaluate(json.RawMessage(rules), data)
	if err != nil {
		t.Fatalf("Evaluate() error: %v", err)
	}
	if !result.Passed {
		t.Error("expected gate to pass with 95% pass rate >= 90% threshold")
	}
}

func TestEvaluatePassRateFail(t *testing.T) {
	rules := `[{"type":"pass_rate","params":{"threshold":90.0}}]`
	data := &ReportData{TotalTests: 100, PassedTests: 80, FailedTests: 20}

	result, err := Evaluate(json.RawMessage(rules), data)
	if err != nil {
		t.Fatalf("Evaluate() error: %v", err)
	}
	if result.Passed {
		t.Error("expected gate to fail with 80% pass rate < 90% threshold")
	}
}

func TestEvaluateZeroFailures(t *testing.T) {
	rules := `[{"type":"zero_failures"}]`

	t.Run("passing", func(t *testing.T) {
		data := &ReportData{TotalTests: 10, PassedTests: 10, FailedTests: 0}
		result, _ := Evaluate(json.RawMessage(rules), data)
		if !result.Passed {
			t.Error("expected pass with 0 failures")
		}
	})

	t.Run("failing", func(t *testing.T) {
		data := &ReportData{TotalTests: 10, PassedTests: 9, FailedTests: 1}
		result, _ := Evaluate(json.RawMessage(rules), data)
		if result.Passed {
			t.Error("expected fail with 1 failure")
		}
	})
}

func TestEvaluateNoNewFailures(t *testing.T) {
	rules := `[{"type":"no_new_failures"}]`

	t.Run("no regressions", func(t *testing.T) {
		data := &ReportData{
			PreviousFailedTests: map[string]bool{"test_a": true},
			CurrentFailedTests:  map[string]bool{"test_a": true}, // same failure
		}
		result, _ := Evaluate(json.RawMessage(rules), data)
		if !result.Passed {
			t.Error("expected pass — same failures as before")
		}
	})

	t.Run("new regression", func(t *testing.T) {
		data := &ReportData{
			PreviousFailedTests: map[string]bool{"test_a": true},
			CurrentFailedTests:  map[string]bool{"test_a": true, "test_b": true}, // new failure
		}
		result, _ := Evaluate(json.RawMessage(rules), data)
		if result.Passed {
			t.Error("expected fail — test_b is a new failure")
		}
	})
}

func TestEvaluateMaxDuration(t *testing.T) {
	rules := `[{"type":"max_duration","params":{"threshold_ms":5000}}]`

	t.Run("within limit", func(t *testing.T) {
		data := &ReportData{TotalDurationMs: 3000}
		result, _ := Evaluate(json.RawMessage(rules), data)
		if !result.Passed {
			t.Error("expected pass — 3000ms < 5000ms")
		}
	})

	t.Run("exceeds limit", func(t *testing.T) {
		data := &ReportData{TotalDurationMs: 8000}
		result, _ := Evaluate(json.RawMessage(rules), data)
		if result.Passed {
			t.Error("expected fail — 8000ms > 5000ms")
		}
	})
}

func TestEvaluateMaxFlakyCount(t *testing.T) {
	rules := `[{"type":"max_flaky_count","params":{"threshold":2}}]`

	t.Run("within limit", func(t *testing.T) {
		data := &ReportData{
			FlakyTests: []analytics.FlakyTest{{Name: "flaky1"}},
		}
		result, _ := Evaluate(json.RawMessage(rules), data)
		if !result.Passed {
			t.Error("expected pass — 1 flaky <= 2 threshold")
		}
	})

	t.Run("exceeds limit", func(t *testing.T) {
		data := &ReportData{
			FlakyTests: []analytics.FlakyTest{{Name: "f1"}, {Name: "f2"}, {Name: "f3"}},
		}
		result, _ := Evaluate(json.RawMessage(rules), data)
		if result.Passed {
			t.Error("expected fail — 3 flaky > 2 threshold")
		}
	})
}

func TestEvaluateMinTestCount(t *testing.T) {
	rules := `[{"type":"min_test_count","params":{"threshold":10}}]`

	t.Run("sufficient", func(t *testing.T) {
		data := &ReportData{TotalTests: 15}
		result, _ := Evaluate(json.RawMessage(rules), data)
		if !result.Passed {
			t.Error("expected pass — 15 >= 10")
		}
	})

	t.Run("insufficient", func(t *testing.T) {
		data := &ReportData{TotalTests: 5}
		result, _ := Evaluate(json.RawMessage(rules), data)
		if result.Passed {
			t.Error("expected fail — 5 < 10")
		}
	})
}

func TestEvaluateMultipleRules(t *testing.T) {
	rules := `[
		{"type":"pass_rate","params":{"threshold":90.0}},
		{"type":"zero_failures"},
		{"type":"min_test_count","params":{"threshold":5}}
	]`
	data := &ReportData{TotalTests: 10, PassedTests: 10, FailedTests: 0}

	result, err := Evaluate(json.RawMessage(rules), data)
	if err != nil {
		t.Fatalf("Evaluate() error: %v", err)
	}
	if !result.Passed {
		t.Error("expected all rules to pass")
	}
	if len(result.Results) != 3 {
		t.Errorf("expected 3 rule results, got %d", len(result.Results))
	}
}

func TestEvaluateMultipleRulesPartialFail(t *testing.T) {
	rules := `[
		{"type":"pass_rate","params":{"threshold":90.0}},
		{"type":"zero_failures"}
	]`
	data := &ReportData{TotalTests: 100, PassedTests: 95, FailedTests: 5}

	result, _ := Evaluate(json.RawMessage(rules), data)
	if result.Passed {
		t.Error("expected gate to fail — zero_failures rule fails")
	}
	// pass_rate should pass
	if !result.Results[0].Passed {
		t.Error("pass_rate should pass")
	}
	// zero_failures should fail
	if result.Results[1].Passed {
		t.Error("zero_failures should fail")
	}
}

func TestEvaluateUnknownRule(t *testing.T) {
	rules := `[{"type":"unknown_rule","params":{}}]`
	data := &ReportData{}

	_, err := Evaluate(json.RawMessage(rules), data)
	if err == nil {
		t.Error("expected error for unknown rule type")
	}
}

// TestZeroFailuresVsNoNewFailures_PersistingFailure is the central distinction test.
// When a test has been failing since the previous run (a persistent failure, not a regression),
// zero_failures FAILS because there are failures, but no_new_failures PASSES because the
// failure was already present and no new regressions were introduced.
func TestZeroFailuresVsNoNewFailures_PersistingFailure(t *testing.T) {
	data := &ReportData{
		TotalTests:          10,
		PassedTests:         9,
		FailedTests:         1,
		PreviousFailedTests: map[string]bool{"test_a": true},
		CurrentFailedTests:  map[string]bool{"test_a": true},
	}

	zeroResult, err := Evaluate(json.RawMessage(`[{"type":"zero_failures"}]`), data)
	if err != nil {
		t.Fatalf("Evaluate(zero_failures) error: %v", err)
	}
	if zeroResult.Passed {
		t.Error("zero_failures: expected FAIL — test_a is still failing (1 failure in current run)")
	}
	if zeroResult.Results[0].Actual != 1 {
		t.Errorf("zero_failures: expected Actual=1, got %v", zeroResult.Results[0].Actual)
	}

	noNewResult, err := Evaluate(json.RawMessage(`[{"type":"no_new_failures"}]`), data)
	if err != nil {
		t.Fatalf("Evaluate(no_new_failures) error: %v", err)
	}
	if !noNewResult.Passed {
		t.Error("no_new_failures: expected PASS — test_a was already failing before, no new regression introduced")
	}
	if noNewResult.Results[0].Actual != 0 {
		t.Errorf("no_new_failures: expected Actual=0 new failures, got %v", noNewResult.Results[0].Actual)
	}
}

// TestZeroFailures_IgnoresPreviousRun shows that zero_failures only examines the current
// run's FailedTests count and ignores PreviousFailedTests entirely.
func TestZeroFailures_IgnoresPreviousRun(t *testing.T) {
	// Previous run had many failures, but current run is clean.
	data := &ReportData{
		TotalTests:          10,
		PassedTests:         10,
		FailedTests:         0,
		PreviousFailedTests: map[string]bool{"test_a": true, "test_b": true},
		CurrentFailedTests:  map[string]bool{},
	}

	result, err := Evaluate(json.RawMessage(`[{"type":"zero_failures"}]`), data)
	if err != nil {
		t.Fatalf("Evaluate() error: %v", err)
	}
	if !result.Passed {
		t.Error("zero_failures: expected PASS — 0 current failures, regardless of previous run history")
	}
}

// TestNoNewFailures_NoPriorRun shows that when PreviousFailedTests is nil (no prior run exists),
// all current failures are treated as new — the gate fails conservatively.
func TestNoNewFailures_NoPriorRun(t *testing.T) {
	t.Run("clean first run passes", func(t *testing.T) {
		data := &ReportData{
			TotalTests:          10,
			PassedTests:         10,
			FailedTests:         0,
			PreviousFailedTests: nil,
			CurrentFailedTests:  map[string]bool{},
		}
		result, err := Evaluate(json.RawMessage(`[{"type":"no_new_failures"}]`), data)
		if err != nil {
			t.Fatalf("Evaluate() error: %v", err)
		}
		if !result.Passed {
			t.Error("no_new_failures: expected PASS — no failures on first run")
		}
	})

	t.Run("failures on first run treated as new", func(t *testing.T) {
		data := &ReportData{
			TotalTests:          10,
			PassedTests:         9,
			FailedTests:         1,
			PreviousFailedTests: nil, // no prior run
			CurrentFailedTests:  map[string]bool{"test_a": true},
		}
		result, err := Evaluate(json.RawMessage(`[{"type":"no_new_failures"}]`), data)
		if err != nil {
			t.Fatalf("Evaluate() error: %v", err)
		}
		if result.Passed {
			t.Error("no_new_failures: expected FAIL — all failures are new when there is no prior run")
		}
		if result.Results[0].Actual != 1 {
			t.Errorf("no_new_failures: expected Actual=1 new failure, got %v", result.Results[0].Actual)
		}
	})
}

// TestNoNewFailures_PreviousFailuresFixed shows that fixing previously failing tests
// does not cause no_new_failures to fail — it only blocks newly introduced failures.
func TestNoNewFailures_PreviousFailuresFixed(t *testing.T) {
	data := &ReportData{
		PreviousFailedTests: map[string]bool{"test_a": true, "test_b": true},
		CurrentFailedTests:  map[string]bool{}, // both tests fixed
	}
	result, err := Evaluate(json.RawMessage(`[{"type":"no_new_failures"}]`), data)
	if err != nil {
		t.Fatalf("Evaluate() error: %v", err)
	}
	if !result.Passed {
		t.Error("no_new_failures: expected PASS — previously failing tests were fixed, no new regressions")
	}
}

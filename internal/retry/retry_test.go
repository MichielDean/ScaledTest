package retry

import (
	"testing"

	"github.com/scaledtest/scaledtest/internal/model"
)

func TestClampRetries(t *testing.T) {
	tests := []struct {
		input int
		want  int
	}{
		{-1, 0},
		{0, 0},
		{1, 1},
		{3, 3},
		{10, 10},
		{11, 10},
		{100, 10},
	}
	for _, tt := range tests {
		got := ClampRetries(tt.input)
		if got != tt.want {
			t.Errorf("ClampRetries(%d) = %d, want %d", tt.input, got, tt.want)
		}
	}
}

func TestClassifyResult(t *testing.T) {
	tests := []struct {
		name   string
		result model.TestResult
		want   bool
	}{
		{"no retry, passed", model.TestResult{Retry: 0, Status: "passed"}, false},
		{"no retry, failed", model.TestResult{Retry: 0, Status: "failed"}, false},
		{"retried, passed (flaky)", model.TestResult{Retry: 2, Status: "passed"}, true},
		{"retried, failed", model.TestResult{Retry: 2, Status: "failed"}, false},
		{"retried once, passed", model.TestResult{Retry: 1, Status: "passed"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ClassifyResult(&tt.result)
			if got != tt.want {
				t.Errorf("ClassifyResult() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestDetectFlakyTests(t *testing.T) {
	results := []model.TestResult{
		{Name: "TestStable", Status: "passed"},
		{Name: "TestStable", Status: "passed"},
		{Name: "TestStable", Status: "passed"},
		{Name: "TestFlaky", Status: "passed", Suite: "suite1", FilePath: "a.go"},
		{Name: "TestFlaky", Status: "failed", Suite: "suite1", FilePath: "a.go"},
		{Name: "TestFlaky", Status: "passed", Suite: "suite1", FilePath: "a.go"},
		{Name: "TestFlaky", Status: "failed", Suite: "suite1", FilePath: "a.go"},
		{Name: "TestSingle", Status: "failed"},
	}

	flaky := DetectFlakyTests(results, 2)
	if len(flaky) != 1 {
		t.Fatalf("expected 1 flaky test, got %d", len(flaky))
	}
	if flaky[0].Name != "TestFlaky" {
		t.Errorf("expected TestFlaky, got %s", flaky[0].Name)
	}
	if flaky[0].FlipCount != 3 {
		t.Errorf("flip count = %d, want 3", flaky[0].FlipCount)
	}
	if flaky[0].Suite != "suite1" {
		t.Errorf("suite = %q, want %q", flaky[0].Suite, "suite1")
	}
}

func TestDetectFlakyTestsMinFlipsFilter(t *testing.T) {
	results := []model.TestResult{
		{Name: "TestOneFlip", Status: "passed"},
		{Name: "TestOneFlip", Status: "failed"},
		{Name: "TestOneFlip", Status: "failed"},
	}

	// Requires 2 flips minimum — TestOneFlip only has 1
	flaky := DetectFlakyTests(results, 2)
	if len(flaky) != 0 {
		t.Errorf("expected 0 flaky tests with minFlips=2, got %d", len(flaky))
	}

	// With minFlips=1, it should be detected
	flaky = DetectFlakyTests(results, 1)
	if len(flaky) != 1 {
		t.Errorf("expected 1 flaky test with minFlips=1, got %d", len(flaky))
	}
}

func TestShouldQuarantine(t *testing.T) {
	tests := []struct {
		name      string
		flipCount int
		totalRuns int
		flipRate  float64
		want      bool
	}{
		{"too few runs", 3, 4, 0.5, false},
		{"low flip rate", 1, 10, 0.1, false},
		{"high flakiness", 4, 8, 0.57, true},
		{"borderline flip count", 2, 6, 0.4, false},
		{"exactly threshold", 3, 5, 0.31, true},
		{"below flip rate", 3, 10, 0.2, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ShouldQuarantine(tt.flipCount, tt.totalRuns, tt.flipRate)
			if got != tt.want {
				t.Errorf("ShouldQuarantine(%d, %d, %.2f) = %v, want %v",
					tt.flipCount, tt.totalRuns, tt.flipRate, got, tt.want)
			}
		})
	}
}

func TestFilterQuarantined(t *testing.T) {
	quarantined := map[string]bool{
		"TestFlaky1": true,
		"TestFlaky2": true,
	}
	names := []string{"TestStable", "TestFlaky1", "TestNew", "TestFlaky2"}
	skipped := FilterQuarantined(names, quarantined)
	if len(skipped) != 2 {
		t.Fatalf("expected 2 skipped, got %d", len(skipped))
	}
	if skipped[0] != "TestFlaky1" || skipped[1] != "TestFlaky2" {
		t.Errorf("skipped = %v, want [TestFlaky1, TestFlaky2]", skipped)
	}
}

func TestFilterQuarantinedEmpty(t *testing.T) {
	skipped := FilterQuarantined([]string{"TestA", "TestB"}, map[string]bool{})
	if len(skipped) != 0 {
		t.Errorf("expected 0 skipped with empty quarantine, got %d", len(skipped))
	}
}

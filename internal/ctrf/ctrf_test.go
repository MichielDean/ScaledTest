package ctrf

import (
	"encoding/json"
	"testing"
)

var sampleReport = `{
  "results": {
    "tool": {"name": "jest", "version": "29.7.0"},
    "summary": {
      "tests": 3,
      "passed": 2,
      "failed": 1,
      "skipped": 0,
      "pending": 0,
      "other": 0,
      "start": 1700000000000,
      "stop": 1700000005000
    },
    "tests": [
      {"name": "should render dashboard", "status": "passed", "duration": 150, "suite": "Dashboard", "filePath": "src/dashboard.test.ts"},
      {"name": "should handle errors", "status": "passed", "duration": 80, "suite": "Dashboard"},
      {"name": "should load data", "status": "failed", "duration": 2000, "message": "timeout", "trace": "Error: timeout\n  at ...", "suite": "API"}
    ],
    "environment": {"testEnvironment": "ci"}
  }
}`

func TestParse(t *testing.T) {
	report, err := Parse([]byte(sampleReport))
	if err != nil {
		t.Fatalf("Parse() error: %v", err)
	}

	if report.Results.Tool.Name != "jest" {
		t.Errorf("Tool.Name = %q, want %q", report.Results.Tool.Name, "jest")
	}
	if report.Results.Summary.Tests != 3 {
		t.Errorf("Summary.Tests = %d, want 3", report.Results.Summary.Tests)
	}
	if len(report.Results.Tests) != 3 {
		t.Errorf("len(Tests) = %d, want 3", len(report.Results.Tests))
	}
}

func TestParseInvalidJSON(t *testing.T) {
	_, err := Parse([]byte(`{invalid`))
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestValidate(t *testing.T) {
	report, _ := Parse([]byte(sampleReport))
	if err := Validate(report); err != nil {
		t.Errorf("Validate() error: %v", err)
	}
}

func TestValidateMissingToolName(t *testing.T) {
	data := `{"results":{"tool":{"name":""},"summary":{"tests":1},"tests":[{"name":"t","status":"passed"}]}}`
	report, _ := Parse([]byte(data))
	err := Validate(report)
	if err == nil {
		t.Error("expected error for missing tool name")
	}
}

func TestValidateInvalidStatus(t *testing.T) {
	data := `{"results":{"tool":{"name":"jest"},"summary":{"tests":1},"tests":[{"name":"t","status":"INVALID"}]}}`
	report, _ := Parse([]byte(data))
	err := Validate(report)
	if err == nil {
		t.Error("expected error for invalid status")
	}
}

func TestValidateNoTests(t *testing.T) {
	data := `{"results":{"tool":{"name":"jest"},"summary":{"tests":0},"tests":[]}}`
	report, _ := Parse([]byte(data))
	err := Validate(report)
	if err == nil {
		t.Error("expected error for empty tests")
	}
}

func TestNormalize(t *testing.T) {
	report, _ := Parse([]byte(sampleReport))
	results := Normalize(report, "report-1", "team-1")

	if len(results) != 3 {
		t.Fatalf("len(results) = %d, want 3", len(results))
	}

	r0 := results[0]
	if r0.Name != "should render dashboard" {
		t.Errorf("results[0].Name = %q", r0.Name)
	}
	if r0.Status != "passed" {
		t.Errorf("results[0].Status = %q", r0.Status)
	}
	if r0.DurationMs != 150 {
		t.Errorf("results[0].DurationMs = %d, want 150", r0.DurationMs)
	}
	if r0.ReportID != "report-1" {
		t.Errorf("results[0].ReportID = %q", r0.ReportID)
	}
	if r0.TeamID != "team-1" {
		t.Errorf("results[0].TeamID = %q", r0.TeamID)
	}

	r2 := results[2]
	if r2.Status != "failed" {
		t.Errorf("results[2].Status = %q", r2.Status)
	}
	if r2.Message != "timeout" {
		t.Errorf("results[2].Message = %q", r2.Message)
	}
}

func TestSummaryJSON(t *testing.T) {
	s := Summary{Tests: 5, Passed: 4, Failed: 1}
	data, err := SummaryJSON(s)
	if err != nil {
		t.Fatalf("SummaryJSON() error: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal summary: %v", err)
	}
	if parsed["tests"].(float64) != 5 {
		t.Errorf("tests = %v, want 5", parsed["tests"])
	}
}

func TestNormalizeWithTags(t *testing.T) {
	data := `{"results":{"tool":{"name":"jest"},"summary":{"tests":1},"tests":[
		{"name":"tagged test","status":"passed","duration":10,"tags":["smoke","regression"],"flaky":true,"retry":2}
	]}}`
	report, _ := Parse([]byte(data))
	results := Normalize(report, "r1", "t1")

	if len(results[0].Tags) != 2 {
		t.Errorf("Tags count = %d, want 2", len(results[0].Tags))
	}
	if !results[0].Flaky {
		t.Error("expected Flaky = true")
	}
	if results[0].Retry != 2 {
		t.Errorf("Retry = %d, want 2", results[0].Retry)
	}
}

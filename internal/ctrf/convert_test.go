package ctrf

import (
	"testing"
)

func TestDetectFormat(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		expect InputFormat
	}{
		{"ctrf json", `{"results":{"tool":{"name":"jest"},"tests":[]}}`, FormatCTRF},
		{"jest json", `{"testResults":[],"numTotalTests":5}`, FormatJestJSON},
		{"junit xml", `<?xml version="1.0"?><testsuites><testsuite name="s"></testsuite></testsuites>`, FormatJUnit},
		{"junit single suite", `<testsuite name="s"><testcase name="t"/></testsuite>`, FormatJUnit},
		{"xunit xml", `<assemblies><assembly name="a"><collection name="c"></collection></assembly></assemblies>`, FormatXUnit},
		{"tap", "TAP version 13\n1..2\nok 1 - test one\nnot ok 2 - test two", FormatTAP},
		{"tap plan first", "1..3\nok 1 - first\nok 2 - second\nok 3 - third", FormatTAP},
		{"unknown", `hello world`, FormatUnknown},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DetectFormat([]byte(tt.input))
			if got != tt.expect {
				t.Errorf("DetectFormat() = %q, want %q", got, tt.expect)
			}
		})
	}
}

func TestConvertJUnit(t *testing.T) {
	input := `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="3" failures="1" errors="0" skipped="1" time="1.234">
  <testsuite name="MyTests" tests="3" failures="1" errors="0" skipped="1" time="1.234">
    <testcase name="test_add" classname="math_test.go" time="0.5"/>
    <testcase name="test_subtract" classname="math_test.go" time="0.3">
      <failure message="expected 5 got 3" type="AssertionError">stack trace here</failure>
    </testcase>
    <testcase name="test_pending" classname="math_test.go" time="0.0">
      <skipped message="not implemented yet"/>
    </testcase>
  </testsuite>
</testsuites>`

	result, err := ConvertToCTRF([]byte(input))
	if err != nil {
		t.Fatalf("ConvertToCTRF() error: %v", err)
	}
	if result.SourceFormat != FormatJUnit {
		t.Errorf("SourceFormat = %q, want junit", result.SourceFormat)
	}
	if len(result.Report.Results.Tests) != 3 {
		t.Fatalf("got %d tests, want 3", len(result.Report.Results.Tests))
	}

	// Check statuses
	if result.Report.Results.Tests[0].Status != "passed" {
		t.Errorf("test[0].Status = %q, want passed", result.Report.Results.Tests[0].Status)
	}
	if result.Report.Results.Tests[1].Status != "failed" {
		t.Errorf("test[1].Status = %q, want failed", result.Report.Results.Tests[1].Status)
	}
	if result.Report.Results.Tests[2].Status != "skipped" {
		t.Errorf("test[2].Status = %q, want skipped", result.Report.Results.Tests[2].Status)
	}

	// Check failure details
	if result.Report.Results.Tests[1].Message != "expected 5 got 3" {
		t.Errorf("test[1].Message = %q", result.Report.Results.Tests[1].Message)
	}
	if result.Report.Results.Tests[1].Trace != "stack trace here" {
		t.Errorf("test[1].Trace = %q", result.Report.Results.Tests[1].Trace)
	}

	// Summary
	if result.Report.Results.Summary.Passed != 1 {
		t.Errorf("Summary.Passed = %d, want 1", result.Report.Results.Summary.Passed)
	}
	if result.Report.Results.Summary.Failed != 1 {
		t.Errorf("Summary.Failed = %d, want 1", result.Report.Results.Summary.Failed)
	}

	// Duration converted from seconds to ms
	if result.Report.Results.Tests[0].Duration != 500 {
		t.Errorf("test[0].Duration = %v, want 500", result.Report.Results.Tests[0].Duration)
	}
}

func TestConvertJUnitSingleSuite(t *testing.T) {
	input := `<testsuite name="Suite" tests="1">
  <testcase name="test_ok" classname="pkg" time="0.1"/>
</testsuite>`

	result, err := ConvertToCTRF([]byte(input))
	if err != nil {
		t.Fatalf("ConvertToCTRF() error: %v", err)
	}
	if result.SourceFormat != FormatJUnit {
		t.Errorf("SourceFormat = %q, want junit", result.SourceFormat)
	}
	if len(result.Report.Results.Tests) != 1 {
		t.Fatalf("got %d tests, want 1", len(result.Report.Results.Tests))
	}
}

func TestConvertJUnitErrors(t *testing.T) {
	input := `<?xml version="1.0"?>
<testsuites>
  <testsuite name="S">
    <testcase name="test_crash" classname="pkg" time="0.1">
      <error message="segfault" type="RuntimeError">crash trace</error>
    </testcase>
  </testsuite>
</testsuites>`

	result, err := ConvertToCTRF([]byte(input))
	if err != nil {
		t.Fatalf("ConvertToCTRF() error: %v", err)
	}
	if result.Report.Results.Tests[0].Status != "failed" {
		t.Errorf("test[0].Status = %q, want failed", result.Report.Results.Tests[0].Status)
	}
	// Should have a warning about error -> failed conversion
	hasWarning := false
	for _, w := range result.Warnings {
		if len(w) > 0 {
			hasWarning = true
		}
	}
	if !hasWarning {
		t.Error("expected conversion warnings")
	}
}

func TestConvertJestJSON(t *testing.T) {
	input := `{
  "numTotalTests": 3,
  "numPassedTests": 2,
  "numFailedTests": 1,
  "numPendingTests": 0,
  "startTime": 1700000000000,
  "testResults": [
    {
      "testFilePath": "/app/src/math.test.js",
      "assertionResults": [
        {
          "fullName": "Math > should add",
          "title": "should add",
          "ancestorTitles": ["Math"],
          "status": "passed",
          "duration": 5
        },
        {
          "fullName": "Math > should subtract",
          "title": "should subtract",
          "ancestorTitles": ["Math"],
          "status": "passed",
          "duration": 3
        },
        {
          "fullName": "Math > should divide",
          "title": "should divide",
          "ancestorTitles": ["Math"],
          "status": "failed",
          "duration": 10,
          "failureMessages": ["Expected 5 but received NaN"]
        }
      ]
    }
  ]
}`

	result, err := ConvertToCTRF([]byte(input))
	if err != nil {
		t.Fatalf("ConvertToCTRF() error: %v", err)
	}
	if result.SourceFormat != FormatJestJSON {
		t.Errorf("SourceFormat = %q, want jest-json", result.SourceFormat)
	}
	if len(result.Report.Results.Tests) != 3 {
		t.Fatalf("got %d tests, want 3", len(result.Report.Results.Tests))
	}
	if result.Report.Results.Summary.Passed != 2 {
		t.Errorf("Summary.Passed = %d, want 2", result.Report.Results.Summary.Passed)
	}
	if result.Report.Results.Tests[2].Message != "Expected 5 but received NaN" {
		t.Errorf("test[2].Message = %q", result.Report.Results.Tests[2].Message)
	}
	if result.Report.Results.Tests[0].Suite != "Math" {
		t.Errorf("test[0].Suite = %q, want Math", result.Report.Results.Tests[0].Suite)
	}
}

func TestConvertTAP(t *testing.T) {
	input := `TAP version 13
1..4
ok 1 - addition works
not ok 2 - subtraction fails
ok 3 - multiplication # SKIP not implemented
ok 4 - division # TODO needs work`

	result, err := ConvertToCTRF([]byte(input))
	if err != nil {
		t.Fatalf("ConvertToCTRF() error: %v", err)
	}
	if result.SourceFormat != FormatTAP {
		t.Errorf("SourceFormat = %q, want tap", result.SourceFormat)
	}
	if len(result.Report.Results.Tests) != 4 {
		t.Fatalf("got %d tests, want 4", len(result.Report.Results.Tests))
	}
	if result.Report.Results.Tests[0].Status != "passed" {
		t.Errorf("test[0].Status = %q, want passed", result.Report.Results.Tests[0].Status)
	}
	if result.Report.Results.Tests[1].Status != "failed" {
		t.Errorf("test[1].Status = %q, want failed", result.Report.Results.Tests[1].Status)
	}
	if result.Report.Results.Tests[2].Status != "skipped" {
		t.Errorf("test[2].Status = %q, want skipped", result.Report.Results.Tests[2].Status)
	}
	if result.Report.Results.Tests[3].Status != "pending" {
		t.Errorf("test[3].Status = %q, want pending", result.Report.Results.Tests[3].Status)
	}
}

func TestConvertXUnit(t *testing.T) {
	input := `<?xml version="1.0"?>
<assemblies>
  <assembly name="MyAssembly" total="2" passed="1" failed="1" skipped="0" time="0.5">
    <collection name="TestCollection" total="2" passed="1" failed="1" skipped="0" time="0.5">
      <test name="Test.One" type="TestClass" method="One" time="0.2" result="Pass"/>
      <test name="Test.Two" type="TestClass" method="Two" time="0.3" result="Fail">
        <failure exception-type="AssertionException">
          <message>Expected true</message>
          <stack-trace>at Test.Two() in file.cs:42</stack-trace>
        </failure>
      </test>
    </collection>
  </assembly>
</assemblies>`

	result, err := ConvertToCTRF([]byte(input))
	if err != nil {
		t.Fatalf("ConvertToCTRF() error: %v", err)
	}
	if result.SourceFormat != FormatXUnit {
		t.Errorf("SourceFormat = %q, want xunit", result.SourceFormat)
	}
	if len(result.Report.Results.Tests) != 2 {
		t.Fatalf("got %d tests, want 2", len(result.Report.Results.Tests))
	}
	if result.Report.Results.Tests[0].Status != "passed" {
		t.Errorf("test[0].Status = %q, want passed", result.Report.Results.Tests[0].Status)
	}
	if result.Report.Results.Tests[1].Status != "failed" {
		t.Errorf("test[1].Status = %q, want failed", result.Report.Results.Tests[1].Status)
	}
	if result.Report.Results.Tests[1].Message != "Expected true" {
		t.Errorf("test[1].Message = %q", result.Report.Results.Tests[1].Message)
	}
}

func TestConvertCTRFPassthrough(t *testing.T) {
	input := `{"results":{"tool":{"name":"jest"},"summary":{"tests":1,"passed":1},"tests":[{"name":"t","status":"passed","duration":10}]}}`

	result, err := ConvertToCTRF([]byte(input))
	if err != nil {
		t.Fatalf("ConvertToCTRF() error: %v", err)
	}
	if result.SourceFormat != FormatCTRF {
		t.Errorf("SourceFormat = %q, want ctrf", result.SourceFormat)
	}
	if result.Report.Results.Tool.Name != "jest" {
		t.Errorf("Tool.Name = %q", result.Report.Results.Tool.Name)
	}
}

func TestConvertUnknownFormat(t *testing.T) {
	_, err := ConvertToCTRF([]byte(`not a valid format at all`))
	if err == nil {
		t.Error("expected error for unknown format")
	}
}

func TestConvertEmptyTAP(t *testing.T) {
	_, err := ConvertToCTRF([]byte("TAP version 13\n1..0\n"))
	if err == nil {
		t.Error("expected error for empty TAP")
	}
}

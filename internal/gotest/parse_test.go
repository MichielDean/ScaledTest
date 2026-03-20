package gotest_test

import (
	"strings"
	"testing"

	"github.com/scaledtest/scaledtest/internal/gotest"
)

const allPassOutput = `
{"Time":"2026-03-20T10:00:00Z","Action":"start","Package":"github.com/scaledtest/scaledtest/internal/foo"}
{"Time":"2026-03-20T10:00:00Z","Action":"run","Package":"github.com/scaledtest/scaledtest/internal/foo","Test":"TestA"}
{"Time":"2026-03-20T10:00:01Z","Action":"pass","Package":"github.com/scaledtest/scaledtest/internal/foo","Test":"TestA","Elapsed":0.1}
{"Time":"2026-03-20T10:00:01Z","Action":"run","Package":"github.com/scaledtest/scaledtest/internal/foo","Test":"TestB"}
{"Time":"2026-03-20T10:00:02Z","Action":"pass","Package":"github.com/scaledtest/scaledtest/internal/foo","Test":"TestB","Elapsed":0.2}
{"Time":"2026-03-20T10:00:02Z","Action":"pass","Package":"github.com/scaledtest/scaledtest/internal/foo","Elapsed":0.3}
`

func TestParseEvents_AllPass(t *testing.T) {
	s, err := gotest.ParseEvents(strings.NewReader(allPassOutput))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Passed != 2 {
		t.Errorf("expected 2 passed, got %d", s.Passed)
	}
	if s.Failed != 0 {
		t.Errorf("expected 0 failed, got %d", s.Failed)
	}
	if s.Skipped != 0 {
		t.Errorf("expected 0 skipped, got %d", s.Skipped)
	}
	if s.Total() != 2 {
		t.Errorf("expected total=2, got %d", s.Total())
	}
}

const mixedOutput = `
{"Action":"run","Package":"pkg","Test":"TestPass"}
{"Action":"pass","Package":"pkg","Test":"TestPass","Elapsed":0.1}
{"Action":"run","Package":"pkg","Test":"TestFail"}
{"Action":"fail","Package":"pkg","Test":"TestFail","Elapsed":0.2}
{"Action":"run","Package":"pkg","Test":"TestSkip"}
{"Action":"skip","Package":"pkg","Test":"TestSkip","Elapsed":0.0}
{"Action":"fail","Package":"pkg","Elapsed":0.3}
`

func TestParseEvents_MixedResults(t *testing.T) {
	s, err := gotest.ParseEvents(strings.NewReader(mixedOutput))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Passed != 1 {
		t.Errorf("expected 1 passed, got %d", s.Passed)
	}
	if s.Failed != 1 {
		t.Errorf("expected 1 failed, got %d", s.Failed)
	}
	if s.Skipped != 1 {
		t.Errorf("expected 1 skipped, got %d", s.Skipped)
	}
	if s.Total() != 3 {
		t.Errorf("expected total=3, got %d", s.Total())
	}
}

func TestParseEvents_EmptyInput(t *testing.T) {
	s, err := gotest.ParseEvents(strings.NewReader(""))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Total() != 0 {
		t.Errorf("expected total=0 for empty input, got %d", s.Total())
	}
}

func TestParseEvents_SkipsNonJSONLines(t *testing.T) {
	input := "this is not JSON\nbuild failed\n{\"Action\":\"pass\",\"Test\":\"TestX\"}\n"
	s, err := gotest.ParseEvents(strings.NewReader(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Passed != 1 {
		t.Errorf("expected 1 passed, got %d", s.Passed)
	}
}

// Package-level pass/fail events (no "Test" field) must not be counted.
func TestParseEvents_IgnoresPackageLevelEvents(t *testing.T) {
	input := `
{"Action":"pass","Package":"pkg/a","Elapsed":1.0}
{"Action":"fail","Package":"pkg/b","Elapsed":2.0}
`
	s, err := gotest.ParseEvents(strings.NewReader(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Total() != 0 {
		t.Errorf("package-level events should not be counted, got total=%d", s.Total())
	}
}

// Subtests should be counted individually.
func TestParseEvents_Subtests(t *testing.T) {
	input := `
{"Action":"run","Package":"pkg","Test":"TestParent"}
{"Action":"run","Package":"pkg","Test":"TestParent/sub1"}
{"Action":"pass","Package":"pkg","Test":"TestParent/sub1","Elapsed":0.1}
{"Action":"run","Package":"pkg","Test":"TestParent/sub2"}
{"Action":"fail","Package":"pkg","Test":"TestParent/sub2","Elapsed":0.1}
{"Action":"fail","Package":"pkg","Test":"TestParent","Elapsed":0.2}
{"Action":"fail","Package":"pkg","Elapsed":0.3}
`
	s, err := gotest.ParseEvents(strings.NewReader(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Passed != 1 {
		t.Errorf("expected 1 passed (sub1), got %d", s.Passed)
	}
	if s.Failed != 2 {
		t.Errorf("expected 2 failed (sub2 + TestParent), got %d", s.Failed)
	}
}

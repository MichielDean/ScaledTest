// Package gotest provides utilities for working with `go test` output.
package gotest

import (
	"bufio"
	"encoding/json"
	"io"
)

// testEvent represents a single event from `go test -json` output.
type testEvent struct {
	Action string `json:"Action"`
	Test   string `json:"Test"`
}

// Summary holds aggregated counts from `go test -json` output.
type Summary struct {
	Passed  int
	Failed  int
	Skipped int
}

// Total returns the total number of individual tests observed.
func (s Summary) Total() int {
	return s.Passed + s.Failed + s.Skipped
}

// ParseEvents reads `go test -json` output and returns a Summary of
// individual test results. Package-level events (no "Test" field) are ignored.
// Lines that are not valid JSON are silently skipped.
func ParseEvents(r io.Reader) (Summary, error) {
	var s Summary
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		var ev testEvent
		if err := json.Unmarshal(scanner.Bytes(), &ev); err != nil {
			continue // skip non-JSON lines (e.g. build output)
		}
		// Only count individual test events, not package-level summaries.
		if ev.Test == "" {
			continue
		}
		switch ev.Action {
		case "pass":
			s.Passed++
		case "fail":
			s.Failed++
		case "skip":
			s.Skipped++
		}
	}
	return s, scanner.Err()
}

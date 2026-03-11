package quality

import (
	"encoding/json"
	"fmt"

	"github.com/scaledtest/scaledtest/internal/analytics"
)

// RuleType identifies the type of quality gate rule.
type RuleType string

const (
	RulePassRate      RuleType = "pass_rate"
	RuleZeroFailures  RuleType = "zero_failures"
	RuleNoNewFailures RuleType = "no_new_failures"
	RuleMaxDuration   RuleType = "max_duration"
	RuleMaxFlakyCount RuleType = "max_flaky_count"
	RuleMinTestCount  RuleType = "min_test_count"
)

// Rule is a single quality gate rule definition.
type Rule struct {
	Type      RuleType        `json:"type"`
	Params    json.RawMessage `json:"params"`
}

// RuleResult is the evaluation result for a single rule.
type RuleResult struct {
	Type      RuleType    `json:"type"`
	Passed    bool        `json:"passed"`
	Threshold interface{} `json:"threshold"`
	Actual    interface{} `json:"actual"`
	Message   string      `json:"message"`
}

// EvaluationResult is the overall result of evaluating a quality gate.
type EvaluationResult struct {
	Passed  bool         `json:"passed"`
	Results []RuleResult `json:"results"`
}

// ReportData holds the data needed to evaluate quality gate rules.
type ReportData struct {
	TotalTests   int
	PassedTests  int
	FailedTests  int
	SkippedTests int
	TotalDurationMs int64
	FlakyTests   []analytics.FlakyTest
	// PreviousFailedTests is the set of test names that failed in the prior run.
	// Used by no_new_failures rule.
	PreviousFailedTests map[string]bool
	// CurrentFailedTests is the set of test names that failed in this run.
	CurrentFailedTests map[string]bool
}

// Evaluate runs all rules against the provided report data and returns the result.
func Evaluate(rulesJSON json.RawMessage, data *ReportData) (*EvaluationResult, error) {
	var rules []Rule
	if err := json.Unmarshal(rulesJSON, &rules); err != nil {
		return nil, fmt.Errorf("parse rules: %w", err)
	}

	result := &EvaluationResult{
		Passed:  true,
		Results: make([]RuleResult, 0, len(rules)),
	}

	for _, rule := range rules {
		rr, err := evaluateRule(rule, data)
		if err != nil {
			return nil, fmt.Errorf("evaluate rule %s: %w", rule.Type, err)
		}
		result.Results = append(result.Results, *rr)
		if !rr.Passed {
			result.Passed = false
		}
	}

	return result, nil
}

func evaluateRule(rule Rule, data *ReportData) (*RuleResult, error) {
	switch rule.Type {
	case RulePassRate:
		return evalPassRate(rule.Params, data)
	case RuleZeroFailures:
		return evalZeroFailures(data)
	case RuleNoNewFailures:
		return evalNoNewFailures(data)
	case RuleMaxDuration:
		return evalMaxDuration(rule.Params, data)
	case RuleMaxFlakyCount:
		return evalMaxFlakyCount(rule.Params, data)
	case RuleMinTestCount:
		return evalMinTestCount(rule.Params, data)
	default:
		return nil, fmt.Errorf("unknown rule type: %s", rule.Type)
	}
}

type passRateParams struct {
	Threshold float64 `json:"threshold"` // e.g., 95.0
}

func evalPassRate(params json.RawMessage, data *ReportData) (*RuleResult, error) {
	var p passRateParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	actual := analytics.ComputePassRate(data.PassedTests, data.TotalTests)
	passed := actual >= p.Threshold

	return &RuleResult{
		Type:      RulePassRate,
		Passed:    passed,
		Threshold: p.Threshold,
		Actual:    actual,
		Message:   fmt.Sprintf("pass rate %.1f%% %s threshold %.1f%%", actual, passOrFail(passed), p.Threshold),
	}, nil
}

func evalZeroFailures(data *ReportData) (*RuleResult, error) {
	passed := data.FailedTests == 0

	return &RuleResult{
		Type:      RuleZeroFailures,
		Passed:    passed,
		Threshold: 0,
		Actual:    data.FailedTests,
		Message:   fmt.Sprintf("%d failures (require 0)", data.FailedTests),
	}, nil
}

func evalNoNewFailures(data *ReportData) (*RuleResult, error) {
	newFailures := 0
	for name := range data.CurrentFailedTests {
		if data.PreviousFailedTests == nil || !data.PreviousFailedTests[name] {
			newFailures++
		}
	}

	passed := newFailures == 0

	return &RuleResult{
		Type:      RuleNoNewFailures,
		Passed:    passed,
		Threshold: 0,
		Actual:    newFailures,
		Message:   fmt.Sprintf("%d new failures vs previous run", newFailures),
	}, nil
}

type maxDurationParams struct {
	ThresholdMs int64 `json:"threshold_ms"`
}

func evalMaxDuration(params json.RawMessage, data *ReportData) (*RuleResult, error) {
	var p maxDurationParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	passed := data.TotalDurationMs <= p.ThresholdMs

	return &RuleResult{
		Type:      RuleMaxDuration,
		Passed:    passed,
		Threshold: p.ThresholdMs,
		Actual:    data.TotalDurationMs,
		Message:   fmt.Sprintf("duration %dms %s threshold %dms", data.TotalDurationMs, passOrFail(passed), p.ThresholdMs),
	}, nil
}

type maxFlakyCountParams struct {
	Threshold int `json:"threshold"`
}

func evalMaxFlakyCount(params json.RawMessage, data *ReportData) (*RuleResult, error) {
	var p maxFlakyCountParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	actual := len(data.FlakyTests)
	passed := actual <= p.Threshold

	return &RuleResult{
		Type:      RuleMaxFlakyCount,
		Passed:    passed,
		Threshold: p.Threshold,
		Actual:    actual,
		Message:   fmt.Sprintf("%d flaky tests %s threshold %d", actual, passOrFail(passed), p.Threshold),
	}, nil
}

type minTestCountParams struct {
	Threshold int `json:"threshold"`
}

func evalMinTestCount(params json.RawMessage, data *ReportData) (*RuleResult, error) {
	var p minTestCountParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	passed := data.TotalTests >= p.Threshold

	return &RuleResult{
		Type:      RuleMinTestCount,
		Passed:    passed,
		Threshold: p.Threshold,
		Actual:    data.TotalTests,
		Message:   fmt.Sprintf("%d tests %s minimum %d", data.TotalTests, passOrFail(passed), p.Threshold),
	}, nil
}

func passOrFail(passed bool) string {
	if passed {
		return ">="
	}
	return "<"
}

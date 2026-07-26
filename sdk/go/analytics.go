package scaledtest

import (
	"context"
	"net/url"
)

// AnalyticsService exposes the /api/v1/analytics endpoints.
type AnalyticsService struct {
	client *Client
}

// TrendsParams filters the trends query.
type TrendsParams struct {
	Start   string // RFC3339
	End     string // RFC3339
	GroupBy string // "day", "week", "month"
}

// GetTrends returns pass/fail trends over time.
func (s *AnalyticsService) GetTrends(ctx context.Context, p *TrendsParams) (*TrendsResponse, error) {
	var q url.Values
	if p != nil {
		q = addQuery(q, "start", p.Start)
		q = addQuery(q, "end", p.End)
		q = addQuery(q, "group_by", p.GroupBy)
	}
	var out TrendsResponse
	if err := s.client.doAPI(ctx, "GET", "/analytics/trends", q, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// FlakyTestsParams filters the flaky-tests query.
type FlakyTestsParams struct {
	WindowDays int
	MinRuns    int
	Limit      int
}

// GetFlakyTests returns tests detected as flaky.
func (s *AnalyticsService) GetFlakyTests(ctx context.Context, p *FlakyTestsParams) (*FlakyTestsResponse, error) {
	var q url.Values
	if p != nil {
		q = addInt(q, "window_days", p.WindowDays)
		q = addInt(q, "min_runs", p.MinRuns)
		q = addInt(q, "limit", p.Limit)
	}
	var out FlakyTestsResponse
	if err := s.client.doAPI(ctx, "GET", "/analytics/flaky-tests", q, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ErrorAnalysisParams filters the error-analysis query.
type ErrorAnalysisParams struct {
	Start string // RFC3339
	End   string // RFC3339
	Limit int
}

// GetErrorAnalysis returns clusters of similar error messages.
func (s *AnalyticsService) GetErrorAnalysis(ctx context.Context, p *ErrorAnalysisParams) (*ErrorAnalysisResponse, error) {
	var q url.Values
	if p != nil {
		q = addQuery(q, "start", p.Start)
		q = addQuery(q, "end", p.End)
		q = addInt(q, "limit", p.Limit)
	}
	var out ErrorAnalysisResponse
	if err := s.client.doAPI(ctx, "GET", "/analytics/error-analysis", q, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// DurationDistributionParams filters the duration-distribution query.
type DurationDistributionParams struct {
	Start string // RFC3339
	End   string // RFC3339
}

// GetDurationDistribution returns a histogram of test durations.
func (s *AnalyticsService) GetDurationDistribution(ctx context.Context, p *DurationDistributionParams) (*DurationDistributionResponse, error) {
	var q url.Values
	if p != nil {
		q = addQuery(q, "start", p.Start)
		q = addQuery(q, "end", p.End)
	}
	var out DurationDistributionResponse
	if err := s.client.doAPI(ctx, "GET", "/analytics/duration-distribution", q, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

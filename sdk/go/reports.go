package scaledtest

import (
	"context"
	"net/url"
)

// ReportsService exposes the /api/v1/reports endpoints.
type ReportsService struct {
	client *Client
}

// ListReportsParams filters the Reports.List result set.
type ListReportsParams struct {
	Limit  int
	Offset int
	Since  string // RFC3339
	Until  string // RFC3339
}

// UploadReportParams controls optional upload behaviour.
type UploadReportParams struct {
	ExecutionID        string
	TriageGitHubStatus bool
}

// List retrieves a paginated list of reports for the caller's team.
func (s *ReportsService) List(ctx context.Context, p *ListReportsParams) (*ListReportsResponse, error) {
	var q url.Values
	if p != nil {
		q = addInt(q, "limit", p.Limit)
		q = addInt(q, "offset", p.Offset)
		q = addQuery(q, "since", p.Since)
		q = addQuery(q, "until", p.Until)
	}
	var out ListReportsResponse
	if err := s.client.doAPI(ctx, "GET", "/reports", q, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Upload submits a CTRF report for ingestion.
func (s *ReportsService) Upload(ctx context.Context, report *CtrfReport, p *UploadReportParams) (*UploadReportResponse, error) {
	var q url.Values
	if p != nil {
		q = addQuery(q, "execution_id", p.ExecutionID)
		q = addBool(q, "triage_github_status", p.TriageGitHubStatus)
	}
	var out UploadReportResponse
	if err := s.client.doAPI(ctx, "POST", "/reports", q, report, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Get retrieves a single report by ID.
func (s *ReportsService) Get(ctx context.Context, id string) (*Report, error) {
	if id == "" {
		return nil, errMissingID("report")
	}
	var out Report
	if err := s.client.doAPI(ctx, "GET", "/reports/"+pathEscape(id), nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Delete removes a report by ID.
func (s *ReportsService) Delete(ctx context.Context, id string) (*DeleteReportResponse, error) {
	if id == "" {
		return nil, errMissingID("report")
	}
	var out DeleteReportResponse
	if err := s.client.doAPI(ctx, "DELETE", "/reports/"+pathEscape(id), nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Compare diffs two reports by ID.
func (s *ReportsService) Compare(ctx context.Context, baseID, headID string) (*ReportCompareResult, error) {
	if baseID == "" || headID == "" {
		return nil, errMissingID("report")
	}
	q := url.Values{}
	q.Set("base", baseID)
	q.Set("head", headID)
	var out ReportCompareResult
	if err := s.client.doAPI(ctx, "GET", "/reports/compare", q, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetTriage retrieves the persisted triage result for a report.
func (s *ReportsService) GetTriage(ctx context.Context, reportID string) (*ReportTriageResult, error) {
	if reportID == "" {
		return nil, errMissingID("report")
	}
	var out ReportTriageResult
	if err := s.client.doAPI(ctx, "GET", "/reports/"+pathEscape(reportID)+"/triage", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// RetryTriage re-triggers LLM triage for a report.
func (s *ReportsService) RetryTriage(ctx context.Context, reportID string) (*RetryTriageResponse, error) {
	if reportID == "" {
		return nil, errMissingID("report")
	}
	var out RetryTriageResponse
	if err := s.client.doAPI(ctx, "POST", "/reports/"+pathEscape(reportID)+"/triage/retry", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

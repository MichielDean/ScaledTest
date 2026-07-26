package scaledtest

import (
	"context"
	"errors"
)

// QualityGatesService exposes the /api/v1/teams/{teamID}/quality-gates endpoints.
type QualityGatesService struct {
	client *Client
}

// List retrieves all quality gates for a team.
func (s *QualityGatesService) List(ctx context.Context, teamID string) (*ListQualityGatesResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	var out ListQualityGatesResponse
	if err := s.client.doAPI(ctx, "GET", "/teams/"+pathEscape(teamID)+"/quality-gates", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// CreateQualityGateParams is the body for Create.
type CreateQualityGateParams struct {
	Name        string
	Description string
	Rules       []QualityGateRule
}

// Create creates a new quality gate for a team.
func (s *QualityGatesService) Create(ctx context.Context, teamID string, params *CreateQualityGateParams) (*QualityGate, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if params == nil || params.Name == "" {
		return nil, errors.New("scaledtest: quality gate name is required")
	}
	if len(params.Rules) == 0 {
		return nil, errors.New("scaledtest: quality gate rules must not be empty")
	}
	body := map[string]interface{}{"name": params.Name, "rules": params.Rules}
	if params.Description != "" {
		body["description"] = params.Description
	}
	var out QualityGate
	if err := s.client.doAPI(ctx, "POST", "/teams/"+pathEscape(teamID)+"/quality-gates", nil, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Get retrieves a single quality gate by ID.
func (s *QualityGatesService) Get(ctx context.Context, teamID, id string) (*QualityGate, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if id == "" {
		return nil, errMissingID("quality gate")
	}
	var out QualityGate
	if err := s.client.doAPI(ctx, "GET", "/teams/"+pathEscape(teamID)+"/quality-gates/"+pathEscape(id), nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// UpdateQualityGateParams is the body for Update.
type UpdateQualityGateParams struct {
	Name        string
	Description string
	Rules       []QualityGateRule
	Enabled     *bool
}

// Update modifies a quality gate.
func (s *QualityGatesService) Update(ctx context.Context, teamID, id string, params *UpdateQualityGateParams) (*QualityGate, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if id == "" {
		return nil, errMissingID("quality gate")
	}
	if params == nil || params.Name == "" {
		return nil, errors.New("scaledtest: quality gate name is required")
	}
	if len(params.Rules) == 0 {
		return nil, errors.New("scaledtest: quality gate rules must not be empty")
	}
	body := map[string]interface{}{"name": params.Name, "rules": params.Rules}
	if params.Description != "" {
		body["description"] = params.Description
	}
	if params.Enabled != nil {
		body["enabled"] = *params.Enabled
	}
	var out QualityGate
	if err := s.client.doAPI(ctx, "PUT", "/teams/"+pathEscape(teamID)+"/quality-gates/"+pathEscape(id), nil, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Delete removes a quality gate.
func (s *QualityGatesService) Delete(ctx context.Context, teamID, id string) (*DeleteQualityGateResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if id == "" {
		return nil, errMissingID("quality gate")
	}
	var out DeleteQualityGateResponse
	if err := s.client.doAPI(ctx, "DELETE", "/teams/"+pathEscape(teamID)+"/quality-gates/"+pathEscape(id), nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Evaluate runs a quality gate against a report.
func (s *QualityGatesService) Evaluate(ctx context.Context, teamID, id, reportID string) (*EvaluateQualityGateResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if id == "" {
		return nil, errMissingID("quality gate")
	}
	if reportID == "" {
		return nil, errMissingID("report")
	}
	body := map[string]string{"report_id": reportID}
	var out EvaluateQualityGateResponse
	if err := s.client.doAPI(ctx, "POST", "/teams/"+pathEscape(teamID)+"/quality-gates/"+pathEscape(id)+"/evaluate", nil, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ListEvaluations returns recent evaluation records for a gate.
func (s *QualityGatesService) ListEvaluations(ctx context.Context, teamID, id string, limit int) (*ListEvaluationsResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if id == "" {
		return nil, errMissingID("quality gate")
	}
	q := addInt(nil, "limit", limit)
	var out ListEvaluationsResponse
	if err := s.client.doAPI(ctx, "GET", "/teams/"+pathEscape(teamID)+"/quality-gates/"+pathEscape(id)+"/evaluations", q, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

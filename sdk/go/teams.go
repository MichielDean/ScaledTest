package scaledtest

import (
	"context"
	"errors"
	"net/url"
)

// TeamsService exposes the /api/v1/teams endpoints, including the tokens,
// webhooks, and invitations sub-resources.
type TeamsService struct {
	client *Client
}

// List returns the teams the caller belongs to.
func (s *TeamsService) List(ctx context.Context) (*ListTeamsResponse, error) {
	var out ListTeamsResponse
	if err := s.client.doAPI(ctx, "GET", "/teams", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Create creates a new team.
func (s *TeamsService) Create(ctx context.Context, name string) (*Team, error) {
	if name == "" {
		return nil, errors.New("scaledtest: team name is required")
	}
	var out Team
	if err := s.client.doAPI(ctx, "POST", "/teams", nil, map[string]string{"name": name}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Get retrieves a team and the caller's role in it.
func (s *TeamsService) Get(ctx context.Context, id string) (*GetTeamResponse, error) {
	if id == "" {
		return nil, errMissingID("team")
	}
	var out GetTeamResponse
	if err := s.client.doAPI(ctx, "GET", "/teams/"+pathEscape(id), nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Delete removes a team (owner-only).
func (s *TeamsService) Delete(ctx context.Context, id string) (*DeleteTeamResponse, error) {
	if id == "" {
		return nil, errMissingID("team")
	}
	var out DeleteTeamResponse
	if err := s.client.doAPI(ctx, "DELETE", "/teams/"+pathEscape(id), nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ── Tokens ───────────────────────────────────────────────────────────────────

// ListTokens returns the API tokens for a team.
func (s *TeamsService) ListTokens(ctx context.Context, teamID string) (*ListTokensResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	var out ListTokensResponse
	if err := s.client.doAPI(ctx, "GET", "/teams/"+pathEscape(teamID)+"/tokens", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// CreateToken creates a new API token for a team. The full token value is
// only returned once, in the response.
func (s *TeamsService) CreateToken(ctx context.Context, teamID, name string) (*CreateTokenResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if name == "" {
		return nil, errors.New("scaledtest: token name is required")
	}
	var out CreateTokenResponse
	if err := s.client.doAPI(ctx, "POST", "/teams/"+pathEscape(teamID)+"/tokens", nil, map[string]string{"name": name}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// DeleteToken revokes an API token.
func (s *TeamsService) DeleteToken(ctx context.Context, teamID, tokenID string) (*DeleteTokenResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if tokenID == "" {
		return nil, errMissingID("token")
	}
	var out DeleteTokenResponse
	if err := s.client.doAPI(ctx, "DELETE", "/teams/"+pathEscape(teamID)+"/tokens/"+pathEscape(tokenID), nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

// ListWebhooks returns the webhooks for a team.
func (s *TeamsService) ListWebhooks(ctx context.Context, teamID string) (*ListWebhooksResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	var out ListWebhooksResponse
	if err := s.client.doAPI(ctx, "GET", "/teams/"+pathEscape(teamID)+"/webhooks", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// CreateWebhook creates a new webhook. The signing secret is only returned
// once, in the response.
func (s *TeamsService) CreateWebhook(ctx context.Context, teamID, webhookURL string, events []WebhookEventType) (*CreateWebhookResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if webhookURL == "" {
		return nil, errors.New("scaledtest: webhook url is required")
	}
	if len(events) == 0 {
		return nil, errors.New("scaledtest: webhook events must not be empty")
	}
	body := map[string]interface{}{"url": webhookURL, "events": events}
	var out CreateWebhookResponse
	if err := s.client.doAPI(ctx, "POST", "/teams/"+pathEscape(teamID)+"/webhooks", nil, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetWebhook retrieves a single webhook.
func (s *TeamsService) GetWebhook(ctx context.Context, teamID, webhookID string) (*Webhook, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if webhookID == "" {
		return nil, errMissingID("webhook")
	}
	var out Webhook
	if err := s.client.doAPI(ctx, "GET", "/teams/"+pathEscape(teamID)+"/webhooks/"+pathEscape(webhookID), nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// UpdateWebhookParams is the body for UpdateWebhook.
type UpdateWebhookParams struct {
	URL     string
	Events  []WebhookEventType
	Enabled *bool
}

// UpdateWebhook modifies a webhook.
func (s *TeamsService) UpdateWebhook(ctx context.Context, teamID, webhookID string, params *UpdateWebhookParams) (*Webhook, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if webhookID == "" {
		return nil, errMissingID("webhook")
	}
	if params == nil || params.URL == "" {
		return nil, errors.New("scaledtest: webhook url is required")
	}
	if len(params.Events) == 0 {
		return nil, errors.New("scaledtest: webhook events must not be empty")
	}
	body := map[string]interface{}{"url": params.URL, "events": params.Events}
	if params.Enabled != nil {
		body["enabled"] = *params.Enabled
	}
	var out Webhook
	if err := s.client.doAPI(ctx, "PUT", "/teams/"+pathEscape(teamID)+"/webhooks/"+pathEscape(webhookID), nil, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// DeleteWebhook removes a webhook.
func (s *TeamsService) DeleteWebhook(ctx context.Context, teamID, webhookID string) (*DeleteWebhookResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if webhookID == "" {
		return nil, errMissingID("webhook")
	}
	var out DeleteWebhookResponse
	if err := s.client.doAPI(ctx, "DELETE", "/teams/"+pathEscape(teamID)+"/webhooks/"+pathEscape(webhookID), nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ListWebhookDeliveriesParams filters the deliveries listing.
type ListWebhookDeliveriesParams struct {
	BeforeID string
	Limit    int
}

// ListWebhookDeliveries returns delivery history for a webhook.
func (s *TeamsService) ListWebhookDeliveries(ctx context.Context, teamID, webhookID string, p *ListWebhookDeliveriesParams) (*ListWebhookDeliveriesResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if webhookID == "" {
		return nil, errMissingID("webhook")
	}
	var q url.Values
	if p != nil {
		q = addQuery(q, "before_id", p.BeforeID)
		q = addInt(q, "limit", p.Limit)
	}
	var out ListWebhookDeliveriesResponse
	if err := s.client.doAPI(ctx, "GET", "/teams/"+pathEscape(teamID)+"/webhooks/"+pathEscape(webhookID)+"/deliveries", q, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// RetryWebhookDelivery re-dispatches a stored webhook delivery.
func (s *TeamsService) RetryWebhookDelivery(ctx context.Context, teamID, webhookID, deliveryID string) (*RetryWebhookDeliveryResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if webhookID == "" {
		return nil, errMissingID("webhook")
	}
	if deliveryID == "" {
		return nil, errMissingID("delivery")
	}
	var out RetryWebhookDeliveryResponse
	path := "/teams/" + pathEscape(teamID) + "/webhooks/" + pathEscape(webhookID) + "/deliveries/" + pathEscape(deliveryID) + "/retry"
	if err := s.client.doAPI(ctx, "POST", path, nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ── Invitations (team-scoped) ─────────────────────────────────────────────────

// ListInvitations returns pending invitations for a team.
func (s *TeamsService) ListInvitations(ctx context.Context, teamID string) (*ListInvitationsResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	var out ListInvitationsResponse
	if err := s.client.doAPI(ctx, "GET", "/teams/"+pathEscape(teamID)+"/invitations", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// CreateInvitation creates a new team invitation. The token is only returned
// once, in the response.
func (s *TeamsService) CreateInvitation(ctx context.Context, teamID, email, role string) (*CreateInvitationResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if email == "" {
		return nil, errors.New("scaledtest: invitation email is required")
	}
	if role == "" {
		return nil, errors.New("scaledtest: invitation role is required")
	}
	body := map[string]string{"email": email, "role": role}
	var out CreateInvitationResponse
	if err := s.client.doAPI(ctx, "POST", "/teams/"+pathEscape(teamID)+"/invitations", nil, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// RevokeInvitation revokes a pending invitation.
func (s *TeamsService) RevokeInvitation(ctx context.Context, teamID, invitationID string) (*RevokeInvitationResponse, error) {
	if teamID == "" {
		return nil, errMissingID("team")
	}
	if invitationID == "" {
		return nil, errMissingID("invitation")
	}
	var out RevokeInvitationResponse
	if err := s.client.doAPI(ctx, "DELETE", "/teams/"+pathEscape(teamID)+"/invitations/"+pathEscape(invitationID), nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

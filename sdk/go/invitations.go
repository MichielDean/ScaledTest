package scaledtest

import (
	"context"
	"errors"
)

// InvitationsService exposes the public, token-scoped invitation endpoints
// under /api/v1/invitations/{token}. No bearer token is required; the token
// in the URL path authenticates the request.
type InvitationsService struct {
	client *Client
}

// Preview returns the details of a pending invitation by token.
func (s *InvitationsService) Preview(ctx context.Context, token string) (*InvitationPreview, error) {
	if token == "" {
		return nil, errors.New("scaledtest: invitation token is required")
	}
	var out InvitationPreview
	if err := s.client.doRaw(ctx, "GET", "/api/v1/invitations/"+pathEscape(token), nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// AcceptInvitationRequest is the body for Accept.
type AcceptInvitationRequest struct {
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

// Accept creates a user account and adds them to the inviting team.
func (s *InvitationsService) Accept(ctx context.Context, token string, req *AcceptInvitationRequest) (*AcceptInvitationResponse, error) {
	if token == "" {
		return nil, errors.New("scaledtest: invitation token is required")
	}
	if req == nil || req.Password == "" || req.DisplayName == "" {
		return nil, errors.New("scaledtest: password and display_name are required")
	}
	var out AcceptInvitationResponse
	if err := s.client.doRaw(ctx, "POST", "/api/v1/invitations/"+pathEscape(token)+"/accept", nil, req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

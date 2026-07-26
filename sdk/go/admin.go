package scaledtest

import (
	"context"
	"net/url"
)

// AdminService exposes the /api/v1/admin endpoints (owner role required).
type AdminService struct {
	client *Client
}

// ListUsersParams filters the users listing.
type ListUsersParams struct {
	Limit  int
	Offset int
}

// ListUsers returns all users (admin-only).
func (s *AdminService) ListUsers(ctx context.Context, p *ListUsersParams) (*ListUsersResponse, error) {
	var q url.Values
	if p != nil {
		q = addInt(q, "limit", p.Limit)
		q = addInt(q, "offset", p.Offset)
	}
	var out ListUsersResponse
	if err := s.client.doAPI(ctx, "GET", "/admin/users", q, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ListAuditLogParams filters the audit log query.
type ListAuditLogParams struct {
	Action       string
	ResourceType string
	ActorID      string
	Since        string // RFC3339
	Until        string // RFC3339
	Limit        int
	Offset       int
}

// ListAuditLog returns audit log entries (admin-only).
func (s *AdminService) ListAuditLog(ctx context.Context, p *ListAuditLogParams) (*ListAuditLogResponse, error) {
	var q url.Values
	if p != nil {
		q = addQuery(q, "action", p.Action)
		q = addQuery(q, "resource_type", p.ResourceType)
		q = addQuery(q, "actor_id", p.ActorID)
		q = addQuery(q, "since", p.Since)
		q = addQuery(q, "until", p.Until)
		q = addInt(q, "limit", p.Limit)
		q = addInt(q, "offset", p.Offset)
	}
	var out ListAuditLogResponse
	if err := s.client.doAPI(ctx, "GET", "/admin/audit-log", q, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

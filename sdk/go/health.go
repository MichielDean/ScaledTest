package scaledtest

import (
	"context"
)

// HealthService exposes the public /health endpoint.
type HealthService struct {
	client *Client
}

// Check queries the server health endpoint. No authentication is required.
func (s *HealthService) Check(ctx context.Context) (*HealthResponse, error) {
	var out HealthResponse
	if err := s.client.doRaw(ctx, "GET", "/health", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

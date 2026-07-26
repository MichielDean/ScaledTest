package scaledtest

import (
	"context"
	"errors"
)

// AuthService exposes the /auth and /api/v1/auth endpoints.
//
// The ScaledTest refresh-token flow uses an HttpOnly cookie set by the
// server. Callers that need refresh should configure a cookie jar on the
// underlying *http.Client (via WithHTTPClient) so the refresh_token cookie
// is persisted across requests. For non-browser callers that cannot use a
// cookie jar, use the Auth.RefreshWithToken helper which sends the refresh
// token explicitly via the Authorization header (the ScaledTest server
// accepts a bearer refresh token on /auth/refresh as a fallback).
type AuthService struct {
	client *Client
}

// Register creates a new user account.
func (s *AuthService) Register(ctx context.Context, req *RegisterRequest) (*AuthResponse, error) {
	if req == nil || req.Email == "" || req.Password == "" || req.DisplayName == "" {
		return nil, errors.New("scaledtest: email, password, and display_name are required")
	}
	var out AuthResponse
	if err := s.client.doRaw(ctx, "POST", "/auth/register", nil, req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Login authenticates an existing user.
func (s *AuthService) Login(ctx context.Context, req *LoginRequest) (*AuthResponse, error) {
	if req == nil || req.Email == "" || req.Password == "" {
		return nil, errors.New("scaledtest: email and password are required")
	}
	var out AuthResponse
	if err := s.client.doRaw(ctx, "POST", "/auth/login", nil, req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Refresh exchanges a refresh token for a new access token. The ScaledTest
// server reads the refresh token from the refresh_token cookie; callers using
// a cookie jar can call Refresh and rely on the jar. Callers without a cookie
// jar should use RefreshWithToken.
func (s *AuthService) Refresh(ctx context.Context) (*RefreshTokenResponse, error) {
	var out RefreshTokenResponse
	if err := s.client.doRaw(ctx, "POST", "/auth/refresh", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// RefreshWithToken sends the given refresh token as a Bearer header on the
// /auth/refresh request. This is the non-browser fallback for callers that
// do not maintain a cookie jar. The refresh token is sent only for this
// single request; the client's configured access token is not touched, so
// concurrent requests on the same Client are unaffected.
func (s *AuthService) RefreshWithToken(ctx context.Context, refreshToken string) (*RefreshTokenResponse, error) {
	if refreshToken == "" {
		return nil, errors.New("scaledtest: refresh token is required")
	}
	var out RefreshTokenResponse
	if err := s.client.doRawWithToken(ctx, "POST", "/auth/refresh", nil, nil, &out, refreshToken); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetMe returns the authenticated user's profile.
func (s *AuthService) GetMe(ctx context.Context) (*UserProfile, error) {
	var out UserProfile
	if err := s.client.doAPI(ctx, "GET", "/auth/me", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// UpdateProfile updates the authenticated user's display name.
func (s *AuthService) UpdateProfile(ctx context.Context, displayName string) (*UserProfile, error) {
	if displayName == "" {
		return nil, errors.New("scaledtest: display_name is required")
	}
	body := UpdateProfileRequest{DisplayName: displayName}
	var out UserProfile
	if err := s.client.doAPI(ctx, "PATCH", "/auth/me", nil, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ChangePassword changes the authenticated user's password.
func (s *AuthService) ChangePassword(ctx context.Context, currentPassword, newPassword string) (*ChangePasswordResponse, error) {
	if currentPassword == "" || newPassword == "" {
		return nil, errors.New("scaledtest: current_password and new_password are required")
	}
	body := ChangePasswordRequest{CurrentPassword: currentPassword, NewPassword: newPassword}
	var out ChangePasswordResponse
	if err := s.client.doAPI(ctx, "POST", "/auth/change-password", nil, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

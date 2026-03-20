package handler

import (
	"context"
	"net"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/scaledtest/scaledtest/internal/auth"
)

const refreshTokenCookie = "refresh_token"

// authDB is the minimal database interface used by AuthHandler.
// *pgxpool.Pool satisfies this interface.
type authDB interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	JWT *auth.JWTManager
	DB  authDB
}

// RegisterRequest is the request body for user registration.
type RegisterRequest struct {
	Email       string `json:"email" validate:"required,email"`
	Password    string `json:"password" validate:"required,min=8"`
	DisplayName string `json:"display_name" validate:"required,min=1"`
}

// LoginRequest is the request body for user login.
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// AuthResponse is the response for successful authentication.
type AuthResponse struct {
	User        UserResponse `json:"user"`
	AccessToken string       `json:"access_token"`
	ExpiresAt   time.Time    `json:"expires_at"`
}

// UserResponse is a user representation in API responses.
type UserResponse struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
}

// ChangePasswordRequest is the request body for changing the authenticated user's password.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=8"`
}

// UpdateProfileRequest is the request body for updating the authenticated user's profile.
type UpdateProfileRequest struct {
	DisplayName string `json:"display_name" validate:"required,min=1"`
}

// ChangePassword handles POST /api/v1/auth/change-password.
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req ChangePasswordRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	// Look up current password hash
	var passwordHash string
	err := h.DB.QueryRow(r.Context(),
		"SELECT password_hash FROM users WHERE id = $1",
		claims.UserID,
	).Scan(&passwordHash)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Verify current password
	if !auth.CheckPassword(req.CurrentPassword, passwordHash) {
		Error(w, http.StatusUnauthorized, "invalid current password")
		return
	}

	// Hash new password
	newHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Update password
	tag, err := h.DB.Exec(r.Context(),
		"UPDATE users SET password_hash = $1 WHERE id = $2",
		newHash, claims.UserID,
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() != 1 {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	JSON(w, http.StatusOK, map[string]string{"message": "password changed"})
}

// UpdateMeRequest is the request body for updating the authenticated user's profile.
type UpdateMeRequest struct {
	DisplayName string `json:"display_name" validate:"required,min=1,max=255"`
}

// UpdateMe handles PATCH /api/v1/auth/me.
func (h *AuthHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req UpdateMeRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	var userID, email, displayName, role string
	err := h.DB.QueryRow(r.Context(),
		`UPDATE users SET display_name = $1, updated_at = now()
		 WHERE id = $2
		 RETURNING id, email, display_name, role`,
		req.DisplayName, claims.UserID,
	).Scan(&userID, &email, &displayName, &role)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	JSON(w, http.StatusOK, UserResponse{
		ID:          userID,
		Email:       email,
		DisplayName: displayName,
		Role:        role,
	})
}

// GetMe handles GET /api/v1/auth/me.
func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	var email, displayName, role string
	err := h.DB.QueryRow(r.Context(),
		"SELECT email, display_name, role FROM users WHERE id = $1",
		claims.UserID,
	).Scan(&email, &displayName, &role)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	JSON(w, http.StatusOK, UserResponse{
		ID:          claims.UserID,
		Email:       email,
		DisplayName: displayName,
		Role:        role,
	})
}

// Register handles POST /auth/register.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	var req RegisterRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	// Check if email already exists
	var exists bool
	err := h.DB.QueryRow(r.Context(),
		"SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)", req.Email).Scan(&exists)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if exists {
		Error(w, http.StatusConflict, "email already registered")
		return
	}

	// Hash password
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Create user
	var userID, role string
	err = h.DB.QueryRow(r.Context(),
		`INSERT INTO users (email, password_hash, display_name)
		 VALUES ($1, $2, $3)
		 RETURNING id, role`,
		req.Email, hash, req.DisplayName,
	).Scan(&userID, &role)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Generate token pair and create session
	resp, err := h.issueTokens(r.Context(), w, r, userID, req.Email, role, "")
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp.User = UserResponse{
		ID:          userID,
		Email:       req.Email,
		DisplayName: req.DisplayName,
		Role:        role,
	}

	JSON(w, http.StatusCreated, resp)
}

// Login handles POST /auth/login.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	var req LoginRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	// Look up user by email
	var userID, passwordHash, displayName, role string
	err := h.DB.QueryRow(r.Context(),
		`SELECT id, password_hash, display_name, role FROM users WHERE email = $1`,
		req.Email,
	).Scan(&userID, &passwordHash, &displayName, &role)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Verify password
	if !auth.CheckPassword(req.Password, passwordHash) {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// Generate token pair and create session
	resp, err := h.issueTokens(r.Context(), w, r, userID, req.Email, role, "")
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp.User = UserResponse{
		ID:          userID,
		Email:       req.Email,
		DisplayName: displayName,
		Role:        role,
	}

	JSON(w, http.StatusOK, resp)
}

// Refresh handles POST /auth/refresh.
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	cookie, err := r.Cookie(refreshTokenCookie)
	if err != nil {
		Error(w, http.StatusUnauthorized, "missing refresh token")
		return
	}

	// Look up session by refresh token
	var sessionID, userID string
	var expiresAt time.Time
	err = h.DB.QueryRow(r.Context(),
		`SELECT s.id, s.user_id, s.expires_at
		 FROM sessions s
		 WHERE s.refresh_token = $1`,
		cookie.Value,
	).Scan(&sessionID, &userID, &expiresAt)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	if time.Now().After(expiresAt) {
		// Delete expired session
		_, _ = h.DB.Exec(r.Context(), "DELETE FROM sessions WHERE id = $1", sessionID)
		clearRefreshCookie(w, r)
		Error(w, http.StatusUnauthorized, "refresh token expired")
		return
	}

	// Look up user
	var email, displayName, role string
	err = h.DB.QueryRow(r.Context(),
		`SELECT email, display_name, role FROM users WHERE id = $1`, userID,
	).Scan(&email, &displayName, &role)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Delete old session (rotate refresh token)
	_, _ = h.DB.Exec(r.Context(), "DELETE FROM sessions WHERE id = $1", sessionID)

	// Issue new token pair
	resp, err := h.issueTokens(r.Context(), w, r, userID, email, role, "")
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp.User = UserResponse{
		ID:          userID,
		Email:       email,
		DisplayName: displayName,
		Role:        role,
	}

	JSON(w, http.StatusOK, resp)
}

// Logout handles POST /auth/logout.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	cookie, err := r.Cookie(refreshTokenCookie)
	if err != nil {
		// No cookie — already logged out, just return success
		JSON(w, http.StatusOK, map[string]string{"message": "logged out"})
		return
	}

	// Delete session by refresh token
	_, _ = h.DB.Exec(r.Context(), "DELETE FROM sessions WHERE refresh_token = $1", cookie.Value)
	clearRefreshCookie(w, r)

	JSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

// issueTokens generates a token pair, stores the session in DB, and sets the refresh cookie.
func (h *AuthHandler) issueTokens(ctx context.Context, w http.ResponseWriter, r *http.Request, userID, email, role, teamID string) (*AuthResponse, error) {
	pair, err := h.JWT.GenerateTokenPair(userID, email, role, teamID)
	if err != nil {
		return nil, err
	}

	// Extract client metadata
	userAgent := r.UserAgent()
	ipAddr := net.ParseIP(r.RemoteAddr)
	// RemoteAddr may include port — try to parse host only
	if ipAddr == nil {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		ipAddr = net.ParseIP(host)
	}

	expiresAt := time.Now().Add(h.JWT.RefreshDuration())

	_, err = h.DB.Exec(ctx,
		`INSERT INTO sessions (user_id, refresh_token, user_agent, ip_address, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		userID, pair.RefreshToken, userAgent, ipAddr, expiresAt,
	)
	if err != nil {
		return nil, err
	}

	setRefreshCookie(w, r, pair.RefreshToken, h.JWT.RefreshDuration())

	return &AuthResponse{
		AccessToken: pair.AccessToken,
		ExpiresAt:   pair.ExpiresAt,
	}, nil
}

func setRefreshCookie(w http.ResponseWriter, r *http.Request, token string, maxAge time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshTokenCookie,
		Value:    token,
		Path:     "/auth",
		MaxAge:   int(maxAge.Seconds()),
		HttpOnly: true,
		Secure:   isSecureRequest(r),
		SameSite: http.SameSiteStrictMode,
	})
}

func clearRefreshCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshTokenCookie,
		Value:    "",
		Path:     "/auth",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isSecureRequest(r),
		SameSite: http.SameSiteStrictMode,
	})
}

// isSecureRequest returns true if the request was made over HTTPS.
// Checks TLS directly and the X-Forwarded-Proto header for proxied requests.
func isSecureRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return r.Header.Get("X-Forwarded-Proto") == "https"
}

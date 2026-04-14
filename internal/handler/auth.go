package handler

import (
	"context"
	"errors"
	"net"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/scaledtest/scaledtest/internal/auth"
)

const refreshTokenCookie = "refresh_token"

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	JWT       *auth.JWTManager
	AuthStore authStore
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
	NewPassword     string `json:"new_password" validate:"required,min=8,max=72"`
}

// UpdateProfileRequest is the request body for updating the authenticated user's profile.
type UpdateProfileRequest struct {
	DisplayName string `json:"display_name" validate:"required,min=1,max=255"`
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

	if h.AuthStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	user, err := h.AuthStore.GetUserByID(r.Context(), claims.UserID)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	if !auth.CheckPassword(req.CurrentPassword, user.PasswordHash) {
		Error(w, http.StatusUnauthorized, "invalid current password")
		return
	}

	newHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	rowsAffected, err := h.AuthStore.UpdatePassword(r.Context(), claims.UserID, newHash)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if rowsAffected != 1 {
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

	if h.AuthStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	user, err := h.AuthStore.UpdateProfile(r.Context(), claims.UserID, req.DisplayName)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	JSON(w, http.StatusOK, UserResponse{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Role:        user.Role,
	})
}

// GetMe handles GET /api/v1/auth/me.
func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if h.AuthStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	user, err := h.AuthStore.GetUserByID(r.Context(), claims.UserID)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	JSON(w, http.StatusOK, UserResponse{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Role:        user.Role,
	})
}

// Register handles POST /auth/register.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if h.AuthStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	var req RegisterRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	exists, err := h.AuthStore.EmailExists(r.Context(), req.Email)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if exists {
		Error(w, http.StatusConflict, "email already registered")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Create user. The first user to register is assigned the 'owner' role so
	// they have immediate access to admin endpoints; all subsequent users are
	// assigned 'maintainer'. A unique partial index (idx_users_single_owner)
	// enforces at most one owner at the database level. If two concurrent
	// registrations both evaluate as the first user under READ COMMITTED, the
	// second INSERT will violate the index (SQLSTATE 23505). In that case we
	// retry explicitly as 'maintainer', which is correct because a committed
	// owner row now exists.
	userID, role, err := h.AuthStore.CreateUser(r.Context(), req.Email, hash, req.DisplayName, "")
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "idx_users_single_owner" {
			userID, err = h.AuthStore.CreateUserWithRole(r.Context(), req.Email, hash, req.DisplayName, "maintainer")
			if err != nil {
				Error(w, http.StatusInternalServerError, "internal error")
				return
			}
			role = "maintainer"
		} else {
			Error(w, http.StatusInternalServerError, "internal error")
			return
		}
	}

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
	if h.AuthStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	var req LoginRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	user, err := h.AuthStore.GetUserByEmail(r.Context(), req.Email)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	if !auth.CheckPassword(req.Password, user.PasswordHash) {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// Look up user's primary team to embed in the JWT so browser sessions
	// have team context for team-scoped API calls. Best-effort: if the
	// lookup fails for any reason, teamID stays empty.
	var teamID string
	teamID, _ = h.AuthStore.GetPrimaryTeamID(r.Context(), user.ID)

	resp, err := h.issueTokens(r.Context(), w, r, user.ID, user.Email, user.Role, teamID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp.User = UserResponse{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Role:        user.Role,
	}

	JSON(w, http.StatusOK, resp)
}

// Refresh handles POST /auth/refresh.
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	if h.AuthStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	cookie, err := r.Cookie(refreshTokenCookie)
	if err != nil {
		Error(w, http.StatusUnauthorized, "missing refresh token")
		return
	}

	session, err := h.AuthStore.GetSessionByRefreshToken(r.Context(), cookie.Value)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	if time.Now().After(session.ExpiresAt) {
		_ = h.AuthStore.DeleteSession(r.Context(), session.ID)
		clearRefreshCookie(w, r)
		Error(w, http.StatusUnauthorized, "refresh token expired")
		return
	}

	user, err := h.AuthStore.GetUserByID(r.Context(), session.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	_ = h.AuthStore.DeleteSession(r.Context(), session.ID)

	resp, err := h.issueTokens(r.Context(), w, r, user.ID, user.Email, user.Role, "")
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp.User = UserResponse{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Role:        user.Role,
	}

	JSON(w, http.StatusOK, resp)
}

// Logout handles POST /auth/logout.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if h.AuthStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	cookie, err := r.Cookie(refreshTokenCookie)
	if err != nil {
		JSON(w, http.StatusOK, map[string]string{"message": "logged out"})
		return
	}

	_ = h.AuthStore.DeleteSessionByRefreshToken(r.Context(), cookie.Value)
	clearRefreshCookie(w, r)

	JSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

// issueTokens generates a token pair, stores the session in DB, and sets the refresh cookie.
func (h *AuthHandler) issueTokens(ctx context.Context, w http.ResponseWriter, r *http.Request, userID, email, role, teamID string) (*AuthResponse, error) {
	pair, err := h.JWT.GenerateTokenPair(userID, email, role, teamID)
	if err != nil {
		return nil, err
	}

	userAgent := r.UserAgent()
	ipAddr := net.ParseIP(r.RemoteAddr)
	if ipAddr == nil {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		ipAddr = net.ParseIP(host)
	}

	expiresAt := time.Now().Add(h.JWT.RefreshDuration())

	if err := h.AuthStore.CreateSession(ctx, userID, pair.RefreshToken, userAgent, ipAddr, expiresAt); err != nil {
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

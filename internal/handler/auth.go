package handler

import (
	"net/http"
	"time"

	"github.com/scaledtest/scaledtest/internal/auth"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	JWT *auth.JWTManager
	// DB queries will be injected when the database task is wired up.
	// For now, handlers return structured errors indicating the flow.
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

// Register handles POST /auth/register.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	// TODO: Check if email exists in DB, create user, generate tokens
	// For now, return the expected response shape
	Error(w, http.StatusNotImplemented, "registration requires database connection")
}

// Login handles POST /auth/login.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	// TODO: Look up user, verify password, generate tokens
	Error(w, http.StatusNotImplemented, "login requires database connection")
}

// Refresh handles POST /auth/refresh.
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	// TODO: Read refresh token from httpOnly cookie, validate, issue new pair
	Error(w, http.StatusNotImplemented, "refresh requires database connection")
}

// Logout handles POST /auth/logout.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	// TODO: Invalidate refresh token in DB, clear cookie
	Error(w, http.StatusNotImplemented, "logout requires database connection")
}

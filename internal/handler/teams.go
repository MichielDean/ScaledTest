package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
)

// TeamsHandler handles team management endpoints.
type TeamsHandler struct{}

// CreateTeamRequest is the request body for creating a team.
type CreateTeamRequest struct {
	Name string `json:"name" validate:"required,min=1"`
}

// List handles GET /api/v1/teams.
func (h *TeamsHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"teams": []interface{}{},
	})
}

// Create handles POST /api/v1/teams.
func (h *TeamsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateTeamRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	Error(w, http.StatusNotImplemented, "create team requires database connection")
}

// Get handles GET /api/v1/teams/{teamID}.
func (h *TeamsHandler) Get(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamID")
	if teamID == "" {
		Error(w, http.StatusBadRequest, "missing team ID")
		return
	}

	Error(w, http.StatusNotImplemented, "get team requires database connection")
}

// Delete handles DELETE /api/v1/teams/{teamID}.
func (h *TeamsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamID")
	if teamID == "" {
		Error(w, http.StatusBadRequest, "missing team ID")
		return
	}

	Error(w, http.StatusNotImplemented, "delete team requires database connection")
}

// ListTokens handles GET /api/v1/teams/{teamID}/tokens.
func (h *TeamsHandler) ListTokens(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, map[string]interface{}{
		"tokens": []interface{}{},
	})
}

// CreateToken handles POST /api/v1/teams/{teamID}/tokens.
func (h *TeamsHandler) CreateToken(w http.ResponseWriter, r *http.Request) {
	Error(w, http.StatusNotImplemented, "create token requires database connection")
}

// DeleteToken handles DELETE /api/v1/teams/{teamID}/tokens/{tokenID}.
func (h *TeamsHandler) DeleteToken(w http.ResponseWriter, r *http.Request) {
	tokenID := chi.URLParam(r, "tokenID")
	if tokenID == "" {
		Error(w, http.StatusBadRequest, "missing token ID")
		return
	}

	Error(w, http.StatusNotImplemented, "delete token requires database connection")
}

// AdminListUsers handles GET /api/v1/admin/users.
func AdminListUsers(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, map[string]interface{}{
		"users": []interface{}{},
	})
}

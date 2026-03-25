package handler

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/db"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/sanitize"
	"github.com/scaledtest/scaledtest/internal/store"
)

// teamsStore abstracts team and token data operations for testable handlers.
type teamsStore interface {
	CreateTeam(ctx context.Context, userID, name string) (*model.Team, error)
	GetUserRole(ctx context.Context, userID, teamID string) (string, error)
	DeleteTeam(ctx context.Context, teamID string) error
	CreateToken(ctx context.Context, teamID, userID, name, tokenHash, prefix string) (*model.APIToken, error)
	DeleteToken(ctx context.Context, teamID, tokenID string) (int64, error)
}

// TeamsHandler handles team management endpoints.
type TeamsHandler struct {
	DB         *db.Pool
	Store      teamsStore
	AuditStore auditLogger
}

// CreateTeamRequest is the request body for creating a team.
type CreateTeamRequest struct {
	Name string `json:"name" validate:"required,min=1"`
}

// CreateTokenRequest is the request body for creating an API token.
type CreateTokenRequest struct {
	Name string `json:"name" validate:"required,min=1"`
}

// List handles GET /api/v1/teams.
func (h *TeamsHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if h.DB == nil {
		JSON(w, http.StatusOK, map[string]interface{}{"teams": []interface{}{}})
		return
	}

	rows, err := h.DB.Query(r.Context(),
		`SELECT t.id, t.name, t.created_at, ut.role
		 FROM teams t
		 JOIN user_teams ut ON ut.team_id = t.id
		 WHERE ut.user_id = $1
		 ORDER BY t.name`, claims.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list teams")
		return
	}
	defer rows.Close()

	type teamWithRole struct {
		model.Team
		Role string `json:"role"`
	}

	var teams []teamWithRole
	for rows.Next() {
		var t teamWithRole
		if err := rows.Scan(&t.ID, &t.Name, &t.CreatedAt, &t.Role); err != nil {
			Error(w, http.StatusInternalServerError, "failed to scan team")
			return
		}
		teams = append(teams, t)
	}
	if teams == nil {
		teams = []teamWithRole{}
	}

	JSON(w, http.StatusOK, map[string]interface{}{"teams": teams})
}

// Create handles POST /api/v1/teams.
func (h *TeamsHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req CreateTeamRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "create team requires database connection")
		return
	}

	// Sanitize user-provided strings
	req.Name = sanitize.String(req.Name)

	team, err := h.Store.CreateTeam(r.Context(), claims.UserID, req.Name)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create team")
		return
	}

	logAudit(r.Context(), h.AuditStore, store.Entry{
		ActorID:      claims.UserID,
		ActorEmail:   claims.Email,
		TeamID:       team.ID,
		Action:       "team.created",
		ResourceType: "team",
		ResourceID:   team.ID,
	})

	JSON(w, http.StatusCreated, team)
}

// Get handles GET /api/v1/teams/{teamID}.
func (h *TeamsHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID := chi.URLParam(r, "teamID")
	if teamID == "" {
		Error(w, http.StatusBadRequest, "missing team ID")
		return
	}

	if h.DB == nil {
		Error(w, http.StatusNotImplemented, "get team requires database connection")
		return
	}

	// Verify membership and get team
	var team model.Team
	var role string
	err := h.DB.QueryRow(r.Context(),
		`SELECT t.id, t.name, t.created_at, ut.role
		 FROM teams t
		 JOIN user_teams ut ON ut.team_id = t.id
		 WHERE t.id = $1 AND ut.user_id = $2`, teamID, claims.UserID).
		Scan(&team.ID, &team.Name, &team.CreatedAt, &role)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "team not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get team")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"team": team,
		"role": role,
	})
}

// Delete handles DELETE /api/v1/teams/{teamID}.
func (h *TeamsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID := chi.URLParam(r, "teamID")
	if teamID == "" {
		Error(w, http.StatusBadRequest, "missing team ID")
		return
	}

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "delete team requires database connection")
		return
	}

	// Only owners can delete teams
	role, err := h.Store.GetUserRole(r.Context(), claims.UserID, teamID)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "team not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to check team membership")
		return
	}
	if role != "owner" {
		Error(w, http.StatusForbidden, "only team owners can delete teams")
		return
	}

	if err := h.Store.DeleteTeam(r.Context(), teamID); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete team")
		return
	}

	logAudit(r.Context(), h.AuditStore, store.Entry{
		ActorID:      claims.UserID,
		ActorEmail:   claims.Email,
		TeamID:       teamID,
		Action:       "team.deleted",
		ResourceType: "team",
		ResourceID:   teamID,
	})

	JSON(w, http.StatusOK, map[string]string{"message": "team deleted"})
}

// ListTokens handles GET /api/v1/teams/{teamID}/tokens.
func (h *TeamsHandler) ListTokens(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID := chi.URLParam(r, "teamID")
	if teamID == "" {
		Error(w, http.StatusBadRequest, "missing team ID")
		return
	}

	if h.DB == nil {
		JSON(w, http.StatusOK, map[string]interface{}{"tokens": []interface{}{}})
		return
	}

	// Verify team membership
	_, err := h.getUserTeamRole(r.Context(), claims.UserID, teamID)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "team not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to check team membership")
		return
	}

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, team_id, user_id, name, prefix, last_used_at, created_at
		 FROM api_tokens
		 WHERE team_id = $1
		 ORDER BY created_at DESC`, teamID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list tokens")
		return
	}
	defer rows.Close()

	var tokens []model.APIToken
	for rows.Next() {
		var t model.APIToken
		if err := rows.Scan(&t.ID, &t.TeamID, &t.UserID, &t.Name, &t.Prefix, &t.LastUsedAt, &t.CreatedAt); err != nil {
			Error(w, http.StatusInternalServerError, "failed to scan token")
			return
		}
		tokens = append(tokens, t)
	}
	if tokens == nil {
		tokens = []model.APIToken{}
	}

	JSON(w, http.StatusOK, map[string]interface{}{"tokens": tokens})
}

// CreateToken handles POST /api/v1/teams/{teamID}/tokens.
func (h *TeamsHandler) CreateToken(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID := chi.URLParam(r, "teamID")
	if teamID == "" {
		Error(w, http.StatusBadRequest, "missing team ID")
		return
	}

	var req CreateTokenRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "create token requires database connection")
		return
	}

	// Only owners can create tokens
	role, err := h.Store.GetUserRole(r.Context(), claims.UserID, teamID)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "team not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to check team membership")
		return
	}
	if role != "owner" {
		Error(w, http.StatusForbidden, "only team owners can manage tokens")
		return
	}

	// Sanitize user-provided strings
	req.Name = sanitize.String(req.Name)

	// Generate API token
	tokenResult, err := auth.GenerateAPIToken()
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	token, err := h.Store.CreateToken(r.Context(), teamID, claims.UserID, req.Name, tokenResult.TokenHash, tokenResult.Prefix)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create token")
		return
	}

	logAudit(r.Context(), h.AuditStore, store.Entry{
		ActorID:      claims.UserID,
		ActorEmail:   claims.Email,
		TeamID:       teamID,
		Action:       "token.created",
		ResourceType: "token",
		ResourceID:   token.ID,
		Metadata:     map[string]interface{}{"name": token.Name},
	})

	// Return the full token value — shown only once
	JSON(w, http.StatusCreated, map[string]interface{}{
		"token":      tokenResult.Token,
		"id":         token.ID,
		"name":       token.Name,
		"prefix":     token.Prefix,
		"created_at": token.CreatedAt,
	})
}

// DeleteToken handles DELETE /api/v1/teams/{teamID}/tokens/{tokenID}.
func (h *TeamsHandler) DeleteToken(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID := chi.URLParam(r, "teamID")
	if teamID == "" {
		Error(w, http.StatusBadRequest, "missing team ID")
		return
	}

	tokenID := chi.URLParam(r, "tokenID")
	if tokenID == "" {
		Error(w, http.StatusBadRequest, "missing token ID")
		return
	}

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "delete token requires database connection")
		return
	}

	// Only owners can revoke tokens
	role, err := h.Store.GetUserRole(r.Context(), claims.UserID, teamID)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "team not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to check team membership")
		return
	}
	if role != "owner" {
		Error(w, http.StatusForbidden, "only team owners can manage tokens")
		return
	}

	rowsAffected, err := h.Store.DeleteToken(r.Context(), teamID, tokenID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete token")
		return
	}
	if rowsAffected == 0 {
		Error(w, http.StatusNotFound, "token not found")
		return
	}

	logAudit(r.Context(), h.AuditStore, store.Entry{
		ActorID:      claims.UserID,
		ActorEmail:   claims.Email,
		TeamID:       teamID,
		Action:       "token.deleted",
		ResourceType: "token",
		ResourceID:   tokenID,
	})

	JSON(w, http.StatusOK, map[string]string{"message": "token revoked"})
}

// getUserTeamRole returns the user's role in the team, or an error if not a member.
func (h *TeamsHandler) getUserTeamRole(ctx context.Context, userID, teamID string) (string, error) {
	var role string
	err := h.DB.QueryRow(ctx,
		`SELECT role FROM user_teams WHERE user_id = $1 AND team_id = $2`,
		userID, teamID).Scan(&role)
	return role, err
}

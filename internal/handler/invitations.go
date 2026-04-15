package handler

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/mailer"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/sanitize"
	"github.com/scaledtest/scaledtest/internal/store"
)

const invitationTokenBytes = 32
const invitationTTL = 7 * 24 * time.Hour // 7 days

var validInvitationRoles = map[string]bool{
	"readonly":   true,
	"maintainer": true,
	"owner":      true,
}

// invitationStore is the subset of store.InvitationStore used by InvitationsHandler.
type invitationStore interface {
	Create(ctx context.Context, teamID, email, role, tokenHash string, invitedBy *string, expiresAt time.Time) (*model.Invitation, error)
	ListByTeam(ctx context.Context, teamID string) ([]model.Invitation, error)
	GetByTokenHash(ctx context.Context, tokenHash string) (*model.Invitation, error)
	Delete(ctx context.Context, teamID, id string) error
	AcceptInvitation(ctx context.Context, invID, email, passwordHash, displayName, role, teamID string) (string, error)
	GetTeamName(ctx context.Context, teamID string) (string, error)
}

// InvitationsHandler handles invitation endpoints.
type InvitationsHandler struct {
	Store      invitationStore
	Mailer     mailer.Mailer
	BaseURL    string
	AuditStore auditLogger
}

// CreateInvitationRequest is the request body for creating an invitation.
type CreateInvitationRequest struct {
	Email string `json:"email" validate:"required,email"`
	Role  string `json:"role" validate:"required"`
}

// Create handles POST /api/v1/teams/{teamID}/invitations.
func (h *InvitationsHandler) Create(w http.ResponseWriter, r *http.Request) {
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

	if claims.TeamID != teamID {
		Error(w, http.StatusForbidden, "not a member of this team")
		return
	}

	if claims.Role != "maintainer" && claims.Role != "owner" {
		Error(w, http.StatusForbidden, "maintainer or owner role required")
		return
	}

	var req CreateInvitationRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if !validInvitationRoles[req.Role] {
		Error(w, http.StatusBadRequest, "invalid role: must be readonly, maintainer, or owner")
		return
	}

	if h.Store == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	req.Email = sanitize.String(req.Email)

	// Generate token
	token, tokenHash, err := generateInvitationToken()
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to generate invitation token")
		return
	}

	expiresAt := time.Now().Add(invitationTTL)

	invitedBy := claims.UserID
	inv, err := h.Store.Create(r.Context(), teamID, req.Email, req.Role, tokenHash, &invitedBy, expiresAt)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create invitation")
		return
	}

	logAudit(r.Context(), h.AuditStore, store.Entry{
		ActorID:      claims.UserID,
		ActorEmail:   claims.Email,
		TeamID:       teamID,
		Action:       "invitation.created",
		ResourceType: "invitation",
		ResourceID:   inv.ID,
		Metadata:     map[string]interface{}{"email": req.Email, "role": req.Role},
	})

	inviteURL := h.BaseURL + "/invitations/" + token

	if h.Mailer == nil {
		log.Info().
			Str("email", req.Email).
			Str("invite_url", inviteURL).
			Msg("SMTP not configured — invitation email not sent")
	} else {
		if err := h.Mailer.SendInvitation(r.Context(), req.Email, inviteURL); err != nil {
			log.Error().Err(err).Str("email", req.Email).Msg("failed to send invitation email")
		}
	}

	JSON(w, http.StatusCreated, map[string]interface{}{
		"invitation": inv,
		"token":      token, // shown once — used to construct the accept URL
	})
}

// List handles GET /api/v1/teams/{teamID}/invitations.
func (h *InvitationsHandler) List(w http.ResponseWriter, r *http.Request) {
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

	if claims.TeamID != teamID {
		Error(w, http.StatusForbidden, "not a member of this team")
		return
	}

	if h.Store == nil {
		JSON(w, http.StatusOK, map[string]interface{}{"invitations": []interface{}{}})
		return
	}

	invitations, err := h.Store.ListByTeam(r.Context(), teamID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list invitations")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"invitations": invitations,
	})
}

// Preview handles GET /api/v1/invitations/{token} — public, shows invite details.
func (h *InvitationsHandler) Preview(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		Error(w, http.StatusBadRequest, "missing invitation token")
		return
	}

	if h.Store == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	tokenHash := hashInvitationToken(token)
	inv, err := h.Store.GetByTokenHash(r.Context(), tokenHash)
	if err != nil {
		Error(w, http.StatusNotFound, "invitation not found")
		return
	}

	if inv.AcceptedAt != nil {
		Error(w, http.StatusGone, "invitation already accepted")
		return
	}

	if time.Now().After(inv.ExpiresAt) {
		Error(w, http.StatusGone, "invitation expired")
		return
	}

	teamName, err := h.Store.GetTeamName(r.Context(), inv.TeamID)
	if err != nil {
		teamName = "Unknown"
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"email":      inv.Email,
		"role":       inv.Role,
		"team_name":  teamName,
		"expires_at": inv.ExpiresAt,
	})
}

// Accept handles POST /api/v1/invitations/{token}/accept — creates user + team membership.
func (h *InvitationsHandler) Accept(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		Error(w, http.StatusBadRequest, "missing invitation token")
		return
	}

	if h.Store == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	var req struct {
		Password    string `json:"password" validate:"required,min=8,max=72"`
		DisplayName string `json:"display_name" validate:"required,min=1"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	tokenHash := hashInvitationToken(token)
	inv, err := h.Store.GetByTokenHash(r.Context(), tokenHash)
	if err != nil {
		Error(w, http.StatusNotFound, "invitation not found")
		return
	}

	if inv.AcceptedAt != nil {
		Error(w, http.StatusGone, "invitation already accepted")
		return
	}

	if time.Now().After(inv.ExpiresAt) {
		Error(w, http.StatusGone, "invitation expired")
		return
	}

	req.DisplayName = sanitize.String(req.DisplayName)

	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	userID, err := h.Store.AcceptInvitation(r.Context(), inv.ID, inv.Email, passwordHash, req.DisplayName, inv.Role, inv.TeamID)
	if err != nil {
		if errors.Is(err, store.ErrOwnerAlreadyExists) {
			Error(w, http.StatusConflict, "an owner already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to accept invitation")
		return
	}

	logAudit(r.Context(), h.AuditStore, store.Entry{
		ActorID:      userID,
		ActorEmail:   inv.Email,
		TeamID:       inv.TeamID,
		Action:       "invitation.accepted",
		ResourceType: "invitation",
		ResourceID:   inv.ID,
		Metadata:     map[string]interface{}{"role": inv.Role},
	})

	JSON(w, http.StatusOK, map[string]interface{}{
		"message": "invitation accepted",
		"user_id": userID,
		"team_id": inv.TeamID,
		"role":    inv.Role,
	})
}

// Revoke handles DELETE /api/v1/teams/{teamID}/invitations/{invitationID}.
func (h *InvitationsHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID := chi.URLParam(r, "teamID")
	invitationID := chi.URLParam(r, "invitationID")
	if teamID == "" || invitationID == "" {
		Error(w, http.StatusBadRequest, "missing team ID or invitation ID")
		return
	}

	if claims.TeamID != teamID {
		Error(w, http.StatusForbidden, "not a member of this team")
		return
	}

	if claims.Role != "maintainer" && claims.Role != "owner" {
		Error(w, http.StatusForbidden, "maintainer or owner role required")
		return
	}

	if h.Store == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	if err := h.Store.Delete(r.Context(), teamID, invitationID); err != nil {
		Error(w, http.StatusNotFound, "invitation not found")
		return
	}

	logAudit(r.Context(), h.AuditStore, store.Entry{
		ActorID:      claims.UserID,
		ActorEmail:   claims.Email,
		TeamID:       teamID,
		Action:       "invitation.revoked",
		ResourceType: "invitation",
		ResourceID:   invitationID,
	})

	JSON(w, http.StatusOK, map[string]string{"message": "invitation revoked"})
}

func generateInvitationToken() (plaintext, hash string, err error) {
	b := make([]byte, invitationTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	plaintext = "inv_" + hex.EncodeToString(b)
	h := sha256.Sum256([]byte(plaintext))
	hash = hex.EncodeToString(h[:])
	return plaintext, hash, nil
}

func hashInvitationToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

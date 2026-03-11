package handler

import (
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/ctrf"
)

// ReportsHandler handles CTRF report endpoints.
type ReportsHandler struct{}

// List handles GET /api/v1/reports.
func (h *ReportsHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// TODO: Query reports from DB filtered by team
	JSON(w, http.StatusOK, map[string]interface{}{
		"reports": []interface{}{},
		"total":   0,
	})
}

// Create handles POST /api/v1/reports — ingests a CTRF report.
func (h *ReportsHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 10<<20)) // 10MB limit
	if err != nil {
		Error(w, http.StatusBadRequest, "failed to read body")
		return
	}

	report, err := ctrf.Parse(body)
	if err != nil {
		Error(w, http.StatusBadRequest, "invalid CTRF format: "+err.Error())
		return
	}

	if err := ctrf.Validate(report); err != nil {
		Error(w, http.StatusBadRequest, "CTRF validation failed: "+err.Error())
		return
	}

	// TODO: Store report + normalized results in DB
	// reportID := uuid.New().String()
	// results := ctrf.Normalize(report, reportID, claims.TeamID)

	JSON(w, http.StatusCreated, map[string]interface{}{
		"message": "report accepted",
		"tool":    report.Results.Tool.Name,
		"tests":   report.Results.Summary.Tests,
	})
}

// Get handles GET /api/v1/reports/{reportID}.
func (h *ReportsHandler) Get(w http.ResponseWriter, r *http.Request) {
	reportID := chi.URLParam(r, "reportID")
	if reportID == "" {
		Error(w, http.StatusBadRequest, "missing report ID")
		return
	}

	// TODO: Query report from DB
	Error(w, http.StatusNotImplemented, "get report requires database connection")
}

// Delete handles DELETE /api/v1/reports/{reportID}.
func (h *ReportsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	reportID := chi.URLParam(r, "reportID")
	if reportID == "" {
		Error(w, http.StatusBadRequest, "missing report ID")
		return
	}

	// TODO: Delete report from DB
	Error(w, http.StatusNotImplemented, "delete report requires database connection")
}

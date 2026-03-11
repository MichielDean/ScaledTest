package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/db"
)

// QuarantineHandler handles flaky test quarantine endpoints.
type QuarantineHandler struct {
	DB *db.Pool
}

// QuarantineRequest is the request body for quarantining a test.
type QuarantineRequest struct {
	TestName string `json:"test_name" validate:"required"`
	Suite    string `json:"suite,omitempty"`
	FilePath string `json:"file_path,omitempty"`
	Reason   string `json:"reason,omitempty"`
}

// QuarantineResponse is the API representation of a quarantined test.
type QuarantineResponse struct {
	ID                 string    `json:"id"`
	TestName           string    `json:"test_name"`
	Suite              string    `json:"suite,omitempty"`
	FilePath           string    `json:"file_path,omitempty"`
	Reason             string    `json:"reason"`
	AutoDetected       bool      `json:"auto_detected"`
	Active             bool      `json:"active"`
	FlipCount          int       `json:"flip_count"`
	FlipRate           float64   `json:"flip_rate"`
	TotalRuns          int       `json:"total_runs"`
	LastFailureMessage string    `json:"last_failure_message,omitempty"`
	QuarantinedAt      time.Time `json:"quarantined_at"`
}

// QuarantineStatsResponse is the summary of quarantine status for a team.
type QuarantineStatsResponse struct {
	TotalQuarantined int     `json:"total_quarantined"`
	AutoDetected     int     `json:"auto_detected"`
	ManuallyAdded    int     `json:"manually_added"`
	AvgFlipRate      float64 `json:"avg_flip_rate"`
}

// List handles GET /api/v1/teams/{teamID}/quarantine.
func (h *QuarantineHandler) List(w http.ResponseWriter, r *http.Request) {
	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

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

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, test_name, suite, file_path, reason, auto_detected, active,
		        flip_count, flip_rate, total_runs, last_failure_message, quarantined_at
		 FROM flaky_test_quarantine
		 WHERE team_id = $1 AND active = true
		 ORDER BY quarantined_at DESC`, teamID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to query quarantined tests")
		return
	}
	defer rows.Close()

	var quarantined []QuarantineResponse
	for rows.Next() {
		var q QuarantineResponse
		var suite, filePath, lastMsg *string
		err := rows.Scan(&q.ID, &q.TestName, &suite, &filePath, &q.Reason,
			&q.AutoDetected, &q.Active, &q.FlipCount, &q.FlipRate,
			&q.TotalRuns, &lastMsg, &q.QuarantinedAt)
		if err != nil {
			Error(w, http.StatusInternalServerError, "failed to scan quarantine row")
			return
		}
		if suite != nil {
			q.Suite = *suite
		}
		if filePath != nil {
			q.FilePath = *filePath
		}
		if lastMsg != nil {
			q.LastFailureMessage = *lastMsg
		}
		quarantined = append(quarantined, q)
	}
	if err := rows.Err(); err != nil {
		Error(w, http.StatusInternalServerError, "failed to iterate quarantine rows")
		return
	}

	if quarantined == nil {
		quarantined = []QuarantineResponse{}
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"quarantined": quarantined,
		"total":       len(quarantined),
	})
}

// Create handles POST /api/v1/teams/{teamID}/quarantine.
// Manually quarantine a test.
func (h *QuarantineHandler) Create(w http.ResponseWriter, r *http.Request) {
	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

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

	var req QuarantineRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	reason := req.Reason
	if reason == "" {
		reason = "manually quarantined"
	}

	var id string
	var quarantinedAt time.Time
	err := h.DB.QueryRow(r.Context(),
		`INSERT INTO flaky_test_quarantine (team_id, test_name, suite, file_path, reason, auto_detected)
		 VALUES ($1, $2, $3, $4, $5, false)
		 ON CONFLICT (team_id, test_name) WHERE active = true
		 DO UPDATE SET reason = EXCLUDED.reason, updated_at = now()
		 RETURNING id, quarantined_at`,
		teamID, req.TestName, nilIfEmpty(req.Suite), nilIfEmpty(req.FilePath), reason,
	).Scan(&id, &quarantinedAt)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to quarantine test")
		return
	}

	JSON(w, http.StatusCreated, QuarantineResponse{
		ID:            id,
		TestName:      req.TestName,
		Suite:         req.Suite,
		FilePath:      req.FilePath,
		Reason:        reason,
		AutoDetected:  false,
		Active:        true,
		QuarantinedAt: quarantinedAt,
	})
}

// Delete handles DELETE /api/v1/teams/{teamID}/quarantine/{quarantineID}.
// Unquarantine a test (set active = false).
func (h *QuarantineHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID := chi.URLParam(r, "teamID")
	quarantineID := chi.URLParam(r, "quarantineID")
	if teamID == "" || quarantineID == "" {
		Error(w, http.StatusBadRequest, "missing team ID or quarantine ID")
		return
	}

	tag, err := h.DB.Exec(r.Context(),
		`UPDATE flaky_test_quarantine SET active = false, updated_at = now()
		 WHERE id = $1 AND team_id = $2 AND active = true`,
		quarantineID, teamID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to unquarantine test")
		return
	}
	if tag.RowsAffected() == 0 {
		Error(w, http.StatusNotFound, "quarantine entry not found")
		return
	}

	JSON(w, http.StatusOK, map[string]string{"message": "test unquarantined"})
}

// Stats handles GET /api/v1/teams/{teamID}/quarantine/stats.
func (h *QuarantineHandler) Stats(w http.ResponseWriter, r *http.Request) {
	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

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

	var stats QuarantineStatsResponse
	err := h.DB.QueryRow(r.Context(),
		`SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE auto_detected = true),
			COUNT(*) FILTER (WHERE auto_detected = false),
			COALESCE(AVG(flip_rate), 0)
		 FROM flaky_test_quarantine
		 WHERE team_id = $1 AND active = true`, teamID,
	).Scan(&stats.TotalQuarantined, &stats.AutoDetected, &stats.ManuallyAdded, &stats.AvgFlipRate)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to compute quarantine stats")
		return
	}

	JSON(w, http.StatusOK, stats)
}

// nilIfEmpty returns nil for empty strings, or a pointer to the string.
func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

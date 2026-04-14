package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/shard"
	"github.com/scaledtest/scaledtest/internal/store"
)

// ShardingHandler handles test sharding and distribution endpoints.
type ShardingHandler struct {
	DurationStore *store.DurationStore
}

// CreateShardPlanRequest is the request body for creating a shard plan.
type CreateShardPlanRequest struct {
	TestNames    []string            `json:"test_names" validate:"required,min=1"`
	NumWorkers   int                 `json:"num_workers" validate:"required,min=1"`
	Strategy     string              `json:"strategy,omitempty"`
	ExecutionID  string              `json:"execution_id,omitempty"`
	Dependencies map[string][]string `json:"dependencies,omitempty"`
}

// CreatePlan handles POST /api/v1/sharding/plan.
// Creates an intelligent shard plan using historical duration data.
func (h *ShardingHandler) CreatePlan(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req CreateShardPlanRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	// Look up historical durations.
	var history map[string]*model.TestDurationHistory
	if h.DurationStore != nil {
		var err error
		history, err = h.DurationStore.GetByTeamMap(r.Context(), claims.TeamID)
		if err != nil {
			Error(w, http.StatusInternalServerError, "failed to load duration history")
			return
		}
	}

	tests := shard.EnrichWithHistory(req.TestNames, history)

	plan, err := shard.Plan(shard.Request{
		Tests:        tests,
		NumWorkers:   req.NumWorkers,
		Strategy:     req.Strategy,
		ExecutionID:  req.ExecutionID,
		Dependencies: req.Dependencies,
	})
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}

	JSON(w, http.StatusOK, plan)
}

// RebalanceRequest is the request body for rebalancing after worker failure.
type RebalanceRequest struct {
	ExecutionID    string          `json:"execution_id" validate:"required"`
	FailedWorkerID string          `json:"failed_worker_id" validate:"required"`
	CurrentPlan    model.ShardPlan `json:"current_plan" validate:"required"`
	CompletedTests []string        `json:"completed_tests"`
}

// Rebalance handles POST /api/v1/sharding/rebalance.
// Redistributes tests from a failed worker to remaining workers.
func (h *ShardingHandler) Rebalance(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req RebalanceRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	completed := make(map[string]bool, len(req.CompletedTests))
	for _, t := range req.CompletedTests {
		completed[t] = true
	}

	newShards := shard.Rebalance(&req.CurrentPlan, req.FailedWorkerID, completed)

	var maxMs int64
	var totalMs int64
	for _, s := range newShards {
		totalMs += s.EstDurationMs
		if s.EstDurationMs > maxMs {
			maxMs = s.EstDurationMs
		}
	}

	JSON(w, http.StatusOK, &model.ShardPlan{
		ExecutionID:    req.ExecutionID,
		TotalWorkers:   len(newShards),
		Strategy:       req.CurrentPlan.Strategy,
		Shards:         newShards,
		EstTotalMs:     totalMs,
		EstWallClockMs: maxMs,
	})
}

// ListDurations handles GET /api/v1/sharding/durations.
// Returns historical test duration data for the team.
func (h *ShardingHandler) ListDurations(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if h.DurationStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	suite := r.URL.Query().Get("suite")
	var durations []model.TestDurationHistory
	var err error
	if suite != "" {
		durations, err = h.DurationStore.GetBySuite(r.Context(), claims.TeamID, suite)
	} else {
		durations, err = h.DurationStore.GetByTeam(r.Context(), claims.TeamID)
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to query durations")
		return
	}

	if durations == nil {
		durations = []model.TestDurationHistory{}
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"durations": durations,
		"total":     len(durations),
	})
}

// GetDuration handles GET /api/v1/sharding/durations/{testName}.
// Always returns a JSON array of duration entries for consistent API shape.
func (h *ShardingHandler) GetDuration(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	testName := chi.URLParam(r, "testName")
	if testName == "" {
		Error(w, http.StatusBadRequest, "missing test name")
		return
	}

	if h.DurationStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	durations, err := h.DurationStore.GetByTeamAndTest(r.Context(), claims.TeamID, testName)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to query durations")
		return
	}

	if len(durations) == 0 {
		Error(w, http.StatusNotFound, "no duration history for test")
		return
	}

	JSON(w, http.StatusOK, durations)
}

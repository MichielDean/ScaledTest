package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/scaledtest/scaledtest/internal/model"
)

func TestCreatePlan_Unauthorized(t *testing.T) {
	h := &ShardingHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/sharding/plan", nil)

	h.CreatePlan(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("CreatePlan without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestCreatePlan_InvalidBody(t *testing.T) {
	h := &ShardingHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/sharding/plan", strings.NewReader(`{invalid}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.CreatePlan(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("CreatePlan with invalid body: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreatePlan_MissingTests(t *testing.T) {
	h := &ShardingHandler{}
	w := httptest.NewRecorder()
	body := `{"test_names":[],"num_workers":2}`
	r := httptest.NewRequest("POST", "/api/v1/sharding/plan", strings.NewReader(body))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.CreatePlan(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("CreatePlan with empty tests: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreatePlan_Success_NoDB(t *testing.T) {
	h := &ShardingHandler{DurationStore: nil}
	w := httptest.NewRecorder()
	body := `{"test_names":["test-a","test-b","test-c","test-d"],"num_workers":2,"strategy":"duration_balanced"}`
	r := httptest.NewRequest("POST", "/api/v1/sharding/plan", strings.NewReader(body))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.CreatePlan(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("CreatePlan: got %d, want %d", w.Code, http.StatusOK)
	}

	var plan model.ShardPlan
	if err := json.NewDecoder(w.Body).Decode(&plan); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if plan.TotalWorkers != 2 {
		t.Errorf("total_workers: got %d, want 2", plan.TotalWorkers)
	}
	if plan.Strategy != "duration_balanced" {
		t.Errorf("strategy: got %q, want %q", plan.Strategy, "duration_balanced")
	}
	if len(plan.Shards) != 2 {
		t.Errorf("shards: got %d, want 2", len(plan.Shards))
	}

	totalTests := 0
	for _, s := range plan.Shards {
		totalTests += s.TestCount
	}
	if totalTests != 4 {
		t.Errorf("total tests: got %d, want 4", totalTests)
	}
}

func TestCreatePlan_RoundRobin(t *testing.T) {
	h := &ShardingHandler{}
	w := httptest.NewRecorder()
	body := `{"test_names":["a","b","c"],"num_workers":3,"strategy":"round_robin"}`
	r := httptest.NewRequest("POST", "/api/v1/sharding/plan", strings.NewReader(body))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.CreatePlan(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("CreatePlan round_robin: got %d, want %d", w.Code, http.StatusOK)
	}

	var plan model.ShardPlan
	json.NewDecoder(w.Body).Decode(&plan)
	if plan.Strategy != "round_robin" {
		t.Errorf("strategy: got %q, want %q", plan.Strategy, "round_robin")
	}
}

func TestCreatePlan_WithDependencies(t *testing.T) {
	h := &ShardingHandler{}
	w := httptest.NewRecorder()
	body := `{
		"test_names": ["login", "dashboard", "settings"],
		"num_workers": 2,
		"dependencies": {"dashboard": ["login"]}
	}`
	r := httptest.NewRequest("POST", "/api/v1/sharding/plan", strings.NewReader(body))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.CreatePlan(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("CreatePlan with deps: got %d, want %d", w.Code, http.StatusOK)
	}

	var plan model.ShardPlan
	json.NewDecoder(w.Body).Decode(&plan)

	// Find which shard has login and dashboard.
	shardForTest := make(map[string]string)
	for _, s := range plan.Shards {
		for _, name := range s.TestNames {
			shardForTest[name] = s.WorkerID
		}
	}
	if shardForTest["login"] != shardForTest["dashboard"] {
		t.Error("login and dashboard should be on same shard due to dependency")
	}
}

func TestRebalance_Unauthorized(t *testing.T) {
	h := &ShardingHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/sharding/rebalance", nil)

	h.Rebalance(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Rebalance without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestRebalance_InvalidBody(t *testing.T) {
	h := &ShardingHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/sharding/rebalance", strings.NewReader(`{invalid}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Rebalance(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Rebalance invalid body: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestRebalance_Success(t *testing.T) {
	h := &ShardingHandler{}
	w := httptest.NewRecorder()
	body := `{
		"execution_id": "exec-1",
		"failed_worker_id": "worker-0",
		"current_plan": {
			"execution_id": "exec-1",
			"total_workers": 2,
			"strategy": "duration_balanced",
			"shards": [
				{"worker_id": "worker-0", "test_names": ["a", "b"], "est_duration_ms": 200, "test_count": 2},
				{"worker_id": "worker-1", "test_names": ["c"], "est_duration_ms": 100, "test_count": 1}
			]
		},
		"completed_tests": ["a"]
	}`
	r := httptest.NewRequest("POST", "/api/v1/sharding/rebalance", strings.NewReader(body))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Rebalance(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("Rebalance: got %d, want %d", w.Code, http.StatusOK)
	}

	var plan model.ShardPlan
	json.NewDecoder(w.Body).Decode(&plan)

	if plan.TotalWorkers != 1 {
		t.Errorf("total_workers after rebalance: got %d, want 1", plan.TotalWorkers)
	}

	// "b" should be redistributed to worker-1, "a" was completed.
	allTests := make(map[string]bool)
	for _, s := range plan.Shards {
		for _, name := range s.TestNames {
			allTests[name] = true
		}
	}
	if !allTests["b"] {
		t.Error("test 'b' should be redistributed")
	}
	if !allTests["c"] {
		t.Error("test 'c' should still be present")
	}
	if allTests["a"] {
		t.Error("completed test 'a' should not be present")
	}
}

func TestListDurations_Unauthorized(t *testing.T) {
	h := &ShardingHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/sharding/durations", nil)

	h.ListDurations(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("ListDurations without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestListDurations_NoDB(t *testing.T) {
	h := &ShardingHandler{DurationStore: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/sharding/durations", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.ListDurations(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("ListDurations without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestGetDuration_Unauthorized(t *testing.T) {
	h := &ShardingHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/sharding/durations/test-a", nil)
	r = testWithChiParam(r, "testName", "test-a")

	h.GetDuration(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("GetDuration without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestGetDuration_MissingName(t *testing.T) {
	h := &ShardingHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/sharding/durations/", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "testName", "")

	h.GetDuration(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("GetDuration empty name: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestGetDuration_NoDB(t *testing.T) {
	h := &ShardingHandler{DurationStore: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/sharding/durations/test-a", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "testName", "test-a")

	h.GetDuration(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("GetDuration without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

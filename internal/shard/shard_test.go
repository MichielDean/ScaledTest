package shard

import (
	"testing"

	"github.com/scaledtest/scaledtest/internal/model"
)

func TestPlan_InvalidWorkers(t *testing.T) {
	_, err := Plan(Request{
		Tests:      []TestInfo{{Name: "a", EstDurationMs: 100}},
		NumWorkers: 0,
	})
	if err == nil {
		t.Error("expected error for 0 workers")
	}
}

func TestPlan_NoTests(t *testing.T) {
	_, err := Plan(Request{
		Tests:      nil,
		NumWorkers: 2,
	})
	if err == nil {
		t.Error("expected error for empty tests")
	}
}

func TestPlan_UnknownStrategy(t *testing.T) {
	_, err := Plan(Request{
		Tests:      []TestInfo{{Name: "a", EstDurationMs: 100}},
		NumWorkers: 1,
		Strategy:   "unknown",
	})
	if err == nil {
		t.Error("expected error for unknown strategy")
	}
}

func TestPlan_DurationBalanced_EvenDistribution(t *testing.T) {
	tests := []TestInfo{
		{Name: "slow", EstDurationMs: 1000},
		{Name: "medium", EstDurationMs: 500},
		{Name: "fast1", EstDurationMs: 200},
		{Name: "fast2", EstDurationMs: 300},
	}

	plan, err := Plan(Request{
		Tests:       tests,
		NumWorkers:  2,
		Strategy:    StrategyDurationBalanced,
		ExecutionID: "exec-1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if plan.TotalWorkers != 2 {
		t.Errorf("total_workers: got %d, want 2", plan.TotalWorkers)
	}
	if plan.Strategy != StrategyDurationBalanced {
		t.Errorf("strategy: got %q, want %q", plan.Strategy, StrategyDurationBalanced)
	}
	if plan.ExecutionID != "exec-1" {
		t.Errorf("execution_id: got %q, want %q", plan.ExecutionID, "exec-1")
	}

	// Total duration should sum correctly.
	if plan.EstTotalMs != 2000 {
		t.Errorf("est_total_ms: got %d, want 2000", plan.EstTotalMs)
	}

	// With LPT, slow(1000) goes to shard 0, medium(500) to shard 1,
	// fast2(300) to shard 1 (total=800), fast1(200) to shard 1 (total=1000).
	// Shard 0: 1000, Shard 1: 500+300+200=1000
	// Wall clock = max(1000, 1000) = 1000
	if plan.EstWallClockMs != 1000 {
		t.Errorf("est_wall_clock_ms: got %d, want 1000", plan.EstWallClockMs)
	}

	// All tests should be assigned.
	totalTests := 0
	for _, s := range plan.Shards {
		totalTests += s.TestCount
	}
	if totalTests != 4 {
		t.Errorf("total assigned tests: got %d, want 4", totalTests)
	}
}

func TestPlan_SingleWorker(t *testing.T) {
	tests := []TestInfo{
		{Name: "a", EstDurationMs: 100},
		{Name: "b", EstDurationMs: 200},
		{Name: "c", EstDurationMs: 300},
	}

	plan, err := Plan(Request{
		Tests:      tests,
		NumWorkers: 1,
		Strategy:   StrategyDurationBalanced,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(plan.Shards) != 1 {
		t.Fatalf("shards: got %d, want 1", len(plan.Shards))
	}
	if plan.Shards[0].TestCount != 3 {
		t.Errorf("shard 0 test_count: got %d, want 3", plan.Shards[0].TestCount)
	}
	if plan.EstWallClockMs != 600 {
		t.Errorf("wall_clock: got %d, want 600", plan.EstWallClockMs)
	}
}

func TestPlan_RoundRobin(t *testing.T) {
	tests := []TestInfo{
		{Name: "a", EstDurationMs: 100},
		{Name: "b", EstDurationMs: 200},
		{Name: "c", EstDurationMs: 300},
		{Name: "d", EstDurationMs: 400},
	}

	plan, err := Plan(Request{
		Tests:      tests,
		NumWorkers: 2,
		Strategy:   StrategyRoundRobin,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Round robin: shard0 gets a,c; shard1 gets b,d.
	if plan.Shards[0].TestCount != 2 || plan.Shards[1].TestCount != 2 {
		t.Errorf("expected 2 tests per shard, got %d and %d",
			plan.Shards[0].TestCount, plan.Shards[1].TestCount)
	}
}

func TestPlan_SuiteGrouped(t *testing.T) {
	tests := []TestInfo{
		{Name: "a", Suite: "auth", EstDurationMs: 100},
		{Name: "b", Suite: "auth", EstDurationMs: 200},
		{Name: "c", Suite: "api", EstDurationMs: 300},
		{Name: "d", Suite: "api", EstDurationMs: 400},
	}

	plan, err := Plan(Request{
		Tests:      tests,
		NumWorkers: 2,
		Strategy:   StrategySuiteGrouped,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Suite "api" (700ms) and "auth" (300ms) should be on different shards.
	if len(plan.Shards) != 2 {
		t.Fatalf("expected 2 shards, got %d", len(plan.Shards))
	}

	// All 4 tests assigned.
	total := plan.Shards[0].TestCount + plan.Shards[1].TestCount
	if total != 4 {
		t.Errorf("total tests: got %d, want 4", total)
	}
}

func TestPlan_Dependencies(t *testing.T) {
	tests := []TestInfo{
		{Name: "login", EstDurationMs: 100},
		{Name: "dashboard", EstDurationMs: 200},
		{Name: "logout", EstDurationMs: 50},
		{Name: "settings", EstDurationMs: 300},
	}

	deps := map[string][]string{
		"dashboard": {"login"},
		"logout":    {"login"},
	}

	plan, err := Plan(Request{
		Tests:        tests,
		NumWorkers:   2,
		Strategy:     StrategyDurationBalanced,
		Dependencies: deps,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// login, dashboard, logout should be on the same shard.
	shardForTest := make(map[string]string)
	for _, s := range plan.Shards {
		for _, name := range s.TestNames {
			shardForTest[name] = s.WorkerID
		}
	}

	if shardForTest["login"] != shardForTest["dashboard"] {
		t.Error("login and dashboard should be on the same shard")
	}
	if shardForTest["login"] != shardForTest["logout"] {
		t.Error("login and logout should be on the same shard")
	}
}

func TestPlan_MoreWorkersThanTests(t *testing.T) {
	tests := []TestInfo{
		{Name: "a", EstDurationMs: 100},
		{Name: "b", EstDurationMs: 200},
	}

	plan, err := Plan(Request{
		Tests:      tests,
		NumWorkers: 5,
		Strategy:   StrategyDurationBalanced,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if plan.TotalWorkers != 5 {
		t.Errorf("total_workers: got %d, want 5", plan.TotalWorkers)
	}

	assigned := 0
	for _, s := range plan.Shards {
		assigned += s.TestCount
	}
	if assigned != 2 {
		t.Errorf("assigned tests: got %d, want 2", assigned)
	}
}

func TestEnrichWithHistory(t *testing.T) {
	names := []string{"test-a", "test-b", "test-c"}
	history := map[string]*model.TestDurationHistory{
		"test-a\x00unit": {TestName: "test-a", AvgDurationMs: 1500, Suite: "unit"},
		"test-c\x00e2e":  {TestName: "test-c", AvgDurationMs: 0, Suite: "e2e"},
	}

	enriched := EnrichWithHistory(names, history)

	if enriched[0].EstDurationMs != 1500 {
		t.Errorf("test-a duration: got %d, want 1500", enriched[0].EstDurationMs)
	}
	if enriched[0].Suite != "unit" {
		t.Errorf("test-a suite: got %q, want %q", enriched[0].Suite, "unit")
	}
	if enriched[1].EstDurationMs != DefaultEstDurationMs {
		t.Errorf("test-b (no history) duration: got %d, want %d", enriched[1].EstDurationMs, DefaultEstDurationMs)
	}
	if enriched[2].EstDurationMs != DefaultEstDurationMs {
		t.Errorf("test-c (0 avg) duration: got %d, want %d", enriched[2].EstDurationMs, DefaultEstDurationMs)
	}
}

func TestEnrichWithHistory_SameNameDifferentSuites_DeterministicSuite(t *testing.T) {
	names := []string{"test-a"}
	history := map[string]*model.TestDurationHistory{
		"test-a\x00unit":        {TestName: "test-a", AvgDurationMs: 100, Suite: "unit"},
		"test-a\x00integration": {TestName: "test-a", AvgDurationMs: 200, Suite: "integration"},
	}

	enriched := EnrichWithHistory(names, history)

	if len(enriched) != 1 {
		t.Fatalf("len(enriched) = %d, want 1", len(enriched))
	}
	if enriched[0].EstDurationMs != 300 {
		t.Errorf("test-a duration across suites: got %d, want 300 (100+200)", enriched[0].EstDurationMs)
	}
	if enriched[0].Suite != "integration" {
		t.Errorf("test-a suite: got %q, want alphabetically-first %q", enriched[0].Suite, "integration")
	}
}

func TestRebalance_FailedWorker(t *testing.T) {
	plan := &model.ShardPlan{
		Shards: []model.Shard{
			{WorkerID: "worker-0", TestNames: []string{"a", "b", "c"}, EstDurationMs: 300, TestCount: 3},
			{WorkerID: "worker-1", TestNames: []string{"d", "e"}, EstDurationMs: 200, TestCount: 2},
			{WorkerID: "worker-2", TestNames: []string{"f"}, EstDurationMs: 100, TestCount: 1},
		},
	}

	completed := map[string]bool{"a": true} // "a" was done before failure
	newShards := Rebalance(plan, "worker-0", completed)

	// worker-0 removed, "b" and "c" redistributed.
	if len(newShards) != 2 {
		t.Fatalf("expected 2 shards, got %d", len(newShards))
	}

	allTests := make(map[string]bool)
	for _, s := range newShards {
		for _, name := range s.TestNames {
			allTests[name] = true
		}
	}

	// Original worker-1 and worker-2 tests + redistributed b,c.
	for _, expected := range []string{"b", "c", "d", "e", "f"} {
		if !allTests[expected] {
			t.Errorf("test %q not found in rebalanced shards", expected)
		}
	}
	if allTests["a"] {
		t.Error("completed test 'a' should not be in rebalanced shards")
	}
}

func TestRebalance_NoRemainingTests(t *testing.T) {
	plan := &model.ShardPlan{
		Shards: []model.Shard{
			{WorkerID: "worker-0", TestNames: []string{"a"}, EstDurationMs: 100, TestCount: 1},
			{WorkerID: "worker-1", TestNames: []string{"b"}, EstDurationMs: 200, TestCount: 1},
		},
	}

	completed := map[string]bool{"a": true}
	newShards := Rebalance(plan, "worker-0", completed)

	// All tests from worker-0 completed, active shards remain unchanged.
	if len(newShards) != 1 {
		t.Fatalf("expected 1 active shard, got %d", len(newShards))
	}
	if newShards[0].WorkerID != "worker-1" {
		t.Errorf("expected worker-1, got %s", newShards[0].WorkerID)
	}
	if newShards[0].TestCount != 1 {
		t.Errorf("worker-1 test_count: got %d, want 1", newShards[0].TestCount)
	}
}

func TestRebalance_UnknownWorker(t *testing.T) {
	plan := &model.ShardPlan{
		Shards: []model.Shard{
			{WorkerID: "worker-0", TestNames: []string{"a"}, EstDurationMs: 100, TestCount: 1},
		},
	}

	newShards := Rebalance(plan, "worker-99", nil)
	// Unknown worker, nothing changes.
	if len(newShards) != 1 {
		t.Fatalf("expected 1 shard, got %d", len(newShards))
	}
}

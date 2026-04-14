package shard

import (
	"fmt"
	"sort"

	"github.com/scaledtest/scaledtest/internal/model"
)

const (
	StrategyDurationBalanced = "duration_balanced"
	StrategyRoundRobin       = "round_robin"
	StrategySuiteGrouped     = "suite_grouped"

	// DefaultEstDurationMs is used for tests with no history.
	DefaultEstDurationMs int64 = 5000
)

// TestInfo holds a test and its estimated duration for sharding.
type TestInfo struct {
	Name          string
	Suite         string
	EstDurationMs int64
}

// Request defines the input for creating a shard plan.
type Request struct {
	Tests       []TestInfo
	NumWorkers  int
	Strategy    string
	ExecutionID string
	// Dependencies maps test name -> list of test names that must run before it.
	// Tests with dependencies are assigned to the same worker shard.
	Dependencies map[string][]string
}

// Plan creates a ShardPlan distributing tests across workers.
func Plan(req Request) (*model.ShardPlan, error) {
	if req.NumWorkers < 1 {
		return nil, fmt.Errorf("num_workers must be >= 1, got %d", req.NumWorkers)
	}
	if len(req.Tests) == 0 {
		return nil, fmt.Errorf("no tests to shard")
	}

	strategy := req.Strategy
	if strategy == "" {
		strategy = StrategyDurationBalanced
	}

	// Resolve dependency groups: tests with deps must go to the same worker.
	groups := resolveDependencyGroups(req.Tests, req.Dependencies)

	var shards []model.Shard
	switch strategy {
	case StrategyDurationBalanced:
		shards = durationBalanced(groups, req.NumWorkers)
	case StrategyRoundRobin:
		shards = roundRobin(groups, req.NumWorkers)
	case StrategySuiteGrouped:
		shards = suiteGrouped(groups, req.NumWorkers)
	default:
		return nil, fmt.Errorf("unknown strategy: %s", strategy)
	}

	var totalMs int64
	var maxMs int64
	for i := range shards {
		shards[i].WorkerID = fmt.Sprintf("worker-%d", i)
		shards[i].TestCount = len(shards[i].TestNames)
		totalMs += shards[i].EstDurationMs
		if shards[i].EstDurationMs > maxMs {
			maxMs = shards[i].EstDurationMs
		}
	}

	return &model.ShardPlan{
		ExecutionID:    req.ExecutionID,
		TotalWorkers:   req.NumWorkers,
		Strategy:       strategy,
		Shards:         shards,
		EstTotalMs:     totalMs,
		EstWallClockMs: maxMs,
	}, nil
}

// testGroup is a set of tests that must run on the same worker.
type testGroup struct {
	tests       []TestInfo
	totalMs     int64
	primaryName string
	suite       string
}

// resolveDependencyGroups merges tests with dependencies into groups.
func resolveDependencyGroups(tests []TestInfo, deps map[string][]string) []testGroup {
	if len(deps) == 0 {
		groups := make([]testGroup, len(tests))
		for i, t := range tests {
			groups[i] = testGroup{
				tests:       []TestInfo{t},
				totalMs:     t.EstDurationMs,
				primaryName: t.Name,
				suite:       t.Suite,
			}
		}
		return groups
	}

	// Build union-find for dependency groups.
	parent := make(map[string]string)
	testByName := make(map[string]TestInfo)
	for _, t := range tests {
		parent[t.Name] = t.Name
		testByName[t.Name] = t
	}

	var find func(string) string
	find = func(n string) string {
		if parent[n] != n {
			parent[n] = find(parent[n])
		}
		return parent[n]
	}
	union := func(a, b string) {
		ra, rb := find(a), find(b)
		if ra != rb {
			parent[ra] = rb
		}
	}

	for test, depList := range deps {
		if _, ok := testByName[test]; !ok {
			continue
		}
		for _, dep := range depList {
			if _, ok := testByName[dep]; !ok {
				continue
			}
			union(test, dep)
		}
	}

	// Group by root.
	grouped := make(map[string][]TestInfo)
	for _, t := range tests {
		root := find(t.Name)
		grouped[root] = append(grouped[root], t)
	}

	groups := make([]testGroup, 0, len(grouped))
	for _, members := range grouped {
		var totalMs int64
		for _, m := range members {
			totalMs += m.EstDurationMs
		}
		groups = append(groups, testGroup{
			tests:       members,
			totalMs:     totalMs,
			primaryName: members[0].Name,
			suite:       members[0].Suite,
		})
	}
	return groups
}

// durationBalanced uses a greedy bin-packing (longest processing time first)
// algorithm to minimize the max shard duration (wall-clock time).
func durationBalanced(groups []testGroup, numWorkers int) []model.Shard {
	shards := make([]model.Shard, numWorkers)
	for i := range shards {
		shards[i].TestNames = []string{}
	}

	// Sort groups by total duration descending.
	sort.Slice(groups, func(i, j int) bool {
		return groups[i].totalMs > groups[j].totalMs
	})

	// Assign each group to the shard with the least total duration.
	for _, g := range groups {
		minIdx := 0
		for i := 1; i < len(shards); i++ {
			if shards[i].EstDurationMs < shards[minIdx].EstDurationMs {
				minIdx = i
			}
		}
		for _, t := range g.tests {
			shards[minIdx].TestNames = append(shards[minIdx].TestNames, t.Name)
		}
		shards[minIdx].EstDurationMs += g.totalMs
	}

	return shards
}

// roundRobin distributes test groups across workers in round-robin order.
func roundRobin(groups []testGroup, numWorkers int) []model.Shard {
	shards := make([]model.Shard, numWorkers)
	for i := range shards {
		shards[i].TestNames = []string{}
	}

	for i, g := range groups {
		idx := i % numWorkers
		for _, t := range g.tests {
			shards[idx].TestNames = append(shards[idx].TestNames, t.Name)
		}
		shards[idx].EstDurationMs += g.totalMs
	}

	return shards
}

// suiteGrouped keeps tests from the same suite on the same worker, then
// balances suite groups across workers by duration.
func suiteGrouped(groups []testGroup, numWorkers int) []model.Shard {
	// Merge groups by suite first.
	suiteMap := make(map[string]testGroup)
	for _, g := range groups {
		suite := g.suite
		if suite == "" {
			suite = "__default__"
		}
		existing := suiteMap[suite]
		existing.tests = append(existing.tests, g.tests...)
		existing.totalMs += g.totalMs
		existing.suite = suite
		if existing.primaryName == "" {
			existing.primaryName = g.primaryName
		}
		suiteMap[suite] = existing
	}

	suiteGroups := make([]testGroup, 0, len(suiteMap))
	for _, sg := range suiteMap {
		suiteGroups = append(suiteGroups, sg)
	}

	return durationBalanced(suiteGroups, numWorkers)
}

// EnrichWithHistory takes a list of test names and enriches them with
// historical duration data. Tests without history get the default estimate.
// The history map uses composite keys "testName\x00suite" to preserve entries
// across different suites. For each test name, we aggregate durations across
// all suites (summing avg_duration_ms).
func EnrichWithHistory(testNames []string, history map[string]*model.TestDurationHistory) []TestInfo {
	// Build a per-test-name aggregate from the composite-keyed map.
	agg := make(map[string]struct {
		totalDurationMs int64
		suite           string
		count           int
	}, len(testNames))
	for _, h := range history {
		agg[h.TestName] = struct {
			totalDurationMs int64
			suite           string
			count           int
		}{
			totalDurationMs: agg[h.TestName].totalDurationMs + h.AvgDurationMs,
			suite:           h.Suite,
			count:           agg[h.TestName].count + 1,
		}
	}

	tests := make([]TestInfo, len(testNames))
	for i, name := range testNames {
		tests[i] = TestInfo{
			Name:          name,
			EstDurationMs: DefaultEstDurationMs,
		}
		if a, ok := agg[name]; ok && a.totalDurationMs > 0 {
			tests[i].EstDurationMs = a.totalDurationMs
			tests[i].Suite = a.suite
		}
	}
	return tests
}

// Rebalance redistributes unfinished tests from a failed worker across
// the remaining active workers. Returns updated shard assignments.
func Rebalance(currentPlan *model.ShardPlan, failedWorkerID string, completedTests map[string]bool) []model.Shard {
	// Collect remaining tests from the failed worker.
	var remainingTests []TestInfo
	failedShardIdx := -1
	for i, s := range currentPlan.Shards {
		if s.WorkerID == failedWorkerID {
			failedShardIdx = i
			for _, name := range s.TestNames {
				if !completedTests[name] {
					remainingTests = append(remainingTests, TestInfo{
						Name:          name,
						EstDurationMs: DefaultEstDurationMs,
					})
				}
			}
			break
		}
	}

	// Worker not found — return shards unchanged.
	if failedShardIdx == -1 {
		return currentPlan.Shards
	}

	// Build new shards excluding the failed worker.
	activeShards := make([]model.Shard, 0, len(currentPlan.Shards)-1)
	for i, s := range currentPlan.Shards {
		if i == failedShardIdx {
			continue
		}
		activeShards = append(activeShards, s)
	}

	if len(activeShards) == 0 || len(remainingTests) == 0 {
		return activeShards
	}

	// Distribute remaining tests to shard with least estimated duration.
	sort.Slice(remainingTests, func(i, j int) bool {
		return remainingTests[i].EstDurationMs > remainingTests[j].EstDurationMs
	})
	for _, t := range remainingTests {
		minIdx := 0
		for i := 1; i < len(activeShards); i++ {
			if activeShards[i].EstDurationMs < activeShards[minIdx].EstDurationMs {
				minIdx = i
			}
		}
		activeShards[minIdx].TestNames = append(activeShards[minIdx].TestNames, t.Name)
		activeShards[minIdx].EstDurationMs += t.EstDurationMs
		activeShards[minIdx].TestCount = len(activeShards[minIdx].TestNames)
	}

	return activeShards
}

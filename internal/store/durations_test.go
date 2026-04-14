//go:build integration

package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/integration"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/store"
)

func insertDurationReport(t *testing.T, tdb *integration.TestDB, teamID string) string {
	t.Helper()
	ctx := context.Background()
	var id string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw, created_at)
		 VALUES ($1, 'jest', '{}', '{}', now()) RETURNING id`,
		teamID,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insertDurationReport: %v", err)
	}
	return id
}

func TestDurationStore_UpsertFromResults_InsertsNew(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-insert")
	s := store.NewDurationStore(tdb.Pool)

	results := []model.TestResult{
		{Name: "TestAlpha", Suite: "unit", DurationMs: 100, Status: "passed", TeamID: teamID},
		{Name: "TestBeta", Suite: "unit", DurationMs: 200, Status: "failed", TeamID: teamID},
	}

	err := s.UpsertFromResults(ctx, teamID, results, tdb.Pool)
	if err != nil {
		t.Fatalf("UpsertFromResults: %v", err)
	}

	entries, err := s.GetByTeam(ctx, teamID)
	if err != nil {
		t.Fatalf("GetByTeam: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("len(entries) = %d, want 2", len(entries))
	}

	found := map[string]*model.TestDurationHistory{}
	for i := range entries {
		found[entries[i].TestName] = &entries[i]
	}

	if a, ok := found["TestAlpha"]; !ok {
		t.Error("TestAlpha not found")
	} else {
		if a.AvgDurationMs != 100 {
			t.Errorf("TestAlpha AvgDurationMs = %d, want 100", a.AvgDurationMs)
		}
		if a.RunCount != 1 {
			t.Errorf("TestAlpha RunCount = %d, want 1", a.RunCount)
		}
		if a.LastStatus != "passed" {
			t.Errorf("TestAlpha LastStatus = %q, want %q", a.LastStatus, "passed")
		}
		if a.Suite != "unit" {
			t.Errorf("TestAlpha Suite = %q, want %q", a.Suite, "unit")
		}
	}

	if b, ok := found["TestBeta"]; !ok {
		t.Error("TestBeta not found")
	} else {
		if b.LastStatus != "failed" {
			t.Errorf("TestBeta LastStatus = %q, want %q", b.LastStatus, "failed")
		}
	}
}

func TestDurationStore_UpsertFromResults_RollingAverage(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-rolling")
	s := store.NewDurationStore(tdb.Pool)

	results1 := []model.TestResult{
		{Name: "TestAvg", Suite: "unit", DurationMs: 100, Status: "passed", TeamID: teamID},
	}
	if err := s.UpsertFromResults(ctx, teamID, results1, tdb.Pool); err != nil {
		t.Fatalf("first upsert: %v", err)
	}

	results2 := []model.TestResult{
		{Name: "TestAvg", Suite: "unit", DurationMs: 300, Status: "failed", TeamID: teamID},
	}
	if err := s.UpsertFromResults(ctx, teamID, results2, tdb.Pool); err != nil {
		t.Fatalf("second upsert: %v", err)
	}

	entries, err := s.GetByTeam(ctx, teamID)
	if err != nil {
		t.Fatalf("GetByTeam: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("len(entries) = %d, want 1", len(entries))
	}

	d := entries[0]
	if d.AvgDurationMs != 200 {
		t.Errorf("AvgDurationMs = %d, want 200 (rolling average of 100 and 300)", d.AvgDurationMs)
	}
	if d.MinDurationMs != 100 {
		t.Errorf("MinDurationMs = %d, want 100", d.MinDurationMs)
	}
	if d.MaxDurationMs != 300 {
		t.Errorf("MaxDurationMs = %d, want 300", d.MaxDurationMs)
	}
	if d.RunCount != 2 {
		t.Errorf("RunCount = %d, want 2", d.RunCount)
	}
	if d.LastStatus != "failed" {
		t.Errorf("LastStatus = %q, want %q", d.LastStatus, "failed")
	}
}

func TestDurationStore_UpsertFromResults_EmptySlice(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-empty")
	s := store.NewDurationStore(tdb.Pool)

	err := s.UpsertFromResults(ctx, teamID, nil, tdb.Pool)
	if err != nil {
		t.Fatalf("UpsertFromResults with nil: %v", err)
	}

	err = s.UpsertFromResults(ctx, teamID, []model.TestResult{}, tdb.Pool)
	if err != nil {
		t.Fatalf("UpsertFromResults with empty slice: %v", err)
	}
}

func TestDurationStore_UpsertFromResults_WithinTransaction(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-tx")
	s := store.NewDurationStore(tdb.Pool)

	tx, err := tdb.Pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	defer tx.Rollback(ctx)

	results := []model.TestResult{
		{Name: "TestTx", Suite: "integration", DurationMs: 500, Status: "passed", TeamID: teamID},
	}
	if err := s.UpsertFromResults(ctx, teamID, results, tx); err != nil {
		t.Fatalf("UpsertFromResults within tx: %v", err)
	}

	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit: %v", err)
	}

	entries, err := s.GetByTeam(ctx, teamID)
	if err != nil {
		t.Fatalf("GetByTeam: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("len(entries) = %d, want 1", len(entries))
	}
	if entries[0].TestName != "TestTx" {
		t.Errorf("TestName = %q, want %q", entries[0].TestName, "TestTx")
	}
	if entries[0].AvgDurationMs != 500 {
		t.Errorf("AvgDurationMs = %d, want 500", entries[0].AvgDurationMs)
	}
}

func TestDurationStore_UpsertFromResults_TransactionRollback(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-rollback")
	s := store.NewDurationStore(tdb.Pool)

	tx, err := tdb.Pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}

	results := []model.TestResult{
		{Name: "TestRollback", Suite: "unit", DurationMs: 999, Status: "failed", TeamID: teamID},
	}
	if err := s.UpsertFromResults(ctx, teamID, results, tx); err != nil {
		t.Fatalf("UpsertFromResults within tx: %v", err)
	}

	tx.Rollback(ctx)

	entries, err := s.GetByTeam(ctx, teamID)
	if err != nil {
		t.Fatalf("GetByTeam: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("len(entries) = %d, want 0 after rollback", len(entries))
	}
}

func TestDurationStore_GetByTeam_ReturnsOnlyTeamData(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamA := tdb.CreateTeam(t, "dur-team-a")
	teamB := tdb.CreateTeam(t, "dur-team-b")
	s := store.NewDurationStore(tdb.Pool)

	err := s.UpsertFromResults(ctx, teamA, []model.TestResult{
		{Name: "TestA", Suite: "unit", DurationMs: 100, Status: "passed", TeamID: teamA},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("upsert teamA: %v", err)
	}

	err = s.UpsertFromResults(ctx, teamB, []model.TestResult{
		{Name: "TestB", Suite: "unit", DurationMs: 200, Status: "passed", TeamID: teamB},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("upsert teamB: %v", err)
	}

	entriesA, err := s.GetByTeam(ctx, teamA)
	if err != nil {
		t.Fatalf("GetByTeam teamA: %v", err)
	}
	if len(entriesA) != 1 || entriesA[0].TestName != "TestA" {
		t.Errorf("teamA entries: got %v, want 1 entry with TestA", entriesA)
	}

	entriesB, err := s.GetByTeam(ctx, teamB)
	if err != nil {
		t.Fatalf("GetByTeam teamB: %v", err)
	}
	if len(entriesB) != 1 || entriesB[0].TestName != "TestB" {
		t.Errorf("teamB entries: got %v, want 1 entry with TestB", entriesB)
	}
}

func TestDurationStore_GetByTeam_Empty(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-empty-get")
	s := store.NewDurationStore(tdb.Pool)

	entries, err := s.GetByTeam(ctx, teamID)
	if err != nil {
		t.Fatalf("GetByTeam: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("len(entries) = %d, want 0 for team with no history", len(entries))
	}
}

func TestDurationStore_GetByTeamAndTest_ReturnsMatchingRows(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-bytest")
	s := store.NewDurationStore(tdb.Pool)

	err := s.UpsertFromResults(ctx, teamID, []model.TestResult{
		{Name: "TestAlpha", Suite: "unit", DurationMs: 100, Status: "passed", TeamID: teamID},
		{Name: "TestAlpha", Suite: "integration", DurationMs: 500, Status: "passed", TeamID: teamID},
		{Name: "TestBeta", Suite: "unit", DurationMs: 200, Status: "failed", TeamID: teamID},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	entries, err := s.GetByTeamAndTest(ctx, teamID, "TestAlpha")
	if err != nil {
		t.Fatalf("GetByTeamAndTest: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("len(entries) = %d, want 2 (two suites for TestAlpha)", len(entries))
	}

	for _, e := range entries {
		if e.TestName != "TestAlpha" {
			t.Errorf("TestName = %q, want %q", e.TestName, "TestAlpha")
		}
	}

	notFound, err := s.GetByTeamAndTest(ctx, teamID, "Nonexistent")
	if err != nil {
		t.Fatalf("GetByTeamAndTest nonexistent: %v", err)
	}
	if len(notFound) != 0 {
		t.Errorf("len(notFound) = %d, want 0", len(notFound))
	}
}

func TestDurationStore_GetByTeamAndTest_TeamScoped(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamA := tdb.CreateTeam(t, "dur-team-a-bytest")
	teamB := tdb.CreateTeam(t, "dur-team-b-bytest")
	s := store.NewDurationStore(tdb.Pool)

	err := s.UpsertFromResults(ctx, teamA, []model.TestResult{
		{Name: "SharedTest", Suite: "unit", DurationMs: 100, Status: "passed", TeamID: teamA},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("upsert teamA: %v", err)
	}
	err = s.UpsertFromResults(ctx, teamB, []model.TestResult{
		{Name: "SharedTest", Suite: "unit", DurationMs: 999, Status: "failed", TeamID: teamB},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("upsert teamB: %v", err)
	}

	entriesA, err := s.GetByTeamAndTest(ctx, teamA, "SharedTest")
	if err != nil {
		t.Fatalf("GetByTeamAndTest teamA: %v", err)
	}
	if len(entriesA) != 1 {
		t.Fatalf("teamA len = %d, want 1", len(entriesA))
	}
	if entriesA[0].AvgDurationMs != 100 {
		t.Errorf("teamA AvgDurationMs = %d, want 100", entriesA[0].AvgDurationMs)
	}

	entriesB, err := s.GetByTeamAndTest(ctx, teamB, "SharedTest")
	if err != nil {
		t.Fatalf("GetByTeamAndTest teamB: %v", err)
	}
	if len(entriesB) != 1 {
		t.Fatalf("teamB len = %d, want 1", len(entriesB))
	}
	if entriesB[0].AvgDurationMs != 999 {
		t.Errorf("teamB AvgDurationMs = %d, want 999", entriesB[0].AvgDurationMs)
	}
}

func TestDurationStore_GetBySuite_ReturnsOnlyMatchingSuite(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-suite")
	s := store.NewDurationStore(tdb.Pool)

	err := s.UpsertFromResults(ctx, teamID, []model.TestResult{
		{Name: "TestX", Suite: "unit", DurationMs: 100, Status: "passed", TeamID: teamID},
		{Name: "TestY", Suite: "integration", DurationMs: 500, Status: "passed", TeamID: teamID},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	entries, err := s.GetBySuite(ctx, teamID, "unit")
	if err != nil {
		t.Fatalf("GetBySuite: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("len(entries) = %d, want 1", len(entries))
	}
	if entries[0].TestName != "TestX" {
		t.Errorf("TestName = %q, want %q", entries[0].TestName, "TestX")
	}
	if entries[0].Suite != "unit" {
		t.Errorf("Suite = %q, want %q", entries[0].Suite, "unit")
	}

	none, err := s.GetBySuite(ctx, teamID, "e2e")
	if err != nil {
		t.Fatalf("GetBySuite empty: %v", err)
	}
	if len(none) != 0 {
		t.Errorf("len(none) = %d, want 0 for nonexistent suite", len(none))
	}
}

func TestDurationStore_GetByTeamMap(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-map")
	s := store.NewDurationStore(tdb.Pool)

	err := s.UpsertFromResults(ctx, teamID, []model.TestResult{
		{Name: "TestM1", Suite: "unit", DurationMs: 150, Status: "passed", TeamID: teamID},
		{Name: "TestM2", Suite: "unit", DurationMs: 250, Status: "failed", TeamID: teamID},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	m, err := s.GetByTeamMap(ctx, teamID)
	if err != nil {
		t.Fatalf("GetByTeamMap: %v", err)
	}
	if len(m) != 2 {
		t.Fatalf("len(m) = %d, want 2", len(m))
	}

	key1 := store.DurationMapKey("TestM1", "unit")
	if m[key1] == nil {
		t.Error("TestM1/unit not in map")
	} else if m[key1].AvgDurationMs != 150 {
		t.Errorf("TestM1/unit AvgDurationMs = %d, want 150", m[key1].AvgDurationMs)
	}

	key2 := store.DurationMapKey("TestM2", "unit")
	if m[key2] == nil {
		t.Error("TestM2/unit not in map")
	} else if m[key2].AvgDurationMs != 250 {
		t.Errorf("TestM2/unit AvgDurationMs = %d, want 250", m[key2].AvgDurationMs)
	}
}

func TestDurationStore_GetByTeamMap_PreservesSameNameDifferentSuites(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-map-dup")
	s := store.NewDurationStore(tdb.Pool)

	err := s.UpsertFromResults(ctx, teamID, []model.TestResult{
		{Name: "TestDup", Suite: "unit", DurationMs: 100, Status: "passed", TeamID: teamID},
		{Name: "TestDup", Suite: "integration", DurationMs: 500, Status: "passed", TeamID: teamID},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	m, err := s.GetByTeamMap(ctx, teamID)
	if err != nil {
		t.Fatalf("GetByTeamMap: %v", err)
	}
	if len(m) != 2 {
		t.Fatalf("len(m) = %d, want 2 (same test name, different suites should not collide)", len(m))
	}

	keyUnit := store.DurationMapKey("TestDup", "unit")
	keyInteg := store.DurationMapKey("TestDup", "integration")
	if m[keyUnit] == nil {
		t.Error("TestDup/unit not in map")
	} else if m[keyUnit].AvgDurationMs != 100 {
		t.Errorf("TestDup/unit AvgDurationMs = %d, want 100", m[keyUnit].AvgDurationMs)
	}
	if m[keyInteg] == nil {
		t.Error("TestDup/integration not in map")
	} else if m[keyInteg].AvgDurationMs != 500 {
		t.Errorf("TestDup/integration AvgDurationMs = %d, want 500", m[keyInteg].AvgDurationMs)
	}
}

func TestDurationStore_UpsertFromResults_ThreeRunsMinMaxAvg(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-3runs")
	s := store.NewDurationStore(tdb.Pool)

	for _, dur := range []int64{100, 300, 200} {
		err := s.UpsertFromResults(ctx, teamID, []model.TestResult{
			{Name: "TestMulti", Suite: "unit", DurationMs: dur, Status: "passed", TeamID: teamID},
		}, tdb.Pool)
		if err != nil {
			t.Fatalf("upsert dur=%d: %v", dur, err)
		}
	}

	entries, err := s.GetByTeam(ctx, teamID)
	if err != nil {
		t.Fatalf("GetByTeam: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("len(entries) = %d, want 1", len(entries))
	}

	d := entries[0]
	if d.RunCount != 3 {
		t.Errorf("RunCount = %d, want 3", d.RunCount)
	}
	if d.AvgDurationMs != 200 {
		t.Errorf("AvgDurationMs = %d, want 200 ((100+300+200)/3)", d.AvgDurationMs)
	}
	if d.MinDurationMs != 100 {
		t.Errorf("MinDurationMs = %d, want 100", d.MinDurationMs)
	}
	if d.MaxDurationMs != 300 {
		t.Errorf("MaxDurationMs = %d, want 300", d.MaxDurationMs)
	}
}

func TestDurationStore_UpsertFromResults_P95UpdatesOnConflict(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-p95")
	s := store.NewDurationStore(tdb.Pool)

	err := s.UpsertFromResults(ctx, teamID, []model.TestResult{
		{Name: "TestP95", Suite: "unit", DurationMs: 100, Status: "passed", TeamID: teamID},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("first upsert: %v", err)
	}

	entries, _ := s.GetByTeam(ctx, teamID)
	if len(entries) != 1 {
		t.Fatalf("len(entries) = %d, want 1", len(entries))
	}
	if entries[0].P95DurationMs != 100 {
		t.Errorf("initial p95 = %d, want 100 (equals duration on insert)", entries[0].P95DurationMs)
	}

	err = s.UpsertFromResults(ctx, teamID, []model.TestResult{
		{Name: "TestP95", Suite: "unit", DurationMs: 300, Status: "passed", TeamID: teamID},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("second upsert: %v", err)
	}

	entries, _ = s.GetByTeam(ctx, teamID)
	if entries[0].P95DurationMs != 300 {
		t.Errorf("p95 after conflict = %d, want 300 (GREATEST of 100 and 300)", entries[0].P95DurationMs)
	}

	err = s.UpsertFromResults(ctx, teamID, []model.TestResult{
		{Name: "TestP95", Suite: "unit", DurationMs: 200, Status: "passed", TeamID: teamID},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("third upsert: %v", err)
	}

	entries, _ = s.GetByTeam(ctx, teamID)
	if entries[0].P95DurationMs != 300 {
		t.Errorf("p95 after smaller value = %d, want 300 (GREATEST keeps max)", entries[0].P95DurationMs)
	}
}

func TestDurationStore_UpsertFromResults_SameNameDifferentSuite(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-diff-suite")
	s := store.NewDurationStore(tdb.Pool)

	err := s.UpsertFromResults(ctx, teamID, []model.TestResult{
		{Name: "TestDup", Suite: "unit", DurationMs: 100, Status: "passed", TeamID: teamID},
		{Name: "TestDup", Suite: "integration", DurationMs: 500, Status: "passed", TeamID: teamID},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	entries, err := s.GetByTeam(ctx, teamID)
	if err != nil {
		t.Fatalf("GetByTeam: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("len(entries) = %d, want 2 (same name, different suite)", len(entries))
	}

	suites := map[string]bool{}
	for _, e := range entries {
		suites[e.Suite] = true
	}
	if !suites["unit"] || !suites["integration"] {
		t.Errorf("expected both 'unit' and 'integration' suites, got %v", suites)
	}
}

func TestDurationStore_FieldsPopulated(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-fields")
	s := store.NewDurationStore(tdb.Pool)

	err := s.UpsertFromResults(ctx, teamID, []model.TestResult{
		{Name: "TestFields", Suite: "smoke", DurationMs: 42, Status: "passed", TeamID: teamID},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	entries, err := s.GetByTeam(ctx, teamID)
	if err != nil {
		t.Fatalf("GetByTeam: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("len(entries) = %d, want 1", len(entries))
	}

	d := entries[0]
	if d.ID == "" {
		t.Error("ID should not be empty")
	}
	if d.TeamID != teamID {
		t.Errorf("TeamID = %q, want %q", d.TeamID, teamID)
	}
	if d.TestName != "TestFields" {
		t.Errorf("TestName = %q, want %q", d.TestName, "TestFields")
	}
	if d.CreatedAt.IsZero() {
		t.Error("CreatedAt should not be zero")
	}
	if d.UpdatedAt.IsZero() {
		t.Error("UpdatedAt should not be zero")
	}
	if time.Since(d.CreatedAt) > 10*time.Second {
		t.Errorf("CreatedAt seems too old: %v", d.CreatedAt)
	}
}

func TestDurationStore_GetByTeamAndTest_SuiteOrdering(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "dur-team-ordering")
	s := store.NewDurationStore(tdb.Pool)

	err := s.UpsertFromResults(ctx, teamID, []model.TestResult{
		{Name: "TestOrder", Suite: "z-suite", DurationMs: 100, Status: "passed", TeamID: teamID},
		{Name: "TestOrder", Suite: "a-suite", DurationMs: 200, Status: "passed", TeamID: teamID},
		{Name: "TestOrder", Suite: "m-suite", DurationMs: 300, Status: "passed", TeamID: teamID},
	}, tdb.Pool)
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	entries, err := s.GetByTeamAndTest(ctx, teamID, "TestOrder")
	if err != nil {
		t.Fatalf("GetByTeamAndTest: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("len(entries) = %d, want 3", len(entries))
	}

	if entries[0].Suite != "a-suite" {
		t.Errorf("entries[0].Suite = %q, want %q (alphabetical)", entries[0].Suite, "a-suite")
	}
	if entries[1].Suite != "m-suite" {
		t.Errorf("entries[1].Suite = %q, want %q", entries[1].Suite, "m-suite")
	}
	if entries[2].Suite != "z-suite" {
		t.Errorf("entries[2].Suite = %q, want %q", entries[2].Suite, "z-suite")
	}
}

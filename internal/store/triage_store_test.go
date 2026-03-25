//go:build integration

package store_test

import (
	"context"
	"testing"

	"github.com/scaledtest/scaledtest/internal/integration"
	"github.com/scaledtest/scaledtest/internal/store"
)

// createTestReport inserts a minimal test_reports row and returns its ID.
func createTestReport(t *testing.T, tdb *integration.TestDB, teamID string) string {
	t.Helper()

	var id string
	err := tdb.Pool.QueryRow(context.Background(),
		`INSERT INTO test_reports (team_id, tool_name, summary, raw, created_at)
		 VALUES ($1, 'jest', '{}', '{}', now()) RETURNING id`, teamID).Scan(&id)
	if err != nil {
		t.Fatalf("create test report: %v", err)
	}
	return id
}

// createTestResult inserts a minimal test_results row and returns its ID.
func createTestResult(t *testing.T, tdb *integration.TestDB, reportID, teamID string) string {
	t.Helper()

	var id string
	err := tdb.Pool.QueryRow(context.Background(),
		`INSERT INTO test_results (report_id, team_id, name, status, duration_ms)
		 VALUES ($1, $2, 'SomeTest/fails_on_save', 'failed', 120) RETURNING id`,
		reportID, teamID).Scan(&id)
	if err != nil {
		t.Fatalf("create test result: %v", err)
	}
	return id
}

func TestTriageStore_Create_ReturnsPendingTriage(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "triage-create-team")
	reportID := createTestReport(t, tdb, teamID)
	s := store.NewTriageStore(tdb.Pool)

	triage, err := s.Create(ctx, teamID, reportID)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if triage.ID == "" {
		t.Fatal("Create returned empty ID")
	}
	if triage.Status != "pending" {
		t.Errorf("Status = %q, want %q", triage.Status, "pending")
	}
	if triage.TeamID != teamID {
		t.Errorf("TeamID = %q, want %q", triage.TeamID, teamID)
	}
	if triage.ReportID != reportID {
		t.Errorf("ReportID = %q, want %q", triage.ReportID, reportID)
	}
	if triage.InputTokens != 0 || triage.OutputTokens != 0 || triage.CostUSD != 0 {
		t.Error("expected zero token counts and cost on creation")
	}
}

func TestTriageStore_Create_PreventsDuplicatePerReport(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "triage-dup-team")
	reportID := createTestReport(t, tdb, teamID)
	s := store.NewTriageStore(tdb.Pool)

	if _, err := s.Create(ctx, teamID, reportID); err != nil {
		t.Fatalf("first Create: %v", err)
	}
	if _, err := s.Create(ctx, teamID, reportID); err == nil {
		t.Error("expected error on duplicate triage for same report, got nil")
	}
}

func TestTriageStore_Get_ReturnsByID(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "triage-get-team")
	reportID := createTestReport(t, tdb, teamID)
	s := store.NewTriageStore(tdb.Pool)

	created, err := s.Create(ctx, teamID, reportID)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := s.Get(ctx, teamID, created.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("Get ID = %q, want %q", got.ID, created.ID)
	}
	if got.ReportID != reportID {
		t.Errorf("Get ReportID = %q, want %q", got.ReportID, reportID)
	}
}

func TestTriageStore_Get_TeamIsolation(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamA := tdb.CreateTeam(t, "triage-iso-team-a")
	teamB := tdb.CreateTeam(t, "triage-iso-team-b")
	reportA := createTestReport(t, tdb, teamA)
	s := store.NewTriageStore(tdb.Pool)

	triage, err := s.Create(ctx, teamA, reportA)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Team B cannot see team A's triage
	_, err = s.Get(ctx, teamB, triage.ID)
	if err == nil {
		t.Error("expected error when team B queries team A triage, got nil")
	}
}

func TestTriageStore_GetByReportID_ReturnsCorrectTriage(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "triage-byreport-team")
	reportID := createTestReport(t, tdb, teamID)
	s := store.NewTriageStore(tdb.Pool)

	created, err := s.Create(ctx, teamID, reportID)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := s.GetByReportID(ctx, teamID, reportID)
	if err != nil {
		t.Fatalf("GetByReportID: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("GetByReportID ID = %q, want %q", got.ID, created.ID)
	}
}

func TestTriageStore_GetByReportID_TeamIsolation(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamA := tdb.CreateTeam(t, "triage-byreport-iso-a")
	teamB := tdb.CreateTeam(t, "triage-byreport-iso-b")
	reportA := createTestReport(t, tdb, teamA)
	s := store.NewTriageStore(tdb.Pool)

	if _, err := s.Create(ctx, teamA, reportA); err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Team B cannot see team A's triage by report ID
	_, err := s.GetByReportID(ctx, teamB, reportA)
	if err == nil {
		t.Error("expected error when team B queries team A triage by report ID, got nil")
	}
}

func TestTriageStore_Complete_SetsStatusAndMetadata(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "triage-complete-team")
	reportID := createTestReport(t, tdb, teamID)
	s := store.NewTriageStore(tdb.Pool)

	triage, err := s.Create(ctx, teamID, reportID)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	updated, err := s.Complete(ctx, teamID, triage.ID, "3 failures: 1 new regression, 2 flaky tests", "anthropic", "claude-sonnet-4-6", 1500, 800, 0.002340)
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}
	if updated.Status != "complete" {
		t.Errorf("Status = %q, want %q", updated.Status, "complete")
	}
	if updated.Summary == nil || *updated.Summary != "3 failures: 1 new regression, 2 flaky tests" {
		t.Errorf("Summary = %v, want non-nil with correct text", updated.Summary)
	}
	if updated.LLMProvider == nil || *updated.LLMProvider != "anthropic" {
		t.Errorf("LLMProvider = %v, want %q", updated.LLMProvider, "anthropic")
	}
	if updated.LLMModel == nil || *updated.LLMModel != "claude-sonnet-4-6" {
		t.Errorf("LLMModel = %v, want %q", updated.LLMModel, "claude-sonnet-4-6")
	}
	if updated.InputTokens != 1500 {
		t.Errorf("InputTokens = %d, want 1500", updated.InputTokens)
	}
	if updated.OutputTokens != 800 {
		t.Errorf("OutputTokens = %d, want 800", updated.OutputTokens)
	}
	if updated.CostUSD != 0.002340 {
		t.Errorf("CostUSD = %f, want 0.002340", updated.CostUSD)
	}
}

func TestTriageStore_Fail_SetsStatusAndErrorMsg(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "triage-fail-team")
	reportID := createTestReport(t, tdb, teamID)
	s := store.NewTriageStore(tdb.Pool)

	triage, err := s.Create(ctx, teamID, reportID)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	updated, err := s.Fail(ctx, teamID, triage.ID, "LLM API rate limit exceeded")
	if err != nil {
		t.Fatalf("Fail: %v", err)
	}
	if updated.Status != "failed" {
		t.Errorf("Status = %q, want %q", updated.Status, "failed")
	}
	if updated.ErrorMsg == nil || *updated.ErrorMsg != "LLM API rate limit exceeded" {
		t.Errorf("ErrorMsg = %v, want non-nil with correct text", updated.ErrorMsg)
	}
}

func TestTriageStore_CreateCluster_StoresRootCause(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "triage-cluster-team")
	reportID := createTestReport(t, tdb, teamID)
	s := store.NewTriageStore(tdb.Pool)

	triage, err := s.Create(ctx, teamID, reportID)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	label := "DB connection failure"
	cluster, err := s.CreateCluster(ctx, triage.ID, teamID, "Database connection pool exhausted under load", &label)
	if err != nil {
		t.Fatalf("CreateCluster: %v", err)
	}
	if cluster.ID == "" {
		t.Fatal("CreateCluster returned empty ID")
	}
	if cluster.TriageID != triage.ID {
		t.Errorf("TriageID = %q, want %q", cluster.TriageID, triage.ID)
	}
	if cluster.RootCause != "Database connection pool exhausted under load" {
		t.Errorf("RootCause = %q, want correct text", cluster.RootCause)
	}
	if cluster.Label == nil || *cluster.Label != "DB connection failure" {
		t.Errorf("Label = %v, want non-nil %q", cluster.Label, label)
	}
}

func TestTriageStore_CreateCluster_NilLabel(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "triage-cluster-nolabel-team")
	reportID := createTestReport(t, tdb, teamID)
	s := store.NewTriageStore(tdb.Pool)

	triage, _ := s.Create(ctx, teamID, reportID)

	cluster, err := s.CreateCluster(ctx, triage.ID, teamID, "Flaky timeout in network tests", nil)
	if err != nil {
		t.Fatalf("CreateCluster with nil label: %v", err)
	}
	if cluster.Label != nil {
		t.Errorf("Label = %v, want nil", cluster.Label)
	}
}

func TestTriageStore_ListClusters_ReturnsClustersForTriage(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "triage-listclusters-team")
	reportA := createTestReport(t, tdb, teamID)
	reportB := createTestReport(t, tdb, teamID)
	s := store.NewTriageStore(tdb.Pool)

	triageA, _ := s.Create(ctx, teamID, reportA)
	triageB, _ := s.Create(ctx, teamID, reportB)

	s.CreateCluster(ctx, triageA.ID, teamID, "Root cause 1", nil)
	s.CreateCluster(ctx, triageA.ID, teamID, "Root cause 2", nil)
	s.CreateCluster(ctx, triageB.ID, teamID, "Root cause 3", nil)

	clusters, err := s.ListClusters(ctx, teamID, triageA.ID)
	if err != nil {
		t.Fatalf("ListClusters: %v", err)
	}
	if len(clusters) != 2 {
		t.Errorf("ListClusters returned %d, want 2", len(clusters))
	}

	// Other triage's clusters are not returned
	otherClusters, err := s.ListClusters(ctx, teamID, triageB.ID)
	if err != nil {
		t.Fatalf("ListClusters other triage: %v", err)
	}
	if len(otherClusters) != 1 {
		t.Errorf("ListClusters other triage returned %d, want 1", len(otherClusters))
	}
}

func TestTriageStore_CreateClassification_StoresClassification(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "triage-cls-team")
	reportID := createTestReport(t, tdb, teamID)
	testResultID := createTestResult(t, tdb, reportID, teamID)
	s := store.NewTriageStore(tdb.Pool)

	triage, _ := s.Create(ctx, teamID, reportID)
	cluster, _ := s.CreateCluster(ctx, triage.ID, teamID, "NullPointerException in auth handler", nil)

	cls, err := s.CreateClassification(ctx, triage.ID, &cluster.ID, testResultID, teamID, "regression")
	if err != nil {
		t.Fatalf("CreateClassification: %v", err)
	}
	if cls.ID == "" {
		t.Fatal("CreateClassification returned empty ID")
	}
	if cls.TriageID != triage.ID {
		t.Errorf("TriageID = %q, want %q", cls.TriageID, triage.ID)
	}
	if cls.ClusterID == nil || *cls.ClusterID != cluster.ID {
		t.Errorf("ClusterID = %v, want %q", cls.ClusterID, cluster.ID)
	}
	if cls.TestResultID != testResultID {
		t.Errorf("TestResultID = %q, want %q", cls.TestResultID, testResultID)
	}
	if cls.Classification != "regression" {
		t.Errorf("Classification = %q, want %q", cls.Classification, "regression")
	}
}

func TestTriageStore_CreateClassification_NilCluster(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "triage-cls-nocluster-team")
	reportID := createTestReport(t, tdb, teamID)
	testResultID := createTestResult(t, tdb, reportID, teamID)
	s := store.NewTriageStore(tdb.Pool)

	triage, _ := s.Create(ctx, teamID, reportID)

	cls, err := s.CreateClassification(ctx, triage.ID, nil, testResultID, teamID, "flaky")
	if err != nil {
		t.Fatalf("CreateClassification with nil cluster: %v", err)
	}
	if cls.ClusterID != nil {
		t.Errorf("ClusterID = %v, want nil", cls.ClusterID)
	}
	if cls.Classification != "flaky" {
		t.Errorf("Classification = %q, want %q", cls.Classification, "flaky")
	}
}

func TestTriageStore_CreateClassification_UniquePerTriageAndTestResult(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "triage-cls-unique-team")
	reportID := createTestReport(t, tdb, teamID)
	testResultID := createTestResult(t, tdb, reportID, teamID)
	s := store.NewTriageStore(tdb.Pool)

	triage, _ := s.Create(ctx, teamID, reportID)
	s.CreateClassification(ctx, triage.ID, nil, testResultID, teamID, "new")

	// Second classification for the same triage+test_result must fail
	_, err := s.CreateClassification(ctx, triage.ID, nil, testResultID, teamID, "flaky")
	if err == nil {
		t.Error("expected error on duplicate triage+test_result classification, got nil")
	}
}

func TestTriageStore_ListClassifications_ReturnsAllForTriage(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "triage-listcls-team")
	reportID := createTestReport(t, tdb, teamID)
	resultID1 := createTestResult(t, tdb, reportID, teamID)
	resultID2 := createTestResult(t, tdb, reportID, teamID)
	s := store.NewTriageStore(tdb.Pool)

	triage, _ := s.Create(ctx, teamID, reportID)
	s.CreateClassification(ctx, triage.ID, nil, resultID1, teamID, "new")
	s.CreateClassification(ctx, triage.ID, nil, resultID2, teamID, "flaky")

	clsList, err := s.ListClassifications(ctx, teamID, triage.ID)
	if err != nil {
		t.Fatalf("ListClassifications: %v", err)
	}
	if len(clsList) != 2 {
		t.Errorf("ListClassifications returned %d, want 2", len(clsList))
	}
}

func TestTriageStore_Complete_TeamIsolation(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamA := tdb.CreateTeam(t, "triage-complete-iso-a")
	teamB := tdb.CreateTeam(t, "triage-complete-iso-b")
	reportA := createTestReport(t, tdb, teamA)
	s := store.NewTriageStore(tdb.Pool)

	triage, err := s.Create(ctx, teamA, reportA)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Team B cannot complete team A's triage
	_, err = s.Complete(ctx, teamB, triage.ID, "summary", "anthropic", "claude-sonnet-4-6", 100, 50, 0.001)
	if err == nil {
		t.Error("expected error when team B completes team A triage, got nil")
	}
}

func TestTriageStore_Fail_TeamIsolation(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamA := tdb.CreateTeam(t, "triage-fail-iso-a")
	teamB := tdb.CreateTeam(t, "triage-fail-iso-b")
	reportA := createTestReport(t, tdb, teamA)
	s := store.NewTriageStore(tdb.Pool)

	triage, err := s.Create(ctx, teamA, reportA)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Team B cannot fail team A's triage
	_, err = s.Fail(ctx, teamB, triage.ID, "some error")
	if err == nil {
		t.Error("expected error when team B fails team A triage, got nil")
	}
}

func TestTriageStore_ListClusters_TeamIsolation(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamA := tdb.CreateTeam(t, "triage-listclusters-iso-a")
	teamB := tdb.CreateTeam(t, "triage-listclusters-iso-b")
	reportA := createTestReport(t, tdb, teamA)
	s := store.NewTriageStore(tdb.Pool)

	triageA, err := s.Create(ctx, teamA, reportA)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	s.CreateCluster(ctx, triageA.ID, teamA, "Root cause A", nil)

	// Team B querying team A's triage clusters sees nothing
	clusters, err := s.ListClusters(ctx, teamB, triageA.ID)
	if err != nil {
		t.Fatalf("ListClusters with wrong team: %v", err)
	}
	if len(clusters) != 0 {
		t.Errorf("ListClusters with wrong team returned %d clusters, want 0", len(clusters))
	}
}

func TestTriageStore_ListClassifications_TeamIsolation(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamA := tdb.CreateTeam(t, "triage-listcls-iso-a")
	teamB := tdb.CreateTeam(t, "triage-listcls-iso-b")
	reportA := createTestReport(t, tdb, teamA)
	resultA := createTestResult(t, tdb, reportA, teamA)
	s := store.NewTriageStore(tdb.Pool)

	triageA, err := s.Create(ctx, teamA, reportA)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	s.CreateClassification(ctx, triageA.ID, nil, resultA, teamA, "flaky")

	// Team B querying team A's triage classifications sees nothing
	clsList, err := s.ListClassifications(ctx, teamB, triageA.ID)
	if err != nil {
		t.Fatalf("ListClassifications with wrong team: %v", err)
	}
	if len(clsList) != 0 {
		t.Errorf("ListClassifications with wrong team returned %d, want 0", len(clsList))
	}
}

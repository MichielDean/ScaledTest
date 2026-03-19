//go:build integration

package store_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/scaledtest/scaledtest/internal/integration"
	"github.com/scaledtest/scaledtest/internal/store"
)

func TestQualityGateStore_CreateAndGet(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "qg-test-team")
	s := store.NewQualityGateStore(tdb.Pool)

	rules := json.RawMessage(`[{"metric":"pass_rate","operator":"gte","threshold":90}]`)
	gate, err := s.Create(ctx, teamID, "Min Pass Rate", "Require 90% pass rate", rules)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if gate.ID == "" {
		t.Fatal("Create returned empty ID")
	}
	if gate.Name != "Min Pass Rate" {
		t.Errorf("Name = %q, want %q", gate.Name, "Min Pass Rate")
	}
	if !gate.Enabled {
		t.Error("expected new gate to be enabled by default")
	}

	got, err := s.Get(ctx, teamID, gate.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ID != gate.ID {
		t.Errorf("Get ID = %q, want %q", got.ID, gate.ID)
	}
	if got.Description != "Require 90% pass rate" {
		t.Errorf("Description = %q, want %q", got.Description, "Require 90% pass rate")
	}
}

func TestQualityGateStore_List(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "qg-list-team")
	otherTeamID := tdb.CreateTeam(t, "qg-other-team")
	s := store.NewQualityGateStore(tdb.Pool)

	rules := json.RawMessage(`[{"metric":"pass_rate","operator":"gte","threshold":80}]`)
	s.Create(ctx, teamID, "Gate A", "", rules)
	s.Create(ctx, teamID, "Gate B", "", rules)
	s.Create(ctx, otherTeamID, "Gate C", "", rules)

	list, err := s.List(ctx, teamID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("List returned %d gates, want 2", len(list))
	}

	// Team isolation
	otherList, err := s.List(ctx, otherTeamID)
	if err != nil {
		t.Fatalf("List other team: %v", err)
	}
	if len(otherList) != 1 {
		t.Errorf("other team List returned %d, want 1", len(otherList))
	}
}

func TestQualityGateStore_Update(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "qg-update-team")
	s := store.NewQualityGateStore(tdb.Pool)

	rules := json.RawMessage(`[{"metric":"pass_rate","operator":"gte","threshold":80}]`)
	gate, _ := s.Create(ctx, teamID, "Old Name", "old desc", rules)

	newRules := json.RawMessage(`[{"metric":"pass_rate","operator":"gte","threshold":95}]`)
	updated, err := s.Update(ctx, teamID, gate.ID, "New Name", "new desc", newRules, false)
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Name != "New Name" {
		t.Errorf("Name = %q, want %q", updated.Name, "New Name")
	}
	if updated.Enabled {
		t.Error("expected gate to be disabled after update")
	}
}

func TestQualityGateStore_Delete(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "qg-delete-team")
	s := store.NewQualityGateStore(tdb.Pool)

	rules := json.RawMessage(`[{"metric":"pass_rate","operator":"gte","threshold":80}]`)
	gate, _ := s.Create(ctx, teamID, "Delete Me", "", rules)

	if err := s.Delete(ctx, teamID, gate.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	_, err := s.Get(ctx, teamID, gate.ID)
	if err == nil {
		t.Error("expected error after delete, got nil")
	}

	// Delete non-existent
	err = s.Delete(ctx, teamID, "non-existent-id")
	if err == nil {
		t.Error("expected error deleting non-existent gate")
	}
}

func TestQualityGateStore_CreateEvaluation(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "qg-eval-team")
	s := store.NewQualityGateStore(tdb.Pool)

	rules := json.RawMessage(`[{"metric":"pass_rate","operator":"gte","threshold":80}]`)
	gate, _ := s.Create(ctx, teamID, "Eval Gate", "", rules)

	// Create a test report for the evaluation FK
	var reportID string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw, created_at)
		 VALUES ($1, 'jest', '{}', '{}', now()) RETURNING id`, teamID).Scan(&reportID)
	if err != nil {
		t.Fatalf("create test report: %v", err)
	}

	details := json.RawMessage(`{"rules":[{"metric":"pass_rate","result":"passed"}]}`)
	eval, err := s.CreateEvaluation(ctx, gate.ID, reportID, true, details)
	if err != nil {
		t.Fatalf("CreateEvaluation: %v", err)
	}
	if eval.ID == "" {
		t.Fatal("CreateEvaluation returned empty ID")
	}
	if !eval.Passed {
		t.Error("expected evaluation to pass")
	}
	if eval.GateID != gate.ID {
		t.Errorf("GateID = %q, want %q", eval.GateID, gate.ID)
	}

	// List evaluations
	evals, err := s.ListEvaluations(ctx, gate.ID, 10)
	if err != nil {
		t.Fatalf("ListEvaluations: %v", err)
	}
	if len(evals) != 1 {
		t.Errorf("ListEvaluations returned %d, want 1", len(evals))
	}
}

func TestQualityGateStore_ListEnabled(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "qg-enabled-team")
	s := store.NewQualityGateStore(tdb.Pool)

	rules := json.RawMessage(`[{"metric":"pass_rate","operator":"gte","threshold":80}]`)
	s.Create(ctx, teamID, "Enabled Gate", "", rules)
	gate2, _ := s.Create(ctx, teamID, "Will Disable", "", rules)
	s.Update(ctx, teamID, gate2.ID, gate2.Name, "", rules, false)

	enabled, err := s.ListEnabled(ctx, teamID)
	if err != nil {
		t.Fatalf("ListEnabled: %v", err)
	}
	if len(enabled) != 1 {
		t.Errorf("ListEnabled returned %d, want 1", len(enabled))
	}
}

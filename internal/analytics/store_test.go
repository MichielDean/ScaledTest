package analytics

import (
	"testing"
)

func TestNewStore_NilPool(t *testing.T) {
	s := NewStore(nil)
	if s == nil {
		t.Fatal("expected non-nil store")
	}
	if s.pool != nil {
		t.Fatal("expected nil pool")
	}
}

func TestHealthScore_NilPool(t *testing.T) {
	s := NewStore(nil)
	hs, err := s.GetHealthScore(nil, "", 7)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if hs.Score != 0 {
		t.Errorf("expected score 0, got %f", hs.Score)
	}
	if hs.Trend != "stable" {
		t.Errorf("expected trend stable, got %s", hs.Trend)
	}
}

func TestGetTrends_NilPool(t *testing.T) {
	s := NewStore(nil)
	trends, err := s.GetTrends(nil, TrendQuery{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(trends) != 0 {
		t.Errorf("expected empty trends, got %d", len(trends))
	}
}

func TestGetFlakyTests_NilPool(t *testing.T) {
	s := NewStore(nil)
	tests, err := s.GetFlakyTests(nil, FlakyQuery{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tests) != 0 {
		t.Errorf("expected empty flaky tests, got %d", len(tests))
	}
}

func TestGetErrorAnalysis_NilPool(t *testing.T) {
	s := NewStore(nil)
	clusters, err := s.GetErrorAnalysis(nil, "", 30, 20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(clusters) != 0 {
		t.Errorf("expected empty clusters, got %d", len(clusters))
	}
}

func TestGetDurationDistribution_NilPool(t *testing.T) {
	s := NewStore(nil)
	stats, err := s.GetDurationDistribution(nil, "", 30)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if stats == nil {
		t.Fatal("expected non-nil stats")
	}
	if len(stats.Distribution) != 7 {
		t.Errorf("expected 7 default buckets, got %d", len(stats.Distribution))
	}
}

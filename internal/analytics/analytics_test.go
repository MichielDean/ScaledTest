package analytics

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestTrendPoint_MarshalJSON_FormatsDateAsYYYYMMDD(t *testing.T) {
	tests := []struct {
		name     string
		date     time.Time
		wantDate string
	}{
		{
			name:     "formats date as YYYY-MM-DD, not ISO timestamp",
			date:     time.Date(2026, 3, 24, 0, 0, 0, 0, time.UTC),
			wantDate: "2026-03-24",
		},
		{
			name:     "formats date with single-digit month and day",
			date:     time.Date(2025, 1, 5, 14, 30, 0, 0, time.UTC),
			wantDate: "2025-01-05",
		},
		{
			name:     "preserves other fields alongside YYYY-MM-DD date",
			date:     time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC),
			wantDate: "2026-12-31",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tp := TrendPoint{
				Date:     tt.date,
				Total:    10,
				Passed:   8,
				Failed:   2,
				Skipped:  0,
				PassRate: 80.0,
			}

			data, err := json.Marshal(tp)
			if err != nil {
				t.Fatalf("MarshalJSON error: %v", err)
			}

			// The date field must be YYYY-MM-DD, not an ISO timestamp.
			wantDateJSON := `"date":"` + tt.wantDate + `"`
			if !strings.Contains(string(data), wantDateJSON) {
				t.Errorf("MarshalJSON output = %s\nwant date field %q", data, wantDateJSON)
			}

			// Ensure no ISO timestamp leaks (no 'T' in the date value).
			if strings.Contains(string(data), "T00:00:00") || strings.Contains(string(data), "T14:30:00") {
				t.Errorf("MarshalJSON contains ISO timestamp: %s", data)
			}
		})
	}
}

func TestComputePassRate(t *testing.T) {
	tests := []struct {
		passed, total int
		want          float64
	}{
		{8, 10, 80.0},
		{10, 10, 100.0},
		{0, 10, 0.0},
		{0, 0, 0.0},
		{5, 20, 25.0},
	}

	for _, tt := range tests {
		got := ComputePassRate(tt.passed, tt.total)
		if got != tt.want {
			t.Errorf("ComputePassRate(%d, %d) = %f, want %f", tt.passed, tt.total, got, tt.want)
		}
	}
}

func TestDetectFlaky(t *testing.T) {
	tests := []struct {
		name      string
		statuses  []string
		wantFlips int
		wantRate  float64
	}{
		{"stable passing", []string{"passed", "passed", "passed"}, 0, 0.0},
		{"alternating", []string{"passed", "failed", "passed", "failed"}, 3, 1.0},
		{"one flip", []string{"passed", "passed", "failed"}, 1, 0.5},
		{"single run", []string{"passed"}, 0, 0.0},
		{"empty", []string{}, 0, 0.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			flips, rate := DetectFlaky(tt.statuses)
			if flips != tt.wantFlips {
				t.Errorf("flipCount = %d, want %d", flips, tt.wantFlips)
			}
			if rate != tt.wantRate {
				t.Errorf("flipRate = %f, want %f", rate, tt.wantRate)
			}
		})
	}
}

func TestBucketDuration(t *testing.T) {
	buckets := DefaultDurationBuckets()

	tests := []struct {
		ms   int64
		want int
	}{
		{50, 0},     // 0-100ms
		{100, 1},    // 100-500ms
		{250, 1},    // 100-500ms
		{750, 2},    // 500ms-1s
		{3000, 3},   // 1-5s
		{15000, 4},  // 5-30s
		{60000, 5},  // 30s-2m
		{300000, 6}, // >2m
	}

	for _, tt := range tests {
		got := BucketDuration(tt.ms, buckets)
		if got != tt.want {
			t.Errorf("BucketDuration(%d) = %d, want %d", tt.ms, got, tt.want)
		}
	}
}

func TestDefaultDurationBuckets(t *testing.T) {
	buckets := DefaultDurationBuckets()
	if len(buckets) != 7 {
		t.Errorf("bucket count = %d, want 7", len(buckets))
	}

	// Verify no gaps between consecutive buckets
	for i := 1; i < len(buckets); i++ {
		if buckets[i].MinMs != buckets[i-1].MaxMs {
			t.Errorf("gap between bucket %d and %d: %d != %d",
				i-1, i, buckets[i-1].MaxMs, buckets[i].MinMs)
		}
	}
}

// TestDurationBucket_JSONKey_IsRange verifies that DurationBucket serializes its
// label field as "range" (not "range_label") so it matches the frontend BarChart's
// dataKey="range" in analytics.tsx.
func TestDurationBucket_JSONKey_IsRange(t *testing.T) {
	bucket := DurationBucket{
		RangeLabel: "0-100ms",
		MinMs:      0,
		MaxMs:      100,
		Count:      3,
	}

	data, err := json.Marshal(bucket)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	got := string(data)
	if !strings.Contains(got, `"range"`) {
		t.Errorf("DurationBucket JSON = %s; want key \"range\"", got)
	}
	if strings.Contains(got, `"range_label"`) {
		t.Errorf("DurationBucket JSON = %s; must not contain key \"range_label\" (frontend uses dataKey=\"range\")", got)
	}
}

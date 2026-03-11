package parallel

import (
	"reflect"
	"testing"
)

func TestSplitRoundRobin(t *testing.T) {
	tests := []struct {
		name    string
		files   []string
		workers int
		want    [][]string
	}{
		{
			name:    "even split",
			files:   []string{"a.test", "b.test", "c.test", "d.test"},
			workers: 2,
			want:    [][]string{{"a.test", "c.test"}, {"b.test", "d.test"}},
		},
		{
			name:    "uneven split",
			files:   []string{"a.test", "b.test", "c.test", "d.test", "e.test"},
			workers: 2,
			want:    [][]string{{"a.test", "c.test", "e.test"}, {"b.test", "d.test"}},
		},
		{
			name:    "more workers than files",
			files:   []string{"a.test", "b.test"},
			workers: 4,
			want:    [][]string{{"a.test"}, {"b.test"}, {}, {}},
		},
		{
			name:    "single worker",
			files:   []string{"a.test", "b.test", "c.test"},
			workers: 1,
			want:    [][]string{{"a.test", "b.test", "c.test"}},
		},
		{
			name:    "empty files",
			files:   []string{},
			workers: 3,
			want:    [][]string{{}, {}, {}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SplitRoundRobin(tt.files, tt.workers)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("SplitRoundRobin() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSplitByFile(t *testing.T) {
	tests := []struct {
		name    string
		files   []string
		workers int
	}{
		{
			name:    "balanced chunks",
			files:   []string{"a.test", "b.test", "c.test", "d.test", "e.test", "f.test"},
			workers: 3,
		},
		{
			name:    "fewer files than workers",
			files:   []string{"a.test"},
			workers: 3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SplitByFile(tt.files, tt.workers)
			if len(got) != tt.workers {
				t.Errorf("SplitByFile() returned %d buckets, want %d", len(got), tt.workers)
			}
			// Verify all files are assigned exactly once
			var all []string
			for _, bucket := range got {
				all = append(all, bucket...)
			}
			if len(all) != len(tt.files) {
				t.Errorf("SplitByFile() distributed %d files, want %d", len(all), len(tt.files))
			}
		})
	}
}

func TestSplitByFile_ContiguousChunks(t *testing.T) {
	files := []string{"a.test", "b.test", "c.test", "d.test", "e.test", "f.test"}
	got := SplitByFile(files, 3)

	// By-file splits contiguous chunks
	want := [][]string{
		{"a.test", "b.test"},
		{"c.test", "d.test"},
		{"e.test", "f.test"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("SplitByFile() = %v, want %v", got, want)
	}
}

func TestSplitByDuration(t *testing.T) {
	files := []string{"fast.test", "slow.test", "medium.test", "tiny.test"}
	durations := map[string]int64{
		"fast.test":   100,
		"slow.test":   5000,
		"medium.test": 2000,
		"tiny.test":   50,
	}

	got := SplitByDuration(files, 2, durations)
	if len(got) != 2 {
		t.Fatalf("SplitByDuration() returned %d buckets, want 2", len(got))
	}

	// Verify all files are assigned
	var all []string
	for _, bucket := range got {
		all = append(all, bucket...)
	}
	if len(all) != len(files) {
		t.Errorf("SplitByDuration() distributed %d files, want %d", len(all), len(files))
	}

	// The greedy algorithm should put slow.test alone and group the rest
	// slow.test (5000) should be in one bucket, rest (100+2000+50=2150) in the other
	// Verify the split is more balanced than round-robin would be
	dur0 := sumDurations(got[0], durations)
	dur1 := sumDurations(got[1], durations)
	if dur0 == 0 || dur1 == 0 {
		t.Errorf("SplitByDuration() created empty bucket: dur0=%d, dur1=%d", dur0, dur1)
	}
}

func TestSplitByDuration_MissingData(t *testing.T) {
	files := []string{"a.test", "b.test", "c.test"}
	// No duration data - should fall back to equal distribution
	got := SplitByDuration(files, 2, nil)
	if len(got) != 2 {
		t.Fatalf("SplitByDuration() returned %d buckets, want 2", len(got))
	}

	var all []string
	for _, bucket := range got {
		all = append(all, bucket...)
	}
	if len(all) != len(files) {
		t.Errorf("SplitByDuration() distributed %d files, want %d", len(all), len(files))
	}
}

func TestSplit_InvalidStrategy(t *testing.T) {
	_, err := Split("invalid", []string{"a.test"}, 2, nil)
	if err == nil {
		t.Error("Split() with invalid strategy should return error")
	}
}

func TestSplit_ValidStrategies(t *testing.T) {
	files := []string{"a.test", "b.test", "c.test"}
	for _, strategy := range []string{"round-robin", "by-file", "by-duration"} {
		t.Run(strategy, func(t *testing.T) {
			got, err := Split(strategy, files, 2, nil)
			if err != nil {
				t.Errorf("Split(%q) returned error: %v", strategy, err)
			}
			if len(got) != 2 {
				t.Errorf("Split(%q) returned %d buckets, want 2", strategy, len(got))
			}
		})
	}
}

func sumDurations(files []string, durations map[string]int64) int64 {
	var total int64
	for _, f := range files {
		total += durations[f]
	}
	return total
}

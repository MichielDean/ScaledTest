package parallel

import (
	"fmt"
	"sort"
)

// Split distributes test files across workers using the given strategy.
func Split(strategy string, files []string, workers int, durationData map[string]int64) ([][]string, error) {
	switch strategy {
	case "round-robin":
		return SplitRoundRobin(files, workers), nil
	case "by-file":
		return SplitByFile(files, workers), nil
	case "by-duration":
		return SplitByDuration(files, workers, durationData), nil
	default:
		return nil, fmt.Errorf("unknown split strategy: %q", strategy)
	}
}

// SplitRoundRobin distributes files across workers in round-robin order.
// File i goes to worker i%workers. Simple and deterministic.
func SplitRoundRobin(files []string, workers int) [][]string {
	buckets := make([][]string, workers)
	for i := range buckets {
		buckets[i] = []string{}
	}
	for i, f := range files {
		buckets[i%workers] = append(buckets[i%workers], f)
	}
	return buckets
}

// SplitByFile distributes files in contiguous chunks across workers.
// Each worker gets a roughly equal-sized sequential slice of the file list.
func SplitByFile(files []string, workers int) [][]string {
	buckets := make([][]string, workers)
	for i := range buckets {
		buckets[i] = []string{}
	}

	n := len(files)
	if n == 0 {
		return buckets
	}

	base := n / workers
	remainder := n % workers
	offset := 0

	for i := 0; i < workers; i++ {
		size := base
		if i < remainder {
			size++
		}
		if offset+size <= n {
			buckets[i] = files[offset : offset+size]
		}
		offset += size
	}

	return buckets
}

// SplitByDuration distributes files to balance total estimated duration per worker.
// Uses a greedy algorithm: sort files by duration descending, assign each to the
// worker with the lowest current total. Falls back to round-robin if no duration
// data is available.
func SplitByDuration(files []string, workers int, durationData map[string]int64) [][]string {
	if len(durationData) == 0 {
		return SplitRoundRobin(files, workers)
	}

	// Sort files by duration descending (longest first for better greedy balancing)
	type fileDur struct {
		name string
		dur  int64
	}

	sorted := make([]fileDur, len(files))
	for i, f := range files {
		d := durationData[f]
		if d == 0 {
			d = 1000 // Default 1s for unknown files
		}
		sorted[i] = fileDur{name: f, dur: d}
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].dur > sorted[j].dur
	})

	buckets := make([][]string, workers)
	totals := make([]int64, workers)
	for i := range buckets {
		buckets[i] = []string{}
	}

	// Greedy assignment: always assign to the worker with lowest total
	for _, fd := range sorted {
		minIdx := 0
		for i := 1; i < workers; i++ {
			if totals[i] < totals[minIdx] {
				minIdx = i
			}
		}
		buckets[minIdx] = append(buckets[minIdx], fd.name)
		totals[minIdx] += fd.dur
	}

	return buckets
}

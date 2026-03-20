package main

import (
	"os"
	"testing"
)

func TestLoadSummary_MissingFile_ReturnsZeroSummary(t *testing.T) {
	summary, err := loadSummary("/nonexistent/ci-notify-test-file.json")
	if err != nil {
		t.Fatalf("expected no error for missing file, got: %v", err)
	}
	if summary.Passed != 0 || summary.Failed != 0 || summary.Skipped != 0 {
		t.Errorf("expected zero summary for missing file, got: %+v", summary)
	}
}

func TestLoadSummary_ValidFile_ReturnsCounts(t *testing.T) {
	data := `{"Action":"pass","Test":"TestFoo"}` + "\n" +
		`{"Action":"fail","Test":"TestBar"}` + "\n"

	f, err := os.CreateTemp("", "ci-notify-results*.json")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())
	if _, err := f.WriteString(data); err != nil {
		t.Fatal(err)
	}
	f.Close()

	summary, err := loadSummary(f.Name())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if summary.Passed != 1 || summary.Failed != 1 {
		t.Errorf("expected 1 passed 1 failed; got: %+v", summary)
	}
}

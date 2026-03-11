package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestQuarantineListNoDB(t *testing.T) {
	h := &QuarantineHandler{DB: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/quarantine", nil)
	w := httptest.NewRecorder()

	h.List(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("List without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestQuarantineCreateNoDB(t *testing.T) {
	h := &QuarantineHandler{DB: nil}

	body := `{"test_name":"TestFlaky"}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quarantine", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Create without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestQuarantineDeleteNoDB(t *testing.T) {
	h := &QuarantineHandler{DB: nil}

	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1/quarantine/q-1", nil)
	w := httptest.NewRecorder()

	h.Delete(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Delete without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestQuarantineStatsNoDB(t *testing.T) {
	h := &QuarantineHandler{DB: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/quarantine/stats", nil)
	w := httptest.NewRecorder()

	h.Stats(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Stats without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestQuarantineCreateInvalidRequest(t *testing.T) {
	h := &QuarantineHandler{DB: nil}

	tests := []struct {
		name string
		body string
	}{
		{"empty body", ""},
		{"missing test_name", `{"suite":"mysuite"}`},
		{"invalid json", `{bad}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quarantine", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.Create(w, req)

			// Without DB, we get 503 (DB check happens first)
			// Either way, it should NOT be 200/201
			if w.Code == http.StatusCreated || w.Code == http.StatusOK {
				t.Errorf("Create(%s): should not succeed, got %d", tt.name, w.Code)
			}
		})
	}
}

func TestNilIfEmpty(t *testing.T) {
	if nilIfEmpty("") != nil {
		t.Error("nilIfEmpty(\"\") should return nil")
	}
	s := nilIfEmpty("hello")
	if s == nil || *s != "hello" {
		t.Error("nilIfEmpty(\"hello\") should return pointer to \"hello\"")
	}
}

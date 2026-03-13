package openapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandler_ServesValidJSON(t *testing.T) {
	h := Handler()
	req := httptest.NewRequest("GET", "/api/v1/openapi.json", nil)
	w := httptest.NewRecorder()
	h(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("expected application/json, got %q", ct)
	}

	var doc map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &doc); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}

	if doc["openapi"] != "3.1.0" {
		t.Fatalf("expected openapi 3.1.0, got %v", doc["openapi"])
	}

	info, ok := doc["info"].(map[string]interface{})
	if !ok {
		t.Fatal("missing info section")
	}
	if info["title"] != "ScaledTest API" {
		t.Fatalf("unexpected title: %v", info["title"])
	}

	paths, ok := doc["paths"].(map[string]interface{})
	if !ok || len(paths) == 0 {
		t.Fatal("missing or empty paths")
	}
}

func TestSpec_NotEmpty(t *testing.T) {
	if len(spec) == 0 {
		t.Fatal("embedded spec is empty")
	}
}

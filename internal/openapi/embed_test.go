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

func TestSpec_HasInvitationPaths(t *testing.T) {
	var doc map[string]interface{}
	if err := json.Unmarshal(spec, &doc); err != nil {
		t.Fatalf("spec is not valid JSON: %v", err)
	}

	paths, ok := doc["paths"].(map[string]interface{})
	if !ok {
		t.Fatal("missing paths section")
	}

	requiredPaths := []struct {
		path   string
		method string
	}{
		{"/api/v1/teams/{teamID}/invitations", "post"},
		{"/api/v1/teams/{teamID}/invitations", "get"},
		{"/api/v1/teams/{teamID}/invitations/{invitationID}", "delete"},
		{"/api/v1/invitations/{token}", "get"},
		{"/api/v1/invitations/{token}/accept", "post"},
	}

	for _, rp := range requiredPaths {
		pathItem, exists := paths[rp.path]
		if !exists {
			t.Errorf("missing path: %s", rp.path)
			continue
		}
		methods, ok := pathItem.(map[string]interface{})
		if !ok {
			t.Errorf("path %s is not an object", rp.path)
			continue
		}
		if _, has := methods[rp.method]; !has {
			t.Errorf("missing method %s on path %s", rp.method, rp.path)
		}
	}
}

func TestSpec_HasAuthProfilePaths(t *testing.T) {
	var doc map[string]interface{}
	if err := json.Unmarshal(spec, &doc); err != nil {
		t.Fatalf("spec is not valid JSON: %v", err)
	}

	paths, ok := doc["paths"].(map[string]interface{})
	if !ok {
		t.Fatal("missing paths section")
	}

	requiredPaths := []struct {
		path   string
		method string
	}{
		{"/api/v1/auth/me", "get"},
		{"/api/v1/auth/me", "patch"},
		{"/api/v1/auth/change-password", "post"},
	}

	for _, rp := range requiredPaths {
		pathItem, exists := paths[rp.path]
		if !exists {
			t.Errorf("missing path: %s", rp.path)
			continue
		}
		methods, ok := pathItem.(map[string]interface{})
		if !ok {
			t.Errorf("path %s is not an object", rp.path)
			continue
		}
		if _, has := methods[rp.method]; !has {
			t.Errorf("missing method %s on path %s", rp.method, rp.path)
		}
	}
}

func TestSpec_HasInvitationSchema(t *testing.T) {
	var doc map[string]interface{}
	if err := json.Unmarshal(spec, &doc); err != nil {
		t.Fatalf("spec is not valid JSON: %v", err)
	}

	components, ok := doc["components"].(map[string]interface{})
	if !ok {
		t.Fatal("missing components section")
	}
	schemas, ok := components["schemas"].(map[string]interface{})
	if !ok {
		t.Fatal("missing components.schemas section")
	}
	if _, exists := schemas["Invitation"]; !exists {
		t.Error("missing Invitation schema in components.schemas")
	}
}

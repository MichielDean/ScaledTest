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

func specDoc(t *testing.T) map[string]interface{} {
	t.Helper()
	var doc map[string]interface{}
	if err := json.Unmarshal(spec, &doc); err != nil {
		t.Fatalf("spec is not valid JSON: %v", err)
	}
	return doc
}

func specPaths(t *testing.T) map[string]interface{} {
	t.Helper()
	paths, ok := specDoc(t)["paths"].(map[string]interface{})
	if !ok {
		t.Fatal("missing paths section")
	}
	return paths
}

func assertPathMethods(t *testing.T, paths map[string]interface{}, checks []struct{ path, method string }) {
	t.Helper()
	for _, c := range checks {
		pathItem, exists := paths[c.path]
		if !exists {
			t.Errorf("missing path: %s", c.path)
			continue
		}
		methods, ok := pathItem.(map[string]interface{})
		if !ok {
			t.Errorf("path %s is not an object", c.path)
			continue
		}
		if _, has := methods[c.method]; !has {
			t.Errorf("missing method %s on path %s", c.method, c.path)
		}
	}
}

func TestSpec_HasInvitationPaths(t *testing.T) {
	assertPathMethods(t, specPaths(t), []struct{ path, method string }{
		{"/api/v1/teams/{teamID}/invitations", "post"},
		{"/api/v1/teams/{teamID}/invitations", "get"},
		{"/api/v1/teams/{teamID}/invitations/{invitationID}", "delete"},
		{"/api/v1/invitations/{token}", "get"},
		{"/api/v1/invitations/{token}/accept", "post"},
	})
}

func TestSpec_HasAuthProfilePaths(t *testing.T) {
	assertPathMethods(t, specPaths(t), []struct{ path, method string }{
		{"/api/v1/auth/me", "get"},
		{"/api/v1/auth/me", "patch"},
		{"/api/v1/auth/change-password", "post"},
	})
}

func TestSpec_ChangePasswordRequest_NewPassword_HasMaxLength72(t *testing.T) {
	doc := specDoc(t)
	components, ok := doc["components"].(map[string]interface{})
	if !ok {
		t.Fatal("missing components section")
	}
	schemas, ok := components["schemas"].(map[string]interface{})
	if !ok {
		t.Fatal("missing components.schemas section")
	}
	schema, ok := schemas["ChangePasswordRequest"].(map[string]interface{})
	if !ok {
		t.Fatal("missing ChangePasswordRequest schema")
	}
	props, ok := schema["properties"].(map[string]interface{})
	if !ok {
		t.Fatal("missing ChangePasswordRequest.properties")
	}
	newPw, ok := props["new_password"].(map[string]interface{})
	if !ok {
		t.Fatal("missing ChangePasswordRequest.properties.new_password")
	}
	maxLen, exists := newPw["maxLength"]
	if !exists {
		t.Fatal("ChangePasswordRequest.new_password is missing maxLength")
	}
	if maxLen != float64(72) {
		t.Fatalf("expected maxLength 72, got %v", maxLen)
	}
}

func TestSpec_HasNewComponentSchemas(t *testing.T) {
	doc := specDoc(t)
	components, ok := doc["components"].(map[string]interface{})
	if !ok {
		t.Fatal("missing components section")
	}
	schemas, ok := components["schemas"].(map[string]interface{})
	if !ok {
		t.Fatal("missing components.schemas section")
	}
	for _, name := range []string{
		"Invitation",
		"CreateInvitationRequest",
		"AcceptInvitationRequest",
		"UpdateMeRequest",
		"ChangePasswordRequest",
	} {
		if _, exists := schemas[name]; !exists {
			t.Errorf("missing schema in components.schemas: %s", name)
		}
	}
}

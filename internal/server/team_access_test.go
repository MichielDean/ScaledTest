package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/auth"
)

// tokenForTeam creates a JWT with the given user, role, and team.
func tokenForTeam(t *testing.T, userID, email, role, teamID string) string {
	t.Helper()

	mgr := auth.NewJWTManager(testJWTSecret, 15*time.Minute, 7*24*time.Hour)
	pair, err := mgr.GenerateTokenPair(userID, email, role, teamID)
	if err != nil {
		t.Fatalf("failed to generate token pair: %v", err)
	}

	return pair.AccessToken
}

func TestTeamIsolation_DifferentTeamTokensAccepted(t *testing.T) {
	router := NewRouter(testConfig())

	teamAToken := tokenForTeam(t, "user-a", "a@example.com", "owner", "team-alpha")
	teamBToken := tokenForTeam(t, "user-b", "b@example.com", "owner", "team-beta")

	// Both team tokens should be accepted by authenticated endpoints
	nonTeamEndpoints := []string{
		"/api/v1/reports",
		"/api/v1/executions",
		"/api/v1/teams",
	}

	for _, ep := range nonTeamEndpoints {
		for _, tc := range []struct {
			name  string
			token string
		}{
			{"team-alpha", teamAToken},
			{"team-beta", teamBToken},
		} {
			t.Run(tc.name+"_"+ep, func(t *testing.T) {
				req := httptest.NewRequest("GET", ep, nil)
				req.Header.Set("Authorization", "Bearer "+tc.token)
				w := httptest.NewRecorder()
				router.ServeHTTP(w, req)

				// Confirms middleware passes team tokens through (200 or 503 if no DB)
				if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable {
					t.Errorf("%s %s: status = %d, want 200 or 503 (body: %s)",
						tc.name, ep, w.Code, w.Body.String())
				}
			})
		}
	}

	// Team-scoped quality gates endpoints — each token accesses its own team's URL
	for _, tc := range []struct {
		name   string
		token  string
		teamID string
	}{
		{"team-alpha", teamAToken, "team-alpha"},
		{"team-beta", teamBToken, "team-beta"},
	} {
		ep := "/api/v1/teams/" + tc.teamID + "/quality-gates"
		t.Run(tc.name+"_"+ep, func(t *testing.T) {
			req := httptest.NewRequest("GET", ep, nil)
			req.Header.Set("Authorization", "Bearer "+tc.token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable {
				t.Errorf("%s %s: status = %d, want 200 or 503 (body: %s)",
					tc.name, ep, w.Code, w.Body.String())
			}
		})
	}
}

func TestTeamIsolation_ClaimsPropagateTeamID(t *testing.T) {
	// Verify that claims extracted in handlers carry the correct team_id.
	// We test this by generating tokens for different teams and validating
	// the claims round-trip through the middleware.
	mgr := auth.NewJWTManager(testJWTSecret, 15*time.Minute, 7*24*time.Hour)
	authMW := auth.Middleware(mgr, nil)

	teams := []struct {
		userID string
		teamID string
		email  string
	}{
		{"user-1", "team-alpha", "user1@alpha.com"},
		{"user-2", "team-beta", "user2@beta.com"},
		{"user-3", "team-gamma", "user3@gamma.com"},
	}

	for _, tc := range teams {
		t.Run(tc.teamID, func(t *testing.T) {
			pair, _ := mgr.GenerateTokenPair(tc.userID, tc.email, "maintainer", tc.teamID)

			var capturedTeamID string
			handler := authMW(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				claims := auth.GetClaims(r.Context())
				if claims == nil {
					t.Fatal("claims nil in handler")
				}
				capturedTeamID = claims.TeamID
				w.WriteHeader(http.StatusOK)
			}))

			req := httptest.NewRequest("GET", "/test", nil)
			req.Header.Set("Authorization", "Bearer "+pair.AccessToken)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if capturedTeamID != tc.teamID {
				t.Errorf("captured TeamID = %q, want %q", capturedTeamID, tc.teamID)
			}
		})
	}
}

func TestTeamIsolation_CrossTeamTokensDiffer(t *testing.T) {
	// Ensure tokens for different teams produce different claims,
	// which is the foundation for team-scoped data isolation.
	mgr := auth.NewJWTManager(testJWTSecret, 15*time.Minute, 7*24*time.Hour)

	pairA, _ := mgr.GenerateTokenPair("user-a", "a@example.com", "owner", "team-alpha")
	pairB, _ := mgr.GenerateTokenPair("user-b", "b@example.com", "owner", "team-beta")

	claimsA, err := mgr.ValidateAccessToken(pairA.AccessToken)
	if err != nil {
		t.Fatalf("validate team-alpha token: %v", err)
	}
	claimsB, err := mgr.ValidateAccessToken(pairB.AccessToken)
	if err != nil {
		t.Fatalf("validate team-beta token: %v", err)
	}

	if claimsA.TeamID == claimsB.TeamID {
		t.Errorf("team IDs should differ: both are %q", claimsA.TeamID)
	}
	if claimsA.UserID == claimsB.UserID {
		t.Errorf("user IDs should differ: both are %q", claimsA.UserID)
	}
	if claimsA.TeamID != "team-alpha" {
		t.Errorf("team-alpha claims.TeamID = %q", claimsA.TeamID)
	}
	if claimsB.TeamID != "team-beta" {
		t.Errorf("team-beta claims.TeamID = %q", claimsB.TeamID)
	}
}

func TestTeamIsolation_AdminEndpointRequiresOwnerRole(t *testing.T) {
	router := NewRouter(testConfig())

	tests := []struct {
		name       string
		role       string
		teamID     string
		wantStatus int
	}{
		{"owner team-A can access admin", "owner", "team-alpha", http.StatusServiceUnavailable},
		{"owner team-B can access admin", "owner", "team-beta", http.StatusServiceUnavailable},
		{"maintainer denied admin", "maintainer", "team-alpha", http.StatusForbidden},
		{"readonly denied admin", "readonly", "team-beta", http.StatusForbidden},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			token := tokenForTeam(t, "user-x", "x@example.com", tc.role, tc.teamID)
			req := httptest.NewRequest("GET", "/api/v1/admin/users", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != tc.wantStatus {
				t.Errorf("status = %d, want %d (body: %s)", w.Code, tc.wantStatus, w.Body.String())
			}
		})
	}
}

func TestTeamIsolation_NoTokenReturnsUnauthorized(t *testing.T) {
	router := NewRouter(testConfig())

	endpoints := []string{
		"/api/v1/reports",
		"/api/v1/executions",
		"/api/v1/analytics/trends",
		"/api/v1/analytics/flaky-tests",
		"/api/v1/analytics/error-analysis",
		"/api/v1/analytics/duration-distribution",
		"/api/v1/teams/any-team/quality-gates",
		"/api/v1/teams",
		"/api/v1/admin/users",
	}

	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			req := httptest.NewRequest("GET", ep, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Errorf("GET %s without token: status = %d, want 401", ep, w.Code)
			}
		})
	}
}

func TestTeamIsolation_InvalidTokenRejected(t *testing.T) {
	router := NewRouter(testConfig())

	invalidTokens := []struct {
		name  string
		token string
	}{
		{"garbage", "not-a-real-token"},
		{"expired JWT", func() string {
			mgr := auth.NewJWTManager(testJWTSecret, -1*time.Second, 7*24*time.Hour)
			pair, _ := mgr.GenerateTokenPair("user-1", "test@example.com", "owner", "team-1")
			return pair.AccessToken
		}()},
		{"wrong secret", func() string {
			mgr := auth.NewJWTManager("different-secret-that-is-long-!!", 15*time.Minute, 7*24*time.Hour)
			pair, _ := mgr.GenerateTokenPair("user-1", "test@example.com", "owner", "team-1")
			return pair.AccessToken
		}()},
	}

	for _, tc := range invalidTokens {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/v1/reports", nil)
			req.Header.Set("Authorization", "Bearer "+tc.token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Errorf("status = %d, want 401", w.Code)
			}
		})
	}
}

func TestTeamIsolation_APITokenWithTeamScope(t *testing.T) {
	// Verify API token auth path carries team context through middleware.
	mgr := auth.NewJWTManager(testJWTSecret, 15*time.Minute, 7*24*time.Hour)

	apiToken, _ := auth.GenerateAPIToken()
	expectedClaims := &auth.Claims{
		UserID: "api-user",
		Role:   "maintainer",
		TeamID: "team-api-scoped",
	}

	lookup := func(hash string) (*auth.Claims, error) {
		if hash == apiToken.TokenHash {
			return expectedClaims, nil
		}
		return nil, http.ErrNoCookie
	}

	authMW := auth.Middleware(mgr, lookup)

	var capturedTeamID, capturedUserID string
	handler := authMW(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := auth.GetClaims(r.Context())
		capturedTeamID = claims.TeamID
		capturedUserID = claims.UserID
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/v1/reports", nil)
	req.Header.Set("Authorization", apiToken.Token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if capturedTeamID != "team-api-scoped" {
		t.Errorf("TeamID = %q, want %q", capturedTeamID, "team-api-scoped")
	}
	if capturedUserID != "api-user" {
		t.Errorf("UserID = %q, want %q", capturedUserID, "api-user")
	}
}

func TestTeamIsolation_TeamScopedEndpointResponses(t *testing.T) {
	// Verify that team-scoped endpoints return valid JSON with expected structure.
	// When DB is wired, these should return only data for the requesting team.
	router := NewRouter(testConfig())

	teamAToken := tokenForTeam(t, "user-a", "a@example.com", "owner", "team-alpha")

	type endpointCheck struct {
		path    string
		listKey string
	}

	endpoints := []endpointCheck{
		{"/api/v1/reports", "reports"},
		{"/api/v1/executions", "executions"},
		{"/api/v1/teams/team-alpha/quality-gates", "quality_gates"},
		{"/api/v1/teams", "teams"},
	}

	for _, ep := range endpoints {
		t.Run(ep.path, func(t *testing.T) {
			req := httptest.NewRequest("GET", ep.path, nil)
			req.Header.Set("Authorization", "Bearer "+teamAToken)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Without a DB, handlers that require DB return 503
			if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable {
				t.Fatalf("status = %d, want 200 or 503 (body: %s)", w.Code, w.Body.String())
			}
			if w.Code == http.StatusServiceUnavailable {
				return // DB not configured, skip structure check
			}

			var resp map[string]interface{}
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("invalid JSON response: %v", err)
			}

			// Verify the expected list key exists in the response
			if _, ok := resp[ep.listKey]; !ok {
				t.Errorf("response missing %q key: %v", ep.listKey, resp)
			}
		})
	}
}

func TestTeamIsolation_CTRFIngestionAcceptsBothTeams(t *testing.T) {
	router := NewRouter(testConfig())

	report := `{"results":{"tool":{"name":"jest"},"summary":{"tests":1,"passed":1,"failed":0,"skipped":0,"pending":0,"other":0},"tests":[{"name":"test1","status":"passed","duration":50}]}}`

	tokens := []struct {
		name   string
		token  string
		teamID string
	}{
		{"team-alpha", tokenForTeam(t, "user-a", "a@example.com", "maintainer", "team-alpha"), "team-alpha"},
		{"team-beta", tokenForTeam(t, "user-b", "b@example.com", "maintainer", "team-beta"), "team-beta"},
	}

	csrfToken, csrfCookie := testCSRFToken(t, router)

	for _, tc := range tokens {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
			req.Header.Set("Authorization", "Bearer "+tc.token)
			req.Header.Set("Content-Type", "application/json")
			addCSRF(req, csrfToken, csrfCookie)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusCreated {
				t.Errorf("POST /api/v1/reports for %s: status = %d, want 201 (body: %s)",
					tc.name, w.Code, w.Body.String())
			}
		})
	}
}

func TestTeamIsolation_RoleScopingAcrossTeams(t *testing.T) {
	// Verify that role enforcement applies regardless of which team the user belongs to.
	// A readonly user from ANY team should be denied admin access.
	router := NewRouter(testConfig())

	tests := []struct {
		name       string
		role       string
		teamID     string
		endpoint   string
		method     string
		wantStatus int
	}{
		// Admin endpoint - role-gated
		{"owner team-A admin", "owner", "team-alpha", "/api/v1/admin/users", "GET", http.StatusServiceUnavailable},
		{"readonly team-A admin", "readonly", "team-alpha", "/api/v1/admin/users", "GET", http.StatusForbidden},
		{"maintainer team-B admin", "maintainer", "team-beta", "/api/v1/admin/users", "GET", http.StatusForbidden},

		// Regular endpoints - any authenticated user with any role can access
		// Reports now require DB, so expect 503 without one
		{"readonly team-A reports", "readonly", "team-alpha", "/api/v1/reports", "GET", http.StatusServiceUnavailable},
		{"readonly team-B reports", "readonly", "team-beta", "/api/v1/reports", "GET", http.StatusServiceUnavailable},
		{"maintainer team-A teams", "maintainer", "team-alpha", "/api/v1/teams", "GET", http.StatusOK},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			token := tokenForTeam(t, "user-x", "x@example.com", tc.role, tc.teamID)
			req := httptest.NewRequest(tc.method, tc.endpoint, nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != tc.wantStatus {
				t.Errorf("status = %d, want %d (body: %s)", w.Code, tc.wantStatus, w.Body.String())
			}
		})
	}
}

func TestTeamIsolation_EmptyTeamIDAllowed(t *testing.T) {
	// Tokens without a team_id (e.g., during initial login before team assignment)
	// should still be accepted by the auth middleware.
	router := NewRouter(testConfig())

	token := tokenForTeam(t, "user-new", "new@example.com", "owner", "")

	req := httptest.NewRequest("GET", "/api/v1/teams", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("empty team_id: status = %d, want 200 (body: %s)", w.Code, w.Body.String())
	}
}

func TestTeamIsolation_TeamTokenURLParams(t *testing.T) {
	// Verify team-scoped URL params are accepted (e.g., /teams/{teamID}).
	router := NewRouter(testConfig())

	tokenA := tokenForTeam(t, "user-a", "a@example.com", "owner", "team-alpha")

	// User from team-alpha requesting details of a specific team.
	// Currently returns 501 (not implemented), confirming the route exists and
	// auth passes. When DB is wired, this should enforce team-scoped access.
	req := httptest.NewRequest("GET", "/api/v1/teams/team-alpha", nil)
	req.Header.Set("Authorization", "Bearer "+tokenA)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("GET /api/v1/teams/team-alpha: status = %d, want 501", w.Code)
	}

	// Cross-team access attempt: user-a trying to access team-beta's details.
	// Currently returns 501 (no DB check), but documents the expected behavior.
	req = httptest.NewRequest("GET", "/api/v1/teams/team-beta", nil)
	req.Header.Set("Authorization", "Bearer "+tokenA)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("GET /api/v1/teams/team-beta (cross-team): status = %d, want 501", w.Code)
	}
}

func TestTeamIsolation_TeamTokenSubresources(t *testing.T) {
	// Verify team-scoped sub-resource routes (e.g., /teams/{teamID}/tokens).
	router := NewRouter(testConfig())

	tokenA := tokenForTeam(t, "user-a", "a@example.com", "owner", "team-alpha")

	// List tokens for own team - returns empty list (stub)
	req := httptest.NewRequest("GET", "/api/v1/teams/team-alpha/tokens", nil)
	req.Header.Set("Authorization", "Bearer "+tokenA)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("list own team tokens: status = %d, want 200", w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if _, ok := resp["tokens"]; !ok {
		t.Error("response missing 'tokens' key")
	}
}

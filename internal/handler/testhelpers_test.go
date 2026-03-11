package handler

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
)

// testWithClaims creates a request with auth claims in context.
func testWithClaims(r *http.Request, claims *auth.Claims) *http.Request {
	ctx := context.WithValue(r.Context(), auth.ClaimsContextKey, claims)
	return r.WithContext(ctx)
}

// testWithClaimsSimple creates a request with claims using userID, teamID, and role.
func testWithClaimsSimple(r *http.Request, userID, teamID, role string) *http.Request {
	return testWithClaims(r, &auth.Claims{
		UserID: userID,
		TeamID: teamID,
		Role:   role,
	})
}

// testWithClaimsTeamOnly creates a request with claims using only teamID (defaults for other fields).
func testWithClaimsTeamOnly(r *http.Request, teamID string) *http.Request {
	return testWithClaims(r, &auth.Claims{
		UserID: "user-1",
		Email:  "test@example.com",
		Role:   "owner",
		TeamID: teamID,
	})
}

// testWithChiParam adds a chi URL parameter to a request.
func testWithChiParam(r *http.Request, key, value string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, value)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

// testWithClaimsAndParam adds claims and a chi URL parameter.
func testWithClaimsAndParam(r *http.Request, claims *auth.Claims, key, value string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, value)
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, rctx)
	ctx = context.WithValue(ctx, auth.ClaimsContextKey, claims)
	return r.WithContext(ctx)
}

// testWithClaimsAndParams adds claims and multiple chi URL parameters.
func testWithClaimsAndParams(r *http.Request, claims *auth.Claims, params map[string]string) *http.Request {
	rctx := chi.NewRouteContext()
	for k, v := range params {
		rctx.URLParams.Add(k, v)
	}
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, rctx)
	ctx = context.WithValue(ctx, auth.ClaimsContextKey, claims)
	return r.WithContext(ctx)
}

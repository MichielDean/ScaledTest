//go:build integration

package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/integration"
	"github.com/scaledtest/scaledtest/internal/store"
)

// newIntegrationAuthHandler returns an AuthHandler backed by the given real DB pool.
func newIntegrationAuthHandler(tdb *integration.TestDB) *AuthHandler {
	jwt, _ := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	return &AuthHandler{JWT: jwt, AuthStore: store.NewAuthStore(tdb.Pool)}
}

// registerViaHandler calls the Register handler with the given email and returns
// the HTTP response recorder for assertion.
func registerViaHandler(t *testing.T, h *AuthHandler, email, password, displayName string) *httptest.ResponseRecorder {
	t.Helper()
	body := `{"email":"` + email + `","password":"` + password + `","display_name":"` + displayName + `"}`
	req := httptest.NewRequest("POST", "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Register(w, req)
	return w
}

// TestRegister_FirstUser_WhenTableEmpty_AssignsOwnerRole verifies that the
// CASE WHEN NOT EXISTS SQL expression in the Register handler assigns role='owner'
// to the very first user registered against an empty database.
//
// Given: an empty users table (fresh database, no prior registrations)
// When:  a user registers via POST /auth/register
// Then:  that user's role in the database is 'owner'
func TestRegister_FirstUser_WhenTableEmpty_AssignsOwnerRole(t *testing.T) {
	tdb := integration.Setup(t)
	h := newIntegrationAuthHandler(tdb)

	w := registerViaHandler(t, h, "first@example.com", "password123", "First User")

	if w.Code != http.StatusCreated {
		t.Fatalf("Register first user: status = %d, want %d (body: %s)", w.Code, http.StatusCreated, w.Body.String())
	}

	var role string
	err := tdb.Pool.QueryRow(context.Background(),
		`SELECT role FROM users WHERE email = $1`, "first@example.com",
	).Scan(&role)
	if err != nil {
		t.Fatalf("query first user role: %v", err)
	}
	if role != "owner" {
		t.Errorf("first registered user role = %q, want %q — CASE WHEN NOT EXISTS must assign 'owner' when users table is empty", role, "owner")
	}
}

// TestRegister_SubsequentUser_WhenOwnerExists_AssignsMaintainerRole verifies that
// registrations after the first one receive role='maintainer'.
//
// Given: one user already exists with role='owner'
// When:  a second user registers via POST /auth/register
// Then:  the second user's role in the database is 'maintainer'
func TestRegister_SubsequentUser_WhenOwnerExists_AssignsMaintainerRole(t *testing.T) {
	tdb := integration.Setup(t)
	h := newIntegrationAuthHandler(tdb)

	// Register first user (becomes owner).
	w1 := registerViaHandler(t, h, "first@example.com", "password123", "First User")
	if w1.Code != http.StatusCreated {
		t.Fatalf("Register first user: status = %d, want %d (body: %s)", w1.Code, http.StatusCreated, w1.Body.String())
	}

	// Register second user — should become maintainer.
	w2 := registerViaHandler(t, h, "second@example.com", "password123", "Second User")
	if w2.Code != http.StatusCreated {
		t.Fatalf("Register second user: status = %d, want %d (body: %s)", w2.Code, http.StatusCreated, w2.Body.String())
	}

	var role string
	err := tdb.Pool.QueryRow(context.Background(),
		`SELECT role FROM users WHERE email = $1`, "second@example.com",
	).Scan(&role)
	if err != nil {
		t.Fatalf("query second user role: %v", err)
	}
	if role != "maintainer" {
		t.Errorf("second registered user role = %q, want %q — CASE WHEN NOT EXISTS must assign 'maintainer' when users table is non-empty", role, "maintainer")
	}
}

// TestRegister_SingleOwnerIndex_RejectsSecondOwnerInsert verifies that the
// idx_users_single_owner unique partial index exists and prevents a second owner
// row from being inserted, returning SQLSTATE 23505 with the correct constraint name.
//
// Given: one user with role='owner' already exists in the database
// When:  a direct INSERT of a second user with role='owner' is attempted
// Then:  the INSERT fails with SQLSTATE 23505 on constraint idx_users_single_owner
func TestRegister_SingleOwnerIndex_RejectsSecondOwnerInsert(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()

	// Insert the first owner directly to set up the precondition.
	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO users (email, password_hash, display_name, role)
		 VALUES ('owner@example.com', 'hash', 'Owner', 'owner')`,
	)
	if err != nil {
		t.Fatalf("insert first owner: %v", err)
	}

	// Attempt to insert a second owner — idx_users_single_owner must block this.
	_, err = tdb.Pool.Exec(ctx,
		`INSERT INTO users (email, password_hash, display_name, role)
		 VALUES ('owner2@example.com', 'hash', 'Owner2', 'owner')`,
	)
	if err == nil {
		t.Fatal("expected unique constraint violation for second owner insert, got nil — idx_users_single_owner index may be missing")
	}

	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		t.Fatalf("expected *pgconn.PgError, got %T: %v", err, err)
	}
	if pgErr.Code != "23505" {
		t.Errorf("constraint violation SQLSTATE = %q, want %q", pgErr.Code, "23505")
	}
	if pgErr.ConstraintName != "idx_users_single_owner" {
		t.Errorf("constraint name = %q, want %q — wrong index or index missing", pgErr.ConstraintName, "idx_users_single_owner")
	}
}

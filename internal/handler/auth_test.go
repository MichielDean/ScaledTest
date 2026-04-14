package handler

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/store"
)

const testSecret = "test-secret-32-chars-long-enough!"

func newTestAuthHandler() *AuthHandler {
	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	return &AuthHandler{JWT: jwt, AuthStore: nil}
}

// mockAuthStore implements authStore for testing.
type mockAuthStore struct {
	getUserByEmailFn           func(ctx context.Context, email string) (*model.User, error)
	getUserByIDFn              func(ctx context.Context, id string) (*model.User, error)
	emailExistsFn              func(ctx context.Context, email string) (bool, error)
	createUserFn               func(ctx context.Context, email, passwordHash, displayName, role string) (string, string, error)
	createUserWithRoleFn       func(ctx context.Context, email, passwordHash, displayName, role string) (string, error)
	updatePasswordFn           func(ctx context.Context, userID, passwordHash string) (int64, error)
	updateProfileFn            func(ctx context.Context, userID, displayName string) (*model.User, error)
	getPrimaryTeamIDFn         func(ctx context.Context, userID string) (string, error)
	createSessionFn            func(ctx context.Context, userID, refreshToken, userAgent string, ipAddr net.IP, expiresAt time.Time) error
	getSessionByRefreshTokenFn func(ctx context.Context, refreshToken string) (*store.SessionInfo, error)
	deleteSessionFn            func(ctx context.Context, sessionID string) error
	deleteSessionByRefreshFn   func(ctx context.Context, refreshToken string) error
}

func (m *mockAuthStore) GetUserByEmail(ctx context.Context, email string) (*model.User, error) {
	return m.getUserByEmailFn(ctx, email)
}
func (m *mockAuthStore) GetUserByID(ctx context.Context, id string) (*model.User, error) {
	return m.getUserByIDFn(ctx, id)
}
func (m *mockAuthStore) EmailExists(ctx context.Context, email string) (bool, error) {
	return m.emailExistsFn(ctx, email)
}
func (m *mockAuthStore) CreateUser(ctx context.Context, email, passwordHash, displayName, role string) (string, string, error) {
	return m.createUserFn(ctx, email, passwordHash, displayName, role)
}
func (m *mockAuthStore) CreateUserWithRole(ctx context.Context, email, passwordHash, displayName, role string) (string, error) {
	return m.createUserWithRoleFn(ctx, email, passwordHash, displayName, role)
}
func (m *mockAuthStore) UpdatePassword(ctx context.Context, userID, passwordHash string) (int64, error) {
	return m.updatePasswordFn(ctx, userID, passwordHash)
}
func (m *mockAuthStore) UpdateProfile(ctx context.Context, userID, displayName string) (*model.User, error) {
	return m.updateProfileFn(ctx, userID, displayName)
}
func (m *mockAuthStore) GetPrimaryTeamID(ctx context.Context, userID string) (string, error) {
	return m.getPrimaryTeamIDFn(ctx, userID)
}
func (m *mockAuthStore) CreateSession(ctx context.Context, userID, refreshToken, userAgent string, ipAddr net.IP, expiresAt time.Time) error {
	return m.createSessionFn(ctx, userID, refreshToken, userAgent, ipAddr, expiresAt)
}
func (m *mockAuthStore) GetSessionByRefreshToken(ctx context.Context, refreshToken string) (*store.SessionInfo, error) {
	return m.getSessionByRefreshTokenFn(ctx, refreshToken)
}
func (m *mockAuthStore) DeleteSession(ctx context.Context, sessionID string) error {
	return m.deleteSessionFn(ctx, sessionID)
}
func (m *mockAuthStore) DeleteSessionByRefreshToken(ctx context.Context, refreshToken string) error {
	return m.deleteSessionByRefreshFn(ctx, refreshToken)
}

func TestRegisterNoDB(t *testing.T) {
	h := newTestAuthHandler()

	body := `{"email":"test@example.com","password":"password123","display_name":"Test User"}`
	req := httptest.NewRequest("POST", "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Register without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestLoginNoDB(t *testing.T) {
	h := newTestAuthHandler()

	body := `{"email":"test@example.com","password":"password123"}`
	req := httptest.NewRequest("POST", "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Login without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestRefreshNoDB(t *testing.T) {
	h := newTestAuthHandler()

	req := httptest.NewRequest("POST", "/auth/refresh", nil)
	w := httptest.NewRecorder()

	h.Refresh(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Refresh without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestLogoutNoDB(t *testing.T) {
	h := newTestAuthHandler()

	req := httptest.NewRequest("POST", "/auth/logout", nil)
	w := httptest.NewRecorder()

	h.Logout(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Logout without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestRegisterInvalidRequest(t *testing.T) {
	h := newTestAuthHandler()

	tests := []struct {
		name string
		body string
	}{
		{"empty body", ""},
		{"missing email", `{"password":"password123","display_name":"Test"}`},
		{"invalid email", `{"email":"not-an-email","password":"password123","display_name":"Test"}`},
		{"short password", `{"email":"test@test.com","password":"short","display_name":"Test"}`},
		{"missing display_name", `{"email":"test@test.com","password":"password123"}`},
		{"invalid json", `{bad json}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/auth/register", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.Register(w, req)

			if w.Code == http.StatusCreated || w.Code == http.StatusOK {
				t.Errorf("Register(%s): should not succeed, got %d", tt.name, w.Code)
			}
		})
	}
}

func TestLoginInvalidRequest(t *testing.T) {
	h := newTestAuthHandler()

	tests := []struct {
		name string
		body string
	}{
		{"empty body", ""},
		{"missing email", `{"password":"password123"}`},
		{"invalid json", `{bad}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/auth/login", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.Login(w, req)

			if w.Code == http.StatusOK {
				t.Errorf("Login(%s): should not succeed", tt.name)
			}
		})
	}
}

func TestRefreshMissingCookie(t *testing.T) {
	h := newTestAuthHandler()

	req := httptest.NewRequest("POST", "/auth/refresh", nil)
	w := httptest.NewRecorder()

	h.Refresh(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Refresh no cookie, no DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestLogoutNoCookie(t *testing.T) {
	h := newTestAuthHandler()

	req := httptest.NewRequest("POST", "/auth/logout", nil)
	w := httptest.NewRecorder()

	h.Logout(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Logout no cookie, no DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestAuthResponseShape(t *testing.T) {
	resp := AuthResponse{
		User: UserResponse{
			ID:          "user-1",
			Email:       "test@test.com",
			DisplayName: "Test User",
			Role:        "maintainer",
		},
		AccessToken: "token123",
		ExpiresAt:   time.Now().Add(15 * time.Minute),
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal AuthResponse: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, key := range []string{"user", "access_token", "expires_at"} {
		if _, ok := decoded[key]; !ok {
			t.Errorf("missing key %q in AuthResponse", key)
		}
	}

	user := decoded["user"].(map[string]interface{})
	for _, key := range []string{"id", "email", "display_name", "role"} {
		if _, ok := user[key]; !ok {
			t.Errorf("missing key %q in UserResponse", key)
		}
	}
}

func TestRefreshCookieAttributes(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/auth/refresh", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	setRefreshCookie(w, req, "test-token", 7*24*time.Hour)

	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected 1 cookie, got %d", len(cookies))
	}

	c := cookies[0]
	if c.Name != "refresh_token" {
		t.Errorf("cookie name = %q, want %q", c.Name, "refresh_token")
	}
	if c.Value != "test-token" {
		t.Errorf("cookie value = %q, want %q", c.Value, "test-token")
	}
	if !c.HttpOnly {
		t.Error("cookie should be HttpOnly")
	}
	if !c.Secure {
		t.Error("cookie should be Secure over HTTPS")
	}
	if c.SameSite != http.SameSiteStrictMode {
		t.Errorf("cookie SameSite = %d, want %d", c.SameSite, http.SameSiteStrictMode)
	}
	if c.Path != "/auth" {
		t.Errorf("cookie path = %q, want %q", c.Path, "/auth")
	}
}

func TestRefreshCookieNotSecureOverHTTP(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/auth/refresh", nil)
	setRefreshCookie(w, req, "test-token", 7*24*time.Hour)

	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected 1 cookie, got %d", len(cookies))
	}
	if cookies[0].Secure {
		t.Error("cookie should NOT be Secure over plain HTTP")
	}
}

func TestClearRefreshCookie(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/auth/logout", nil)
	clearRefreshCookie(w, req)

	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected 1 cookie, got %d", len(cookies))
	}

	c := cookies[0]
	if c.MaxAge != -1 {
		t.Errorf("clear cookie MaxAge = %d, want -1", c.MaxAge)
	}
	if c.Value != "" {
		t.Errorf("clear cookie value = %q, want empty", c.Value)
	}
}

func TestChangePasswordNoAuth(t *testing.T) {
	h := newTestAuthHandler()

	body := `{"current_password":"oldpassword123","new_password":"newpassword123"}`
	req := httptest.NewRequest("POST", "/api/v1/auth/change-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.ChangePassword(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("ChangePassword with no auth: status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestChangePasswordNoDB(t *testing.T) {
	h := newTestAuthHandler()

	body := `{"current_password":"oldpassword123","new_password":"newpassword123"}`
	req := httptest.NewRequest("POST", "/api/v1/auth/change-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.SetClaims(req.Context(), &auth.Claims{UserID: "user-123"}))
	w := httptest.NewRecorder()

	h.ChangePassword(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("ChangePassword without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestChangePasswordSuccess(t *testing.T) {
	hash, err := auth.HashPassword("oldpassword123")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	ms := &mockAuthStore{
		getUserByIDFn: func(_ context.Context, id string) (*model.User, error) {
			return &model.User{ID: id, PasswordHash: hash}, nil
		},
		updatePasswordFn: func(_ context.Context, _, _ string) (int64, error) {
			return 1, nil
		},
		createSessionFn: func(_ context.Context, _ string, _ string, _ string, _ net.IP, _ time.Time) error {
			return nil
		},
	}

	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwt, AuthStore: ms}

	body := `{"current_password":"oldpassword123","new_password":"newpassword123"}`
	req := httptest.NewRequest("POST", "/api/v1/auth/change-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.SetClaims(req.Context(), &auth.Claims{UserID: "user-123"}))
	w := httptest.NewRecorder()

	h.ChangePassword(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("ChangePassword success: status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestChangePasswordWrongCurrentPassword(t *testing.T) {
	hash, err := auth.HashPassword("correctpassword")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	ms := &mockAuthStore{
		getUserByIDFn: func(_ context.Context, id string) (*model.User, error) {
			return &model.User{ID: id, PasswordHash: hash}, nil
		},
	}

	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwt, AuthStore: ms}

	body := `{"current_password":"wrongpassword","new_password":"newpassword123"}`
	req := httptest.NewRequest("POST", "/api/v1/auth/change-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.SetClaims(req.Context(), &auth.Claims{UserID: "user-123"}))
	w := httptest.NewRecorder()

	h.ChangePassword(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("ChangePassword wrong password: status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestChangePasswordRowsAffectedZero(t *testing.T) {
	hash, err := auth.HashPassword("oldpassword123")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	ms := &mockAuthStore{
		getUserByIDFn: func(_ context.Context, id string) (*model.User, error) {
			return &model.User{ID: id, PasswordHash: hash}, nil
		},
		updatePasswordFn: func(_ context.Context, _, _ string) (int64, error) {
			return 0, nil
		},
	}

	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwt, AuthStore: ms}

	body := `{"current_password":"oldpassword123","new_password":"newpassword123"}`
	req := httptest.NewRequest("POST", "/api/v1/auth/change-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.SetClaims(req.Context(), &auth.Claims{UserID: "user-123"}))
	w := httptest.NewRecorder()

	h.ChangePassword(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("ChangePassword rows affected 0: status = %d, want %d", w.Code, http.StatusInternalServerError)
	}
}

func TestChangePasswordInvalidRequest(t *testing.T) {
	h := newTestAuthHandler()

	tests := []struct {
		name string
		body string
	}{
		{"empty body", ""},
		{"missing new_password", `{"current_password":"oldpassword123"}`},
		{"short new_password", `{"current_password":"oldpassword123","new_password":"short"}`},
		{"missing current_password", `{"new_password":"newpassword123"}`},
		{"invalid json", `{bad}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/v1/auth/change-password", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(auth.SetClaims(req.Context(), &auth.Claims{UserID: "user-123"}))
			w := httptest.NewRecorder()

			h.ChangePassword(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("ChangePassword(%s): got %d, want %d (validation must reject before DB check)",
					tt.name, w.Code, http.StatusBadRequest)
			}
		})
	}
}

func TestGetMeNoAuth(t *testing.T) {
	h := newTestAuthHandler()

	req := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	w := httptest.NewRecorder()

	h.GetMe(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("GetMe no auth: status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestGetMeNoDB(t *testing.T) {
	h := newTestAuthHandler()

	req := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	req = req.WithContext(auth.SetClaims(req.Context(), &auth.Claims{UserID: "user-123"}))
	w := httptest.NewRecorder()

	h.GetMe(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("GetMe no DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestLoginEmbedsPrimaryTeamInJWT(t *testing.T) {
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	const teamID = "550e8400-e29b-41d4-a716-446655440000"

	ms := &mockAuthStore{
		getUserByEmailFn: func(_ context.Context, email string) (*model.User, error) {
			return &model.User{
				ID:           "user-id-1",
				Email:        email,
				PasswordHash: hash,
				DisplayName:  "Test User",
				Role:         "maintainer",
			}, nil
		},
		getPrimaryTeamIDFn: func(_ context.Context, _ string) (string, error) {
			return teamID, nil
		},
		createSessionFn: func(_ context.Context, _ string, _ string, _ string, _ net.IP, _ time.Time) error {
			return nil
		},
	}

	jwtMgr := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwtMgr, AuthStore: ms}

	body := `{"email":"test@example.com","password":"password123"}`
	req := httptest.NewRequest("POST", "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Login with team: status = %d, want 200 (body: %s)", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	accessToken, ok := resp["access_token"].(string)
	if !ok || accessToken == "" {
		t.Fatal("missing or empty access_token in response")
	}

	claims, err := jwtMgr.ValidateAccessToken(accessToken)
	if err != nil {
		t.Fatalf("ValidateAccessToken: %v", err)
	}

	if claims.TeamID != teamID {
		t.Errorf("JWT TeamID = %q, want %q", claims.TeamID, teamID)
	}
}

func TestLoginNoTeamHasEmptyTeamIDInJWT(t *testing.T) {
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	ms := &mockAuthStore{
		getUserByEmailFn: func(_ context.Context, email string) (*model.User, error) {
			return &model.User{
				ID:           "user-id-1",
				Email:        email,
				PasswordHash: hash,
				DisplayName:  "Test User",
				Role:         "maintainer",
			}, nil
		},
		getPrimaryTeamIDFn: func(_ context.Context, _ string) (string, error) {
			return "", pgx.ErrNoRows
		},
		createSessionFn: func(_ context.Context, _ string, _ string, _ string, _ net.IP, _ time.Time) error {
			return nil
		},
	}

	jwtMgr := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwtMgr, AuthStore: ms}

	body := `{"email":"test@example.com","password":"password123"}`
	req := httptest.NewRequest("POST", "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Login no team: status = %d, want 200 (body: %s)", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	accessToken, ok := resp["access_token"].(string)
	if !ok || accessToken == "" {
		t.Fatal("missing or empty access_token in response")
	}
	claims, err := jwtMgr.ValidateAccessToken(accessToken)
	if err != nil {
		t.Fatalf("ValidateAccessToken: %v", err)
	}

	if claims.TeamID != "" {
		t.Errorf("JWT TeamID = %q, want empty (no team)", claims.TeamID)
	}
}

func TestGetMeSuccess(t *testing.T) {
	ms := &mockAuthStore{
		getUserByIDFn: func(_ context.Context, id string) (*model.User, error) {
			return &model.User{
				ID:          id,
				Email:       "test@test.com",
				DisplayName: "Test User",
				Role:        "maintainer",
			}, nil
		},
	}

	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwt, AuthStore: ms}

	req := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	req = req.WithContext(auth.SetClaims(req.Context(), &auth.Claims{UserID: "user-123"}))
	w := httptest.NewRecorder()

	h.GetMe(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GetMe success: status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp UserResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal GetMe response: %v", err)
	}
	if resp.Email != "test@test.com" {
		t.Errorf("GetMe: email = %q, want %q", resp.Email, "test@test.com")
	}
	if resp.DisplayName != "Test User" {
		t.Errorf("GetMe: display_name = %q, want %q", resp.DisplayName, "Test User")
	}
	if resp.ID != "user-123" {
		t.Errorf("GetMe: id = %q, want %q", resp.ID, "user-123")
	}
}

func TestGetMeUserNotFound(t *testing.T) {
	ms := &mockAuthStore{
		getUserByIDFn: func(_ context.Context, _ string) (*model.User, error) {
			return nil, pgx.ErrNoRows
		},
	}

	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwt, AuthStore: ms}

	req := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	req = req.WithContext(auth.SetClaims(req.Context(), &auth.Claims{UserID: "user-123"}))
	w := httptest.NewRecorder()

	h.GetMe(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("GetMe user not found: status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestRegister_WhenOwnerConstraintViolated_RetriesAsMaintainer(t *testing.T) {
	callCount := 0
	ms := &mockAuthStore{
		emailExistsFn: func(_ context.Context, _ string) (bool, error) {
			return false, nil
		},
		createUserFn: func(_ context.Context, _, _, _, _ string) (string, string, error) {
			callCount++
			if callCount == 1 {
				return "", "", &pgconn.PgError{Code: "23505", ConstraintName: "idx_users_single_owner"}
			}
			return "", "owner", nil
		},
		createUserWithRoleFn: func(_ context.Context, _, _, _, _ string) (string, error) {
			return "user-uuid-1", nil
		},
		createSessionFn: func(_ context.Context, _ string, _ string, _ string, _ net.IP, _ time.Time) error {
			return nil
		},
	}

	jwtMgr := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwtMgr, AuthStore: ms}

	body := `{"email":"admin@example.com","password":"password123","display_name":"Admin"}`
	req := httptest.NewRequest("POST", "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Register on constraint violation: status = %d, want %d (body: %s)", w.Code, http.StatusCreated, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	user, ok := resp["user"].(map[string]interface{})
	if !ok {
		t.Fatal("missing 'user' field in response")
	}
	if role := user["role"]; role != "maintainer" {
		t.Errorf("role = %q, want %q", role, "maintainer")
	}
}

func TestRegister_RoleAssignment(t *testing.T) {
	tests := []struct {
		name string
		role string
	}{
		{"first user becomes owner", "owner"},
		{"subsequent user becomes maintainer", "maintainer"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ms := &mockAuthStore{
				emailExistsFn: func(_ context.Context, _ string) (bool, error) {
					return false, nil
				},
				createUserFn: func(_ context.Context, _, _, _, _ string) (string, string, error) {
					return "user-uuid", tc.role, nil
				},
				createSessionFn: func(_ context.Context, _ string, _ string, _ string, _ net.IP, _ time.Time) error {
					return nil
				},
			}

			jwtMgr := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
			h := &AuthHandler{JWT: jwtMgr, AuthStore: ms}

			body := `{"email":"user@example.com","password":"password123","display_name":"User"}`
			req := httptest.NewRequest("POST", "/auth/register", strings.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.Register(w, req)

			if w.Code != http.StatusCreated {
				t.Fatalf("Register: status = %d, want %d (body: %s)", w.Code, http.StatusCreated, w.Body.String())
			}

			var resp map[string]interface{}
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("unmarshal response: %v", err)
			}

			user, ok := resp["user"].(map[string]interface{})
			if !ok {
				t.Fatal("missing 'user' field in response")
			}
			if role := user["role"]; role != tc.role {
				t.Errorf("role = %q, want %q", role, tc.role)
			}
		})
	}
}

// Store-aware handler tests

func TestAuthHandler_Login_WithStore_Success(t *testing.T) {
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	callCount := 0
	ms := &mockAuthStore{
		getUserByEmailFn: func(_ context.Context, email string) (*model.User, error) {
			callCount++
			return &model.User{
				ID:           "uid-1",
				Email:        email,
				PasswordHash: hash,
				DisplayName:  "Test",
				Role:         "maintainer",
			}, nil
		},
		getPrimaryTeamIDFn: func(_ context.Context, _ string) (string, error) {
			return "team-1", nil
		},
		createSessionFn: func(_ context.Context, _ string, _ string, _ string, _ net.IP, _ time.Time) error {
			return nil
		},
	}

	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwt, AuthStore: ms}

	body := `{"email":"test@test.com","password":"password123"}`
	req := httptest.NewRequest("POST", "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Login with store: status = %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}
	if callCount != 1 {
		t.Errorf("expected 1 GetUserByEmail call, got %d", callCount)
	}
}

func TestAuthHandler_Login_WithStore_InvalidCredentials(t *testing.T) {
	hash, err := auth.HashPassword("correctpassword")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	ms := &mockAuthStore{
		getUserByEmailFn: func(_ context.Context, _ string) (*model.User, error) {
			return &model.User{
				ID:           "uid-1",
				Email:        "test@test.com",
				PasswordHash: hash,
				DisplayName:  "Test",
				Role:         "maintainer",
			}, nil
		},
	}

	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwt, AuthStore: ms}

	body := `{"email":"test@test.com","password":"wrongpassword"}`
	req := httptest.NewRequest("POST", "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Login wrong password: status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestAuthHandler_Login_WithStore_UserNotFound(t *testing.T) {
	ms := &mockAuthStore{
		getUserByEmailFn: func(_ context.Context, _ string) (*model.User, error) {
			return nil, pgx.ErrNoRows
		},
	}

	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwt, AuthStore: ms}

	body := `{"email":"nobody@test.com","password":"password123"}`
	req := httptest.NewRequest("POST", "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Login user not found: status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestAuthHandler_Refresh_WithStore_Expired(t *testing.T) {
	ms := &mockAuthStore{
		getSessionByRefreshTokenFn: func(_ context.Context, _ string) (*store.SessionInfo, error) {
			return &store.SessionInfo{
				ID:        "sess-1",
				UserID:    "uid-1",
				ExpiresAt: time.Now().Add(-1 * time.Hour),
			}, nil
		},
		deleteSessionFn: func(_ context.Context, _ string) error {
			return nil
		},
	}

	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwt, AuthStore: ms}

	req := httptest.NewRequest("POST", "/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: "expired-token"})
	w := httptest.NewRecorder()

	h.Refresh(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Refresh expired: status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestAuthHandler_Logout_WithStore(t *testing.T) {
	deleteCalled := false
	ms := &mockAuthStore{
		deleteSessionByRefreshFn: func(_ context.Context, _ string) error {
			deleteCalled = true
			return nil
		},
	}

	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwt, AuthStore: ms}

	req := httptest.NewRequest("POST", "/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: "some-token"})
	w := httptest.NewRecorder()

	h.Logout(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Logout: status = %d, want %d", w.Code, http.StatusOK)
	}
	if !deleteCalled {
		t.Error("expected DeleteSessionByRefreshToken to be called")
	}
}

func TestAuthHandler_UpdateMe_WithStore(t *testing.T) {
	ms := &mockAuthStore{
		updateProfileFn: func(_ context.Context, userID, displayName string) (*model.User, error) {
			return &model.User{
				ID:          userID,
				Email:       "test@test.com",
				DisplayName: displayName,
				Role:        "maintainer",
			}, nil
		},
	}

	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwt, AuthStore: ms}

	body := `{"display_name":"New Name"}`
	req := httptest.NewRequest("PATCH", "/api/v1/auth/me", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.SetClaims(req.Context(), &auth.Claims{UserID: "user-123"}))
	w := httptest.NewRecorder()

	h.UpdateMe(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("UpdateMe: status = %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}
}

func TestAuthHandler_Register_WithStore_EmailExists(t *testing.T) {
	ms := &mockAuthStore{
		emailExistsFn: func(_ context.Context, _ string) (bool, error) {
			return true, nil
		},
	}

	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	h := &AuthHandler{JWT: jwt, AuthStore: ms}

	body := `{"email":"taken@test.com","password":"password123","display_name":"Test"}`
	req := httptest.NewRequest("POST", "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("Register email taken: status = %d, want %d", w.Code, http.StatusConflict)
	}
}

package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"

	"golang.org/x/oauth2"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/store"
)

// oauthStore abstracts OAuth persistence operations.
type oauthStore interface {
	FindLinkedUser(ctx context.Context, provider, providerID string) (*store.OAuthLinkedUser, error)
	FindUserByEmail(ctx context.Context, email string) (*store.OAuthLinkedUser, error)
	CreateUser(ctx context.Context, email, displayName string) (userID, role string, err error)
	LinkAccount(ctx context.Context, userID, provider, providerID, accessToken, refreshToken string) error
	UpdateTokens(ctx context.Context, accessToken, refreshToken, provider, providerID string) error
	CreateSession(ctx context.Context, userID, refreshToken, userAgent string, ipAddr net.IP, expiresAt time.Time) error
}

// OAuthHandler handles OAuth 2.0 authentication flows.
type OAuthHandler struct {
	JWT        *auth.JWTManager
	OAuth      *auth.OAuthConfigs
	OAuthStore oauthStore
	Secure     bool // true if base URL uses HTTPS
}

const oauthStateCookie = "oauth_state"

// GitHubLogin handles GET /auth/github — redirects to GitHub authorization.
func (h *OAuthHandler) GitHubLogin(w http.ResponseWriter, r *http.Request) {
	if h.OAuth == nil || h.OAuth.GitHub == nil {
		Error(w, http.StatusNotImplemented, "GitHub OAuth is not configured. Set ST_OAUTH_GITHUB_CLIENT_ID and ST_OAUTH_GITHUB_CLIENT_SECRET environment variables.")
		return
	}
	h.redirectToProvider(w, r, h.OAuth.GitHub)
}

// GitHubCallback handles GET /auth/github/callback — exchanges code for token.
func (h *OAuthHandler) GitHubCallback(w http.ResponseWriter, r *http.Request) {
	if h.OAuth == nil || h.OAuth.GitHub == nil {
		Error(w, http.StatusNotImplemented, "GitHub OAuth is not configured")
		return
	}
	if h.OAuthStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	token, err := h.exchangeCode(w, r, h.OAuth.GitHub)
	if err != nil {
		return // error already written
	}

	user, err := h.fetchGitHubUser(r.Context(), token)
	if err != nil {
		Error(w, http.StatusBadGateway, "failed to fetch GitHub user info")
		return
	}

	h.completeOAuth(w, r, "github", user.ID, user.Email, user.Name, token)
}

// GoogleLogin handles GET /auth/google — redirects to Google authorization.
func (h *OAuthHandler) GoogleLogin(w http.ResponseWriter, r *http.Request) {
	if h.OAuth == nil || h.OAuth.Google == nil {
		Error(w, http.StatusNotImplemented, "Google OAuth is not configured. Set ST_OAUTH_GOOGLE_CLIENT_ID and ST_OAUTH_GOOGLE_CLIENT_SECRET environment variables.")
		return
	}
	h.redirectToProvider(w, r, h.OAuth.Google)
}

// GoogleCallback handles GET /auth/google/callback — exchanges code for token.
func (h *OAuthHandler) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	if h.OAuth == nil || h.OAuth.Google == nil {
		Error(w, http.StatusNotImplemented, "Google OAuth is not configured")
		return
	}
	if h.OAuthStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	token, err := h.exchangeCode(w, r, h.OAuth.Google)
	if err != nil {
		return // error already written
	}

	user, err := h.fetchGoogleUser(r.Context(), token)
	if err != nil {
		Error(w, http.StatusBadGateway, "failed to fetch Google user info")
		return
	}

	h.completeOAuth(w, r, "google", user.ID, user.Email, user.Name, token)
}

// redirectToProvider generates a state token and redirects to the OAuth provider.
func (h *OAuthHandler) redirectToProvider(w http.ResponseWriter, r *http.Request, cfg *oauth2.Config) {
	state, err := generateOAuthState()
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to generate state")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookie,
		Value:    state,
		Path:     "/auth",
		MaxAge:   600, // 10 minutes
		HttpOnly: true,
		Secure:   h.Secure,
		SameSite: http.SameSiteLaxMode,
	})

	url := cfg.AuthCodeURL(state, oauth2.AccessTypeOffline)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

// exchangeCode validates the state parameter and exchanges the authorization code.
func (h *OAuthHandler) exchangeCode(w http.ResponseWriter, r *http.Request, cfg *oauth2.Config) (*oauth2.Token, error) {
	// Validate state
	cookie, err := r.Cookie(oauthStateCookie)
	if err != nil || cookie.Value == "" {
		Error(w, http.StatusBadRequest, "missing OAuth state")
		return nil, fmt.Errorf("missing state cookie")
	}

	state := r.URL.Query().Get("state")
	if state == "" || state != cookie.Value {
		Error(w, http.StatusBadRequest, "invalid OAuth state")
		return nil, fmt.Errorf("state mismatch")
	}

	// Clear the state cookie
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookie,
		Value:    "",
		Path:     "/auth",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.Secure,
		SameSite: http.SameSiteLaxMode,
	})

	// Check for error from provider
	if errParam := r.URL.Query().Get("error"); errParam != "" {
		Error(w, http.StatusBadRequest, "OAuth error: "+errParam)
		return nil, fmt.Errorf("provider error: %s", errParam)
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		Error(w, http.StatusBadRequest, "missing authorization code")
		return nil, fmt.Errorf("missing code")
	}

	token, err := cfg.Exchange(r.Context(), code)
	if err != nil {
		Error(w, http.StatusBadRequest, "failed to exchange authorization code")
		return nil, err
	}

	return token, nil
}

// oauthUser holds normalized user info from an OAuth provider.
type oauthUser struct {
	ID    string
	Email string
	Name  string
}

// fetchGitHubUser calls the GitHub user API and primary email API.
func (h *OAuthHandler) fetchGitHubUser(ctx context.Context, token *oauth2.Token) (*oauthUser, error) {
	client := oauth2.NewClient(ctx, oauth2.StaticTokenSource(token))

	resp, err := client.Get("https://api.github.com/user")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github API returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var ghUser struct {
		ID    int64  `json:"id"`
		Login string `json:"login"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if err := json.Unmarshal(body, &ghUser); err != nil {
		return nil, err
	}

	email := ghUser.Email
	if email == "" {
		// Fetch primary email from /user/emails
		email, err = h.fetchGitHubPrimaryEmail(ctx, client)
		if err != nil {
			return nil, fmt.Errorf("fetch primary email: %w", err)
		}
	}

	name := ghUser.Name
	if name == "" {
		name = ghUser.Login
	}

	return &oauthUser{
		ID:    fmt.Sprintf("%d", ghUser.ID),
		Email: email,
		Name:  name,
	}, nil
}

func (h *OAuthHandler) fetchGitHubPrimaryEmail(ctx context.Context, client *http.Client) (string, error) {
	resp, err := client.Get("https://api.github.com/user/emails")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return "", err
	}

	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
	}
	return "", fmt.Errorf("no verified primary email found")
}

// fetchGoogleUser calls the Google userinfo API.
func (h *OAuthHandler) fetchGoogleUser(ctx context.Context, token *oauth2.Token) (*oauthUser, error) {
	client := oauth2.NewClient(ctx, oauth2.StaticTokenSource(token))

	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google API returned %d", resp.StatusCode)
	}

	var gUser struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&gUser); err != nil {
		return nil, err
	}

	return &oauthUser{
		ID:    gUser.ID,
		Email: gUser.Email,
		Name:  gUser.Name,
	}, nil
}

// completeOAuth creates or links a user account and issues JWT tokens.
func (h *OAuthHandler) completeOAuth(w http.ResponseWriter, r *http.Request, provider, providerID, email, displayName string, token *oauth2.Token) {
	ctx := r.Context()

	// Check if this OAuth account is already linked
	user, err := h.OAuthStore.FindLinkedUser(ctx, provider, providerID)
	if err != nil && !store.IsNoRows(err) {
		Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	if user == nil {
		// Check if a user with this email already exists (link account)
		existing, err := h.OAuthStore.FindUserByEmail(ctx, email)
		if err != nil && !store.IsNoRows(err) {
			Error(w, http.StatusInternalServerError, "internal error")
			return
		}

		if existing == nil {
			// Create new user
			userID, role, err := h.OAuthStore.CreateUser(ctx, email, displayName)
			if err != nil {
				Error(w, http.StatusInternalServerError, "failed to create user")
				return
			}
			user = &store.OAuthLinkedUser{
				ID:          userID,
				Email:       email,
				DisplayName: displayName,
				Role:        role,
			}
		} else {
			user = existing
		}

		// Link OAuth account
		if err := h.OAuthStore.LinkAccount(ctx, user.ID, provider, providerID, token.AccessToken, token.RefreshToken); err != nil {
			Error(w, http.StatusInternalServerError, "failed to link OAuth account")
			return
		}
	} else {
		// Update stored tokens
		_ = h.OAuthStore.UpdateTokens(ctx, token.AccessToken, token.RefreshToken, provider, providerID)
	}

	// Issue JWT tokens
	pair, err := h.JWT.GenerateTokenPair(user.ID, user.Email, user.Role, "")
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to generate tokens")
		return
	}

	// Extract client metadata
	ipAddr := net.ParseIP(r.RemoteAddr)
	if ipAddr == nil {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		ipAddr = net.ParseIP(host)
	}

	expiresAt := time.Now().Add(h.JWT.RefreshDuration())
	if err := h.OAuthStore.CreateSession(ctx, user.ID, pair.RefreshToken, r.UserAgent(), ipAddr, expiresAt); err != nil {
		Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	setRefreshCookie(w, r, pair.RefreshToken, h.JWT.RefreshDuration())

	JSON(w, http.StatusOK, AuthResponse{
		User: UserResponse{
			ID:          user.ID,
			Email:       user.Email,
			DisplayName: user.DisplayName,
			Role:        user.Role,
		},
		AccessToken: pair.AccessToken,
		ExpiresAt:   pair.ExpiresAt,
	})
}

func generateOAuthState() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

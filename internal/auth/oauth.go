package auth

import (
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
	"golang.org/x/oauth2/google"
)

// OAuthConfigs holds OAuth2 configurations for supported providers.
type OAuthConfigs struct {
	GitHub *oauth2.Config
	Google *oauth2.Config
}

// NewOAuthConfigs creates OAuth2 configurations from client credentials.
func NewOAuthConfigs(baseURL, ghClientID, ghSecret, googleClientID, googleSecret string) *OAuthConfigs {
	configs := &OAuthConfigs{}

	if ghClientID != "" && ghSecret != "" {
		configs.GitHub = &oauth2.Config{
			ClientID:     ghClientID,
			ClientSecret: ghSecret,
			Endpoint:     github.Endpoint,
			RedirectURL:  baseURL + "/auth/github/callback",
			Scopes:       []string{"user:email"},
		}
	}

	if googleClientID != "" && googleSecret != "" {
		configs.Google = &oauth2.Config{
			ClientID:     googleClientID,
			ClientSecret: googleSecret,
			Endpoint:     google.Endpoint,
			RedirectURL:  baseURL + "/auth/google/callback",
			Scopes:       []string{"openid", "email", "profile"},
		}
	}

	return configs
}

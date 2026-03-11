package config

import (
	"strings"

	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/v2"
)

// Config holds all application configuration.
type Config struct {
	Port      int    `koanf:"port"`
	LogLevel  string `koanf:"log_level"`
	LogFormat string `koanf:"log_format"`

	DatabaseURL string `koanf:"database_url"`

	JWTSecret          string `koanf:"jwt_secret"`
	JWTAccessDuration  string `koanf:"jwt_access_duration"`
	JWTRefreshDuration string `koanf:"jwt_refresh_duration"`

	OAuthGitHubClientID     string `koanf:"oauth_github_client_id"`
	OAuthGitHubClientSecret string `koanf:"oauth_github_client_secret"`
	OAuthGoogleClientID     string `koanf:"oauth_google_client_id"`
	OAuthGoogleClientSecret string `koanf:"oauth_google_client_secret"`

	K8sNamespace  string `koanf:"k8s_namespace"`
	K8sInCluster  bool   `koanf:"k8s_in_cluster"`
	K8sKubeconfig string `koanf:"k8s_kubeconfig"`

	WorkerImage string `koanf:"worker_image"`
	WorkerToken string `koanf:"worker_token"`

	BaseURL string `koanf:"base_url"`
}

// Load reads configuration from environment variables prefixed with ST_.
func Load() (*Config, error) {
	k := koanf.New(".")

	if err := k.Load(env.Provider("ST_", ".", func(s string) string {
		return strings.ToLower(strings.TrimPrefix(s, "ST_"))
	}), nil); err != nil {
		return nil, err
	}

	cfg := &Config{
		Port:               8080,
		LogLevel:           "info",
		LogFormat:          "json",
		JWTAccessDuration:  "15m",
		JWTRefreshDuration: "168h",
		K8sNamespace:       "default",
		WorkerImage:        "scaledtest/worker:latest",
		BaseURL:            "http://localhost:8080",
	}

	if err := k.Unmarshal("", cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

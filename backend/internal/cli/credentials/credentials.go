package credentials

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/zalando/go-keyring"
)

const (
	serviceName = "scaledtest-cli"
	tokenKey    = "auth-token"
)

// StoredCredentials represents credentials stored in the keychain.
type StoredCredentials struct {
	Token     string    `json:"token"`
	Email     string    `json:"email"`
	ExpiresAt time.Time `json:"expires_at"`
	ServerURL string    `json:"server_url"`
}

// Store saves credentials securely in the OS keychain.
func Store(creds *StoredCredentials) error {
	data, err := json.Marshal(creds)
	if err != nil {
		return fmt.Errorf("failed to marshal credentials: %w", err)
	}

	if err := keyring.Set(serviceName, tokenKey, string(data)); err != nil {
		// Fall back to file-based storage if keyring is unavailable
		return storeToFile(creds)
	}
	return nil
}

// Load retrieves credentials from the OS keychain.
func Load() (*StoredCredentials, error) {
	data, err := keyring.Get(serviceName, tokenKey)
	if err != nil {
		// Fall back to file-based storage if keyring is unavailable
		return loadFromFile()
	}

	var creds StoredCredentials
	if err := json.Unmarshal([]byte(data), &creds); err != nil {
		return nil, fmt.Errorf("failed to unmarshal credentials: %w", err)
	}

	return &creds, nil
}

// Delete removes credentials from the OS keychain.
func Delete() error {
	if err := keyring.Delete(serviceName, tokenKey); err != nil {
		// Also try to delete file-based credentials
		deleteFile()
		// Ignore keyring errors as credentials might be in file
		return nil
	}
	// Also clean up any file-based credentials
	deleteFile()
	return nil
}

// IsExpired checks if the stored credentials have expired.
func (c *StoredCredentials) IsExpired() bool {
	if c.ExpiresAt.IsZero() {
		return false // No expiration set
	}
	return time.Now().After(c.ExpiresAt)
}

// File-based fallback for environments without keyring support.

func getCredentialsFilePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".scaledtest", "credentials.json"), nil
}

func storeToFile(creds *StoredCredentials) error {
	path, err := getCredentialsFilePath()
	if err != nil {
		return fmt.Errorf("failed to get credentials path: %w", err)
	}

	// Create directory if it doesn't exist
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(creds, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal credentials: %w", err)
	}

	// Write with restrictive permissions (owner read/write only)
	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("failed to write credentials file: %w", err)
	}

	return nil
}

func loadFromFile() (*StoredCredentials, error) {
	path, err := getCredentialsFilePath()
	if err != nil {
		return nil, fmt.Errorf("failed to get credentials path: %w", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("not logged in: no credentials found")
		}
		return nil, fmt.Errorf("failed to read credentials file: %w", err)
	}

	var creds StoredCredentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return nil, fmt.Errorf("failed to unmarshal credentials: %w", err)
	}

	return &creds, nil
}

func deleteFile() {
	path, err := getCredentialsFilePath()
	if err != nil {
		return
	}
	os.Remove(path)
}

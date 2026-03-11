package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

const apiTokenPrefix = "sct_"

// APITokenResult holds the generated token (shown once) and its hash (stored).
type APITokenResult struct {
	Token     string // Full token including prefix — shown to user once
	TokenHash string // SHA-256 hash — stored in database
	Prefix    string // First 8 chars after sct_ — stored for identification
}

// GenerateAPIToken creates a new API token with sct_ prefix.
func GenerateAPIToken() (*APITokenResult, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, fmt.Errorf("generate random bytes: %w", err)
	}

	raw := hex.EncodeToString(b)
	token := apiTokenPrefix + raw

	hash := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(hash[:])

	prefix := raw[:8]

	return &APITokenResult{
		Token:     token,
		TokenHash: tokenHash,
		Prefix:    prefix,
	}, nil
}

// HashAPIToken computes the SHA-256 hash of a full API token for lookup.
func HashAPIToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

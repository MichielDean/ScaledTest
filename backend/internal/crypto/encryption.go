package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

var (
	// ErrInvalidKey is returned when the encryption key is invalid
	ErrInvalidKey = errors.New("invalid encryption key: must be at least 32 bytes")
	// ErrInvalidCiphertext is returned when the ciphertext is too short or malformed
	ErrInvalidCiphertext = errors.New("invalid ciphertext: too short or malformed")
)

// EncryptionService handles encryption and decryption of sensitive data
type EncryptionService struct {
	key []byte
}

// NewEncryptionService creates a new encryption service with the provided master key
// The key should be at least 32 bytes long. If a JWT secret is used, it will be hashed to 32 bytes.
func NewEncryptionService(masterKey string) (*EncryptionService, error) {
	if len(masterKey) == 0 {
		return nil, errors.New("master key cannot be empty")
	}

	// Hash the master key to ensure consistent 32-byte key for AES-256
	hash := sha256.Sum256([]byte(masterKey))
	key := hash[:]

	return &EncryptionService{
		key: key,
	}, nil
}

// Encrypt encrypts plaintext using AES-256-GCM
// Returns base64-encoded ciphertext with nonce prepended
func (s *EncryptionService) Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}

	// Create AES cipher block
	block, err := aes.NewCipher(s.key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Create GCM mode
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Generate random nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Encrypt the plaintext
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)

	// Encode to base64 for storage
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts base64-encoded ciphertext using AES-256-GCM
func (s *EncryptionService) Decrypt(encodedCiphertext string) (string, error) {
	if encodedCiphertext == "" {
		return "", nil
	}

	// Decode from base64
	ciphertext, err := base64.StdEncoding.DecodeString(encodedCiphertext)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	// Create AES cipher block
	block, err := aes.NewCipher(s.key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Create GCM mode
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Validate ciphertext length
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", ErrInvalidCiphertext
	}

	// Extract nonce and actual ciphertext
	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]

	// Decrypt the ciphertext
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt: %w", err)
	}

	return string(plaintext), nil
}

// EncryptBytes encrypts plaintext bytes using AES-256-GCM
// Returns encrypted bytes with nonce prepended (not base64 encoded)
func (s *EncryptionService) EncryptBytes(plaintext []byte) ([]byte, error) {
	if len(plaintext) == 0 {
		return []byte{}, nil
	}

	block, err := aes.NewCipher(s.key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// DecryptBytes decrypts encrypted bytes using AES-256-GCM
func (s *EncryptionService) DecryptBytes(ciphertext []byte) ([]byte, error) {
	if len(ciphertext) == 0 {
		return []byte{}, nil
	}

	block, err := aes.NewCipher(s.key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, ErrInvalidCiphertext
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt: %w", err)
	}

	return plaintext, nil
}

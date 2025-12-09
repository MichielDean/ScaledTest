package crypto

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestNewEncryptionService(t *testing.T) {
	tests := []struct {
		name      string
		masterKey string
		wantErr   bool
	}{
		{
			name:      "valid key",
			masterKey: "test-master-key-with-sufficient-length",
			wantErr:   false,
		},
		{
			name:      "short key (still valid - will be hashed)",
			masterKey: "short",
			wantErr:   false,
		},
		{
			name:      "empty key",
			masterKey: "",
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc, err := NewEncryptionService(tt.masterKey)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewEncryptionService() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && svc == nil {
				t.Error("NewEncryptionService() returned nil service without error")
			}
			if !tt.wantErr && len(svc.key) != 32 {
				t.Errorf("NewEncryptionService() key length = %d, want 32", len(svc.key))
			}
		})
	}
}

func TestEncryptDecrypt(t *testing.T) {
	svc, err := NewEncryptionService("test-jwt-secret-key-with-32-bytes-minimum")
	if err != nil {
		t.Fatalf("Failed to create encryption service: %v", err)
	}

	tests := []struct {
		name      string
		plaintext string
	}{
		{
			name:      "simple string",
			plaintext: "hello world",
		},
		{
			name:      "password",
			plaintext: "SuperSecretPassword123!",
		},
		{
			name:      "empty string",
			plaintext: "",
		},
		{
			name:      "long string",
			plaintext: strings.Repeat("a", 1000),
		},
		{
			name:      "special characters",
			plaintext: "!@#$%^&*()_+-=[]{}|;':\",./<>?",
		},
		{
			name:      "unicode",
			plaintext: "你好世界 🌍 مرحبا",
		},
		{
			name:      "json",
			plaintext: `{"username":"admin","password":"secret"}`,
		},
		{
			name:      "multiline",
			plaintext: "line1\nline2\nline3",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Encrypt
			ciphertext, err := svc.Encrypt(tt.plaintext)
			if err != nil {
				t.Fatalf("Encrypt() error = %v", err)
			}

			// Empty plaintext should return empty ciphertext
			if tt.plaintext == "" {
				if ciphertext != "" {
					t.Errorf("Encrypt() empty plaintext returned non-empty ciphertext")
				}
				return
			}

			// Verify it's base64 encoded
			_, err = base64.StdEncoding.DecodeString(ciphertext)
			if err != nil {
				t.Errorf("Encrypt() did not return valid base64: %v", err)
			}

			// Verify ciphertext is different from plaintext
			if ciphertext == tt.plaintext {
				t.Error("Encrypt() ciphertext matches plaintext")
			}

			// Decrypt
			decrypted, err := svc.Decrypt(ciphertext)
			if err != nil {
				t.Fatalf("Decrypt() error = %v", err)
			}

			// Verify decrypted matches original
			if decrypted != tt.plaintext {
				t.Errorf("Decrypt() = %q, want %q", decrypted, tt.plaintext)
			}
		})
	}
}

func TestEncryptDecryptBytes(t *testing.T) {
	svc, err := NewEncryptionService("test-jwt-secret-key")
	if err != nil {
		t.Fatalf("Failed to create encryption service: %v", err)
	}

	tests := []struct {
		name      string
		plaintext []byte
	}{
		{
			name:      "simple bytes",
			plaintext: []byte("hello world"),
		},
		{
			name:      "empty bytes",
			plaintext: []byte{},
		},
		{
			name:      "binary data",
			plaintext: []byte{0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Encrypt
			ciphertext, err := svc.EncryptBytes(tt.plaintext)
			if err != nil {
				t.Fatalf("EncryptBytes() error = %v", err)
			}

			if len(tt.plaintext) == 0 {
				if len(ciphertext) != 0 {
					t.Errorf("EncryptBytes() empty input returned non-empty output")
				}
				return
			}

			// Decrypt
			decrypted, err := svc.DecryptBytes(ciphertext)
			if err != nil {
				t.Fatalf("DecryptBytes() error = %v", err)
			}

			// Verify decrypted matches original
			if string(decrypted) != string(tt.plaintext) {
				t.Errorf("DecryptBytes() = %v, want %v", decrypted, tt.plaintext)
			}
		})
	}
}

func TestEncryptionDeterminism(t *testing.T) {
	svc, err := NewEncryptionService("test-jwt-secret")
	if err != nil {
		t.Fatalf("Failed to create encryption service: %v", err)
	}

	plaintext := "test data"

	// Encrypt same plaintext multiple times
	ciphertext1, err := svc.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("First Encrypt() error = %v", err)
	}

	ciphertext2, err := svc.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Second Encrypt() error = %v", err)
	}

	// Ciphertexts should be different (due to random nonce)
	if ciphertext1 == ciphertext2 {
		t.Error("Multiple encryptions of same plaintext produced identical ciphertext (nonce not randomized)")
	}

	// But both should decrypt to same plaintext
	decrypted1, err := svc.Decrypt(ciphertext1)
	if err != nil {
		t.Fatalf("First Decrypt() error = %v", err)
	}

	decrypted2, err := svc.Decrypt(ciphertext2)
	if err != nil {
		t.Fatalf("Second Decrypt() error = %v", err)
	}

	if decrypted1 != plaintext || decrypted2 != plaintext {
		t.Errorf("Decrypted values don't match original: got %q and %q, want %q", decrypted1, decrypted2, plaintext)
	}
}

func TestDecryptInvalidData(t *testing.T) {
	svc, err := NewEncryptionService("test-jwt-secret")
	if err != nil {
		t.Fatalf("Failed to create encryption service: %v", err)
	}

	tests := []struct {
		name       string
		ciphertext string
		wantErr    bool
	}{
		{
			name:       "invalid base64",
			ciphertext: "not-valid-base64!!!",
			wantErr:    true,
		},
		{
			name:       "too short",
			ciphertext: base64.StdEncoding.EncodeToString([]byte("short")),
			wantErr:    true,
		},
		{
			name:       "corrupted data",
			ciphertext: base64.StdEncoding.EncodeToString([]byte("this is not encrypted data but long enough")),
			wantErr:    true,
		},
		{
			name:       "empty string",
			ciphertext: "",
			wantErr:    false, // Empty returns empty
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := svc.Decrypt(tt.ciphertext)
			if (err != nil) != tt.wantErr {
				t.Errorf("Decrypt() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestDecryptWithDifferentKey(t *testing.T) {
	svc1, err := NewEncryptionService("key-one")
	if err != nil {
		t.Fatalf("Failed to create first encryption service: %v", err)
	}

	svc2, err := NewEncryptionService("key-two")
	if err != nil {
		t.Fatalf("Failed to create second encryption service: %v", err)
	}

	plaintext := "secret data"

	// Encrypt with first service
	ciphertext, err := svc1.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Encrypt() error = %v", err)
	}

	// Try to decrypt with second service (different key)
	_, err = svc2.Decrypt(ciphertext)
	if err == nil {
		t.Error("Decrypt() with different key succeeded, expected failure")
	}
}

func BenchmarkEncrypt(b *testing.B) {
	svc, _ := NewEncryptionService("benchmark-key")
	plaintext := "benchmark data with reasonable length for testing performance"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = svc.Encrypt(plaintext)
	}
}

func BenchmarkDecrypt(b *testing.B) {
	svc, _ := NewEncryptionService("benchmark-key")
	plaintext := "benchmark data with reasonable length for testing performance"
	ciphertext, _ := svc.Encrypt(plaintext)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = svc.Decrypt(ciphertext)
	}
}

func BenchmarkEncryptBytes(b *testing.B) {
	svc, _ := NewEncryptionService("benchmark-key")
	plaintext := []byte("benchmark data with reasonable length for testing performance")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = svc.EncryptBytes(plaintext)
	}
}

func BenchmarkDecryptBytes(b *testing.B) {
	svc, _ := NewEncryptionService("benchmark-key")
	plaintext := []byte("benchmark data with reasonable length for testing performance")
	ciphertext, _ := svc.EncryptBytes(plaintext)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = svc.DecryptBytes(ciphertext)
	}
}

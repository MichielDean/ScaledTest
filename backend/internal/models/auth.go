package models

// AuthUser represents a user for authentication purposes.
// This is used by the auth system and contains the password hash.
type AuthUser struct {
	ID             string `json:"id"`
	Email          string `json:"email"`
	Name           string `json:"name"`
	Role           string `json:"role"`
	HashedPassword string `json:"-"` // Never serialize password hash
}

// AuthResult represents the result of a successful authentication.
type AuthResult struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
	User        *User  `json:"user"`
}

package models

import "time"

// User represents an authenticated user
type User struct {
	ID                string    `json:"id"`
	Email             string    `json:"email"`
	Name              string    `json:"name"`
	Role              UserRole  `json:"role"`
	EmailVerified     bool      `json:"email_verified"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// UserRole represents the role of a user in the system
type UserRole string

const (
	UserRoleUser  UserRole = "user"
	UserRoleAdmin UserRole = "admin"
)

// Profile represents extended user information stored in public.profiles
type Profile struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	AvatarURL *string   `json:"avatar_url,omitempty"`
	Bio       *string   `json:"bio,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

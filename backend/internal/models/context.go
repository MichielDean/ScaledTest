package models

// ContextKey is a type for context keys to avoid collisions.
type ContextKey string

const (
	// UserIDKey is the context key for user ID.
	UserIDKey ContextKey = "user_id"
	// UserRoleKey is the context key for user role.
	UserRoleKey ContextKey = "user_role"
	// TokenTypeKey is the context key for token type.
	TokenTypeKey ContextKey = "token_type"
	// ProjectIDKey is the context key for project ID.
	ProjectIDKey ContextKey = "project_id"
	// K8sJobNameKey is the context key for Kubernetes job name.
	K8sJobNameKey ContextKey = "k8s_job_name"
)

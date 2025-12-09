package models

import "time"

// Project represents a test project that organizes test execution
type Project struct {
	ID                     string            `json:"id"`
	Name                   string            `json:"name"`
	Description            *string           `json:"description,omitempty"`
	GitRepositoryURL       *string           `json:"git_repository_url,omitempty"`
	CreatedBy              string            `json:"created_by"`
	OrganizationID         *string           `json:"organization_id,omitempty"`
	Settings               map[string]string `json:"settings,omitempty"`
	DefaultTestEnvironment Environment       `json:"default_test_environment"`
	SetupCompleted         bool              `json:"setup_completed"`
	CreatedAt              time.Time         `json:"created_at"`
	UpdatedAt              time.Time         `json:"updated_at"`
}

// Environment represents a deployment environment
// Used for both projects (default_test_environment) and clusters (environment)
// This is the canonical type - types.ClusterEnvironment is deprecated
type Environment string

const (
	EnvironmentDev     Environment = "dev"
	EnvironmentStaging Environment = "staging"
	EnvironmentProd    Environment = "prod"
	EnvironmentCustom  Environment = "custom"
)

// ClusterEnvironment is an alias for Environment for backward compatibility
// Deprecated: Use Environment directly
type ClusterEnvironment = Environment

// Backward compatible constants
const (
	ClusterEnvironmentDev     = EnvironmentDev
	ClusterEnvironmentStaging = EnvironmentStaging
	ClusterEnvironmentProd    = EnvironmentProd
	ClusterEnvironmentCustom  = EnvironmentCustom
)

// IsValid checks if the environment value is valid
func (e Environment) IsValid() bool {
	switch e {
	case EnvironmentDev, EnvironmentStaging, EnvironmentProd, EnvironmentCustom:
		return true
	}
	return false
}

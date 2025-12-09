package models

import "time"

// ContainerRegistry represents a container registry connection
type ContainerRegistry struct {
	ID           string             `json:"id"`
	Name         string             `json:"name"`
	RegistryURL  string             `json:"registry_url"`
	RegistryType RegistryType       `json:"registry_type"`
	Username     *string            `json:"username,omitempty"`
	AuthType     RegistryAuthType   `json:"auth_type"`
	ProjectID    *string            `json:"project_id,omitempty"`
	CreatedBy    string             `json:"created_by"`
	LastTestedAt *time.Time         `json:"last_tested_at,omitempty"`
	TestStatus   *RegistryStatus    `json:"test_status,omitempty"`
	TestError    *string            `json:"test_error,omitempty"`
	CreatedAt    time.Time          `json:"created_at"`
	UpdatedAt    time.Time          `json:"updated_at"`
}

// RegistryType represents the type of container registry
type RegistryType string

const (
	RegistryTypeDockerHub   RegistryType = "dockerhub"
	RegistryTypeGitHub      RegistryType = "github"
	RegistryTypeGCR         RegistryType = "gcr"
	RegistryTypeACR         RegistryType = "acr"
	RegistryTypeNexus       RegistryType = "nexus"
	RegistryTypeArtifactory RegistryType = "artifactory"
	RegistryTypeGeneric     RegistryType = "generic"
)

// RegistryAuthType represents the authentication method for a registry
type RegistryAuthType string

const (
	RegistryAuthTypeBasic RegistryAuthType = "basic"
	RegistryAuthTypeToken RegistryAuthType = "token"
	RegistryAuthTypeOAuth RegistryAuthType = "oauth"
)

// RegistryStatus represents the status of a registry connection test
type RegistryStatus string

const (
	RegistryStatusSuccess RegistryStatus = "success"
	RegistryStatusFailed  RegistryStatus = "failed"
	RegistryStatusPending RegistryStatus = "pending"
)

// TestImage represents a container image with discovered tests
type TestImage struct {
	ID               string           `json:"id"`
	RegistryID       string           `json:"registry_id"`
	ImagePath        string           `json:"image_path"`
	ImageTag         string           `json:"image_tag"`
	ImageDigest      *string          `json:"image_digest,omitempty"`
	DiscoveredTests  []DiscoveredTest `json:"discovered_tests,omitempty"`
	DiscoveryStatus  DiscoveryStatus  `json:"discovery_status"`
	DiscoveryError   *string          `json:"discovery_error,omitempty"`
	Framework        *string          `json:"framework,omitempty"`
	FrameworkVersion *string          `json:"framework_version,omitempty"`
	TotalTestCount   int              `json:"total_test_count"`
	LastDiscoveredAt *time.Time       `json:"last_discovered_at,omitempty"`
	ProjectID        *string          `json:"project_id,omitempty"`
	CreatedBy        string           `json:"created_by"`
	CreatedAt        time.Time        `json:"created_at"`
	UpdatedAt        time.Time        `json:"updated_at"`
}

// DiscoveredTest represents a test discovered in a container image
type DiscoveredTest struct {
	ID    string   `json:"id"`
	Name  string   `json:"name"`
	Suite *string  `json:"suite,omitempty"`
	File  string   `json:"file"`
	Tags  []string `json:"tags,omitempty"`
}

// DiscoveryStatus represents the status of test discovery for an image
type DiscoveryStatus string

const (
	DiscoveryStatusPending     DiscoveryStatus = "pending"
	DiscoveryStatusDiscovering DiscoveryStatus = "discovering"
	DiscoveryStatusDiscovered  DiscoveryStatus = "discovered"
	DiscoveryStatusFailed      DiscoveryStatus = "failed"
)

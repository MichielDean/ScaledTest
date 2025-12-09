package models

import (
	"fmt"
	"time"
)

// K8sCluster represents a Kubernetes cluster configuration
type K8sCluster struct {
	ID               string        `json:"id"`
	Name             string        `json:"name"`
	Description      *string       `json:"description,omitempty"`
	APIServerURL     string        `json:"api_server_url"`
	Namespace        string        `json:"namespace"`
	AuthType         K8sAuthType   `json:"auth_type"`
	SkipTLSVerify    bool          `json:"skip_tls_verify"`
	RunnerConfig     *RunnerConfig `json:"runner_config,omitempty"`
	Environment      Environment   `json:"environment"`
	SutConfig        *SutConfig    `json:"sut_config,omitempty"`
	IsDefault        bool          `json:"is_default"`
	IsActive         bool          `json:"is_active"`
	LastConnectedAt  *time.Time    `json:"last_connected_at,omitempty"`
	ConnectionStatus string        `json:"connection_status"`
	ConnectionError  *string       `json:"connection_error,omitempty"`
	ProjectID        *string       `json:"project_id,omitempty"`
	CreatedBy        string        `json:"created_by"`
	CreatedAt        time.Time     `json:"created_at"`
	UpdatedAt        time.Time     `json:"updated_at"`
}

// K8sAuthType represents the authentication method for connecting to a K8s cluster
type K8sAuthType string

const (
	K8sAuthTypeToken       K8sAuthType = "token"
	K8sAuthTypeCertificate K8sAuthType = "certificate"
	K8sAuthTypeKubeconfig  K8sAuthType = "kubeconfig"
)

// K8sClusterCredentials contains decrypted credentials for connecting to a cluster
// These are never serialized to JSON responses
type K8sClusterCredentials struct {
	APIServerURL      string
	Namespace         string
	AuthType          K8sAuthType
	BearerToken       string
	ClientCertificate string
	ClientKey         string
	CACertificate     string
	SkipTLSVerify     bool
	Kubeconfig        string
}

// RunnerConfig contains all user-configurable settings for test execution
type RunnerConfig struct {
	// PlatformAPIURL is the URL test containers use to reach the ScaledTest API
	PlatformAPIURL string `json:"platform_api_url"`

	// DefaultBaseURL is the URL where the Application Under Test is accessible
	DefaultBaseURL string `json:"default_base_url"`

	// ServiceAccountName is the K8s service account for test pods
	ServiceAccountName string `json:"service_account_name"`

	// ArtifactsPVCName is the PVC name for storing test artifacts
	ArtifactsPVCName string `json:"artifacts_pvc_name,omitempty"`

	// DefaultTimeout is the default job timeout in seconds
	DefaultTimeout int32 `json:"default_timeout"`

	// DefaultParallelism is the max number of concurrent test pods
	DefaultParallelism int32 `json:"default_parallelism"`

	// DefaultResources contains default resource requests and limits
	DefaultResources ResourceRequirements `json:"default_resources"`

	// NodeSelector for pod scheduling
	NodeSelector map[string]string `json:"node_selector,omitempty"`

	// ImagePullPolicy for test container images
	ImagePullPolicy string `json:"image_pull_policy"`
}

// ResourceRequirements defines CPU and memory settings for pods
type ResourceRequirements struct {
	CPURequest    string `json:"cpu_request"`
	CPULimit      string `json:"cpu_limit"`
	MemoryRequest string `json:"memory_request"`
	MemoryLimit   string `json:"memory_limit"`
}

// DefaultRunnerConfig returns a RunnerConfig with sensible defaults
func DefaultRunnerConfig() *RunnerConfig {
	return &RunnerConfig{
		PlatformAPIURL:     "",
		DefaultBaseURL:     "",
		ServiceAccountName: "default",
		ArtifactsPVCName:   "",
		DefaultTimeout:     3600,
		DefaultParallelism: 5,
		DefaultResources: ResourceRequirements{
			CPURequest:    "100m",
			CPULimit:      "1000m",
			MemoryRequest: "256Mi",
			MemoryLimit:   "1Gi",
		},
		NodeSelector:    map[string]string{},
		ImagePullPolicy: "IfNotPresent",
	}
}

// SutConfig contains configuration for the System Under Test when running in the same cluster
type SutConfig struct {
	// ServiceName is the K8s service name of the application under test
	ServiceName string `json:"service_name"`

	// Namespace is the K8s namespace where the SUT is deployed
	Namespace string `json:"namespace"`

	// Port is the port the SUT service listens on
	Port int `json:"port"`

	// Protocol is http or https (default: http)
	Protocol string `json:"protocol,omitempty"`
}

// InternalURL generates the internal Kubernetes DNS URL for the SUT
// Format: {protocol}://{service_name}.{namespace}.svc.cluster.local:{port}
func (s *SutConfig) InternalURL() string {
	if s == nil || s.ServiceName == "" || s.Namespace == "" {
		return ""
	}

	protocol := s.Protocol
	if protocol == "" {
		protocol = "http"
	}

	port := s.Port
	if port == 0 {
		if protocol == "https" {
			port = 443
		} else {
			port = 80
		}
	}

	return fmt.Sprintf("%s://%s.%s.svc.cluster.local:%d", protocol, s.ServiceName, s.Namespace, port)
}

// IsConfigured returns true if the SUT config has minimum required fields
func (s *SutConfig) IsConfigured() bool {
	return s != nil && s.ServiceName != "" && s.Namespace != ""
}

// Validate checks if the SUT config is valid
func (s *SutConfig) Validate() error {
	if s == nil {
		return nil // nil is valid (not configured)
	}

	if s.ServiceName == "" {
		return fmt.Errorf("service_name is required when configuring SUT")
	}

	if s.Namespace == "" {
		return fmt.Errorf("namespace is required when configuring SUT")
	}

	if s.Port < 0 || s.Port > 65535 {
		return fmt.Errorf("port must be between 0 and 65535")
	}

	if s.Protocol != "" && s.Protocol != "http" && s.Protocol != "https" {
		return fmt.Errorf("protocol must be 'http' or 'https'")
	}

	return nil
}

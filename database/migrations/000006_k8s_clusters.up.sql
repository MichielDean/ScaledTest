-- K8s clusters table with runner configuration
-- Stores cluster connection details, environment settings, and runner config

-- K8s clusters table
CREATE TABLE IF NOT EXISTS public.k8s_clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    
    -- Connection details
    api_server_url TEXT NOT NULL,
    namespace TEXT NOT NULL DEFAULT 'default',
    
    -- Authentication (one of these methods)
    auth_type TEXT NOT NULL DEFAULT 'token', -- 'token', 'certificate', 'kubeconfig'
    
    -- Token-based auth (service account token)
    bearer_token TEXT,
    
    -- Certificate-based auth
    client_certificate TEXT,
    client_key TEXT,
    
    -- CA certificate for verifying API server
    ca_certificate TEXT,
    skip_tls_verify BOOLEAN DEFAULT FALSE,
    
    -- Full kubeconfig (alternative to individual fields)
    kubeconfig TEXT,
    
    -- Runner configuration (consolidated from 08-add-runner-config-to-clusters.sql)
    runner_config JSONB DEFAULT '{
        "platformApiUrl": "",
        "serviceAccountName": "default",
        "artifactsPvcName": "",
        "defaultTimeout": 3600,
        "defaultParallelism": 5,
        "defaultResources": {
            "cpuRequest": "100m",
            "cpuLimit": "1000m",
            "memoryRequest": "256Mi",
            "memoryLimit": "1Gi"
        },
        "nodeSelector": {},
        "tolerations": [],
        "imagePullPolicy": "IfNotPresent"
    }'::jsonb,
    
    -- Environment (consolidated from 10-add-cluster-environment.sql)
    environment VARCHAR(20) DEFAULT 'dev',
    
    -- SUT (System Under Test) configuration for same-cluster testing
    sut_config JSONB DEFAULT NULL,
    
    -- Status and metadata
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_connected_at TIMESTAMPTZ,
    connection_status TEXT DEFAULT 'unknown', -- 'connected', 'failed', 'unknown'
    connection_error TEXT,
    
    -- Ownership
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(project_id, name),
    CONSTRAINT k8s_clusters_environment_check 
        CHECK (environment IN ('dev', 'staging', 'prod', 'custom'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_k8s_clusters_project_id ON public.k8s_clusters(project_id);
CREATE INDEX IF NOT EXISTS idx_k8s_clusters_created_by ON public.k8s_clusters(created_by);
CREATE INDEX IF NOT EXISTS idx_k8s_clusters_environment ON public.k8s_clusters(project_id, environment);

-- Ensure only one default cluster per project per environment
CREATE UNIQUE INDEX IF NOT EXISTS idx_k8s_clusters_single_default_per_env 
    ON public.k8s_clusters(project_id, environment) 
    WHERE is_default = TRUE;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.k8s_clusters TO scaledtest;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_k8s_clusters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_k8s_clusters_updated_at ON public.k8s_clusters;
CREATE TRIGGER trigger_k8s_clusters_updated_at
    BEFORE UPDATE ON public.k8s_clusters
    FOR EACH ROW
    EXECUTE FUNCTION public.update_k8s_clusters_updated_at();

-- Comments
COMMENT ON COLUMN public.k8s_clusters.runner_config IS 'Configuration for test runner jobs. Contains:
- platformApiUrl: URL for test containers to reach the ScaledTest API (required)
- serviceAccountName: K8s service account for running test pods (default: "default")
- artifactsPvcName: PVC name for test artifacts storage (optional)
- defaultTimeout: Default job timeout in seconds (default: 3600)
- defaultParallelism: Max concurrent test pods (default: 5)
- defaultResources: Default CPU/memory requests and limits
- nodeSelector: Node selector for pod scheduling
- tolerations: Pod tolerations for scheduling
- imagePullPolicy: Container image pull policy (default: "IfNotPresent")';

COMMENT ON COLUMN public.k8s_clusters.environment IS 'Deployment environment this cluster represents: dev, staging, prod, or custom';

COMMENT ON COLUMN public.k8s_clusters.sut_config IS 'System Under Test configuration for same-cluster testing. Contains:
- service_name: K8s service name of the application under test
- namespace: K8s namespace where the SUT is deployed
- port: Port the SUT service listens on
- protocol: http or https (default: http)
When configured, generates internal URL: {protocol}://{service_name}.{namespace}.svc.cluster.local:{port}';

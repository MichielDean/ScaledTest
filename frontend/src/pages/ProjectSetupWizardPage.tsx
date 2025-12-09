import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Progress } from "../components/ui/progress";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../contexts/AuthContext";
import { createApiClient } from "../lib/api";
import { createK8sPlatformApi } from "../lib/k8s-platform-api";
import type {
  CreateProjectRequest,
  CreateK8sClusterRequest,
  AddContainerRegistryRequest,
  ClusterEnvironment,
} from "../types/k8s-platform";

// Wizard step type
type WizardStep = "project" | "cluster" | "registry" | "summary";

const STEPS: WizardStep[] = ["project", "cluster", "registry", "summary"];

const STEP_TITLES: Record<WizardStep, string> = {
  project: "Project Details",
  cluster: "Kubernetes Cluster",
  registry: "Container Registry",
  summary: "Review & Create",
};

// Form data types
interface ProjectFormData {
  name: string;
  description: string;
  gitRepositoryUrl: string;
  defaultTestEnvironment: ClusterEnvironment;
}

interface ClusterFormData {
  name: string;
  apiServerUrl: string;
  auth_type: "kubeconfig" | "service_account" | "oidc";
  credentials: string;
  namespace: string;
  environment: ClusterEnvironment;
  isDefault: boolean;
  sut_service_name: string;
  sut_namespace: string;
  sut_port: string;
  sut_protocol: "http" | "https";
}

interface RegistryFormData {
  name: string;
  registryUrl: string;
  registryType: string;
  username: string;
  password: string;
  auth_type: "basic" | "token";
}

const ProjectSetupWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [currentStep, setCurrentStep] = useState<WizardStep>("project");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data state
  const [projectData, setProjectData] = useState<ProjectFormData>({
    name: "",
    description: "",
    gitRepositoryUrl: "",
    defaultTestEnvironment: "dev",
  });

  const [clusterData, setClusterData] = useState<ClusterFormData>({
    name: "",
    apiServerUrl: "",
    auth_type: "kubeconfig",
    credentials: "",
    namespace: "default",
    environment: "dev",
    isDefault: true,
    sut_service_name: "",
    sut_namespace: "",
    sut_port: "80",
    sut_protocol: "http",
  });

  const [registryData, setRegistryData] = useState<RegistryFormData>({
    name: "",
    registryUrl: "",
    registryType: "dockerhub",
    username: "",
    password: "",
    auth_type: "basic",
  });

  const [skipCluster, setSkipCluster] = useState(false);
  const [skipRegistry, setSkipRegistry] = useState(false);

  // API client
  const getToken = useCallback(() => session?.accessToken ?? null, [session]);
  const apiClient = createApiClient(getToken);
  const k8sApi = createK8sPlatformApi(apiClient);

  // Calculate progress
  const currentStepIndex = STEPS.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  // Navigation handlers
  const goToStep = useCallback((step: WizardStep) => {
    setError(null);
    setCurrentStep(step);
  }, []);

  const goNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      goToStep(STEPS[nextIndex]);
    }
  }, [currentStepIndex, goToStep]);

  const goBack = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      goToStep(STEPS[prevIndex]);
    }
  }, [currentStepIndex, goToStep]);

  // Validation
  const validateProject = useCallback((): boolean => {
    if (!projectData.name.trim()) {
      setError("Project name is required");
      return false;
    }
    return true;
  }, [projectData.name]);

  const validateCluster = useCallback((): boolean => {
    if (skipCluster) return true;
    if (!clusterData.name.trim()) {
      setError("Cluster name is required");
      return false;
    }
    if (!clusterData.apiServerUrl.trim()) {
      setError("API server URL is required");
      return false;
    }
    if (!clusterData.credentials.trim()) {
      setError("Cluster credentials are required");
      return false;
    }
    return true;
  }, [skipCluster, clusterData]);

  const validateRegistry = useCallback((): boolean => {
    if (skipRegistry) return true;
    if (!registryData.registryUrl.trim()) {
      setError("Registry URL is required");
      return false;
    }
    if (!registryData.username.trim() || !registryData.password.trim()) {
      setError("Registry credentials are required");
      return false;
    }
    return true;
  }, [skipRegistry, registryData]);

  // Step navigation with validation
  const handleNext = useCallback(() => {
    setError(null);
    
    if (currentStep === "project" && !validateProject()) return;
    if (currentStep === "cluster" && !validateCluster()) return;
    if (currentStep === "registry" && !validateRegistry()) return;
    
    goNext();
  }, [currentStep, validateProject, validateCluster, validateRegistry, goNext]);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      // Step 1: Create project
      const projectRequest: CreateProjectRequest = {
        name: projectData.name,
        description: projectData.description || undefined,
        gitRepositoryUrl: projectData.gitRepositoryUrl || undefined,
      };

      const projectResult = await k8sApi.createProject(projectRequest);
      if (projectResult.error || !projectResult.data) {
        throw new Error(projectResult.error || "Failed to create project");
      }

      const projectId = projectResult.data.project_id;

      // Step 2: Create cluster (if not skipped)
      if (!skipCluster && clusterData.name) {
        const clusterRequest: CreateK8sClusterRequest = {
          projectId: projectId,
          name: clusterData.name,
          apiServerUrl: clusterData.apiServerUrl,
          authType: clusterData.auth_type,
          kubeconfig: clusterData.credentials,
          namespace: clusterData.namespace || "default",
          isDefault: clusterData.isDefault,
          environment: clusterData.environment,
        };

        // Add SUT config if provided
        if (clusterData.sut_service_name && clusterData.sut_namespace) {
          clusterRequest.sutConfig = {
            serviceName: clusterData.sut_service_name,
            namespace: clusterData.sut_namespace,
            port: parseInt(clusterData.sut_port, 10) || 80,
            protocol: clusterData.sut_protocol,
          };
        }

        const clusterResult = await k8sApi.createCluster(clusterRequest);
        if (clusterResult.error) {
          throw new Error(clusterResult.error || "Failed to create cluster");
        }
      }

      // Step 3: Create registry (if not skipped)
      if (!skipRegistry && registryData.registryUrl) {
        const registryRequest: AddContainerRegistryRequest = {
          projectId: projectId,
          name: registryData.name || "Default Registry",
          registryUrl: registryData.registryUrl,
          registryType: registryData.registryType,
          username: registryData.username,
          password: registryData.password,
          authType: registryData.auth_type,
        };

        const registryResult = await apiClient.post("/api/v1/container-registries", registryRequest);
        if (registryResult.error) {
          throw new Error(registryResult.error || "Failed to create registry");
        }
      }

      // Navigate to the new project
      navigate(`/projects/${projectId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create project";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    projectData,
    clusterData,
    registryData,
    skipCluster,
    skipRegistry,
    k8sApi,
    apiClient,
    navigate,
  ]);

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case "project":
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name *</Label>
              <Input
                id="project-name"
                value={projectData.name}
                onChange={(e) =>
                  setProjectData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="my-test-project"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                value={projectData.description}
                onChange={(e) =>
                  setProjectData((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Brief description of your test project"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-git-url">Git Repository URL</Label>
              <Input
                id="project-git-url"
                value={projectData.gitRepositoryUrl}
                onChange={(e) =>
                  setProjectData((prev) => ({ ...prev, gitRepositoryUrl: e.target.value }))
                }
                placeholder="https://github.com/org/repo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="default-environment">Default Test Environment</Label>
              <Select
                value={projectData.defaultTestEnvironment}
                onValueChange={(value: ClusterEnvironment) =>
                  setProjectData((prev) => ({ ...prev, defaultTestEnvironment: value }))
                }
              >
                <SelectTrigger id="default-environment">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dev">Development</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="prod">Production</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "cluster":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="skip-cluster"
                checked={skipCluster}
                onChange={(e) => setSkipCluster(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="skip-cluster">Skip cluster configuration (set up later)</Label>
            </div>

            {!skipCluster && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cluster-name">Cluster Name *</Label>
                    <Input
                      id="cluster-name"
                      value={clusterData.name}
                      onChange={(e) =>
                        setClusterData((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="dev-cluster"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cluster-environment">Environment</Label>
                    <Select
                      value={clusterData.environment}
                      onValueChange={(value: ClusterEnvironment) =>
                        setClusterData((prev) => ({ ...prev, environment: value }))
                      }
                    >
                      <SelectTrigger id="cluster-environment">
                        <SelectValue placeholder="Select environment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dev">Development</SelectItem>
                        <SelectItem value="staging">Staging</SelectItem>
                        <SelectItem value="prod">Production</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cluster-api-url">API Server URL *</Label>
                  <Input
                    id="cluster-api-url"
                    value={clusterData.apiServerUrl}
                    onChange={(e) =>
                      setClusterData((prev) => ({ ...prev, apiServerUrl: e.target.value }))
                    }
                    placeholder="https://kubernetes.example.com:6443"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cluster-auth-type">Authentication Type</Label>
                    <Select
                      value={clusterData.auth_type}
                      onValueChange={(value: "kubeconfig" | "service_account" | "oidc") =>
                        setClusterData((prev) => ({ ...prev, auth_type: value }))
                      }
                    >
                      <SelectTrigger id="cluster-auth-type">
                        <SelectValue placeholder="Select auth type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kubeconfig">Kubeconfig</SelectItem>
                        <SelectItem value="service_account">Service Account</SelectItem>
                        <SelectItem value="oidc">OIDC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cluster-namespace">Default Namespace</Label>
                    <Input
                      id="cluster-namespace"
                      value={clusterData.namespace}
                      onChange={(e) =>
                        setClusterData((prev) => ({ ...prev, namespace: e.target.value }))
                      }
                      placeholder="default"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cluster-credentials">Credentials (kubeconfig/token) *</Label>
                  <Textarea
                    id="cluster-credentials"
                    value={clusterData.credentials}
                    onChange={(e) =>
                      setClusterData((prev) => ({ ...prev, credentials: e.target.value }))
                    }
                    placeholder="Paste your kubeconfig or service account token here"
                    rows={6}
                    className="font-mono text-sm"
                  />
                </div>

                <Card className="border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">System Under Test (SUT) Configuration</CardTitle>
                    <CardDescription className="text-xs">
                      Optional: Configure if your tests run against a service in the same cluster
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="sut-service-name">Service Name</Label>
                        <Input
                          id="sut-service-name"
                          value={clusterData.sut_service_name}
                          onChange={(e) =>
                            setClusterData((prev) => ({ ...prev, sut_service_name: e.target.value }))
                          }
                          placeholder="my-app"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="sut-namespace">Namespace</Label>
                        <Input
                          id="sut-namespace"
                          value={clusterData.sut_namespace}
                          onChange={(e) =>
                            setClusterData((prev) => ({ ...prev, sut_namespace: e.target.value }))
                          }
                          placeholder="default"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="sut-port">Port</Label>
                        <Input
                          id="sut-port"
                          type="number"
                          value={clusterData.sut_port}
                          onChange={(e) =>
                            setClusterData((prev) => ({ ...prev, sut_port: e.target.value }))
                          }
                          placeholder="80"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="sut-protocol">Protocol</Label>
                        <Select
                          value={clusterData.sut_protocol}
                          onValueChange={(value: "http" | "https") =>
                            setClusterData((prev) => ({ ...prev, sut_protocol: value }))
                          }
                        >
                          <SelectTrigger id="sut-protocol">
                            <SelectValue placeholder="Select protocol" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="http">HTTP</SelectItem>
                            <SelectItem value="https">HTTPS</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {clusterData.sut_service_name && clusterData.sut_namespace && (
                      <Alert>
                        <AlertDescription>
                          Internal URL:{" "}
                          <code className="bg-muted px-1 rounded">
                            {clusterData.sut_protocol}://{clusterData.sut_service_name}.
                            {clusterData.sut_namespace}.svc.cluster.local:
                            {clusterData.sut_port}
                          </code>
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        );

      case "registry":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="skip-registry"
                checked={skipRegistry}
                onChange={(e) => setSkipRegistry(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="skip-registry">Skip registry configuration (set up later)</Label>
            </div>

            {!skipRegistry && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="registry-name">Registry Name</Label>
                    <Input
                      id="registry-name"
                      value={registryData.name}
                      onChange={(e) =>
                        setRegistryData((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="Docker Hub"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="registry-type">Registry Type</Label>
                    <Select
                      value={registryData.registryType}
                      onValueChange={(value) =>
                        setRegistryData((prev) => ({ ...prev, registryType: value }))
                      }
                    >
                      <SelectTrigger id="registry-type">
                        <SelectValue placeholder="Select registry type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dockerhub">Docker Hub</SelectItem>
                        <SelectItem value="github">GitHub Container Registry</SelectItem>
                        <SelectItem value="gcr">Google Container Registry</SelectItem>
                        <SelectItem value="acr">Azure Container Registry</SelectItem>
                        <SelectItem value="nexus">Nexus</SelectItem>
                        <SelectItem value="artifactory">Artifactory</SelectItem>
                        <SelectItem value="generic">Generic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registry-url">Registry URL *</Label>
                  <Input
                    id="registry-url"
                    value={registryData.registryUrl}
                    onChange={(e) =>
                      setRegistryData((prev) => ({ ...prev, registryUrl: e.target.value }))
                    }
                    placeholder="https://registry.example.com"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="registry-username">Username *</Label>
                    <Input
                      id="registry-username"
                      value={registryData.username}
                      onChange={(e) =>
                        setRegistryData((prev) => ({ ...prev, username: e.target.value }))
                      }
                      placeholder="username"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="registry-password">Password/Token *</Label>
                    <Input
                      id="registry-password"
                      type="password"
                      value={registryData.password}
                      onChange={(e) =>
                        setRegistryData((prev) => ({ ...prev, password: e.target.value }))
                      }
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registry-auth-type">Authentication Type</Label>
                  <Select
                    value={registryData.auth_type}
                    onValueChange={(value: "basic" | "token") =>
                      setRegistryData((prev) => ({ ...prev, auth_type: value }))
                    }
                  >
                    <SelectTrigger id="registry-auth-type">
                      <SelectValue placeholder="Select auth type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic Auth</SelectItem>
                      <SelectItem value="token">Token</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        );

      case "summary":
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{projectData.name}</span>
                </div>
                {projectData.description && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Description:</span>
                    <span className="font-medium">{projectData.description}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Default Environment:</span>
                  <Badge variant="secondary">{projectData.defaultTestEnvironment}</Badge>
                </div>
                {projectData.gitRepositoryUrl && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Git URL:</span>
                    <span className="font-medium text-sm truncate max-w-[200px]">
                      {projectData.gitRepositoryUrl}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Kubernetes Cluster</CardTitle>
              </CardHeader>
              <CardContent>
                {skipCluster ? (
                  <span className="text-muted-foreground italic">Skipped - configure later</span>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name:</span>
                      <span className="font-medium">{clusterData.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Environment:</span>
                      <Badge variant="secondary">{clusterData.environment}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">API Server:</span>
                      <span className="font-medium text-sm truncate max-w-[200px]">
                        {clusterData.apiServerUrl}
                      </span>
                    </div>
                    {clusterData.sut_service_name && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SUT:</span>
                        <span className="font-medium text-sm">
                          {clusterData.sut_service_name}.{clusterData.sut_namespace}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Container Registry</CardTitle>
              </CardHeader>
              <CardContent>
                {skipRegistry ? (
                  <span className="text-muted-foreground italic">Skipped - configure later</span>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name:</span>
                      <span className="font-medium">{registryData.name || "Default Registry"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <Badge variant="secondary">{registryData.registryType}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">URL:</span>
                      <span className="font-medium text-sm truncate max-w-[200px]">
                        {registryData.registryUrl}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Create New Project</h1>
        <p className="text-muted-foreground">
          Set up a new test project with Kubernetes cluster and container registry configuration.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {STEPS.map((step, index) => (
            <button
              key={step}
              onClick={() => index <= currentStepIndex && goToStep(step)}
              disabled={index > currentStepIndex}
              className={`text-sm font-medium transition-colors ${
                index === currentStepIndex
                  ? "text-primary"
                  : index < currentStepIndex
                  ? "text-muted-foreground hover:text-primary cursor-pointer"
                  : "text-muted-foreground/50 cursor-not-allowed"
              }`}
            >
              {STEP_TITLES[step]}
            </button>
          ))}
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Error display */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEP_TITLES[currentStep]}</CardTitle>
          <CardDescription>
            Step {currentStepIndex + 1} of {STEPS.length}
          </CardDescription>
        </CardHeader>
        <CardContent>{renderStepContent()}</CardContent>
      </Card>

      {/* Navigation buttons */}
      <div className="flex justify-between mt-6">
        <Button
          id="wizard-back-button"
          variant="outline"
          onClick={goBack}
          disabled={currentStepIndex === 0}
        >
          Back
        </Button>

        <div className="flex gap-2">
          <Button
            id="wizard-cancel-button"
            variant="ghost"
            onClick={() => navigate("/projects")}
          >
            Cancel
          </Button>

          {currentStep === "summary" ? (
            <Button
              id="wizard-create-button"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create Project"}
            </Button>
          ) : (
            <Button id="wizard-next-button" onClick={handleNext}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectSetupWizardPage;

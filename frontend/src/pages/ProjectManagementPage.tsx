import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Alert, AlertDescription } from "../components/ui/alert";
import { useAuth } from "../contexts/AuthContext";
import { createApiClient } from "../lib/api";
import { createK8sPlatformApi } from "../lib/k8s-platform-api";
import type {
  Project,
  K8sCluster,
  ContainerRegistry,
  TestImage,
  TestJob,
  ClusterEnvironment,
} from "../types/k8s-platform";

const ProjectManagementPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  
  const [project, setProject] = useState<Project | null>(null);
  const [clusters, setClusters] = useState<K8sCluster[]>([]);
  const [registries, setRegistries] = useState<ContainerRegistry[]>([]);
  const [images, setImages] = useState<TestImage[]>([]);
  const [jobs, setJobs] = useState<TestJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Use refs for API clients to avoid dependency issues in useEffect
  const getToken = useCallback(() => session?.accessToken ?? null, [session?.accessToken]);
  const apiClientRef = useRef(createApiClient(getToken));
  const k8sApiRef = useRef(createK8sPlatformApi(apiClientRef.current));
  
  // Update refs when token changes
  useEffect(() => {
    apiClientRef.current = createApiClient(getToken);
    k8sApiRef.current = createK8sPlatformApi(apiClientRef.current);
  }, [getToken]);

  // Load project and related data
  useEffect(() => {
    if (!projectId) return;

    const loadProjectData = async () => {
      setLoading(true);
      setError(null);

      const apiClient = apiClientRef.current;
      const k8sApi = k8sApiRef.current;

      try {
        // Load project
        const projectResult = await k8sApi.getProject(projectId);
        if (projectResult.error || !projectResult.data) {
          throw new Error(projectResult.error || "Failed to load project");
        }
        setProject(projectResult.data);

        // Load clusters
        const clustersResult = await k8sApi.listClusters(projectId);
        if (clustersResult.data) {
          setClusters(clustersResult.data.clusters || []);
        }

        // Load registries
        const registriesResult = await apiClient.get<{
          registries: ContainerRegistry[];
          total_count: number;
        }>(`/api/v1/container-registries?project_id=${projectId}`);
        if (registriesResult.data) {
          setRegistries(registriesResult.data.registries || []);
        }

        // Load images
        const imagesResult = await k8sApi.listTestImages(projectId);
        if (imagesResult.data) {
          setImages(imagesResult.data.images || []);
        }

        // Load jobs
        const jobsResult = await k8sApi.listTestJobs(projectId);
        if (jobsResult.data) {
          setJobs(jobsResult.data.jobs || []);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load project data";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    loadProjectData();
  }, [projectId]);

  // Delete cluster handler
  const handleDeleteCluster = useCallback(async (clusterId: string) => {
    if (!window.confirm("Are you sure you want to delete this cluster?")) return;

    const result = await k8sApiRef.current.deleteCluster(clusterId);
    if (result.error) {
      setError(result.error);
    } else {
      setClusters((prev) => prev.filter((c) => c.id !== clusterId));
    }
  }, []);

  // Set default cluster handler
  const handleSetDefaultCluster = useCallback(async (clusterId: string) => {
    const result = await k8sApiRef.current.setDefaultCluster(clusterId);
    if (result.error) {
      setError(result.error);
    } else {
      setClusters((prev) =>
        prev.map((c) => ({
          ...c,
          isDefault: c.id === clusterId,
        }))
      );
    }
  }, []);

  // Test cluster connection handler
  const handleTestClusterConnection = useCallback(async (clusterId: string) => {
    const result = await k8sApiRef.current.testClusterConnection(clusterId);
    if (result.error) {
      toast.error("Connection Test Failed", { description: result.error });
    } else if (result.data) {
      toast.success("Connection Successful", {
        description: `Server version: ${result.data.server_version || "unknown"}`,
      });
    }
  }, []);

  // Delete registry handler
  const handleDeleteRegistry = useCallback(async (registryId: string) => {
    if (!window.confirm("Are you sure you want to delete this registry?")) return;

    const result = await apiClientRef.current.delete(`/api/v1/container-registries/${registryId}`);
    if (result.error) {
      setError(result.error);
    } else {
      setRegistries((prev) => prev.filter((r) => r.id !== registryId));
    }
  }, []);

  // Test registry connection handler
  const handleTestRegistryConnection = useCallback(async (registryId: string) => {
    const result = await apiClientRef.current.post(`/api/v1/container-registries/${registryId}/test`);
    if (result.error) {
      toast.error("Connection Test Failed", { description: result.error });
    } else {
      toast.success("Registry Connection Successful");
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>Project not found</AlertDescription>
        </Alert>
        <Button
          id="back-to-projects-button"
          className="mt-4"
          onClick={() => navigate("/projects")}
        >
          Back to Projects
        </Button>
      </div>
    );
  }

  const getEnvironmentBadgeVariant = (env: ClusterEnvironment) => {
    switch (env) {
      case "prod":
        return "destructive";
      case "staging":
        return "secondary";
      case "dev":
        return "default";
      default:
        return "outline";
    }
  };

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            {project.setupCompleted && (
              <Badge variant="secondary">Setup Complete</Badge>
            )}
          </div>
          {project.description && (
            <p className="text-muted-foreground">{project.description}</p>
          )}
        </div>
        <Button
          id="back-button"
          variant="outline"
          onClick={() => navigate("/projects")}
        >
          Back to Projects
        </Button>
      </div>

      {/* Error display */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 mb-6">
          <TabsTrigger id="tab-overview" value="overview">Overview</TabsTrigger>
          <TabsTrigger id="tab-clusters" value="clusters">
            Clusters ({clusters.length})
          </TabsTrigger>
          <TabsTrigger id="tab-registries" value="registries">
            Registries ({registries.length})
          </TabsTrigger>
          <TabsTrigger id="tab-images" value="images">
            Images ({images.length})
          </TabsTrigger>
          <TabsTrigger id="tab-jobs" value="jobs">
            Jobs ({jobs.length})
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Clusters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{clusters.length}</div>
                <div className="text-xs text-muted-foreground">
                  {clusters.filter((c) => c.isDefault).length} default
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Registries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{registries.length}</div>
                <div className="text-xs text-muted-foreground">
                  {registries.filter((r) => r.isVerified).length} verified
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Test Images</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{images.length}</div>
                <div className="text-xs text-muted-foreground">
                  {images.filter((i) => i.discoveryStatus === "discovered").length} discovered
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Test Jobs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{jobs.length}</div>
                <div className="text-xs text-muted-foreground">
                  {jobs.filter((j) => j.status === "running").length} running
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID:</span>
                  <span className="font-mono text-sm">{project.id}</span>
                </div>
                {project.gitRepositoryUrl && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Repository:</span>
                    <a
                      href={project.gitRepositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm truncate max-w-[200px]"
                    >
                      {project.gitRepositoryUrl}
                    </a>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Default Environment:</span>
                  <Badge variant={getEnvironmentBadgeVariant(project.defaultTestEnvironment || "dev")}>
                    {project.defaultTestEnvironment || "dev"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span className="text-sm">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  id="add-cluster-button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setActiveTab("clusters")}
                >
                  Add Kubernetes Cluster
                </Button>
                <Button
                  id="add-registry-button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setActiveTab("registries")}
                >
                  Add Container Registry
                </Button>
                <Button
                  id="add-image-button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setActiveTab("images")}
                >
                  Add Test Image
                </Button>
                <Button
                  id="run-tests-button"
                  className="w-full justify-start"
                  onClick={() => setActiveTab("images")}
                >
                  Run Tests
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Clusters Tab */}
        <TabsContent value="clusters">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Kubernetes Clusters</h2>
            <Button id="add-cluster-action-button" variant="default">
              Add Cluster
            </Button>
          </div>

          {clusters.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">
                  No clusters configured yet. Add a cluster to run tests on Kubernetes.
                </p>
                <Button id="add-first-cluster-button">Add Your First Cluster</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clusters.map((cluster) => (
                <Card key={cluster.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {cluster.name}
                          {cluster.isDefault && (
                            <Badge variant="secondary">Default</Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          <Badge variant={getEnvironmentBadgeVariant(cluster.environment)}>
                            {cluster.environment}
                          </Badge>
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground">API Server: </span>
                      <span className="font-mono truncate">{cluster.apiServerUrl}</span>
                    </div>
                    {cluster.namespace && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Namespace: </span>
                        <span className="font-mono">{cluster.namespace}</span>
                      </div>
                    )}
                    {cluster.sutConfig && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">SUT: </span>
                        <span className="font-mono text-xs">
                          {cluster.sutConfig.serviceName}.{cluster.sutConfig.namespace}:{cluster.sutConfig.port}
                        </span>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        id={`test-cluster-${cluster.id}`}
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestClusterConnection(cluster.id)}
                      >
                        Test
                      </Button>
                      {!cluster.isDefault && (
                        <Button
                          id={`set-default-cluster-${cluster.id}`}
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetDefaultCluster(cluster.id)}
                        >
                          Set Default
                        </Button>
                      )}
                      <Button
                        id={`delete-cluster-${cluster.id}`}
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteCluster(cluster.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Registries Tab */}
        <TabsContent value="registries">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Container Registries</h2>
            <Button
              id="add-registry-action-button"
              variant="default"
              onClick={() => toast.info("Coming Soon", { description: "Inline registry form is under development" })}
            >
              Add Registry
            </Button>
          </div>

          {registries.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">
                  No registries configured yet. Add a registry to pull test images.
                </p>
                <Button
                  id="add-first-registry-button"
                  onClick={() => toast.info("Coming Soon", { description: "Inline registry form is under development" })}
                >
                  Add Your First Registry
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {registries.map((registry) => (
                <Card key={registry.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{registry.name}</CardTitle>
                        <CardDescription>
                          <Badge variant="outline">{registry.registryType}</Badge>
                          {registry.isVerified && (
                            <Badge variant="secondary" className="ml-2">Verified</Badge>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground">URL: </span>
                      <span className="font-mono truncate">{registry.registryUrl}</span>
                    </div>
                    {registry.lastTestedAt && (
                      <div className="text-sm text-muted-foreground">
                        Last tested: {new Date(registry.lastTestedAt).toLocaleDateString()}
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        id={`test-registry-${registry.id}`}
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestRegistryConnection(registry.id)}
                      >
                        Test
                      </Button>
                      <Button
                        id={`delete-registry-${registry.id}`}
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteRegistry(registry.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Images Tab */}
        <TabsContent value="images">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Test Images</h2>
            <Button
              id="add-image-action-button"
              variant="default"
              onClick={() => toast.info("Coming Soon", { description: "Inline image form is under development" })}
            >
              Add Image
            </Button>
          </div>

          {images.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">
                  No test images configured yet. Add an image to discover and run tests.
                </p>
                <Button
                  id="add-first-image-button"
                  onClick={() => toast.info("Coming Soon", { description: "Inline image form is under development" })}
                >
                  Add Your First Image
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {images.map((image) => (
                <Card key={image.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="font-mono text-sm">
                          {image.imagePath}:{image.imageTag}
                        </CardTitle>
                        <CardDescription className="flex gap-2 mt-1">
                          <Badge
                            variant={
                              image.discoveryStatus === "discovered"
                                ? "secondary"
                                : image.discoveryStatus === "failed"
                                ? "destructive"
                                : "outline"
                            }
                          >
                            {image.discoveryStatus}
                          </Badge>
                          {image.framework && (
                            <Badge variant="outline">{image.framework}</Badge>
                          )}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{image.totalTestCount}</div>
                        <div className="text-xs text-muted-foreground">tests</div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button
                        id={`discover-tests-${image.id}`}
                        size="sm"
                        variant="outline"
                        onClick={() => k8sApiRef.current.discoverTests(image.id)}
                      >
                        Discover Tests
                      </Button>
                      <Button
                        id={`run-image-tests-${image.id}`}
                        size="sm"
                        onClick={() => toast.info("Coming Soon", { description: "Test selection and execution is under development" })}
                      >
                        Run Tests
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Test Jobs</h2>
          </div>

          {jobs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">
                  No test jobs have been run yet. Configure an image and run tests to get started.
                </p>
                <Button
                  id="run-first-test-button"
                  onClick={() => setActiveTab("images")}
                >
                  Run Your First Test
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {jobs.slice(0, 10).map((job) => (
                <Card key={job.id}>
                  <CardContent className="py-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-mono text-sm">{job.k8sJobName}</div>
                        <div className="text-sm text-muted-foreground">
                          Test: {job.testId}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge
                          variant={
                            job.status === "succeeded"
                              ? "secondary"
                              : job.status === "failed"
                              ? "destructive"
                              : job.status === "running"
                              ? "default"
                              : "outline"
                          }
                        >
                          {job.status}
                        </Badge>
                        {job.durationMs && (
                          <span className="text-sm text-muted-foreground">
                            {(job.durationMs / 1000).toFixed(2)}s
                          </span>
                        )}
                        <Button
                          id={`view-job-${job.id}`}
                          size="sm"
                          variant="outline"
                          onClick={() => toast.info("Coming Soon", { description: `Job details view for ${job.id.slice(0, 8)}...` })}
                        >
                          View
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {jobs.length > 10 && (
                <div className="text-center text-sm text-muted-foreground">
                  Showing 10 of {jobs.length} jobs
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProjectManagementPage;

package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	pb "github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/credentials"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/output"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"google.golang.org/grpc"
	grpcinsecure "google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

var clusterCmd = &cobra.Command{
	Use:   "cluster",
	Short: "Manage Kubernetes clusters",
	Long:  `Commands for managing Kubernetes cluster configurations for test execution.`,
}

var clusterAddCmd = &cobra.Command{
	Use:   "add <name>",
	Short: "Add a Kubernetes cluster",
	Long: `Add a new Kubernetes cluster configuration for running tests.

Example:
  scaledtest cluster add my-cluster --project-id <id> --api-server https://k8s.example.com --token <token>
  scaledtest cluster add local --project-id <id> --kubeconfig ~/.kube/config`,
	Args: cobra.ExactArgs(1),
	RunE: runClusterAdd,
}

var clusterListCmd = &cobra.Command{
	Use:   "list",
	Short: "List Kubernetes clusters",
	Long:  `List all Kubernetes clusters configured for a project.`,
	RunE:  runClusterList,
}

var clusterTestCmd = &cobra.Command{
	Use:   "test <cluster-id>",
	Short: "Test cluster connection",
	Long:  `Test the connection to a Kubernetes cluster.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runClusterTest,
}

var clusterSetDefaultCmd = &cobra.Command{
	Use:   "set-default <cluster-id>",
	Short: "Set default cluster",
	Long:  `Set a cluster as the default for test execution in a project.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runClusterSetDefault,
}

var clusterDeleteCmd = &cobra.Command{
	Use:   "delete <cluster-id>",
	Short: "Delete a cluster",
	Long:  `Delete a Kubernetes cluster configuration.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runClusterDelete,
}

var clusterGetCmd = &cobra.Command{
	Use:   "get <cluster-id>",
	Short: "Get cluster details",
	Long:  `Get detailed information about a specific Kubernetes cluster.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runClusterGet,
}

var clusterTestDirectCmd = &cobra.Command{
	Use:   "test-direct",
	Short: "Test cluster connection directly",
	Long: `Test connection to a Kubernetes cluster without saving it.
Useful for validating credentials before adding a cluster.

Example:
  scaledtest cluster test-direct --api-server https://k8s.example.com --token <token>
  scaledtest cluster test-direct --kubeconfig ~/.kube/config`,
	RunE: runClusterTestDirect,
}

var clusterUpdateRunnerCmd = &cobra.Command{
	Use:   "update-runner <cluster-id>",
	Short: "Update runner configuration",
	Long: `Update the test runner configuration for a cluster.

Example:
  scaledtest cluster update-runner <id> --cpu-request 100m --memory-request 256Mi
  scaledtest cluster update-runner <id> --default-timeout 300 --default-parallelism 4`,
	Args: cobra.ExactArgs(1),
	RunE: runClusterUpdateRunner,
}

var clusterUpdateSutCmd = &cobra.Command{
	Use:   "update-sut <cluster-id>",
	Short: "Update SUT configuration",
	Long: `Update the System Under Test (SUT) configuration for a cluster.

Example:
  scaledtest cluster update-sut <id> --service-name my-app --namespace default --port 8080`,
	Args: cobra.ExactArgs(1),
	RunE: runClusterUpdateSut,
}

var (
	clusterProjectID   string
	clusterAPIServer   string
	clusterNamespace   string
	clusterAuthType    string
	clusterBearerToken string
	clusterKubeconfig  string
	clusterSkipTLS     bool
	clusterIsDefault   bool
	clusterDescription string
	clusterForce       bool

	// Test direct flags
	testDirectAPIServer   string
	testDirectAuthType    string
	testDirectBearerToken string
	testDirectKubeconfig  string
	testDirectSkipTLS     bool

	// Update runner flags
	runnerPlatformAPIURL     string
	runnerDefaultBaseURL     string
	runnerServiceAccountName string
	runnerArtifactsPVCName   string
	runnerDefaultTimeout     int32
	runnerDefaultParallelism int32
	runnerCPURequest         string
	runnerCPULimit           string
	runnerMemoryRequest      string
	runnerMemoryLimit        string
	runnerImagePullPolicy    string

	// Update SUT flags
	sutServiceName string
	sutNamespace   string
	sutPort        int32
	sutProtocol    string
)

func init() {
	rootCmd.AddCommand(clusterCmd)
	clusterCmd.AddCommand(clusterAddCmd)
	clusterCmd.AddCommand(clusterListCmd)
	clusterCmd.AddCommand(clusterGetCmd)
	clusterCmd.AddCommand(clusterTestCmd)
	clusterCmd.AddCommand(clusterTestDirectCmd)
	clusterCmd.AddCommand(clusterSetDefaultCmd)
	clusterCmd.AddCommand(clusterUpdateRunnerCmd)
	clusterCmd.AddCommand(clusterUpdateSutCmd)
	clusterCmd.AddCommand(clusterDeleteCmd)

	// Add command flags
	clusterAddCmd.Flags().StringVar(&clusterProjectID, "project-id", "", "Project ID (required)")
	clusterAddCmd.Flags().StringVar(&clusterAPIServer, "api-server", "", "Kubernetes API server URL")
	clusterAddCmd.Flags().StringVar(&clusterNamespace, "namespace", "default", "Kubernetes namespace")
	clusterAddCmd.Flags().StringVar(&clusterAuthType, "auth-type", "token", "Auth type: token, certificate, kubeconfig, in-cluster")
	clusterAddCmd.Flags().StringVar(&clusterBearerToken, "token", "", "Bearer token for authentication")
	clusterAddCmd.Flags().StringVar(&clusterKubeconfig, "kubeconfig", "", "Path to kubeconfig file")
	clusterAddCmd.Flags().BoolVar(&clusterSkipTLS, "skip-tls-verify", false, "Skip TLS certificate verification")
	clusterAddCmd.Flags().BoolVar(&clusterIsDefault, "default", false, "Set as default cluster for project")
	clusterAddCmd.Flags().StringVar(&clusterDescription, "description", "", "Cluster description")
	clusterAddCmd.MarkFlagRequired("project-id")

	// List command flags
	clusterListCmd.Flags().StringVar(&clusterProjectID, "project-id", "", "Project ID (required)")
	clusterListCmd.MarkFlagRequired("project-id")

	// Delete command flags
	clusterDeleteCmd.Flags().BoolVar(&clusterForce, "force", false, "Skip confirmation prompt")

	// Test direct command flags
	clusterTestDirectCmd.Flags().StringVar(&testDirectAPIServer, "api-server", "", "Kubernetes API server URL")
	clusterTestDirectCmd.Flags().StringVar(&testDirectAuthType, "auth-type", "token", "Auth type: token, certificate, kubeconfig")
	clusterTestDirectCmd.Flags().StringVar(&testDirectBearerToken, "token", "", "Bearer token for authentication")
	clusterTestDirectCmd.Flags().StringVar(&testDirectKubeconfig, "kubeconfig", "", "Path to kubeconfig file")
	clusterTestDirectCmd.Flags().BoolVar(&testDirectSkipTLS, "skip-tls-verify", false, "Skip TLS certificate verification")

	// Update runner command flags
	clusterUpdateRunnerCmd.Flags().StringVar(&runnerPlatformAPIURL, "platform-api-url", "", "Platform API URL")
	clusterUpdateRunnerCmd.Flags().StringVar(&runnerDefaultBaseURL, "default-base-url", "", "Default base URL for tests")
	clusterUpdateRunnerCmd.Flags().StringVar(&runnerServiceAccountName, "service-account", "", "Service account name")
	clusterUpdateRunnerCmd.Flags().StringVar(&runnerArtifactsPVCName, "artifacts-pvc", "", "Artifacts PVC name")
	clusterUpdateRunnerCmd.Flags().Int32Var(&runnerDefaultTimeout, "default-timeout", 0, "Default timeout in seconds")
	clusterUpdateRunnerCmd.Flags().Int32Var(&runnerDefaultParallelism, "default-parallelism", 0, "Default parallelism")
	clusterUpdateRunnerCmd.Flags().StringVar(&runnerCPURequest, "cpu-request", "", "CPU request (e.g., 100m)")
	clusterUpdateRunnerCmd.Flags().StringVar(&runnerCPULimit, "cpu-limit", "", "CPU limit (e.g., 500m)")
	clusterUpdateRunnerCmd.Flags().StringVar(&runnerMemoryRequest, "memory-request", "", "Memory request (e.g., 256Mi)")
	clusterUpdateRunnerCmd.Flags().StringVar(&runnerMemoryLimit, "memory-limit", "", "Memory limit (e.g., 1Gi)")
	clusterUpdateRunnerCmd.Flags().StringVar(&runnerImagePullPolicy, "image-pull-policy", "", "Image pull policy (Always, IfNotPresent, Never)")

	// Update SUT command flags
	clusterUpdateSutCmd.Flags().StringVar(&sutServiceName, "service-name", "", "Service name")
	clusterUpdateSutCmd.Flags().StringVar(&sutNamespace, "namespace", "", "Service namespace")
	clusterUpdateSutCmd.Flags().Int32Var(&sutPort, "port", 0, "Service port")
	clusterUpdateSutCmd.Flags().StringVar(&sutProtocol, "protocol", "", "Protocol (http or https)")
}

// getClusterGRPCClient creates an authenticated gRPC client for cluster operations
func getClusterGRPCClient() (pb.K8SClusterServiceClient, *grpc.ClientConn, error) {
	token := viper.GetString("token")
	if token == "" {
		creds, err := credentials.Load()
		if err != nil {
			return nil, nil, fmt.Errorf("not logged in: use 'scaledtest auth login' or set SCALEDTEST_TOKEN")
		}
		if creds.IsExpired() {
			return nil, nil, fmt.Errorf("token expired: use 'scaledtest auth login' to re-authenticate")
		}
		token = creds.Token
	}

	grpcURL := viper.GetString("grpc_url")
	if grpcURL == "" {
		grpcURL = "localhost:9090"
	}

	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(grpcinsecure.NewCredentials()),
		grpc.WithUnaryInterceptor(func(
			ctx context.Context,
			method string,
			req, reply interface{},
			cc *grpc.ClientConn,
			invoker grpc.UnaryInvoker,
			callOpts ...grpc.CallOption,
		) error {
			ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+token)
			return invoker(ctx, method, req, reply, cc, callOpts...)
		}),
	}

	conn, err := grpc.NewClient(grpcURL, opts...)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to connect to gRPC server: %w", err)
	}

	return pb.NewK8SClusterServiceClient(conn), conn, nil
}

func runClusterAdd(cmd *cobra.Command, args []string) error {
	out := output.New()
	name := args[0]

	client, conn, err := getClusterGRPCClient()
	if err != nil {
		return err
	}
	defer conn.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &pb.CreateClusterRequest{
		Name:          name,
		ProjectId:     clusterProjectID,
		Namespace:     clusterNamespace,
		AuthType:      clusterAuthType,
		SkipTlsVerify: clusterSkipTLS,
		IsDefault:     clusterIsDefault,
	}

	if clusterAPIServer != "" {
		req.ApiServerUrl = clusterAPIServer
	}
	if clusterBearerToken != "" {
		req.BearerToken = &clusterBearerToken
	}
	if clusterKubeconfig != "" {
		// Read kubeconfig file content
		content, err := os.ReadFile(clusterKubeconfig)
		if err != nil {
			return fmt.Errorf("failed to read kubeconfig file: %w", err)
		}
		kubeconfigStr := string(content)
		req.Kubeconfig = &kubeconfigStr
	}
	if clusterDescription != "" {
		req.Description = &clusterDescription
	}

	resp, err := client.CreateCluster(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to add cluster: %v", err)
	}

	if out.IsJSON() {
		result := map[string]interface{}{
			"cluster": map[string]interface{}{
				"id":         resp.Id,
				"name":       resp.Name,
				"namespace":  resp.Namespace,
				"is_default": resp.IsDefault,
			},
		}
		out.JSON(result)
	} else {
		out.Success("Cluster added: %s", name)
		out.Detail("ID", resp.Id)
	}

	return nil
}

func runClusterList(cmd *cobra.Command, args []string) error {
	out := output.New()

	client, conn, err := getClusterGRPCClient()
	if err != nil {
		return err
	}
	defer conn.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := client.ListClusters(ctx, &pb.ListClustersRequest{
		ProjectId: clusterProjectID,
	})
	if err != nil {
		return fmt.Errorf("failed to list clusters: %v", err)
	}

	if out.IsJSON() {
		clusters := make([]map[string]interface{}, 0, len(resp.Clusters))
		for _, c := range resp.Clusters {
			clusters = append(clusters, map[string]interface{}{
				"id":                c.Id,
				"name":              c.Name,
				"namespace":         c.Namespace,
				"is_default":        c.IsDefault,
				"connection_status": c.ConnectionStatus,
			})
		}
		out.JSON(map[string]interface{}{"clusters": clusters})
	} else {
		if len(resp.Clusters) == 0 {
			out.Info("No clusters found")
			return nil
		}

		table := out.Table([]string{"ID", "NAME", "NAMESPACE", "DEFAULT", "STATUS"})
		for _, c := range resp.Clusters {
			defaultStr := ""
			if c.IsDefault {
				defaultStr = "✓"
			}
			table.AddRow(c.Id, c.Name, c.Namespace, defaultStr, output.StatusColor(c.ConnectionStatus))
		}
		table.Render()
	}

	return nil
}

func runClusterTest(cmd *cobra.Command, args []string) error {
	out := output.New()
	clusterID := args[0]

	client, conn, err := getClusterGRPCClient()
	if err != nil {
		return err
	}
	defer conn.Close()

	spinner := output.NewSpinner("Testing cluster connection")
	spinner.Start()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	resp, err := client.TestConnection(ctx, &pb.TestConnectionRequest{
		ClusterId: clusterID,
	})
	if err != nil {
		spinner.Stop(false)
		return fmt.Errorf("failed to test cluster: %v", err)
	}

	spinner.Stop(resp.Connected)

	if out.IsJSON() {
		result := map[string]interface{}{
			"connected": resp.Connected,
			"message":   resp.Message,
		}
		if resp.KubernetesVersion != nil {
			result["version"] = *resp.KubernetesVersion
		}
		json.NewEncoder(os.Stdout).Encode(result)
	} else {
		if resp.Connected {
			out.Success("Cluster connection successful")
			if resp.KubernetesVersion != nil {
				out.Detail("Version", *resp.KubernetesVersion)
			}
		} else {
			out.Error("Cluster connection failed: %s", resp.Message)
		}
	}

	return nil
}

func runClusterSetDefault(cmd *cobra.Command, args []string) error {
	out := output.New()
	clusterID := args[0]

	client, conn, err := getClusterGRPCClient()
	if err != nil {
		return err
	}
	defer conn.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := client.SetDefaultCluster(ctx, &pb.SetDefaultClusterRequest{
		ClusterId: clusterID,
	})
	if err != nil {
		return fmt.Errorf("failed to set default cluster: %v", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"success": true,
			"cluster": map[string]interface{}{
				"id":         resp.Id,
				"name":       resp.Name,
				"is_default": resp.IsDefault,
			},
		})
	} else {
		out.Success("Cluster set as default: %s", resp.Name)
	}

	return nil
}

func runClusterDelete(cmd *cobra.Command, args []string) error {
	out := output.New()
	clusterID := args[0]

	if !clusterForce && !out.IsJSON() {
		out.Warning("This will permanently delete the cluster configuration.")
		out.Info("Use --force to skip this confirmation.")
		return fmt.Errorf("operation cancelled")
	}

	client, conn, err := getClusterGRPCClient()
	if err != nil {
		return err
	}
	defer conn.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = client.DeleteCluster(ctx, &pb.DeleteClusterRequest{
		ClusterId: clusterID,
	})
	if err != nil {
		return fmt.Errorf("failed to delete cluster: %v", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"success": true,
			"message": "Cluster deleted",
		})
	} else {
		out.Success("Cluster deleted: %s", clusterID)
	}

	return nil
}

func runClusterGet(cmd *cobra.Command, args []string) error {
	out := output.New()
	clusterID := args[0]

	client, conn, err := getClusterGRPCClient()
	if err != nil {
		return err
	}
	defer conn.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := client.GetCluster(ctx, &pb.GetClusterRequest{
		ClusterId: clusterID,
	})
	if err != nil {
		return fmt.Errorf("failed to get cluster: %v", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"id":                resp.Id,
			"name":              resp.Name,
			"description":       resp.Description,
			"api_server_url":    resp.ApiServerUrl,
			"namespace":         resp.Namespace,
			"auth_type":         resp.AuthType,
			"skip_tls_verify":   resp.SkipTlsVerify,
			"is_default":        resp.IsDefault,
			"is_active":         resp.IsActive,
			"project_id":        resp.ProjectId,
			"environment":       resp.Environment,
			"connection_status": resp.ConnectionStatus,
			"connection_error":  resp.ConnectionError,
			"last_connected_at": resp.LastConnectedAt,
			"sut_config":        resp.SutConfig,
			"runner_config":     resp.RunnerConfig,
			"created_by":        resp.CreatedBy,
			"created_at":        resp.CreatedAt.AsTime().Format(time.RFC3339),
			"updated_at":        resp.UpdatedAt.AsTime().Format(time.RFC3339),
		})
	} else {
		out.Info("Cluster: %s", resp.Name)
		out.Detail("ID", resp.Id)
		if resp.Description != nil && *resp.Description != "" {
			out.Detail("Description", *resp.Description)
		}
		out.Detail("API Server", resp.ApiServerUrl)
		out.Detail("Namespace", resp.Namespace)
		out.Detail("Auth Type", resp.AuthType)
		out.Detail("Environment", resp.Environment)
		out.Detail("Connection Status", output.StatusColor(resp.ConnectionStatus))
		if resp.ConnectionError != nil && *resp.ConnectionError != "" {
			out.Detail("Connection Error", *resp.ConnectionError)
		}
		defaultStr := "No"
		if resp.IsDefault {
			defaultStr = "Yes"
		}
		out.Detail("Default", defaultStr)
		out.Detail("Created", resp.CreatedAt.AsTime().Format(time.RFC1123))
		out.Detail("Updated", resp.UpdatedAt.AsTime().Format(time.RFC1123))

		if resp.SutConfig != nil {
			out.Info("\nSUT Configuration:")
			out.Detail("Service Name", resp.SutConfig.ServiceName)
			out.Detail("Namespace", resp.SutConfig.Namespace)
			out.Detail("Port", fmt.Sprintf("%d", resp.SutConfig.Port))
			if resp.SutConfig.Protocol != nil {
				out.Detail("Protocol", *resp.SutConfig.Protocol)
			}
		}

		if resp.RunnerConfig != nil {
			out.Info("\nRunner Configuration:")
			out.Detail("Platform API URL", resp.RunnerConfig.PlatformApiUrl)
			out.Detail("Default Base URL", resp.RunnerConfig.DefaultBaseUrl)
			out.Detail("Service Account", resp.RunnerConfig.ServiceAccountName)
			out.Detail("Default Timeout", fmt.Sprintf("%d", resp.RunnerConfig.DefaultTimeout))
			out.Detail("Default Parallelism", fmt.Sprintf("%d", resp.RunnerConfig.DefaultParallelism))
		}
	}

	return nil
}

func runClusterTestDirect(cmd *cobra.Command, args []string) error {
	out := output.New()

	client, conn, err := getClusterGRPCClient()
	if err != nil {
		return err
	}
	defer conn.Close()

	spinner := output.NewSpinner("Testing cluster connection")
	spinner.Start()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	req := &pb.TestConnectionDirectRequest{
		ApiServerUrl:  testDirectAPIServer,
		AuthType:      testDirectAuthType,
		SkipTlsVerify: testDirectSkipTLS,
	}
	if testDirectBearerToken != "" {
		req.BearerToken = &testDirectBearerToken
	}
	if testDirectKubeconfig != "" {
		// Read kubeconfig file content
		content, err := os.ReadFile(testDirectKubeconfig)
		if err != nil {
			spinner.Stop(false)
			return fmt.Errorf("failed to read kubeconfig file: %w", err)
		}
		kubeconfigStr := string(content)
		req.Kubeconfig = &kubeconfigStr
	}

	resp, err := client.TestConnectionDirect(ctx, req)
	if err != nil {
		spinner.Stop(false)
		return fmt.Errorf("failed to test cluster: %v", err)
	}

	spinner.Stop(resp.Connected)

	if out.IsJSON() {
		result := map[string]interface{}{
			"connected": resp.Connected,
			"message":   resp.Message,
		}
		if resp.KubernetesVersion != nil {
			result["kubernetes_version"] = *resp.KubernetesVersion
		}
		if resp.NodeCount != nil {
			result["node_count"] = *resp.NodeCount
		}
		out.JSON(result)
	} else {
		if resp.Connected {
			out.Success("Cluster connection successful")
			if resp.KubernetesVersion != nil {
				out.Detail("Kubernetes Version", *resp.KubernetesVersion)
			}
			if resp.NodeCount != nil {
				out.Detail("Node Count", fmt.Sprintf("%d", *resp.NodeCount))
			}
		} else {
			out.Error("Cluster connection failed: %s", resp.Message)
		}
	}

	return nil
}

func runClusterUpdateRunner(cmd *cobra.Command, args []string) error {
	out := output.New()
	clusterID := args[0]

	client, conn, err := getClusterGRPCClient()
	if err != nil {
		return err
	}
	defer conn.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	runnerConfig := &pb.RunnerConfig{}
	hasUpdates := false

	if runnerPlatformAPIURL != "" {
		runnerConfig.PlatformApiUrl = runnerPlatformAPIURL
		hasUpdates = true
	}
	if runnerDefaultBaseURL != "" {
		runnerConfig.DefaultBaseUrl = runnerDefaultBaseURL
		hasUpdates = true
	}
	if runnerServiceAccountName != "" {
		runnerConfig.ServiceAccountName = runnerServiceAccountName
		hasUpdates = true
	}
	if runnerArtifactsPVCName != "" {
		runnerConfig.ArtifactsPvcName = &runnerArtifactsPVCName
		hasUpdates = true
	}
	if runnerDefaultTimeout > 0 {
		runnerConfig.DefaultTimeout = runnerDefaultTimeout
		hasUpdates = true
	}
	if runnerDefaultParallelism > 0 {
		runnerConfig.DefaultParallelism = runnerDefaultParallelism
		hasUpdates = true
	}
	if runnerImagePullPolicy != "" {
		runnerConfig.ImagePullPolicy = runnerImagePullPolicy
		hasUpdates = true
	}

	// Handle resource requirements
	if runnerCPURequest != "" || runnerCPULimit != "" || runnerMemoryRequest != "" || runnerMemoryLimit != "" {
		runnerConfig.DefaultResources = &pb.ClusterResourceRequirements{
			CpuRequest:    runnerCPURequest,
			CpuLimit:      runnerCPULimit,
			MemoryRequest: runnerMemoryRequest,
			MemoryLimit:   runnerMemoryLimit,
		}
		hasUpdates = true
	}

	if !hasUpdates {
		return fmt.Errorf("at least one configuration flag must be provided")
	}

	resp, err := client.UpdateRunnerConfig(ctx, &pb.UpdateRunnerConfigRequest{
		ClusterId:    clusterID,
		RunnerConfig: runnerConfig,
	})
	if err != nil {
		return fmt.Errorf("failed to update runner config: %v", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"success":       true,
			"cluster_id":    resp.Id,
			"cluster_name":  resp.Name,
			"runner_config": resp.RunnerConfig,
		})
	} else {
		out.Success("Runner configuration updated for cluster: %s", resp.Name)
	}

	return nil
}

func runClusterUpdateSut(cmd *cobra.Command, args []string) error {
	out := output.New()
	clusterID := args[0]

	client, conn, err := getClusterGRPCClient()
	if err != nil {
		return err
	}
	defer conn.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	sutConfig := &pb.SutConfig{}
	hasUpdates := false

	if sutServiceName != "" {
		sutConfig.ServiceName = sutServiceName
		hasUpdates = true
	}
	if sutNamespace != "" {
		sutConfig.Namespace = sutNamespace
		hasUpdates = true
	}
	if sutPort > 0 {
		sutConfig.Port = sutPort
		hasUpdates = true
	}
	if sutProtocol != "" {
		sutConfig.Protocol = &sutProtocol
		hasUpdates = true
	}

	if !hasUpdates {
		return fmt.Errorf("at least one configuration flag must be provided")
	}

	resp, err := client.UpdateSutConfig(ctx, &pb.UpdateSutConfigRequest{
		ClusterId: clusterID,
		SutConfig: sutConfig,
	})
	if err != nil {
		return fmt.Errorf("failed to update SUT config: %v", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"success":      true,
			"cluster_id":   resp.Id,
			"cluster_name": resp.Name,
			"sut_config":   resp.SutConfig,
		})
	} else {
		out.Success("SUT configuration updated for cluster: %s", resp.Name)
	}

	return nil
}

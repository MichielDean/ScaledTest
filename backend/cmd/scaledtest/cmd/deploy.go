package cmd

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/cli/output"
	"github.com/spf13/cobra"
)

var deployCmd = &cobra.Command{
	Use:   "deploy",
	Short: "Deploy and manage ScaledTest infrastructure",
	Long:  `Commands for deploying and managing ScaledTest on Kubernetes using Helm.`,
}

var deployUpCmd = &cobra.Command{
	Use:   "up",
	Short: "Deploy or upgrade ScaledTest",
	Long: `Deploy or upgrade ScaledTest using Helm.

Example:
  scaledtest deploy up
  scaledtest deploy up --namespace my-namespace
  scaledtest deploy up --values custom-values.yaml`,
	RunE: runDeployUp,
}

var deployDownCmd = &cobra.Command{
	Use:   "down",
	Short: "Uninstall ScaledTest",
	Long:  `Uninstall ScaledTest from the Kubernetes cluster.`,
	RunE:  runDeployDown,
}

var deployStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show deployment status",
	Long:  `Show the current status of the ScaledTest deployment.`,
	RunE:  runDeployStatus,
}

var deployLogsCmd = &cobra.Command{
	Use:   "logs [component]",
	Short: "View deployment logs",
	Long: `View logs from ScaledTest components.

Example:
  scaledtest deploy logs
  scaledtest deploy logs backend
  scaledtest deploy logs frontend --follow`,
	RunE: runDeployLogs,
}

var (
	deployNamespace    string
	deployReleaseName  string
	deployValuesFile   string
	deployChartPath    string
	deployTimeout      string
	deployFollow       bool
	deployTail         int
	deployForce        bool
	deployCreateNS     bool
)

func init() {
	rootCmd.AddCommand(deployCmd)
	deployCmd.AddCommand(deployUpCmd)
	deployCmd.AddCommand(deployDownCmd)
	deployCmd.AddCommand(deployStatusCmd)
	deployCmd.AddCommand(deployLogsCmd)

	// Common flags
	deployCmd.PersistentFlags().StringVarP(&deployNamespace, "namespace", "n", "scaledtest", "Kubernetes namespace")
	deployCmd.PersistentFlags().StringVar(&deployReleaseName, "release", "scaledtest", "Helm release name")

	// Up command flags
	deployUpCmd.Flags().StringVarP(&deployValuesFile, "values", "f", "", "Path to values file")
	deployUpCmd.Flags().StringVar(&deployChartPath, "chart", "", "Path to Helm chart (default: auto-detect)")
	deployUpCmd.Flags().StringVar(&deployTimeout, "timeout", "10m", "Timeout for Helm operations")
	deployUpCmd.Flags().BoolVar(&deployCreateNS, "create-namespace", true, "Create namespace if it doesn't exist")

	// Down command flags
	deployDownCmd.Flags().BoolVar(&deployForce, "force", false, "Skip confirmation prompt")

	// Logs command flags
	deployLogsCmd.Flags().BoolVarP(&deployFollow, "follow", "f", false, "Follow log output")
	deployLogsCmd.Flags().IntVar(&deployTail, "tail", 100, "Number of lines to show from the end")
}

func runDeployUp(cmd *cobra.Command, args []string) error {
	out := output.New()

	// Find Helm chart path
	chartPath := deployChartPath
	if chartPath == "" {
		chartPath = findChartPath()
		if chartPath == "" {
			return fmt.Errorf("could not find Helm chart. Use --chart to specify path")
		}
	}

	// Build helm command
	helmArgs := []string{
		"upgrade", "--install",
		deployReleaseName,
		chartPath,
		"--namespace", deployNamespace,
		"--timeout", deployTimeout,
	}

	if deployCreateNS {
		helmArgs = append(helmArgs, "--create-namespace")
	}

	if deployValuesFile != "" {
		helmArgs = append(helmArgs, "-f", deployValuesFile)
	}

	out.Info("Deploying ScaledTest to namespace %s...", deployNamespace)

	// Run helm
	helmCmd := exec.Command("helm", helmArgs...)
	helmCmd.Stdout = os.Stdout
	helmCmd.Stderr = os.Stderr

	if err := helmCmd.Run(); err != nil {
		return fmt.Errorf("helm upgrade failed: %w", err)
	}

	out.Success("ScaledTest deployed successfully")

	// Show status
	return runDeployStatus(cmd, args)
}

func runDeployDown(cmd *cobra.Command, args []string) error {
	out := output.New()

	if !deployForce && !out.IsJSON() {
		out.Warning("This will uninstall ScaledTest from namespace %s.", deployNamespace)
		out.Info("Use --force to skip this confirmation.")
		return fmt.Errorf("operation cancelled")
	}

	out.Info("Uninstalling ScaledTest from namespace %s...", deployNamespace)

	helmArgs := []string{
		"uninstall",
		deployReleaseName,
		"--namespace", deployNamespace,
	}

	helmCmd := exec.Command("helm", helmArgs...)
	helmCmd.Stdout = os.Stdout
	helmCmd.Stderr = os.Stderr

	if err := helmCmd.Run(); err != nil {
		return fmt.Errorf("helm uninstall failed: %w", err)
	}

	out.Success("ScaledTest uninstalled successfully")
	return nil
}

func runDeployStatus(cmd *cobra.Command, args []string) error {
	out := output.New()

	// Get Helm release status
	helmArgs := []string{
		"status",
		deployReleaseName,
		"--namespace", deployNamespace,
	}

	helmCmd := exec.Command("helm", helmArgs...)
	helmOutput, err := helmCmd.CombinedOutput()
	if err != nil {
		if strings.Contains(string(helmOutput), "not found") {
			out.Warning("ScaledTest is not deployed in namespace %s", deployNamespace)
			return nil
		}
		return fmt.Errorf("helm status failed: %w", err)
	}

	if out.IsJSON() {
		// Get JSON output from helm
		helmArgs = append(helmArgs, "-o", "json")
		helmCmd = exec.Command("helm", helmArgs...)
		jsonOutput, _ := helmCmd.Output()
		fmt.Println(string(jsonOutput))
		return nil
	}

	// Get pod status
	out.Info("Deployment Status:")
	fmt.Println(string(helmOutput))

	out.Info("\nPod Status:")
	kubectlArgs := []string{
		"get", "pods",
		"-n", deployNamespace,
		"-l", fmt.Sprintf("app.kubernetes.io/instance=%s", deployReleaseName),
		"-o", "wide",
	}

	kubectlCmd := exec.Command("kubectl", kubectlArgs...)
	kubectlCmd.Stdout = os.Stdout
	kubectlCmd.Stderr = os.Stderr
	kubectlCmd.Run()

	// Get services
	out.Info("\nServices:")
	kubectlArgs = []string{
		"get", "svc",
		"-n", deployNamespace,
		"-l", fmt.Sprintf("app.kubernetes.io/instance=%s", deployReleaseName),
	}

	kubectlCmd = exec.Command("kubectl", kubectlArgs...)
	kubectlCmd.Stdout = os.Stdout
	kubectlCmd.Stderr = os.Stderr
	kubectlCmd.Run()

	return nil
}

func runDeployLogs(cmd *cobra.Command, args []string) error {
	out := output.New()

	// Build label selector
	selector := fmt.Sprintf("app.kubernetes.io/instance=%s", deployReleaseName)
	if len(args) > 0 {
		component := args[0]
		selector = fmt.Sprintf("%s,app.kubernetes.io/component=%s", selector, component)
	}

	kubectlArgs := []string{
		"logs",
		"-n", deployNamespace,
		"-l", selector,
		"--all-containers=true",
		fmt.Sprintf("--tail=%d", deployTail),
	}

	if deployFollow {
		kubectlArgs = append(kubectlArgs, "-f")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle interrupt
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		cancel()
	}()

	kubectlCmd := exec.CommandContext(ctx, "kubectl", kubectlArgs...)

	if out.IsJSON() {
		// For JSON output, capture and format
		stdout, _ := kubectlCmd.StdoutPipe()
		if err := kubectlCmd.Start(); err != nil {
			return fmt.Errorf("failed to start kubectl: %w", err)
		}

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			out.JSON(map[string]interface{}{
				"timestamp": time.Now().Format(time.RFC3339),
				"log":       line,
			})
		}
		kubectlCmd.Wait()
	} else {
		kubectlCmd.Stdout = os.Stdout
		kubectlCmd.Stderr = os.Stderr

		if err := kubectlCmd.Run(); err != nil {
			if ctx.Err() != nil {
				return nil // Cancelled
			}
			return fmt.Errorf("kubectl logs failed: %w", err)
		}
	}

	return nil
}

func findChartPath() string {
	// Try common locations
	paths := []string{
		"deploy/helm/scaledtest",
		"../deploy/helm/scaledtest",
		"../../deploy/helm/scaledtest",
		filepath.Join(os.Getenv("HOME"), "scaledtest", "deploy", "helm", "scaledtest"),
	}

	// Also check SCALEDTEST_CHART_PATH env
	if envPath := os.Getenv("SCALEDTEST_CHART_PATH"); envPath != "" {
		paths = append([]string{envPath}, paths...)
	}

	for _, p := range paths {
		if _, err := os.Stat(filepath.Join(p, "Chart.yaml")); err == nil {
			return p
		}
	}

	return ""
}

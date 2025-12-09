package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/client"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/output"
	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var testCmd = &cobra.Command{
	Use:   "test",
	Short: "Test execution commands",
	Long:  `Commands for triggering, monitoring, and managing test executions.`,
}

var testRunCmd = &cobra.Command{
	Use:   "run",
	Short: "Run tests",
	Long: `Trigger test execution for a test image.

Example:
  scaledtest test run --project-id <id> --image-id <id>
  scaledtest test run --project-id <id> --image-id <id> --parallelism 4
  scaledtest test run --project-id <id> --image-id <id> --wait`,
	RunE: runTestRun,
}

var testStatusCmd = &cobra.Command{
	Use:   "status [job-name]",
	Short: "Get test job status",
	Long: `Get the status of test jobs. If a job name is provided, streams real-time updates.

Example:
  scaledtest test status --project-id <id>
  scaledtest test status test-job-abc123 --project-id <id> --watch`,
	RunE: runTestStatus,
}

var testLogsCmd = &cobra.Command{
	Use:   "logs <job-id>",
	Short: "Stream test job logs",
	Long:  `Stream logs from a running or completed test job.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runTestLogs,
}

var testCancelCmd = &cobra.Command{
	Use:   "cancel <job-id>",
	Short: "Cancel a running test job",
	Long:  `Cancel a running test job.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runTestCancel,
}

var testResultsCmd = &cobra.Command{
	Use:   "results",
	Short: "View test results",
	Long:  `View test results and statistics.`,
}

var testResultsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List test results",
	Long:  `List all test results.`,
	RunE:  runTestResultsList,
}

var testResultsGetCmd = &cobra.Command{
	Use:   "get <result-id>",
	Short: "Get test result details",
	Long:  `Get detailed test results including individual test cases.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runTestResultsGet,
}

var testResultsStatsCmd = &cobra.Command{
	Use:   "stats",
	Short: "Get test statistics",
	Long:  `Get aggregated test statistics over time.`,
	RunE:  runTestResultsStats,
}

var testJobCmd = &cobra.Command{
	Use:   "job",
	Short: "Test job management commands",
	Long:  `Commands for managing individual test jobs.`,
}

var testJobGetCmd = &cobra.Command{
	Use:   "get <job-id>",
	Short: "Get test job details",
	Long:  `Get detailed information about a specific test job.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runTestJobGet,
}

var testJobStatusCmd = &cobra.Command{
	Use:   "status <k8s-job-name>",
	Short: "Get job status by K8s job name",
	Long:  `Get the status of test jobs by Kubernetes job name.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runTestJobStatus,
}

var testResultsUploadCmd = &cobra.Command{
	Use:   "upload <file>",
	Short: "Upload test results",
	Long: `Upload test results from a JSON file.

Example:
  scaledtest test results upload results.json --branch main --commit abc123`,
	Args: cobra.ExactArgs(1),
	RunE: runTestResultsUpload,
}

var testResultsUpsertCmd = &cobra.Command{
	Use:   "upsert <file>",
	Short: "Upsert test results by run ID",
	Long: `Create or update test results by test run ID.

Example:
  scaledtest test results upsert results.json --test-run-id <id>`,
	Args: cobra.ExactArgs(1),
	RunE: runTestResultsUpsert,
}

var testResultsStreamCmd = &cobra.Command{
	Use:   "stream",
	Short: "Stream test results",
	Long:  `Stream test results in real-time.`,
	RunE:  runTestResultsStream,
}

var (
	testProjectID   string
	testImageID     string
	testParallelism int32
	testTimeout     int32
	testWait        bool
	testWatch       bool
	testFollow      bool
	testTailLines   int32
	testBranch      string
	testDays        int32
	testCommit      string
	testRunID       string
)

func init() {
	rootCmd.AddCommand(testCmd)
	testCmd.AddCommand(testRunCmd)
	testCmd.AddCommand(testStatusCmd)
	testCmd.AddCommand(testLogsCmd)
	testCmd.AddCommand(testCancelCmd)
	testCmd.AddCommand(testJobCmd)
	testCmd.AddCommand(testResultsCmd)

	// Job subcommands
	testJobCmd.AddCommand(testJobGetCmd)
	testJobCmd.AddCommand(testJobStatusCmd)

	// Results subcommands
	testResultsCmd.AddCommand(testResultsListCmd)
	testResultsCmd.AddCommand(testResultsGetCmd)
	testResultsCmd.AddCommand(testResultsStatsCmd)
	testResultsCmd.AddCommand(testResultsUploadCmd)
	testResultsCmd.AddCommand(testResultsUpsertCmd)
	testResultsCmd.AddCommand(testResultsStreamCmd)

	// Run command flags
	testRunCmd.Flags().StringVar(&testProjectID, "project-id", "", "Project ID (required)")
	testRunCmd.Flags().StringVar(&testImageID, "image-id", "", "Test image ID (required)")
	testRunCmd.Flags().Int32Var(&testParallelism, "parallelism", 0, "Number of parallel test pods")
	testRunCmd.Flags().Int32Var(&testTimeout, "timeout", 0, "Timeout in seconds")
	testRunCmd.Flags().BoolVar(&testWait, "wait", false, "Wait for tests to complete")
	testRunCmd.MarkFlagRequired("project-id")
	testRunCmd.MarkFlagRequired("image-id")

	// Status command flags
	testStatusCmd.Flags().StringVar(&testProjectID, "project-id", "", "Project ID (required)")
	testStatusCmd.Flags().BoolVar(&testWatch, "watch", false, "Watch for status updates")
	testStatusCmd.MarkFlagRequired("project-id")

	// Logs command flags
	testLogsCmd.Flags().BoolVarP(&testFollow, "follow", "f", false, "Follow log output")
	testLogsCmd.Flags().Int32Var(&testTailLines, "tail", 100, "Number of lines to show from the end")

	// Results list command flags
	testResultsListCmd.Flags().StringVar(&testBranch, "branch", "", "Filter by branch")

	// Stats command flags
	testResultsStatsCmd.Flags().StringVar(&testBranch, "branch", "", "Filter by branch")
	testResultsStatsCmd.Flags().Int32Var(&testDays, "days", 30, "Number of days to include")

	// Upload command flags
	testResultsUploadCmd.Flags().StringVar(&testBranch, "branch", "", "Branch name (required)")
	testResultsUploadCmd.Flags().StringVar(&testCommit, "commit", "", "Commit SHA (required)")
	testResultsUploadCmd.MarkFlagRequired("branch")
	testResultsUploadCmd.MarkFlagRequired("commit")

	// Upsert command flags
	testResultsUpsertCmd.Flags().StringVar(&testRunID, "test-run-id", "", "Test run ID (required)")
	testResultsUpsertCmd.Flags().StringVar(&testBranch, "branch", "", "Branch name")
	testResultsUpsertCmd.Flags().StringVar(&testCommit, "commit", "", "Commit SHA")
	testResultsUpsertCmd.MarkFlagRequired("test-run-id")
}

func runTestRun(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	req := &proto.TriggerTestJobsRequest{
		ProjectId:   testProjectID,
		TestImageId: testImageID,
	}
	if testParallelism > 0 {
		req.Parallelism = &testParallelism
	}
	if testTimeout > 0 {
		req.TimeoutSeconds = &testTimeout
	}

	spinner := output.NewSpinner("Triggering test execution")
	spinner.Start()

	resp, err := c.TestJobService.TriggerTestJobs(ctx, req)
	if err != nil {
		spinner.Stop(false)
		return fmt.Errorf("failed to trigger tests: %w", err)
	}

	spinner.Stop(resp.Success)

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"success":      resp.Success,
			"message":      resp.Message,
			"k8s_job_name": resp.K8SJobName,
			"job_ids":      resp.JobIds,
			"total_tests":  resp.TotalTests,
			"test_run_id":  resp.TestRunId,
		})
	} else {
		if resp.Success {
			out.Success("Tests triggered successfully")
			out.Detail("Job Name", resp.K8SJobName)
			out.Detail("Total Tests", fmt.Sprintf("%d", resp.TotalTests))
			out.Detail("Test Run ID", resp.TestRunId)
		} else {
			out.Error("Failed to trigger tests: %s", resp.Message)
			return nil
		}
	}

	// Wait for completion if requested
	if testWait && resp.Success {
		return waitForTestCompletion(c, testProjectID, resp.K8SJobName, out)
	}

	return nil
}

func waitForTestCompletion(c *client.Client, projectID, jobName string, out *output.Writer) error {
	out.Info("\nWaiting for test completion...")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle interrupt
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		out.Warning("\nInterrupted - tests may still be running")
		cancel()
	}()

	stream, err := c.TestJobService.StreamJobStatus(ctx, &proto.StreamJobStatusRequest{
		ProjectId:   projectID,
		K8SJobName:  &jobName,
	})
	if err != nil {
		return fmt.Errorf("failed to stream status: %w", err)
	}

	statusCounts := map[string]int{
		"pending":   0,
		"running":   0,
		"succeeded": 0,
		"failed":    0,
		"cancelled": 0,
	}

	for {
		update, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			if ctx.Err() != nil {
				return nil // Cancelled
			}
			return fmt.Errorf("stream error: %w", err)
		}

		// Update counts
		if update.PreviousStatus != "" {
			statusCounts[strings.ToLower(update.PreviousStatus)]--
		}
		statusCounts[strings.ToLower(update.CurrentStatus)]++

		if !out.IsJSON() {
			// Print update
			statusColor := output.StatusColor(update.CurrentStatus)
			fmt.Printf("  %s: %s -> %s\n", update.TestId[:8], update.PreviousStatus, statusColor)
		}

		// Check if all tests are done
		if statusCounts["pending"] == 0 && statusCounts["running"] == 0 {
			break
		}
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"completed": true,
			"succeeded": statusCounts["succeeded"],
			"failed":    statusCounts["failed"],
			"cancelled": statusCounts["cancelled"],
		})
	} else {
		out.Info("")
		if statusCounts["failed"] > 0 {
			red := color.New(color.FgRed).SprintFunc()
			out.Info("Test run completed: %s passed, %s failed",
				color.GreenString("%d", statusCounts["succeeded"]),
				red("%d", statusCounts["failed"]),
			)
		} else {
			out.Success("All %d tests passed", statusCounts["succeeded"])
		}
	}

	return nil
}

func runTestStatus(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	// If no specific job, list all jobs
	if len(args) == 0 {
		return listTestJobs(c, out)
	}

	jobName := args[0]

	// If watching, stream status updates
	if testWatch {
		return streamJobStatus(c, testProjectID, jobName, out)
	}

	// Otherwise, get current status
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.TestJobService.ListTestJobs(ctx, &proto.ListTestJobsRequest{
		ProjectId:   testProjectID,
		K8SJobName:  &jobName,
	})
	if err != nil {
		return fmt.Errorf("failed to get job status: %w", err)
	}

	if out.IsJSON() {
		jobs := make([]map[string]interface{}, 0, len(resp.Jobs))
		for _, j := range resp.Jobs {
			jobs = append(jobs, map[string]interface{}{
				"id":           j.Id,
				"test_id":      j.TestId,
				"status":       j.Status,
				"job_index":    j.JobIndex,
				"pod_name":     j.PodName,
				"started_at":   j.StartedAt,
				"completed_at": j.CompletedAt,
				"duration_ms":  j.DurationMs,
			})
		}
		out.JSON(map[string]interface{}{
			"jobs":  jobs,
			"stats": resp.Stats,
		})
	} else {
		if resp.Stats != nil {
			out.Info("Job Status Summary:")
			out.Detail("Pending", fmt.Sprintf("%d", resp.Stats.Pending))
			out.Detail("Running", fmt.Sprintf("%d", resp.Stats.Running))
			out.Detail("Succeeded", fmt.Sprintf("%d", resp.Stats.Succeeded))
			out.Detail("Failed", fmt.Sprintf("%d", resp.Stats.Failed))
			out.Detail("Cancelled", fmt.Sprintf("%d", resp.Stats.Cancelled))
		}

		if len(resp.Jobs) > 0 {
			out.Info("\nTest Jobs:")
			table := out.Table([]string{"INDEX", "TEST ID", "STATUS", "DURATION"})
			for _, j := range resp.Jobs {
				duration := "-"
				if j.DurationMs != nil {
					duration = fmt.Sprintf("%dms", *j.DurationMs)
				}
				table.AddRow(
					fmt.Sprintf("%d", j.JobIndex),
					truncateString(j.TestId, 30),
					output.StatusColor(j.Status),
					duration,
				)
			}
			table.Render()
		}
	}

	return nil
}

func listTestJobs(c *client.Client, out *output.Writer) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.TestJobService.ListTestJobs(ctx, &proto.ListTestJobsRequest{
		ProjectId: testProjectID,
	})
	if err != nil {
		return fmt.Errorf("failed to list test jobs: %w", err)
	}

	if out.IsJSON() {
		out.JSON(resp)
	} else {
		if len(resp.Jobs) == 0 {
			out.Info("No test jobs found")
			return nil
		}

		table := out.Table([]string{"ID", "K8S JOB", "STATUS", "CREATED"})
		for _, j := range resp.Jobs {
			table.AddRow(
				j.Id,
				j.K8SJobName,
				output.StatusColor(j.Status),
				j.CreatedAt.AsTime().Format("2006-01-02 15:04"),
			)
		}
		table.Render()
	}

	return nil
}

func streamJobStatus(c *client.Client, projectID, jobName string, out *output.Writer) error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle interrupt
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		cancel()
	}()

	stream, err := c.TestJobService.StreamJobStatus(ctx, &proto.StreamJobStatusRequest{
		ProjectId:  projectID,
		K8SJobName: &jobName,
	})
	if err != nil {
		return fmt.Errorf("failed to stream status: %w", err)
	}

	out.Info("Streaming job status updates (Ctrl+C to stop)...")

	for {
		update, err := stream.Recv()
		if err == io.EOF {
			out.Info("Stream ended")
			break
		}
		if err != nil {
			if ctx.Err() != nil {
				return nil // Cancelled
			}
			return fmt.Errorf("stream error: %w", err)
		}

		if out.IsJSON() {
			out.JSON(map[string]interface{}{
				"job_id":          update.JobId,
				"test_id":         update.TestId,
				"previous_status": update.PreviousStatus,
				"current_status":  update.CurrentStatus,
				"exit_code":       update.ExitCode,
				"error_message":   update.ErrorMessage,
				"updated_at":      update.UpdatedAt.AsTime().Format(time.RFC3339),
			})
		} else {
			timestamp := update.UpdatedAt.AsTime().Format("15:04:05")
			statusColor := output.StatusColor(update.CurrentStatus)
			fmt.Printf("[%s] %s: %s\n", timestamp, truncateString(update.TestId, 20), statusColor)
		}
	}

	return nil
}

func runTestLogs(cmd *cobra.Command, args []string) error {
	out := output.New()
	jobID := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle interrupt
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		cancel()
	}()

	req := &proto.StreamJobLogsRequest{
		JobId:  jobID,
		Follow: testFollow,
	}
	if testTailLines > 0 {
		req.TailLines = &testTailLines
	}

	stream, err := c.TestJobService.StreamJobLogs(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to stream logs: %w", err)
	}

	for {
		chunk, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			if ctx.Err() != nil {
				return nil // Cancelled
			}
			return fmt.Errorf("stream error: %w", err)
		}

		if out.IsJSON() {
			out.JSON(map[string]interface{}{
				"job_id":    chunk.JobId,
				"log_line":  chunk.LogLine,
				"timestamp": chunk.Timestamp.AsTime().Format(time.RFC3339),
			})
		} else {
			fmt.Println(chunk.LogLine)
		}
	}

	return nil
}

func runTestCancel(cmd *cobra.Command, args []string) error {
	out := output.New()
	jobID := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.TestJobService.CancelTestJob(ctx, &proto.CancelTestJobRequest{
		JobId: jobID,
	})
	if err != nil {
		return fmt.Errorf("failed to cancel job: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"success": resp.Success,
			"message": resp.Message,
		})
	} else {
		if resp.Success {
			out.Success("Job cancelled: %s", jobID)
		} else {
			out.Error("Failed to cancel job: %s", resp.Message)
		}
	}

	return nil
}

func runTestResultsList(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &proto.ListTestResultsRequest{
		PageSize: 20,
	}
	if testBranch != "" {
		req.Branch = &testBranch
	}

	resp, err := c.TestResult.ListTestResults(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to list test results: %w", err)
	}

	if out.IsJSON() {
		out.JSON(resp)
	} else {
		if len(resp.Results) == 0 {
			out.Info("No test results found")
			return nil
		}

		table := out.Table([]string{"ID", "BRANCH", "PASSED", "FAILED", "DURATION", "DATE"})
		for _, r := range resp.Results {
			duration := "-"
			if r.Summary != nil {
				duration = fmt.Sprintf("%dms", r.Summary.DurationMs)
			}
			passed := "0"
			failed := "0"
			if r.Summary != nil {
				passed = fmt.Sprintf("%d", r.Summary.Passed)
				failed = fmt.Sprintf("%d", r.Summary.Failed)
			}
			table.AddRow(
				r.Id[:8],
				r.Branch,
				color.GreenString(passed),
				color.RedString(failed),
				duration,
				r.CreatedAt.AsTime().Format("2006-01-02 15:04"),
			)
		}
		table.Render()
	}

	return nil
}

func runTestResultsGet(cmd *cobra.Command, args []string) error {
	out := output.New()
	resultID := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.TestResult.GetTestResults(ctx, &proto.GetTestResultsRequest{
		ResultId: resultID,
	})
	if err != nil {
		return fmt.Errorf("failed to get test results: %w", err)
	}

	if out.IsJSON() {
		out.JSON(resp)
	} else {
		out.Info("Test Results: %s", resp.Id)
		out.Detail("Branch", resp.Branch)
		out.Detail("Commit", resp.CommitSha)
		out.Detail("Date", resp.CreatedAt.AsTime().Format(time.RFC1123))

		if resp.Summary != nil {
			out.Info("\nSummary:")
			out.Detail("Total", fmt.Sprintf("%d", resp.Summary.Total))
			out.Detail("Passed", color.GreenString("%d", resp.Summary.Passed))
			out.Detail("Failed", color.RedString("%d", resp.Summary.Failed))
			out.Detail("Skipped", fmt.Sprintf("%d", resp.Summary.Skipped))
			out.Detail("Duration", fmt.Sprintf("%dms", resp.Summary.DurationMs))
		}

		if len(resp.Tests) > 0 {
			out.Info("\nTest Cases:")
			table := out.Table([]string{"NAME", "STATUS", "DURATION"})
			for _, t := range resp.Tests {
				table.AddRow(
					truncateString(t.Name, 50),
					output.StatusColor(t.Status),
					fmt.Sprintf("%dms", t.DurationMs),
				)
			}
			table.Render()
		}
	}

	return nil
}

func runTestResultsStats(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &proto.GetTestStatisticsRequest{}
	if testBranch != "" {
		req.Branch = &testBranch
	}
	if testDays > 0 {
		req.Days = &testDays
	}

	resp, err := c.TestResult.GetTestStatistics(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to get test statistics: %w", err)
	}

	if out.IsJSON() {
		out.JSON(resp)
	} else {
		out.Info("Test Statistics (last %d days)", testDays)
		out.Detail("Total Runs", fmt.Sprintf("%d", resp.TotalRuns))
		out.Detail("Total Tests", fmt.Sprintf("%d", resp.TotalTests))
		out.Detail("Pass Rate", fmt.Sprintf("%.1f%%", resp.PassRate*100))
		out.Detail("Avg Duration", fmt.Sprintf("%dms", resp.AvgDurationMs))
	}

	return nil
}

func runTestJobGet(cmd *cobra.Command, args []string) error {
	out := output.New()
	jobID := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.TestJobService.GetTestJob(ctx, &proto.GetTestJobRequest{
		JobId: jobID,
	})
	if err != nil {
		return fmt.Errorf("failed to get test job: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"id":                    resp.Id,
			"project_id":            resp.ProjectId,
			"test_image_id":         resp.TestImageId,
			"test_run_id":           resp.TestRunId,
			"k8s_job_name":          resp.K8SJobName,
			"k8s_namespace":         resp.K8SNamespace,
			"test_id":               resp.TestId,
			"job_index":             resp.JobIndex,
			"status":                resp.Status,
			"exit_code":             resp.ExitCode,
			"pod_name":              resp.PodName,
			"artifact_volume_path":  resp.ArtifactVolumePath,
			"config":                resp.Config,
			"started_at":            resp.StartedAt,
			"completed_at":          resp.CompletedAt,
			"duration_ms":           resp.DurationMs,
			"created_at":            resp.CreatedAt.AsTime().Format(time.RFC3339),
		})
	} else {
		out.Info("Test Job: %s", resp.Id)
		out.Detail("K8s Job Name", resp.K8SJobName)
		out.Detail("Namespace", resp.K8SNamespace)
		out.Detail("Test ID", resp.TestId)
		out.Detail("Status", output.StatusColor(resp.Status))
		if resp.ExitCode != nil {
			out.Detail("Exit Code", fmt.Sprintf("%d", *resp.ExitCode))
		}
		if resp.PodName != nil {
			out.Detail("Pod Name", *resp.PodName)
		}
		if resp.DurationMs != nil {
			out.Detail("Duration", fmt.Sprintf("%dms", *resp.DurationMs))
		}
		out.Detail("Created", resp.CreatedAt.AsTime().Format(time.RFC1123))
	}

	return nil
}

func runTestJobStatus(cmd *cobra.Command, args []string) error {
	out := output.New()
	k8sJobName := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.TestJobService.GetJobStatus(ctx, &proto.GetJobStatusRequest{
		K8SJobName: k8sJobName,
	})
	if err != nil {
		return fmt.Errorf("failed to get job status: %w", err)
	}

	if out.IsJSON() {
		jobs := make([]map[string]interface{}, 0, len(resp.Jobs))
		for _, j := range resp.Jobs {
			jobs = append(jobs, map[string]interface{}{
				"id":        j.Id,
				"test_id":   j.TestId,
				"status":    j.Status,
				"job_index": j.JobIndex,
			})
		}
		out.JSON(map[string]interface{}{
			"k8s_job_name": resp.K8SJobName,
			"stats":        resp.Stats,
			"jobs":         jobs,
		})
	} else {
		out.Info("Job Status: %s", resp.K8SJobName)
		if resp.Stats != nil {
			out.Info("\nSummary:")
			out.Detail("Pending", fmt.Sprintf("%d", resp.Stats.Pending))
			out.Detail("Running", fmt.Sprintf("%d", resp.Stats.Running))
			out.Detail("Succeeded", color.GreenString("%d", resp.Stats.Succeeded))
			out.Detail("Failed", color.RedString("%d", resp.Stats.Failed))
			out.Detail("Cancelled", fmt.Sprintf("%d", resp.Stats.Cancelled))
		}

		if len(resp.Jobs) > 0 {
			out.Info("\nJobs:")
			table := out.Table([]string{"INDEX", "TEST ID", "STATUS"})
			for _, j := range resp.Jobs {
				table.AddRow(
					fmt.Sprintf("%d", j.JobIndex),
					truncateString(j.TestId, 30),
					output.StatusColor(j.Status),
				)
			}
			table.Render()
		}
	}

	return nil
}

func runTestResultsUpload(cmd *cobra.Command, args []string) error {
	out := output.New()
	filePath := args[0]

	// Read and parse the file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	var uploadData struct {
		Summary struct {
			Total      int32 `json:"total"`
			Passed     int32 `json:"passed"`
			Failed     int32 `json:"failed"`
			Skipped    int32 `json:"skipped"`
			Pending    int32 `json:"pending"`
			DurationMs int64 `json:"duration_ms"`
		} `json:"summary"`
		Tests []struct {
			Name         string   `json:"name"`
			Suite        string   `json:"suite"`
			Status       string   `json:"status"`
			DurationMs   int64    `json:"duration_ms"`
			ErrorMessage string   `json:"error_message,omitempty"`
			StackTrace   string   `json:"stack_trace,omitempty"`
			Tags         []string `json:"tags,omitempty"`
		} `json:"tests"`
		Environment map[string]string `json:"environment,omitempty"`
	}

	if err := json.Unmarshal(data, &uploadData); err != nil {
		return fmt.Errorf("failed to parse JSON file: %w", err)
	}

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Build request
	req := &proto.UploadTestResultsRequest{
		Branch:    testBranch,
		CommitSha: testCommit,
		Summary: &proto.TestSummary{
			Total:      uploadData.Summary.Total,
			Passed:     uploadData.Summary.Passed,
			Failed:     uploadData.Summary.Failed,
			Skipped:    uploadData.Summary.Skipped,
			Pending:    uploadData.Summary.Pending,
			DurationMs: uploadData.Summary.DurationMs,
		},
		Environment: uploadData.Environment,
	}

	for _, t := range uploadData.Tests {
		testCase := &proto.TestCase{
			Name:       t.Name,
			Suite:      t.Suite,
			Status:     t.Status,
			DurationMs: t.DurationMs,
			Tags:       t.Tags,
		}
		if t.ErrorMessage != "" {
			testCase.ErrorMessage = &t.ErrorMessage
		}
		if t.StackTrace != "" {
			testCase.StackTrace = &t.StackTrace
		}
		req.Tests = append(req.Tests, testCase)
	}

	resp, err := c.TestResult.UploadTestResults(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to upload test results: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"result_id": resp.ResultId,
			"success":   resp.Success,
			"message":   resp.Message,
		})
	} else {
		if resp.Success {
			out.Success("Test results uploaded")
			out.Detail("Result ID", resp.ResultId)
		} else {
			out.Error("Failed to upload test results: %s", resp.Message)
		}
	}

	return nil
}

func runTestResultsUpsert(cmd *cobra.Command, args []string) error {
	out := output.New()
	filePath := args[0]

	// Read and parse the file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	var uploadData struct {
		Summary struct {
			Total      int32 `json:"total"`
			Passed     int32 `json:"passed"`
			Failed     int32 `json:"failed"`
			Skipped    int32 `json:"skipped"`
			Pending    int32 `json:"pending"`
			DurationMs int64 `json:"duration_ms"`
		} `json:"summary"`
		Tests []struct {
			Name         string   `json:"name"`
			Suite        string   `json:"suite"`
			Status       string   `json:"status"`
			DurationMs   int64    `json:"duration_ms"`
			ErrorMessage string   `json:"error_message,omitempty"`
			StackTrace   string   `json:"stack_trace,omitempty"`
			Tags         []string `json:"tags,omitempty"`
		} `json:"tests"`
		Environment map[string]string `json:"environment,omitempty"`
	}

	if err := json.Unmarshal(data, &uploadData); err != nil {
		return fmt.Errorf("failed to parse JSON file: %w", err)
	}

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Build request
	req := &proto.UpsertTestResultsByRunIDRequest{
		TestRunId: testRunID,
		Branch:    testBranch,
		CommitSha: testCommit,
		Summary: &proto.TestSummary{
			Total:      uploadData.Summary.Total,
			Passed:     uploadData.Summary.Passed,
			Failed:     uploadData.Summary.Failed,
			Skipped:    uploadData.Summary.Skipped,
			Pending:    uploadData.Summary.Pending,
			DurationMs: uploadData.Summary.DurationMs,
		},
		Environment: uploadData.Environment,
	}

	for _, t := range uploadData.Tests {
		testCase := &proto.TestCase{
			Name:       t.Name,
			Suite:      t.Suite,
			Status:     t.Status,
			DurationMs: t.DurationMs,
			Tags:       t.Tags,
		}
		if t.ErrorMessage != "" {
			testCase.ErrorMessage = &t.ErrorMessage
		}
		if t.StackTrace != "" {
			testCase.StackTrace = &t.StackTrace
		}
		req.Tests = append(req.Tests, testCase)
	}

	resp, err := c.TestResult.UpsertTestResultsByRunID(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to upsert test results: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"result_id": resp.ResultId,
			"success":   resp.Success,
			"message":   resp.Message,
		})
	} else {
		if resp.Success {
			out.Success("Test results upserted")
			out.Detail("Result ID", resp.ResultId)
		} else {
			out.Error("Failed to upsert test results: %s", resp.Message)
		}
	}

	return nil
}

func runTestResultsStream(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle interrupt
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		if !out.IsJSON() {
			fmt.Println("\nStopping stream...")
		}
		cancel()
	}()

	stream, err := c.TestResult.StreamTestResults(ctx, &proto.StreamTestResultsRequest{})
	if err != nil {
		return fmt.Errorf("failed to start results stream: %w", err)
	}

	if !out.IsJSON() {
		out.Info("Streaming test results (Ctrl+C to stop)...")
		out.Info("")
	}

	for {
		resp, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			if ctx.Err() != nil {
				return nil // Cancelled
			}
			return fmt.Errorf("stream error: %w", err)
		}

		if out.IsJSON() {
			out.JSON(map[string]interface{}{
				"id":         resp.Id,
				"branch":     resp.Branch,
				"commit_sha": resp.CommitSha,
				"summary":    resp.Summary,
				"created_at": resp.CreatedAt.AsTime().Format(time.RFC3339),
			})
		} else {
			timestamp := resp.CreatedAt.AsTime().Format("15:04:05")
			passed := int32(0)
			failed := int32(0)
			if resp.Summary != nil {
				passed = resp.Summary.Passed
				failed = resp.Summary.Failed
			}
			fmt.Printf("[%s] %s@%s: %s passed, %s failed\n",
				timestamp,
				resp.Branch,
				truncateString(resp.CommitSha, 7),
				color.GreenString("%d", passed),
				color.RedString("%d", failed),
			)
		}
	}

	return nil
}

package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/client"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/output"
	"github.com/schollz/progressbar/v3"
	"github.com/spf13/cobra"
)

const (
	// 64KB chunk size for artifact streaming
	artifactChunkSize = 64 * 1024
)

var (
	artifactTestRunID    string
	artifactTestJobID    string
	artifactType         string
	artifactOutputPath   string
	artifactExpiresIn    int32
)

var artifactCmd = &cobra.Command{
	Use:   "artifact",
	Short: "Manage test artifacts",
	Long:  `Commands for listing, downloading, and uploading test artifacts.`,
}

var artifactListCmd = &cobra.Command{
	Use:   "list",
	Short: "List artifacts for a test job",
	Long:  `List all artifacts associated with a specific test job.`,
	RunE:  runArtifactList,
}

var artifactListByRunCmd = &cobra.Command{
	Use:   "list-by-run",
	Short: "List artifacts for a test run",
	Long:  `List all artifacts associated with a specific test run.`,
	RunE:  runArtifactListByRun,
}

var artifactGetCmd = &cobra.Command{
	Use:   "get <artifact-id>",
	Short: "Get artifact metadata",
	Long:  `Retrieve metadata for a specific artifact.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runArtifactGet,
}

var artifactDownloadCmd = &cobra.Command{
	Use:   "download <artifact-id>",
	Short: "Get artifact download URL",
	Long:  `Get a pre-signed URL to download an artifact.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runArtifactDownload,
}

var artifactUploadCmd = &cobra.Command{
	Use:   "upload <file-path>",
	Short: "Upload an artifact",
	Long:  `Upload a file as a test artifact with progress indication.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runArtifactUpload,
}

func init() {
	rootCmd.AddCommand(artifactCmd)

	// List command
	artifactCmd.AddCommand(artifactListCmd)
	artifactListCmd.Flags().StringVar(&artifactTestJobID, "job-id", "", "Test job ID (required)")
	artifactListCmd.Flags().StringVar(&artifactType, "type", "", "Filter by artifact type (screenshot, video, log, trace, report)")
	artifactListCmd.MarkFlagRequired("job-id")

	// List by run command
	artifactCmd.AddCommand(artifactListByRunCmd)
	artifactListByRunCmd.Flags().StringVar(&artifactTestRunID, "run-id", "", "Test run ID (required)")
	artifactListByRunCmd.Flags().StringVar(&artifactType, "type", "", "Filter by artifact type")
	artifactListByRunCmd.MarkFlagRequired("run-id")

	// Get command
	artifactCmd.AddCommand(artifactGetCmd)

	// Download command
	artifactCmd.AddCommand(artifactDownloadCmd)
	artifactDownloadCmd.Flags().Int32Var(&artifactExpiresIn, "expires-in", 3600, "URL expiration time in seconds")

	// Upload command
	artifactCmd.AddCommand(artifactUploadCmd)
	artifactUploadCmd.Flags().StringVar(&artifactTestJobID, "job-id", "", "Test job ID (required)")
	artifactUploadCmd.Flags().StringVar(&artifactTestRunID, "run-id", "", "Test run ID (required)")
	artifactUploadCmd.Flags().StringVar(&artifactType, "type", "other", "Artifact type (screenshot, video, log, trace, report, other)")
	artifactUploadCmd.MarkFlagRequired("job-id")
	artifactUploadCmd.MarkFlagRequired("run-id")
}

func runArtifactList(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &proto.ListArtifactsRequest{
		JobId: artifactTestJobID,
	}
	if artifactType != "" {
		req.ArtifactType = &artifactType
	}

	resp, err := c.TestJobService.ListArtifacts(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to list artifacts: %w", err)
	}

	if out.IsJSON() {
		out.JSON(resp.Artifacts)
	} else if len(resp.Artifacts) == 0 {
		out.Info("No artifacts found for job %s", artifactTestJobID)
	} else {
		out.Info("Artifacts for job %s:", artifactTestJobID)
		out.Detail("Total", fmt.Sprintf("%d artifacts (%s)", resp.TotalCount, formatBytes(resp.TotalSizeBytes)))
		out.Info("")
		table := out.Table([]string{"ID", "TYPE", "FILE", "SIZE", "CREATED"})
		for _, a := range resp.Artifacts {
			table.AddRow(
				truncateString(a.Id, 8),
				a.ArtifactType,
				a.FilePath,
				formatBytes(a.SizeBytes),
				a.CreatedAt.AsTime().Format("2006-01-02 15:04"),
			)
		}
		table.Render()
	}

	return nil
}

func runArtifactListByRun(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &proto.ListArtifactsByTestRunRequest{
		TestRunId: artifactTestRunID,
	}
	if artifactType != "" {
		req.ArtifactType = &artifactType
	}

	resp, err := c.TestJobService.ListArtifactsByTestRun(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to list artifacts: %w", err)
	}

	if out.IsJSON() {
		out.JSON(resp.Artifacts)
	} else if len(resp.Artifacts) == 0 {
		out.Info("No artifacts found for run %s", artifactTestRunID)
	} else {
		out.Info("Artifacts for run %s:", artifactTestRunID)
		out.Detail("Total", fmt.Sprintf("%d artifacts (%s)", resp.TotalCount, formatBytes(resp.TotalSizeBytes)))
		out.Info("")
		table := out.Table([]string{"ID", "TYPE", "FILE", "SIZE", "JOB ID", "CREATED"})
		for _, a := range resp.Artifacts {
			table.AddRow(
				truncateString(a.Id, 8),
				a.ArtifactType,
				a.FilePath,
				formatBytes(a.SizeBytes),
				truncateString(a.JobId, 8),
				a.CreatedAt.AsTime().Format("2006-01-02 15:04"),
			)
		}
		table.Render()
	}

	return nil
}

func runArtifactGet(cmd *cobra.Command, args []string) error {
	out := output.New()
	artifactID := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.TestJobService.GetArtifact(ctx, &proto.GetArtifactRequest{
		ArtifactId: artifactID,
	})
	if err != nil {
		return fmt.Errorf("failed to get artifact: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"id":            resp.Id,
			"test_run_id":   resp.TestRunId,
			"test_job_id":   resp.TestJobId,
			"artifact_type": resp.ArtifactType,
			"filename":      resp.Filename,
			"content_type":  resp.ContentType,
			"size_bytes":    resp.SizeBytes,
			"storage_path":  resp.StoragePath,
			"created_at":    resp.CreatedAt.AsTime().Format(time.RFC3339),
		})
	} else {
		out.Info("Artifact: %s", resp.Filename)
		out.Detail("ID", resp.Id)
		out.Detail("Test Run ID", resp.TestRunId)
		out.Detail("Test Job ID", resp.TestJobId)
		out.Detail("Type", resp.ArtifactType)
		out.Detail("Content Type", resp.ContentType)
		out.Detail("Size", formatBytes(resp.SizeBytes))
		out.Detail("Storage Path", resp.StoragePath)
		out.Detail("Created", resp.CreatedAt.AsTime().Format(time.RFC1123))
	}

	return nil
}

func runArtifactDownload(cmd *cobra.Command, args []string) error {
	out := output.New()
	artifactID := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &proto.GetArtifactDownloadUrlRequest{
		ArtifactId: artifactID,
	}
	if artifactExpiresIn > 0 {
		req.ExpiresInSeconds = &artifactExpiresIn
	}

	resp, err := c.TestJobService.GetArtifactDownloadUrl(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to get download URL: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"artifact_id":  artifactID,
			"download_url": resp.DownloadUrl,
			"expires_at":   resp.ExpiresAt.AsTime().Format(time.RFC3339),
		})
	} else {
		out.Info("Download URL for artifact %s", artifactID)
		out.Info("")
		out.Info(resp.DownloadUrl)
		out.Info("")
		out.Detail("Expires", resp.ExpiresAt.AsTime().Format(time.RFC1123))
	}

	return nil
}

func runArtifactUpload(cmd *cobra.Command, args []string) error {
	out := output.New()
	filePath := args[0]

	// Get file info
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return fmt.Errorf("failed to stat file: %w", err)
	}

	// Open file
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	// Start upload stream (longer timeout for large files)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	stream, err := c.TestJobService.UploadArtifact(ctx)
	if err != nil {
		return fmt.Errorf("failed to start upload: %w", err)
	}

	// Create progress bar
	var bar *progressbar.ProgressBar
	if !out.IsJSON() {
		bar = progressbar.NewOptions64(
			fileInfo.Size(),
			progressbar.OptionSetDescription(fmt.Sprintf("Uploading %s", filepath.Base(filePath))),
			progressbar.OptionSetWidth(40),
			progressbar.OptionShowBytes(true),
			progressbar.OptionShowCount(),
			progressbar.OptionSetTheme(progressbar.Theme{
				Saucer:        "=",
				SaucerHead:    ">",
				SaucerPadding: " ",
				BarStart:      "[",
				BarEnd:        "]",
			}),
			progressbar.OptionOnCompletion(func() {
				fmt.Println()
			}),
		)
	}

	// Send metadata first
	metadataReq := &proto.UploadArtifactRequest{
		Data: &proto.UploadArtifactRequest_Metadata{
			Metadata: &proto.ArtifactMetadata{
				TestRunId:    artifactTestRunID,
				TestJobId:    artifactTestJobID,
				ArtifactType: artifactType,
				Filename:     filepath.Base(filePath),
				ContentType:  detectContentType(filePath),
				SizeBytes:    fileInfo.Size(),
			},
		},
	}
	if err := stream.Send(metadataReq); err != nil {
		return fmt.Errorf("failed to send metadata: %w", err)
	}

	// Send file in chunks
	buf := make([]byte, artifactChunkSize)
	var totalBytes int64

	for {
		n, err := file.Read(buf)
		if err != nil && err.Error() != "EOF" {
			return fmt.Errorf("failed to read file: %w", err)
		}
		if n == 0 {
			break
		}

		chunkReq := &proto.UploadArtifactRequest{
			Data: &proto.UploadArtifactRequest_Chunk{
				Chunk: buf[:n],
			},
		}
		if err := stream.Send(chunkReq); err != nil {
			return fmt.Errorf("failed to send chunk: %w", err)
		}

		totalBytes += int64(n)
		if bar != nil {
			bar.Add(n)
		}
	}

	// Close and get response
	resp, err := stream.CloseAndRecv()
	if err != nil {
		return fmt.Errorf("failed to complete upload: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"artifact_id":    resp.ArtifactId,
			"success":        resp.Success,
			"message":        resp.Message,
			"bytes_received": resp.BytesReceived,
		})
	} else {
		if resp.Success {
			out.Success("Uploaded %s (%s)", filepath.Base(filePath), formatBytes(totalBytes))
			out.Detail("Artifact ID", resp.ArtifactId)
			out.Detail("Bytes Received", formatBytes(resp.BytesReceived))
		} else {
			out.Error("Failed to upload artifact: %s", resp.Message)
		}
	}

	return nil
}

// formatBytes formats bytes into human-readable format
func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// detectContentType returns the MIME type based on file extension
func detectContentType(filePath string) string {
	ext := filepath.Ext(filePath)
	switch ext {
	case ".json":
		return "application/json"
	case ".xml":
		return "application/xml"
	case ".html", ".htm":
		return "text/html"
	case ".txt", ".log":
		return "text/plain"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".pdf":
		return "application/pdf"
	case ".zip":
		return "application/zip"
	case ".tar":
		return "application/x-tar"
	case ".gz":
		return "application/gzip"
	case ".webm":
		return "video/webm"
	case ".mp4":
		return "video/mp4"
	default:
		return "application/octet-stream"
	}
}

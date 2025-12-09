package cmd

import (
	"context"
	"fmt"
	"time"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/client"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/output"
	"github.com/spf13/cobra"
)

var imageCmd = &cobra.Command{
	Use:   "image",
	Short: "Manage test images",
	Long:  `Commands for managing test images in ScaledTest.`,
}

var imageAddCmd = &cobra.Command{
	Use:   "add <image-path>",
	Short: "Add a test image",
	Long: `Add a new test image configuration.

Example:
  scaledtest image add my-tests:latest --project-id <id> --registry-id <id>
  scaledtest image add ghcr.io/org/tests:v1.0 --project-id <id> --registry-id <id> --auto-discover`,
	Args: cobra.ExactArgs(1),
	RunE: runImageAdd,
}

var imageListCmd = &cobra.Command{
	Use:   "list",
	Short: "List test images",
	Long:  `List all test images for a project.`,
	RunE:  runImageList,
}

var imageGetCmd = &cobra.Command{
	Use:   "get <image-id>",
	Short: "Get test image details",
	Long:  `Get detailed information about a test image including discovered tests.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runImageGet,
}

var imageDiscoverCmd = &cobra.Command{
	Use:   "discover <image-id>",
	Short: "Discover tests in an image",
	Long:  `Trigger test discovery for an image to find available tests.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runImageDiscover,
}

var imageDeleteCmd = &cobra.Command{
	Use:   "delete <image-id>",
	Short: "Delete a test image",
	Long:  `Delete a test image configuration.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runImageDelete,
}

var (
	imageProjectID    string
	imageRegistryID   string
	imageTag          string
	imageAutoDiscover bool
	imageForceRefresh bool
	imageForce        bool
)

func init() {
	rootCmd.AddCommand(imageCmd)
	imageCmd.AddCommand(imageAddCmd)
	imageCmd.AddCommand(imageListCmd)
	imageCmd.AddCommand(imageGetCmd)
	imageCmd.AddCommand(imageDiscoverCmd)
	imageCmd.AddCommand(imageDeleteCmd)

	// Add command flags
	imageAddCmd.Flags().StringVar(&imageProjectID, "project-id", "", "Project ID (required)")
	imageAddCmd.Flags().StringVar(&imageRegistryID, "registry-id", "", "Registry ID (required)")
	imageAddCmd.Flags().StringVar(&imageTag, "tag", "latest", "Image tag")
	imageAddCmd.Flags().BoolVar(&imageAutoDiscover, "auto-discover", false, "Automatically discover tests after adding")
	imageAddCmd.MarkFlagRequired("project-id")
	imageAddCmd.MarkFlagRequired("registry-id")

	// List command flags
	imageListCmd.Flags().StringVar(&imageProjectID, "project-id", "", "Project ID (required)")
	imageListCmd.MarkFlagRequired("project-id")

	// Discover command flags
	imageDiscoverCmd.Flags().BoolVar(&imageForceRefresh, "force", false, "Force refresh even if cached results exist")

	// Delete command flags
	imageDeleteCmd.Flags().BoolVar(&imageForce, "force", false, "Skip confirmation prompt")
}

func runImageAdd(cmd *cobra.Command, args []string) error {
	out := output.New()
	imagePath := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	req := &proto.AddTestImageRequest{
		ProjectId:    imageProjectID,
		RegistryId:   imageRegistryID,
		ImagePath:    imagePath,
		ImageTag:     imageTag,
		AutoDiscover: imageAutoDiscover,
	}

	resp, err := c.TestJobService.AddTestImage(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to add test image: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"id":               resp.Id,
			"image_path":       resp.ImagePath,
			"image_tag":        resp.ImageTag,
			"discovery_status": resp.DiscoveryStatus,
			"total_test_count": resp.TotalTestCount,
		})
	} else {
		out.Success("Test image added: %s:%s", imagePath, imageTag)
		out.Detail("ID", resp.Id)
		out.Detail("Discovery Status", output.StatusColor(resp.DiscoveryStatus))
		if resp.TotalTestCount > 0 {
			out.Detail("Tests Found", fmt.Sprintf("%d", resp.TotalTestCount))
		}
	}

	return nil
}

func runImageList(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.TestJobService.ListTestImages(ctx, &proto.ListTestImagesRequest{
		ProjectId: imageProjectID,
	})
	if err != nil {
		return fmt.Errorf("failed to list test images: %w", err)
	}

	if out.IsJSON() {
		images := make([]map[string]interface{}, 0, len(resp.Images))
		for _, img := range resp.Images {
			images = append(images, map[string]interface{}{
				"id":               img.Id,
				"image_path":       img.ImagePath,
				"image_tag":        img.ImageTag,
				"framework":        img.Framework,
				"discovery_status": img.DiscoveryStatus,
				"total_test_count": img.TotalTestCount,
				"created_at":       img.CreatedAt.AsTime().Format(time.RFC3339),
			})
		}
		out.JSON(map[string]interface{}{
			"images":      images,
			"total_count": resp.TotalCount,
		})
	} else {
		if len(resp.Images) == 0 {
			out.Info("No test images found")
			return nil
		}

		table := out.Table([]string{"ID", "IMAGE", "TAG", "FRAMEWORK", "TESTS", "STATUS"})
		for _, img := range resp.Images {
			framework := "-"
			if img.Framework != nil {
				framework = *img.Framework
			}
			table.AddRow(
				img.Id,
				truncateString(img.ImagePath, 30),
				img.ImageTag,
				framework,
				fmt.Sprintf("%d", img.TotalTestCount),
				output.StatusColor(img.DiscoveryStatus),
			)
		}
		table.Render()
	}

	return nil
}

func runImageGet(cmd *cobra.Command, args []string) error {
	out := output.New()
	imageID := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.TestJobService.GetTestImage(ctx, &proto.GetTestImageRequest{
		TestImageId: imageID,
	})
	if err != nil {
		return fmt.Errorf("failed to get test image: %w", err)
	}

	if out.IsJSON() {
		tests := make([]map[string]interface{}, 0, len(resp.DiscoveredTests))
		for _, t := range resp.DiscoveredTests {
			tests = append(tests, map[string]interface{}{
				"id":    t.Id,
				"name":  t.Name,
				"suite": t.Suite,
				"file":  t.File,
				"tags":  t.Tags,
			})
		}
		out.JSON(map[string]interface{}{
			"id":               resp.Id,
			"image_path":       resp.ImagePath,
			"image_tag":        resp.ImageTag,
			"image_digest":     resp.ImageDigest,
			"framework":        resp.Framework,
			"framework_version": resp.FrameworkVersion,
			"discovery_status": resp.DiscoveryStatus,
			"discovery_error":  resp.DiscoveryError,
			"total_test_count": resp.TotalTestCount,
			"discovered_tests": tests,
			"created_at":       resp.CreatedAt.AsTime().Format(time.RFC3339),
			"updated_at":       resp.UpdatedAt.AsTime().Format(time.RFC3339),
		})
	} else {
		out.Info("Test Image: %s:%s", resp.ImagePath, resp.ImageTag)
		out.Detail("ID", resp.Id)
		out.Detail("Discovery Status", output.StatusColor(resp.DiscoveryStatus))

		if resp.Framework != nil {
			framework := *resp.Framework
			if resp.FrameworkVersion != nil {
				framework += " " + *resp.FrameworkVersion
			}
			out.Detail("Framework", framework)
		}

		out.Detail("Total Tests", fmt.Sprintf("%d", resp.TotalTestCount))

		if resp.DiscoveryError != nil && *resp.DiscoveryError != "" {
			out.Detail("Error", *resp.DiscoveryError)
		}

		if len(resp.DiscoveredTests) > 0 {
			out.Info("\nDiscovered Tests:")
			table := out.Table([]string{"NAME", "SUITE", "FILE"})
			for _, t := range resp.DiscoveredTests {
				suite := "-"
				if t.Suite != nil {
					suite = *t.Suite
				}
				table.AddRow(t.Name, suite, t.File)
			}
			table.Render()
		}
	}

	return nil
}

func runImageDiscover(cmd *cobra.Command, args []string) error {
	out := output.New()
	imageID := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	spinner := output.NewSpinner("Discovering tests")
	spinner.Start()

	resp, err := c.TestJobService.DiscoverTests(ctx, &proto.DiscoverTestsRequest{
		TestImageId:  imageID,
		ForceRefresh: &imageForceRefresh,
	})

	if err != nil {
		spinner.Stop(false)
		return fmt.Errorf("failed to discover tests: %w", err)
	}

	spinner.Stop(resp.Success)

	if out.IsJSON() {
		tests := make([]map[string]interface{}, 0, len(resp.Tests))
		for _, t := range resp.Tests {
			tests = append(tests, map[string]interface{}{
				"id":    t.Id,
				"name":  t.Name,
				"suite": t.Suite,
				"file":  t.File,
				"tags":  t.Tags,
			})
		}
		out.JSON(map[string]interface{}{
			"success":    resp.Success,
			"message":    resp.Message,
			"test_count": resp.TestCount,
			"tests":      tests,
		})
	} else {
		if resp.Success {
			out.Success("Discovered %d tests", resp.TestCount)
			if len(resp.Tests) > 0 && len(resp.Tests) <= 20 {
				table := out.Table([]string{"NAME", "SUITE", "FILE"})
				for _, t := range resp.Tests {
					suite := "-"
					if t.Suite != nil {
						suite = *t.Suite
					}
					table.AddRow(t.Name, suite, t.File)
				}
				table.Render()
			} else if len(resp.Tests) > 20 {
				out.Info("Use 'scaledtest image get %s' to see all tests", imageID)
			}
		} else {
			out.Error("Discovery failed: %s", resp.Message)
		}
	}

	return nil
}

func runImageDelete(cmd *cobra.Command, args []string) error {
	out := output.New()
	imageID := args[0]

	if !imageForce && !out.IsJSON() {
		out.Warning("This will permanently delete the test image configuration.")
		out.Info("Use --force to skip this confirmation.")
		return fmt.Errorf("operation cancelled")
	}

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.TestJobService.DeleteTestImage(ctx, &proto.DeleteTestImageRequest{
		TestImageId: imageID,
	})
	if err != nil {
		return fmt.Errorf("failed to delete test image: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"success": resp.Success,
			"message": resp.Message,
		})
	} else {
		out.Success("Test image deleted: %s", imageID)
	}

	return nil
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

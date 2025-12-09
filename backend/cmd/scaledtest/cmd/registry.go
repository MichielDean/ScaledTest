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

var registryCmd = &cobra.Command{
	Use:   "registry",
	Short: "Manage container registries",
	Long:  `Commands for managing container registries where test images are stored.`,
}

var registryAddCmd = &cobra.Command{
	Use:   "add <name>",
	Short: "Add a container registry",
	Long: `Add a new container registry configuration.

Example:
  scaledtest registry add my-registry --url docker.io --project-id <id>
  scaledtest registry add ghcr --url ghcr.io --type github --username user --project-id <id>`,
	Args: cobra.ExactArgs(1),
	RunE: runRegistryAdd,
}

var registryListCmd = &cobra.Command{
	Use:   "list",
	Short: "List container registries",
	Long:  `List all container registries for a project.`,
	RunE:  runRegistryList,
}

var registryTestCmd = &cobra.Command{
	Use:   "test <registry-id>",
	Short: "Test registry connection",
	Long:  `Test the connection to a container registry.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runRegistryTest,
}

var registryDeleteCmd = &cobra.Command{
	Use:   "delete <registry-id>",
	Short: "Delete a container registry",
	Long:  `Delete a container registry configuration.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runRegistryDelete,
}

var registryGetCmd = &cobra.Command{
	Use:   "get <registry-id>",
	Short: "Get registry details",
	Long:  `Get detailed information about a specific container registry.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runRegistryGet,
}

var registryUpdateCmd = &cobra.Command{
	Use:   "update <registry-id>",
	Short: "Update a container registry",
	Long: `Update a container registry configuration.

Example:
  scaledtest registry update <id> --name "New Name"
  scaledtest registry update <id> --username newuser --credentials newpass`,
	Args: cobra.ExactArgs(1),
	RunE: runRegistryUpdate,
}

var registrySyncCmd = &cobra.Command{
	Use:   "sync <registry-id>",
	Short: "Sync images from registry",
	Long:  `Synchronize test images from the container registry.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runRegistrySync,
}

var (
	registryProjectID      string
	registryURL            string
	registryType           string
	registryUsername       string
	registryCredentials    string
	registryAuthType       string
	registryForce          bool
	registryUpdateName     string
	registryUpdateUsername string
	registryUpdateCreds    string
)

func init() {
	rootCmd.AddCommand(registryCmd)
	registryCmd.AddCommand(registryAddCmd)
	registryCmd.AddCommand(registryListCmd)
	registryCmd.AddCommand(registryGetCmd)
	registryCmd.AddCommand(registryTestCmd)
	registryCmd.AddCommand(registryUpdateCmd)
	registryCmd.AddCommand(registrySyncCmd)
	registryCmd.AddCommand(registryDeleteCmd)

	// Add command flags
	registryAddCmd.Flags().StringVar(&registryProjectID, "project-id", "", "Project ID (required)")
	registryAddCmd.Flags().StringVar(&registryURL, "url", "", "Registry URL (required)")
	registryAddCmd.Flags().StringVar(&registryType, "type", "generic", "Registry type: dockerhub, github, gcr, acr, nexus, artifactory, generic")
	registryAddCmd.Flags().StringVar(&registryUsername, "username", "", "Registry username")
	registryAddCmd.Flags().StringVar(&registryCredentials, "credentials", "", "Registry password or token")
	registryAddCmd.Flags().StringVar(&registryAuthType, "auth-type", "basic", "Auth type: basic, token, oauth")
	registryAddCmd.MarkFlagRequired("project-id")
	registryAddCmd.MarkFlagRequired("url")

	// List command flags
	registryListCmd.Flags().StringVar(&registryProjectID, "project-id", "", "Project ID (required)")
	registryListCmd.MarkFlagRequired("project-id")

	// Delete command flags
	registryDeleteCmd.Flags().BoolVar(&registryForce, "force", false, "Skip confirmation prompt")

	// Update command flags
	registryUpdateCmd.Flags().StringVar(&registryUpdateName, "name", "", "New registry name")
	registryUpdateCmd.Flags().StringVar(&registryUpdateUsername, "username", "", "New username")
	registryUpdateCmd.Flags().StringVar(&registryUpdateCreds, "credentials", "", "New credentials")
}

func runRegistryAdd(cmd *cobra.Command, args []string) error {
	out := output.New()
	name := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &proto.AddContainerRegistryRequest{
		ProjectId:    registryProjectID,
		Name:         name,
		RegistryUrl:  registryURL,
		RegistryType: registryType,
		AuthType:     registryAuthType,
	}
	if registryUsername != "" {
		req.Username = &registryUsername
	}
	if registryCredentials != "" {
		req.Credentials = &registryCredentials
	}

	resp, err := c.TestJobService.AddContainerRegistry(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to add registry: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"id":           resp.Id,
			"name":         resp.Name,
			"registry_url": resp.RegistryUrl,
			"registry_type": resp.RegistryType,
		})
	} else {
		out.Success("Registry added: %s", name)
		out.Detail("ID", resp.Id)
		out.Detail("URL", resp.RegistryUrl)
		out.Detail("Type", resp.RegistryType)
	}

	return nil
}

func runRegistryList(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.TestJobService.ListContainerRegistries(ctx, &proto.ListContainerRegistriesRequest{
		ProjectId: registryProjectID,
	})
	if err != nil {
		return fmt.Errorf("failed to list registries: %w", err)
	}

	if out.IsJSON() {
		registries := make([]map[string]interface{}, 0, len(resp.Registries))
		for _, r := range resp.Registries {
			registries = append(registries, map[string]interface{}{
				"id":            r.Id,
				"name":          r.Name,
				"registry_url":  r.RegistryUrl,
				"registry_type": r.RegistryType,
				"test_status":   r.TestStatus,
				"created_at":    r.CreatedAt.AsTime().Format(time.RFC3339),
			})
		}
		out.JSON(map[string]interface{}{
			"registries":  registries,
			"total_count": resp.TotalCount,
		})
	} else {
		if len(resp.Registries) == 0 {
			out.Info("No registries found")
			return nil
		}

		table := out.Table([]string{"ID", "NAME", "URL", "TYPE", "STATUS"})
		for _, r := range resp.Registries {
			status := "unknown"
			if r.TestStatus != nil {
				status = *r.TestStatus
			}
			table.AddRow(
				r.Id,
				r.Name,
				r.RegistryUrl,
				r.RegistryType,
				output.StatusColor(status),
			)
		}
		table.Render()
	}

	return nil
}

func runRegistryTest(cmd *cobra.Command, args []string) error {
	out := output.New()
	registryID := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	spinner := output.NewSpinner("Testing registry connection")
	spinner.Start()

	resp, err := c.TestJobService.TestRegistryConnection(ctx, &proto.TestRegistryConnectionRequest{
		RegistryId: registryID,
	})

	if err != nil {
		spinner.Stop(false)
		return fmt.Errorf("failed to test registry: %w", err)
	}

	spinner.Stop(resp.Success)

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"success":   resp.Success,
			"message":   resp.Message,
			"tested_at": resp.TestedAt.AsTime().Format(time.RFC3339),
		})
	} else {
		if resp.Success {
			out.Success("Registry connection successful")
		} else {
			out.Error("Registry connection failed: %s", resp.Message)
		}
	}

	return nil
}

func runRegistryDelete(cmd *cobra.Command, args []string) error {
	out := output.New()
	registryID := args[0]

	if !registryForce && !out.IsJSON() {
		out.Warning("This will permanently delete the registry configuration.")
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

	resp, err := c.TestJobService.DeleteContainerRegistry(ctx, &proto.DeleteContainerRegistryRequest{
		RegistryId: registryID,
	})
	if err != nil {
		return fmt.Errorf("failed to delete registry: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"success": resp.Success,
			"message": resp.Message,
		})
	} else {
		out.Success("Registry deleted: %s", registryID)
	}

	return nil
}

func runRegistryGet(cmd *cobra.Command, args []string) error {
	out := output.New()
	registryID := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.TestJobService.GetContainerRegistry(ctx, &proto.GetContainerRegistryRequest{
		RegistryId: registryID,
	})
	if err != nil {
		return fmt.Errorf("failed to get registry: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"id":            resp.Id,
			"project_id":    resp.ProjectId,
			"name":          resp.Name,
			"registry_url":  resp.RegistryUrl,
			"registry_type": resp.RegistryType,
			"username":      resp.Username,
			"auth_type":     resp.AuthType,
			"last_tested_at": resp.LastTestedAt,
			"test_status":   resp.TestStatus,
			"test_error":    resp.TestError,
			"created_at":    resp.CreatedAt.AsTime().Format(time.RFC3339),
			"updated_at":    resp.UpdatedAt.AsTime().Format(time.RFC3339),
		})
	} else {
		out.Info("Registry: %s", resp.Name)
		out.Detail("ID", resp.Id)
		out.Detail("URL", resp.RegistryUrl)
		out.Detail("Type", resp.RegistryType)
		out.Detail("Auth Type", resp.AuthType)
		if resp.Username != nil && *resp.Username != "" {
			out.Detail("Username", *resp.Username)
		}
		status := "unknown"
		if resp.TestStatus != nil {
			status = *resp.TestStatus
		}
		out.Detail("Test Status", output.StatusColor(status))
		if resp.TestError != nil && *resp.TestError != "" {
			out.Detail("Test Error", *resp.TestError)
		}
		out.Detail("Created", resp.CreatedAt.AsTime().Format(time.RFC1123))
		out.Detail("Updated", resp.UpdatedAt.AsTime().Format(time.RFC1123))
	}

	return nil
}

func runRegistryUpdate(cmd *cobra.Command, args []string) error {
	out := output.New()
	registryID := args[0]

	// Check if any update flags are provided
	if registryUpdateName == "" && registryUpdateUsername == "" && registryUpdateCreds == "" {
		return fmt.Errorf("at least one of --name, --username, or --credentials must be provided")
	}

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &proto.UpdateContainerRegistryRequest{
		RegistryId: registryID,
	}
	if registryUpdateName != "" {
		req.Name = &registryUpdateName
	}
	if registryUpdateUsername != "" {
		req.Username = &registryUpdateUsername
	}
	if registryUpdateCreds != "" {
		req.Credentials = &registryUpdateCreds
	}

	resp, err := c.TestJobService.UpdateContainerRegistry(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to update registry: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"id":           resp.Id,
			"name":         resp.Name,
			"registry_url": resp.RegistryUrl,
			"updated_at":   resp.UpdatedAt.AsTime().Format(time.RFC3339),
		})
	} else {
		out.Success("Registry updated: %s", resp.Name)
	}

	return nil
}

func runRegistrySync(cmd *cobra.Command, args []string) error {
	out := output.New()
	registryID := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	spinner := output.NewSpinner("Syncing registry images")
	spinner.Start()

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	resp, err := c.TestJobService.SyncRegistryImages(ctx, &proto.SyncRegistryImagesRequest{
		RegistryId: registryID,
	})
	if err != nil {
		spinner.Stop(false)
		return fmt.Errorf("failed to sync registry images: %w", err)
	}

	spinner.Stop(resp.Success)

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"success":       resp.Success,
			"message":       resp.Message,
			"images_found":  resp.ImagesFound,
			"images_synced": resp.ImagesSynced,
		})
	} else {
		if resp.Success {
			out.Success("Registry sync completed")
			out.Detail("Images Found", fmt.Sprintf("%d", resp.ImagesFound))
			out.Detail("Images Synced", fmt.Sprintf("%d", resp.ImagesSynced))
		} else {
			out.Error("Registry sync failed: %s", resp.Message)
		}
	}

	return nil
}

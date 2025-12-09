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

var projectCmd = &cobra.Command{
	Use:   "project",
	Short: "Manage projects",
	Long:  `Commands for managing ScaledTest projects.`,
}

var projectCreateCmd = &cobra.Command{
	Use:   "create <name>",
	Short: "Create a new project",
	Long: `Create a new project in ScaledTest.

Example:
  scaledtest project create my-project
  scaledtest project create my-project --description "My test project"`,
	Args: cobra.ExactArgs(1),
	RunE: runProjectCreate,
}

var projectListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all projects",
	Long:  `List all projects you have access to.`,
	RunE:  runProjectList,
}

var projectGetCmd = &cobra.Command{
	Use:   "get <project-id>",
	Short: "Get project details",
	Long:  `Get detailed information about a specific project.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runProjectGet,
}

var projectDeleteCmd = &cobra.Command{
	Use:   "delete <project-id>",
	Short: "Delete a project",
	Long:  `Delete a project and all its associated resources.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runProjectDelete,
}

var projectUpdateCmd = &cobra.Command{
	Use:   "update <project-id>",
	Short: "Update a project",
	Long: `Update a project's name or description.

Example:
  scaledtest project update <id> --name "New Name"
  scaledtest project update <id> --description "New description"`,
	Args: cobra.ExactArgs(1),
	RunE: runProjectUpdate,
}

var (
	projectDescription       string
	projectPage              int32
	projectPageSize          int32
	projectForce             bool
	projectUpdateName        string
	projectUpdateDescription string
)

func init() {
	rootCmd.AddCommand(projectCmd)
	projectCmd.AddCommand(projectCreateCmd)
	projectCmd.AddCommand(projectListCmd)
	projectCmd.AddCommand(projectGetCmd)
	projectCmd.AddCommand(projectUpdateCmd)
	projectCmd.AddCommand(projectDeleteCmd)

	projectCreateCmd.Flags().StringVar(&projectDescription, "description", "", "Project description")

	projectListCmd.Flags().Int32Var(&projectPage, "page", 1, "Page number")
	projectListCmd.Flags().Int32Var(&projectPageSize, "page-size", 20, "Number of items per page")

	projectDeleteCmd.Flags().BoolVar(&projectForce, "force", false, "Skip confirmation prompt")

	// Update command flags
	projectUpdateCmd.Flags().StringVar(&projectUpdateName, "name", "", "New project name")
	projectUpdateCmd.Flags().StringVar(&projectUpdateDescription, "description", "", "New project description")
}

func runProjectCreate(cmd *cobra.Command, args []string) error {
	out := output.New()
	name := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &proto.CreateProjectRequest{
		Name: name,
	}
	if projectDescription != "" {
		req.Description = &projectDescription
	}

	resp, err := c.TestJobService.CreateProject(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to create project: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"id":      resp.ProjectId,
			"name":    name,
			"message": resp.Message,
		})
	} else {
		out.Success("Project created: %s", name)
		out.Detail("ID", resp.ProjectId)
	}

	return nil
}

func runProjectList(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &proto.ListProjectsRequest{
		Page:     projectPage,
		PageSize: projectPageSize,
	}

	resp, err := c.TestJobService.ListProjects(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to list projects: %w", err)
	}

	if out.IsJSON() {
		projects := make([]map[string]interface{}, 0, len(resp.Projects))
		for _, p := range resp.Projects {
			projects = append(projects, map[string]interface{}{
				"id":          p.Id,
				"name":        p.Name,
				"description": p.Description,
				"created_by":  p.CreatedBy,
				"created_at":  p.CreatedAt.AsTime().Format(time.RFC3339),
			})
		}
		out.JSON(map[string]interface{}{
			"projects":    projects,
			"total_count": resp.TotalCount,
		})
	} else {
		if len(resp.Projects) == 0 {
			out.Info("No projects found")
			return nil
		}

		table := out.Table([]string{"ID", "NAME", "DESCRIPTION", "CREATED"})
		for _, p := range resp.Projects {
			desc := ""
			if p.Description != nil {
				desc = *p.Description
				if len(desc) > 40 {
					desc = desc[:37] + "..."
				}
			}
			table.AddRow(
				p.Id,
				p.Name,
				desc,
				p.CreatedAt.AsTime().Format("2006-01-02"),
			)
		}
		table.Render()
		out.Info("\nTotal: %d projects", resp.TotalCount)
	}

	return nil
}

func runProjectGet(cmd *cobra.Command, args []string) error {
	out := output.New()
	projectID := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.TestJobService.GetProject(ctx, &proto.GetProjectRequest{
		ProjectId: projectID,
	})
	if err != nil {
		return fmt.Errorf("failed to get project: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"id":          resp.Id,
			"name":        resp.Name,
			"description": resp.Description,
			"created_by":  resp.CreatedBy,
			"created_at":  resp.CreatedAt.AsTime().Format(time.RFC3339),
			"updated_at":  resp.UpdatedAt.AsTime().Format(time.RFC3339),
			"settings":    resp.Settings,
		})
	} else {
		out.Info("Project: %s", resp.Name)
		out.Detail("ID", resp.Id)
		if resp.Description != nil && *resp.Description != "" {
			out.Detail("Description", *resp.Description)
		}
		out.Detail("Created By", resp.CreatedBy)
		out.Detail("Created", resp.CreatedAt.AsTime().Format(time.RFC1123))
		out.Detail("Updated", resp.UpdatedAt.AsTime().Format(time.RFC1123))
	}

	return nil
}

func runProjectDelete(cmd *cobra.Command, args []string) error {
	out := output.New()
	projectID := args[0]

	if !projectForce && !out.IsJSON() {
		out.Warning("This will permanently delete the project and all associated resources.")
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

	resp, err := c.TestJobService.DeleteProject(ctx, &proto.DeleteProjectRequest{
		ProjectId: projectID,
	})
	if err != nil {
		return fmt.Errorf("failed to delete project: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"success": resp.Success,
			"message": resp.Message,
		})
	} else {
		out.Success("Project deleted: %s", projectID)
	}

	return nil
}

func runProjectUpdate(cmd *cobra.Command, args []string) error {
	out := output.New()
	projectID := args[0]

	// Check if any update flags are provided
	if projectUpdateName == "" && projectUpdateDescription == "" {
		return fmt.Errorf("at least one of --name or --description must be provided")
	}

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &proto.UpdateProjectRequest{
		ProjectId: projectID,
	}
	if projectUpdateName != "" {
		req.Name = &projectUpdateName
	}
	if projectUpdateDescription != "" {
		req.Description = &projectUpdateDescription
	}

	resp, err := c.TestJobService.UpdateProject(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to update project: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"id":          resp.Id,
			"name":        resp.Name,
			"description": resp.Description,
			"updated_at":  resp.UpdatedAt.AsTime().Format(time.RFC3339),
		})
	} else {
		out.Success("Project updated: %s", resp.Name)
		if resp.Description != nil && *resp.Description != "" {
			out.Detail("Description", *resp.Description)
		}
	}

	return nil
}

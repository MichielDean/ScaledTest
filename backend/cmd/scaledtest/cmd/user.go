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

var userMgmtCmd = &cobra.Command{
	Use:   "user",
	Short: "Manage users",
	Long:  `Commands for managing user profiles and accounts.`,
}

var userGetCmd = &cobra.Command{
	Use:   "get <user-id>",
	Short: "Get user profile",
	Long:  `Get detailed information about a user profile.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runUserGet,
}

var userUpdateCmd = &cobra.Command{
	Use:   "update <user-id>",
	Short: "Update user profile",
	Long: `Update a user's profile information.

Example:
  scaledtest user update <user-id> --name "New Name"
  scaledtest user update <user-id> --avatar-url "https://example.com/avatar.png"`,
	Args: cobra.ExactArgs(1),
	RunE: runUserUpdate,
}

var userListCmd = &cobra.Command{
	Use:   "list",
	Short: "List users (admin only)",
	Long:  `List all users in the system. Requires admin privileges.`,
	RunE:  runUserList,
}

var (
	userUpdateName      string
	userUpdateAvatarURL string
	userListPage        int32
	userListPageSize    int32
	userListSearch      string
	userListRoleFilter  string
)

func init() {
	rootCmd.AddCommand(userMgmtCmd)
	userMgmtCmd.AddCommand(userGetCmd)
	userMgmtCmd.AddCommand(userUpdateCmd)
	userMgmtCmd.AddCommand(userListCmd)

	// Update command flags
	userUpdateCmd.Flags().StringVar(&userUpdateName, "name", "", "New display name")
	userUpdateCmd.Flags().StringVar(&userUpdateAvatarURL, "avatar-url", "", "New avatar URL")

	// List command flags
	userListCmd.Flags().Int32Var(&userListPage, "page", 1, "Page number")
	userListCmd.Flags().Int32Var(&userListPageSize, "page-size", 20, "Number of items per page")
	userListCmd.Flags().StringVar(&userListSearch, "search", "", "Search query for filtering users")
	userListCmd.Flags().StringVar(&userListRoleFilter, "role", "", "Filter by role (admin, user)")
}

func runUserGet(cmd *cobra.Command, args []string) error {
	out := output.New()
	userID := args[0]

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.User.GetUserProfile(ctx, &proto.GetUserProfileRequest{
		UserId: userID,
	})
	if err != nil {
		return fmt.Errorf("failed to get user profile: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"id":          resp.Id,
			"email":       resp.Email,
			"name":        resp.Name,
			"avatar_url":  resp.AvatarUrl,
			"role":        resp.Role,
			"preferences": resp.Preferences,
			"created_at":  resp.CreatedAt.AsTime().Format(time.RFC3339),
			"updated_at":  resp.UpdatedAt.AsTime().Format(time.RFC3339),
		})
	} else {
		out.Info("User: %s", resp.Name)
		out.Detail("ID", resp.Id)
		out.Detail("Email", resp.Email)
		out.Detail("Role", resp.Role)
		if resp.AvatarUrl != "" {
			out.Detail("Avatar", resp.AvatarUrl)
		}
		out.Detail("Created", resp.CreatedAt.AsTime().Format(time.RFC1123))
		out.Detail("Updated", resp.UpdatedAt.AsTime().Format(time.RFC1123))
	}

	return nil
}

func runUserUpdate(cmd *cobra.Command, args []string) error {
	out := output.New()
	userID := args[0]

	// Check if any update flags are provided
	if userUpdateName == "" && userUpdateAvatarURL == "" {
		return fmt.Errorf("at least one of --name or --avatar-url must be provided")
	}

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &proto.UpdateUserProfileRequest{
		UserId: userID,
	}
	if userUpdateName != "" {
		req.Name = &userUpdateName
	}
	if userUpdateAvatarURL != "" {
		req.AvatarUrl = &userUpdateAvatarURL
	}

	resp, err := c.User.UpdateUserProfile(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to update user profile: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"id":         resp.Id,
			"email":      resp.Email,
			"name":       resp.Name,
			"avatar_url": resp.AvatarUrl,
			"role":       resp.Role,
			"updated_at": resp.UpdatedAt.AsTime().Format(time.RFC3339),
		})
	} else {
		out.Success("User profile updated")
		out.Detail("Name", resp.Name)
		if resp.AvatarUrl != "" {
			out.Detail("Avatar", resp.AvatarUrl)
		}
	}

	return nil
}

func runUserList(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &proto.ListUsersRequest{
		Page:     userListPage,
		PageSize: userListPageSize,
	}
	if userListSearch != "" {
		req.Search = &userListSearch
	}
	if userListRoleFilter != "" {
		req.RoleFilter = &userListRoleFilter
	}

	resp, err := c.User.ListUsers(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to list users: %w", err)
	}

	if out.IsJSON() {
		users := make([]map[string]interface{}, 0, len(resp.Users))
		for _, u := range resp.Users {
			users = append(users, map[string]interface{}{
				"id":         u.Id,
				"email":      u.Email,
				"name":       u.Name,
				"role":       u.Role,
				"created_at": u.CreatedAt.AsTime().Format(time.RFC3339),
			})
		}
		out.JSON(map[string]interface{}{
			"users":       users,
			"total_count": resp.TotalCount,
			"page":        resp.Page,
			"page_size":   resp.PageSize,
		})
	} else {
		if len(resp.Users) == 0 {
			out.Info("No users found")
			return nil
		}

		table := out.Table([]string{"ID", "EMAIL", "NAME", "ROLE", "CREATED"})
		for _, u := range resp.Users {
			table.AddRow(
				u.Id,
				u.Email,
				u.Name,
				u.Role,
				u.CreatedAt.AsTime().Format("2006-01-02"),
			)
		}
		table.Render()
		out.Info("\nTotal: %d users (page %d)", resp.TotalCount, resp.Page)
	}

	return nil
}

package cmd

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/client"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/output"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var (
	// Retention settings flags
	settingsArtifactRetentionDays    int32
	settingsTestResultRetentionDays  int32
	settingsLogRetentionDays         int32
	settingsCleanupEnabled           bool
	settingsCleanupHourUTC           int32
)

var settingsCmd = &cobra.Command{
	Use:   "settings",
	Short: "Manage system settings",
	Long:  `Commands for viewing and configuring system settings including retention policies.`,
}

var settingsGetCmd = &cobra.Command{
	Use:   "get",
	Short: "Get current system settings",
	Long:  `Retrieve the current system settings (admin only).`,
	RunE:  runSettingsGet,
}

var settingsUpdateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update system settings",
	Long:  `Update system settings such as retention policies (admin only).`,
	RunE:  runSettingsUpdate,
}

var settingsConfigCmd = &cobra.Command{
	Use:   "config",
	Short: "Get public configuration",
	Long:  `Retrieve public application configuration (no auth required).`,
	RunE:  runSettingsConfig,
}

var settingsLocalCmd = &cobra.Command{
	Use:   "local",
	Short: "Show local CLI configuration",
	Long:  `Display the current CLI configuration settings.`,
	RunE:  runSettingsLocal,
}

func init() {
	rootCmd.AddCommand(settingsCmd)

	// Get command
	settingsCmd.AddCommand(settingsGetCmd)

	// Update command
	settingsCmd.AddCommand(settingsUpdateCmd)
	settingsUpdateCmd.Flags().Int32Var(&settingsArtifactRetentionDays, "artifact-retention-days", 0, "Days to retain artifacts")
	settingsUpdateCmd.Flags().Int32Var(&settingsTestResultRetentionDays, "test-result-retention-days", 0, "Days to retain test results")
	settingsUpdateCmd.Flags().Int32Var(&settingsLogRetentionDays, "log-retention-days", 0, "Days to retain logs")
	settingsUpdateCmd.Flags().BoolVar(&settingsCleanupEnabled, "cleanup-enabled", false, "Enable automatic cleanup")
	settingsUpdateCmd.Flags().Int32Var(&settingsCleanupHourUTC, "cleanup-hour", 0, "Hour (UTC) to run cleanup (0-23)")

	// Config command (public config)
	settingsCmd.AddCommand(settingsConfigCmd)

	// Local CLI config command
	settingsCmd.AddCommand(settingsLocalCmd)
}

func runSettingsGet(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.Settings.GetSettings(ctx, &proto.GetSettingsRequest{})
	if err != nil {
		return fmt.Errorf("failed to get settings: %w", err)
	}

	if out.IsJSON() {
		out.JSON(resp)
	} else {
		out.Info("System Settings (version %d)", resp.Version)
		out.Info("")

		// Auth Settings
		if resp.Auth != nil {
			out.Info("Authentication:")
			out.Detail("  Token Expiry", fmt.Sprintf("%d hours", resp.Auth.TokenExpiryHours))
			out.Detail("  Job Token Expiry", fmt.Sprintf("%d hours", resp.Auth.JobTokenExpiryHours))
			out.Detail("  First User Admin", strconv.FormatBool(resp.Auth.FirstUserIsAdmin))
		}

		// CORS Settings
		if resp.Cors != nil {
			out.Info("\nCORS:")
			out.Detail("  Allowed Origins", resp.Cors.AllowedOrigins)
			out.Detail("  Allowed Methods", resp.Cors.AllowedMethods)
			out.Detail("  Max Age", fmt.Sprintf("%d seconds", resp.Cors.MaxAgeSeconds))
		}

		// HTTP Settings
		if resp.Http != nil {
			out.Info("\nHTTP:")
			out.Detail("  Read Timeout", fmt.Sprintf("%d seconds", resp.Http.ReadTimeoutSeconds))
			out.Detail("  Write Timeout", fmt.Sprintf("%d seconds", resp.Http.WriteTimeoutSeconds))
			out.Detail("  Idle Timeout", fmt.Sprintf("%d seconds", resp.Http.IdleTimeoutSeconds))
		}

		// Logging Settings
		if resp.Logging != nil {
			out.Info("\nLogging:")
			out.Detail("  Level", resp.Logging.Level)
			out.Detail("  Format", resp.Logging.Format)
		}

		// General Settings
		if resp.General != nil {
			out.Info("\nGeneral:")
			out.Detail("  App Name", resp.General.AppName)
			out.Detail("  API Version", resp.General.ApiVersion)
			out.Detail("  Config Cache", fmt.Sprintf("%d seconds", resp.General.ConfigCacheSeconds))
		}

		// Retention Settings
		if resp.Retention != nil {
			out.Info("\nRetention:")
			out.Detail("  Artifact Retention", fmt.Sprintf("%d days", resp.Retention.ArtifactRetentionDays))
			out.Detail("  Test Result Retention", fmt.Sprintf("%d days", resp.Retention.TestResultRetentionDays))
			out.Detail("  Log Retention", fmt.Sprintf("%d days", resp.Retention.LogRetentionDays))
			out.Detail("  Cleanup Enabled", strconv.FormatBool(resp.Retention.CleanupEnabled))
			out.Detail("  Cleanup Hour (UTC)", fmt.Sprintf("%d", resp.Retention.CleanupHourUtc))
		}
	}

	return nil
}

func runSettingsUpdate(cmd *cobra.Command, args []string) error {
	out := output.New()

	// Check if any retention flags were provided
	artifactChanged := cmd.Flags().Changed("artifact-retention-days")
	testResultChanged := cmd.Flags().Changed("test-result-retention-days")
	logChanged := cmd.Flags().Changed("log-retention-days")
	cleanupChanged := cmd.Flags().Changed("cleanup-enabled")
	cleanupHourChanged := cmd.Flags().Changed("cleanup-hour")

	if !artifactChanged && !testResultChanged && !logChanged && !cleanupChanged && !cleanupHourChanged {
		return fmt.Errorf("at least one retention setting must be specified")
	}

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Build update request with only changed values
	req := &proto.UpdateSettingsRequest{
		Retention: &proto.RetentionSettingsUpdate{},
	}

	if artifactChanged {
		req.Retention.ArtifactRetentionDays = &settingsArtifactRetentionDays
	}
	if testResultChanged {
		req.Retention.TestResultRetentionDays = &settingsTestResultRetentionDays
	}
	if logChanged {
		req.Retention.LogRetentionDays = &settingsLogRetentionDays
	}
	if cleanupChanged {
		req.Retention.CleanupEnabled = &settingsCleanupEnabled
	}
	if cleanupHourChanged {
		req.Retention.CleanupHourUtc = &settingsCleanupHourUTC
	}

	resp, err := c.Settings.UpdateSettings(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to update settings: %w", err)
	}

	if out.IsJSON() {
		out.JSON(resp)
	} else {
		out.Success("Settings updated (version %d)", resp.Version)
		if resp.Retention != nil {
			out.Info("\nRetention Settings:")
			out.Detail("  Artifact Retention", fmt.Sprintf("%d days", resp.Retention.ArtifactRetentionDays))
			out.Detail("  Test Result Retention", fmt.Sprintf("%d days", resp.Retention.TestResultRetentionDays))
			out.Detail("  Log Retention", fmt.Sprintf("%d days", resp.Retention.LogRetentionDays))
			out.Detail("  Cleanup Enabled", strconv.FormatBool(resp.Retention.CleanupEnabled))
			out.Detail("  Cleanup Hour (UTC)", fmt.Sprintf("%d", resp.Retention.CleanupHourUtc))
		}
	}

	return nil
}

func runSettingsConfig(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.NewUnauthenticated()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.Settings.GetPublicConfig(ctx, &proto.GetPublicConfigRequest{})
	if err != nil {
		return fmt.Errorf("failed to get public config: %w", err)
	}

	if out.IsJSON() {
		out.JSON(resp)
	} else {
		out.Info("Public Configuration (version %d)", resp.Version)
		out.Info("")
		out.Detail("App Name", resp.AppName)
		out.Detail("API Version", resp.ApiVersion)
		out.Detail("Config Cache", fmt.Sprintf("%d seconds", resp.ConfigCacheSeconds))
	}

	return nil
}

func runSettingsLocal(cmd *cobra.Command, args []string) error {
	out := output.New()

	// Get config values from viper (same as client uses)
	grpcServer := viper.GetString("grpc_url")
	if grpcServer == "" {
		grpcServer = "localhost:9090 (default)"
	}

	outputFormat := "text"
	if out.IsJSON() {
		outputFormat = "json"
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"grpc_server":   grpcServer,
			"output_format": outputFormat,
		})
	} else {
		out.Info("CLI Configuration")
		out.Info("")
		out.Detail("gRPC Server", grpcServer)
		out.Detail("Output Format", outputFormat)
		out.Info("")
		out.Info("Configuration can be set via:")
		out.Info("  - Flag: --grpc-url <address>")
		out.Info("  - Environment: SCALEDTEST_GRPC_URL")
		out.Info("  - Config file: ~/.scaledtest/config.yaml")
	}

	return nil
}

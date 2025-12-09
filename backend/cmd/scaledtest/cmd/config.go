package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/MichielDean/ScaledTest/backend/internal/cli/credentials"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/output"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Manage CLI configuration",
	Long:  `Commands for managing ScaledTest CLI configuration.`,
}

var configViewCmd = &cobra.Command{
	Use:   "view",
	Short: "View current configuration",
	Long:  `Display the current CLI configuration including API URLs and defaults.`,
	RunE:  runConfigView,
}

var configSetCmd = &cobra.Command{
	Use:   "set <key> <value>",
	Short: "Set a configuration value",
	Long: `Set a configuration value.

Available keys:
  api_url    - Base URL for REST API (e.g., http://localhost:8080)
  grpc_url   - Base URL for gRPC (e.g., localhost:50051)
  output     - Default output format (pretty or json)

Example:
  scaledtest config set api_url http://localhost:8080
  scaledtest config set grpc_url localhost:50051
  scaledtest config set output json`,
	Args: cobra.ExactArgs(2),
	RunE: runConfigSet,
}

var configGetCmd = &cobra.Command{
	Use:   "get <key>",
	Short: "Get a configuration value",
	Long:  `Get a specific configuration value.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runConfigGet,
}

var configPathCmd = &cobra.Command{
	Use:   "path",
	Short: "Show configuration file path",
	Long:  `Display the path to the configuration file.`,
	RunE:  runConfigPath,
}

var configInitCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize configuration file",
	Long: `Create a default configuration file if it doesn't exist.

Example:
  scaledtest config init
  scaledtest config init --force`,
	RunE: runConfigInit,
}

var configForce bool

func init() {
	rootCmd.AddCommand(configCmd)
	configCmd.AddCommand(configViewCmd)
	configCmd.AddCommand(configSetCmd)
	configCmd.AddCommand(configGetCmd)
	configCmd.AddCommand(configPathCmd)
	configCmd.AddCommand(configInitCmd)

	configInitCmd.Flags().BoolVar(&configForce, "force", false, "Overwrite existing configuration")
}

func runConfigView(cmd *cobra.Command, args []string) error {
	out := output.New()

	config := map[string]interface{}{
		"api_url":  GetAPIURL(),
		"grpc_url": GetGRPCURL(),
		"output":   viper.GetString("output"),
	}

	// Check if logged in
	creds, err := credentials.Load()
	if err == nil && creds != nil && creds.Token != "" {
		config["authenticated"] = true
	} else {
		config["authenticated"] = false
	}

	if out.IsJSON() {
		out.JSON(config)
	} else {
		out.Info("Current Configuration:")
		out.Info("  API URL:       %s", config["api_url"])
		out.Info("  gRPC URL:      %s", config["grpc_url"])
		out.Info("  Output Format: %s", config["output"])
		out.Info("  Authenticated: %v", config["authenticated"])
	}

	return nil
}

func runConfigSet(cmd *cobra.Command, args []string) error {
	out := output.New()
	key := args[0]
	value := args[1]

	// Validate key
	validKeys := map[string]bool{
		"api_url":  true,
		"grpc_url": true,
		"output":   true,
	}

	if !validKeys[key] {
		return fmt.Errorf("invalid configuration key: %s. Valid keys: api_url, grpc_url, output", key)
	}

	// Validate output value
	if key == "output" && value != "pretty" && value != "json" {
		return fmt.Errorf("invalid output format: %s. Valid values: pretty, json", value)
	}

	// Set the value
	viper.Set(key, value)

	// Ensure config directory exists
	configPath := getConfigPath()
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// Write config
	if err := viper.WriteConfigAs(configPath); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	out.Success("Configuration updated: %s = %s", key, value)
	return nil
}

func runConfigGet(cmd *cobra.Command, args []string) error {
	out := output.New()
	key := args[0]

	value := viper.GetString(key)
	if value == "" {
		return fmt.Errorf("configuration key not set: %s", key)
	}

	if out.IsJSON() {
		out.JSON(map[string]string{key: value})
	} else {
		fmt.Println(value)
	}

	return nil
}

func runConfigPath(cmd *cobra.Command, args []string) error {
	out := output.New()
	configPath := getConfigPath()

	if out.IsJSON() {
		out.JSON(map[string]string{"path": configPath})
	} else {
		fmt.Println(configPath)
	}

	return nil
}

func runConfigInit(cmd *cobra.Command, args []string) error {
	out := output.New()
	configPath := getConfigPath()

	// Check if config exists
	if _, err := os.Stat(configPath); err == nil && !configForce {
		return fmt.Errorf("configuration file already exists at %s. Use --force to overwrite", configPath)
	}

	// Ensure config directory exists
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// Set defaults
	viper.Set("api_url", "http://localhost:8080")
	viper.Set("grpc_url", "localhost:50051")
	viper.Set("output", "pretty")

	// Write config
	if err := viper.WriteConfigAs(configPath); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	out.Success("Configuration initialized at %s", configPath)
	return nil
}

func getConfigPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".scaledtest", "config.yaml")
}

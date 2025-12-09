package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var (
	// Version is set at build time via ldflags.
	Version = "dev"

	// Configuration flags.
	cfgFile      string
	apiURL       string
	grpcURL      string
	token        string
	outputFormat string
	verbose      bool
	insecure     bool
)

// rootCmd represents the base command when called without any subcommands.
var rootCmd = &cobra.Command{
	Use:   "scaledtest",
	Short: "ScaledTest CLI - Manage and run distributed tests",
	Long: `ScaledTest CLI is a command-line interface for managing and running
distributed tests on Kubernetes clusters.

It provides commands to:
  - Authenticate with the ScaledTest server
  - Manage projects, registries, images, and clusters
  - Trigger and monitor test executions
  - Deploy and manage ScaledTest infrastructure

Environment Variables:
  SCALEDTEST_API_URL   - API server URL (default: http://localhost:8080)
  SCALEDTEST_GRPC_URL  - gRPC server URL (default: localhost:9090)
  SCALEDTEST_TOKEN     - Authentication token (alternative to login)

Configuration file: ~/.scaledtest/config.yaml`,
	SilenceUsage:  true,
	SilenceErrors: true,
}

// Execute adds all child commands to the root command and sets flags appropriately.
func Execute() error {
	return rootCmd.Execute()
}

func init() {
	cobra.OnInitialize(initConfig)

	// Global persistent flags
	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default: ~/.scaledtest/config.yaml)")
	rootCmd.PersistentFlags().StringVar(&apiURL, "api-url", "", "ScaledTest API server URL")
	rootCmd.PersistentFlags().StringVar(&grpcURL, "grpc-url", "", "ScaledTest gRPC server URL")
	rootCmd.PersistentFlags().StringVar(&token, "token", "", "Authentication token (overrides stored credentials)")
	rootCmd.PersistentFlags().StringVarP(&outputFormat, "output", "o", "text", "Output format: text, json")
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Enable verbose output")
	rootCmd.PersistentFlags().BoolVar(&insecure, "insecure", false, "Skip TLS certificate verification")

	// Bind flags to viper
	viper.BindPFlag("api_url", rootCmd.PersistentFlags().Lookup("api-url"))
	viper.BindPFlag("grpc_url", rootCmd.PersistentFlags().Lookup("grpc-url"))
	viper.BindPFlag("token", rootCmd.PersistentFlags().Lookup("token"))
	viper.BindPFlag("output", rootCmd.PersistentFlags().Lookup("output"))
	viper.BindPFlag("verbose", rootCmd.PersistentFlags().Lookup("verbose"))
	viper.BindPFlag("insecure", rootCmd.PersistentFlags().Lookup("insecure"))

	// Bind environment variables
	viper.BindEnv("api_url", "SCALEDTEST_API_URL")
	viper.BindEnv("grpc_url", "SCALEDTEST_GRPC_URL")
	viper.BindEnv("token", "SCALEDTEST_TOKEN")
}

// initConfig reads in config file and ENV variables if set.
func initConfig() {
	if cfgFile != "" {
		viper.SetConfigFile(cfgFile)
	} else {
		home, err := os.UserHomeDir()
		if err != nil {
			fmt.Fprintln(os.Stderr, "Warning: could not determine home directory:", err)
			return
		}

		configDir := filepath.Join(home, ".scaledtest")
		viper.AddConfigPath(configDir)
		viper.SetConfigName("config")
		viper.SetConfigType("yaml")
	}

	// Set defaults
	viper.SetDefault("api_url", "http://localhost:8080")
	viper.SetDefault("grpc_url", "localhost:9090")
	viper.SetDefault("output", "text")
	viper.SetDefault("verbose", false)
	viper.SetDefault("insecure", false)

	// Read config file if it exists
	if err := viper.ReadInConfig(); err == nil {
		if verbose {
			fmt.Fprintln(os.Stderr, "Using config file:", viper.ConfigFileUsed())
		}
	}
}

// Config provides access to configuration values.
type Config struct{}

// APIURL returns the configured API URL.
func (Config) APIURL() string {
	return viper.GetString("api_url")
}

// GRPCURL returns the configured gRPC URL.
func (Config) GRPCURL() string {
	return viper.GetString("grpc_url")
}

// Token returns the configured authentication token.
func (Config) Token() string {
	return viper.GetString("token")
}

// Output returns the configured output format.
func (Config) Output() string {
	return viper.GetString("output")
}

// Verbose returns whether verbose output is enabled.
func (Config) Verbose() bool {
	return viper.GetBool("verbose")
}

// Insecure returns whether TLS verification should be skipped.
func (Config) Insecure() bool {
	return viper.GetBool("insecure")
}

// GetConfig returns a Config instance for accessing configuration.
func GetConfig() Config {
	return Config{}
}

// IsJSONOutput returns true if output format is JSON.
func IsJSONOutput() bool {
	return viper.GetString("output") == "json"
}

// IsVerbose returns true if verbose output is enabled.
func IsVerbose() bool {
	return viper.GetBool("verbose")
}

// GetAPIURL returns the configured API URL.
func GetAPIURL() string {
	return viper.GetString("api_url")
}

// GetGRPCURL returns the configured gRPC URL.
func GetGRPCURL() string {
	return viper.GetString("grpc_url")
}

// GetToken returns the configured token.
func GetToken() string {
	return viper.GetString("token")
}

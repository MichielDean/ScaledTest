package cmd

import (
	"fmt"
	"runtime"

	"github.com/spf13/cobra"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the version information",
	Long:  `Print the version, build date, and Go version used to build the CLI.`,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("ScaledTest CLI\n")
		fmt.Printf("  Version:    %s\n", Version)
		fmt.Printf("  Go version: %s\n", runtime.Version())
		fmt.Printf("  OS/Arch:    %s/%s\n", runtime.GOOS, runtime.GOARCH)
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}

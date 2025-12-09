package cmd

import (
	"os"

	"github.com/spf13/cobra"
)

var completionCmd = &cobra.Command{
	Use:   "completion [bash|zsh|fish|powershell]",
	Short: "Generate shell completion scripts",
	Long: `Generate shell completion scripts for ScaledTest CLI.

To load completions:

Bash:
  $ source <(scaledtest completion bash)
  # To load completions for each session, execute once:
  # Linux:
  $ scaledtest completion bash > /etc/bash_completion.d/scaledtest
  # macOS:
  $ scaledtest completion bash > $(brew --prefix)/etc/bash_completion.d/scaledtest

Zsh:
  # If shell completion is not already enabled in your environment,
  # enable it by executing the following once:
  $ echo "autoload -U compinit; compinit" >> ~/.zshrc
  # To load completions for each session, execute once:
  $ scaledtest completion zsh > "${fpath[1]}/_scaledtest"
  # You will need to start a new shell for this setup to take effect.

Fish:
  $ scaledtest completion fish | source
  # To load completions for each session, execute once:
  $ scaledtest completion fish > ~/.config/fish/completions/scaledtest.fish

PowerShell:
  PS> scaledtest completion powershell | Out-String | Invoke-Expression
  # To load completions for every new session, run:
  PS> scaledtest completion powershell > scaledtest.ps1
  # and source this file from your PowerShell profile.
`,
	DisableFlagsInUseLine: true,
	ValidArgs:             []string{"bash", "zsh", "fish", "powershell"},
	Args:                  cobra.MatchAll(cobra.ExactArgs(1), cobra.OnlyValidArgs),
	Run: func(cmd *cobra.Command, args []string) {
		switch args[0] {
		case "bash":
			cmd.Root().GenBashCompletion(os.Stdout)
		case "zsh":
			cmd.Root().GenZshCompletion(os.Stdout)
		case "fish":
			cmd.Root().GenFishCompletion(os.Stdout, true)
		case "powershell":
			cmd.Root().GenPowerShellCompletionWithDesc(os.Stdout)
		}
	},
}

func init() {
	rootCmd.AddCommand(completionCmd)
}

// Package backend contains architecture tests that run as part of go test.
// These tests enforce architectural constraints defined in arch-go.yml.
package main

import (
	"testing"

	"github.com/arch-go/arch-go/v2/api"
	"github.com/arch-go/arch-go/v2/api/configuration"
)

// TestArchitecture runs architecture verification as part of the standard test suite.
// This ensures architectural constraints are enforced during CI without requiring
// a separate command.
func TestArchitecture(t *testing.T) {
	// Load configuration from arch-go.yml
	config, err := configuration.LoadConfig("arch-go.yml")
	if err != nil {
		t.Fatalf("Failed to load arch-go configuration: %v", err)
	}

	// Load module information
	moduleInfo := configuration.Load("github.com/MichielDean/ScaledTest/backend")

	// Run architecture checks
	result := api.CheckArchitecture(moduleInfo, *config)

	// Check compliance
	if !result.Pass {
		t.Error("Architecture verification failed")

		// Report dependency rule failures
		if result.DependenciesRuleResult != nil && !result.DependenciesRuleResult.Passes {
			t.Log("Dependency rule violations:")
			for _, r := range result.DependenciesRuleResult.Results {
				if !r.Passes {
					t.Logf("  - %s", r.Description)
					for _, v := range r.Verifications {
						if !v.Passes {
							t.Logf("    Package %s: %v", v.Package, v.Details)
						}
					}
				}
			}
		}

		// Report function rule failures
		if result.FunctionsRuleResult != nil && !result.FunctionsRuleResult.Passes {
			t.Log("Function rule violations:")
			for _, r := range result.FunctionsRuleResult.Results {
				if !r.Passes {
					t.Logf("  - %s", r.Description)
					for _, v := range r.Verifications {
						if !v.Passes {
							t.Logf("    Package %s: %v", v.Package, v.Details)
						}
					}
				}
			}
		}

		// Report content rule failures
		if result.ContentsRuleResult != nil && !result.ContentsRuleResult.Passes {
			t.Log("Content rule violations:")
			for _, r := range result.ContentsRuleResult.Results {
				if !r.Passes {
					t.Logf("  - %s", r.Description)
				}
			}
		}

		// Report naming rule failures
		if result.NamingRuleResult != nil && !result.NamingRuleResult.Passes {
			t.Log("Naming rule violations:")
			for _, r := range result.NamingRuleResult.Results {
				if !r.Passes {
					t.Logf("  - %s", r.Description)
				}
			}
		}
	}

	// Check thresholds if defined in config
	if config.Threshold != nil {
		// Compliance threshold
		if config.Threshold.Compliance != nil {
			threshold := float64(*config.Threshold.Compliance)
			compliance := calculateCompliance(result)
			if compliance < threshold {
				t.Errorf("Compliance rate %.0f%% is below threshold %.0f%%", compliance, threshold)
			}
		}
	}
}

// calculateCompliance calculates the percentage of rules that passed.
func calculateCompliance(result *api.Result) float64 {
	total := 0
	passed := 0

	if result.DependenciesRuleResult != nil {
		for _, r := range result.DependenciesRuleResult.Results {
			total++
			if r.Passes {
				passed++
			}
		}
	}

	if result.FunctionsRuleResult != nil {
		for _, r := range result.FunctionsRuleResult.Results {
			total++
			if r.Passes {
				passed++
			}
		}
	}

	if result.ContentsRuleResult != nil {
		for _, r := range result.ContentsRuleResult.Results {
			total++
			if r.Passes {
				passed++
			}
		}
	}

	if result.NamingRuleResult != nil {
		for _, r := range result.NamingRuleResult.Results {
			total++
			if r.Passes {
				passed++
			}
		}
	}

	if total == 0 {
		return 100
	}

	return float64(passed) / float64(total) * 100
}

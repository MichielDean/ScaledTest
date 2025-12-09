package cmd

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/client"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/output"
	"github.com/spf13/cobra"
)

var healthCmd = &cobra.Command{
	Use:   "health",
	Short: "Health check commands",
	Long:  `Commands for checking the health status of the ScaledTest server.`,
}

var healthCheckCmd = &cobra.Command{
	Use:   "check [service]",
	Short: "Check server health",
	Long: `Check the health status of the ScaledTest server.
Optionally specify a service name to check a specific component.

Example:
  scaledtest health check
  scaledtest health check database`,
	Args: cobra.MaximumNArgs(1),
	RunE: runHealthCheck,
}

var healthReadyCmd = &cobra.Command{
	Use:   "ready",
	Short: "Check server readiness",
	Long:  `Check if the server is ready to accept traffic.`,
	RunE:  runHealthReady,
}

var healthLiveCmd = &cobra.Command{
	Use:   "live",
	Short: "Check server liveness",
	Long:  `Check if the server is alive (for K8s liveness probes).`,
	RunE:  runHealthLive,
}

var healthWatchCmd = &cobra.Command{
	Use:   "watch [service]",
	Short: "Watch health status",
	Long: `Stream health status updates in real-time.
Press Ctrl+C to stop watching.

Example:
  scaledtest health watch
  scaledtest health watch database`,
	Args: cobra.MaximumNArgs(1),
	RunE: runHealthWatch,
}

func init() {
	rootCmd.AddCommand(healthCmd)
	healthCmd.AddCommand(healthCheckCmd)
	healthCmd.AddCommand(healthReadyCmd)
	healthCmd.AddCommand(healthLiveCmd)
	healthCmd.AddCommand(healthWatchCmd)
}

func runHealthCheck(cmd *cobra.Command, args []string) error {
	out := output.New()
	service := ""
	if len(args) > 0 {
		service = args[0]
	}

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.Health.Check(ctx, &proto.HealthCheckRequest{
		Service: service,
	})
	if err != nil {
		return fmt.Errorf("health check failed: %w", err)
	}

	if out.IsJSON() {
		components := make(map[string]interface{})
		for name, comp := range resp.Components {
			components[name] = map[string]interface{}{
				"status":     comp.Status.String(),
				"message":    comp.Message,
				"latency_ms": comp.LatencyMs,
			}
		}
		out.JSON(map[string]interface{}{
			"status":      resp.Status.String(),
			"environment": resp.Environment,
			"timestamp":   resp.Timestamp.AsTime().Format(time.RFC3339),
			"components":  components,
		})
	} else {
		statusStr := getHealthStatusString(resp.Status)
		out.Info("Health Status: %s", statusStr)
		out.Detail("Environment", resp.Environment)
		out.Detail("Timestamp", resp.Timestamp.AsTime().Format(time.RFC1123))

		if len(resp.Components) > 0 {
			out.Info("\nComponents:")
			for name, comp := range resp.Components {
				compStatus := getHealthStatusString(comp.Status)
				msg := ""
				if comp.Message != nil {
					msg = fmt.Sprintf(" - %s", *comp.Message)
				}
				latency := ""
				if comp.LatencyMs != nil {
					latency = fmt.Sprintf(" (%dms)", *comp.LatencyMs)
				}
				out.Detail(name, fmt.Sprintf("%s%s%s", compStatus, latency, msg))
			}
		}
	}

	return nil
}

func runHealthReady(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.Health.Ready(ctx, &proto.ReadyRequest{})
	if err != nil {
		return fmt.Errorf("readiness check failed: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"ready":   resp.Ready,
			"message": resp.Message,
			"checks":  resp.Checks,
		})
	} else {
		if resp.Ready {
			out.Success("Server is ready")
		} else {
			out.Error("Server is not ready: %s", resp.Message)
		}

		if len(resp.Checks) > 0 {
			out.Info("\nReadiness Checks:")
			for name, ready := range resp.Checks {
				status := output.StatusColor("failed")
				if ready {
					status = output.StatusColor("succeeded")
				}
				out.Detail(name, status)
			}
		}
	}

	if !resp.Ready {
		os.Exit(1)
	}

	return nil
}

func runHealthLive(cmd *cobra.Command, args []string) error {
	out := output.New()

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := c.Health.Live(ctx, &proto.LiveRequest{})
	if err != nil {
		return fmt.Errorf("liveness check failed: %w", err)
	}

	if out.IsJSON() {
		out.JSON(map[string]interface{}{
			"alive":   resp.Alive,
			"message": resp.Message,
		})
	} else {
		if resp.Alive {
			out.Success("Server is alive")
		} else {
			out.Error("Server is not alive: %s", resp.Message)
		}
	}

	if !resp.Alive {
		os.Exit(1)
	}

	return nil
}

func runHealthWatch(cmd *cobra.Command, args []string) error {
	out := output.New()
	service := ""
	if len(args) > 0 {
		service = args[0]
	}

	c, err := client.New()
	if err != nil {
		return err
	}
	defer c.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle interrupt
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		if !out.IsJSON() {
			fmt.Println("\nStopping health watch...")
		}
		cancel()
	}()

	stream, err := c.Health.Watch(ctx, &proto.HealthCheckRequest{
		Service: service,
	})
	if err != nil {
		return fmt.Errorf("failed to start health watch: %w", err)
	}

	if !out.IsJSON() {
		out.Info("Watching health status (Ctrl+C to stop)...")
		out.Info("")
	}

	for {
		resp, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			if ctx.Err() != nil {
				return nil // Cancelled
			}
			return fmt.Errorf("stream error: %w", err)
		}

		if out.IsJSON() {
			components := make(map[string]interface{})
			for name, comp := range resp.Components {
				components[name] = map[string]interface{}{
					"status":     comp.Status.String(),
					"message":    comp.Message,
					"latency_ms": comp.LatencyMs,
				}
			}
			out.JSON(map[string]interface{}{
				"status":      resp.Status.String(),
				"environment": resp.Environment,
				"timestamp":   resp.Timestamp.AsTime().Format(time.RFC3339),
				"components":  components,
			})
		} else {
			statusStr := getHealthStatusString(resp.Status)
			timestamp := resp.Timestamp.AsTime().Format("15:04:05")
			fmt.Printf("[%s] Status: %s", timestamp, statusStr)
			if len(resp.Components) > 0 {
				fmt.Print(" | Components: ")
				first := true
				for name, comp := range resp.Components {
					if !first {
						fmt.Print(", ")
					}
					compStatus := getHealthStatusString(comp.Status)
					fmt.Printf("%s=%s", name, compStatus)
					first = false
				}
			}
			fmt.Println()
		}
	}

	return nil
}

func getHealthStatusString(status proto.ServingStatus) string {
	switch status {
	case proto.ServingStatus_SERVING_STATUS_SERVING:
		return output.StatusColor("serving")
	case proto.ServingStatus_SERVING_STATUS_NOT_SERVING:
		return output.StatusColor("not serving")
	case proto.ServingStatus_SERVING_STATUS_SERVICE_UNKNOWN:
		return output.StatusColor("unknown")
	default:
		return output.StatusColor("unspecified")
	}
}

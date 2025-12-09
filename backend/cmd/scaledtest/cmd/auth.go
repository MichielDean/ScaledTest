package cmd

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"syscall"
	"time"

	pb "github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/credentials"
	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"golang.org/x/term"
	"google.golang.org/grpc"
	grpcinsecure "google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "Authentication commands",
	Long:  `Commands for authenticating with the ScaledTest server.`,
}

var signupCmd = &cobra.Command{
	Use:   "signup",
	Short: "Create a new account",
	Long: `Create a new user account on the ScaledTest server.
After signup, you will be automatically logged in.

Example:
  scaledtest auth signup
  scaledtest auth signup --email user@example.com --password MyPass123! --name "John Doe"`,
	RunE: runSignup,
}

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with the ScaledTest server",
	Long: `Authenticate with the ScaledTest server using email and password.
The authentication token will be stored securely in your system's keychain.

Example:
  scaledtest auth login
  scaledtest auth login --email user@example.com`,
	RunE: runLogin,
}

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Log out and remove stored credentials",
	Long:  `Log out from the ScaledTest server and remove stored credentials from the keychain.`,
	RunE:  runLogout,
}

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show current authentication status",
	Long:  `Display the current authentication status and token information.`,
	RunE:  runStatus,
}

var refreshCmd = &cobra.Command{
	Use:   "refresh",
	Short: "Refresh authentication token",
	Long:  `Refresh the current authentication token before it expires.`,
	RunE:  runRefresh,
}

var userCmd = &cobra.Command{
	Use:   "user",
	Short: "Show current user details",
	Long:  `Display the current authenticated user's details from the server.`,
	RunE:  runUser,
}

var (
	loginEmail    string
	loginPassword string
	signupName    string
)

func init() {
	rootCmd.AddCommand(authCmd)
	authCmd.AddCommand(signupCmd)
	authCmd.AddCommand(loginCmd)
	authCmd.AddCommand(logoutCmd)
	authCmd.AddCommand(statusCmd)
	authCmd.AddCommand(refreshCmd)
	authCmd.AddCommand(userCmd)

	// Signup flags
	signupCmd.Flags().StringVar(&loginEmail, "email", "", "Email address for signup")
	signupCmd.Flags().StringVar(&loginPassword, "password", "", "Password for signup (use with caution, prefer interactive input)")
	signupCmd.Flags().StringVar(&signupName, "name", "", "Display name for the account")

	// Login flags
	loginCmd.Flags().StringVar(&loginEmail, "email", "", "Email address for login")
	loginCmd.Flags().StringVar(&loginPassword, "password", "", "Password for login (use with caution, prefer interactive input)")
}

// getGRPCURL returns the gRPC server URL from config
func getGRPCURL() string {
	grpcURL := viper.GetString("grpc_url")
	if grpcURL == "" {
		grpcURL = "localhost:9090"
	}
	return grpcURL
}

// newUnauthenticatedClient creates a gRPC client without auth (for login/signup)
func newUnauthenticatedClient() (*grpc.ClientConn, error) {
	grpcURL := getGRPCURL()
	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(grpcinsecure.NewCredentials()),
	}
	return grpc.NewClient(grpcURL, opts...)
}

// newAuthenticatedClient creates a gRPC client with auth token
func newAuthenticatedClient(token string) (*grpc.ClientConn, error) {
	grpcURL := getGRPCURL()
	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(grpcinsecure.NewCredentials()),
		grpc.WithUnaryInterceptor(func(
			ctx context.Context,
			method string,
			req, reply interface{},
			cc *grpc.ClientConn,
			invoker grpc.UnaryInvoker,
			callOpts ...grpc.CallOption,
		) error {
			ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+token)
			return invoker(ctx, method, req, reply, cc, callOpts...)
		}),
	}
	return grpc.NewClient(grpcURL, opts...)
}

func runLogin(cmd *cobra.Command, args []string) error {
	// Get email
	email := loginEmail
	if email == "" {
		fmt.Print("Email: ")
		reader := bufio.NewReader(os.Stdin)
		input, err := reader.ReadString('\n')
		if err != nil {
			return fmt.Errorf("failed to read email: %w", err)
		}
		email = strings.TrimSpace(input)
	}

	// Get password - from flag, env, or prompt
	password := loginPassword
	if password == "" {
		password = os.Getenv("SCALEDTEST_PASSWORD")
	}
	if password == "" {
		fmt.Print("Password: ")
		passwordBytes, err := term.ReadPassword(int(syscall.Stdin))
		if err != nil {
			return fmt.Errorf("failed to read password: %w", err)
		}
		fmt.Println() // New line after password input
		password = string(passwordBytes)
	}

	// Create gRPC client (no auth needed for login)
	conn, err := newUnauthenticatedClient()
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer conn.Close()

	authClient := pb.NewAuthServiceClient(conn)

	// Make login request
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := authClient.Login(ctx, &pb.LoginRequest{
		Email:    email,
		Password: password,
	})
	if err != nil {
		return fmt.Errorf("authentication failed: %v", err)
	}

	// Calculate expiration time
	expiresAt := time.Now().Add(time.Duration(resp.ExpiresIn) * time.Second)

	// Store credentials
	serverURL := viper.GetString("api_url")
	if serverURL == "" {
		serverURL = "http://localhost:8080"
	}
	creds := &credentials.StoredCredentials{
		Token:     resp.AccessToken,
		Email:     resp.User.Email,
		ExpiresAt: expiresAt,
		ServerURL: serverURL,
	}
	if err := credentials.Store(creds); err != nil {
		return fmt.Errorf("failed to store credentials: %w", err)
	}

	if IsJSONOutput() {
		output := map[string]interface{}{
			"success":    true,
			"email":      resp.User.Email,
			"name":       resp.User.Name,
			"role":       resp.User.Role,
			"expires_at": expiresAt.Format(time.RFC3339),
		}
		json.NewEncoder(os.Stdout).Encode(output)
	} else {
		green := color.New(color.FgGreen).SprintFunc()
		fmt.Printf("%s Logged in as %s (%s)\n", green("✓"), resp.User.Email, resp.User.Role)
		fmt.Printf("  Token expires: %s\n", expiresAt.Format(time.RFC1123))
	}

	return nil
}

func runLogout(cmd *cobra.Command, args []string) error {
	// Try to get current credentials for logout and display
	creds, _ := credentials.Load()

	// If we have a token, try to logout on server
	if creds != nil && !creds.IsExpired() {
		conn, err := newAuthenticatedClient(creds.Token)
		if err == nil {
			defer conn.Close()
			authClient := pb.NewAuthServiceClient(conn)
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			// Best effort - ignore errors
			_, _ = authClient.Logout(ctx, &pb.LogoutRequest{})
		}
	}

	if err := credentials.Delete(); err != nil {
		return fmt.Errorf("failed to remove credentials: %w", err)
	}

	if IsJSONOutput() {
		output := map[string]interface{}{
			"success": true,
			"message": "Logged out successfully",
		}
		json.NewEncoder(os.Stdout).Encode(output)
	} else {
		green := color.New(color.FgGreen).SprintFunc()
		if creds != nil {
			fmt.Printf("%s Logged out from %s\n", green("✓"), creds.Email)
		} else {
			fmt.Printf("%s Logged out successfully\n", green("✓"))
		}
	}

	return nil
}

func runStatus(cmd *cobra.Command, args []string) error {
	// Check for token from flag/env first
	token := viper.GetString("token")
	if token != "" {
		if IsJSONOutput() {
			output := map[string]interface{}{
				"authenticated": true,
				"source":        "environment/flag",
				"message":       "Using token from environment or flag",
			}
			json.NewEncoder(os.Stdout).Encode(output)
		} else {
			green := color.New(color.FgGreen).SprintFunc()
			fmt.Printf("%s Authenticated via environment variable or flag\n", green("✓"))
		}
		return nil
	}

	// Check stored credentials
	creds, err := credentials.Load()
	if err != nil {
		if IsJSONOutput() {
			output := map[string]interface{}{
				"authenticated": false,
				"error":         "Not logged in",
			}
			json.NewEncoder(os.Stdout).Encode(output)
		} else {
			yellow := color.New(color.FgYellow).SprintFunc()
			fmt.Printf("%s Not logged in\n", yellow("!"))
			fmt.Println("  Use 'scaledtest auth login' to authenticate")
		}
		return nil
	}

	// Check if expired
	if creds.IsExpired() {
		if IsJSONOutput() {
			output := map[string]interface{}{
				"authenticated": false,
				"email":         creds.Email,
				"expired":       true,
				"expired_at":    creds.ExpiresAt.Format(time.RFC3339),
			}
			json.NewEncoder(os.Stdout).Encode(output)
		} else {
			yellow := color.New(color.FgYellow).SprintFunc()
			fmt.Printf("%s Token expired for %s\n", yellow("!"), creds.Email)
			fmt.Printf("  Expired at: %s\n", creds.ExpiresAt.Format(time.RFC1123))
			fmt.Println("  Use 'scaledtest auth login' to re-authenticate")
		}
		return nil
	}

	if IsJSONOutput() {
		output := map[string]interface{}{
			"authenticated": true,
			"email":         creds.Email,
			"server":        creds.ServerURL,
			"expires_at":    creds.ExpiresAt.Format(time.RFC3339),
		}
		json.NewEncoder(os.Stdout).Encode(output)
	} else {
		green := color.New(color.FgGreen).SprintFunc()
		fmt.Printf("%s Authenticated as %s\n", green("✓"), creds.Email)
		fmt.Printf("  Server:  %s\n", creds.ServerURL)
		fmt.Printf("  Expires: %s\n", creds.ExpiresAt.Format(time.RFC1123))
	}

	return nil
}

func runSignup(cmd *cobra.Command, args []string) error {
	// Get email
	email := loginEmail
	if email == "" {
		fmt.Print("Email: ")
		reader := bufio.NewReader(os.Stdin)
		input, err := reader.ReadString('\n')
		if err != nil {
			return fmt.Errorf("failed to read email: %w", err)
		}
		email = strings.TrimSpace(input)
	}

	// Get name
	name := signupName
	if name == "" {
		fmt.Print("Name: ")
		reader := bufio.NewReader(os.Stdin)
		input, err := reader.ReadString('\n')
		if err != nil {
			return fmt.Errorf("failed to read name: %w", err)
		}
		name = strings.TrimSpace(input)
	}

	// Get password - from flag, env, or prompt
	password := loginPassword
	if password == "" {
		password = os.Getenv("SCALEDTEST_PASSWORD")
	}
	if password == "" {
		fmt.Print("Password: ")
		passwordBytes, err := term.ReadPassword(int(syscall.Stdin))
		if err != nil {
			return fmt.Errorf("failed to read password: %w", err)
		}
		fmt.Println() // New line after password input

		fmt.Print("Confirm Password: ")
		confirmBytes, err := term.ReadPassword(int(syscall.Stdin))
		if err != nil {
			return fmt.Errorf("failed to read password confirmation: %w", err)
		}
		fmt.Println()

		if string(passwordBytes) != string(confirmBytes) {
			return fmt.Errorf("passwords do not match")
		}
		password = string(passwordBytes)
	}

	// Create gRPC client (no auth needed for signup)
	conn, err := newUnauthenticatedClient()
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer conn.Close()

	authClient := pb.NewAuthServiceClient(conn)

	// Make signup request
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := authClient.Signup(ctx, &pb.SignupRequest{
		Email:    email,
		Password: password,
		Name:     name,
	})
	if err != nil {
		return fmt.Errorf("signup failed: %v", err)
	}

	// Calculate expiration time
	expiresAt := time.Now().Add(time.Duration(resp.ExpiresIn) * time.Second)

	// Store credentials
	serverURL := viper.GetString("api_url")
	if serverURL == "" {
		serverURL = "http://localhost:8080"
	}
	creds := &credentials.StoredCredentials{
		Token:     resp.AccessToken,
		Email:     resp.User.Email,
		ExpiresAt: expiresAt,
		ServerURL: serverURL,
	}
	if err := credentials.Store(creds); err != nil {
		return fmt.Errorf("failed to store credentials: %w", err)
	}

	if IsJSONOutput() {
		output := map[string]interface{}{
			"success":    true,
			"email":      resp.User.Email,
			"name":       resp.User.Name,
			"role":       resp.User.Role,
			"expires_at": expiresAt.Format(time.RFC3339),
		}
		json.NewEncoder(os.Stdout).Encode(output)
	} else {
		green := color.New(color.FgGreen).SprintFunc()
		fmt.Printf("%s Account created and logged in as %s (%s)\n", green("✓"), resp.User.Email, resp.User.Role)
		fmt.Printf("  Token expires: %s\n", expiresAt.Format(time.RFC1123))
	}

	return nil
}

func runRefresh(cmd *cobra.Command, args []string) error {
	// Load current credentials
	creds, err := credentials.Load()
	if err != nil {
		return fmt.Errorf("not logged in: use 'scaledtest auth login' first")
	}

	// Create authenticated client
	conn, err := newAuthenticatedClient(creds.Token)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer conn.Close()

	authClient := pb.NewAuthServiceClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := authClient.RefreshToken(ctx, &pb.RefreshTokenRequest{
		RefreshToken: creds.Token,
	})
	if err != nil {
		return fmt.Errorf("token refresh failed: %v", err)
	}

	// Calculate new expiration time
	expiresAt := time.Now().Add(time.Duration(resp.ExpiresIn) * time.Second)

	// Update stored credentials
	creds.Token = resp.AccessToken
	creds.ExpiresAt = expiresAt
	if err := credentials.Store(creds); err != nil {
		return fmt.Errorf("failed to store refreshed credentials: %w", err)
	}

	if IsJSONOutput() {
		output := map[string]interface{}{
			"success":    true,
			"email":      resp.User.Email,
			"expires_at": expiresAt.Format(time.RFC3339),
		}
		json.NewEncoder(os.Stdout).Encode(output)
	} else {
		green := color.New(color.FgGreen).SprintFunc()
		fmt.Printf("%s Token refreshed for %s\n", green("✓"), resp.User.Email)
		fmt.Printf("  New expiration: %s\n", expiresAt.Format(time.RFC1123))
	}

	return nil
}

func runUser(cmd *cobra.Command, args []string) error {
	// Load current credentials
	creds, err := credentials.Load()
	if err != nil {
		// Check for token from flag/env
		token := viper.GetString("token")
		if token == "" {
			return fmt.Errorf("not logged in: use 'scaledtest auth login' first")
		}
		// Use token from flag/env
		conn, err := newAuthenticatedClient(token)
		if err != nil {
			return fmt.Errorf("failed to connect to server: %w", err)
		}
		defer conn.Close()

		return fetchAndDisplayUser(conn)
	}

	if creds.IsExpired() {
		return fmt.Errorf("token expired: use 'scaledtest auth login' to re-authenticate")
	}

	// Create authenticated client
	conn, err := newAuthenticatedClient(creds.Token)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer conn.Close()

	return fetchAndDisplayUser(conn)
}

func fetchAndDisplayUser(conn *grpc.ClientConn) error {
	authClient := pb.NewAuthServiceClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := authClient.GetCurrentUser(ctx, &pb.GetCurrentUserRequest{})
	if err != nil {
		return fmt.Errorf("failed to get user info: %v", err)
	}

	if IsJSONOutput() {
		output := map[string]interface{}{
			"id":             resp.Id,
			"email":          resp.Email,
			"name":           resp.Name,
			"role":           resp.Role,
			"email_verified": resp.EmailVerified,
			"created_at":     resp.CreatedAt.AsTime().Format(time.RFC3339),
			"updated_at":     resp.UpdatedAt.AsTime().Format(time.RFC3339),
		}
		json.NewEncoder(os.Stdout).Encode(output)
	} else {
		fmt.Printf("User: %s\n", resp.Name)
		fmt.Printf("  ID:             %s\n", resp.Id)
		fmt.Printf("  Email:          %s\n", resp.Email)
		fmt.Printf("  Role:           %s\n", resp.Role)
		fmt.Printf("  Email Verified: %t\n", resp.EmailVerified)
		fmt.Printf("  Created:        %s\n", resp.CreatedAt.AsTime().Format(time.RFC1123))
		fmt.Printf("  Updated:        %s\n", resp.UpdatedAt.AsTime().Format(time.RFC1123))
	}

	return nil
}

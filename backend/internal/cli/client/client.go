package client

import (
	"context"
	"fmt"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/cli/credentials"
	"github.com/spf13/viper"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

// Client wraps gRPC connections to ScaledTest services.
type Client struct {
	conn           *grpc.ClientConn
	TestJobService proto.TestJobServiceClient
	TestResult     proto.TestResultServiceClient
	User           proto.UserServiceClient
	Auth           proto.AuthServiceClient
	Cluster        proto.K8SClusterServiceClient
	Health         proto.HealthServiceClient
	Settings       proto.SystemSettingsServiceClient
}

// New creates a new gRPC client with authentication.
func New() (*Client, error) {
	grpcURL := viper.GetString("grpc_url")
	if grpcURL == "" {
		grpcURL = "localhost:9090"
	}

	// Get authentication token
	token, err := getToken()
	if err != nil {
		return nil, fmt.Errorf("authentication required: %w", err)
	}

	// Create connection with auth interceptor
	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithUnaryInterceptor(authUnaryInterceptor(token)),
		grpc.WithStreamInterceptor(authStreamInterceptor(token)),
	}

	conn, err := grpc.NewClient(grpcURL, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to gRPC server at %s: %w", grpcURL, err)
	}

	return &Client{
		conn:           conn,
		TestJobService: proto.NewTestJobServiceClient(conn),
		TestResult:     proto.NewTestResultServiceClient(conn),
		User:           proto.NewUserServiceClient(conn),
		Auth:           proto.NewAuthServiceClient(conn),
		Cluster:        proto.NewK8SClusterServiceClient(conn),
		Health:         proto.NewHealthServiceClient(conn),
		Settings:       proto.NewSystemSettingsServiceClient(conn),
	}, nil
}

// NewWithToken creates a new gRPC client with a specific token.
// Useful when you need to use a token that's not stored in credentials.
func NewWithToken(token string) (*Client, error) {
	grpcURL := viper.GetString("grpc_url")
	if grpcURL == "" {
		grpcURL = "localhost:9090"
	}

	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithUnaryInterceptor(authUnaryInterceptor(token)),
		grpc.WithStreamInterceptor(authStreamInterceptor(token)),
	}

	conn, err := grpc.NewClient(grpcURL, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to gRPC server at %s: %w", grpcURL, err)
	}

	return &Client{
		conn:           conn,
		TestJobService: proto.NewTestJobServiceClient(conn),
		TestResult:     proto.NewTestResultServiceClient(conn),
		User:           proto.NewUserServiceClient(conn),
		Auth:           proto.NewAuthServiceClient(conn),
		Cluster:        proto.NewK8SClusterServiceClient(conn),
		Health:         proto.NewHealthServiceClient(conn),
		Settings:       proto.NewSystemSettingsServiceClient(conn),
	}, nil
}
func (c *Client) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// getToken retrieves the authentication token from various sources.
// Priority: --token flag > SCALEDTEST_TOKEN env > stored credentials
func getToken() (string, error) {
	// Check flag/env via viper
	token := viper.GetString("token")
	if token != "" {
		return token, nil
	}

	// Check stored credentials
	creds, err := credentials.Load()
	if err != nil {
		return "", fmt.Errorf("not logged in: use 'scaledtest auth login' or set SCALEDTEST_TOKEN")
	}

	if creds.IsExpired() {
		return "", fmt.Errorf("token expired: use 'scaledtest auth login' to re-authenticate")
	}

	return creds.Token, nil
}

// authUnaryInterceptor creates a unary interceptor that adds auth metadata.
func authUnaryInterceptor(token string) grpc.UnaryClientInterceptor {
	return func(
		ctx context.Context,
		method string,
		req, reply interface{},
		cc *grpc.ClientConn,
		invoker grpc.UnaryInvoker,
		opts ...grpc.CallOption,
	) error {
		ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+token)
		return invoker(ctx, method, req, reply, cc, opts...)
	}
}

// authStreamInterceptor creates a stream interceptor that adds auth metadata.
func authStreamInterceptor(token string) grpc.StreamClientInterceptor {
	return func(
		ctx context.Context,
		desc *grpc.StreamDesc,
		cc *grpc.ClientConn,
		method string,
		streamer grpc.Streamer,
		opts ...grpc.CallOption,
	) (grpc.ClientStream, error) {
		ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+token)
		return streamer(ctx, desc, cc, method, opts...)
	}
}

// NewUnauthenticated creates a gRPC client without authentication.
// Useful for health checks or public endpoints.
func NewUnauthenticated() (*Client, error) {
	grpcURL := viper.GetString("grpc_url")
	if grpcURL == "" {
		grpcURL = "localhost:9090"
	}

	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	}

	conn, err := grpc.NewClient(grpcURL, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to gRPC server at %s: %w", grpcURL, err)
	}

	return &Client{
		conn:           conn,
		TestJobService: proto.NewTestJobServiceClient(conn),
		TestResult:     proto.NewTestResultServiceClient(conn),
		User:           proto.NewUserServiceClient(conn),
		Auth:           proto.NewAuthServiceClient(conn),
		Cluster:        proto.NewK8SClusterServiceClient(conn),
		Health:         proto.NewHealthServiceClient(conn),
		Settings:       proto.NewSystemSettingsServiceClient(conn),
	}, nil
}

// GetGRPCURL returns the configured gRPC URL.
func GetGRPCURL() string {
	grpcURL := viper.GetString("grpc_url")
	if grpcURL == "" {
		grpcURL = "localhost:9090"
	}
	return grpcURL
}

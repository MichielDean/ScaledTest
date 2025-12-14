package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"connectrpc.com/connect"
	connectcors "connectrpc.com/cors"
	"github.com/MichielDean/ScaledTest/backend/api/proto/protoconnect"
	"github.com/MichielDean/ScaledTest/backend/internal/database"
	"github.com/MichielDean/ScaledTest/backend/internal/handlers"
	"github.com/MichielDean/ScaledTest/backend/internal/middleware"
	"github.com/MichielDean/ScaledTest/backend/internal/migrations"
	"github.com/MichielDean/ScaledTest/backend/internal/wire"
	"github.com/MichielDean/ScaledTest/backend/pkg/logger"
	"github.com/joho/godotenv"
	"github.com/rs/cors"
	"go.uber.org/zap"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		fmt.Println("Warning: .env file not found, using environment variables")
	}

	// Initialize logger
	environment := getConnectEnv("ENVIRONMENT", "development")
	if err := logger.Initialize(environment); err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	logger.Info("Starting ScaledTest Backend Server",
		zap.String("environment", environment),
	)

	// Get JWT secret for authentication (required)
	jwtSecret := getConnectEnv("JWT_SECRET", "")
	if jwtSecret == "" {
		logger.Fatal("JWT_SECRET environment variable is required")
	}

	// Run database migrations before initializing app dependencies
	// This ensures the schema is ready before any queries are made
	ctx := context.Background()
	dbConfig := database.NewConfigFromEnv()

	migrationConfig := &migrations.Config{
		Host:     dbConfig.Host,
		Port:     dbConfig.Port,
		User:     dbConfig.User,
		Password: dbConfig.Password,
		DBName:   dbConfig.DBName,
		SSLMode:  dbConfig.SSLMode,
	}

	if err := migrations.Run(ctx, migrationConfig, logger.Log); err != nil {
		logger.Fatal("Failed to run database migrations", zap.Error(err))
	}

	// Initialize all dependencies using Wire-generated injector
	appConfig := &wire.AppConfig{
		JWTSecret:   jwtSecret,
		Environment: environment,
	}

	deps, cleanup, err := wire.InitializeApp(ctx, dbConfig, appConfig, logger.Log)
	if err != nil {
		logger.Fatal("Failed to initialize application dependencies", zap.Error(err))
	}
	defer cleanup()

	logger.Info("Dependencies initialized successfully via Wire DI")

	// Get port from environment
	port := getConnectEnv("SERVER_PORT", "8080")

	// Create Connect interceptors for authentication
	authInterceptor := middleware.ConnectAuthInterceptor(jwtSecret, logger.Log)

	// Common handler options with interceptors
	handlerOpts := []connect.HandlerOption{
		connect.WithInterceptors(authInterceptor),
	}

	// Create HTTP mux for Connect handlers
	mux := http.NewServeMux()

	// Register Auth service
	authHandler := handlers.NewAuthServiceHandler(deps.AuthService, logger.Log)
	authPath, authHTTPHandler := protoconnect.NewAuthServiceHandler(authHandler, handlerOpts...)
	mux.Handle(authPath, authHTTPHandler)

	// Register K8s Cluster service
	k8sClusterHandler := handlers.NewK8sClusterServiceHandler(deps.ClusterService, logger.Log)
	k8sPath, k8sHTTPHandler := protoconnect.NewK8SClusterServiceHandler(k8sClusterHandler, handlerOpts...)
	mux.Handle(k8sPath, k8sHTTPHandler)

	// Register System Settings service
	systemSettingsHandler := handlers.NewSystemSettingsServiceHandler(deps.SettingsService, logger.Log)
	settingsPath, settingsHTTPHandler := protoconnect.NewSystemSettingsServiceHandler(systemSettingsHandler, handlerOpts...)
	mux.Handle(settingsPath, settingsHTTPHandler)

	// Register Health service (with streaming interceptor)
	healthOpts := []connect.HandlerOption{
		connect.WithInterceptors(authInterceptor),
	}
	healthHandler := handlers.NewHealthServiceHandler(deps.DB, logger.Log, environment)
	healthPath, healthHTTPHandler := protoconnect.NewHealthServiceHandler(healthHandler, healthOpts...)
	mux.Handle(healthPath, healthHTTPHandler)

	// Register User service
	userHandler := handlers.NewUserServiceHandler(deps.UserService, logger.Log)
	userPath, userHTTPHandler := protoconnect.NewUserServiceHandler(userHandler, handlerOpts...)
	mux.Handle(userPath, userHTTPHandler)

	// Register TestJob service (projects, registries, images, jobs, artifacts)
	testJobHandler := handlers.NewTestJobServiceHandler(handlers.TestJobServiceConfig{
		ProjectService:       deps.ProjectService,
		RegistryService:      deps.RegistryService,
		TestImageService:     deps.TestImageService,
		TestExecutionService: deps.TestExecutionService,
		TestDiscoveryService: deps.TestDiscoveryService,
		ArtifactService:      deps.ArtifactService,
	}, logger.Log)
	testJobPath, testJobHTTPHandler := protoconnect.NewTestJobServiceHandler(testJobHandler, handlerOpts...)
	mux.Handle(testJobPath, testJobHTTPHandler)

	// Register TestResult service
	testResultHandler := handlers.NewTestResultServiceHandler(deps.TestResultService, logger.Log)
	testResultPath, testResultHTTPHandler := protoconnect.NewTestResultServiceHandler(testResultHandler, handlerOpts...)
	mux.Handle(testResultPath, testResultHTTPHandler)

	// Add simple HTTP health check endpoint for Kubernetes probes
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		// Simple liveness check
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy"}`))
	})

	// Add ping endpoint for debugging frontend-backend connectivity
	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"scaledtest-backend","timestamp":"` + time.Now().UTC().Format(time.RFC3339) + `"}`))
	})

	logger.Info("Connect-RPC services registered successfully",
		zap.String("auth_path", authPath),
		zap.String("k8s_path", k8sPath),
		zap.String("settings_path", settingsPath),
		zap.String("health_path", healthPath),
		zap.String("user_path", userPath),
		zap.String("test_job_path", testJobPath),
		zap.String("test_result_path", testResultPath),
	)

	// Add CORS middleware for gRPC-Web and Connect protocol support
	corsHandler := withCORS(mux)

	// Configure HTTP server with h2c (HTTP/2 without TLS) support
	// This allows both HTTP/1.1 and HTTP/2 connections for full gRPC support
	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)

	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           corsHandler,
		Protocols:         protocols,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		// Note: Don't set ReadTimeout/WriteTimeout for streaming RPCs
		// as they apply to the entire operation duration
	}

	// Start HTTP server
	go func() {
		logger.Info("Connect-RPC server starting",
			zap.String("port", port),
			zap.String("protocols", "HTTP/1.1, HTTP/2 (h2c), gRPC, gRPC-Web, Connect"),
		)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Failed to start HTTP server", zap.Error(err))
		}
	}()

	logger.Info("Server started successfully",
		zap.String("port", port),
		zap.String("environment", environment),
	)

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Graceful shutdown
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Error("HTTP server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exited gracefully")
}

// withCORS adds CORS support for Connect, gRPC, and gRPC-Web protocols
func withCORS(h http.Handler) http.Handler {
	allowedOrigins := getConnectEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")
	origins := strings.Split(allowedOrigins, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}

	middleware := cors.New(cors.Options{
		AllowedOrigins: origins,
		AllowedMethods: connectcors.AllowedMethods(),
		AllowedHeaders: connectcors.AllowedHeaders(),
		ExposedHeaders: connectcors.ExposedHeaders(),
		AllowCredentials: true,
		MaxAge: 300,
	})
	return middleware.Handler(h)
}

func getConnectEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/config"
	"github.com/scaledtest/scaledtest/internal/db"
	"github.com/scaledtest/scaledtest/internal/server"
)

func main() {
	migrateUp := flag.Bool("migrate-up", false, "Run all pending migrations and exit")
	migrateDown := flag.Bool("migrate-down", false, "Rollback last migration and exit")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load config: %v\n", err)
		os.Exit(1)
	}

	setupLogger(cfg.LogLevel, cfg.LogFormat)

	// Handle migration commands
	if *migrateUp {
		if err := db.MigrateUp(cfg.DatabaseURL); err != nil {
			log.Fatal().Err(err).Msg("migration up failed")
		}
		return
	}
	if *migrateDown {
		if err := db.MigrateDown(cfg.DatabaseURL); err != nil {
			log.Fatal().Err(err).Msg("migration down failed")
		}
		return
	}

	// Connect to database (optional — server starts without DB for dev)
	var pool *db.Pool
	if cfg.DatabaseURL != "" {
		pool, err = db.Connect(context.Background(), cfg.DatabaseURL)
		if err != nil {
			log.Fatal().Err(err).Msg("database connection failed")
		}
		defer pool.Close()
	} else {
		log.Warn().Msg("no database URL configured — running without database")
	}

	// Validate JWT secret in non-dev mode
	if cfg.DatabaseURL != "" && len(cfg.JWTSecret) < 32 {
		log.Fatal().Msg("ST_JWT_SECRET must be at least 32 characters in production")
	}

	router, reconciler := server.NewRouter(cfg, pool)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Start the execution reconciler if K8s + DB are available
	if reconciler != nil {
		go reconciler.Start(ctx)
	}

	go func() {
		log.Info().Int("port", cfg.Port).Msg("server starting")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server failed")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutting down gracefully")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("forced shutdown")
	}

	log.Info().Msg("server stopped")
}

func setupLogger(level, format string) {
	lvl, err := zerolog.ParseLevel(level)
	if err != nil {
		lvl = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(lvl)

	if format == "console" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	}
}

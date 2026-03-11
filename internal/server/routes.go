package server

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/httprate"
	"github.com/rs/cors"
	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/config"
	"github.com/scaledtest/scaledtest/internal/handler"
	"github.com/scaledtest/scaledtest/internal/spa"
	"github.com/scaledtest/scaledtest/internal/ws"
)

// NewRouter creates the chi router with all middleware and route groups.
func NewRouter(cfg *config.Config) http.Handler {
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(zerologMiddleware)
	r.Use(middleware.Recoverer)
	r.Use(httprate.LimitByIP(100, 1*time.Minute))
	r.Use(cors.New(cors.Options{
		AllowedOrigins:   []string{cfg.BaseURL, "http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Team-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}).Handler)

	// JWT manager
	accessDur, _ := time.ParseDuration(cfg.JWTAccessDuration)
	if accessDur == 0 {
		accessDur = 15 * time.Minute
	}
	refreshDur, _ := time.ParseDuration(cfg.JWTRefreshDuration)
	if refreshDur == 0 {
		refreshDur = 7 * 24 * time.Hour
	}
	jwtMgr := auth.NewJWTManager(cfg.JWTSecret, accessDur, refreshDur)

	// Auth middleware (nil tokenLookup until DB is wired)
	authMW := auth.Middleware(jwtMgr, nil)

	// Handlers
	authH := &handler.AuthHandler{JWT: jwtMgr}
	reportsH := &handler.ReportsHandler{}
	execH := &handler.ExecutionsHandler{}
	analyticsH := &handler.AnalyticsHandler{}
	qgH := &handler.QualityGatesHandler{}
	teamsH := &handler.TeamsHandler{}

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Auth routes (public)
	r.Route("/auth", func(r chi.Router) {
		r.Post("/register", authH.Register)
		r.Post("/login", authH.Login)
		r.Post("/refresh", authH.Refresh)
		r.Post("/logout", authH.Logout)
		r.Get("/github/callback", oauthNotConfigured("GitHub"))
		r.Get("/google/callback", oauthNotConfigured("Google"))
	})

	// API v1 routes (authenticated)
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(authMW)

		r.Route("/reports", func(r chi.Router) {
			r.Get("/", reportsH.List)
			r.Post("/", reportsH.Create)
			r.Get("/{reportID}", reportsH.Get)
			r.Delete("/{reportID}", reportsH.Delete)
		})

		r.Route("/executions", func(r chi.Router) {
			r.Get("/", execH.List)
			r.Post("/", execH.Create)
			r.Get("/{executionID}", execH.Get)
			r.Delete("/{executionID}", execH.Cancel)
			r.Put("/{executionID}/status", execH.UpdateStatus)
			r.Get("/{executionID}/workers", execH.Workers)
			r.Put("/{executionID}/workers/{workerIndex}/status", execH.UpdateWorkerStatus)
		})

		r.Route("/analytics", func(r chi.Router) {
			r.Get("/trends", analyticsH.Trends)
			r.Get("/flaky-tests", analyticsH.FlakyTests)
			r.Get("/error-analysis", analyticsH.ErrorAnalysis)
			r.Get("/duration-distribution", analyticsH.DurationDistribution)
		})

		r.Route("/quality-gates", func(r chi.Router) {
			r.Get("/", qgH.List)
			r.Post("/", qgH.Create)
			r.Get("/{gateID}", qgH.Get)
			r.Put("/{gateID}", qgH.Update)
			r.Delete("/{gateID}", qgH.Delete)
			r.Post("/{gateID}/evaluate", qgH.Evaluate)
		})

		r.Route("/teams", func(r chi.Router) {
			r.Get("/", teamsH.List)
			r.Post("/", teamsH.Create)
			r.Get("/{teamID}", teamsH.Get)
			r.Delete("/{teamID}", teamsH.Delete)
			r.Route("/{teamID}/tokens", func(r chi.Router) {
				r.Get("/", teamsH.ListTokens)
				r.Post("/", teamsH.CreateToken)
				r.Delete("/{tokenID}", teamsH.DeleteToken)
			})
		})

		r.Route("/admin", func(r chi.Router) {
			r.Use(auth.RequireRole("owner"))
			r.Get("/users", handler.AdminListUsers)
		})

		r.Get("/openapi.json", notImplemented)
	})

	// WebSocket — mount the execution hub for real-time status updates
	wsHub := ws.NewHub(cfg.BaseURL, "http://localhost:5173")
	r.Get("/ws/executions", wsHub.HandleConnect)

	// SPA fallback — serves embedded React app
	spa.Mount(r)

	return r
}

func notImplemented(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	w.Write([]byte(`{"error":"not implemented"}`))
}

// oauthNotConfigured returns a handler that describes the missing OAuth provider
// configuration, rather than returning a generic "not implemented" message.
func oauthNotConfigured(provider string) http.HandlerFunc {
	upper := strings.ToUpper(provider)
	msg := fmt.Sprintf(`{"error":"%s OAuth is not configured. Set ST_%s_CLIENT_ID and ST_%s_CLIENT_SECRET environment variables."}`,
		provider, upper, upper)
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotImplemented)
		w.Write([]byte(msg))
	}
}

func zerologMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Debug().
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Msg("request")
		next.ServeHTTP(w, r)
	})
}

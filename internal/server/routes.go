package server

import (
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
	"github.com/scaledtest/scaledtest/internal/db"
	ghclient "github.com/scaledtest/scaledtest/internal/github"
	"github.com/scaledtest/scaledtest/internal/handler"
	"github.com/scaledtest/scaledtest/internal/k8s"
	"github.com/scaledtest/scaledtest/internal/mailer"
	"github.com/scaledtest/scaledtest/internal/openapi"
	"github.com/scaledtest/scaledtest/internal/spa"
	"github.com/scaledtest/scaledtest/internal/store"
	"github.com/scaledtest/scaledtest/internal/webhook"
	"github.com/scaledtest/scaledtest/internal/ws"
)

// NewRouter creates the chi router with all middleware and route groups.
// pool may be nil when running without a database (dev mode).
func NewRouter(cfg *config.Config, pool ...*db.Pool) http.Handler {
	var dbPool *db.Pool
	if len(pool) > 0 {
		dbPool = pool[0]
	}
	r := chi.NewRouter()

	if cfg.DisableRateLimit {
		log.Warn().Msg("rate limiting disabled via ST_DISABLE_RATE_LIMIT — do not use in production")
	}

	// Global middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(zerologMiddleware)
	r.Use(middleware.Recoverer)
	r.Use(maxBodySize(10 << 20)) // 10MB global request body limit
	r.Use(rateLimitMW(cfg.DisableRateLimit, 100, 1*time.Minute))
	r.Use(cors.New(cors.Options{
		AllowedOrigins:   []string{cfg.BaseURL, "http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Team-ID", "X-CSRF-Token"},
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

	// Auth middleware with API token lookup
	var tokenLookup func(string) (*auth.Claims, error)
	if dbPool != nil {
		tokenLookup = store.NewAPITokenStore(dbPool).TokenLookupFunc()
	}
	authMW := auth.Middleware(jwtMgr, tokenLookup)

	// WebSocket hub for real-time execution streaming
	wsHub := ws.NewHub(cfg.BaseURL, "http://localhost:5173")

	// CSRF middleware — uses JWT secret as HMAC key for token signing
	csrfMW := auth.CSRFMiddleware([]byte(cfg.JWTSecret))

	// Stores
	var auditStore *store.AuditStore
	if dbPool != nil {
		auditStore = store.NewAuditStore(dbPool)
	}
	var qgStore *store.QualityGateStore
	if dbPool != nil {
		qgStore = store.NewQualityGateStore(dbPool)
	}
	// K8s client for launching test execution jobs (optional — graceful degradation)
	var k8sClient *k8s.Client
	k8sC, k8sErr := k8s.NewClient(cfg.K8sNamespace, cfg.K8sInCluster, cfg.K8sKubeconfig)
	if k8sErr != nil {
		log.Warn().Err(k8sErr).Msg("k8s client not available — job launch disabled")
	} else {
		k8sClient = k8sC
	}

	var whStore *store.WebhookStore
	if dbPool != nil {
		whStore = store.NewWebhookStore(dbPool)
	}
	var durStore *store.DurationStore
	if dbPool != nil {
		durStore = store.NewDurationStore(dbPool)
	}

	// Webhook delivery store for persisting delivery history
	var whDeliveryStore *store.WebhookDeliveryStore
	if dbPool != nil {
		whDeliveryStore = store.NewWebhookDeliveryStore(dbPool)
	}

	// Webhook dispatcher: fires outbound webhooks on events
	var whNotifier *webhook.Notifier
	if whStore != nil {
		whNotifier = webhook.NewNotifier(whStore, webhook.NewDispatcher())
		if whDeliveryStore != nil {
			whNotifier.SetRecorder(whDeliveryStore)
		}
	}

	// HTTPS detection
	isSecure := strings.HasPrefix(cfg.BaseURL, "https://")

	// OAuth configs
	oauthCfgs := auth.NewOAuthConfigs(cfg.BaseURL, cfg.OAuthGitHubClientID, cfg.OAuthGitHubClientSecret, cfg.OAuthGoogleClientID, cfg.OAuthGoogleClientSecret)

	// Handlers
	oauthH := &handler.OAuthHandler{JWT: jwtMgr, DB: dbPool, OAuth: oauthCfgs, Secure: isSecure}
	authH := &handler.AuthHandler{JWT: jwtMgr}
	if dbPool != nil {
		authH.DB = dbPool
	}
	reportsH := &handler.ReportsHandler{
		DB:                 dbPool,
		AuditStore:         auditStore,
		QualityGateStore:   qgStore,
		Webhooks:           whNotifier,
		GitHubStatusPoster: ghclient.New(cfg.GitHubToken),
		BaseURL:            cfg.BaseURL,
	}
	execH := &handler.ExecutionsHandler{
		DB:          dbPool,
		Hub:         wsHub,
		AuditStore:  auditStore,
		K8s:         k8sClient,
		WorkerImage: cfg.WorkerImage,
		WorkerToken: cfg.WorkerToken,
		APIBaseURL:  cfg.BaseURL,
		Webhooks:    whNotifier,
	}
	analyticsH := &handler.AnalyticsHandler{DB: dbPool}
	qgH := &handler.QualityGatesHandler{Store: qgStore, DB: dbPool}
	teamsH := &handler.TeamsHandler{DB: dbPool}
	shardH := &handler.ShardingHandler{DurationStore: durStore}
	adminH := &handler.AdminHandler{AuditStore: auditStore, DB: dbPool}
	whH := &handler.WebhooksHandler{Dispatcher: webhook.NewDispatcher()}
	if whStore != nil {
		whH.Store = whStore
	}
	if whDeliveryStore != nil {
		whH.DeliveryStore = whDeliveryStore
	}

	invH := &handler.InvitationsHandler{
		DB:      dbPool,
		BaseURL: cfg.BaseURL,
		Mailer:  mailer.New(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPFrom),
	}
	if dbPool != nil {
		invH.Store = store.NewInvitationStore(dbPool)
	}

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// CSRF token endpoint — SPA calls this to get a token before mutations
	r.Get("/auth/csrf-token", func(w http.ResponseWriter, r *http.Request) {
		token := auth.SetCSRFCookie(w, []byte(cfg.JWTSecret), isSecure)
		handler.JSON(w, http.StatusOK, map[string]string{"csrf_token": token})
	})

	// Auth routes (public) — stricter rate limit to prevent brute-force
	r.Route("/auth", func(r chi.Router) {
		r.Use(rateLimitMW(cfg.DisableRateLimit, 10, 1*time.Minute))
		r.Post("/register", authH.Register)
		r.Post("/login", authH.Login)
		r.Post("/refresh", authH.Refresh)
		r.Post("/logout", authH.Logout)
		r.Get("/github", oauthH.GitHubLogin)
		r.Get("/github/callback", oauthH.GitHubCallback)
		r.Get("/google", oauthH.GoogleLogin)
		r.Get("/google/callback", oauthH.GoogleCallback)
	})

	// API v1 routes (authenticated + CSRF protected)
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(authMW)
		r.Use(csrfMW)

		r.Get("/auth/me", authH.GetMe)
		r.With(rateLimitMW(cfg.DisableRateLimit, 10, 1*time.Minute)).Post("/auth/change-password", authH.ChangePassword)
		r.Patch("/auth/me", authH.UpdateMe)

		r.Route("/reports", func(r chi.Router) {
			r.Get("/", reportsH.List)
			r.With(auth.RequireRole("maintainer", "owner"), rateLimitMW(cfg.DisableRateLimit, 30, 1*time.Minute)).Post("/", reportsH.Create)
			r.Get("/compare", reportsH.Compare)
			r.Get("/{reportID}", reportsH.Get)
			r.With(auth.RequireRole("maintainer", "owner")).Delete("/{reportID}", reportsH.Delete)
		})

		r.Route("/executions", func(r chi.Router) {
			r.Get("/", execH.List)
			r.With(auth.RequireRole("maintainer", "owner"), rateLimitMW(cfg.DisableRateLimit, 20, 1*time.Minute)).Post("/", execH.Create)
			r.Get("/{executionID}", execH.Get)
			r.With(auth.RequireRole("maintainer", "owner")).Delete("/{executionID}", execH.Cancel)
			r.Put("/{executionID}/status", execH.UpdateStatus)
			r.Post("/{executionID}/progress", execH.ReportProgress)
			r.Post("/{executionID}/test-result", execH.ReportTestResult)
			r.Post("/{executionID}/worker-status", execH.ReportWorkerStatus)
		})

		r.Route("/analytics", func(r chi.Router) {
			r.Get("/trends", analyticsH.Trends)
			r.Get("/flaky-tests", analyticsH.FlakyTests)
			r.Get("/error-analysis", analyticsH.ErrorAnalysis)
			r.Get("/duration-distribution", analyticsH.DurationDistribution)
		})

		r.Route("/teams/{teamID}/quality-gates", func(r chi.Router) {
			r.Get("/", qgH.List)
			r.Post("/", qgH.Create)
			r.Get("/{gateID}", qgH.Get)
			r.Put("/{gateID}", qgH.Update)
			r.Delete("/{gateID}", qgH.Delete)
			r.Post("/{gateID}/evaluate", qgH.Evaluate)
			r.Get("/{gateID}/evaluations", qgH.ListEvaluations)
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
			r.Route("/{teamID}/webhooks", func(r chi.Router) {
				r.Get("/", whH.List)
				r.Post("/", whH.Create)
				r.Get("/{webhookID}", whH.Get)
				r.Put("/{webhookID}", whH.Update)
				r.Delete("/{webhookID}", whH.Delete)
				r.Get("/{webhookID}/deliveries", whH.ListDeliveries)
				r.Post("/{webhookID}/deliveries/{deliveryID}/retry", whH.RetryDelivery)
			})
			r.Route("/{teamID}/invitations", func(r chi.Router) {
				r.Get("/", invH.List)
				r.Post("/", invH.Create)
				r.Delete("/{invitationID}", invH.Revoke)
			})
		})


		r.Route("/sharding", func(r chi.Router) {
			r.Post("/plan", shardH.CreatePlan)
			r.Post("/rebalance", shardH.Rebalance)
			r.Get("/durations", shardH.ListDurations)
			r.Get("/durations/{testName}", shardH.GetDuration)
		})

		r.Route("/admin", func(r chi.Router) {
			r.Use(auth.RequireRole("owner"))
			r.Get("/users", adminH.ListUsers)
			r.Get("/audit-log", adminH.ListAuditLog)
		})

		r.Get("/openapi.json", openapi.Handler())
	})

	// Public invitation endpoints — no auth required (invitee uses token)
	r.Route("/api/v1/invitations/{token}", func(r chi.Router) {
		r.Get("/", invH.Preview)
		r.Post("/accept", invH.Accept)
	})

	// WebSocket — mount the execution hub for real-time status updates
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


func zerologMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Debug().
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Msg("request")
		next.ServeHTTP(w, r)
	})
}

// rateLimitMW returns a rate-limit middleware, or a passthrough when disabled.
// Pass cfg.DisableRateLimit to bypass rate limiting in controlled test environments.
func rateLimitMW(disabled bool, n int, dur time.Duration) func(http.Handler) http.Handler {
	if disabled {
		return func(next http.Handler) http.Handler { return next }
	}
	return httprate.LimitByIP(n, dur)
}

// maxBodySize limits the request body size for all requests.
func maxBodySize(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			}
			next.ServeHTTP(w, r)
		})
	}
}

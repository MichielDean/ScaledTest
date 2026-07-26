package scaledtest

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// defaultTimeout is the default per-request timeout for API calls.
const defaultTimeout = 30 * time.Second

// apiVersion is the API path prefix used for all authenticated endpoints.
const apiVersion = "/api/v1"

// Client is the ScaledTest API client. The returned service objects and the
// Client itself are safe for concurrent read use by multiple goroutines once
// constructed. The only method that mutates shared state is SetToken; callers
// that rotate the token at runtime must coordinate SetToken with in-flight
// requests themselves (e.g. by swapping to a new Client rather than mutating
// an existing one). The zero value is not usable; use NewClient.
type Client struct {
	baseURL    string
	token      string
	httpClient *http.Client
	userAgent  string
}

// Option configures a Client.
type Option func(*Client) error

// WithToken sets the bearer token (JWT or sct_ API token) used for
// authentication. This is required for all authenticated endpoints.
func WithToken(token string) Option {
	return func(c *Client) error {
		if token == "" {
			return errors.New("scaledtest: token must not be empty")
		}
		c.token = token
		return nil
	}
}

// WithHTTPClient sets the underlying *http.Client used for requests. If not
// set, a client with the configured timeout is used.
func WithHTTPClient(hc *http.Client) Option {
	return func(c *Client) error {
		if hc == nil {
			return errors.New("scaledtest: http client must not be nil")
		}
		c.httpClient = hc
		return nil
	}
}

// WithTimeout sets the per-request timeout for API calls. A value of zero
// disables the client-side timeout (the context.Context on each call still
// applies). Defaults to 30 seconds.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) error {
		if d < 0 {
			return errors.New("scaledtest: timeout must not be negative")
		}
		// Apply by constructing a transport-backed client; we materialize the
		// client in NewClient if not overridden by WithHTTPClient.
		c.httpClient = &http.Client{Timeout: d}
		return nil
	}
}

// WithUserAgent sets the User-Agent header sent with each request.
func WithUserAgent(ua string) Option {
	return func(c *Client) error {
		c.userAgent = ua
		return nil
	}
}

// NewClient constructs a new ScaledTest API client targeting the given base
// URL (e.g. "https://your-instance.example.com"). The base URL must use http
// or https and must not include a trailing path. At minimum, WithToken must
// be supplied for authenticated endpoints; anonymous endpoints (health,
// invitation preview/accept, register/login) can be called without a token.
func NewClient(baseURL string, opts ...Option) (*Client, error) {
	if baseURL == "" {
		return nil, errors.New("scaledtest: baseUrl is required")
	}
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("scaledtest: invalid baseUrl: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("scaledtest: baseUrl must use http or https (got %q)", parsed.Scheme)
	}
	// Strip trailing slash(es) so callers can pass either form.
	base := baseURL
	for strings.HasSuffix(base, "/") {
		base = strings.TrimSuffix(base, "/")
	}

	c := &Client{
		baseURL:    base,
		httpClient: &http.Client{Timeout: defaultTimeout},
		userAgent:  "scaledtest-go-sdk",
	}
	for _, opt := range opts {
		if opt == nil {
			continue
		}
		if err := opt(c); err != nil {
			return nil, err
		}
	}
	if c.httpClient == nil {
		c.httpClient = &http.Client{Timeout: defaultTimeout}
	}
	return c, nil
}

// BaseURL returns the configured base URL (without trailing slash).
func (c *Client) BaseURL() string { return c.baseURL }

// SetToken replaces the bearer token. This is intended for refresh flows
// where the access token is rotated at runtime. It is NOT safe to call
// SetToken while requests that depend on the previous token are in flight on
// other goroutines; for that scenario construct a new Client instead. For
// one-shot refresh-token usage that must not disturb concurrent callers, use
// AuthService.RefreshWithToken, which sends the refresh token per-request
// without mutating the client.
func (c *Client) SetToken(token string) { c.token = token }

// Reports returns the Reports service.
func (c *Client) Reports() *ReportsService { return &ReportsService{client: c} }

// Executions returns the Executions service.
func (c *Client) Executions() *ExecutionsService { return &ExecutionsService{client: c} }

// Analytics returns the Analytics service.
func (c *Client) Analytics() *AnalyticsService { return &AnalyticsService{client: c} }

// QualityGates returns the Quality Gates service.
func (c *Client) QualityGates() *QualityGatesService { return &QualityGatesService{client: c} }

// Teams returns the Teams service (includes tokens, webhooks, invitations).
func (c *Client) Teams() *TeamsService { return &TeamsService{client: c} }

// Sharding returns the Sharding service.
func (c *Client) Sharding() *ShardingService { return &ShardingService{client: c} }

// Auth returns the Auth service.
func (c *Client) Auth() *AuthService { return &AuthService{client: c} }

// Admin returns the Admin service.
func (c *Client) Admin() *AdminService { return &AdminService{client: c} }

// Health returns the Health service.
func (c *Client) Health() *HealthService { return &HealthService{client: c} }

// Invitations returns the public (token-scoped) Invitations service.
func (c *Client) Invitations() *InvitationsService { return &InvitationsService{client: c} }

// do performs an HTTP request and decodes the JSON response into out. A nil
// out is allowed for endpoints with no response body (none currently). The
// request is authenticated unless noAuth is true. authToken, when non-empty,
// overrides c.token for this single request — used by the refresh flow to
// send a refresh token without mutating shared client state.
func (c *Client) do(ctx context.Context, method, path string, query url.Values, body interface{}, out interface{}, noAuth bool, authToken string) error {
	fullURL := c.baseURL + path
	if len(query) > 0 {
		fullURL += "?" + query.Encode()
	}

	var reader io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("scaledtest: marshal request body: %w", err)
		}
		reader = bytes.NewReader(buf)
	}

	req, err := http.NewRequestWithContext(ctx, method, fullURL, reader)
	if err != nil {
		return fmt.Errorf("scaledtest: build request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	if !noAuth {
		tok := authToken
		if tok == "" {
			tok = c.token
		}
		if tok != "" {
			req.Header.Set("Authorization", "Bearer "+tok)
		}
	}
	if c.userAgent != "" {
		req.Header.Set("User-Agent", c.userAgent)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("scaledtest: http request: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return c.decodeError(resp)
	}

	if out == nil {
		// Drain the body so the connection can be reused.
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}

	// A 202 with an empty-ish body still decodes into the target struct; if
	// the body is genuinely empty, Unmarshal returns nil for a pointer target.
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("scaledtest: read response body: %w", err)
	}
	if len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("scaledtest: decode response: %w", err)
	}
	return nil
}

// decodeError reads the response body and returns a *ScaledTestError.
func (c *Client) decodeError(resp *http.Response) error {
	raw, err := io.ReadAll(resp.Body)
	if err != nil || len(raw) == 0 {
		return &ScaledTestError{Status: resp.StatusCode, Message: fmt.Sprintf("HTTP %d", resp.StatusCode)}
	}
	var env errorEnvelope
	if err := json.Unmarshal(raw, &env); err != nil || env.Error == "" {
		return &ScaledTestError{Status: resp.StatusCode, Message: fmt.Sprintf("HTTP %d", resp.StatusCode)}
	}
	return &ScaledTestError{Status: resp.StatusCode, Code: env.Code, Message: env.Error}
}

// doAPI is a convenience wrapper for authenticated /api/v1 calls.
func (c *Client) doAPI(ctx context.Context, method, path string, query url.Values, body, out interface{}) error {
	return c.do(ctx, method, apiVersion+path, query, body, out, false, "")
}

// doRaw is a convenience wrapper for unauthenticated calls (e.g. /health,
// /auth/register). The path already includes any prefix.
func (c *Client) doRaw(ctx context.Context, method, path string, query url.Values, body, out interface{}) error {
	return c.do(ctx, method, path, query, body, out, true, "")
}

// doRawWithToken is like doRaw but sends an explicit bearer token. Used by
// the refresh flow to send the refresh token without mutating c.token, so
// concurrent requests on the same Client are unaffected.
func (c *Client) doRawWithToken(ctx context.Context, method, path string, query url.Values, body, out interface{}, token string) error {
	return c.do(ctx, method, path, query, body, out, false, token)
}

// addQuery adds non-empty string values to a url.Values set, returning a new
// set if nil was passed in.
func addQuery(q url.Values, key, value string) url.Values {
	if value == "" {
		return q
	}
	if q == nil {
		q = url.Values{}
	}
	q.Set(key, value)
	return q
}

// addInt adds a positive int to a url.Values set.
func addInt(q url.Values, key string, value int) url.Values {
	if value <= 0 {
		return q
	}
	if q == nil {
		q = url.Values{}
	}
	q.Set(key, fmt.Sprintf("%d", value))
	return q
}

// addBool adds a boolean to a url.Values set when cond is true.
func addBool(q url.Values, key string, cond bool) url.Values {
	if !cond {
		return q
	}
	if q == nil {
		q = url.Values{}
	}
	q.Set(key, "true")
	return q
}

// pathEscape URL-escapes a single path segment.
func pathEscape(s string) string {
	return url.PathEscape(s)
}

// errMissingID is a small helper for the common "<kind> id is required"
// precondition. It is a plain error (not a *ScaledTestError) because it is
// raised client-side before any HTTP call.
func errMissingID(kind string) error {
	return errors.New("scaledtest: " + kind + " id is required")
}

package sanitize

import (
	"fmt"
	"html"
	"net/url"
	"strings"
)

var blockedShellPatterns = []string{
	"$((", "$(", "`", "${",
	"&&", "||", ";",
	">", ">>", "<", "<<",
	"|", "&",
}

// String escapes HTML entities in a user-provided string to prevent XSS.
// This should be applied to all user-provided strings before storage.
func String(s string) string {
	return html.EscapeString(s)
}

// StringMap escapes HTML entities in all values of a string map.
func StringMap(m map[string]string) map[string]string {
	if m == nil {
		return nil
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[html.EscapeString(k)] = html.EscapeString(v)
	}
	return out
}

// StringSlice escapes HTML entities in all elements of a string slice.
func StringSlice(ss []string) []string {
	if ss == nil {
		return nil
	}
	out := make([]string, len(ss))
	for i, s := range ss {
		out[i] = html.EscapeString(s)
	}
	return out
}

// ValidateCommand checks that a command string does not contain dangerous
// shell metacharacters that could lead to command injection. It returns an
// error describing the first disallowed pattern found.
func ValidateCommand(cmd string) error {
	for _, pattern := range blockedShellPatterns {
		if strings.Contains(cmd, pattern) {
			return fmt.Errorf("command contains disallowed pattern %q", pattern)
		}
	}
	return nil
}

// ValidateWebhookURL checks that a webhook URL is safe: it must be a valid
// URL with an https scheme and a non-private hostname (no loopback, link-local,
// or private IP ranges).
func ValidateWebhookURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if u.Scheme != "https" {
		return fmt.Errorf("webhook URL must use https scheme, got %q", u.Scheme)
	}
	if u.Host == "" {
		return fmt.Errorf("webhook URL must have a host")
	}
	hostname := u.Hostname()
	if hostname == "localhost" || hostname == "127.0.0.1" || hostname == "::1" || hostname == "[::1]" {
		return fmt.Errorf("webhook URL must not point to loopback address")
	}
	if strings.HasSuffix(hostname, ".local") || strings.HasSuffix(hostname, ".internal") {
		return fmt.Errorf("webhook URL must not point to local domain")
	}
	if isPrivateIP(hostname) {
		return fmt.Errorf("webhook URL must not point to private IP address")
	}
	return nil
}

func isPrivateIP(host string) bool {
	h := strings.TrimPrefix(strings.TrimSuffix(host, "]"), "[")
	if h == "::1" {
		return true
	}
	parts := strings.Split(h, ".")
	if len(parts) != 4 {
		return false
	}
	if parts[0] == "10" {
		return true
	}
	if parts[0] == "172" && len(parts[1]) == 2 {
		n := int(parts[1][0]-'0')*10 + int(parts[1][1]-'0')
		if n >= 16 && n <= 31 {
			return true
		}
	}
	if parts[0] == "192" && parts[1] == "168" {
		return true
	}
	return false
}

// FilterEnvVars removes entries whose keys start with ST_ to prevent
// override of ScaledTest worker environment variables in K8s jobs.
func FilterEnvVars(envVars map[string]string) map[string]string {
	if envVars == nil {
		return nil
	}
	out := make(map[string]string, len(envVars))
	for k, v := range envVars {
		if strings.HasPrefix(strings.ToUpper(k), "ST_") {
			continue
		}
		out[k] = v
	}
	return out
}

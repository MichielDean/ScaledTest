package sanitize

import (
	"fmt"
	"html"
	"net"
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
	if hostname == "localhost" {
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
	ip := net.ParseIP(strings.TrimPrefix(strings.TrimSuffix(host, "]"), "["))
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil && ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
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

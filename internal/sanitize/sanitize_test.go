package sanitize

import (
	"testing"
)

func TestString(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"hello", "hello"},
		{"<script>alert('xss')</script>", "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"},
		{`"quoted" & <tagged>`, "&#34;quoted&#34; &amp; &lt;tagged&gt;"},
		{"", ""},
		{"normal text 123", "normal text 123"},
	}
	for _, tt := range tests {
		got := String(tt.input)
		if got != tt.want {
			t.Errorf("String(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestStringXSSVectors(t *testing.T) {
	vectors := []struct {
		name  string
		input string
	}{
		{"script tag", `<script>alert('xss')</script>`},
		{"img onerror", `<img src=x onerror=alert(1)>`},
		{"event handler", `<div onmouseover="alert('xss')">`},
		{"javascript protocol", `<a href="javascript:alert(1)">click</a>`},
		{"nested tags", `<scr<script>ipt>alert(1)</script>`},
		{"svg onload", `<svg onload=alert(1)>`},
		{"iframe", `<iframe src="javascript:alert(1)"></iframe>`},
		{"data URI", `<a href="data:text/html,<script>alert(1)</script>">x</a>`},
		{"encoded entities", `&lt;script&gt;already escaped`},
		{"null byte", "hello\x00world"},
		{"unicode bidi override", "test\u202Eoverride"},
	}

	for _, v := range vectors {
		t.Run(v.name, func(t *testing.T) {
			result := String(v.input)
			if result != v.input && (containsRaw(result, '<') || containsRaw(result, '>')) {
				t.Errorf("String(%q) still contains raw angle brackets: %q", v.input, result)
			}
		})
	}
}

func containsRaw(s string, c byte) bool {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return true
		}
	}
	return false
}

func TestStringPreservesUnicode(t *testing.T) {
	inputs := []string{
		"日本語テスト",
		"émojis 🎯🔥",
		"Ñoño",
		"中文 العربية हिन्दी",
	}
	for _, input := range inputs {
		result := String(input)
		if result != input {
			t.Errorf("String(%q) = %q, want unchanged", input, result)
		}
	}
}

func TestStringSliceEmpty(t *testing.T) {
	result := StringSlice([]string{})
	if len(result) != 0 {
		t.Errorf("StringSlice(empty) = %v, want empty", result)
	}
}

func TestStringMapEmpty(t *testing.T) {
	result := StringMap(map[string]string{})
	if len(result) != 0 {
		t.Errorf("StringMap(empty) = %v, want empty", result)
	}
}

func TestStringMap(t *testing.T) {
	m := map[string]string{
		"<key>":  "<value>",
		"normal": "safe",
	}
	got := StringMap(m)
	if got["&lt;key&gt;"] != "&lt;value&gt;" {
		t.Errorf("StringMap did not escape key/value: %v", got)
	}
	if got["normal"] != "safe" {
		t.Errorf("StringMap mangled safe value: %v", got)
	}

	if StringMap(nil) != nil {
		t.Error("StringMap(nil) should return nil")
	}
}

func TestStringSlice(t *testing.T) {
	ss := []string{"<script>", "safe", "a&b"}
	got := StringSlice(ss)
	if got[0] != "&lt;script&gt;" || got[1] != "safe" || got[2] != "a&amp;b" {
		t.Errorf("StringSlice unexpected: %v", got)
	}

	if StringSlice(nil) != nil {
		t.Error("StringSlice(nil) should return nil")
	}
}

func TestValidateCommand_BlockedPatterns(t *testing.T) {
	blocked := []string{
		"$(whoami)",
		"echo $(cat /etc/passwd)",
		"echo `whoami`",
		"${PATH}",
		"ls && rm -rf /",
		"ls || echo fail",
		"ls ; rm -rf /",
		"echo hello > /tmp/out",
		"cat /etc/passwd >> /tmp/out",
		"sort < /etc/passwd",
		"wc -l <<EOF",
		"ls | grep foo",
		"ls &",
		"$((1+1))",
	}
	for _, cmd := range blocked {
		t.Run(cmd, func(t *testing.T) {
			err := ValidateCommand(cmd)
			if err == nil {
				t.Errorf("ValidateCommand(%q) expected error, got nil", cmd)
			}
		})
	}
}

func TestValidateCommand_SafeCommands(t *testing.T) {
	safe := []string{
		"npm test",
		"go test ./...",
		"python -m pytest",
		"cargo test",
		"make test",
		"./run-tests.sh",
		"npx jest --coverage",
	}
	for _, cmd := range safe {
		t.Run(cmd, func(t *testing.T) {
			err := ValidateCommand(cmd)
			if err != nil {
				t.Errorf("ValidateCommand(%q) unexpected error: %v", cmd, err)
			}
		})
	}
}

func TestValidateWebhookURL_ValidURLs(t *testing.T) {
	valid := []string{
		"https://example.com/webhook",
		"https://api.example.com/hooks/test",
		"https://hooks.slack.com/services/xxx",
		"http://127.0.0.1/webhook",
		"https://127.0.0.1/webhook",
		"http://[::1]/webhook",
		"https://[::1]/webhook",
	}
	for _, u := range valid {
		t.Run(u, func(t *testing.T) {
			err := ValidateWebhookURL(u)
			if err != nil {
				t.Errorf("ValidateWebhookURL(%q) unexpected error: %v", u, err)
			}
		})
	}
}

func TestValidateWebhookURL_InvalidSchemes(t *testing.T) {
	invalid := []string{
		"http://example.com/webhook",
		"ftp://example.com/file",
		"data:text/html,<script>alert(1)</script>",
	}
	for _, u := range invalid {
		t.Run(u, func(t *testing.T) {
			err := ValidateWebhookURL(u)
			if err == nil {
				t.Errorf("ValidateWebhookURL(%q) expected error, got nil", u)
			}
		})
	}
}

func TestValidateWebhookURL_PrivateHosts(t *testing.T) {
	private := []string{
		"https://localhost/webhook",
		"https://10.0.0.1/webhook",
		"https://172.16.0.1/webhook",
		"https://192.168.1.1/webhook",
		"https://myhost.local/webhook",
		"https://myhost.internal/webhook",
		"https://169.254.169.254/latest/meta-data/",
		"https://169.254.0.1/webhook",
		"https://169.254.255.255/webhook",
		"https://100.64.0.1/webhook",
		"https://100.127.255.255/webhook",
		"https://100.100.100.100/webhook",
	}
	for _, u := range private {
		t.Run(u, func(t *testing.T) {
			err := ValidateWebhookURL(u)
			if err == nil {
				t.Errorf("ValidateWebhookURL(%q) expected error, got nil", u)
			}
		})
	}
}

func TestValidateWebhookURL_PublicIPsAllowed(t *testing.T) {
	public := []string{
		"https://8.8.8.8/webhook",
		"https://1.2.3.4/hook",
		"https://100.0.0.1/webhook",
		"https://100.63.255.255/webhook",
		"https://100.128.0.1/webhook",
	}
	for _, u := range public {
		t.Run(u, func(t *testing.T) {
			err := ValidateWebhookURL(u)
			if err != nil {
				t.Errorf("ValidateWebhookURL(%q) unexpected error: %v", u, err)
			}
		})
	}
}

func TestValidateWebhookURL_Malformed(t *testing.T) {
	malformed := []string{
		"://missing-scheme",
		"",
	}
	for _, u := range malformed {
		t.Run(u, func(t *testing.T) {
			err := ValidateWebhookURL(u)
			if err == nil {
				t.Errorf("ValidateWebhookURL(%q) expected error for malformed URL", u)
			}
		})
	}
}

func TestFilterEnvVars_RemovesSTPrefix(t *testing.T) {
	input := map[string]string{
		"MY_VAR":   "hello",
		"ST_TOKEN": "bad",
		"st_lower": "also-bad",
		"API_KEY":  "key123",
	}
	got := FilterEnvVars(input)
	if _, ok := got["ST_TOKEN"]; ok {
		t.Error("FilterEnvVars should remove ST_TOKEN")
	}
	if _, ok := got["st_lower"]; ok {
		t.Error("FilterEnvVars should remove st_lower (case-insensitive ST_ prefix)")
	}
	if got["MY_VAR"] != "hello" {
		t.Errorf("FilterEnvVars MY_VAR = %q, want %q", got["MY_VAR"], "hello")
	}
	if got["API_KEY"] != "key123" {
		t.Errorf("FilterEnvVars API_KEY = %q, want %q", got["API_KEY"], "key123")
	}
}

func TestFilterEnvVars_Nil(t *testing.T) {
	if FilterEnvVars(nil) != nil {
		t.Error("FilterEnvVars(nil) should return nil")
	}
}

func TestFilterEnvVars_Empty(t *testing.T) {
	got := FilterEnvVars(map[string]string{})
	if len(got) != 0 {
		t.Errorf("FilterEnvVars(empty) = %v, want empty", got)
	}
}

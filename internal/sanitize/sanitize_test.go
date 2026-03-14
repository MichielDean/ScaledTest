package sanitize

import "testing"

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
			// Result must not contain raw < or > (the primary XSS risk)
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

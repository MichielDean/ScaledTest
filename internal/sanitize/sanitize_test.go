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

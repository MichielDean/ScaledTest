package mail

import "testing"

func TestSanitizeHeader_StripsCRLF(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"normal subject", "normal subject"},
		{"foo\r\nBcc: attacker@evil.com", "fooBcc: attacker@evil.com"},
		{"foo\rbar", "foobar"},
		{"foo\nbar", "foobar"},
		{"", ""},
	}
	for _, tt := range tests {
		got := sanitizeHeader(tt.input)
		if got != tt.want {
			t.Errorf("sanitizeHeader(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

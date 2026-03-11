package sanitize

import "html"

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

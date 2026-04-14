package store

// NullString returns a *string that is nil for empty strings.
// This is the shared helper for converting empty strings to NULL for database inserts.
func NullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

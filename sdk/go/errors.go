package scaledtest

import (
	"errors"
	"fmt"
)

// ScaledTestError is returned by the API for any non-2xx response. It carries
// the HTTP status code, the server-supplied error code (if present), and the
// human-readable message extracted from the response body.
type ScaledTestError struct {
	Status  int
	Code    string
	Message string
}

// Error implements the error interface.
func (e *ScaledTestError) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("scaledtest: %s (status %d, code %q)", e.Message, e.Status, e.Code)
	}
	return fmt.Sprintf("scaledtest: %s (status %d)", e.Message, e.Status)
}

// IsScaledTestError reports whether err is a *ScaledTestError.
func IsScaledTestError(err error) bool {
	var ste *ScaledTestError
	return errors.As(err, &ste)
}

// AsScaledTestError returns err as a *ScaledTestError and true if it is one,
// otherwise nil and false.
func AsScaledTestError(err error) (*ScaledTestError, bool) {
	var ste *ScaledTestError
	if errors.As(err, &ste) {
		return ste, true
	}
	return nil, false
}

// errorEnvelope is the JSON shape returned by the ScaledTest error helper:
//
//	{"error": "...", "code": "..."}
//
// The code field is optional and only present for a subset of endpoints.
type errorEnvelope struct {
	Error string `json:"error"`
	Code  string `json:"code,omitempty"`
}

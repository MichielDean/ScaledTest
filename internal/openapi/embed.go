package openapi

import (
	_ "embed"
	"net/http"
)

//go:embed openapi.json
var spec []byte

// Handler returns an http.HandlerFunc that serves the OpenAPI spec.
func Handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(spec)
	}
}

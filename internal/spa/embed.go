package spa

import (
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

//go:embed dist/*
var distFS embed.FS

// Mount serves the embedded React SPA. All non-API routes fall through to index.html.
func Mount(r chi.Router) error {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		return fmt.Errorf("failed to create sub filesystem for embedded SPA: %w", err)
	}

	fileServer := http.FileServer(http.FS(sub))

	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")

		if path != "" {
			if _, err := fs.Stat(sub, path); err == nil {
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})

	return nil
}

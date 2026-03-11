package spa

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

//go:embed dist/*
var distFS embed.FS

// Mount serves the embedded React SPA. All non-API routes fall through to index.html.
func Mount(r chi.Router) {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic("failed to create sub filesystem for embedded SPA: " + err.Error())
	}

	fileServer := http.FileServer(http.FS(sub))

	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")

		// Try to serve the file directly (JS, CSS, images, etc.)
		if path != "" {
			if _, err := fs.Stat(sub, path); err == nil {
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		// Fallback to index.html for SPA client-side routing
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})
}

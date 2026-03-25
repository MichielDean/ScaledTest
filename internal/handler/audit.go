package handler

import (
	"context"

	"github.com/scaledtest/scaledtest/internal/store"
)

// auditLogger is the minimal interface for audit logging, implemented by *store.AuditStore.
// Handlers accept this as an optional dependency; nil means no audit logging.
type auditLogger interface {
	Log(ctx context.Context, e store.Entry)
}

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

// logAudit logs an audit entry if al is non-nil.
func logAudit(ctx context.Context, al auditLogger, e store.Entry) {
	if al != nil {
		al.Log(ctx, e)
	}
}

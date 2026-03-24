package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/model"
)

// AuditStore handles append-only audit log persistence.
type AuditStore struct {
	pool *pgxpool.Pool
}

// NewAuditStore creates a new AuditStore.
func NewAuditStore(pool *pgxpool.Pool) *AuditStore {
	return &AuditStore{pool: pool}
}

// Entry is a single audit event to record.
type Entry struct {
	ActorID      string
	ActorEmail   string
	TeamID       string // empty string means not team-scoped
	Action       string
	ResourceType string
	ResourceID   string
	Metadata     map[string]interface{}
}

// Log inserts an audit entry. Errors are logged but not returned so that
// a logging failure never blocks the primary operation.
func (s *AuditStore) Log(ctx context.Context, e Entry) {
	var metaJSON []byte
	if len(e.Metadata) > 0 {
		var err error
		metaJSON, err = json.Marshal(e.Metadata)
		if err != nil {
			log.Error().Err(err).Str("action", e.Action).Msg("audit: failed to marshal metadata")
			metaJSON = nil
		}
	}

	var teamIDPtr *string
	if e.TeamID != "" {
		teamIDPtr = &e.TeamID
	}
	var resourceTypePtr *string
	if e.ResourceType != "" {
		resourceTypePtr = &e.ResourceType
	}
	var resourceIDPtr *string
	if e.ResourceID != "" {
		resourceIDPtr = &e.ResourceID
	}

	_, err := s.pool.Exec(ctx,
		`INSERT INTO audit_logs (actor_id, actor_email, team_id, action, resource_type, resource_id, metadata, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		e.ActorID, e.ActorEmail, teamIDPtr, e.Action, resourceTypePtr, resourceIDPtr, metaJSON, time.Now(),
	)
	if err != nil {
		log.Error().Err(err).Str("action", e.Action).Msg("audit: failed to insert log entry")
	}
}

// AuditListFilter holds query parameters for listing audit log entries.
type AuditListFilter struct {
	Action       string
	ResourceType string
	ActorID      string
	Since        *time.Time
	Until        *time.Time
	Limit        int
	Offset       int
}

// List returns audit log entries ordered newest-first.
func (s *AuditStore) List(ctx context.Context, f AuditListFilter) ([]model.AuditLog, int, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}

	where := " WHERE 1=1"
	args := []interface{}{}
	idx := 1

	if f.Action != "" {
		where += " AND a.action = $" + strconv.Itoa(idx)
		args = append(args, f.Action)
		idx++
	}
	if f.ResourceType != "" {
		where += " AND a.resource_type = $" + strconv.Itoa(idx)
		args = append(args, f.ResourceType)
		idx++
	}
	if f.ActorID != "" {
		where += " AND a.actor_id = $" + strconv.Itoa(idx)
		args = append(args, f.ActorID)
		idx++
	}
	if f.Since != nil {
		where += " AND a.created_at >= $" + strconv.Itoa(idx)
		args = append(args, *f.Since)
		idx++
	}
	if f.Until != nil {
		where += " AND a.created_at <= $" + strconv.Itoa(idx)
		args = append(args, *f.Until)
		idx++
	}

	var total int
	if err := s.pool.QueryRow(ctx, "SELECT COUNT(*) FROM audit_logs a LEFT JOIN teams t ON t.id = a.team_id"+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count audit logs: %w", err)
	}

	query := `SELECT a.id, a.actor_id, a.actor_email, a.team_id, t.name, a.action, a.resource_type, a.resource_id, a.metadata, a.created_at
	          FROM audit_logs a
	          LEFT JOIN teams t ON t.id = a.team_id` + where +
		" ORDER BY a.created_at DESC, a.id DESC" +
		" LIMIT $" + strconv.Itoa(idx) + " OFFSET $" + strconv.Itoa(idx+1)
	args = append(args, f.Limit, f.Offset)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("query audit logs: %w", err)
	}
	defer rows.Close()

	var entries []model.AuditLog
	for rows.Next() {
		var e model.AuditLog
		if err := rows.Scan(
			&e.ID, &e.ActorID, &e.ActorEmail, &e.TeamID, &e.TeamName, &e.Action,
			&e.ResourceType, &e.ResourceID, &e.Metadata, &e.CreatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan audit log: %w", err)
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate audit logs: %w", err)
	}

	return entries, total, nil
}

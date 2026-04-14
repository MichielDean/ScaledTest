package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/model"
)

type AdminStore struct {
	pool *pgxpool.Pool
}

func NewAdminStore(pool *pgxpool.Pool) *AdminStore {
	return &AdminStore{pool: pool}
}

func (s *AdminStore) ListUsers(ctx context.Context, limit, offset int) ([]model.User, int, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, email, display_name, role, created_at, updated_at
		 FROM users
		 ORDER BY created_at DESC
		 LIMIT $1 OFFSET $2`,
		limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var users []model.User
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.Email, &u.DisplayName, &u.Role, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, 0, err
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	var total int
	err = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	return users, total, nil
}

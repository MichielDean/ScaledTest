---
applyTo: "backend/internal/repository/**/*.go"
---

# Go Repository Standards

Guidelines for data access layer in ScaledTest. Repositories depend on `database.Executor` interface.

---

## Repository Structure

**Interface in `interfaces.go`:**
```go
// repository/interfaces.go
type UserRepository interface {
    GetByID(ctx context.Context, id string) (*models.User, error)
    Create(ctx context.Context, user *models.User) error
    Update(ctx context.Context, user *models.User) error
    Delete(ctx context.Context, id string) error
    List(ctx context.Context, opts ListOptions) ([]*models.User, int, error)
}
```

**Implementation with Executor dependency:**
```go
type PostgresUserRepository struct {
    db database.Executor
}

func NewPostgresUserRepository(db database.Executor) *PostgresUserRepository {
    return &PostgresUserRepository{db: db}
}

// Compile-time interface check — place at bottom of file
var _ UserRepository = (*PostgresUserRepository)(nil)
```

---

## Query Patterns

**Single row query:**
```go
func (r *PostgresUserRepository) GetByID(ctx context.Context, id string) (*models.User, error) {
    var user models.User
    err := r.db.QueryRow(ctx,
        `SELECT id, email, name, role, created_at
         FROM auth.users WHERE id = $1`,
        id,
    ).Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.CreatedAt)

    if errors.Is(err, pgx.ErrNoRows) {
        return nil, nil // or custom ErrNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("get user by id %s: %w", id, err)
    }
    return &user, nil
}
```

**Multiple rows query:**
```go
func (r *PostgresUserRepository) List(ctx context.Context, opts ListOptions) ([]*models.User, error) {
    rows, err := r.db.Query(ctx,
        `SELECT id, email, name, role FROM auth.users
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        opts.Limit, opts.Offset,
    )
    if err != nil {
        return nil, fmt.Errorf("list users: %w", err)
    }
    defer rows.Close()

    var users []*models.User
    for rows.Next() {
        var u models.User
        if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Role); err != nil {
            return nil, fmt.Errorf("scan user row: %w", err)
        }
        users = append(users, &u)
    }
    return users, rows.Err()
}
```

**Insert/Update/Delete:**
```go
func (r *PostgresUserRepository) Create(ctx context.Context, user *models.User) error {
    _, err := r.db.Exec(ctx,
        `INSERT INTO auth.users (id, email, name, role)
         VALUES ($1, $2, $3, $4)`,
        user.ID, user.Email, user.Name, user.Role,
    )
    if err != nil {
        return fmt.Errorf("create user: %w", err)
    }
    return nil
}
```

---

## Parameterized Queries

**ALWAYS use placeholders — never string concatenation:**
```go
// ✅ Safe
query := "SELECT * FROM users WHERE email = $1 AND active = $2"
rows, err := r.db.Query(ctx, query, email, true)

// ❌ SQL injection risk
query := fmt.Sprintf("SELECT * FROM users WHERE email = '%s'", email)
```

---

## Error Handling

**Wrap errors with operation context:**
```go
if err != nil {
    return fmt.Errorf("get user by email %s: %w", email, err)
}
```

**Handle `pgx.ErrNoRows` explicitly:**
```go
if errors.Is(err, pgx.ErrNoRows) {
    return nil, ErrUserNotFound
}
```

---

## Architecture Constraints

- Repositories MUST depend on `database.Executor` interface
- Repositories MUST NOT import `handlers` or `services`
- Maximum function size: 60 lines
- Place compile-time interface check at bottom of implementation file

---
applyTo: "**/*.go"
---

# Go Development Standards

Concise guidelines for Go code in ScaledTest. See path-specific files for handlers, repository, services, and testing patterns.

---

## Quick Reference

- Run `gofmt` — no manual formatting debates
- Omit `else` when `if` ends with `return`, `break`, `continue`
- Place `defer` immediately after acquiring a resource
- Use `_` for compile-time interface checks: `var _ Interface = (*Type)(nil)`
- Wrap errors with context: `fmt.Errorf("operation failed: %w", err)`
- Prefer channels over shared memory with mutexes
- Design types with useful zero values
- Accept interfaces, return concrete types
- Getters: `Owner()` not `GetOwner()`; Setters: `SetOwner()`
- Single-method interfaces: use `-er` suffix (`Reader`, `Writer`)
- Don't repeat package name in exports: `user.Profile` not `user.UserProfile`
- Short variable names in small scopes; descriptive names for larger scopes
- Always handle errors — never use `_, _ = someFunc()`
- Use structured logging with zap — never `fmt.Println`
- Table-driven tests — see `go-testing.instructions.md`

---

## Naming Conventions

**Package names:** lowercase, single-word, no underscores

**Exports:** PascalCase; unexported: camelCase

**Interface naming:**
- Single-method: `-er` suffix (`Reader`, `Writer`, `Formatter`)
- Multi-method: descriptive nouns (`UserRepository`, `TestExecutor`)
- Repository interfaces: `UserRepository`, `ProjectRepository`
- Service interfaces: `UserManager`, `SettingsManager`

**Implementations:** Prefix with implementation type:
- `PostgresUserRepository`, `PostgresProjectRepository`
- Services keep `Service` suffix: `UserService`, `ProjectService`

---

## Code Idioms

**Omit else after early return:**
```go
// ✅ Preferred
if err != nil {
    return err
}
return process(data)

// ❌ Avoid
if err != nil {
    return err
} else {
    return process(data)
}
```

**Defer for cleanup — place near acquisition:**
```go
// ✅ Correct
f, err := os.Open(name)
if err != nil {
    return err
}
defer f.Close()
```

**Compile-time interface check:**
```go
// Place at bottom of implementation file
var _ repository.UserRepository = (*PostgresUserRepository)(nil)
```

**Error wrapping with context:**
```go
// ✅ Wrap with context
if err != nil {
    return fmt.Errorf("failed to get user %s: %w", userID, err)
}

// ❌ Loses context
if err != nil {
    return err
}
```

---

## Structured Logging

**Always use zap:**
```go
logger.Info("User created", zap.String("userId", id), zap.String("email", email))
logger.Error("Query failed", zap.Error(err), zap.String("query", query))
```

**Log levels:** Debug (detailed), Info (general), Warn (potential issues), Error (failures)

---

## CTRF Type Generation

**CRITICAL: Use generated types for CTRF data structures.**

Generate from JSON Schema:
```bash
cd backend/internal/models
go-jsonschema -p models --only-models ctrf-schema.json -o ctrf.go
```

**Database storage:** NEVER store as JSONB. Deserialize into normalized tables:
- `ctrf_reports`, `ctrf_tools`, `ctrf_summaries`, `ctrf_environments`, `ctrf_tests`

---

## Architecture Testing

**Run before merging:** `cd backend && make arch-test`

**Enforced rules (arch-go.yml):**
- Dependency flow: `handlers` → `services` → `repository` → `models`
- Handlers MUST NOT import `repository` or `database` directly
- Services MUST NOT import `handlers`
- Models MUST NOT import other internal packages
- Function size limits: handlers 100 lines, services 80 lines, repository 60 lines

---

## Project Structure

```
backend/
├── cmd/server/          # main.go entrypoint
├── internal/
│   ├── handlers/        # HTTP/gRPC handlers (→ services only)
│   ├── services/        # Business logic (→ repository only)
│   ├── repository/      # Data access (→ models only)
│   ├── middleware/      # Auth, logging middleware
│   ├── models/          # Data models, CTRF types
│   └── wire/            # Dependency injection
├── api/proto/           # Protocol Buffer definitions
└── pkg/                 # Public libraries
```

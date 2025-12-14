---
applyTo: "backend/api/proto/*.pb.go,backend/api/proto/*.pb.gw.go,backend/api/proto/*_grpc.pb.go,backend/api/proto/*connect*.go,backend/gen/**/*.go,backend/internal/wire/wire_gen.go,frontend/src/gen/**/*.ts"
---

# Generated Files — DO NOT EDIT

**NEVER manually edit these files.** They are auto-generated and will be overwritten.

---

## What NOT to Do

- ❌ Do not modify `*.pb.go` files directly
- ❌ Do not modify `*_grpc.pb.go` files directly
- ❌ Do not modify `*.pb.gw.go` gateway files directly
- ❌ Do not modify `*connect*.go` Connect-RPC files directly
- ❌ Do not modify `wire_gen.go` directly
- ❌ Do not modify files in `frontend/src/gen/` directly
- ❌ Do not modify files in `backend/gen/` directly

---

## How to Make Changes

### Protocol Buffer Changes (`.pb.go`, `_grpc.pb.go`, `.pb.gw.go`)

1. Edit the source `.proto` file in `backend/api/proto/`
2. Regenerate:
   ```powershell
   # Windows
   cd backend
   buf generate
   ```
   ```bash
   # Linux/macOS
   cd backend && buf generate
   ```

### Wire Dependency Injection (`wire_gen.go`)

1. Edit `wire.go` in `backend/internal/wire/`
2. Regenerate:
   ```bash
   cd backend/internal/wire && wire
   ```

### Frontend Generated Types (`frontend/src/gen/`)

1. Edit the source `.proto` file
2. Regenerate using the frontend codegen process

---

## Why This Matters

Generated files are:
- Overwritten on every regeneration
- Kept in sync with source definitions
- Not designed for manual modification

Manual edits will be **lost** and may cause **type mismatches** between client and server.

# Agent Instructions

## Project Mission

ScaledTest is an end-to-end testing platform for running tests at massive scale with unprecedented reporting capabilities. It serves both humans (visual dashboards, analytics) and machines (CI integration, quality gates, webhooks). All test reporting uses the CTRF (Common Test Results Format) standard.

---

This project uses **Cistern** (`ct`) for work item tracking. Your work item is described in `CONTEXT.md`.

## Quick Reference

```bash
ct droplet pass <id> --notes "..."        # Signal work complete
ct droplet block <id> --notes "..."       # Signal blocked (external dependency)
ct droplet recirculate <id> --notes "..." # Send back for rework
ct droplet note <id> "..."                # Add a progress note
```

## Architecture

ScaledTest is a v2 Go backend + React SPA:

- **Go backend**: chi router, pgxpool, JWT auth, RBAC, CTRF ingestion
- **React frontend**: React 19, TanStack Router/Query, Zustand, Recharts — served as embedded SPA via `go:embed`
- **K8s Job management** for distributed test execution
- **Quality gate rule DSL**, WebSocket hub for real-time updates

### Key Directories

```
cmd/                  # Go binaries (server, worker, ci-notify)
internal/             # Go backend packages (auth, handler, store, ctrf, quality, ws, …)
frontend/             # React 19 SPA (Vite + TypeScript)
sdk/                  # TypeScript SDK
migrations/           # Database migrations
e2e/                  # End-to-end tests
```

### Test Commands

```bash
make test                   # All Go tests (with race detector)
make test-short             # Fast Go tests (no race)
make test-integration       # Integration tests (requires TEST_DATABASE_URL)
cd frontend && npm test     # Frontend tests (Vitest)
```

## Work Submission

Create PRs using the standard GitHub CLI:

```bash
gh pr create --title "sc-XXXXX: short description" --body "..."
```

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**

```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**

- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

## Cistern Workflow for AI Agents

1. **Read CONTEXT.md** — your work item, requirements, and any revision notes are there
2. **Implement** — write tests first (TDD), then implementation
3. **Run tests** — `make test` for Go; `cd frontend && npm test` for frontend
4. **Commit** — `git commit -m "<id>: <short description>"` (do NOT push)
5. **Signal outcome** — `ct droplet pass <id> --notes "..."` when complete

### Signaling Rules

- Always include `--notes` describing what you did or found
- Never signal `pass` if required issues remain unresolved
- Use `block` only for genuine external blockers, not for ordinary revision work
- Local commits only — do NOT push to origin

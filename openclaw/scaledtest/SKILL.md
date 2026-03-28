---
name: scaledtest
description: Work with the ScaledTest platform — a test result management system. Use when working on ScaledTest code, running tests, debugging, or managing the dev environment. Triggers on: "ScaledTest", "test results", "CTRF", "test platform", "st-" droplets.
metadata: {"openclaw": {"emoji": "🧪"}}
---

# ScaledTest

**Repo:** `~/.openclaw/workspace/ScaledTest`
**GitHub:** `https://github.com/MichielDean/ScaledTest`
**Stack:** Next.js 14+, TypeScript, Go backend, TimescaleDB + auth PostgreSQL, Better Auth, CTRF format

## Dev Workflow

```bash
npm run dev          # Docker + migrations + Next.js (full stack)
npm test             # All tests (unit/components/integration/system)
npm run build        # Production build
```

## Seed Users

| Email | Password | Role |
|-------|----------|------|
| `readonly@example.com` | `ReadOnly123!` | Read only |
| `maintainer@example.com` | `Maintainer123!` | Maintainer |
| `owner@example.com` | `Owner123!` | Owner |

## Cistern Integration

- Repo prefix: `st-`
- Aqueducts: julia, appia
- Worktree: `~/.cistern/sandboxes/ScaledTest/lobsterdog`

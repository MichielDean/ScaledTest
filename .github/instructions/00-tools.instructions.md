---
applyTo: "**/*"
---

# Research & Tool Usage

**ALWAYS research before implementing.** Use available tools in the correct order.

---

## Research Order

1. **Context7 MCP** — Use Context7 to look up library documentation FIRST:
   - Go: Fiber, gRPC, pgx, zap, Wire patterns
   - Frontend: React, React Router, Tailwind CSS, Vite patterns
   - Testing: Playwright, Vitest patterns

2. **Workspace Search** — Search the existing codebase for similar implementations

3. **Web/GitHub** — Only after Context7 and workspace search fail to provide answers

---

## When to Use Context7

- Before implementing any Fiber handler or middleware
- Before writing gRPC service implementations
- Before using pgx for database queries
- Before creating React components with hooks
- Before configuring Tailwind CSS classes
- Before writing Playwright tests
- When unsure about library API or best practices

**Example:** Before implementing a new gRPC handler, use Context7 to look up "connectrpc go handler patterns" or "fiber middleware patterns".

---

## Prefer Existing Patterns

Before creating new utilities or patterns:
1. Search the workspace for existing implementations
2. Check if a similar pattern exists in another handler/component
3. Reuse shared utilities from `pkg/`, `lib/`, or `components/`

# Context

## Item: sc-kgx67

**Title:** Remove v1 Next.js codebase and update CI to v2 only
**Status:** in_progress
**Priority:** 1

### Description

The repo has two parallel stacks on main: v1 (Next.js + Better Auth, root-level src/ and tests/) and v2 (Go backend + Vite React SPA, the active product). v2 is a strict superset. Remove all v1 artifacts: src/ directory (Next.js pages/components/API routes), tests/ directory (v1 Jest tests), docker/worker/ (TypeScript worker superseded by cmd/worker/main.go), and v1 root config files (next.config.ts, tailwind.config.ts, jest.config.ts, playwright.config.ts, postcss.config.js, eslint.config.mjs, root package.json, root tsconfig.json, components.json, ctrf.config.json, debug-auth.js, debug-user-management.png, cookies.txt, .air.toml). Keep: cmd/, internal/, frontend/, e2e/, deployments/, migrations/, Makefile, Dockerfile, .github/, README.md. Update pullRequest.yml: remove v1 jest-tests job, repoint any remaining jobs to v2. Update README to remove v1 vs v2 split description.

## Current Step: implement

- **Type:** agent
- **Role:** implementer
- **Context:** full_codebase

<available_skills>
  <skill>
    <name>cistern-droplet-state</name>
    <description>Manage droplet state in the Cistern agentic pipeline using the `ct` CLI.</description>
    <location>.claude/skills/cistern-droplet-state/SKILL.md</location>
  </skill>
  <skill>
    <name>github-workflow</name>
    <description>---</description>
    <location>.claude/skills/github-workflow/SKILL.md</location>
  </skill>
</available_skills>

## Signaling Completion

When your work is done, signal your outcome using the `ct` CLI:

**Pass (work complete, move to next step):**
    ct droplet pass sc-kgx67

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-kgx67
    ct droplet recirculate sc-kgx67 --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-kgx67

Add notes before signaling:
    ct droplet note sc-kgx67 "What you did / found"

The `ct` binary is on your PATH.

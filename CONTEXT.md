# Context

## Item: sc-uq877

**Title:** Consistent date formatting across the entire frontend
**Status:** in_progress
**Priority:** 3

### Description

Date formatting is inconsistent across the application: the Users/Teams tables on the Admin page show '3/24/2026' (toLocaleDateString with no options), the Audit Log shows '3/24/2026, 7:49:03 PM' (date + time), the Analytics trend chart shows raw ISO 8601 timestamps, and the Test Reports page uses 'Mar 24, 2026' (month/day/year with abbreviated month). Fix: create a shared date formatting utility in frontend/src/lib/utils.ts (or a new frontend/src/lib/date.ts) exporting: (1) formatDate(iso: string): string — 'Mar 24, 2026' for date-only display; (2) formatDateTime(iso: string): string — 'Mar 24, 2026, 7:49 PM' for timestamps with time; (3) formatDateShort(iso: string): string — 'Mar 24' for chart axis labels. Replace all inline date formatting across admin.tsx, analytics.tsx, dashboard.tsx, test-results.tsx, and any other routes with calls to these shared formatters. Add unit tests for all three formatters covering edge cases (invalid date, midnight UTC boundary).

## Current Step: implement

- **Type:** agent
- **Role:** implementer
- **Context:** full_codebase

<available_skills>
  <skill>
    <name>cistern-droplet-state</name>
    <description>Manage droplet state in the Cistern agentic pipeline using the `ct` CLI.</description>
    <location>/home/lobsterdog/.cistern/skills/cistern-droplet-state/SKILL.md</location>
  </skill>
  <skill>
    <name>cistern-git</name>
    <description>---</description>
    <location>/home/lobsterdog/.cistern/skills/cistern-git/SKILL.md</location>
  </skill>
  <skill>
    <name>cistern-github</name>
    <description>---</description>
    <location>/home/lobsterdog/.cistern/skills/cistern-github/SKILL.md</location>
  </skill>
</available_skills>

## Signaling Completion

When your work is done, signal your outcome using the `ct` CLI:

**Pass (work complete, move to next step):**
    ct droplet pass sc-uq877

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-uq877
    ct droplet recirculate sc-uq877 --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-uq877

Add notes before signaling:
    ct droplet note sc-uq877 "What you did / found"

The `ct` binary is on your PATH.

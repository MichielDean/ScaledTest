# Context

## Item: sc-to52w

**Title:** UI overhaul: modern dark design system across all frontend routes
**Status:** in_progress
**Priority:** 2

### Description

Complete visual overhaul of the ScaledTest frontend. The current UI has the right dark color tokens defined in index.css but applies them without visual intent — flat nav, unstyled tables, plain stat cards with no hierarchy, no icons, no accent usage. Target: a polished, modern dark UI consistent with dev tooling aesthetics in 2026 (Linear, Vercel, Planetscale).

## Design system baseline (do NOT change index.css color tokens — they are correct)

Colors to use with intent:
  --color-background: #0f1117    (page bg)
  --color-card: #161b22          (card/panel bg — slightly elevated)
  --color-muted: #1f2937         (hover states, subtle fills)
  --color-border: #1f2937        (dividers)
  --color-primary: #3b82f6       (CTAs, active nav, links)
  --color-accent: #60a5fa        (hover on primary, chart lines)
  --color-success: #22c55e       (pass/green states)
  --color-destructive: #ef4444   (fail/red states)
  --color-warning: #f59e0b       (flaky/yellow states)
  --color-muted-foreground: #9ca3af (secondary text)

Typography: keep system-ui. Add font-mono for IDs, timestamps, counts.

## Install one icon library

Add lucide-react to frontend/package.json:
  npm install lucide-react

Use icons sparingly and consistently:
  BarChart2       → Reports nav + stat card
  Play            → Executions nav + stat card
  ShieldCheck     → Quality Gates nav + stat card
  Webhook         → Webhooks nav
  Layers          → Sharding nav
  LayoutDashboard → Dashboard nav
  Settings        → Admin nav
  TrendingUp      → pass rate trend (positive)
  TrendingDown    → pass rate trend (negative)
  AlertCircle     → failure/error states
  CheckCircle2    → pass states
  Clock           → duration values
  Zap             → flaky tests
  User            → profile/user menu

## Layout: LEFT SIDEBAR (required — do not use top nav)

Convert root-layout.tsx to a fixed left sidebar layout. This is a hard requirement, not optional.

Sidebar specs:
  - Fixed, full height, 220px wide
  - bg-card border-r border-border
  - Top section: logo mark + "ScaledTest" wordmark (font-bold text-foreground)
  - Nav items stacked vertically with icon + label
  - Each nav item: flex items-center gap-3 px-3 py-2 rounded-md text-sm
    - Default: text-muted-foreground hover:text-foreground hover:bg-muted transition-colors
    - Active: text-primary bg-primary/10 font-medium (use [&.active] class from TanStack Router)
  - Bottom section pinned to bottom of sidebar:
    - User avatar (circle with initial, bg-muted text-foreground text-xs font-medium)
    - Display name or email truncated
    - Sign out icon button (LogOut icon, hover:text-destructive)
  - On the main content side: margin-left: 220px, the rest of the viewport width

Nav items in order (skip items the user doesn't have access to):
  LayoutDashboard  Dashboard
  BarChart2        Reports
  Play             Executions
  TrendingUp       Analytics
  ShieldCheck      Quality Gates
  Webhook          Webhooks
  Layers           Sharding
  Settings         Admin  (owner role only)

Remove the existing <nav> top bar entirely — the sidebar replaces it.

## StatCard (dashboard.tsx)

Current: plain rounded-lg border with title + giant number
Target:
  - Add icon prop (lucide React component) — render it top-right in text-muted-foreground/50
  - Add trend prop (optional): small colored badge "+2.3%" in success/destructive color
  - Left-border accent: border-l-4 border-primary on the card left edge
  - Value: keep text-3xl font-bold, add font-mono
  - Subtle gradient: bg-gradient-to-br from-card to-background

## Tables (reports, executions, admin, audit log)

Current: raw <table> with border-b rows
Target:
  - thead: bg-muted/50, text-muted-foreground text-xs uppercase tracking-wider
  - tbody rows: hover:bg-muted/30 transition-colors
  - Status cells: StatusBadge component with rounded-full pills:
      passed/success → bg-success/10 text-success border border-success/20
      failed/error   → bg-destructive/10 text-destructive border border-destructive/20
      pending/running → bg-warning/10 text-warning border border-warning/20
  - ID/hash columns: font-mono text-xs text-muted-foreground
  - Timestamp columns: font-mono text-xs text-muted-foreground

## Charts (dashboard trends, analytics)

Target:
  - Line stroke: #60a5fa (accent), strokeWidth: 2
  - CartesianGrid: stroke="#1f2937", strokeDasharray="4 4"
  - XAxis/YAxis tick: fill="#9ca3af", fontSize: 11
  - Custom Tooltip: bg-card border border-border text-foreground rounded-md shadow-lg

## Empty states

Target: centered area with:
  - Relevant icon (48px, text-muted-foreground/50)
  - Heading in text-muted-foreground
  - Optional CTA if applicable

## Forms and inputs (login, register, quality gate create/edit)

Target:
  - Input: bg-muted border border-border focus:border-primary focus:ring-1 focus:ring-primary/30 rounded-md px-3 py-2
  - Label: text-sm font-medium text-foreground mb-1
  - Error: text-destructive text-sm mt-1 with AlertCircle icon inline
  - Submit button: bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md px-4 py-2 transition-colors

## Constraints

- No new dependencies except lucide-react
- Tailwind utility classes only — no CSS-in-JS
- No shadcn/ui component installation — implement components directly
- All existing Jest tests must still pass — preserve all data-testid and id= attributes
- Responsive: 1280px+ desktop and 768px+ tablet. Mobile not a priority.
- Sidebar collapses to icon-only (40px wide) at <768px viewport width if you want, but is not required

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
    ct droplet pass sc-to52w

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-to52w
    ct droplet recirculate sc-to52w --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-to52w

Add notes before signaling:
    ct droplet note sc-to52w "What you did / found"

The `ct` binary is on your PATH.

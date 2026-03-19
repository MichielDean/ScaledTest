# Context

## Item: sc-kjdzo

**Title:** Populate PreviousFailedTests from prior report
**Status:** in_progress
**Priority:** 1

### Description

When evaluating quality gates on report submission, look up the most recent prior report for the same team, load its failed test names, and pass them as PreviousFailedTests in ReportData.

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
    ct droplet pass sc-kjdzo

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-kjdzo
    ct droplet recirculate sc-kjdzo --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-kjdzo

Add notes before signaling:
    ct droplet note sc-kjdzo "What you did / found"

The `ct` binary is on your PATH.

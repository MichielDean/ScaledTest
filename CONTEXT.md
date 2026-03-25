# Context

## Item: sc-j755h

**Title:** Define LLM triage result schema and DB migration
**Status:** in_progress
**Priority:** 2

### Description

Design and implement the database schema for storing LLM triage results per CI run. Schema must capture: failure clusters (groups sharing a root cause), per-cluster root cause summary, per-failure classification (new/flaky/regression), overall triage summary text, LLM provider used, token cost metadata, and triage status (pending/complete/failed). Write and apply the migration. This is the foundational data contract all other triage work depends on.

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
    ct droplet pass sc-j755h

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-j755h
    ct droplet recirculate sc-j755h --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-j755h

Add notes before signaling:
    ct droplet note sc-j755h "What you did / found"

The `ct` binary is on your PATH.

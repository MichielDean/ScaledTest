# Context

## Item: sc-flli2

**Title:** Expose on-demand triage result API endpoint
**Status:** in_progress
**Priority:** 2

### Description

Add GET /runs/{run_id}/triage returning the persisted triage result: status, clusters array (each with root cause label, failure list, and classification), overall summary, and metadata (model used, generated_at). Add POST /runs/{run_id}/triage/retry to re-trigger triage for a completed run. Integrate with the existing error analysis endpoint surface for a consistent caller API. Return 202 Accepted with triage_status=pending while async job is still running.

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
    ct droplet pass sc-flli2

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-flli2
    ct droplet recirculate sc-flli2 --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-flli2

Add notes before signaling:
    ct droplet note sc-flli2 "What you did / found"

The `ct` binary is on your PATH.

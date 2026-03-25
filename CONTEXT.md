# Context

## Item: sc-o4uyx

**Title:** Wire async triage job into report ingest pipeline
**Status:** in_progress
**Priority:** 2

### Description

After a CI run report is fully ingested and its status is final, enqueue a background triage job. The job invokes the triage prompt engine, persists the result, and updates the run record with a triage_status field. Acceptance criteria: triage runs automatically on every completed run without blocking the ingest response; job is idempotent and re-runnable on failure; job failure does not mark the run as failed; triage result is queryable within 30s of run completion under normal load.

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
    ct droplet pass sc-o4uyx

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-o4uyx
    ct droplet recirculate sc-o4uyx --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-o4uyx

Add notes before signaling:
    ct droplet note sc-o4uyx "What you did / found"

The `ct` binary is on your PATH.

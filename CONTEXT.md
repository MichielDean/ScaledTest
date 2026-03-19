# Context

## Item: sc-w4osy

**Title:** Add manual retry endpoint for failed webhook deliveries
**Status:** in_progress
**Priority:** 3

### Description

Implement POST /api/v1/teams/{teamID}/webhooks/{webhookID}/deliveries/{deliveryID}/retry endpoint that re-dispatches the stored payload to the webhook URL and records a new delivery attempt. Also add unit test for the retry endpoint.

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
    ct droplet pass sc-w4osy

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-w4osy
    ct droplet recirculate sc-w4osy --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-w4osy

Add notes before signaling:
    ct droplet note sc-w4osy "What you did / found"

The `ct` binary is on your PATH.

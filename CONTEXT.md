# Context

## Item: sc-yaxdh

**Title:** Remove continue-on-error from go-integration-test
**Status:** in_progress
**Priority:** 1

### Description

Remove the 'continue-on-error: true' setting from the 'go-integration-test' job in the pullRequest.yml workflow, so integration test failures will fail the entire CI pipeline.

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
    ct droplet pass sc-yaxdh

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-yaxdh
    ct droplet recirculate sc-yaxdh --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-yaxdh

Add notes before signaling:
    ct droplet note sc-yaxdh "What you did / found"

The `ct` binary is on your PATH.

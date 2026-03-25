# Context

## Item: sc-2g9qe

**Title:** Build git diff context provider for triage enrichment
**Status:** in_progress
**Priority:** 2

### Description

Implement a context enricher that, given a commit SHA and repo, fetches changed files and a condensed diff summary (file paths + churn stats, not full hunks) since the previous successful run. Output is a structured diff summary sized for safe LLM prompt inclusion. Must handle: missing repo access gracefully (return empty context, do not fail triage), large diffs (truncate to top-N files by churn), and per-run caching to avoid redundant fetches.

## Current Step: implement

- **Type:** agent
- **Role:** implementer
- **Context:** full_codebase

## ⚠️ REVISION REQUIRED — Fix these issues before anything else

This droplet was recirculated. The following issues were found and **must** be fixed.
Do not proceed to implementation until you have read and understood each issue.

### Issue 1 (from: reviewer)

Finding 1: internal/github/diff.go:39 — SSRF via missing input validation. FetchDiff interpolates owner, repo, baseSHA, headSHA into URL without validation. PostStatus in the same file validates with validOwnerRepo/validSHA regexes but FetchDiff does not. User-controlled CTRF data flows through ParseOwnerRepo to these params. Fix: apply same validOwnerRepo/validSHA validation as PostStatus.

### Issue 2 (from: reviewer)

Finding 2: internal/analytics/git_diff.go:198 — ParseOwnerRepo allows slashes in repo component. strings.SplitN(s, "/", 2) means 'owner/repo/extra' yields repo='repo/extra' with ok=true, injecting extra path segments into FetchDiff URL. Fix: after SplitN, verify parts[1] contains no '/' or use strings.Split and require exactly 2 non-empty parts.

### Issue 3 (from: reviewer)

Finding 3: internal/analytics/git_diff.go:75 — Unbounded cache growth (memory leak). sync.Map cache has no eviction, TTL, or size limit. Every unique (teamID, repo, headSHA) tuple is cached permanently. For a long-running server with continuous deployments, this grows monotonically. Fix: use a bounded LRU cache or add TTL-based eviction.

### Issue 4 (from: reviewer)

♻ 3 findings. (1) SSRF: FetchDiff (github/diff.go:39) interpolates owner/repo/SHA into URL without validation — PostStatus in same file validates with validOwnerRepo/validSHA regexes but FetchDiff does not. (2) ParseOwnerRepo (analytics/git_diff.go:198) allows slashes in repo via SplitN limit 2, compounding finding 1. (3) Unbounded sync.Map cache (analytics/git_diff.go:75) with no eviction — memory leak on long-running servers.

---

## Recent Step Notes

### From: reviewer

♻ 3 findings. (1) SSRF: FetchDiff (github/diff.go:39) interpolates owner/repo/SHA into URL without validation — PostStatus in same file validates with validOwnerRepo/validSHA regexes but FetchDiff does not. (2) ParseOwnerRepo (analytics/git_diff.go:198) allows slashes in repo via SplitN limit 2, compounding finding 1. (3) Unbounded sync.Map cache (analytics/git_diff.go:75) with no eviction — memory leak on long-running servers.

### From: reviewer

Finding 3: internal/analytics/git_diff.go:75 — Unbounded cache growth (memory leak). sync.Map cache has no eviction, TTL, or size limit. Every unique (teamID, repo, headSHA) tuple is cached permanently. For a long-running server with continuous deployments, this grows monotonically. Fix: use a bounded LRU cache or add TTL-based eviction.

### From: reviewer

Finding 2: internal/analytics/git_diff.go:198 — ParseOwnerRepo allows slashes in repo component. strings.SplitN(s, "/", 2) means 'owner/repo/extra' yields repo='repo/extra' with ok=true, injecting extra path segments into FetchDiff URL. Fix: after SplitN, verify parts[1] contains no '/' or use strings.Split and require exactly 2 non-empty parts.

### From: reviewer

Finding 1: internal/github/diff.go:39 — SSRF via missing input validation. FetchDiff interpolates owner, repo, baseSHA, headSHA into URL without validation. PostStatus in the same file validates with validOwnerRepo/validSHA regexes but FetchDiff does not. User-controlled CTRF data flows through ParseOwnerRepo to these params. Fix: apply same validOwnerRepo/validSHA validation as PostStatus.

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
    ct droplet pass sc-2g9qe

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-2g9qe
    ct droplet recirculate sc-2g9qe --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-2g9qe

Add notes before signaling:
    ct droplet note sc-2g9qe "What you did / found"

The `ct` binary is on your PATH.

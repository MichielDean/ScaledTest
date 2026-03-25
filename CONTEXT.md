# Context

## Item: sc-yqnno

**Title:** Implement configurable LLM provider abstraction
**Status:** in_progress
**Priority:** 2

### Description

Define a provider interface with a single analyze method accepting a prompt and a structured output schema, returning a typed response. Implement Anthropic (claude-sonnet-4-6) and OpenAI (gpt-4o) backends. Provider selection and credentials are driven by environment config (e.g. LLM_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY). Include retry logic, timeout handling, and a mock provider for tests. No business logic here — pure transport and auth layer.

## Current Step: delivery

- **Type:** agent
- **Role:** delivery

## ⚠️ REVISION REQUIRED — Fix these issues before anything else

This droplet was recirculated. The following issues were found and **must** be fixed.
Do not proceed to implementation until you have read and understood each issue.

### Issue 1 (from: reviewer)

Finding: llm.go:57-58 — MaxRetries zero-value ambiguity. `if cfg.MaxRetries == 0 { cfg.MaxRetries = 2 }` makes it impossible for callers to request 0 retries (1 total attempt). Go zero-value int is 0, so Config{} and Config{MaxRetries: 0} are indistinguishable — both silently get 3 attempts. Tests at llm_test.go:176 and llm_test.go:234 pass MaxRetries: 0 intending no retries but get 2; they pass only by accident (non-JSON test: CLI exits 0 so retry loop breaks immediately; deadline test: parent context kills all attempts). Fix: use negative sentinel for default (if cfg.MaxRetries < 0) or change to *int where nil means use default.

### Issue 2 (from: reviewer)

♻ 1 finding. (1) llm.go:57-58 — MaxRetries zero-value ambiguity: `if cfg.MaxRetries == 0` silently converts explicit MaxRetries:0 (caller wants 1 total attempt) into MaxRetries:2 (3 total attempts). Tests at llm_test.go:176 and llm_test.go:234 set MaxRetries:0 intending no retries but get 2 — they pass by accident. Fix: use negative sentinel for default or *int.

### Issue 3 (from: reviewer)

Phase 1 — Prior issues RESOLVED: MaxRetries changed from int to *int (llm.go:46). nil→default(2), intPtr(0)→0 retries. New test TestCLIProvider_Analyze_ZeroRetries_MakesExactlyOneAttempt (llm_test.go:234) verifies exactly 1 invocation. All 17 tests pass with -race.

### Issue 4 (from: reviewer)

Finding: llm.go:59-60 — Missing validation for negative *MaxRetries. New() accepts intPtr(-1) without error, setting maxRetries to -1. The retry loop (cli.go:70) 'for attempt := 0; attempt <= c.maxRetries' evaluates 0 <= -1 as false, so the loop body never executes. Analyze then returns a confusing 'not valid JSON' error on nil output instead of a clear config error. Fix: add 'if maxRetries < 0 { return nil, fmt.Errorf("llm: MaxRetries must be >= 0, got %d", maxRetries) }' in New() after resolving the default.

### Issue 5 (from: reviewer)

♻ 1 finding. Prior issues (MaxRetries zero-value ambiguity) are RESOLVED — *int fix is correct and well-tested. New finding: llm.go:59-60 — New() does not validate negative *MaxRetries values. intPtr(-1) silently produces a provider whose Analyze loop never executes, returning a confusing 'not valid JSON' error. Fix: validate maxRetries >= 0 in New().

### Issue 6 (from: reviewer)

Phase 1: All 5 prior issues RESOLVED. (1-2) MaxRetries changed to *int — nil→default(2), intPtr(0)→0 retries. Zero-retries test verifies exactly 1 invocation. (4-5) Negative MaxRetries validation added at llm.go:62-64 with test coverage. All 18 tests pass with -race. Phase 2: Fresh adversarial review — no new findings. exec.CommandContext safely passes prompt as discrete arg (no shell injection). Credential check is fail-fast. Retry loop bounds and context cancellation correct. No resource leaks. Mock is goroutine-safe. Config test follows existing codebase pattern.

### Issue 7 (from: reviewer)

No findings. All prior issues resolved. Fresh review clean — no security, logic, error handling, or contract issues found.

---

## Recent Step Notes

### From: docs_writer

Updated README.md: documented LLM provider configuration (ST_LLM_PROVIDER, ST_LLM_COMMAND, ANTHROPIC_API_KEY, OPENAI_API_KEY) and added llm package to Project Structure section.

### From: reviewer

No findings. All prior issues resolved. Fresh review clean — no security, logic, error handling, or contract issues found.

### From: reviewer

Phase 1: All 5 prior issues RESOLVED. (1-2) MaxRetries changed to *int — nil→default(2), intPtr(0)→0 retries. Zero-retries test verifies exactly 1 invocation. (4-5) Negative MaxRetries validation added at llm.go:62-64 with test coverage. All 18 tests pass with -race. Phase 2: Fresh adversarial review — no new findings. exec.CommandContext safely passes prompt as discrete arg (no shell injection). Credential check is fail-fast. Retry loop bounds and context cancellation correct. No resource leaks. Mock is goroutine-safe. Config test follows existing codebase pattern.

### From: simplifier

No simplifications required — code is already clear and idiomatic. All 18 tests pass with -race.

<available_skills>
  <skill>
    <name>cistern-github</name>
    <description>---</description>
    <location>/home/lobsterdog/.cistern/skills/cistern-github/SKILL.md</location>
  </skill>
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
</available_skills>

## Signaling Completion

When your work is done, signal your outcome using the `ct` CLI:

**Pass (work complete, move to next step):**
    ct droplet pass sc-yqnno

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-yqnno
    ct droplet recirculate sc-yqnno --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-yqnno

Add notes before signaling:
    ct droplet note sc-yqnno "What you did / found"

The `ct` binary is on your PATH.

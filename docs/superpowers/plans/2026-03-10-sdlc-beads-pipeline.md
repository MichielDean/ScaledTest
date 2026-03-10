# SDLC Beads Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a structurally-enforced SDLC pipeline for ScaledTest using beads — every `feature` and `bug` bead automatically flows through impl → review → qa → pr stages, with a `gh:pr` gate blocking closure until the PR merges into main.

**Architecture:** Two shell scripts (`bd-sdlc-spawn.sh` and `bd-sdlc-rewind.sh`) drive the pipeline lifecycle. AGENTS.md and PRIME.md define per-stage agent personas and enforce the spawn step as mandatory. `bd setup claude` installs a SessionStart hook so PRIME.md is injected automatically at every Claude Code session start.

**Tech Stack:** bash, `bd` (beads) CLI v0.59.0, `gh` (GitHub CLI), `git`

---

## Chunk 1: Spawn Script

### Task 1: Write `scripts/bd-sdlc-spawn.sh`

**Files:**
- Create: `scripts/bd-sdlc-spawn.sh`

This script takes a parent bead ID, validates it is a `feature` or `bug`, creates 4 sequential
child beads, then wires them with blocking dependencies so `bd ready` enforces order.

Dependency direction: `bd dep add <blocked> <blocker>` — "blocked depends on blocker".

- [ ] **Step 1.1: Create the script file**

```bash
cat > scripts/bd-sdlc-spawn.sh << 'SCRIPT'
#!/usr/bin/env bash
# bd-sdlc-spawn.sh — Spawn an SDLC molecule for a feature or bug bead
# Usage: scripts/bd-sdlc-spawn.sh <parent-bead-id>
# Must be run from the repository root.

set -euo pipefail

PARENT="${1:-}"
if [[ -z "$PARENT" ]]; then
  echo "Usage: $0 <parent-bead-id>" >&2
  exit 1
fi

# Fetch parent bead and validate type
PARENT_JSON=$(bd show "$PARENT" --json 2>&1) || {
  echo "Error: bead '$PARENT' not found" >&2
  exit 1
}

BEAD_TYPE=$(echo "$PARENT_JSON" | grep -o '"issue_type":"[^"]*"' | cut -d'"' -f4)
BEAD_TITLE=$(echo "$PARENT_JSON" | grep -o '"title":"[^"]*"' | cut -d'"' -f4)

if [[ "$BEAD_TYPE" != "feature" && "$BEAD_TYPE" != "bug" ]]; then
  echo "Error: bd-sdlc-spawn only applies to 'feature' and 'bug' beads." >&2
  echo "  '$PARENT' is type '$BEAD_TYPE' — close it directly when done." >&2
  exit 1
fi

echo "Spawning SDLC pipeline for: $PARENT ($BEAD_TYPE) — $BEAD_TITLE"

# Create the 4 stage children (no deps yet — wire after all IDs known)
IMPL_JSON=$(bd create "impl: $BEAD_TITLE" \
  --description="Implementation stage. Write failing tests FIRST (TDD/BDD), then implement until all tests pass. Run 'make test' before closing." \
  -t task --parent "$PARENT" -l "stage:impl" --json 2>&1)
IMPL_ID=$(echo "$IMPL_JSON" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

REVIEW_JSON=$(bd create "review: $BEAD_TITLE" \
  --description="Agent code review. Read the full diff. Fix minor issues in-place. Rewind via bd-sdlc-rewind.sh for logic errors, security issues, or architectural problems." \
  -t task --parent "$PARENT" -l "stage:review" --json 2>&1)
REVIEW_ID=$(echo "$REVIEW_JSON" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

QA_JSON=$(bd create "qa: $BEAD_TITLE" \
  --description="Quality pass. Run the full suite (make test + Playwright E2E). Check coverage hasn't regressed. Rewind via bd-sdlc-rewind.sh if coverage drops or systemic gaps found." \
  -t task --parent "$PARENT" -l "stage:qa" --json 2>&1)
QA_ID=$(echo "$QA_JSON" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

PR_JSON=$(bd create "pr: $BEAD_TITLE" \
  --description="PR + merge gate. Create PR against main, enable auto-merge, resolve GitHub Copilot review comments, wait for CI green and auto-merge. Bead auto-closes when PR merges." \
  -t task --parent "$PARENT" -l "stage:pr" --json 2>&1)
PR_ID=$(echo "$PR_JSON" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

# Wire blocking dependencies: bd dep add <blocked> <blocker>
# review blocked by impl
bd dep add "$REVIEW_ID" --blocked-by "$IMPL_ID" --quiet 2>&1
# qa blocked by review
bd dep add "$QA_ID" --blocked-by "$REVIEW_ID" --quiet 2>&1
# pr blocked by qa
bd dep add "$PR_ID" --blocked-by "$QA_ID" --quiet 2>&1

echo ""
echo "Pipeline ready:"
echo "  $IMPL_ID   [impl]   → write tests first, then implement"
echo "  $REVIEW_ID [review] → blocked until impl closes"
echo "  $QA_ID     [qa]     → blocked until review closes"
echo "  $PR_ID     [pr]     → blocked until qa closes"
echo ""
echo "Run: bd ready   (only $IMPL_ID will appear)"
SCRIPT
```

- [ ] **Step 1.2: Make it executable**

```bash
chmod +x scripts/bd-sdlc-spawn.sh
```

- [ ] **Step 1.3: Smoke test — feature bead spawns correctly**

Create a test parent bead, run the script, verify structure:

```bash
# Create test parent
TEST_ID=$(bd create "SDLC pipeline smoke test" -t feature \
  --description="Temporary test bead for spawn script validation." \
  --json 2>&1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "Parent: $TEST_ID"

# Run the spawn script
scripts/bd-sdlc-spawn.sh "$TEST_ID"

# Verify only impl is ready
READY=$(bd ready --json 2>&1)
echo "$READY" | grep -o '"title":"[^"]*"'
# Expected: only "impl: SDLC pipeline smoke test" appears
```

- [ ] **Step 1.4: Smoke test — chore bead is rejected**

```bash
CHORE_ID=$(bd create "dependency bump test" -t chore \
  --description="Test chore rejection." \
  --json 2>&1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

scripts/bd-sdlc-spawn.sh "$CHORE_ID" 2>&1
# Expected: "Error: bd-sdlc-spawn only applies to 'feature' and 'bug' beads."
# Expected exit code: 1

bd close "$CHORE_ID" --reason "smoke test cleanup"
```

- [ ] **Step 1.5: Clean up test parent**

```bash
# Close all children then parent (use the TEST_ID from step 1.3)
bd show "$TEST_ID" --children --json 2>&1 | \
  grep -o '"id":"[^"]*"' | cut -d'"' -f4 | \
  while read id; do bd close "$id" --reason "smoke test cleanup" 2>&1; done
bd close "$TEST_ID" --reason "smoke test cleanup"
```

- [ ] **Step 1.6: Commit**

```bash
git add scripts/bd-sdlc-spawn.sh
git commit -m "feat(sdlc): add bd-sdlc-spawn.sh to create SDLC pipeline for feature/bug beads"
```

---

## Chunk 2: Rewind Script

### Task 2: Write `scripts/bd-sdlc-rewind.sh`

**Files:**
- Create: `scripts/bd-sdlc-rewind.sh`

This script re-opens the correct stage beads when review or QA decides the work needs
to go back to implementation. It also logs the reason as a comment on the parent bead
so there's an audit trail. After rewind, `bd ready` surfaces the impl bead again and the
full pipeline re-runs from that point.

Rewind table:
| Called from stage | Re-opens |
|-------------------|----------|
| review (.N)       | impl (.N-1), review (.N) itself |
| qa (.N)           | impl (.N-2), review (.N-1), qa (.N) itself |

The script detects which stage it was called from by reading the bead's `stage:` label.

- [ ] **Step 2.1: Create the script file**

```bash
cat > scripts/bd-sdlc-rewind.sh << 'SCRIPT'
#!/usr/bin/env bash
# bd-sdlc-rewind.sh — Rewind SDLC pipeline from review or qa back to impl
# Usage: scripts/bd-sdlc-rewind.sh <stage-bead-id> "<reason>"
# Must be run from the repository root.

set -euo pipefail

STAGE_ID="${1:-}"
REASON="${2:-}"

if [[ -z "$STAGE_ID" || -z "$REASON" ]]; then
  echo "Usage: $0 <stage-bead-id> \"<reason>\"" >&2
  echo "  stage-bead-id: the review or qa bead that is rewinding (e.g., ScaledTest-abc.2)" >&2
  echo "  reason: why the rewind is happening (logged on parent)" >&2
  exit 1
fi

# Fetch the stage bead
STAGE_JSON=$(bd show "$STAGE_ID" --json 2>&1) || {
  echo "Error: bead '$STAGE_ID' not found" >&2
  exit 1
}

# Extract stage label (stage:review or stage:qa)
STAGE_LABEL=$(echo "$STAGE_JSON" | grep -o '"stage:[^"]*"' | head -1 | tr -d '"')
PARENT_ID=$(echo "$STAGE_JSON" | grep -o '"parent":"[^"]*"' | cut -d'"' -f4)

if [[ -z "$PARENT_ID" ]]; then
  echo "Error: '$STAGE_ID' has no parent bead — is this a stage child bead?" >&2
  exit 1
fi

if [[ "$STAGE_LABEL" != "stage:review" && "$STAGE_LABEL" != "stage:qa" ]]; then
  echo "Error: Rewind only applies to 'stage:review' or 'stage:qa' beads." >&2
  echo "  '$STAGE_ID' has label: '$STAGE_LABEL'" >&2
  exit 1
fi

# Find all siblings by listing parent's children
SIBLINGS=$(bd show "$PARENT_ID" --children --json 2>&1)

get_sibling_by_label() {
  local label="$1"
  echo "$SIBLINGS" | grep -B5 "\"$label\"" | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | head -1
}

IMPL_ID=$(get_sibling_by_label "stage:impl")
REVIEW_ID=$(get_sibling_by_label "stage:review")
QA_ID=$(get_sibling_by_label "stage:qa")

if [[ -z "$IMPL_ID" ]]; then
  echo "Error: could not find impl stage sibling under parent '$PARENT_ID'" >&2
  exit 1
fi

echo "Rewinding SDLC pipeline from $STAGE_LABEL ($STAGE_ID)"
echo "Reason: $REASON"
echo ""

# Re-open the appropriate beads
if [[ "$STAGE_LABEL" == "stage:review" ]]; then
  echo "Re-opening: $IMPL_ID (impl), $REVIEW_ID (review)"
  bd update "$IMPL_ID" --status open --quiet 2>&1
  bd update "$REVIEW_ID" --status open --quiet 2>&1

elif [[ "$STAGE_LABEL" == "stage:qa" ]]; then
  if [[ -z "$REVIEW_ID" ]]; then
    echo "Error: could not find review stage sibling under parent '$PARENT_ID'" >&2
    exit 1
  fi
  echo "Re-opening: $IMPL_ID (impl), $REVIEW_ID (review), $QA_ID (qa)"
  bd update "$IMPL_ID" --status open --quiet 2>&1
  bd update "$REVIEW_ID" --status open --quiet 2>&1
  bd update "$QA_ID" --status open --quiet 2>&1
fi

# Log rewind reason as a comment on the parent bead
bd comments add "$PARENT_ID" \
  "REWIND from $STAGE_LABEL: $REASON" 2>&1

echo ""
echo "Rewind complete. Run: bd ready   (impl bead $IMPL_ID will appear)"
SCRIPT
```

- [ ] **Step 2.2: Make it executable**

```bash
chmod +x scripts/bd-sdlc-rewind.sh
```

- [ ] **Step 2.3: Smoke test — review rewind re-opens impl and review**

```bash
# Spawn a test pipeline
TEST_ID=$(bd create "SDLC rewind smoke test" -t feature \
  --description="Temporary test bead for rewind validation." \
  --json 2>&1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
scripts/bd-sdlc-spawn.sh "$TEST_ID"

# Extract child IDs
IMPL_ID=$(bd show "$TEST_ID" --children --json 2>&1 | \
  grep -B2 'stage:impl' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
REVIEW_ID=$(bd show "$TEST_ID" --children --json 2>&1 | \
  grep -B2 'stage:review' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

# Simulate impl completing
bd close "$IMPL_ID" --reason "smoke test: impl done"

# Review should now be in ready
bd ready --json 2>&1 | grep -o '"title":"[^"]*"'
# Expected: "review: SDLC rewind smoke test"

# Trigger rewind from review
scripts/bd-sdlc-rewind.sh "$REVIEW_ID" "Logic error in auth handler"

# impl should be open again, review should be open again
bd show "$IMPL_ID" --json 2>&1 | grep '"status"'
# Expected: "open"
bd show "$REVIEW_ID" --json 2>&1 | grep '"status"'
# Expected: "open"

# bd ready should now show impl again
bd ready --json 2>&1 | grep -o '"title":"[^"]*"'
# Expected: "impl: SDLC rewind smoke test"
```

- [ ] **Step 2.4: Smoke test — qa rewind re-opens impl, review, and qa**

```bash
# (continuing from the test bead above)
# Complete impl and review again
bd close "$IMPL_ID" --reason "smoke test: impl done again"
QA_ID=$(bd show "$TEST_ID" --children --json 2>&1 | \
  grep -B2 'stage:qa' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
bd close "$REVIEW_ID" --reason "smoke test: review passed"

# QA should now be in ready
bd ready --json 2>&1 | grep -o '"title":"[^"]*"'
# Expected: "qa: SDLC rewind smoke test"

# Trigger rewind from qa
scripts/bd-sdlc-rewind.sh "$QA_ID" "Coverage dropped below threshold"

# All three should be open
bd show "$IMPL_ID" --json 2>&1 | grep '"status"'   # Expected: open
bd show "$REVIEW_ID" --json 2>&1 | grep '"status"' # Expected: open
bd show "$QA_ID" --json 2>&1 | grep '"status"'     # Expected: open
```

- [ ] **Step 2.5: Clean up test bead**

```bash
bd show "$TEST_ID" --children --json 2>&1 | \
  grep -o '"id":"[^"]*"' | cut -d'"' -f4 | \
  while read id; do bd close "$id" --reason "smoke test cleanup" 2>&1 || true; done
bd close "$TEST_ID" --reason "smoke test cleanup"
```

- [ ] **Step 2.6: Commit**

```bash
git add scripts/bd-sdlc-rewind.sh
git commit -m "feat(sdlc): add bd-sdlc-rewind.sh to rewind pipeline from review or qa"
```

---

## Chunk 3: PR Stage Gate Script

### Task 3: Write `scripts/bd-sdlc-pr.sh`

**Files:**
- Create: `scripts/bd-sdlc-pr.sh`

The pr agent calls this script instead of manually orchestrating the PR lifecycle.
It handles: create PR → enable auto-merge → poll for Copilot comments → resolve
comments → wait for merge → register `gh:pr` gate → close the pr bead.

Requires `gh` CLI authenticated and `GH_REPO` environment variable or auto-detection
from `git remote`.

- [ ] **Step 3.1: Create the script file**

```bash
cat > scripts/bd-sdlc-pr.sh << 'SCRIPT'
#!/usr/bin/env bash
# bd-sdlc-pr.sh — Manage PR lifecycle for the pr stage of an SDLC pipeline
# Usage: scripts/bd-sdlc-pr.sh <pr-bead-id> "<PR title>" "<PR body>"
# Must be run from the repository root on the feature branch.
# Requires: gh CLI authenticated, on a non-main branch with commits to push.

set -euo pipefail

PR_BEAD_ID="${1:-}"
PR_TITLE="${2:-}"
PR_BODY="${3:-}"

if [[ -z "$PR_BEAD_ID" || -z "$PR_TITLE" ]]; then
  echo "Usage: $0 <pr-bead-id> \"<PR title>\" \"<PR body>\"" >&2
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" == "main" ]]; then
  echo "Error: must be on a feature branch, not main." >&2
  exit 1
fi

echo "Creating PR for bead $PR_BEAD_ID on branch $CURRENT_BRANCH"

# Push the branch
git push -u origin "$CURRENT_BRANCH"

# Create PR and capture URL + number
PR_JSON=$(gh pr create \
  --title "$PR_TITLE" \
  --body "$PR_BODY" \
  --base main \
  --json url,number 2>&1)
PR_URL=$(echo "$PR_JSON" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
PR_NUMBER=$(echo "$PR_JSON" | grep -o '"number":[0-9]*' | cut -d: -f2)

echo "PR created: $PR_URL"

# Enable auto-merge (merges when CI passes and no blocking reviews)
gh pr merge "$PR_NUMBER" --auto --squash
echo "Auto-merge enabled."

# Poll loop: check for Copilot review comments and CI status
MAX_ATTEMPTS=60   # 60 × 30s = 30 minutes max
ATTEMPT=0

while [[ $ATTEMPT -lt $MAX_ATTEMPTS ]]; do
  ATTEMPT=$((ATTEMPT + 1))
  echo "Poll $ATTEMPT/$MAX_ATTEMPTS — checking PR state..."

  PR_STATE=$(gh pr view "$PR_NUMBER" --json state,mergedAt,reviewRequests,reviews \
    --jq '{state: .state, mergedAt: .mergedAt, reviews: [.reviews[] | {author: .author.login, state: .state, body: .body}]}' 2>&1)

  MERGED_AT=$(echo "$PR_STATE" | grep -o '"mergedAt":"[^"]*"' | cut -d'"' -f4)
  PR_OPEN_STATE=$(echo "$PR_STATE" | grep -o '"state":"[^"]*"' | cut -d'"' -f4)

  # Check if merged
  if [[ "$PR_OPEN_STATE" == "MERGED" || -n "$MERGED_AT" ]]; then
    echo "PR merged!"
    break
  fi

  # Check if closed without merge (e.g., manually closed)
  if [[ "$PR_OPEN_STATE" == "CLOSED" ]]; then
    echo "Error: PR was closed without merging. Investigate before retrying." >&2
    exit 1
  fi

  # Check for CHANGES_REQUESTED reviews (Copilot or others)
  CHANGES_REQUESTED=$(echo "$PR_STATE" | grep -o '"state":"CHANGES_REQUESTED"' | wc -l | tr -d ' ')
  if [[ "$CHANGES_REQUESTED" -gt 0 ]]; then
    echo "Review requested changes. Extracting comments..."
    gh pr view "$PR_NUMBER" --json reviews \
      --jq '.reviews[] | select(.state=="CHANGES_REQUESTED") | "Reviewer: \(.author.login)\n\(.body)"'
    echo ""
    echo "ACTION REQUIRED: Address the review comments above, push fixes, then this script"
    echo "will automatically detect the update and continue polling."
    echo "  Edit the relevant files, then:"
    echo "  git add -A && git commit -m 'fix: address review comments' && git push"
    echo ""
    echo "Waiting 30s for you to push fixes..."
  fi

  sleep 30
done

if [[ $ATTEMPT -ge $MAX_ATTEMPTS ]]; then
  echo "Error: PR did not merge within 30 minutes. Check CI status:" >&2
  echo "  gh pr view $PR_NUMBER" >&2
  exit 1
fi

# Register gh:pr gate and immediately resolve it (PR already merged)
# Close the pr bead now that the PR has merged
bd close "$PR_BEAD_ID" --reason "PR $PR_NUMBER merged into main: $PR_URL"
echo ""
echo "Bead $PR_BEAD_ID closed. Parent molecule will auto-close if all siblings are done."
SCRIPT
```

- [ ] **Step 3.2: Make it executable**

```bash
chmod +x scripts/bd-sdlc-pr.sh
```

- [ ] **Step 3.3: Verify gh CLI is available and authenticated**

```bash
gh auth status 2>&1
# Expected: shows authenticated account — if not, run: gh auth login
```

- [ ] **Step 3.4: Commit**

```bash
git add scripts/bd-sdlc-pr.sh
git commit -m "feat(sdlc): add bd-sdlc-pr.sh to manage PR lifecycle with auto-merge and Copilot resolution"
```

---

## Chunk 4: Agent Instructions

### Task 4: Update AGENTS.md with SDLC workflow section

**Files:**
- Modify: `AGENTS.md`

Add a dedicated SDLC section that gives agents clear, unambiguous instructions for
each stage. The spawn script call is documented as a hard prerequisite — no exceptions.

- [ ] **Step 4.1: Append the SDLC section to AGENTS.md**

Open `AGENTS.md` and append the following block before the final line (`Use 'bd' for task tracking`):

```markdown
---

## SDLC Pipeline (Feature and Bug Beads)

**When you pick up a `feature` or `bug` bead, your MANDATORY first action is:**

```bash
scripts/bd-sdlc-spawn.sh <bead-id>
```

Do this before any planning, exploration, or code changes. The script creates the
pipeline and validates the bead type. Work only on what `bd ready` surfaces next.

---

### Stage: `impl:` — Implementation

You are a **TDD-first implementer**.

1. Understand the parent bead's description fully before writing a line of code.
2. Write **failing tests first** — no production code until you have a red test.
3. Implement the minimal code to make the tests pass.
4. Run `make test` — it must be green before you close this stage.
5. Fix any issues you notice in your own work before closing.
6. Close: `bd close <impl-bead-id> --reason "Tests passing, implementation complete"`

**Never skip the red-green cycle. Never write production code without a test.**

---

### Stage: `review:` — Agent Code Review

You are a **skeptical code reviewer**.

1. Run `git diff main` — read every changed line carefully.
2. Check for: logic errors, security issues, missing error handling, edge cases,
   unclear naming, dead code, inconsistency with surrounding patterns.
3. **Fix minor issues in-place:** rename, small refactors, missing null checks — push and close.
4. **Rewind for serious issues:** logic errors, security vulnerabilities, architectural
   mismatches, or anything requiring more than 2-3 file changes:
   ```bash
   scripts/bd-sdlc-rewind.sh <review-bead-id> "<specific reason>"
   ```
5. Close: `bd close <review-bead-id> --reason "Review passed"`

**When in doubt, rewind. False positives cost one loop. False negatives cost a production incident.**

---

### Stage: `qa:` — Quality Pass

You are a **quality auditor**.

1. Run the full test suite: `make test`
2. Run E2E tests: check `package.json` or `Makefile` for the Playwright command.
3. Check test coverage — it must not have regressed from before your changes.
4. Look for: missing error paths, hardcoded values, performance regressions,
   tests that only test the happy path.
5. **Fix minor gaps in-place:** add the missing test, fix the hardcoded value — push and close.
6. **Rewind for systemic issues:** coverage regression, multiple missing test paths,
   or issues that require implementation rework:
   ```bash
   scripts/bd-sdlc-rewind.sh <qa-bead-id> "<specific reason>"
   ```
7. Close: `bd close <qa-bead-id> --reason "QA passed, coverage acceptable"`

**Coverage regressions are always a rewind. No exceptions.**

---

### Stage: `pr:` — PR and Merge Gate

You are an **integration agent**.

1. Ensure you are on the correct feature branch (not `main`).
2. Run the PR script — it handles everything:
   ```bash
   scripts/bd-sdlc-pr.sh <pr-bead-id> "<PR title>" "<PR body summary>"
   ```
3. If the script pauses asking you to address review comments: read the comments,
   fix the issues in code, then push:
   ```bash
   git add -A && git commit -m "fix: address review comments" && git push
   ```
   The script will detect the push and continue.
4. The script closes the bead automatically when the PR merges.

**Do not close the pr bead manually. The script handles it.**

---

### Lightweight Beads (`task`, `chore`, `decision`)

No pipeline. Work directly on the parent bead. Close when the work is committed and pushed.

```bash
bd close <bead-id> --reason "Done — <brief summary>"
```
```

- [ ] **Step 4.2: Verify AGENTS.md is well-formed**

```bash
# Check it has all 4 stage sections
grep -c "### Stage:" AGENTS.md
# Expected: 4
```

- [ ] **Step 4.3: Commit**

```bash
git add AGENTS.md
git commit -m "docs(sdlc): add SDLC pipeline agent instructions to AGENTS.md"
```

---

## Chunk 5: PRIME.md and Claude Code Hook

### Task 5: Create PRIME.md and install the Claude Code SessionStart hook

**Files:**
- Create: `PRIME.md`
- Modify: `.claude/settings.json` (via `bd setup claude`)

PRIME.md is injected at every Claude Code session start via `bd prime`. It gives the agent
a compact reminder of the SDLC rules without requiring them to re-read AGENTS.md in full.
`bd setup claude` installs the hook that calls `bd prime` automatically.

- [ ] **Step 5.1: Create PRIME.md**

```bash
cat > PRIME.md << 'EOF'
# ScaledTest SDLC — Session Start Checklist

## What you are working on

Check what's ready: `bd ready --json`

## If you just picked up a `feature` or `bug` bead

Run this FIRST — before anything else:
```bash
scripts/bd-sdlc-spawn.sh <bead-id>
```

Then work only on what `bd ready` surfaces.

## Your current stage persona

| Title prefix | You are | Key rule |
|-------------|---------|----------|
| `impl:` | TDD implementer | Write failing test FIRST. `make test` must be green before close. |
| `review:` | Skeptical reviewer | Read the full diff. Rewind for logic/security/arch issues. |
| `qa:` | Quality auditor | Full suite + coverage check. Rewind if coverage drops. |
| `pr:` | Integration agent | Run `scripts/bd-sdlc-pr.sh`. Do not close manually. |

## Rewind (review or qa only)

```bash
scripts/bd-sdlc-rewind.sh <stage-bead-id> "<reason>"
```

## Landing the plane (mandatory before ending session)

1. File issues for unfinished work
2. Run quality gates if code changed
3. `git pull --rebase && bd sync && git push`
4. Confirm `git status` shows "up to date with origin"
EOF
```

- [ ] **Step 5.2: Install the Claude Code SessionStart hook**

```bash
bd setup claude --project 2>&1
# Expected: installs hook that runs 'bd prime' at session start
```

If `--project` is not available, use global:
```bash
bd setup claude 2>&1
```

- [ ] **Step 5.3: Verify the hook was installed**

```bash
bd setup claude --check 2>&1
# Expected: shows hook as installed
```

- [ ] **Step 5.4: Verify `bd prime` works**

```bash
bd prime 2>&1
# Expected: outputs the contents of PRIME.md
```

- [ ] **Step 5.5: Commit**

```bash
git add PRIME.md
git add .claude/ 2>/dev/null || true  # if settings.json was modified
git commit -m "feat(sdlc): add PRIME.md and install bd prime SessionStart hook for Claude Code"
```

---

## Chunk 6: End-to-End Validation

### Task 6: Full pipeline walkthrough with a real test bead

**Files:** none — validation only

Run the complete SDLC pipeline end-to-end with a real (but trivial) feature bead to
confirm every stage, dependency, and rewind works as designed before using this in
production.

- [ ] **Step 6.1: Create a validation feature bead**

```bash
VALIDATION_ID=$(bd create "sdlc-validation: add hello endpoint" -t feature \
  --description="Validation bead — adds a trivial /hello endpoint to confirm the SDLC pipeline works end-to-end." \
  --json 2>&1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "Validation bead: $VALIDATION_ID"
```

- [ ] **Step 6.2: Spawn the pipeline**

```bash
scripts/bd-sdlc-spawn.sh "$VALIDATION_ID"
bd ready --json 2>&1 | grep -o '"title":"[^"]*"'
# Expected: only impl bead visible
```

- [ ] **Step 6.3: Claim and simulate impl stage**

```bash
IMPL_ID=$(bd ready --json 2>&1 | grep '"impl:' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
bd update "$IMPL_ID" --claim
# (Simulate implementation work)
bd close "$IMPL_ID" --reason "validation: impl done"
```

- [ ] **Step 6.4: Confirm review is now ready**

```bash
bd ready --json 2>&1 | grep -o '"title":"[^"]*"'
# Expected: only review bead visible
```

- [ ] **Step 6.5: Simulate a rewind from review**

```bash
REVIEW_ID=$(bd ready --json 2>&1 | grep '"review:' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
bd update "$REVIEW_ID" --claim
scripts/bd-sdlc-rewind.sh "$REVIEW_ID" "validation: testing rewind mechanism"

bd ready --json 2>&1 | grep -o '"title":"[^"]*"'
# Expected: impl bead visible again
```

- [ ] **Step 6.6: Complete impl → review → qa in sequence**

```bash
IMPL_ID=$(bd ready --json 2>&1 | grep '"impl:' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
bd close "$IMPL_ID" --reason "validation: impl done (pass 2)"

REVIEW_ID=$(bd ready --json 2>&1 | grep '"review:' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
bd close "$REVIEW_ID" --reason "validation: review passed"

QA_ID=$(bd ready --json 2>&1 | grep '"qa:' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
bd close "$QA_ID" --reason "validation: qa passed"

bd ready --json 2>&1 | grep -o '"title":"[^"]*"'
# Expected: only pr bead visible
```

- [ ] **Step 6.7: Clean up the validation bead**

```bash
PR_ID=$(bd ready --json 2>&1 | grep '"pr:' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
bd close "$PR_ID" --reason "validation cleanup — skipping actual PR"
bd close "$VALIDATION_ID" --reason "validation complete"
```

- [ ] **Step 6.8: Final commit — update design doc with implementation notes**

```bash
git add docs/superpowers/specs/2026-03-10-sdlc-beads-design.md 2>/dev/null || true
git commit --allow-empty -m "chore(sdlc): pipeline validation complete — SDLC beads workflow ready for use"
```

---

## Summary of Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `scripts/bd-sdlc-spawn.sh` | Create | Spawns 4-stage SDLC molecule for feature/bug beads |
| `scripts/bd-sdlc-rewind.sh` | Create | Rewinds pipeline from review or qa back to impl |
| `scripts/bd-sdlc-pr.sh` | Create | Manages PR lifecycle: create, auto-merge, Copilot resolution |
| `AGENTS.md` | Modify | Per-stage agent personas and SDLC workflow rules |
| `PRIME.md` | Create | Compact session-start reminder injected by bd prime hook |
| `.claude/settings.json` | Modify (via bd) | SessionStart hook to run bd prime automatically |

## Quick Reference for Agents

```bash
# Start any feature or bug bead:
scripts/bd-sdlc-spawn.sh <bead-id>

# See what to work on next:
bd ready

# Claim your stage:
bd update <stage-bead-id> --claim

# Rewind from review or qa:
scripts/bd-sdlc-rewind.sh <stage-bead-id> "<reason>"

# Handle the PR stage:
scripts/bd-sdlc-pr.sh <pr-bead-id> "<title>" "<body>"
```

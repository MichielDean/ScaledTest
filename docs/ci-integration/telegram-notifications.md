# Telegram CI Health Notifications

`ci-notify` is a CLI binary that posts a formatted CI run summary to a Telegram chat after every main-branch push. It parses `go test -json` output and sends an HTML-formatted message via the Telegram Bot API.

## How it works

1. The main-branch GitHub Actions workflow runs `go vet` and `go test -json`, writing results to `test-results.json`.
2. After tests complete (even on vet/test failure), `ci-notify` reads the results file and sends a summary to the configured Telegram chat.
3. If `test-results.json` is absent (e.g. vet aborted the run), `ci-notify` sends a failure notification with zero test counts so the team is never left in the dark.

## Prerequisites

1. A Telegram bot token — create a bot via [@BotFather](https://t.me/botfather) and copy the token.
2. A Telegram chat ID — the bot must be a member of the target chat/channel. Use `@userinfobot` or the Telegram API to find the ID.

## GitHub Actions setup

Add two repository secrets:

| Secret | Value |
|--------|-------|
| `TELEGRAM_BOT_TOKEN` | Your bot token (e.g. `123456:ABC-DEF...`) |
| `TELEGRAM_CHAT_ID` | Target chat/channel ID (e.g. `-1001234567890`) |

The workflow at `.github/workflows/mainBranch.yml` is already configured to read these secrets and invoke `ci-notify` on every push to `main`.

## Environment variables

`ci-notify` reads all configuration from the environment. When invoked from the workflow these are set automatically.

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token. If unset, the tool exits silently without error. |
| `TELEGRAM_CHAT_ID` | Yes | Target chat or channel ID. If unset, the tool exits silently without error. |
| `CI_REPO` | No | Repository name shown in the message (e.g. `org/repo`). |
| `CI_BRANCH` | No | Branch name (e.g. `main`). |
| `CI_COMMIT_SHA` | No | Full commit SHA — the first 7 characters are displayed. |
| `CI_COMMIT_MSG` | No | Commit message — only the first line is shown, truncated to 80 characters. |
| `CI_RUN_URL` | No | URL to the CI run; rendered as a "View run" link. |
| `CI_STATUS` | No | Override the derived status: `"passing"` or `"failing"`. When set, this takes precedence over the failed-test count. |

## CLI usage

```bash
# Read results from a file
go run ./cmd/ci-notify -results test-results.json

# Read results from stdin
go test -json ./... | go run ./cmd/ci-notify

# Build the binary first
go build -o ci-notify ./cmd/ci-notify
./ci-notify -results test-results.json
```

**Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `-results` | *(stdin)* | Path to a `go test -json` output file. If omitted, reads from stdin. |

## Message format

Messages are sent in Telegram HTML parse mode. A passing run looks like:

```
✅ org/repo — PASSING
Branch: main  Commit: abc1234
💬 feat: add new feature

🧪 Tests: 42 passed, 2 skipped / 44 total

View run
```

A failing run:

```
❌ org/repo — FAILING
Branch: main  Commit: def5678
💬 fix: broken query

🧪 Tests: 38 passed, 4 failed / 42 total

View run
```

All external fields (`CI_REPO`, `CI_BRANCH`, `CI_COMMIT_MSG`) are HTML-escaped before interpolation to prevent invalid HTML from breaking the Telegram API call.

## Graceful degradation

- **Missing results file**: if `-results` points to a non-existent file, `ci-notify` sends a notification with zero test counts (using `CI_STATUS` to determine pass/fail). This ensures a notification always fires even when `go vet` aborts the run before tests execute.
- **Missing credentials**: if `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is unset, the tool prints a warning to stderr and exits successfully — it will not fail the build.

## The main-branch workflow

The workflow at `.github/workflows/mainBranch.yml` demonstrates the recommended setup:

```yaml
- name: Go vet
  id: go-vet
  continue-on-error: true   # vet failure must not skip the test step
  run: go vet ./...

- name: Run tests
  id: go-test
  continue-on-error: true   # test failure must not skip the notification step
  run: go test -json ./... > test-results.json

- name: Send Telegram notification
  if: always()
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
    CI_REPO: ${{ github.repository }}
    CI_BRANCH: ${{ github.ref_name }}
    CI_COMMIT_SHA: ${{ github.sha }}
    CI_COMMIT_MSG: ${{ github.event.head_commit.message }}
    CI_RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
    CI_STATUS: ${{ (steps.go-vet.outcome == 'success' && steps.go-test.outcome == 'success') && 'passing' || 'failing' }}
  run: go run ./cmd/ci-notify -results test-results.json

- name: Fail if vet or tests failed
  if: steps.go-vet.outcome == 'failure' || steps.go-test.outcome == 'failure'
  run: exit 1
```

`continue-on-error: true` on both `go-vet` and `go-test` ensures the notification step always runs. The explicit `CI_STATUS` expression captures vet failures that would otherwise be invisible to `ci-notify` (since vet doesn't affect `test-results.json`). The final step re-raises the failure so the overall workflow still reports red.

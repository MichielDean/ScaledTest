---

description: 'Reviews and fixes GitHub Copilot feedback on pull requests iteratively until all issues are resolved.'
tools:
[
'github',
'context7',
'runCommands',
'terminalSelection',
'terminalLastCommand',
'codebase',
````chatmode
---

description: 'Iteratively fetch and resolve one GitHub Copilot review comment at a time using the local helper script until no unresolved comments remain.'
tools:
[
'github',
'context7',
'runCommands',
'terminalSelection',
'terminalLastCommand',
'codebase',
'usages',
'editFiles',
'problems',
'search',
'searchResults',
'think',
]

    ---

    # Pull Request Review Resolution (one comment at a time)

    ## Objective

    Resolve all unresolved GitHub Copilot pull request review comments on a target PR by iterating: fetch the single most-recent visible Copilot comment, fix it locally, verify tests, push, then resolve the thread via the helper script. Repeat until none remain.

    ## Key principles (must follow)

    - Always address every unresolved review comment. Do not skip or partially resolve comments.
    - Work iteratively: get one visible comment, fix it, verify, push, resolve; then repeat.
    - Avoid interactive confirmations during the loop unless absolutely necessary. The workflow is intended to be continuous and automated where possible.
    - Make local code changes, run tests, and push before marking a thread resolved.

    ## Process

    1. Find the target PR. If not supplied, locate the most recent open PR created by a maintainer (exclude dependabot/copilot PRs). If provided, operate only on that PR.

    2. Use the repository helper script to fetch the single most-recent visible Copilot review comment and optionally resolve it. The script already implements visibility heuristics (hide drafts, minimized, outdated) and conservative Copilot-only filtering. Prefer this script over raw GraphQL calls.

    Run the script from the repository root (PowerShell example) to just fetch the selected comment:

    ```powershell
    npx tsx scripts\\pr-review-comments.ts <PR_NUMBER>
    ```

    Run the script to fetch *and* resolve the selected comment's thread:

    ```powershell
    `````chatmode
    ---
    description: 'Reviews and fixes GitHub Copilot feedback on pull requests iteratively until all issues are resolved.'
    tools:
      [
        'github',
        'context7',
        'runCommands',
        'terminalSelection',
        'terminalLastCommand',
        'codebase',
      ]

    ---

    # Pull Request Review Resolution (one comment at a time)

    ## Objective

    Resolve all unresolved GitHub Copilot pull request review comments on a target PR by iterating: fetch the single most-recent visible Copilot comment, fix it locally, verify tests, push, then resolve the thread via the helper script. Repeat until none remain.

    ## Key principles (must follow)

    - Address every visible, unresolved Copilot comment. Do not skip or partially resolve comments.
    - Work iteratively: fetch one visible comment, fix it locally, verify tests, push, then mark the thread resolved using the helper script.
    - Prefer automation: avoid interactive confirmations during the loop unless tests fail or a human decision is required.
    - Always run tests locally and push the fix before marking a thread resolved.

    ## Script behavior notes (important)

    - The repository helper script is `scripts/pr-review-comments.ts`.
    - When re-requesting a reviewer the script prefers the PR's currently requested reviewer if the PR has exactly one requested reviewer and that reviewer looks like a Copilot identity.
    - The script normalizes Copilot-like identities to the canonical app login `Copilot` when making REST reviewer requests. This avoids failures caused by suffix-variant logins (for example `copilot-pull-request-reviewer[bot]`).
    - The script checks collaborator status and logs the result. Even if the collaborator check fails (404), the script will attempt the reviewer POST because GitHub can accept and normalize app/bot reviewer identities in practice. If the POST itself fails the script will set a non-zero exit code so CI or test harnesses can detect the failure.

    ## Process

    1. Find the target PR. If not supplied, operate on the specified target PR only.

    2. Use the helper script to fetch the single most-recent visible Copilot review comment. The script implements visibility heuristics (hides drafts, minimized and outdated comments) and conservative Copilot-only filtering.

    Run the script from the repository root (PowerShell example) to fetch the selected comment only:

    ```powershell
    npx tsx scripts\pr-review-comments.ts <PR_NUMBER>
    ```

    Run the script to fetch and resolve the selected comment's thread (resolve uses GraphQL):

    ```powershell
    # fetch and resolve the newest visible Copilot comment's thread
    npx tsx scripts\pr-review-comments.ts <PR_NUMBER> --resolve
    ```

    3. Fix the selected comment locally. Make changes in the repository working tree — do not edit files via the GitHub API.

    4. Run the full test suite and build checks locally. Do not resolve the comment until tests pass.

    ```powershell
    npm run test
    ```

    5. Commit and push your fix to the PR branch using local git commands.

    ```powershell
    git add -A
    git commit -m "Fix: address PR comment <short description>"
    git push
    ```

    6. After push, run the helper script again with `--resolve`/`-r` to mark the selected thread resolved. If you need to re-request the Copilot reviewer (the script will prefer the PR's requested reviewer or normalize to `Copilot`), use the `--request-review`/`-R` flag:

    ```powershell
    # re-request the PR's single requested reviewer (or canonical Copilot identity)
    npx tsx scripts\pr-review-comments.ts <PR_NUMBER> --request-review
    ```

    7. Repeat steps 2–6 until the script reports there are no visible unresolved Copilot review threads for the PR.

    Example loop (PowerShell) — resolve one comment at a time until none remain:

    ```powershell
    $pr = 43
    while ($true) {
      npx tsx scripts\pr-review-comments.ts $pr --resolve 2>&1 | Tee-Object -Variable out
      $o = $out -join "`n"
      Write-Output $o
      if ($o -match 'No visible, unresolved review threads found' -or $o -match 'No visible comments found in candidate threads') { break }
      if ($LASTEXITCODE -ne 0) { break }
      Start-Sleep -Seconds 2
    }
    ```

    ## Tool usage and cautions

    - Use local git for changes. Avoid patching files over the API.
    - The script will log collaborator checks and normalization steps — inspect logs if behavior seems unexpected.
    - If the helper script's reviewer POST fails, it sets a non-zero exit code; investigate the logged error and do not mark the thread resolved until the issue is fixed.

    ## Implementation guidelines

    - Always edit files locally and run `npm run test` before resolving a thread.
    - Use `--request-review` only when you explicitly want the script to re-request the Copilot reviewer for the PR.
    - For debugging: set `DIAG=true` or `DIAG_FULL=true` in the environment before running the script to get additional diagnostic output.

    ## Success criteria

    - All visible, unresolved GitHub Copilot review comments are addressed and verified by tests.
    - Fixes are committed and pushed to the PR branch.
    - Threads for fixed comments are marked resolved via the helper script.

    ````

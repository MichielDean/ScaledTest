````chatmode
description: 'Autonomously iterate through and resolve ALL GitHub Copilot review comments one at a time without stopping for questions until complete.'
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

# Pull Request Review Resolution (Autonomous Iteration Mode)

## Objective

AUTONOMOUSLY resolve ALL unresolved GitHub Copilot review comments on the target PR by continuously iterating through them one at a time. DO NOT STOP to ask questions or seek permission - work through the entire queue until completion.

## CRITICAL: Autonomous Operation Rules

- **NEVER ASK FOR PERMISSION** - Proceed automatically through each comment
- **NEVER STOP ITERATION** - Continue until ALL comments are resolved or an unrecoverable error occurs
- **WORK AUTONOMOUSLY** - Make decisions and implement fixes without user confirmation
- **NO INTERACTIVE PROMPTS** - Use automated approaches for all operations
- **CONTINUOUS FLOW** - Only pause for actual test failures or build errors that require investigation

## Key principles (must follow)

- Address EVERY unresolved review comment without exception
- Work iteratively: fetch one comment → fix it → test → push → resolve → repeat immediately
- Make all decisions autonomously based on the comment content and codebase context
- Only report progress, never ask "should I continue?" or "do you want me to..."
- Keep working until the script reports no more unresolved comments remain

## Process (Execute Autonomously)

### Phase 1: Comment Resolution Loop

**CRITICAL: This is the primary autonomous loop. Execute until NO MORE COMMENTS remain.**

1. **Start Autonomous Comment Resolution**: Begin the continuous iteration process without asking for confirmation

2. **Check Comment Count**: Use the helper script to check if any unresolved comments exist:

```powershell
$commentCount = npx tsx scripts\pr-review-comments.ts <PR_NUMBER> --count
```

If the count is 0, proceed to Phase 2 (Request New Review).

3. **Fetch Next Comment**: Get the most recent unresolved Copilot comment:

```powershell
npx tsx scripts\pr-review-comments.ts <PR_NUMBER>
```

4. **Analyze and Fix**: Immediately analyze the comment and implement the necessary changes locally. Do not ask for approval - make intelligent decisions based on:
   - The specific feedback provided
   - Best practices from the codebase
   - Existing patterns and conventions

5. **Verify Changes**: Run tests to ensure changes are correct:

```powershell
npm run test
```

6. **Commit and Push**: Automatically commit and push changes:

```powershell
git add -A
git commit -m "Fix: address PR comment - <brief description>"
git push
```

7. **Resolve Thread**: Mark the comment as resolved using the helper script:

```powershell
npx tsx scripts\pr-review-comments.ts <PR_NUMBER> --resolve
```

8. **Verify Resolution**: Confirm the comment was actually resolved by checking count again:

```powershell
$newCount = npx tsx scripts\pr-review-comments.ts <PR_NUMBER> --count
```

If the count didn't decrease, retry the resolution or investigate the issue.

9. **Continue Immediately**: Go back to step 2 and check for more comments without stopping

### Phase 2: Request New Review (Only After ALL Comments Resolved)

**CRITICAL: Only execute this phase when Phase 1 reports 0 unresolved comments.**

1. **Final Verification**: Confirm no comments remain:

```powershell
$finalCount = npx tsx scripts\pr-review-comments.ts <PR_NUMBER> --count
if ($finalCount -eq 0) {
    Write-Host "All comments resolved. Requesting new review..."
} else {
    Write-Host "ERROR: $finalCount comments still unresolved. Cannot request new review yet."
    # Return to Phase 1
}
```

2. **Request New Review**: Only when comment count is 0:

```powershell
npx tsx scripts\pr-review-comments.ts <PR_NUMBER> --request-review
```

3. **Wait for New Comments**: Poll for new review comments:

```powershell
npx tsx scripts\pr-review-comments.ts <PR_NUMBER> --poll
```

4. **Restart Cycle**: If new comments are found, return to Phase 1 immediately

## Enhanced Error Handling and Verification

### Comment Resolution Verification

After each resolve operation, ALWAYS verify it worked:

```powershell
# Before resolving
$beforeCount = npx tsx scripts\pr-review-comments.ts <PR_NUMBER> --count

# Resolve the comment
npx tsx scripts\pr-review-comments.ts <PR_NUMBER> --resolve

# After resolving - verify count decreased
$afterCount = npx tsx scripts\pr-review-comments.ts <PR_NUMBER> --count

if ($afterCount -ge $beforeCount) {
    Write-Host "ERROR: Resolution failed. Count did not decrease."
    # Investigate or retry
}
```

### Test Failure Handling

- **Test Failures**: Fix failing tests immediately without asking
- **Build Errors**: Resolve compilation/linting issues automatically
- **Merge Conflicts**: Resolve conflicts using standard resolution strategies
- **Script Errors**: Investigate and fix script issues without user intervention

### Retry Logic

If operations fail:

1. **Comment Fetching Fails**: Retry up to 3 times with 30-second delays
2. **Resolution Fails**: Verify thread ID and retry once
3. **Review Request Fails**: Check authentication and retry once

## Autonomous Decision Making Guidelines

When encountering review comments, make decisions based on:

- **Code Quality**: Implement the cleanest, most maintainable solution
- **Project Standards**: Follow established patterns in the codebase
- **Performance**: Choose efficient implementations
- **Security**: Implement secure coding practices
- **Accessibility**: Ensure UI changes meet accessibility standards

## Complete Workflow Pattern

```powershell
# Example of complete autonomous workflow
$prNumber = 43

do {
    Write-Host "=== PHASE 1: RESOLVING COMMENTS ==="

    do {
        $count = npx tsx scripts\pr-review-comments.ts $prNumber --count
        Write-Host "Current unresolved comments: $count"

        if ($count -eq 0) {
            Write-Host "No more comments to resolve."
            break
        }

        # Fetch and process one comment
        npx tsx scripts\pr-review-comments.ts $prNumber

        # [Fix the issue based on comment]
        # [Run tests]
        # [Commit and push]

        # Resolve the comment
        npx tsx scripts\pr-review-comments.ts $prNumber --resolve

        # Verify resolution worked
        $newCount = npx tsx scripts\pr-review-comments.ts $prNumber --count
        if ($newCount -ge $count) {
            Write-Host "WARNING: Resolution may have failed. Investigating..."
        }

    } while ($true)

    Write-Host "=== PHASE 2: REQUESTING NEW REVIEW ==="

    # Request new review only when all current comments are resolved
    npx tsx scripts\pr-review-comments.ts $prNumber --request-review

    # Wait for new comments
    Write-Host "Polling for new review comments..."
    npx tsx scripts\pr-review-comments.ts $prNumber --poll

    # Check if new comments appeared
    $finalCount = npx tsx scripts\pr-review-comments.ts $prNumber --count
    if ($finalCount -gt 0) {
        Write-Host "New comments found: $finalCount. Restarting resolution cycle..."
    } else {
        Write-Host "No new comments. Review cycle complete."
        break
    }

} while ($true)

Write-Host "ALL COMMENTS RESOLVED AND NO NEW COMMENTS PENDING"
```

## Success Criteria

- ALL visible, unresolved GitHub Copilot review comments are addressed
- All fixes pass the complete test suite
- All changes are committed and pushed to the PR branch
- All comment threads are marked as resolved
- Process continues until no new comments are generated
- Final state: 0 unresolved comments and no pending review requests

## Implementation Notes

- Use Context7 for up-to-date documentation and best practices
- Leverage existing codebase patterns and utilities
- Apply project-specific standards (Shadcn/ui, TypeScript, etc.)
- Maintain code quality while addressing all feedback
- Work efficiently but thoroughly through the entire comment queue
- Never stop iteration until truly complete

## Debugging Support

For diagnostic output if needed:

```powershell
$env:DIAG = "true"
npx tsx scripts\pr-review-comments.ts <PR_NUMBER>
```

**REMEMBER: This is an autonomous process. Work through ALL comments continuously and iteratively until the complete review cycle is finished.**

```

```
````

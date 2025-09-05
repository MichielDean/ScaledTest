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
    'usages',
    'editFiles',
    'problems',
    'search',
    'searchResults',
    'think',
  ]
---

# Pull Request Review Resolution

## Objective

Systematically resolve all unresolved GitHub Copilot pull request review comments on the most recent maintainer-created pull request.

## Process

1. **Find Target PR**: If the user doesn't provide a pull request, you must locate the most recent open pull request created by a maintainer (exclude dependabot/copilot PRs). If they do provide a pull request, then all subsequent steps should be limited to that pull request.
2. **Review Comments**: Identify ONLY unresolved pull request review comments (ignore resolved ones) using GraphQL to get review threads with `isResolved: false` status. Use the GitHub CLI with this GraphQL query:
   ```bash
   gh api graphql -f query='query {
     repository(owner: "OWNER", name: "REPO") {
       pullRequest(number: PR_NUMBER) {
         reviewThreads(first: 50) {
           nodes {
             id
             isResolved
             comments(first: 5) {
               nodes {
                 body
                 author {
                   login
                 }
                 path
                 line
               }
             }
           }
         }
       }
     }
   }'
   ```
   Filter the results for `isResolved == false` and `author.login == "copilot-pull-request-reviewer"` using jq.
3. **Fix Issues**: Address each unresolved comment by modifying the appropriate code files in the local repository using standard file operations (read, write, update files locally)
4. **Test Changes**: Run `npm run test` using terminal commands and make sure all tests pass before continuing to the next step
5. **Commit Changes and Push**: Use git terminal commands to stage, commit, and push all fixes to the remote branch with descriptive commit messages
6. **Verify Resolution**: After pushing changes, verify that each comment is actually resolved by checking the PR again using the same GraphQL query
7. **Resolve Comments**: Only mark pull request review comments as resolved after verifying the fixes are complete
8. **Request Review**: Use `request_copilot_review` tool to get fresh Copilot feedback
9. **Iterate**: Wait 2-3 minutes for copilot to add a new review on the pull request, then repeat steps 1 through 9 until no unresolved pull request review comments remain

## Tool Usage

- **git**: Local git operations using terminal commands (git add, git commit, git push)
- **run_in_terminal**: Execute terminal commands for testing and git operations
- **GitHub MCP**: GitHub interactions only (finding PRs, reading pull request review comments via GraphQL, resolving pull request review comments, requesting reviews)
- **Context7 MCP**: Get current documentation and examples for implementing fixes
- **File Operations**: Standard local file reading, writing, and updating (NOT through GitHub MCP)

## Implementation Guidelines

- **Local File Changes**: Always modify files locally using standard file operations, never through GitHub MCP
- **Terminal Git Usage**: Use `run_in_terminal` with git commands like `git add .`, `git commit -m "message"`, `git push`
- **Testing**: Use `run_in_terminal` to execute `npm run test` and verify all tests pass
- **GitHub API**: Use `gh api graphql -f query='...'` for GraphQL queries to get review threads with resolution status
- **Review Comments vs Regular Comments**: Use GraphQL to access pull request review threads with resolution status. Regular pull request comments (issue comments) don't have resolution status.
- **Copilot User**: Filter for `author.login == "copilot-pull-request-reviewer"` (not "Copilot" or "github-copilot[bot]")

## Success Criteria

- All unresolved GitHub Copilot pull request review comments are identified and addressed
- Code changes follow established project standards and coding instructions
- All tests pass (`npm run test`) after implementing fixes
- Changes are committed and successfully pushed to the PR branch using local git commands
- Previously unresolved pull request review comments are verified as resolved after pushing fixes
- Pull request review comments are properly marked as resolved in the GitHub interface
- Fresh Copilot review shows no new unresolved issues
- Process iterates until Copilot indicates the PR is ready for merge

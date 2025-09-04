---
description: 'Reviews and fixes GitHub Copilot feedback on pull requests iteratively until all issues are resolved.'
tools: ['github', 'context7']
---

# Pull Request Review Resolution

## Objective

Systematically resolve all unresolved GitHub Copilot review comments on the most recent maintainer-created pull request.

## Process

1. **Find Target PR**: Locate the most recent open pull request created by a maintainer (exclude dependabot/copilot PRs)
2. **Review Comments**: Identify ONLY unresolved review comments (ignore resolved ones)
3. **Fix Issues**: Address each unresolved comment by modifying the appropriate code
4. **Test Changes**: Run `npm run test` and make sure all tests pass before cotninuing to the next step
5. **Commit Changes**: Commit and push all fixes with descriptive commit messages
6. **Resolve Comments**: Mark each addressed comment as resolved individually
7. **Request Review**: Use `request_copilot_review` tool to get fresh Copilot feedback
8. **Iterate**: Wait 2-3 minutes, then repeat process until no unresolved comments remain

## Tool Usage

- **GitHub MCP**: All GitHub interactions (finding PRs, reading comments, committing, pushing, resolving comments, requesting reviews)
- **Context7 MCP**: Get current documentation and examples for implementing fixes

## Success Criteria

- All unresolved review comments are addressed and resolved
- Code changes follow project standards and guidelines
- Copilot review shows no remaining issues
- All commits are properly pushed to the PR branch

# ScaledTest Project - GitHub Copilot Instructions

Cross-cutting guidelines for the ScaledTest repository. For product vision, see `00-product.instructions.md`. For language-specific rules, see path-specific instruction files.

---

## Related Instruction Files

- `00-product.instructions.md` — Product vision, domain glossary, core principles (ALWAYS loaded)
- `00-tools.instructions.md` — Research order, Context7 usage (ALWAYS loaded)
- `auth.instructions.md` — Authentication patterns (loaded for auth files)
- `generated.instructions.md` — Generated file rules (loaded for generated files)
- `go*.instructions.md` — Go-specific patterns
- `react.instructions.md`, `typescript.instructions.md` — Frontend patterns
- `testing.instructions.md` — Test patterns

---

## Project Architecture

**ScaledTest is a 3-tier application:**

- **Backend**: Go 1.24+ (Fiber v2.52, Connect-RPC, JWT auth)
- **Frontend**: React 18+ (Vite, Tailwind CSS, React Router)
- **Database**: PostgreSQL 16 with TimescaleDB 2.14.2

**Module Independence:**

- `backend/` - Complete Go application with own dependencies
- `frontend/` - Complete React application with own test infrastructure
- `containers/` - Test runner images implementing the Runner Contract

Each module is self-contained and can be developed independently.

---

## Configuration & Secrets

**CRITICAL: Never hardcode secrets in source code.**

- Use `.env` files (git-ignored) for local development
- Document required variables in `.env.example` (committed)
- Production: Use Kubernetes secrets or cloud provider secrets
- NEVER commit secrets or tokens

**Required Environment Variables:**

- `JWT_SECRET` (min 32 chars), `DATABASE_URL` — **SECRETS**
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `SERVER_PORT`, `ENVIRONMENT`, `LOG_LEVEL`
- `VITE_API_URL` (frontend)

---

## Code Quality Standards

**File Naming:**

- NEVER use "new", "backup", "copy", "temp" suffixes
- NEVER use generic names: "helpers", "utils", "utilities", "common"
- Use descriptive names: `dateFormatting.ts` not `date-utils.ts`

**Module Organization:**

- NEVER create package files at root (`package.json`, `go.mod`)
- NEVER create temporary files at root
- Use module-specific directories for all code
- Use `./temp/` directory for truly temporary files (excluded from git)

**ESLint Compliance:**

- NEVER use `eslint-disable` comments
- Fix actual linting errors instead of suppressing
- Most common violations: `no-console`, `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unused-vars`

## Temporary File and Script Management Standards

**CRITICAL: NEVER create scripts, config files, or other files at the project root level** unless they are permanent project infrastructure. This includes:

**FORBIDDEN root-level file patterns:**

- Debug scripts: `debug-*.ts`, `test-*.ts`, `check-*.ts`, `quick-*.ts`, `simulate-*.ts`
- Configuration files: `*-config.json`, `role-*.json`, `user-*.json`, `assign-*.json`, `realm-config.json`
- Setup scripts: `setup-*.*`, `run-setup.*`, manual setup scripts
- Testing utilities: Individual test scripts outside the `tests/` directory structure
- Any temporary or exploratory code files

**PREFERRED APPROACHES:**

1. **Use terminal commands instead of temporary scripts** - Most debugging, testing, and configuration tasks can be accomplished with direct terminal commands rather than creating script files.

2. **Use existing scripts directory** - If a script is genuinely needed, place it in the `scripts/` directory with a clear, descriptive name that indicates its permanent purpose.

3. **Use temporary directories for necessary temporary files:**

   ```
   temp/               # For any temporary files (excluded from git)
   temp/debug/         # Debug scripts that will be deleted
   temp/config/        # Temporary configuration files
   temp/testing/       # One-off testing scripts
   ```

4. **Always clean up after yourself:**
   - If you create temporary files, delete them when the task is complete
   - Include cleanup commands as part of your workflow
   - Document any temporary files created and ensure they are removed

---

## DRY Principles

- Reuse existing shared components and utilities
- Extract common patterns into shared modules
- Use design tokens instead of hardcoded values
- Check existing implementations before creating new ones

---

## Testing Requirements

**ALL TESTS MUST PASS** before completing any task.

- Frontend: `cd frontend && npm test` (Playwright E2E tests)
- Backend: `cd backend && go test ./...`
- NEVER re-run failing tests without making changes
- Fix issues before retrying tests

**Test Integrity:**

- NEVER write tests that skip validation and still pass
- Use proper test user setup (`TestUsers.ADMIN`, `TestUsers.USER`)
- Let tests fail when permissions insufficient
- No try-catch blocks to hide legitimate failures

---

## Safe Property Access

**ALWAYS use defensive programming:**

```typescript
// ✅ CORRECT - Safe access
const userName = user?.profile?.name || "Unknown";
const results = Array.isArray(data) ? data : [];
const total = results.reduce((acc, item) => acc + (item?.value || 0), 0);

// ❌ WRONG - Unsafe access
const userName = user.profile.name;
const total = data.reduce((acc, item) => acc + item.value, 0);
```

**Apply these patterns everywhere:**

- Use optional chaining: `obj?.nested?.property`
- Check arrays with `Array.isArray()` before operations
- Provide fallback values: `|| defaultValue`
- Validate API responses before accessing properties

---

## Accessibility

- Use semantic HTML elements
- Ensure WCAG 2.1 AA color contrast ratios
- Provide alt text for images
- Implement proper keyboard navigation
- Add unique IDs to all interactive elements (buttons, inputs, links)

**ID Naming:**

- Use kebab-case: `#submit-button`, `#email-input`
- Be descriptive: `#header-logout` vs `#modal-logout`
- For lists: `#user-row-{id}`, `#role-{rolename}`

---

## Terminal Command Guidelines

**Application Startup:**

```bash
npm run dev  # Starts all services (Docker + Go + React/Vite)
```

**Interactive Commands:**

- ALWAYS use non-interactive flags when available
- Auto-answer prompts: `echo "y" | npx package-name@latest`
- Use detached mode: `docker-compose up -d`

**Command Monitoring:**

- Set timeouts based on command type
- Check progress at regular intervals
- Look for hanging indicators (prompts waiting for input)
- Use recovery strategies for stuck commands

---

**Do not obscure output in examples**

- Avoid examples or documentation that pipe command outputs to truncating filters such as `| Select-Object -Last N` or other constructs that hide execution context or errors. These make it hard to follow and debug commands when reproducing issues.
- If the console output is long, prefer one of the following approaches instead of truncating results:
  - Use `Out-Host -Paging` (PowerShell) or `less`/`more` (POSIX) so users can scroll through the output interactively.
  - Redirect or capture the full output to a file for inspection: `> full.log` (POSIX/PowerShell) or `Tee-Object -FilePath full.log` (PowerShell).
  - Add a command to print the specific, minimal set of data needed to reproduce the issue (e.g., filter by a relevant key or date) while also providing the full capture in a log file for diagnostics.
  - Use `Get-Content -Tail 40` for retrieving the last lines from a file (PowerShell) instead of piping to `Select-Object -Last 40`, which can hide pipeline errors when combined with earlier commands.
  - When demonstrating a command that searches large outputs, show the search command (e.g., `Select-String`, `grep`) and provide instructions for capturing the full output separately.

Examples:

PowerShell:

```
# Capture full output for debugging, then view interactively
Get-Content app.log | Tee-Object -FilePath logs/full.log
Get-Content logs/full.log | Out-Host -Paging

// If you only want the last lines of a file, use -Tail to avoid hiding pipeline errors
Get-Content app.log -Tail 40
```

POSIX (bash):

```
# Capture full output for debugging, then view interactively
./my-script.sh > logs/full.log 2>&1
less logs/full.log

# Or show the last lines (without hiding other errors from the command that produced the output)
tail -n 40 logs/full.log
```

These steps help to preserve reproducibility and surface errors instead of hiding them behind a size-limiting filter.

## Documentation

- Keep documentation concise and focused
- Use main `README.md` for essential information
- Update existing docs rather than creating new files
- Focus on practical, actionable information
- NEVER create summary or status documents


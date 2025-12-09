# ScaledTest Project - GitHub Copilot Instructions

Guidelines for working with ScaledTest, a full-stack application with Go backend and React frontend.

---

## Purpose & Scope

These instructions apply to the entire ScaledTest repository. For language-specific rules, refer to path-specific instruction files in `.github/instructions/`.

---

## Project Architecture

**ScaledTest is a 3-tier application:**

- **Backend**: Go 1.24+ (Fiber v2.52, gRPC v1.73, JWT auth)
- **Frontend**: React 18+ (Vite, Tailwind CSS, React Router)
- **Database**: PostgreSQL 16 with TimescaleDB 2.14.2

**Module Independence:**

- `backend/` - Complete Go application with own dependencies
- `frontend/` - Complete React application with own test infrastructure
- `docker/` - Container orchestration and database initialization

Each module is self-contained and can be developed independently.

---

## gRPC-First API Design

**CRITICAL: All new backend API endpoints MUST be defined as Protocol Buffers first.**

ScaledTest uses a **gRPC-first architecture** with grpc-gateway for REST compatibility:

- **Define services in `.proto` files** in `backend/api/proto/`
- **Generate Go code** using `buf generate` to `backend/api/proto/`
- **REST endpoints are auto-generated** via grpc-gateway HTTP annotations
- **CLI and frontend clients** use generated gRPC/connect-web clients

**Proto File Structure:**

```protobuf
syntax = "proto3";
package api.v1;
option go_package = "github.com/MichielDean/ScaledTest/backend/api/proto;proto";

import "google/api/annotations.proto";

service ExampleService {
  rpc GetExample(GetExampleRequest) returns (ExampleResponse) {
    option (google.api.http) = {
      get: "/api/v1/examples/{id}"
    };
  }
  
  rpc CreateExample(CreateExampleRequest) returns (ExampleResponse) {
    option (google.api.http) = {
      post: "/api/v1/examples"
      body: "*"
    };
  }
}
```

**Code Generation:**

```bash
cd backend
buf generate  # Generates Go + gRPC-gateway code to api/proto/
```

**Handler Implementation Pattern:**

```go
// internal/handlers/example_grpc.go
type ExampleServiceServer struct {
    pb.UnimplementedExampleServiceServer
    service services.ExampleManager
    logger  *zap.Logger
}

func (s *ExampleServiceServer) GetExample(ctx context.Context, req *pb.GetExampleRequest) (*pb.ExampleResponse, error) {
    result, err := s.service.Get(ctx, req.Id)
    if err != nil {
        return nil, status.Error(codes.Internal, "failed to get example")
    }
    return modelToProto(result), nil
}
```

**NEVER:**
- Create new REST endpoints directly in Fiber/handlers without proto definitions
- Define API types in Go structs instead of proto messages
- Manually implement REST routes that could be grpc-gateway generated

**Test Result Format: CTRF (Common Test Report Format)**

- CTRF is the ONLY format for test results: https://ctrf.io
- Backend: Use `go-jsonschema` to generate types from official schema
- Database: Store in normalized tables (`ctrf_reports`, `ctrf_tests`, etc.)
- NEVER store test results as JSONB - always deserialize into proper tables
- See `.github/instructions/go.instructions.md` for type generation details

---

## Context7 Usage

**ALWAYS use Context7 before implementing features:**

- Check Context7 for Fiber, gRPC, pgx patterns (Go)
- Check Context7 for React, Vite, Router patterns (frontend)
- Verify current package versions via Context7
- Prefer standard solutions over custom implementations

---

## Configuration & Secrets

**CRITICAL: Never hardcode secrets in source code.**

- Use `.env` files in `docker/` directory (git-ignored)
- Document required variables in `.env.example` (committed)
- Production: Use orchestrator secrets (Kubernetes, Docker Swarm, cloud providers)
- NEVER commit secrets or deploy with `.env` files in production

**Required Environment Variables:**

- `JWT_SECRET` (min 32 chars), `DATABASE_URL` - **SECRETS**
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `SERVER_PORT`, `GRPC_PORT`, `ENVIRONMENT`, `LOG_LEVEL`
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

## Authentication Standards

**Backend agnostic UI:**

- NEVER expose authentication backend details in UI
- Use generic language: "Sign in" not provider-specific terms
- Translate backend errors to user-friendly messages
- No "realm", "client", "admin console" references in UI

**Implementation:**

- Backend: JWT with 7-day expiration, bcrypt hashing
- Frontend: `useAuth()` hook, `withAuth` HOC
- Middleware: `AuthMiddleware(jwtSecret, logger)`

---

## Testing Requirements

**ALL TESTS MUST PASS** before completing any task.

- Frontend: `cd frontend && npm test` (Playwright E2E tests)
- Backend: `cd backend && go test ./...` (when implemented)
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

---

## Code Examples

**Component Structure:**

```typescript
// Proper React component with TypeScript
import React from 'react';

interface ButtonProps {
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  onClick,
  variant = 'primary',
  children
}) => {
  const baseClasses = 'px-4 py-2 rounded-lg font-medium transition-colors';
  const variantClasses = variant === 'primary'
    ? 'bg-blue-600 hover:bg-blue-700 text-white'
    : 'bg-gray-200 hover:bg-gray-300 text-gray-800';

  return (
    <button
      id="action-button"
      onClick={onClick}
      className={`${baseClasses} ${variantClasses}`}
    >
      {children}
    </button>
  );
};

export default Button;
```

**Error Handling:**

```go
// Proper Go error handling with logging
func handler(c *fiber.Ctx) error {
    data, err := fetchData()
    if err != nil {
        logger.Error("Failed to fetch data", zap.Error(err))
        return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
            "error": "Failed to fetch data",
        })
    }
    return c.JSON(data)
}
```

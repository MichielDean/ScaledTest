# ScaledTest Project - GitHub Copilot Instructions

## Context7 Usage Requirements

**ALWAYS use Context7 for code examples, package information, and implementation patterns:**

- **BEFORE implementing any library or framework feature** - Use Context7 to get up-to-date examples and best practices
- **BEFORE suggesting package versions** - Use Context7 to get current version information
- **BEFORE creating custom implementations** - Check Context7 for existing solutions and patterns
- **For Shadcn/ui, Next.js, React, and other frameworks** - Always reference Context7 documentation for correct implementation patterns

**When a user asks for examples or implementation guidance:**

1. Use Context7 first to get current best practices
2. Implement exactly what Context7 recommends
3. Do not create custom implementations when standard ones exist

## Shadcn/ui Implementation Standards

**CRITICAL: ALWAYS use the official Shadcn/ui CLI to install components. NEVER create custom implementations.**

### Component Installation Process

**ALWAYS follow this exact process:**

1. **Install components using the CLI:**

   ```bash
   npx shadcn@latest add [component-name]
   ```

2. **Use official components exactly as documented:**

   ```typescript
   // ✅ CORRECT - Use official components
   import { Button } from '@/components/ui/button';
   import { Input } from '@/components/ui/input';
   import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

   // ❌ WRONG - Creating custom components
   const CustomButton = () => {
     /* ... */
   };
   ```

3. **Form implementation - ALWAYS use the official Form components:**

   ```bash
   npx shadcn@latest add form
   ```

   ```typescript
   // ✅ CORRECT - Official form pattern
   import { useForm } from 'react-hook-form';
   import { zodResolver } from '@hookform/resolvers/zod';
   import { z } from 'zod';
   import {
     Form,
     FormControl,
     FormField,
     FormItem,
     FormLabel,
     FormMessage,
   } from '@/components/ui/form';
   ```

### Shadcn/ui Best Practices

**Component Usage:**

- **NEVER create custom UI components** when Shadcn/ui equivalents exist
- **ALWAYS check the Shadcn/ui registry** before building anything custom
- **Use Context7** to get the latest Shadcn/ui implementation patterns
- **Install individual components** as needed rather than all at once

**Styling Rules:**

- **ONLY use Tailwind CSS classes** for styling
- **NEVER write custom CSS** for basic UI patterns
- **Use design tokens** from the Shadcn/ui system
- **Follow the established design system** consistently

**Common Components to Install:**

```bash
# Essential components
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add card
npx shadcn@latest add form
npx shadcn@latest add alert
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
npx shadcn@latest add table
npx shadcn@latest add tabs
npx shadcn@latest add sheet
```

### CSS and Styling Conflict Prevention

**CRITICAL: Avoid CSS conflicts with Shadcn/ui:**

1. **NEVER override Shadcn/ui component styles** with custom CSS
2. **Use Tailwind utility classes** instead of custom CSS
3. **Check existing CSS modules** for conflicts before adding Shadcn/ui
4. **Remove conflicting global styles** that override Tailwind base styles

### Shadcn/ui Customization Restrictions

**CRITICAL: Maintain component consistency and minimize customization:**

1. **NEVER heavily customize Shadcn/ui components** - Use them as-is from the official registry
2. **NEVER create wrapper components** that significantly alter Shadcn behavior or styling
3. **NEVER add custom props or variants** unless absolutely necessary and approved
4. **Use official component variants** and built-in styling options only
5. **Follow the "minimal custom code" principle** - rely on official implementations

**Acceptable customization (minimal only):**

- Adding `className` props for spacing/layout (margin, padding)
- Using official component variants (`variant`, `size`, etc.)
- Passing through standard HTML attributes (`id`, `aria-*`, `data-*`)

**FORBIDDEN customization:**

- Creating custom styled-components or CSS modules for Shadcn components
- Adding custom CSS classes that override component internals
- Wrapping components in custom divs with extensive styling
- Creating "enhanced" versions of existing Shadcn components

## Established Color Theme Standards

**CRITICAL: The project uses a carefully designed amber/charcoal color theme. NEVER modify colors without explicit user request.**

### Current Color System

The project uses a comprehensive color system defined in:

- `tailwind.config.ts` - Custom brand colors (amber, charcoal, sand)
- `src/styles/globals.css` - Semantic color mappings for light/dark modes

**Primary Brand Colors:**

- **Amber:** `#D88C2C` (primary actions, highlights)
- **Amber Dark:** `#7A4B1F` (darker variant)
- **Amber Light:** `#F3C57A` (lighter variant)
- **Charcoal:** `#2B1D0E` (text, dark elements)
- **Sand:** `#FDF5E6` (backgrounds, light elements)

### Color Usage Rules

**ALWAYS use semantic color tokens:**

```typescript
// ✅ CORRECT - Use semantic tokens
className = 'bg-background text-foreground';
className = 'bg-primary text-primary-foreground';
className = 'bg-card text-card-foreground';
className = 'border-border';

// ❌ WRONG - Using arbitrary colors
className = 'bg-blue-500 text-white';
className = 'bg-gray-100 text-black';
```

**NEVER modify colors unless explicitly requested:**

- Do not change color values in `tailwind.config.ts`
- Do not alter semantic mappings in `globals.css`
- Do not add new color variants without permission
- Do not override theme colors with custom CSS

**ALWAYS check accessibility:**

- All color combinations maintain WCAG 2.1 AA contrast ratios
- Dark mode is fully supported with inverted semantic mappings
- Test color changes with the `/color-demo` page

### Color Modification Process

**ONLY modify colors when:**

1. User explicitly requests color changes
2. Accessibility issues are identified
3. New semantic color tokens are needed for specific functionality

**Before making color changes:**

1. Verify current theme meets requirements
2. Check if existing semantic tokens can be used
3. Test accessibility impact in both light and dark modes
4. Update `/color-demo` page if new colors are added

## Code Generation Best Practices

**When generating any TypeScript code, ALWAYS follow these patterns to prevent common ESLint violations:**

1. **Import Management:**

   ```typescript
   // ✅ CORRECT - Only import what you use
   import React, { useState } from 'react';
   import { logger } from '../logging/logger';
   import { UserData } from '../types/user';

   // ❌ WRONG - Unused imports
   import React, { useState, useEffect } from 'react'; // useEffect not used
   ```

2. **Variable Declaration:**

   ```typescript
   // ✅ CORRECT - Declare only used variables
   const [data, setData] = useState<UserData | null>(null);
   const isLoading = data === null;

   // ❌ WRONG - Unused variables
   const [data, setData] = useState(null);
   const unusedVar = 'test'; // unused
   const [loading, setLoading] = useState(false); // setLoading never called
   ```

3. **Type Definitions:**

   ```typescript
   // ✅ CORRECT - Specific types
   interface ApiResponse {
     data: UserData[];
     status: 'success' | 'error';
   }

   function handleResponse(response: ApiResponse): void {
     logger.info('Response processed', { status: response.status });
   }

   // ❌ WRONG - Using any
   function handleResponse(response: any): any {
     console.log('Response:', response);
     return response.data;
   }
   ```

4. **Function Parameters:**

   ```typescript
   // ✅ CORRECT - Remove unused parameters or prefix with underscore
   function processData(data: UserData, _metadata?: MetaData): string {
     return data.name;
   }

   // ❌ WRONG - Unused parameters
   function processData(data: UserData, metadata: MetaData): string {
     return data.name; // metadata unused
   }
   ```

## Code Quality and File Management Standards

**NEVER create files with "new", "backup", "copy", "temp", or similar suffixes in the filename.** Always update existing files directly or create files with proper, final names.

**NEVER create summary documents or status files.** Do not create files like "TASK_SUMMARY.md", "STATUS.md", "COMPLETION_REPORT.md", or similar documentation files that summarize work completed. The work itself and any necessary updates to existing documentation (like README.md) are sufficient.

## React Component Development Standards

**ALWAYS follow React best practices and consistency patterns:**

### Component Structure and Organization

```typescript
// ✅ CORRECT - Proper component structure
import React from 'react';
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import styles from '../styles/ComponentName.module.css';
import { logger } from '../logging/logger';

interface ComponentNameProps {
  title: string;
  onAction?: () => void;
  variant?: 'primary' | 'secondary';
}

const ComponentName: React.FC<ComponentNameProps> = ({
  title,
  onAction,
  variant = 'primary'
}) => {
  // Hooks at the top
  const [isLoading, setIsLoading] = useState(false);

  // Event handlers
  const handleClick = useCallback(() => {
    logger.info('Component action triggered', { component: 'ComponentName' });
    onAction?.();
  }, [onAction]);

  return (
    <Card className={styles.container}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          id="component-action-button"
          onClick={handleClick}
          disabled={isLoading}
          variant={variant}
        >
          {isLoading ? 'Loading...' : 'Take Action'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default ComponentName;
```

### State Management Patterns

```typescript
// ✅ CORRECT - Safe state management
const [user, setUser] = useState<UserData | null>(null);
const [errors, setErrors] = useState<Record<string, string>>({});
const [isLoading, setIsLoading] = useState(false);

// Derived state
const hasUser = user !== null;
const userName = user?.name || 'Guest';
const errorCount = Object.keys(errors).length;

// State updates with proper error handling
const updateUser = useCallback(async (userData: Partial<UserData>) => {
  try {
    setIsLoading(true);
    setErrors({});

    const updatedUser = await userService.update(userData);
    setUser(updatedUser);
    logger.info('User updated successfully', { userId: updatedUser.id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Update failed';
    setErrors({ general: errorMessage });
    logger.error('User update failed', { error, userData });
  } finally {
    setIsLoading(false);
  }
}, []);
```

### Event Handler Patterns

```typescript
// ✅ CORRECT - Proper event handling
const handleSubmit = useCallback(
  async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.email || !formData.password) {
      setErrors({ form: 'Email and password are required' });
      return;
    }

    try {
      setIsLoading(true);
      await onSubmit(formData);
    } catch (error) {
      logger.error('Form submission failed', { error, formData: { email: formData.email } });
      setErrors({ form: 'Submission failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  },
  [formData, onSubmit]
);

// ✅ CORRECT - Input change handlers
const handleInputChange = useCallback(
  (field: keyof FormData) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value,
    }));

    // Clear field-specific errors
    if (errors[field]) {
      setErrors(prev => {
        const { [field]: removed, ...rest } = prev;
        return rest;
      });
    }
  },
  [errors]
);
```

### Performance Optimization Patterns

```typescript
// ✅ CORRECT - Memoization for expensive calculations
const processedData = useMemo(() => {
  if (!Array.isArray(rawData)) return [];

  return rawData
    .filter(item => item?.isActive === true)
    .map(item => ({
      id: item.id,
      displayName: item.name || 'Unknown',
      value: Number(item.value) || 0
    }))
    .sort((a, b) => b.value - a.value);
}, [rawData]);

// ✅ CORRECT - Callback memoization for child components
const handleItemClick = useCallback((itemId: string) => {
  logger.info('Item clicked', { itemId });
  onItemSelect?.(itemId);
}, [onItemSelect]);

// ✅ CORRECT - Component memoization for pure components
const ItemList = React.memo<ItemListProps>(({ items, onItemClick }) => {
  const itemElements = useMemo(() =>
    items.map(item => (
      <Item
        key={item.id}
        data={item}
        onClick={() => onItemClick(item.id)}
      />
    )), [items, onItemClick]);

  return <div className={styles.itemList}>{itemElements}</div>;
});
```

### Error Boundary Implementation

```typescript
// ✅ CORRECT - Error boundary pattern
class ComponentErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType<{ error: Error }> },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('Component error boundary triggered', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error!} />;
    }

    return this.props.children;
  }
}
```

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

**CORRECT workflow patterns:**

```bash
# ✅ CORRECT - Use terminal commands for debugging
curl -X GET "http://localhost:8080/auth/realms/scaledtest"

# ✅ CORRECT - Use existing scripts directory for permanent scripts
# Create: scripts/verify-auth-setup.ts (if genuinely needed long-term)

# ✅ CORRECT - Use temp directory for necessary temporary files
mkdir -p temp/debug
# Create temporary debug script in temp/debug/
# Run it, then: rm -rf temp/debug
```

```typescript
// ✅ CORRECT - Use existing test infrastructure
// Add tests to appropriate test directories: tests/unit/, tests/integration/, etc.
// Use existing test data generators in tests/data/

// ✅ CORRECT - Use existing configuration files
// Update existing configuration in docker/, src/config/, or established config files
```

**NEVER create scripts at project root:**

- If a script is necessary for testing only, it should go into the ./temp folder and be cleaned up when we are done with it
- If a script should live long-term and is necessary for the application to function, it should be created under the ./scripts directory.
- The ./scripts directory should not become bloated and we should really think about what goes in there. I do not want to manage a lot of scripts.

**Cleanup enforcement:**

- Before completing any task, verify no temporary files were created at the project root
- Remove any temporary directories and files created during the task
- Ensure `.gitignore` excludes temporary directories like `temp/`

**Using Existing Project Infrastructure:**

Before creating any new files, ALWAYS check for existing infrastructure that can accomplish the same goal:

- **Authentication testing** → Use `tests/authentication/` directory and existing test users
- **API testing** → Use `tests/integration/` directory and existing test infrastructure
- **Configuration changes** → Use existing config files in `docker/import/`, `src/config/`, or environment variables
- **Data generation** → Use existing generators in `tests/data/` directory
- **Debugging** → Use terminal commands with existing tools (curl, shell scripts, npm scripts)
- **User management** → Use existing `scripts/setup-test-users.ts`
- **Service verification** → Use terminal commands to check service status rather than creating verification scripts

## Terminal Management and Interactive Command Handling

**CRITICAL: This is the definitive guide for handling terminal commands, background processes, and interactive prompts. These patterns MUST be followed to prevent hanging terminals and indefinite waits.**

### Application Startup Guidelines

**CRITICAL: NEVER use `npm run dev` or `npm run start` directly. ALWAYS use PM2 commands for application management.**

```bash
# ✅ CORRECT - Use PM2 for development server
npm run pm2:dev

# ❌ FORBIDDEN - Never use npm run dev directly
npm run dev

# ❌ FORBIDDEN - Never use npm run start directly
npm run start
```

**Why PM2 is mandatory:**

- Provides proper process management and monitoring
- Enables graceful restarts and automatic failure recovery
- Offers centralized logging and status checking
- Prevents terminal hanging and indefinite waits
- Ensures consistent cross-platform behavior
- Allows background operation without terminal dependency

**Required PM2 workflow:**

1. Start: `npm run pm2:dev`
2. Monitor: `npm run pm2:status` and `npm run pm2:logs`
3. Stop: `npm run pm2:stop`
4. Clean up: `npm run pm2:delete`

### Command Classification and Handling Strategy

**Before running ANY command, classify it into one of these categories:**

1. **Development server startup** (`npm run pm2:dev` - PM2-managed long-running process)
2. **Other long-running processes** (docker-compose up without -d)
3. **Interactive CLI tools** (npx package installations, migrations with prompts)
4. **Quick-completion commands** (npm build, file operations, most scripts)

### 1. Long-Running Process Management

**CRITICAL: ALWAYS use PM2 for development server management.**

**For development server startup, ONLY use PM2 commands:**

```bash
# ✅ CORRECT - Start development server with PM2
npm run pm2:dev

# ❌ FORBIDDEN - Never start development server directly
npm run dev
npm run start
```

### 1.1. PM2 Cross-Platform Process Management

**For scenarios requiring reliable background process management, use the PM2 scripts with the dedicated startup script:**

```bash
# ✅ PREFERRED - Start PM2 managed development server
npm run pm2:dev

# ✅ CORRECT - Check PM2 process status
npm run pm2:status

# ✅ CORRECT - View PM2 logs
npm run pm2:logs

# ✅ CORRECT - Stop PM2 processes
npm run pm2:stop

# ✅ CORRECT - Restart PM2 processes
npm run pm2:restart

# ✅ CORRECT - Clean up PM2 processes when finished
npm run pm2:delete
```

**PM2 Benefits:**

- Cross-platform compatibility (works on Windows, macOS, Linux)
- Automatic process restart on failure
- Built-in log management and rotation
- Process monitoring and status checking
- Proper cleanup and process lifecycle management
- No terminal session dependency

**How it works:**

- Uses a dedicated Node.js script (`scripts/start-dev-server.js`) that PM2 can reliably execute
- The script handles Docker startup and Next.js development server initialization
- Provides proper error handling and graceful shutdown
- Avoids Windows-specific npm/PM2 compatibility issues

### 2. Interactive Command Handling

**CRITICAL: ALWAYS use non-interactive flags when available, or auto-answer prompts.**

**Known interactive commands and their solutions:**

```bash
# ✅ CORRECT - Better Auth CLI with auto-yes
npx @better-auth/cli migrate --yes

# ✅ CORRECT - NPX with auto-answer for package installation
echo "y" | npx @better-auth/cli migrate

# ✅ CORRECT - Alternative auto-answer method
printf "y\n" | npx package-name@latest command

# ✅ CORRECT - Docker Compose detached mode
docker-compose up -d

# ✅ CORRECT - npm commands (usually non-interactive by default)
npm install
npm run build
npm test
```

**Interactive Command Detection Patterns:**

Watch for these patterns in terminal output that indicate a hanging prompt:

- `Ok to proceed? (y)`
- `Do you want to continue? [Y/n]`
- `Are you sure you want to run these migrations?`
- Prompts ending with `(y/n)`, `[Y/n]`, `[y/N]`

### 3. Command Progress Detection and Timeout Management

**CRITICAL: Implement systematic command monitoring to prevent indefinite waits.**

**Proactive Hanging Detection Strategy:**

```powershell
# MANDATORY: After starting ANY command, set a monitoring timer
run_in_terminal(command="npx some-command", isBackground=false)

# IMMEDIATELY after command execution, start monitoring:
# Wait 15-30 seconds for command acknowledgment, then check status
get_terminal_output(id="terminal_id")

# Look for these IMMEDIATE hanging indicators:
# - "Ok to proceed? (y)" or similar prompts
# - "Do you want to continue?" messages
# - Process sitting with no output for >30 seconds
# - Terminal showing command but no progress/completion
```

**MANDATORY Command Monitoring Workflow:**

```powershell
# Phase 1: Immediate Response Check (15-30 seconds)
# - Did command start executing?
# - Are there any prompts waiting for input?
# - Is there clear progress indication?

# Phase 2: Progress Verification (1-2 minutes)
# - Is command making measurable progress?
# - Are there status updates, progress bars, or log output?
# - Has command completed successfully?

# Phase 3: Timeout Decision (2-5 minutes based on command type)
# - If no progress and no completion, investigate or restart
# - Check for hung processes or waiting prompts
# - Consider alternative approaches (flags, auto-answer, job control)
```

**Command Execution Pattern:**

```bash
# 1. Start command
run_in_terminal(command="command", isBackground=false)

# 2. If no immediate response after reasonable time, check progress
# Wait times by command type:
# - Quick commands (npm build, file ops): 30-60 seconds
# - Installations (npm install): 2-3 minutes
# - Migrations/DB operations: 1-2 minutes
# - Test runs: Variable based on test suite size

get_terminal_output(id="terminal_id")

# 3. Look for these completion indicators:
# - Command prompt return ($, %, > prompt)
# - "Command completed" or success messages
# - Error messages with exit codes
# - Progress percentages reaching 100%

# 4. Look for these hanging indicators:
# - Prompt waiting for input (Ok to proceed? (y))
# - Cursor blinking with no progress for >30 seconds
# - Process showing 0% CPU but no completion message
```

**Progressive Monitoring Strategy:**

```bash
# Phase 1: Quick check (30 seconds)
get_terminal_output(id="terminal_id")

# Phase 2: If still running, check for interactive prompts (60 seconds)
get_terminal_output(id="terminal_id")
# If interactive prompt detected, use auto-answer techniques

# Phase 3: Extended wait for complex operations (2-5 minutes)
get_terminal_output(id="terminal_id")

# Phase 4: Timeout and investigate (>5 minutes for most commands)
# Log command details and investigate why it's hanging
```

### 4. Comprehensive Non-Interactive Command Reference

**CLI Tools with Interactive Prompts and Solutions:**

```bash
# Better Auth CLI
npx @better-auth/cli migrate --yes
npx @better-auth/cli generate --yes

# NPX package installations
echo "y" | npx @package/cli command
echo "y" | npx create-something@latest

# Docker operations
docker-compose up -d  # Detached mode
docker system prune --force  # Skip confirmation

# Git operations
git add . && git commit -m "message"  # No interaction needed
git push  # May need credentials setup

# Database migrations
# Check each tool's documentation for --yes, --force, or --auto flags
```

### 5. Emergency Command Recovery

**If a command appears to hang:**

1. **Check terminal output immediately:**

   ```powershell
   get_terminal_output(id="terminal_id")
   ```

2. **Look for interactive prompts and respond:**
   - If you see `Ok to proceed? (y)` - the command is waiting for input
   - Cancel current approach and restart with auto-answer method

3. **Identify command type:**
   - Server/watcher: Should have been started with background job control
   - Interactive tool: Needs --yes flag or auto-answer
   - Quick command: Should complete within 1-2 minutes

4. **Recovery actions:**

   ```bash
   # For hanging servers - stop and restart with PM2
   npm run pm2:stop  # Stop any hanging PM2 processes
   npm run pm2:dev   # Restart with PM2

   # For interactive prompts - restart with auto-answer
   echo "y" | command

   # For truly stuck commands - start fresh terminal session
   # (run_in_terminal automatically creates new session)
   ```

### 7. Terminal Session Management

**CRITICAL: Each `run_in_terminal` call creates a separate terminal session.**

```bash
# ✅ CORRECT - Each command runs in its own terminal
run_in_terminal(command="docker-compose up -d", isBackground=false)
run_in_terminal(command="npm run build", isBackground=false)
run_in_terminal(command="npm test", isBackground=false)

# ❌ WRONG - Don't try to chain commands expecting same terminal
run_in_terminal(command="cd project", isBackground=false)
run_in_terminal(command="npm install", isBackground=false)  # Wrong directory!

# ✅ CORRECT - Include directory context in each command
run_in_terminal(command="cd /path/to/project && npm install", isBackground=false)
```

### 8. Workflow Patterns for Complex Operations

**Development workflow (using PM2 for server management):**

```bash
# Step 1: Start development server with PM2 (includes Docker, build, and dev server)
run_in_terminal(command="npm run pm2:dev", isBackground=false)

# Step 2: Run setup scripts (quick completion)
run_in_terminal(command="npx tsx scripts/setup-test-users.ts", isBackground=false)

# Step 3: Monitor server status
run_in_terminal(command="npm run pm2:status", isBackground=false)

# Step 4: View logs if needed
run_in_terminal(command="npm run pm2:logs", isBackground=false)
```

**Production testing workflow:**

```bash
# Step 1: Start production server with PM2
run_in_terminal(command="npm run pm2:dev", isBackground=false)

# Step 2: Run tests (monitor for completion)
run_in_terminal(command="npm test", isBackground=false)
# Monitor: get_terminal_output after appropriate time based on test suite size

# Step 3: Stop PM2 processes when done
run_in_terminal(command="npm run pm2:stop", isBackground=false)
```

### 9. Command Timeout and Monitoring Guidelines

**Recommended timeout periods:**

- **File operations**: 30 seconds
- **npm build/compile**: 2-3 minutes
- **npm install**: 3-5 minutes (depends on package size)
- **Database migrations**: 1-2 minutes
- **Test suites**: Variable (unit: 1-2 min, integration: 3-5 min, e2e: 5-10 min)
- **CLI tool installations**: 1-2 minutes

**Monitoring checkpoints:**

1. **Immediate check** (0-10 seconds): Command started successfully?
2. **Progress check** (30-60 seconds): Is command progressing or waiting for input?
3. **Completion check** (timeout period): Did command complete or hang?

### 10. Definitive Command Handling Checklist

**Before running ANY command, ask:**

1. ✅ **Is this a long-running server?** → Use PM2 managed processes (`npm run pm2:dev`)
2. ✅ **Does this tool have interactive prompts?** → Use --yes flag or auto-answer
3. ✅ **What's the expected completion time?** → Set appropriate monitoring intervals
4. ✅ **Does this command need specific directory context?** → Include in command
5. ✅ **Is this command prone to hanging?** → Plan monitoring and recovery strategy

**This systematic approach will eliminate terminal hanging issues permanently.**

### 11. Common CLI Tools Non-Interactive Reference

**CRITICAL: Always prefer non-interactive flags when available. If no flags exist, use auto-answer techniques.**

| Tool                | Interactive Command             | Non-Interactive Solution              |
| ------------------- | ------------------------------- | ------------------------------------- |
| Better Auth CLI     | `npx @better-auth/cli migrate`  | `npx @better-auth/cli migrate --yes`  |
| Better Auth CLI     | `npx @better-auth/cli generate` | `npx @better-auth/cli generate --yes` |
| NPX Package Install | `npx some-package@latest`       | `echo "y" \| npx some-package@latest` |
| Docker System       | `docker system prune`           | `docker system prune --force`         |
| Docker Compose      | `docker-compose up`             | `docker-compose up -d` (detached)     |
| Git Operations      | Generally non-interactive       | No changes needed                     |
| npm/yarn            | Generally non-interactive       | No changes needed                     |

**Auto-Answer Pattern for Unknown Tools:**

```bash
# When you encounter a new CLI tool that prompts for confirmation:
# 1. Check help first: command --help | grep -i "yes\|force\|auto\|non-interactive"
# 2. If no flags found, use auto-answer:
echo "y" | command-that-prompts
# 3. Document the solution in this table for future reference
```

**Auto-Answer Variations:**

```bash
# Single "y" answer
echo "y" | command

# Multiple answers (if tool asks multiple questions)
printf "y\ny\ny\n" | command  # y, then y, then y

# Alternative format
echo -e "y\ny\ny" | command
```

## ESLint Standards

**NEVER use eslint-disable comments.** Fix actual linting errors instead of suppressing them. **This includes all forms of ESLint suppression:**

- `// eslint-disable`
- `// eslint-disable-line`
- `// eslint-disable-next-line`
- `/* eslint-disable */`
- `/* eslint-disable-line */`
- `/* eslint-disable-next-line */`
- Rule-specific disables like `// eslint-disable-next-line @typescript-eslint/no-unused-vars`

**Instead, resolve linting errors properly by:**

- Fixing unused variables and imports
- Adding proper type annotations
- Following proper naming conventions
- Ensuring proper dependency usage
- Refactor code to comply with ESLint rules
- Using proper TypeScript patterns (prefer interfaces over types, proper generics)
- Implementing proper error handling instead of ignoring Promise rejections
- Adding proper return types to functions
- Using semantic variable and function names
- Properly handling async/await patterns

**If you encounter a rule that seems inappropriate for the codebase, discuss it with the team to potentially modify the ESLint configuration rather than suppressing the rule.**

**MOST COMMON ESLINT VIOLATIONS TO PREVENT:**

1. **`no-console`** - Never use `console.log`, `console.error`, etc.
   - Use structured logger: `import { logger } from '../logging/logger';`
   - Use appropriate log levels: `logger.info()`, `logger.error()`, `logger.debug()`

2. **`@typescript-eslint/no-explicit-any`** - Never use `any` type
   - Define proper interfaces in `src/types/`
   - Use specific union types: `string | number` instead of `any`
   - Use generic constraints: `<T extends SomeInterface>` instead of `<T = any>`

3. **`@typescript-eslint/no-unused-vars`** - Remove unused variables and imports
   - Delete unused imports immediately after adding them
   - Remove unused function parameters or prefix with underscore: `_unusedParam`
   - Clean up unused variables and constants before committing code

## Safe Property and Array Access Standards

**CRITICAL: NEVER access properties or array methods without proper safety checks.** All property and array access must be defensive to prevent runtime errors like "Cannot read properties of undefined" or "Cannot read property 'length' of undefined".

**ALWAYS follow these mandatory safety patterns:**

### 1. **Optional Chaining for Nested Properties**

```typescript
// ✅ CORRECT - Safe property access
const userName = user?.profile?.name || 'Unknown';
const firstAddress = user?.addresses?.[0]?.street || 'No address';

// ❌ WRONG - Unsafe property access
const userName = user.profile.name; // Error if user or profile is undefined
const firstAddress = user.addresses[0].street; // Error if any level is undefined
```

### 2. **Array Safety Checks Before Operations**

```typescript
// ✅ CORRECT - Safe array operations
const results = Array.isArray(data) ? data : [];
const totalCount = results.length;
const processedData = results.map(item => processItem(item));
const sum = results.reduce((acc, item) => acc + (item?.value || 0), 0);

// ❌ WRONG - Unsafe array operations
const totalCount = data.length; // Error if data is undefined/null
const processedData = data.map(item => processItem(item)); // Error if data is not an array
const sum = data.reduce((acc, item) => acc + item.value, 0); // Multiple failure points
```

### 3. **Defensive State Access in React Components**

```typescript
// ✅ CORRECT - Safe React state access
const MyComponent = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [metadata, setMetadata] = useState<Metadata | null>(null);

  const itemCount = items?.length || 0;
  const hasItems = Array.isArray(items) && items.length > 0;
  const title = metadata?.title || 'Default Title';

  return (
    <div>
      <h1>{title}</h1>
      {hasItems ? (
        <ul>
          {items.map((item, index) => (
            <li key={item?.id || index}>{item?.name || 'Unknown'}</li>
          ))}
        </ul>
      ) : (
        <p>No items available</p>
      )}
    </div>
  );
};

// ❌ WRONG - Unsafe React patterns
const MyComponent = () => {
  const [items, setItems] = useState<Item[]>();
  const [metadata, setMetadata] = useState<Metadata>();

  return (
    <div>
      <h1>{metadata.title}</h1> {/* Error if metadata is undefined */}
      <ul>
        {items.map(item => ( {/* Error if items is undefined */}
          <li key={item.id}>{item.name}</li> {/* Error if item properties are undefined */}
        ))}
      </ul>
      <p>Total: {items.length}</p> {/* Error if items is undefined */}
    </div>
  );
};
```

### 4. **API Response Safety Patterns**

```typescript
// ✅ CORRECT - Safe API response handling
interface ApiResponse {
  data?: Item[];
  metadata?: {
    total?: number;
    page?: number;
  };
}

const handleApiResponse = (response: ApiResponse) => {
  const items = Array.isArray(response?.data) ? response.data : [];
  const total = response?.metadata?.total || 0;
  const currentPage = response?.metadata?.page || 1;

  return {
    items,
    pagination: {
      total,
      currentPage,
      hasItems: items.length > 0,
    },
  };
};

// ❌ WRONG - Unsafe API response handling
const handleApiResponse = (response: ApiResponse) => {
  const total = response.data.length; // Error if response.data is undefined
  const firstItem = response.data[0]; // Error if array is empty or undefined
  const pageNumber = response.metadata.page; // Error if metadata is undefined

  return {
    total,
    firstItem,
    pageNumber,
  };
};
```

### 5. **Safe Iteration and Aggregation**

```typescript
// ✅ CORRECT - Safe iteration patterns
const calculateStats = (data: any) => {
  const items = Array.isArray(data?.items) ? data.items : [];
  const validItems = items.filter(item => item && typeof item === 'object');

  return {
    count: validItems.length,
    sum: validItems.reduce((acc, item) => acc + (Number(item?.value) || 0), 0),
    average:
      validItems.length > 0
        ? validItems.reduce((acc, item) => acc + (Number(item?.value) || 0), 0) / validItems.length
        : 0,
    names: validItems.map(item => item?.name || 'Unknown').filter(Boolean),
  };
};

// ❌ WRONG - Unsafe iteration
const calculateStats = (data: any) => {
  return {
    count: data.items.length, // Error if data or items is undefined
    sum: data.items.reduce((acc, item) => acc + item.value, 0), // Multiple failure points
    average: data.items.reduce((acc, item) => acc + item.value, 0) / data.items.length,
    names: data.items.map(item => item.name), // Error if item.name is undefined
  };
};
```

### 6. **Safe Object Destructuring**

```typescript
// ✅ CORRECT - Safe destructuring with defaults
const processUser = (user: any) => {
  const { name = 'Unknown', email = '', preferences = {}, roles = [] } = user || {};

  const { theme = 'light', language = 'en' } = preferences;
  const isAdmin = Array.isArray(roles) && roles.includes('admin');

  return { name, email, theme, language, isAdmin };
};

// ❌ WRONG - Unsafe destructuring
const processUser = (user: any) => {
  const { name, email, preferences, roles } = user; // Error if user is undefined
  const { theme, language } = preferences; // Error if preferences is undefined
  const isAdmin = roles.includes('admin'); // Error if roles is undefined

  return { name, email, theme, language, isAdmin };
};
```

### 7. **Safe Property Access Checklist**

**Before accessing any property or array method, ALWAYS verify:**

- ✅ Is the object/array defined? Use `obj?.property` or `Array.isArray(arr)`
- ✅ Is the property path safe? Use optional chaining `obj?.nested?.property`
- ✅ Do you have fallback values? Use `|| defaultValue` or `?? defaultValue`
- ✅ Are array operations protected? Check `Array.isArray()` before `.map()`, `.reduce()`, `.filter()`
- ✅ Are you handling empty arrays? Check `.length > 0` before accessing indices
- ✅ Do you have null checks? Use `!== null && !== undefined` when needed
- ✅ Are API responses validated? Assume external data can be malformed
- ✅ Are you using safe defaults? Provide meaningful fallback values

**MANDATORY: Apply these patterns consistently in ALL code:**

- React components and hooks
- API response handlers
- Data processing functions
- Event handlers
- Utility functions
- Test code
- Configuration files

## DRY (Don't Repeat Yourself) Principles

**ALWAYS follow DRY principles:**

- Reuse existing shared components and utilities
- Extract common patterns into shared modules
- Use design tokens instead of hardcoded values
- Reference existing implementations before creating new ones

## Project Architecture

**Technology Stack:**

- Next.js with TypeScript
- CSS Modules for styling
- Better Auth for authentication
- OpenSearch for analytics
- Jest and Playwright for testing

**Key Directories:**

- `src/components/` - React components
- `src/pages/` - Next.js pages
- `src/styles/` - CSS modules and design system
- `src/types/` - TypeScript type definitions
- `src/logging/` - Structured logging functionality
- `src/environment/` - Environment variable handling
- `src/authentication/` - Authentication utilities (tokens, config, admin API)
- `src/auth/` - Authentication logic
- `tests/` - All test files organized by type

**Testing Structure:**

- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- System tests: `tests/system/` (includes UI/end-to-end tests with Playwright)
- Component tests: `tests/components/`

## Code Standards

**TypeScript:**

- Use strict typing - avoid `any` types
- Define proper interfaces and types in `src/types/`
- Use type guards for runtime type checking

**CRITICAL: TypeScript Error Prevention**

**NEVER use `any` types** - Always specify proper types:

```typescript
// ❌ WRONG - Using any
function processData(data: any): any {
  return data.someProperty;
}

// ✅ CORRECT - Proper typing
interface UserData {
  id: number;
  name: string;
  email: string;
}

function processUserData(data: UserData): string {
  return data.name;
}
```

**ALWAYS remove unused variables and imports immediately:**

```typescript
// ❌ WRONG - Unused imports and variables
import React, { useState, useEffect } from 'react'; // useEffect unused
import { SomeUnusedType } from './types'; // unused import

const Component = () => {
  const [data, setData] = useState(null); // setData unused
  const unusedVariable = 'test'; // unused variable

  return <div>Content</div>;
};

// ✅ CORRECT - Only used imports and variables
import React, { useState } from 'react';

const Component = () => {
  const [data] = useState(null);

  return <div>Content</div>;
};
```

**NEVER use console methods** - Use structured logger instead:

```typescript
// ❌ WRONG - Console usage
console.log('Debug message');
console.error('Error occurred');

// ✅ CORRECT - Structured logger
import { logger } from '../logging/logger';

logger.debug('Debug message', { context: 'additional-data' });
logger.error('Error occurred', { error, module: 'component-name' });
```

**ALWAYS check for existing types before creating new ones:**

```typescript
// ✅ CORRECT - Check src/types/ directory first
import { UserData, ApiResponse } from '../types/user';
import { AuthToken } from '../types/auth';

// Only create new types if they don't exist
interface NewFeatureData {
  id: string;
  feature: string;
}

// ❌ WRONG - Creating duplicate types without checking
interface User {
  // UserData already exists in src/types/user.ts
  id: number;
  name: string;
}
```

**Type Creation Guidelines:**

- Search `src/types/` directory for existing interfaces and types
- Use semantic search or grep to find similar type definitions
- Extend existing types when appropriate: `interface ExtendedUser extends UserData`
- Group related types in the same file (e.g., all auth-related types in `src/types/auth.ts`)
- Use specific, descriptive names that indicate the type's purpose

**React Components:**

- Use functional components with hooks
- Implement proper error boundaries
- Follow component composition patterns

**Component Structure Standards:**

- **Component Definition Pattern:**

  ```typescript
  import React from 'react';
  import styles from '../styles/ComponentName.module.css';

  interface ComponentNameProps {
    // Props defined with specific types (no any)
  }

  const ComponentName: React.FC<ComponentNameProps> = ({ prop1, prop2 }) => {
    // Hooks at the top
    // State and derived values
    // Event handlers

    return (
      <div className={styles.container}>
        {/* JSX with semantic HTML and accessibility attributes */}
      </div>
    );
  };

  export default ComponentName;
  ```

- Include explicit accessibility attributes (aria-\* attributes, role, etc.)
- Use semantic HTML elements (`<button>`, `<nav>`, `<article>`, etc.) instead of generic `<div>`s
- Always include skip navigation links for keyboard users in page components
- **ALWAYS add unique IDs to all interactable elements** - Every button, input, form, link, and other interactive element must have a unique `id` attribute for testing purposes

**Element ID Requirements:**

- **Buttons**: Use descriptive IDs like `#submit-button`, `#cancel-button`, `#edit-content-button`
- **Form inputs**: Use field-specific IDs like `#email`, `#password`, `#firstName`
- **Links**: Use descriptive IDs like `#login-link`, `#dashboard-link`, `#header-home`
- **Form elements**: Use IDs like `#login-form`, `#registration-form`
- **Containers**: Use IDs like `#main-content`, `#dashboard-container`, `#error-message`
- **Navigation**: Use IDs like `#main-nav`, `#header-nav`, `#breadcrumb-nav`

**ID Naming Conventions:**

- Use kebab-case for all IDs (lowercase with hyphens)
- Be descriptive and specific to the element's purpose
- Include context when needed (e.g., `#header-logout` vs `#modal-logout`)
- For lists/tables, use patterns like `#user-row-{id}`, `#role-{rolename}`

**File Organization:**

- Group related functionality in appropriate directories
- Use descriptive, clear filenames
- Maintain consistent import/export patterns

**Naming Standards:**

**NEVER use generic names like "helpers", "utils", "utilities", "common", or other overly broad terms.** These names are too permissive and become dumping grounds that violate the Single Responsibility Principle.

**Examples of FORBIDDEN naming patterns:**

- Folders: `helpers/`, `utils/`, `utilities/`, `common/`, `misc/`
- Files: `helpers.ts`, `utils.ts`, `common.ts`, `miscellaneous.ts`
- Classes: `Helper`, `Utility`, `CommonUtils`
- Functions: `helperFunction`, `utilityMethod`

**Instead, use descriptive names that clearly indicate purpose:**

- `validation/` instead of `helpers/`
- `authentication/` instead of `auth-utils/`
- `dateFormatting.ts` instead of `date-utils.ts`
- `UserValidator` instead of `UserHelper`
- `formatCurrency()` instead of `currencyHelper()`

**When refactoring existing generic names:**

1. Identify the actual responsibility and purpose
2. Create appropriately named replacement with specific, descriptive name
3. Update all references throughout the codebase
4. Remove the old generic implementation
5. This applies to all levels: folders, files, classes, functions, variables

**Authentication Implementation Standards:**

- **ALWAYS use the established authentication hooks and components:**
  - `useAuth()` hook from BetterAuthProvider for authentication state and functions
  - `withAuth` higher-order component for protecting pages
  - `UserRole` enum for role-based access control

- **Page Protection Pattern:**

  ```typescript
  import withAuth from '../auth/withAuth';
  import { UserRole } from '../lib/auth-shared';

  const ProtectedPage = () => {
    const { userProfile } = useAuth();
    // Component implementation
  };

  export default withAuth(ProtectedPage, [UserRole.User, UserRole.Admin]);
  ```

- **Role-Based Rendering Pattern:**

  ```typescript
  const { hasRole } = useAuth();

  {hasRole(UserRole.Admin) && (
    <AdminOnlyComponent />
  )}
  ```

## Authentication Backend Abstraction Standards

**CRITICAL: NEVER access authentication database directly. ALWAYS use Better Auth APIs.**

### Database Access Prohibition

**FORBIDDEN PATTERNS - These will break the authentication system:**

```typescript
// ❌ WRONG - NEVER do direct database queries against auth tables
const { Pool } = await import('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const users = await pool.query('SELECT * FROM "user"');

// ❌ WRONG - Never access auth schema directly
const sessions = await pool.query('SELECT * FROM "session" WHERE userId = $1');

// ❌ WRONG - Never manipulate auth tables directly
await pool.query('UPDATE "user" SET role = $1 WHERE id = $2');
```

**REQUIRED PATTERNS - Always use Better Auth APIs:**

```typescript
// ✅ CORRECT - Use Better Auth server-side admin API
const adminApi = auth.api as any; // Type cast for admin methods
const usersResponse = await adminApi.listUsers({
  query: { limit: 100, offset: 0 },
});

// ✅ CORRECT - Use Better Auth session API
const session = await auth.api.getSession({
  headers: new Headers(req.headers as Record<string, string>),
});

// ✅ CORRECT - Use Better Auth user management API
await adminApi.setRole({ body: { userId, role: 'admin' } });
```

### Better Auth TypeScript Integration

**ALWAYS use Better Auth's TypeScript inference for proper types:**

```typescript
// ✅ CORRECT - Infer types from auth instance
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.User;

// ✅ CORRECT - Use inferAdditionalFields plugin for client
import { inferAdditionalFields } from 'better-auth/client/plugins';
import type { auth } from './auth';

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    inferAdditionalFields<typeof auth>(), // Infers role and other custom fields
  ],
});
```

### Why This Abstraction Is Critical

1. **Schema Independence**: Better Auth manages its own schema evolution
2. **Security**: Direct database access bypasses Better Auth's security layers
3. **Consistency**: All auth operations use the same validated patterns
4. **Updates**: Better Auth plugin updates won't break your code
5. **Type Safety**: Better Auth provides complete type inference for all fields

### Admin API Usage Patterns

**Server-side admin operations (in API routes):**

```typescript
import { auth } from '../../../lib/auth';

// Get admin API with proper typing
const adminApi = auth.api as any;

// List users with pagination and search
const users = await adminApi.listUsers({
  query: {
    limit: pageSize,
    offset: (page - 1) * pageSize,
    searchValue: search,
    searchField: 'email',
  },
});

// Create user with role
const newUser = await adminApi.createUser({
  body: {
    email: 'user@example.com',
    password: 'secure-password',
    name: 'User Name',
    role: 'admin',
  },
});

// Update user role
await adminApi.setRole({
  body: { userId: 'user-id', role: 'admin' },
});

// Remove user
await adminApi.removeUser({
  body: { userId: 'user-id' },
});
```

**Client-side admin operations (in React components):**

```typescript
import { authClient } from '../lib/auth-client';

// List users on client
const { data: users, error } = await authClient.admin.listUsers({
  query: { limit: 10, offset: 0 },
});

// Create user on client
const { data: newUser, error } = await authClient.admin.createUser({
  body: { email, password, name, role: 'user' },
});
```

**NEVER query auth database directly under any circumstances.** Better Auth provides comprehensive APIs for all authentication and user management operations.

## Authentication Backend Abstraction Standards

**CRITICAL: NEVER expose authentication backend implementation details in the UI.**

The UI must remain completely agnostic about which authentication system is being used (Better Auth, Auth0, custom, etc.). This ensures the frontend remains decoupled and can work with any authentication backend without code changes.

**FORBIDDEN UI References:**

- ❌ NEVER mention specific auth provider names in user-facing text, error messages, or UI labels
- ❌ NEVER reference backend-specific concepts like "realm", "client", "admin console"
- ❌ NEVER expose backend error messages directly to users
- ❌ NEVER include backend system names in logs visible to end users

**CORRECT UI Language Patterns:**

```typescript
// ❌ WRONG - Exposes backend implementation
'User will be removed from the system';
'Authentication failed';
'Check your administrator console';
'Password policy not met'; // Raw backend error

// ✅ CORRECT - Backend-agnostic language
'User will be removed from the system';
'Authentication failed';
'Contact your administrator';
'Password does not meet security requirements';
```

**Error Message Translation:**

- **Always translate backend-specific errors into user-friendly, generic messages**
- **Provide actionable guidance without exposing technical details**
- **Use application-specific terminology, not backend-specific terms**

**Examples of Proper Abstraction:**

```typescript
// ✅ CORRECT - Generic user management language
'Delete user from ScaledTest';
'User account will be permanently removed';
'Access to the application will be revoked';
'Please contact support for account issues';

// ✅ CORRECT - Generic authentication language
'Sign in to your account';
'Authentication required';
'Invalid credentials';
'Session expired';
```

**Implementation Pattern:**

```typescript
// ✅ CORRECT - Abstract error handling
const getFormattedError = (backendError: string): string => {
  if (backendError.includes('password policy')) {
    return 'Password does not meet security requirements';
  }
  if (backendError.includes('user not found')) {
    return 'Account not found';
  }
  return 'An error occurred. Please try again.';
};
```

**Benefits of This Approach:**

1. **Backend Flexibility**: Can switch authentication providers without UI changes
2. **User Experience**: Users get consistent, brand-aligned messaging
3. **Professional Appearance**: No technical jargon confuses users
4. **Maintainability**: Centralized error handling and messaging
5. **Security**: Doesn't leak information about internal systems

## Accessibility Standards

**ALWAYS prioritize accessibility when creating visual elements:**

- Use semantic HTML elements for proper screen reader support
- Ensure sufficient color contrast ratios (WCAG 2.1 AA minimum)
- Provide alternative text for images and visual content
- Implement proper focus management and keyboard navigation
- Use ARIA attributes when semantic HTML is insufficient

**Color Selection Guidelines:**

- **ALWAYS use the established amber/charcoal theme** - see "Established Color Theme Standards" section
- Reference semantic color tokens from `src/styles/globals.css`
- Test color contrast using the `/color-demo` page
- Avoid relying solely on color to convey information
- Provide additional visual or textual indicators alongside color coding
- **NEVER modify theme colors** without explicit user request

**ALWAYS add accessibility tests for new visual components:**

- Create corresponding accessibility tests in `tests/ui/accessibility.test.ts`
- Test keyboard navigation, screen reader compatibility, and focus management
- Verify color contrast and visual accessibility requirements
- Follow existing accessibility test patterns in the codebase

## Performance Considerations

**ALWAYS follow established performance optimization practices:**

- **Component Optimization:**
  - Use React.memo for expensive pure components
  - Implement useMemo for computationally intensive calculations
  - Apply useCallback for event handlers passed to child components
  - Create virtualized lists for large datasets using established patterns

- **Next.js Optimizations:**
  - Use Image component for optimized image loading and display
  - Implement proper code splitting with dynamic imports
  - Apply getStaticProps/getServerSideProps appropriately based on data requirements
  - Utilize Incremental Static Regeneration for dynamic content that changes infrequently

- **Data Fetching Strategies:**
  - Follow SWR patterns for client-side data fetching
  - Implement proper loading and error states for all data fetching operations
  - Use appropriate caching strategies based on data volatility
  - Batch API requests where possible to reduce network overhead

- **Resource Management:**
  - Lazy load non-critical components and features
  - Implement proper cleanup in useEffect hooks to prevent memory leaks
  - Monitor and optimize bundle sizes with established tools and patterns
  - Follow the project's established patterns for optimized CSS delivery

## Logging Standards

**NEVER use console.log, console.error, etc. in any code, including tests.** All logging must use the structured logger from `src/logging/logger.ts`

- If console logging is found while working with a file, it should be updated to use the structured logger.

- For all logging (production code and tests), use appropriate log levels:

  ```typescript
  import { logger } from '../logging/logger';

  logger.info('Operation succeeded', { userId, operation });
  logger.error('Operation failed', { error, context });
  logger.debug('Processing data', { data });
  ```

- Include relevant context objects with log messages
- **Console Usage Rules:**
  - All code: The ESLint rule `no-console: "error"` will catch violations in both production and test code
  - During development: Temporary console statements are allowed for debugging but must be removed before committing
- Always include useful information in log messages to aid troubleshooting
- Use appropriate log levels based on the severity and purpose of the message

## Validation Standards

**NEVER re-run failing tests without making changes first.** If tests fail:

1. Analyze the failure output carefully
2. Make necessary code changes to fix the issues
3. Only then re-run the tests
4. Avoid repeated test runs without modifications

**Final Validation Process:** After completing any task, ALWAYS run this validation command:

- Run `npm run test` to ensure **ALL** tests pass (this includes automatic formatting, TypeScript compilation, and build validation)

**IMPORTANT: `npm run test` includes a complete build step.** Do NOT run `npm run build` separately before `npm run test` as this is redundant and wastes time. The test command automatically:

1. Runs code formatting with Prettier
2. Performs TypeScript compilation and type checking
3. Builds the entire Next.js application
4. Executes all test suites (unit, component, integration, and system tests)

The single `npm run test` command runs formatting, TypeScript compilation of test files, and all test suites (unit, component, integration, and system tests) in one operation. If any step fails, the task is not complete.

If environment variables are needed for tests, ensure they are properly set up before running the tests.

**CRITICAL: ALL TESTS MUST PASS** after any change to the codebase. This is a non-negotiable requirement. The validation is incomplete until `npm run test` succeeds without errors.

**NEVER re-run the same command multiple times without making changes** when it produces errors. Each failed command must be followed by meaningful code changes before trying again.

**Error Resolution Priority:**

- Format errors: Fix code style and formatting issues
- Build errors: Resolve TypeScript errors, missing imports, syntax issues
- Test failures: Address failing test cases and logic errors

**EFFICIENCY NOTE:** Since `npm run test` performs all validation steps (formatting, building, and testing), avoid running individual commands like `npm run build` or `npm run format` separately unless you specifically need to isolate one step for debugging purposes.

## Jest Configuration and CLI Usage

**Jest Multi-Project Setup:**

This project uses Jest's multi-project configuration with four distinct test types:

- **Unit** - Tests for individual functions and utilities (`tests/unit/`)
- **Components** - React component tests (`tests/components/`)
- **Integration** - API and service integration tests (`tests/integration/`)
- **System** - End-to-end system tests (`tests/system/`)

**CORRECT Jest CLI Usage:**

**Run all tests:**

```bash
npm run test
```

**Run specific project types:**

```bash
# Run only unit tests
npx jest --selectProjects Unit

# Run only component tests
npx jest --selectProjects Components

# Run multiple project types
npx jest --selectProjects Unit,Components
```

**Filter tests by name pattern:**

```bash
# Run tests with specific name pattern
npx jest --testNamePattern="authentication"

# Run specific test file patterns
npx jest --testPathPattern="auth"
```

**NEVER use invalid Jest flags.** These are NOT valid Jest CLI options:

- ❌ `--env` (this is not a Jest CLI flag)
- ❌ `--config-env` (this does not exist)
- ❌ Custom environment configuration flags

**ES Module Support in Jest:**

- **Custom Reporters:** Must point to compiled `.js` files, not TypeScript source files
- **Module Resolution:** Jest supports ES modules when the project has `"type": "module"` in `package.json`
- **Build Requirements:** TypeScript reporters must be compiled to ES2024 modules before Jest can load them
- **Import Paths:** Use relative imports in Jest configuration: `./dist/logging/enhancedCtrfReporter.js`

**Jest Reporter Configuration:**

```typescript
// ✅ CORRECT - Point to compiled JS file
reporters: ['default', './dist/logging/enhancedCtrfReporter.js'];

// ❌ WRONG - Point to TypeScript source
reporters: ['default', './src/logging/enhancedCtrfReporter.ts'];
```

**TypeScript Build for Jest:**

- Include Jest reporters in the main TypeScript build (`tsconfig.json`)
- Ensure reporters are compiled to the same module format as the project (ES2024)
- Do not create separate build configurations unless absolutely necessary
- Jest will load ES module reporters correctly in ES module projects

## Testing and Quality Assurance

**Test Design Philosophy:**

- **Test behaviors, not implementations** - Focus on what the component does, not how it does it
- Test user interactions and expected outcomes
- Avoid testing internal state or implementation details
- Write tests that remain valid even when refactoring code

**CRITICAL: Test Integrity Standards**

**NEVER write tests that skip validation and mark themselves as passing.** This includes:

- Tests that catch errors and log them as "skipped" instead of failing
- Tests that check permissions/access and skip execution instead of ensuring proper test user setup
- Tests that use try-catch blocks to avoid legitimate test failures
- Tests that check conditions and skip assertions instead of setting up proper test preconditions

**Examples of FORBIDDEN test patterns:**

```typescript
// ❌ WRONG - This test will always pass even when it should fail
test('Admin functionality should work', async () => {
  try {
    await accessAdminPage();
    // test logic
  } catch (error) {
    testLogger.info('Test skipped - no admin access');
    // Test passes without actually testing anything!
  }
});

// ❌ WRONG - Conditional skipping instead of proper setup
test('Feature should work for admin users', async () => {
  if (!hasAdminAccess()) {
    testLogger.info('Skipping admin test');
    return; // Test passes without testing
  }
  // test logic
});
```

**Correct approach:**

```typescript
// ✅ CORRECT - Ensure proper test setup and let legitimate failures occur
test('Admin functionality should work', async () => {
  // Use proper test user with admin privileges
  await loginPage.loginWithUser(TestUsers.OWNER);
  await accessAdminPage(); // If this fails, the test should fail
  // test assertions - no try-catch to hide failures
});
```

**Test User Management:**

- Use appropriate test users from `TestUsers` model for different permission levels
- `TestUsers.READONLY` for basic user functionality
- `TestUsers.MAINTAINER` for elevated permissions
- `TestUsers.OWNER` for admin/owner functionality
- Set up proper authentication before testing restricted functionality
- Let tests fail if permissions are insufficient - fix the test setup, don't skip the test

**Specific Testing Patterns:**

- **ALWAYS test accessibility** for UI components using axe-playwright:

  ```typescript
  import { injectAxe, getViolations } from 'axe-playwright';

  await injectAxe(page);
  const violations = await getViolations(page);
  expect(violations.length).toBe(0);
  ```

- **Page Object Pattern** for UI tests:
  - Create page models in `tests/ui/pages/` directory
  - Implement methods for common interactions
  - Abstract implementation details from test cases
  - **CRITICAL: playwright.page usage restriction** - The `playwright.page` object should ONLY be used in the constructor of page classes under `tests/ui/pages/`. All other test code should interact through page object methods
  - **Generic methods placement** - If a test needs to use a method that is more generic and not specific to a particular page, it should be added to the `basePage` class
  - **Selector requirements** - When creating or changing Playwright page objects, ONLY use IDs as selectors (e.g., `#elementId`, `[id="elementId"]`)
  - **Missing ID handling** - If an ID does not exist in the HTML element that needs to be tested, you MUST first add the ID to the HTML element in the source code, then reference it in the tests

- **Test Data Management:**
  - Use the `tests/data/` directory for test data generation (avoid generic names like "utils")
  - Prefer generated data over hardcoded test values
  - Clean up test data in afterEach/afterAll blocks

- **Separate Test Types:**
  - Unit tests with Jest
  - Component tests with React Testing Library
  - Integration tests for API interactions
  - System tests for end-to-end workflows (includes UI testing with Playwright)

**Test Execution Guidelines:**

- Run tests only after making meaningful changes
- Always investigate and fix test failures before re-running
- Use the established test structure in `tests/` directory
- Follow existing test patterns and conventions
- **NEVER create a separate `test:ui` script** - UI tests are part of the system test suite (`npm run test:system`)
- **EVERY TEST MUST PASS** after any code change before the task is considered complete
- When any tests fail, prioritize fixing them immediately before moving on to other tasks
- Ensure all test environments (including environment variables) are properly configured
- Run the complete test suite using `npm run test` to verify ALL tests pass

**Jest Project-Specific Testing:**

When working on specific areas of the codebase, you can run targeted test suites:

```bash
# When working on utilities or core logic
npx jest --selectProjects Unit

# When working on React components
npx jest --selectProjects Components

# When working on API integrations
npx jest --selectProjects Integration

# When working on end-to-end workflows
npx jest --selectProjects System
```

**Test Filtering Best Practices:**

- Use `--testNamePattern` to run tests with specific names: `npx jest --testNamePattern="login"`
- Use `--testPathPattern` to run tests in specific files: `npx jest --testPathPattern="auth"`
- Combine project selection with filtering: `npx jest --selectProjects Unit --testNamePattern="validation"`
- Always run the full test suite (`npm run test`) before completing any task

## Documentation Standards

**Keep documentation concise and focused:**

- Use the main `README.md` at the project root for essential information
- Avoid over-documenting or creating unnecessary documentation files
- Focus on practical, actionable information rather than verbose explanations
- Update existing documentation rather than creating new files

When working on this project, examine existing components and maintain consistency with the current architecture.

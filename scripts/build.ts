import { spawn } from 'child_process';

// Simple console logger for build scripts (compatible with progress bar)
const buildLogger = {
  info: (message: string) => {
    // Use console.log for build scripts to avoid pino formatting conflicts
    console.log(message);
  },
};

export class SmartBuildProgress {
  private currentStage = 0;
  private stages = [
    { name: 'Building application...', weight: 10 },
    { name: 'Formatting code', weight: 15 },
    { name: 'Running ESLint', weight: 20 },
    { name: 'Type checking', weight: 25 },
    { name: 'Compiling', weight: 35 },
    { name: 'Optimizing', weight: 45 },
    { name: 'Generating pages', weight: 85 },
    { name: 'Finalizing', weight: 100 },
  ];
  private interval: NodeJS.Timeout | null = null;
  private isComplete = false;
  private isTTY = false;

  constructor() {
    // Check if we're running in a TTY environment (supports cursor control)
    this.isTTY = Boolean(
      process.stdout.isTTY &&
        typeof process.stdout.clearLine === 'function' &&
        typeof process.stdout.cursorTo === 'function'
    );
  }

  start() {
    if (this.isTTY) {
      // TTY environment: Use interactive progress bar
      console.log(''); // Add a newline before starting progress
      this.showProgress();

      // Fallback timer to ensure progress moves even if we miss some output
      this.interval = setInterval(() => {
        if (!this.isComplete && this.currentStage < this.stages.length - 1) {
          // Slowly advance if we haven't seen output for a while
          this.currentStage = Math.min(this.currentStage + 0.1, this.stages.length - 1);
          this.showProgress();
        }
      }, 1000);
    } else {
      // Non-TTY environment: Use simple text output
      buildLogger.info('→ Starting build process...');
    }
  }

  updateFromOutput(output: string) {
    if (this.isComplete) return;

    const previousStage = this.currentStage;

    // Update stage based on build output patterns
    const outputLower = output.toLowerCase();

    // Define patterns for each stage (skip stage 0 as it's the starting stage)
    const stagePatterns = [
      [], // Stage 0: Starting (no patterns needed)
      ['prettier', 'format'],
      ['eslint', 'linting'],
      ['checking validity of types', 'tsc'],
      ['creating an optimized production build', 'compiled successfully'],
      ['optimizing', 'collecting page data'],
      ['generating static pages', 'pages'],
      ['finalizing', 'build traces'],
    ];

    // Find the highest matching stage
    for (let i = stagePatterns.length - 1; i >= 1; i--) {
      if (stagePatterns[i].some(pattern => outputLower.includes(pattern))) {
        this.currentStage = Math.max(this.currentStage, i);
        break;
      }
    }

    // Show progress differently based on environment
    if (this.isTTY) {
      this.showProgress();
    } else {
      // In non-TTY environments, only log when we advance to a new stage
      if (Math.floor(this.currentStage) > Math.floor(previousStage)) {
        const stage = this.stages[Math.floor(this.currentStage)];
        const percentage = Math.floor((stage.weight / 100) * 100);
        buildLogger.info(`→ [${percentage}%] ${stage.name}`);
      }
    }
  }

  private showProgress() {
    if (!this.isTTY) return; // Only show interactive progress in TTY environments

    const stage = this.stages[Math.floor(this.currentStage)];
    const progress = stage.weight / 100;
    const barLength = 30;
    const filledLength = Math.floor(barLength * progress);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    const percentage = Math.floor(progress * 100);

    // Clear line and show progress with current stage (pad with spaces to clear previous text)
    const line = `   [${bar}] ${percentage}% ${stage.name}`;
    process.stdout.write(`\r${line}${' '.repeat(Math.max(0, 60 - line.length))}`);
  }

  complete() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isComplete = true;
    this.currentStage = this.stages.length - 1;

    if (this.isTTY) {
      // TTY environment: Clear the progress line and write completion message
      try {
        if (process.stdout.clearLine && process.stdout.cursorTo) {
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
        }
      } catch {
        // If clearing fails, just add a newline
        process.stdout.write('\n');
      }
    }

    console.log('✅ Build completed successfully');
  }
}

/**
 * Run build process with smart progress tracking
 */
function runBuildWithProgress(): Promise<{ output: string; progress: SmartBuildProgress }> {
  return new Promise((resolve, reject) => {
    const progress = new SmartBuildProgress();
    progress.start();

    // Use cmd on Windows to run the actual build commands
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'cmd' : 'sh';
    const buildCommand = 'npm run format && npm run lint && tsc && next build';
    const args = isWindows ? ['/c', buildCommand] : ['-c', buildCommand];

    const child = spawn(command, args, {
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
      stdio: 'pipe',
    });

    let output = '';
    let error = '';

    child.stdout?.on('data', data => {
      const chunk = data.toString();
      output += chunk;
      progress.updateFromOutput(chunk);
    });

    child.stderr?.on('data', data => {
      const chunk = data.toString();
      error += chunk;
    });

    child.on('close', code => {
      progress.complete();

      process.stdout.write(output);

      if (error.trim()) {
        process.stderr.write(error);
      }

      if (code === 0) {
        resolve({ output, progress });
      } else {
        reject(new Error(`Build failed with code ${code}`));
      }
    });
  });
}

export { runBuildWithProgress };

// Main execution when run directly
async function main() {
  try {
    await runBuildWithProgress();
    process.exit(0);
  } catch (error) {
    console.error('Build failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run main if this file is executed directly
if (process.argv[1]?.endsWith('build.ts') || process.argv[1]?.endsWith('build.js')) {
  main();
}

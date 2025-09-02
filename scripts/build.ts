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

  start() {
    // Ensure we start on a fresh line
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
  }

  updateFromOutput(output: string) {
    if (this.isComplete) return;

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

    this.showProgress();
  }

  private showProgress() {
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

    // Clear the progress line and write completion message
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
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
    const buildCommand = 'npm run format && next lint && tsc && next build';
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

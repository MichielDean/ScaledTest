/**
 * Port cleanup utility using established Node.js libraries
 * Uses kill-port and get-port for cross-platform reliability
 */

import killPort from 'kill-port';
import net from 'net';
import { testLogger } from '../logging/logger';

/**
 * Check if a port is in use using Node.js net module
 */
export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();

    server.listen(port, () => {
      server.close(() => {
        resolve(false); // Port is available
      });
    });

    server.on('error', () => {
      resolve(true); // Port is in use
    });
  });
}

/**
 * Clean up port using kill-port library - cross-platform solution
 */
export async function cleanupPort(
  port: number,
  options: {
    maxRetries?: number;
    retryDelay?: number;
  } = {}
): Promise<boolean> {
  const { maxRetries = 3, retryDelay = 1000 } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const isInUse = await isPortInUse(port);
      if (!isInUse) {
        testLogger.debug({ port }, `Port ${port} is available`);
        return true;
      }

      testLogger.debug(
        { port, attempt },
        `Port ${port} is in use, attempting cleanup (attempt ${attempt}/${maxRetries})`
      );

      // Use kill-port library for cross-platform port cleanup
      await killPort(port);

      testLogger.debug({ port }, `Killed processes on port ${port}`);

      // Wait a bit for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if port is now available
      const stillInUse = await isPortInUse(port);
      if (!stillInUse) {
        testLogger.info({ port }, `Port ${port} successfully cleaned up`);
        return true;
      }

      // Wait before next attempt
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    } catch (error) {
      testLogger.warn({ err: error, port, attempt }, `Port cleanup attempt ${attempt} failed`);

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // Final check
  const finalCheck = await isPortInUse(port);
  if (!finalCheck) {
    testLogger.info({ port }, `Port ${port} successfully cleaned up`);
    return true;
  }

  testLogger.warn({ port }, `Port ${port} cleanup failed after ${maxRetries} attempts`);
  return false;
}

/**
 * Wait for port to become available
 */
export async function waitForPortAvailable(
  port: number,
  timeout = 10000,
  interval = 500
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const inUse = await isPortInUse(port);
    if (!inUse) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return false;
}

/**
 * Get an available port starting from a preferred port
 */
export async function getAvailablePort(preferredPort?: number): Promise<number> {
  const getPort = (await import('get-port')).default;
  return await getPort({ port: preferredPort });
}

/**
 * Kill processes using a specific port with retry logic
 */
export async function killProcessesUsingPort(port: number, retries = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await killPort(port);
      testLogger.debug({ port, attempt }, `Killed processes on port ${port}`);

      // Wait and verify
      await new Promise(resolve => setTimeout(resolve, 500));
      const stillInUse = await isPortInUse(port);

      if (!stillInUse) {
        return true;
      }

      if (attempt < retries) {
        testLogger.debug({ port, attempt }, `Port ${port} still in use, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      testLogger.debug({ err: error, port, attempt }, `Failed to kill processes on port ${port}`);

      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  return false;
}

// Global registry to track processes we've spawned for cleanup purposes
const spawnedProcesses = new Map<number, { pid: number; port?: number; name?: string }>();

/**
 * Register a spawned process for tracking
 */
export function registerSpawnedProcess(pid: number, port?: number, name?: string): void {
  spawnedProcesses.set(pid, { pid, port, name });
  testLogger.debug({ pid, port, name }, 'Registered spawned process');
}

/**
 * Unregister a process when it's cleanly terminated
 */
export function unregisterSpawnedProcess(pid: number): void {
  if (spawnedProcesses.has(pid)) {
    const proc = spawnedProcesses.get(pid);
    spawnedProcesses.delete(pid);
    testLogger.debug({ pid, proc }, 'Unregistered spawned process');
  }
}

/**
 * Get all registered processes using a specific port
 */
export function getRegisteredProcessesUsingPort(port: number): number[] {
  const pids: number[] = [];

  for (const [pid, info] of spawnedProcesses.entries()) {
    if (info.port === port) {
      pids.push(pid);
    }
  }

  return pids;
}

/**
 * Clean up all registered processes for a specific port
 */
export async function cleanupRegisteredProcesses(port: number): Promise<number> {
  const pids = getRegisteredProcessesUsingPort(port);
  let cleanedCount = 0;

  for (const pid of pids) {
    try {
      // Try graceful termination first
      process.kill(pid, 'SIGTERM');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if process still exists, force kill if needed
      try {
        process.kill(pid, 0); // Check if exists
        process.kill(pid, 'SIGKILL'); // Force kill
      } catch {
        // Process is already gone
      }

      unregisterSpawnedProcess(pid);
      cleanedCount++;
      testLogger.debug({ pid, port }, `Cleaned up registered process ${pid}`);
    } catch (error) {
      testLogger.debug({ err: error, pid }, `Failed to clean up process ${pid}`);
    }
  }

  return cleanedCount;
}

/**
 * Check if a process is still alive
 */
export async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0); // Signal 0 just checks if process exists
    return true;
  } catch {
    return false;
  }
}

import { spawn, execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("Starting test servers with Helm...");

const rootDir = resolve(__dirname, "..");
const helmRelease = "scaledtest";
const helmNamespace = "scaledtest";
const helmChart = "./deploy/helm/scaledtest";
const valuesFile = "./deploy/helm/scaledtest/values-dev.yaml";

// Check if a service is accessible via HTTP
function checkServiceAccessible(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (res) => {
      resolve(res.statusCode < 500); // Any non-server-error response means it's accessible
    });
    request.on("error", () => resolve(false));
    request.setTimeout(2000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

// Check if services are already running
async function servicesAlreadyRunning() {
  const frontendAccessible = await checkServiceAccessible("http://localhost:5173");
  const backendAccessible = await checkServiceAccessible("http://localhost:8080");
  return frontendAccessible && backendAccessible;
}

// Check if Helm release already exists
function helmReleaseExists() {
  try {
    execSync(`helm status ${helmRelease} -n ${helmNamespace}`, { cwd: rootDir, stdio: "ignore", shell: true });
    return true;
  } catch {
    return false;
  }
}

// Install or upgrade Helm release
function installOrUpgradeHelm() {
  const exists = helmReleaseExists();
  const action = exists ? "upgrade" : "install";
  const args = [
    action,
    helmRelease,
    helmChart,
    "-n",
    helmNamespace,
    "--create-namespace",
    "-f",
    valuesFile,
    "--set",
    "postgresql.primary.initdb.scriptsConfigMap=scaledtest-postgres-initdb",
    "--wait",
    "--timeout",
    "5m"
  ];

  console.log(`Helm release ${exists ? "exists" : "does not exist"} in namespace ${helmNamespace}`);
  console.log(`Running: helm ${args.join(" ")}`);
  
  const helm = spawn("helm", args, {
    cwd: rootDir,
    shell: true,
    stdio: "inherit",
  });

  return new Promise((resolve, reject) => {
    helm.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Helm exited with code ${code}`));
      }
    });
  });
}

// Start port forwards
function startPortForwards() {
  console.log("Starting port forwards...");
  
  // Backend port forward (8080) - use namespace flag
  const backendPf = spawn("kubectl", ["port-forward", "-n", helmNamespace, `svc/${helmRelease}-backend`, "8080:8080"], {
    cwd: rootDir,
    shell: true,
    stdio: "ignore",
  });
  
  // Frontend port forward (5173 -> 80) - use namespace flag
  const frontendPf = spawn("kubectl", ["port-forward", "-n", helmNamespace, `svc/${helmRelease}-frontend`, "5173:80"], {
    cwd: rootDir,
    shell: true,
    stdio: "ignore",
  });
  
  return { backendPf, frontendPf };
}

// Main execution
async function main() {
  try {
    // Check if services are already accessible
    const alreadyRunning = await servicesAlreadyRunning();
    
    if (alreadyRunning) {
      console.log("Services are already running and accessible");
      console.log("  Backend: http://localhost:8080");
      console.log("  Frontend: http://localhost:5173");
      console.log("Skipping Helm deployment and port forwarding");
    } else {
      // Check if Helm release exists and is deployed
      const helmExists = helmReleaseExists();
      
      if (helmExists) {
        console.log("Helm release exists, starting port forwards...");
      } else {
        console.log("Helm release not found, installing...");
        await installOrUpgradeHelm();
        console.log("Helm deployment successful");
      }
      
      const { backendPf, frontendPf } = startPortForwards();
      console.log("Port forwards started");
      console.log("  Backend: http://localhost:8080");
      console.log("  Frontend: http://localhost:5173");
      
      // Handle process termination
      const cleanup = () => {
        console.log("\nStopping port forwards...");
        backendPf.kill();
        frontendPf.kill();
        process.exit(0);
      };
      
      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
    }
    
    console.log("\nServers ready for testing\n");
    
    // Keep process alive
    await new Promise(() => {});
    
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();

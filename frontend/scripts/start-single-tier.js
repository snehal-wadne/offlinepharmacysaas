/**
 * Single-Tier Process Launcher
 *
 * Purpose:
 * Automatically starts and verifies the Backend API & PostgreSQL Database
 * before launching the Expo Frontend server. Provides a single-command
 * seamless execution flow.
 */

const { spawn, execSync } = require("child_process");
const http = require("http");
const path = require("path");

const BACKEND_PORT = process.env.PORT || 5000;
const HEALTH_URL = `http://localhost:${BACKEND_PORT}/health`;
const BACKEND_DIR = path.resolve(__dirname, "../../backend");
const FRONTEND_DIR = path.resolve(__dirname, "..");

let backendProcess = null;
let frontendProcess = null;

/**
 * Ensures PostgreSQL database service is started if stopped.
 */
const ensurePostgresRunning = () => {
  if (process.platform === "win32") {
    try {
      // 1. Try PowerShell Get-Service to find and start any PostgreSQL service
      const psScript = `Get-Service | Where-Object { $_.Name -like '*postgres*' -or $_.DisplayName -like '*postgres*' } | ForEach-Object { if ($_.Status -ne 'Running') { Start-Service $_.Name }; Write-Output $_.Name }`;
      const output = execSync(`powershell -NoProfile -Command "${psScript}"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (output && output.trim()) {
        console.log(`✓ PostgreSQL service is active (${output.trim()}).`);
        return true;
      }
    } catch (e) {}

    // 2. Fallback to common Windows service names
    const services = [
      "postgresql-x64-17",
      "postgresql-x64-16",
      "postgresql-x64-15",
      "postgresql-x64-14",
      "postgresql-x64-13",
      "postgresql-x64-12",
      "postgresql-x64-11",
      "postgresql",
      "postgres",
    ];
    for (const svc of services) {
      try {
        execSync(`net start ${svc}`, { stdio: "ignore" });
        console.log(`✓ Started PostgreSQL service: ${svc}`);
        return true;
      } catch (e) {}
    }

    // 3. Fallback to docker if running postgres container
    try {
      execSync('docker start $(docker ps -a -q --filter "name=postgres")', { stdio: "ignore" });
      console.log("✓ Started PostgreSQL Docker container.");
      return true;
    } catch (e) {}
  } else {
    try {
      execSync("sudo systemctl start postgresql || brew services start postgresql", { stdio: "ignore" });
      console.log("✓ Started PostgreSQL service.");
      return true;
    } catch (e) {}
  }
  return false;
};

/**
 * Checks if the backend HTTP server is live and healthy.
 */
const checkBackendHealth = () => {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    req.on("error", () => {
      resolve(false);
    });

    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
};

/**
 * Polls backend health check until ready or timeout reached.
 */
const waitForBackend = async (maxAttempts = 30) => {
  console.log(`⏳ Waiting for backend API to be ready at ${HEALTH_URL}...`);
  for (let i = 0; i < maxAttempts; i++) {
    const isReady = await checkBackendHealth();
    if (isReady) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};

/**
 * Cleanly terminates child processes on exit.
 */
const cleanup = () => {
  console.log("\n🛑 Shutting down single-tier application...");
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch (e) {}
  }
  if (frontendProcess) {
    try {
      frontendProcess.kill();
    } catch (e) {}
  }
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

const main = async () => {
  console.log("\n=======================================================");
  console.log(" 💊 Falah Pharmacy SaaS — Single-Tier Starter");
  console.log("=======================================================\n");

  const isAlreadyRunning = await checkBackendHealth();

  if (isAlreadyRunning) {
    console.log(`✓ Backend API server is already running on port ${BACKEND_PORT}.`);
  } else {
    console.log(`⚡ Verifying PostgreSQL database service...`);
    ensurePostgresRunning();

    console.log(`🚀 Starting Backend API server & Database initialization...`);
    
    backendProcess = spawn("node", ["src/server.js"], {
      cwd: BACKEND_DIR,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, SINGLE_TIER_RUNNING: "1" },
    });

    backendProcess.on("error", (err) => {
      console.error("❌ Failed to start backend process:", err.message);
    });

    const ready = await waitForBackend();
    if (!ready) {
      console.error("❌ Backend server failed to start in time. Exiting.");
      cleanup();
      return;
    }
  }

  let userArgs = process.argv.slice(2);
  if (userArgs[0] === "backend-only" || userArgs[0] === "noop") {
    console.log("\n✨ Backend & Database ready in single-tier background mode!");
    return;
  }

  console.log("\n✨ Backend & Database ready!");
  console.log("🌐 Launching Expo Frontend server...\n");

  if (userArgs.length === 0) {
    userArgs = ["npx", "expo", "start"];
  }

  const command = userArgs[0];
  const args = userArgs.slice(1);

  frontendProcess = spawn(command, args, {
    cwd: FRONTEND_DIR,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, SINGLE_TIER_RUNNING: "1" },
  });

  frontendProcess.on("close", (code) => {
    console.log(`Frontend exited with code ${code}`);
    cleanup();
  });
};

main();

/**
 * Legacy process launcher (Deprecated).
 * The project now uses clean standard npm scripts ("npm run web" / "npm start").
 */

const { spawn } = require("child_process");

const args = process.argv.slice(2);
if (args.length > 0 && args[0] !== "noop" && args[0] !== "backend-only") {
  const proc = spawn(args[0], args.slice(1), { stdio: "inherit", shell: true });
  proc.on("close", (code) => process.exit(code || 0));
} else {
  console.log("Single-tier script deprecated. Use 'npm run web' or 'npm start' directly.");
}


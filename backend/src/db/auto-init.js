/**
 * Automatic Database Initialization & Migration Tool
 *
 * Purpose:
 * Automatically checks PostgreSQL connectivity, creates the target database if missing,
 * applies schema.sql, and seeds development data on server launch.
 */

const fs = require("fs");
const path = require("path");
const { Client, Pool } = require("pg");
const { execSync } = require("child_process");
require("dotenv").config();

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 5432);
const DB_USER = process.env.DB_USER || "postgres";
const DB_PASSWORD = process.env.DB_PASSWORD || "root";
const DB_DATABASE = process.env.DB_DATABASE || "falah_pharmacy";

/**
 * Attempts to auto-start local PostgreSQL Windows/Linux/macOS service if stopped.
 */
const tryStartPostgresService = () => {
  if (process.platform === "win32") {
    try {
      console.log("⚡ Attempting to auto-start local PostgreSQL service...");

      // 1. Try PowerShell Get-Service to dynamically find and start any PostgreSQL service
      try {
        const psScript = `Get-Service | Where-Object { $_.Name -like '*postgres*' -or $_.DisplayName -like '*postgres*' } | ForEach-Object { if ($_.Status -ne 'Running') { Start-Service $_.Name }; Write-Output $_.Name }`;
        const output = execSync(
          `powershell -NoProfile -Command "${psScript}"`,
          {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          },
        );
        if (output && output.trim()) {
          console.log(`✓ Started PostgreSQL service(s): ${output.trim()}`);
          return true;
        }
      } catch (e) {}

      // 2. Try common PostgreSQL Windows service names
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
          console.log(`✓ Service ${svc} started.`);
          return true;
        } catch (e) {}
      }

      // 3. Try Docker container if PostgreSQL container exists
      try {
        execSync('docker start $(docker ps -a -q --filter "name=postgres")', {
          stdio: "ignore",
        });
        console.log("✓ Started PostgreSQL Docker container.");
        return true;
      } catch (e) {}
    } catch (err) {
      // ignore failures
    }
  } else {
    try {
      execSync(
        "sudo systemctl start postgresql || brew services start postgresql",
        { stdio: "ignore" },
      );
      console.log("✓ PostgreSQL service started.");
      return true;
    } catch (e) {}
  }
  return false;
};

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.SUPABASE_DB_URL;

const isRemoteOrSsl = Boolean(
  connectionString ||
  process.env.DB_SSL === "true" ||
  (process.env.DB_HOST && !["localhost", "127.0.0.1"].includes(process.env.DB_HOST))
);

/**
 * Main database auto-initializer function.
 */
const autoInitDatabase = async () => {
  console.log("🔍 Checking PostgreSQL database initialization...");

  let targetPool;

  if (connectionString) {
    console.log("⚡ Using remote database connection (Supabase/Cloud)...");
    targetPool = new Pool({
      connectionString,
      ssl: isRemoteOrSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
    });
  } else {
    const adminClient = new Client({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: "postgres",
    });

    try {
      await adminClient.connect();
    } catch (err) {
      console.warn(
        `⚠️ Could not connect to PostgreSQL on ${DB_HOST}:${DB_PORT} as user '${DB_USER}'.`,
      );
      console.warn(`Attempting service startup...`);
      tryStartPostgresService();

      // Retry once after potential service start
      try {
        await adminClient.connect();
      } catch (retryErr) {
        console.error(
          `❌ Failed to connect to PostgreSQL server: ${retryErr.message}`,
        );
        console.error(
          "Please verify PostgreSQL is installed and running on port 5432.",
        );
        throw retryErr;
      }
    }

    try {
      // 1. Ensure Database Exists
      const dbCheckRes = await adminClient.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [DB_DATABASE],
      );

      if (dbCheckRes.rows.length === 0) {
        console.log(`📦 Database '${DB_DATABASE}' does not exist. Creating...`);
        // Escape database name safely using double quotes
        await adminClient.query(`CREATE DATABASE "${DB_DATABASE}";`);
        console.log(`✓ Database '${DB_DATABASE}' created successfully.`);
      } else {
        console.log(`✓ Database '${DB_DATABASE}' exists.`);
      }
    } finally {
      await adminClient.end();
    }

    // 2. Connect to target database and verify schema
    targetPool = new Pool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_DATABASE,
      ssl: isRemoteOrSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
    });
  }

  try {
    const tableCheckRes = await targetPool.query(
      `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';`,
    );
    const tableCount = parseInt(tableCheckRes.rows[0].count, 10);

    if (tableCount === 0) {
      console.log(
        `📄 Schema missing in '${DB_DATABASE}'. Applying schema.sql...`,
      );
      const schemaPath = path.join(__dirname, "schema.sql");
      const schemaSql = fs.readFileSync(schemaPath, "utf8");
      await targetPool.query(schemaSql);
      console.log("✓ Database schema applied successfully.");
    } else {
      console.log(`✓ Database schema verified (${tableCount} tables present).`);
      // Run light migrations for schema updates
      await targetPool
        .query(
          "ALTER TABLE branches ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';",
        )
        .catch(() => {});

      await targetPool
        .query(
          `CREATE TABLE IF NOT EXISTS stock_movements (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organisation_id UUID,
          branch_name VARCHAR(255) DEFAULT 'Main Branch',
          movement_type VARCHAR(50) NOT NULL,
          item_name VARCHAR(255) NOT NULL,
          quantity VARCHAR(50) NOT NULL,
          reference VARCHAR(100) DEFAULT 'SYS-LOG',
          status VARCHAR(50) DEFAULT 'Completed',
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );`,
        )
        .catch(() => {});

      // Apply sync_mutations table migration
      try {
        const { migrateSyncMutations } = require("./migrate-sync-mutations");
        await migrateSyncMutations();
      } catch (syncMigrateErr) {
        console.warn(
          "⚠️ sync_mutations migration notice:",
          syncMigrateErr.message,
        );
      }
    }

    // 3. Verify user table seed data
    const userCheck = await targetPool.query("SELECT count(*) FROM users;");
    const userCount = parseInt(userCheck.rows[0].count, 10);

    if (userCount === 0) {
      console.log("🌱 Database is empty. Seeding initial development data...");
      try {
        const { seedDevelopmentData } = require("./seed-dev");
        await seedDevelopmentData(targetPool);
      } catch (seedErr) {
        console.warn(
          "⚠️ Seed dev output/completion:",
          seedErr.message || seedErr,
        );
      }
    }

    try {
      const { seedCustomers } = require("./seed-customers");
      await seedCustomers(targetPool);
    } catch (custSeedErr) {
      console.warn(
        "⚠️ Customer seed output/completion:",
        custSeedErr.message || custSeedErr,
      );
    }
  } catch (err) {
    console.error("❌ Database schema auto-initialization error:", err.message);
    throw err;
  } finally {
    await targetPool.end();
  }

  console.log("🚀 Database initialization check complete.");
};

if (require.main === module) {
  autoInitDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { autoInitDatabase };

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
  (connectionString &&
    !connectionString.includes("localhost") &&
    !connectionString.includes("127.0.0.1")) ||
  process.env.DB_SSL === "true" ||
  (process.env.DB_HOST &&
    !["localhost", "127.0.0.1"].includes(process.env.DB_HOST)),
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
        adminClient = new Client({
          host: DB_HOST,
          port: DB_PORT,
          user: DB_USER,
          password: DB_PASSWORD,
          database: "postgres",
        });
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

      // Ensure organisations columns exist (pharmacy_mode, admin_name)
      await targetPool
        .query(`
          ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS pharmacy_mode VARCHAR(50) DEFAULT 'single';
          ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS admin_name VARCHAR(150);
          UPDATE public.organisations SET pharmacy_mode = 'single' WHERE pharmacy_mode IS NULL;
          UPDATE public.organisations SET status = 'ACTIVE' WHERE status = 'PENDING_PAYMENT';
        `)
        .catch((err) => console.warn("⚠️ organisations columns notice:", err.message));

      // Ensure branches columns exist (admin_name, contact_person)
      await targetPool
        .query(`
          ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS admin_name VARCHAR(150);
          ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS contact_person VARCHAR(150);
          UPDATE public.branches SET admin_name = COALESCE(admin_name, contact_person, 'Admin') WHERE admin_name IS NULL OR admin_name = '';
          UPDATE public.branches SET contact_person = admin_name WHERE (contact_person IS NULL OR contact_person = '') AND admin_name IS NOT NULL;
        `)
        .catch((err) => console.warn("⚠️ branches columns notice:", err.message));

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

      // Apply sync_changes table migration
      try {
        const { migrateSyncChanges } = require("./migrate-sync-changes");
        await migrateSyncChanges();
      } catch (syncChangesErr) {
        console.warn(
          "⚠️ sync_changes migration notice:",
          syncChangesErr.message,
        );
      }

      // Ensure role, supplier_id, staff_id, supabase_auth_id exist on users
      await targetPool
        .query(`
          ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'STAFF';
          ALTER TABLE public.users ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
          ALTER TABLE public.users ADD COLUMN IF NOT EXISTS staff_id VARCHAR(50);
          ALTER TABLE public.users ADD COLUMN IF NOT EXISTS supabase_auth_id VARCHAR(100);
          ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
        `)
        .catch(() => {});

      // Apply branch admin name migration
      try {
        const { runMigration: migrateBranchAdminName } = require("./migrate-branch-admin-name");
        await migrateBranchAdminName();
      } catch (branchAdminErr) {
        console.warn("⚠️ branch admin migration notice:", branchAdminErr.message);
      }

      // Apply supplier notifications & portal schema
      try {
        await targetPool.query(`
          CREATE TABLE IF NOT EXISTS supplier_notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
            branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
            supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
            product_id UUID REFERENCES products(id) ON DELETE SET NULL,
            batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL,
            medicine_name VARCHAR(200) NOT NULL,
            supplier_name VARCHAR(200),
            current_stock INT NOT NULL DEFAULT 0,
            reorder_quantity INT NOT NULL DEFAULT 100,
            notification_type VARCHAR(50) DEFAULT 'LOW_STOCK',
            channel VARCHAR(50) DEFAULT 'EMAIL',
            priority VARCHAR(50) DEFAULT 'URGENT',
            recipient_email VARCHAR(200),
            recipient_phone VARCHAR(50),
            status VARCHAR(50) DEFAULT 'SENT',
            message TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          ALTER TABLE public.users ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
          ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'STAFF';
          CREATE INDEX IF NOT EXISTS idx_supplier_notifications_org ON supplier_notifications(organisation_id);
          CREATE INDEX IF NOT EXISTS idx_supplier_notifications_supplier ON supplier_notifications(supplier_id);
          CREATE INDEX IF NOT EXISTS idx_supplier_notifications_email ON supplier_notifications(LOWER(recipient_email));
          CREATE INDEX IF NOT EXISTS idx_supplier_notifications_status ON supplier_notifications(status);
        `);
      } catch (supErr) {
        console.warn("⚠️ supplier schema notice:", supErr.message);
      }

      // Seed/ensure quick demo accounts for Admin, FIT Staff, and Supplier
      try {
        const bcrypt = require("bcrypt");
        const passHash = await bcrypt.hash("password123", 10);
        const orgRes = await targetPool.query("SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1;");
        if (orgRes.rows.length > 0) {
          const orgId = orgRes.rows[0].id;
          
          // Admin
          const adminEmail = "admin@falahpharmacy.com";
          const adminCheck = await targetPool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1);", [adminEmail]);
          let adminId = adminCheck.rows[0]?.id;
          if (!adminId) {
            const ins = await targetPool.query(
              "INSERT INTO users (name, email, password_hash, role, status) VALUES ('Falah Pharmacy Admin', $1, $2, 'ADMIN', 'ACTIVE') RETURNING id;",
              [adminEmail, passHash]
            );
            adminId = ins.rows[0].id;
          } else {
            await targetPool.query("UPDATE users SET password_hash = $1, role = 'ADMIN', status = 'ACTIVE' WHERE id = $2;", [passHash, adminId]);
          }
          await targetPool.query(
            "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'ACTIVE') ON CONFLICT (organisation_id, user_id) DO UPDATE SET status = 'ACTIVE';",
            [orgId, adminId]
          );

          // FIT Branch Staff
          const staffEmail = "staff.fit@falahpharmacy.com";
          const staffCheck = await targetPool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1);", [staffEmail]);
          let staffId = staffCheck.rows[0]?.id;
          if (!staffId) {
            const ins = await targetPool.query(
              "INSERT INTO users (name, email, password_hash, role, status) VALUES ('FIT Fast Branch Staff', $1, $2, 'STAFF', 'ACTIVE') RETURNING id;",
              [staffEmail, passHash]
            );
            staffId = ins.rows[0].id;
          } else {
            await targetPool.query("UPDATE users SET password_hash = $1, role = 'STAFF', status = 'ACTIVE' WHERE id = $2;", [passHash, staffId]);
          }
          const omRes = await targetPool.query(
            "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'ACTIVE') ON CONFLICT (organisation_id, user_id) DO UPDATE SET status = 'ACTIVE' RETURNING id;",
            [orgId, staffId]
          );
          const membershipId = omRes.rows[0]?.id;
          const branchRes = await targetPool.query("SELECT id FROM branches WHERE organisation_id = $1 ORDER BY created_at ASC;", [orgId]);
          const fitBranchId = branchRes.rows[1]?.id || branchRes.rows[0]?.id;
          const roleRes = await targetPool.query("SELECT id FROM roles WHERE role_identifier IN ('PHARMACIST', 'CASHIER', 'STAFF') LIMIT 1;");
          const roleId = roleRes.rows[0]?.id;
          if (membershipId && fitBranchId && roleId) {
            await targetPool.query("DELETE FROM branch_assignments WHERE membership_id = $1;", [membershipId]);
            await targetPool.query(
              "INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary) VALUES ($1, $2, $3, TRUE);",
              [membershipId, fitBranchId, roleId]
            );
          }

          // Supplier Users: ensure all suppliers have login credentials in users table
          const existingSupplierUsers = await targetPool.query(
            "SELECT supplier_id, LOWER(email) AS email FROM users WHERE supplier_id IS NOT NULL OR role = 'SUPPLIER';"
          );
          const existingSupplierIds = new Set(
            existingSupplierUsers.rows.map((r) => r.supplier_id).filter(Boolean)
          );
          const existingEmails = new Set(
            existingSupplierUsers.rows.map((r) => r.email).filter(Boolean)
          );

          const allSups = await targetPool.query("SELECT id, name, email, phone FROM suppliers;");
          for (const s of allSups.rows) {
            const cleanName = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const supEmail = s.email && !s.email.includes('example.com')
              ? s.email.toLowerCase()
              : (s.email || `supplier.${cleanName || 'vendor'}@pharmaflow.in`.toLowerCase());
            if (!existingSupplierIds.has(s.id) && !existingEmails.has(supEmail)) {
              await targetPool.query(
                "INSERT INTO users (name, email, phone, password_hash, role, status, supplier_id) VALUES ($1, $2, $3, $4, 'SUPPLIER', 'ACTIVE', $5);",
                [s.name, supEmail, s.phone || null, passHash, s.id]
              );
              existingSupplierIds.add(s.id);
              existingEmails.add(supEmail);
            }
          }
        }
      } catch (seedErr) {
        console.warn("⚠️ Demo auth accounts seed notice:", seedErr.message);
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

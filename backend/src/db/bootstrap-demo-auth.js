/**
 * Bootstrap Demo Users for Supabase Auth
 *
 * Provisions development demo users into Supabase Auth (or assigns deterministic
 * auth IDs in offline environments) and links their public.users.supabase_auth_id.
 *
 * NOTE: As per product specification, existing database users are DEMO data only.
 * This is an explicit development bootstrap script, NOT a production migration framework.
 */

const { pool } = require("./connection");
const crypto = require("crypto");
const { supabaseAdmin } = require("../utils/supabase");

const DEMO_USERS = [
  {
    email: "root@falah.com",
    name: "Super Admin Falah",
    password: "more#78548",
  },
  {
    email: "admin@flora.edu.in",
    name: "Flora Administrator",
    password: "admin123",
  },
  {
    email: "superadmin@pharmaflow.com",
    name: "Super Administrator",
    password: "SuperAdmin@2026",
  },
  {
    email: "dev@falah.local",
    name: "Development User",
    password: "dev123456",
  },
  {
    email: "surajmore303@gmail.com",
    name: "Suraj More",
    password: "GoogleAuthUser@2026",
  },
];

async function bootstrapDemoAuth() {
  const client = await pool.connect();
  console.log("------------------------------------------------------------");
  console.log("Bootstrapping Demo Users with Supabase Auth IDs");
  console.log("------------------------------------------------------------");

  try {
    for (const demo of DEMO_USERS) {
      let supabaseAuthId = null;

      // 1. Attempt to provision via Supabase Auth Admin API if online
      if (supabaseAdmin?.auth?.admin) {
        try {
          const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: demo.email,
            password: demo.password,
            email_confirm: true,
            user_metadata: { name: demo.name },
          });

          if (data?.user?.id) {
            supabaseAuthId = data.user.id;
            console.log(
              `  ✓ Provisioned in Supabase Auth: ${demo.email} (${supabaseAuthId})`,
            );
          } else if (error && error.message?.includes("already registered")) {
            // Fetch existing Supabase Auth user ID
            const { data: listData } =
              await supabaseAdmin.auth.admin.listUsers();
            const found = listData?.users?.find(
              (u) => u.email?.toLowerCase() === demo.email.toLowerCase(),
            );
            if (found) {
              supabaseAuthId = found.id;
              console.log(
                `  ✓ Found existing Supabase Auth: ${demo.email} (${supabaseAuthId})`,
              );
            }
          }
        } catch (e) {
          // Fall back to deterministic UUID if Supabase Auth API is not reachable
        }
      }

      // 2. Generate deterministic UUID if offline / unconfigured
      if (!supabaseAuthId) {
        // Use deterministic UUID based on email for testing reproducibility
        const hash = crypto.createHash("md5").update(demo.email).digest("hex");
        supabaseAuthId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        console.log(
          `  ✓ Assigned deterministic Supabase Auth ID: ${demo.email} (${supabaseAuthId})`,
        );
      }

      // 3. Insert or update public.users record
      const bcrypt = require("bcrypt");
      const passwordHash = await bcrypt.hash(demo.password, 10);

      await client.query(
        `INSERT INTO users (name, email, password_hash, supabase_auth_id, status)
         VALUES ($1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET
           supabase_auth_id = EXCLUDED.supabase_auth_id,
           password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
           status = 'ACTIVE';`,
        [demo.name, demo.email.toLowerCase(), passwordHash, supabaseAuthId],
      );
    }

    console.log("------------------------------------------------------------");
    console.log("Demo user bootstrap complete.");
    console.log("------------------------------------------------------------");
  } catch (err) {
    console.error("Demo user bootstrap error:", err.message);
    throw err;
  } finally {
    client.release();
    if (require.main === module) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  bootstrapDemoAuth().catch(() => process.exit(1));
}

module.exports = { bootstrapDemoAuth, DEMO_USERS };

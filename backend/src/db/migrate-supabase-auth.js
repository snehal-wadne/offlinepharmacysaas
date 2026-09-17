/**
 * Migration: Add supabase_auth_id to users table
 *
 * Links Supabase Auth identity (auth.users.id) to PharmaFlow application users (public.users).
 * Preserves public.users.id as the primary key referenced throughout all 48 database tables.
 */

const { pool } = require("./connection");

async function migrateSupabaseAuth() {
  const client = await pool.connect();
  try {
    console.log("------------------------------------------------------------");
    console.log("Migrating Database: Supabase Auth Identity Mapping");
    console.log("------------------------------------------------------------");

    // 1. Add supabase_auth_id column if not exists
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS supabase_auth_id UUID UNIQUE;
    `);
    console.log("✓ Added column users.supabase_auth_id (UUID UNIQUE)");

    // 2. Create index on supabase_auth_id
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_supabase_auth_id 
      ON users (supabase_auth_id);
    `);
    console.log("✓ Created index idx_users_supabase_auth_id");

    // 3. Update auth method check constraint
    await client.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_method_check;
      ALTER TABLE users ADD CONSTRAINT users_auth_method_check
        CHECK (
          password_hash IS NOT NULL
          OR google_sub IS NOT NULL
          OR supabase_auth_id IS NOT NULL
        );
    `);
    console.log("✓ Updated constraint users_auth_method_check");

    console.log("------------------------------------------------------------");
    console.log("Migration complete: users table is Supabase Auth ready.");
    console.log("------------------------------------------------------------");
  } catch (err) {
    console.error("Migration failed:", err.message);
    throw err;
  } finally {
    client.release();
    if (require.main === module) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  migrateSupabaseAuth().catch(() => process.exit(1));
}

module.exports = { migrateSupabaseAuth };

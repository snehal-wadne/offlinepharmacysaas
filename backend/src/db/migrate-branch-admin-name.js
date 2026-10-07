require("dotenv").config();
const { pool } = require("./connection");

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log("=== Running Branch Admin Name Migration ===");
    await client.query("BEGIN");

    // 1. Add admin_name column to branches table if not exists
    console.log("1. Ensuring 'admin_name' column on branches table...");
    await client.query(`
      ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS admin_name VARCHAR(150);
    `);

    // 2. Add admin_name column to organisations table if not exists
    console.log("2. Ensuring 'admin_name' column on organisations table...");
    await client.query(`
      ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS admin_name VARCHAR(150);
    `);

    // 3. Backfill admin_name from contact_person or organisations.admin_name
    console.log("3. Backfilling admin_name on branches...");
    await client.query(`
      UPDATE public.branches b
      SET admin_name = COALESCE(b.admin_name, b.contact_person, o.admin_name, 'Admin')
      FROM public.organisations o
      WHERE b.organisation_id = o.id
        AND (b.admin_name IS NULL OR b.admin_name = '');
    `);

    // 4. Backfill contact_person if empty
    console.log("4. Backfilling contact_person on branches...");
    await client.query(`
      UPDATE public.branches
      SET contact_person = admin_name
      WHERE (contact_person IS NULL OR contact_person = '') AND admin_name IS NOT NULL;
    `);

    // 5. Ensure org owners and named admins have role = 'ADMIN' or 'OWNER'
    console.log("5. Updating owner/admin user roles...");
    await client.query(`
      UPDATE public.users u
      SET role = 'ADMIN'
      FROM public.organisations o
      WHERE (o.owner_id = u.id OR LOWER(o.admin_name) = LOWER(u.name))
        AND (u.role IS NULL OR u.role = 'STAFF');
    `);

    // 6. Ensure every admin user has organisation membership and branch assignments across all organisation branches
    console.log("6. Ensuring admin users have branch assignments across all organisation branches...");
    
    // Set-based membership insertion (instant batch execution)
    await client.query(`
      INSERT INTO public.organisation_memberships (organisation_id, user_id, status)
      SELECT DISTINCT o.id, u.id, 'ACTIVE'
      FROM public.users u
      JOIN public.organisations o ON o.owner_id = u.id OR LOWER(o.admin_name) = LOWER(u.name)
      WHERE o.status = 'ACTIVE'
      ON CONFLICT (organisation_id, user_id) DO UPDATE SET status = 'ACTIVE';
    `);

    // Set-based branch assignment insertion (instant batch execution)
    await client.query(`
      WITH admin_roles AS (
        SELECT organisation_id, id AS role_id,
               ROW_NUMBER() OVER (PARTITION BY organisation_id ORDER BY CASE WHEN role_identifier = 'ADMIN' THEN 0 ELSE 1 END) AS rn
        FROM public.roles
        WHERE role_identifier = 'ADMIN' OR name = 'Administrator'
      ),
      active_branches AS (
        SELECT id AS branch_id, organisation_id,
               ROW_NUMBER() OVER (PARTITION BY organisation_id ORDER BY created_at ASC) AS b_rn
        FROM public.branches
        WHERE status = 'ACTIVE'
      )
      INSERT INTO public.branch_assignments (membership_id, branch_id, role_id, is_primary)
      SELECT DISTINCT
        om.id AS membership_id,
        ab.branch_id,
        ar.role_id,
        (ab.b_rn = 1) AS is_primary
      FROM public.organisation_memberships om
      JOIN public.users u ON om.user_id = u.id
      JOIN public.organisations o ON om.organisation_id = o.id AND (o.owner_id = u.id OR LOWER(o.admin_name) = LOWER(u.name))
      JOIN active_branches ab ON ab.organisation_id = o.id
      JOIN admin_roles ar ON ar.organisation_id = o.id AND ar.rn = 1
      ON CONFLICT (membership_id, branch_id) 
      DO UPDATE SET role_id = EXCLUDED.role_id;
    `);

    await client.query("COMMIT");
    console.log("✓ Branch admin name migration completed successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigration };

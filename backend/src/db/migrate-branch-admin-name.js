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

    // 6. Ensure every admin user has organisation membership and branch assignments to all branches
    console.log("6. Ensuring admin users have branch assignments across all organisation branches...");
    const adminUsers = await client.query(`
      SELECT DISTINCT u.id AS user_id, o.id AS organisation_id
      FROM users u
      JOIN organisations o ON o.owner_id = u.id OR LOWER(o.admin_name) = LOWER(u.name)
      WHERE o.status = 'ACTIVE';
    `);

    for (const au of adminUsers.rows) {
      // Ensure organisation membership
      const memRes = await client.query(`
        INSERT INTO organisation_memberships (organisation_id, user_id, status)
        VALUES ($1, $2, 'ACTIVE')
        ON CONFLICT (organisation_id, user_id) DO UPDATE SET status = 'ACTIVE'
        RETURNING id;
      `, [au.organisation_id, au.user_id]);

      const memId = memRes.rows[0]?.id;
      if (memId) {
        // Find ADMIN role
        const roleRes = await client.query(`
          SELECT id FROM roles WHERE organisation_id = $1 AND (role_identifier = 'ADMIN' OR name = 'Administrator') LIMIT 1;
        `, [au.organisation_id]);
        const adminRoleId = roleRes.rows[0]?.id;

        // Check if membership already has a primary branch assignment
        const primCheck = await client.query(`
          SELECT branch_id FROM branch_assignments WHERE membership_id = $1 AND is_primary = TRUE LIMIT 1;
        `, [memId]);
        const hasPrimary = primCheck.rows.length > 0;

        // Assign to all branches of this organisation
        const branches = await client.query(`
          SELECT id FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE';
        `, [au.organisation_id]);

        for (let i = 0; i < branches.rows.length; i++) {
          const b = branches.rows[i];
          const shouldBePrimary = !hasPrimary && i === 0;
          if (adminRoleId) {
            await client.query(`
              INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (membership_id, branch_id) 
              DO UPDATE SET role_id = EXCLUDED.role_id;
            `, [memId, b.id, adminRoleId, shouldBePrimary]);
          }
        }
      }
    }

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

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

const { pool } = require("./connection");
const bcrypt = require("bcrypt");

async function seedSuperadmin() {
  const email = "superadmin@pharmaflow.com";
  const name = "Super Administrator";
  const password = "SuperAdmin@2026";
  const passwordHash = await bcrypt.hash(password, 10);

  const client = await pool.connect();
  try {
    const existing = await client.query(
      "SELECT id, is_platform_superadmin FROM users WHERE email = $1",
      [email],
    );
    if (existing.rows.length > 0) {
      await client.query(
        "UPDATE users SET is_platform_superadmin = TRUE, password_hash = $1, status = $2 WHERE email = $3",
        [passwordHash, "ACTIVE", email],
      );
      console.log("Superadmin user updated successfully:", existing.rows[0].id);
      return existing.rows[0].id;
    } else {
      const res = await client.query(
        `INSERT INTO users (name, email, password_hash, status, is_platform_superadmin)
         VALUES ($1, $2, $3, 'ACTIVE', TRUE)
         RETURNING id`,
        [name, email, passwordHash],
      );
      console.log("Superadmin user created successfully:", res.rows[0].id);
      return res.rows[0].id;
    }
  } finally {
    client.release();
    if (require.main === module) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  seedSuperadmin().catch(console.error);
}

module.exports = { seedSuperadmin };

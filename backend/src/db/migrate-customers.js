const { pool } = require("./connection");

async function migrateCustomers() {
  console.log("Migrating customers table columns...");
  await pool.query(`
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS age INT DEFAULT 30;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT 'Mumbai';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS doctor_name VARCHAR(255) DEFAULT 'Dr. Farooq Siddiqui';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS doctor_specialty VARCHAR(255) DEFAULT 'General Physician';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS active_rx_no VARCHAR(100) DEFAULT 'Rx-2026-1025';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points INT DEFAULT 0;
  `);
  console.log("✓ Successfully added missing customer columns.");
  await pool.end();
}

migrateCustomers().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});

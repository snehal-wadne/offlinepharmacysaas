/**
 * Database Migration: Purchase & Inventory Sequences
 *
 * Purpose:
 * Updates number_sequences_type_check to permit:
 * - PURCHASE (PO-1001)
 * - STOCK_TRANSFER (TR-1001)
 * - GOODS_RECEIPT (GRN-1001)
 *
 * Preserves all existing sequence types:
 * - CUSTOMER
 * - PRESCRIPTION
 * - INVOICE
 * - RECEIPT
 * - RETURN
 * - BRANCH
 * - STAFF
 *
 * Idempotent: can be executed multiple times safely without data loss.
 */

require("dotenv").config();
const { pool } = require("./connection");

const runMigration = async () => {
  const client = await pool.connect();

  try {
    console.log("=== Starting Purchase & Inventory Sequences Migration ===");

    await client.query("BEGIN");

    console.log("Updating number_sequences_type_check constraint...");
    await client.query(`
      ALTER TABLE number_sequences DROP CONSTRAINT IF EXISTS number_sequences_type_check;
      ALTER TABLE number_sequences ADD CONSTRAINT number_sequences_type_check
        CHECK (
          sequence_type IN (
            'CUSTOMER',
            'PRESCRIPTION',
            'INVOICE',
            'RECEIPT',
            'RETURN',
            'BRANCH',
            'STAFF',
            'PURCHASE',
            'STOCK_TRANSFER',
            'GOODS_RECEIPT'
          )
        );
    `);

    // Verification
    const res = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'number_sequences'::regclass
        AND conname = 'number_sequences_type_check';
    `);

    if (!res.rows.length || !res.rows[0].def.includes("PURCHASE")) {
      throw new Error(
        "Failed to verify updated number_sequences_type_check constraint.",
      );
    }

    console.log("Constraint definition:", res.rows[0].def);

    await client.query("COMMIT");
    console.log("=== Migration Completed Successfully ===");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };

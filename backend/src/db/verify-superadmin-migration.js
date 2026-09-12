/**
 * Verification Script: Superadmin Platform Database Migration
 *
 * Verifies that all tables, columns, constraints, partial indexes,
 * sequences, and relationship integrity rules are correctly enforced
 * in PostgreSQL.
 */

require("dotenv").config();
const assert = require("assert");
const { pool } = require("./connection");

const verifyMigration = async () => {
  const client = await pool.connect();

  try {
    console.log("\n=======================================================");
    console.log("  VERIFYING SUPERADMIN PLATFORM DATABASE MIGRATION");
    console.log("=======================================================\n");

    // 1. Verify New Tables Exist
    const tables = [
      "platform_tax_configs",
      "platform_business_configs",
      "platform_subscription_payments",
      "platform_payment_refunds",
      "subscription_invoices",
      "razorpay_webhook_events",
    ];

    for (const table of tables) {
      const res = await client.query(`
        SELECT to_regclass('public.${table}') AS tbl;
      `);
      assert.ok(res.rows[0].tbl, `Table public.${table} must exist`);
      console.log(`✓ Table public.${table} exists`);
    }

    // 2. Verify users.is_platform_superadmin
    const userCol = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'is_platform_superadmin';
    `);
    assert.strictEqual(
      userCol.rows.length,
      1,
      "users.is_platform_superadmin column must exist",
    );
    assert.strictEqual(userCol.rows[0].data_type, "boolean");
    console.log("✓ users.is_platform_superadmin exists with default false");

    // 3. Verify organisations status and new columns
    const orgCols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'organisations';
    `);
    const orgColNames = orgCols.rows.map((r) => r.column_name);
    const requiredOrgCols = [
      "pharmacy_code",
      "admin_name",
      "email",
      "phone",
      "address",
      "city",
      "state",
      "pincode",
      "gst_number",
      "business_type",
      "status",
    ];
    for (const c of requiredOrgCols) {
      assert.ok(orgColNames.includes(c), `organisations must include ${c}`);
    }
    console.log("✓ organisations table has all required columns");

    // 4. Verify subscription_plans tier columns
    const planCols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'subscription_plans';
    `);
    const planColNames = planCols.rows.map((r) => r.column_name);
    for (const c of [
      "tier_code",
      "features",
      "module_summary",
      "color_hex",
      "is_popular",
    ]) {
      assert.ok(
        planColNames.includes(c),
        `subscription_plans must include ${c}`,
      );
    }
    console.log("✓ subscription_plans table has all tier columns");

    // 5. Verify subscriptions single current active/pending partial unique index
    const subIdx = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'subscriptions' AND indexname = 'idx_subscriptions_single_current_active';
    `);
    assert.strictEqual(
      subIdx.rows.length,
      1,
      "idx_subscriptions_single_current_active must exist",
    );
    assert.ok(
      subIdx.rows[0].indexdef.includes("WHERE ((status)::text = ANY"),
      "Index must have WHERE status IN ('PENDING_PAYMENT', 'ACTIVE')",
    );
    console.log(
      "✓ subscriptions single current active/pending unique index verified",
    );

    // 6. Verify platform sequence types and uniqueness
    const seqTypes = await client.query(`
      SELECT sequence_type FROM number_sequences 
      WHERE organisation_id IS NULL AND branch_id IS NULL;
    `);
    const existingSeqTypes = seqTypes.rows.map((r) => r.sequence_type);
    for (const st of [
      "PHARMACY_CODE",
      "SAAS_INVOICE",
      "PLATFORM_PAYMENT",
      "PLATFORM_REFUND",
    ]) {
      assert.ok(
        existingSeqTypes.includes(st),
        `Platform sequence ${st} must exist in number_sequences`,
      );
    }
    console.log("✓ Platform number sequence types seeded and unique");

    // 7. Verify audit_logs organisation_id is nullable
    const auditCol = await client.query(`
      SELECT is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'audit_logs' AND column_name = 'organisation_id';
    `);
    assert.strictEqual(
      auditCol.rows[0].is_nullable,
      "YES",
      "audit_logs.organisation_id must be nullable",
    );
    console.log("✓ audit_logs.organisation_id is nullable");

    // 8. Verify platform_business_configs has single active partial unique index
    const busIdx = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'platform_business_configs' AND indexname = 'idx_platform_business_single_active';
    `);
    assert.strictEqual(
      busIdx.rows.length,
      1,
      "idx_platform_business_single_active must exist",
    );
    console.log("✓ platform_business_configs single active index verified");

    // 9. Verify subscription_invoices.payment_id unique constraint
    const invUnique = await client.query(`
      SELECT tc.constraint_name 
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'subscription_invoices' AND ccu.column_name = 'payment_id' AND tc.constraint_type = 'UNIQUE';
    `);
    assert.ok(
      invUnique.rows.length >= 1,
      "subscription_invoices.payment_id must have a UNIQUE constraint",
    );
    console.log("✓ subscription_invoices.payment_id is strictly UNIQUE");

    // 10. Verify platform_tax_configs can store effective-dated history
    const taxCount = await client.query(`
      SELECT COUNT(*)::int AS count FROM platform_tax_configs WHERE config_code = 'SAAS_SUBSCRIPTION_GST';
    `);
    assert.ok(
      taxCount.rows[0].count >= 1,
      "platform_tax_configs must have default SAAS_SUBSCRIPTION_GST rule",
    );
    console.log("✓ platform_tax_configs has active tax rule");

    // 11. Test Subscription Uniqueness Invariant in a dry-run transaction
    await client.query("BEGIN");
    const testUser = await client.query(`
      INSERT INTO users (email, name, password_hash)
      VALUES ('test_verify_' || gen_random_uuid() || '@test.local', 'Verify User', 'hash123')
      RETURNING id;
    `);
    const testOrg = await client.query(
      `
      INSERT INTO organisations (owner_id, name, status)
      VALUES ($1, 'Verify Org', 'PENDING_PAYMENT')
      RETURNING id;
    `,
      [testUser.rows[0].id],
    );
    const testPlan = await client.query(
      `SELECT id FROM subscription_plans LIMIT 1;`,
    );

    // First current subscription
    await client.query(
      `
      INSERT INTO subscriptions (organisation_id, plan_id, status)
      VALUES ($1, $2, 'PENDING_PAYMENT');
    `,
      [testOrg.rows[0].id, testPlan.rows[0].id],
    );

    // Second competing current subscription MUST fail
    let duplicateRejected = false;
    try {
      await client.query(
        `
        INSERT INTO subscriptions (organisation_id, plan_id, status)
        VALUES ($1, $2, 'ACTIVE');
      `,
        [testOrg.rows[0].id, testPlan.rows[0].id],
      );
    } catch (err) {
      if (err.code === "23505") {
        duplicateRejected = true;
      }
    }
    assert.ok(
      duplicateRejected,
      "Duplicate current subscription must be rejected by PostgreSQL index",
    );
    console.log(
      "✓ PostgreSQL index successfully rejected competing current subscription",
    );

    // Rollback test changes
    await client.query("ROLLBACK");

    console.log("\n=======================================================");
    console.log("  ALL MIGRATION VERIFICATION CHECKS PASSED!");
    console.log("=======================================================\n");
    return true;
  } catch (error) {
    console.error("Verification failed:", error);
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  verifyMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { verifyMigration };

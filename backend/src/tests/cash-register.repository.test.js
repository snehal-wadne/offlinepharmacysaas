/**
 * Cash Register Repository Integration Tests
 *
 * Tests the Cash Register Repository against real PostgreSQL and Redis.
 *
 * Verifies:
 * 1. Create cash register with identifier and name.
 * 2. Retrieve cash register by ID.
 * 3. Retrieve cash register by Identifier.
 * 4. List registers by branch.
 * 5. Update cash register (name, identifier, isActive).
 * 6. Duplicate identifier prevention (unique constraint per branch).
 * 7. Multi-tenant isolation (Org A cannot read Org B's registers).
 * 8. Branch validation (cannot create register with invalid branch or mismatched org).
 * 9. Cache hit and cache invalidation on update.
 * 10. Transaction client participation and bypass of Redis.
 */

require("dotenv").config();
const assert = require("assert");
const { pool } = require("../db/connection");
const { redisClient, connectRedis, disconnectRedis } = require("../cache/redis");
const { getCache } = require("../cache/cache");
const {
  createCashRegister,
  getCashRegisterById,
  getCashRegisterByIdentifier,
  listCashRegistersByBranch,
  updateCashRegister,
  buildCashRegisterCacheKey,
  buildCashRegisterListCacheKey,
} = require("../repositories/cash-register.repository");

const uniqueValue = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

const runTests = async () => {
  let ownerAId = null;
  let orgAId = null;
  let branchA1Id = null;
  let branchA2Id = null;

  let ownerBId = null;
  let orgBId = null;
  let branchBId = null;

  let register1Id = null;

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning Cash Register Repository tests...\n");

    // Setup Organisation A
    const ownerARes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [`${uniqueValue("reg-owner-a")}@test.local`, "pwd", "Owner A", "ACTIVE"]
    );
    ownerAId = ownerARes.rows[0].id;

    const orgARes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerAId, uniqueValue("Org A Register Test")]
    );
    orgAId = orgARes.rows[0].id;

    const branchA1Res = await pool.query(
      `INSERT INTO branches (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
      [orgAId, "Main Branch A1"]
    );
    branchA1Id = branchA1Res.rows[0].id;

    const branchA2Res = await pool.query(
      `INSERT INTO branches (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
      [orgAId, "Second Branch A2"]
    );
    branchA2Id = branchA2Res.rows[0].id;

    // Setup Organisation B
    const ownerBRes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [`${uniqueValue("reg-owner-b")}@test.local`, "pwd", "Owner B", "ACTIVE"]
    );
    ownerBId = ownerBRes.rows[0].id;

    const orgBRes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerBId, uniqueValue("Org B Register Test")]
    );
    orgBId = orgBRes.rows[0].id;

    const branchBRes = await pool.query(
      `INSERT INTO branches (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
      [orgBId, "Branch B"]
    );
    branchBId = branchBRes.rows[0].id;

    // ---------------------------------------------------------
    // Test 1: Create Cash Register
    // ---------------------------------------------------------
    const reg1 = await createCashRegister({
      organisationId: orgAId,
      branchId: branchA1Id,
      name: "Counter 1",
      identifier: "POS-01",
      isActive: true,
    });

    assert.ok(reg1.id);
    assert.strictEqual(reg1.name, "Counter 1");
    assert.strictEqual(reg1.identifier, "POS-01");
    assert.strictEqual(reg1.is_active, true);
    register1Id = reg1.id;
    console.log("✓ 1. Create cash register");

    // ---------------------------------------------------------
    // Test 2: Retrieve Cash Register by ID
    // ---------------------------------------------------------
    const fetched1 = await getCashRegisterById(orgAId, register1Id);
    assert.ok(fetched1);
    assert.strictEqual(fetched1.id, register1Id);
    assert.strictEqual(fetched1.identifier, "POS-01");
    console.log("✓ 2. Retrieve cash register by ID");

    // ---------------------------------------------------------
    // Test 3: Retrieve Cash Register by Identifier
    // ---------------------------------------------------------
    const fetchedByIdentifier = await getCashRegisterByIdentifier(orgAId, branchA1Id, "pos-01");
    assert.ok(fetchedByIdentifier);
    assert.strictEqual(fetchedByIdentifier.id, register1Id);
    console.log("✓ 3. Retrieve cash register by identifier (case-insensitive)");

    // ---------------------------------------------------------
    // Test 4: List Cash Registers by Branch
    // ---------------------------------------------------------
    const reg2 = await createCashRegister({
      organisationId: orgAId,
      branchId: branchA1Id,
      name: "Counter 2",
      identifier: "POS-02",
    });

    const listA1 = await listCashRegistersByBranch(orgAId, branchA1Id);
    assert.strictEqual(listA1.length, 2);
    console.log("✓ 4. List cash registers by branch");

    // ---------------------------------------------------------
    // Test 5: Update Cash Register
    // ---------------------------------------------------------
    const updated1 = await updateCashRegister({
      organisationId: orgAId,
      registerId: register1Id,
      name: "Counter 1 - Express",
      isActive: false,
    });
    assert.strictEqual(updated1.name, "Counter 1 - Express");
    assert.strictEqual(updated1.is_active, false);
    assert.strictEqual(updated1.identifier, "POS-01"); // Unchanged
    console.log("✓ 5. Update cash register");

    // ---------------------------------------------------------
    // Test 6: Duplicate Identifier Error (per branch)
    // ---------------------------------------------------------
    await assert.rejects(
      async () => {
        await createCashRegister({
          organisationId: orgAId,
          branchId: branchA1Id,
          name: "Duplicate Counter",
          identifier: "pos-02", // Already exists on branchA1Id
        });
      },
      /already exists on this branch/i
    );
    console.log("✓ 6. Duplicate identifier prevention on branch");

    // ---------------------------------------------------------
    // Test 7: Multi-tenant Isolation
    // ---------------------------------------------------------
    const orgBFetch = await getCashRegisterById(orgBId, register1Id);
    assert.strictEqual(orgBFetch, null, "Org B should not be able to read Org A's register");

    const orgBList = await listCashRegistersByBranch(orgBId, branchBId);
    assert.strictEqual(orgBList.length, 0);
    console.log("✓ 7. Multi-tenant isolation verified");

    // ---------------------------------------------------------
    // Test 8: Branch validation
    // ---------------------------------------------------------
    await assert.rejects(
      async () => {
        await createCashRegister({
          organisationId: orgAId,
          branchId: branchBId, // Belongs to Org B!
          name: "Invalid Counter",
          identifier: "POS-INV",
        });
      },
      /Branch not found in the specified organisation/i
    );
    console.log("✓ 8. Branch validation enforced");

    // ---------------------------------------------------------
    // Test 9: Cache hit and invalidation
    // ---------------------------------------------------------
    // Read to populate cache
    await getCashRegisterById(orgAId, register1Id);
    const cachedItem = await getCache(buildCashRegisterCacheKey(orgAId, register1Id));
    assert.ok(cachedItem, "Cache key should exist after read");

    // Update should invalidate
    await updateCashRegister({
      organisationId: orgAId,
      registerId: register1Id,
      name: "Counter 1 - Reopened",
      isActive: true,
    });
    const cachedAfterUpdate = await getCache(buildCashRegisterCacheKey(orgAId, register1Id));
    assert.strictEqual(cachedAfterUpdate, null, "Cache key should be deleted after update");
    console.log("✓ 9. Redis cache population and targeted invalidation");

    // ---------------------------------------------------------
    // Test 10: Transaction client support & Redis bypass
    // ---------------------------------------------------------
    const txClient = await pool.connect();
    try {
      await txClient.query("BEGIN");
      const txReg = await createCashRegister(
        {
          organisationId: orgAId,
          branchId: branchA2Id,
          name: "Branch 2 Reg 1",
          identifier: "B2-POS-01",
        },
        txClient
      );
      assert.ok(txReg.id);

      // Verify read inside transaction succeeds
      const fetchedInTx = await getCashRegisterById(orgAId, txReg.id, txClient);
      assert.ok(fetchedInTx);
      assert.strictEqual(fetchedInTx.name, "Branch 2 Reg 1");

      // Verify Redis was bypassed
      const txCache = await getCache(buildCashRegisterCacheKey(orgAId, txReg.id));
      assert.strictEqual(txCache, null, "Transaction client reads must bypass Redis");

      await txClient.query("ROLLBACK");

      // After rollback, register should not exist
      const afterRollback = await getCashRegisterById(orgAId, txReg.id);
      assert.strictEqual(afterRollback, null, "Rolled-back register must not exist");
      console.log("✓ 10. Transaction client participation, rollback, and Redis bypass");
    } finally {
      txClient.release();
    }

    console.log("\nAll 10 Cash Register Repository tests passed successfully!\n");
  } finally {
    // Cleanup
    if (orgAId) {
      await pool.query("DELETE FROM cash_registers WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM branches WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM organisations WHERE id = $1;", [orgAId]).catch(() => {});
    }
    if (orgBId) {
      await pool.query("DELETE FROM cash_registers WHERE organisation_id = $1;", [orgBId]).catch(() => {});
      await pool.query("DELETE FROM branches WHERE organisation_id = $1;", [orgBId]).catch(() => {});
      await pool.query("DELETE FROM organisations WHERE id = $1;", [orgBId]).catch(() => {});
    }
    if (ownerAId) {
      await pool.query("DELETE FROM users WHERE id = $1;", [ownerAId]).catch(() => {});
    }
    if (ownerBId) {
      await pool.query("DELETE FROM users WHERE id = $1;", [ownerBId]).catch(() => {});
    }

    try {
      if (redisClient.isOpen) {
        await disconnectRedis();
      }
    } catch (e) {}

    await pool.end();
  }
};

runTests().catch((err) => {
  console.error("Cash Register tests failed:", err);
  process.exit(1);
});

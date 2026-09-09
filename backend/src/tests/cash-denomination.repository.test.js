/**
 * Cash Denomination Repository Integration Tests
 *
 * Tests the Cash Denomination Repository against real PostgreSQL.
 *
 * Verifies:
 * 1. Save denominations (closing cash breakdown).
 * 2. Retrieve denominations for session (ordered by denomination_value DESC).
 * 3. Zero count handling (valid count >= 0).
 * 4. Duplicate denomination constraint rejection.
 * 5. Re-saving denominations cleanly replaces previous set.
 * 6. Multi-tenant isolation (Org B cannot read Org A denominations).
 * 7. Transaction client participation and rollback.
 */

require("dotenv").config();
const assert = require("assert");
const { pool } = require("../db/connection");
const { createCashRegister } = require("../repositories/cash-register.repository");
const { openSession } = require("../repositories/cash-register-session.repository");
const {
  saveDenominations,
  getDenominationsBySession,
} = require("../repositories/cash-denomination.repository");

const uniqueValue = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

const runTests = async () => {
  let ownerAId = null;
  let orgAId = null;
  let branchAId = null;
  let cashierAId = null;
  let registerAId = null;
  let sessionAId = null;

  let ownerBId = null;
  let orgBId = null;
  let branchBId = null;
  let cashierBId = null;
  let registerBId = null;
  let sessionBId = null;

  try {
    await pool.query("SELECT 1");

    console.log("\nRunning Cash Denomination Repository tests...\n");

    // Setup Organisation A
    const ownerARes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [`${uniqueValue("denom-owner-a")}@test.local`, "pwd", "Owner A", "ACTIVE"]
    );
    ownerAId = ownerARes.rows[0].id;

    const orgARes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerAId, uniqueValue("Org A Denom Test")]
    );
    orgAId = orgARes.rows[0].id;

    const branchARes = await pool.query(
      `INSERT INTO branches (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
      [orgAId, "Main Branch A"]
    );
    branchAId = branchARes.rows[0].id;

    const cashierARes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [`${uniqueValue("denom-cashier-a")}@test.local`, "pwd", "Cashier Alice", "ACTIVE"]
    );
    cashierAId = cashierARes.rows[0].id;

    await pool.query(
      `INSERT INTO organisation_memberships (organisation_id, user_id, status)
       VALUES ($1, $2, 'ACTIVE');`,
      [orgAId, cashierAId]
    );

    const regA = await createCashRegister({
      organisationId: orgAId,
      branchId: branchAId,
      name: "Register A",
      identifier: "REG-DA",
    });
    registerAId = regA.id;

    const sessA = await openSession({
      organisationId: orgAId,
      branchId: branchAId,
      cashRegisterId: registerAId,
      cashierId: cashierAId,
      openingBalance: 1000,
    });
    sessionAId = sessA.id;

    // Setup Organisation B
    const ownerBRes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [`${uniqueValue("denom-owner-b")}@test.local`, "pwd", "Owner B", "ACTIVE"]
    );
    ownerBId = ownerBRes.rows[0].id;

    const orgBRes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerBId, uniqueValue("Org B Denom Test")]
    );
    orgBId = orgBRes.rows[0].id;

    const branchBRes = await pool.query(
      `INSERT INTO branches (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
      [orgBId, "Branch B"]
    );
    branchBId = branchBRes.rows[0].id;

    const cashierBRes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [`${uniqueValue("denom-cashier-b")}@test.local`, "pwd", "Cashier Bob", "ACTIVE"]
    );
    cashierBId = cashierBRes.rows[0].id;

    await pool.query(
      `INSERT INTO organisation_memberships (organisation_id, user_id, status)
       VALUES ($1, $2, 'ACTIVE');`,
      [orgBId, cashierBId]
    );

    const regB = await createCashRegister({
      organisationId: orgBId,
      branchId: branchBId,
      name: "Register B",
      identifier: "REG-DB",
    });
    registerBId = regB.id;

    const sessB = await openSession({
      organisationId: orgBId,
      branchId: branchBId,
      cashRegisterId: registerBId,
      cashierId: cashierBId,
      openingBalance: 500,
    });
    sessionBId = sessB.id;

    // ---------------------------------------------------------
    // Test 1: Save Denominations
    // ---------------------------------------------------------
    const saved = await saveDenominations({
      organisationId: orgAId,
      sessionId: sessionAId,
      denominations: [
        { denominationValue: 500, denominationCount: 6 }, // 3000
        { denominationValue: 200, denominationCount: 5 }, // 1000
        { denominationValue: 100, denominationCount: 4 }, // 400
        { denominationValue: 50, denominationCount: 0 },  // 0
      ],
    });

    assert.strictEqual(saved.length, 4);
    console.log("✓ 1. Save cash denominations");

    // ---------------------------------------------------------
    // Test 2: Retrieve Denominations for Session
    // ---------------------------------------------------------
    const retrieved = await getDenominationsBySession({
      organisationId: orgAId,
      sessionId: sessionAId,
    });

    assert.strictEqual(retrieved.length, 4);
    assert.strictEqual(Number(retrieved[0].denomination_value), 500);
    assert.strictEqual(retrieved[0].denomination_count, 6);
    assert.strictEqual(Number(retrieved[3].denomination_value), 50);
    assert.strictEqual(retrieved[3].denomination_count, 0);
    console.log("✓ 2. Retrieve denominations ordered by value DESC");

    // ---------------------------------------------------------
    // Test 3: Zero count handling (valid count >= 0)
    // ---------------------------------------------------------
    const zeroDenom = retrieved.find((d) => Number(d.denomination_value) === 50);
    assert.ok(zeroDenom);
    assert.strictEqual(zeroDenom.denomination_count, 0);
    console.log("✓ 3. Zero count handling supported and validated");

    // ---------------------------------------------------------
    // Test 4: Duplicate denomination constraint rejection
    // ---------------------------------------------------------
    await assert.rejects(
      async () => {
        await saveDenominations({
          organisationId: orgAId,
          sessionId: sessionAId,
          denominations: [
            { denominationValue: 100, denominationCount: 5 },
            { denominationValue: 100, denominationCount: 10 }, // Duplicate in payload
          ],
        });
      },
      /Duplicate denominationValue/i
    );
    console.log("✓ 4. Duplicate denomination in payload rejected");

    // ---------------------------------------------------------
    // Test 5: Re-saving denominations cleanly replaces previous set
    // ---------------------------------------------------------
    const updatedSet = await saveDenominations({
      organisationId: orgAId,
      sessionId: sessionAId,
      denominations: [
        { denominationValue: 500, denominationCount: 8 },
        { denominationValue: 200, denominationCount: 2 },
      ],
    });
    assert.strictEqual(updatedSet.length, 2);

    const reRetrieved = await getDenominationsBySession({
      organisationId: orgAId,
      sessionId: sessionAId,
    });
    assert.strictEqual(reRetrieved.length, 2);
    assert.strictEqual(reRetrieved[0].denomination_count, 8);
    console.log("✓ 5. Re-saving denominations replaces previous counts");

    // ---------------------------------------------------------
    // Test 6: Multi-tenant isolation
    // ---------------------------------------------------------
    await assert.rejects(
      async () => {
        await getDenominationsBySession({
          organisationId: orgBId,
          sessionId: sessionAId, // Belongs to Org A!
        });
      },
      /Cash register session not found in the specified organisation/i
    );

    const orgBSet = await getDenominationsBySession({
      organisationId: orgBId,
      sessionId: sessionBId,
    });
    assert.strictEqual(orgBSet.length, 0);
    console.log("✓ 6. Multi-tenant isolation verified");

    // ---------------------------------------------------------
    // Test 7: Transaction client participation and rollback
    // ---------------------------------------------------------
    const txClient = await pool.connect();
    try {
      await txClient.query("BEGIN");
      await saveDenominations({
        organisationId: orgBId,
        sessionId: sessionBId,
        denominations: [
          { denominationValue: 2000, denominationCount: 5 },
        ],
        client: txClient,
      });

      // Verify visible inside transaction
      const inTx = await getDenominationsBySession({
        organisationId: orgBId,
        sessionId: sessionBId,
        client: txClient,
      });
      assert.strictEqual(inTx.length, 1);
      assert.strictEqual(Number(inTx[0].denomination_value), 2000);

      await txClient.query("ROLLBACK");

      // Verify rolled back outside
      const afterRollback = await getDenominationsBySession({
        organisationId: orgBId,
        sessionId: sessionBId,
      });
      assert.strictEqual(afterRollback.length, 0, "Rolled-back denominations must not exist");
      console.log("✓ 7. Transaction client participation and rollback");
    } finally {
      txClient.release();
    }

    console.log("\nAll 7 Cash Denomination Repository tests passed successfully!\n");
  } finally {
    // Cleanup
    if (orgAId) {
      await pool.query("DELETE FROM cash_denominations WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM cash_register_sessions WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM cash_registers WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM organisation_memberships WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM branches WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM organisations WHERE id = $1;", [orgAId]).catch(() => {});
    }
    if (orgBId) {
      await pool.query("DELETE FROM cash_denominations WHERE organisation_id = $1;", [orgBId]).catch(() => {});
      await pool.query("DELETE FROM cash_register_sessions WHERE organisation_id = $1;", [orgBId]).catch(() => {});
      await pool.query("DELETE FROM cash_registers WHERE organisation_id = $1;", [orgBId]).catch(() => {});
      await pool.query("DELETE FROM organisation_memberships WHERE organisation_id = $1;", [orgBId]).catch(() => {});
      await pool.query("DELETE FROM branches WHERE organisation_id = $1;", [orgBId]).catch(() => {});
      await pool.query("DELETE FROM organisations WHERE id = $1;", [orgBId]).catch(() => {});
    }
    if (ownerAId) await pool.query("DELETE FROM users WHERE id = $1;", [ownerAId]).catch(() => {});
    if (ownerBId) await pool.query("DELETE FROM users WHERE id = $1;", [ownerBId]).catch(() => {});
    if (cashierAId) await pool.query("DELETE FROM users WHERE id = $1;", [cashierAId]).catch(() => {});
    if (cashierBId) await pool.query("DELETE FROM users WHERE id = $1;", [cashierBId]).catch(() => {});

    await pool.end();
  }
};

runTests().catch((err) => {
  console.error("Cash Denomination tests failed:", err);
  process.exit(1);
});

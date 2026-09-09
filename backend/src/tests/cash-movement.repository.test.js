/**
 * Cash Movement Repository Integration Tests
 *
 * Tests the Cash Movement Repository against real PostgreSQL and Redis.
 *
 * Verifies:
 * 1. CASH_MOVEMENT sequence generation (e.g. PC-1001).
 * 2. Cash IN movement (float addition).
 * 3. Cash OUT movement (petty expense).
 * 4. Amount constraint rejection (amount <= 0).
 * 5. Invalid movement type rejection (not 'IN' or 'OUT').
 * 6. Session / branch / organisation relationship validation.
 * 7. List movements by session (chronological order).
 * 8. Multi-tenant isolation (Org B cannot view Org A movements).
 * 9. Cache invalidation on new movement.
 * 10. Verification that posted movements are NOT physically deletable.
 * 11. Transaction client participation and rollback.
 * 12. Movement fails on CLOSED session.
 * 13. Movement and session-close concurrency cannot leave a posted movement after close.
 */

require("dotenv").config();
const assert = require("assert");
const { pool } = require("../db/connection");
const { redisClient, connectRedis, disconnectRedis } = require("../cache/redis");
const { getCache } = require("../cache/cache");
const { createCashRegister } = require("../repositories/cash-register.repository");
const { openSession, closeSession } = require("../repositories/cash-register-session.repository");
const {
  createMovement,
  listMovementsBySession,
  buildMovementsListCacheKey,
} = require("../repositories/cash-movement.repository");

const uniqueValue = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

const runTests = async () => {
  let ownerAId = null;
  let orgAId = null;
  let branchAId = null;
  let cashierAId = null;
  let registerAId = null;
  let registerA2Id = null;
  let sessionAId = null;

  let ownerBId = null;
  let orgBId = null;
  let branchBId = null;
  let cashierBId = null;
  let registerBId = null;
  let sessionBId = null;

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning Cash Movement Repository tests...\n");

    // Setup Organisation A
    const ownerARes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [`${uniqueValue("mov-owner-a")}@test.local`, "pwd", "Owner A", "ACTIVE"]
    );
    ownerAId = ownerARes.rows[0].id;

    const orgARes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerAId, uniqueValue("Org A Movement Test")]
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
      [`${uniqueValue("mov-cashier-a")}@test.local`, "pwd", "Cashier Alice", "ACTIVE"]
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
      identifier: "REG-MA",
    });
    registerAId = regA.id;

    const regA2 = await createCashRegister({
      organisationId: orgAId,
      branchId: branchAId,
      name: "Register A2",
      identifier: "REG-MA2",
    });
    registerA2Id = regA2.id;

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
      [`${uniqueValue("mov-owner-b")}@test.local`, "pwd", "Owner B", "ACTIVE"]
    );
    ownerBId = ownerBRes.rows[0].id;

    const orgBRes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerBId, uniqueValue("Org B Movement Test")]
    );
    orgBId = orgBRes.rows[0].id;

    const branchBRes = await pool.query(
      `INSERT INTO branches (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
      [orgBId, "Main Branch B"]
    );
    branchBId = branchBRes.rows[0].id;

    const cashierBRes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [`${uniqueValue("mov-cashier-b")}@test.local`, "pwd", "Cashier Bob", "ACTIVE"]
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
      identifier: "REG-MB",
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
    // Test 1: Create Cash IN movement (e.g. Float Addition)
    // ---------------------------------------------------------
    const movIn = await createMovement({
      organisationId: orgAId,
      branchId: branchAId,
      cashRegisterSessionId: sessionAId,
      cashierId: cashierAId,
      movementType: "IN",
      amount: 500,
      reason: "Additional morning cash float",
    });

    assert.ok(movIn.id);
    assert.ok(movIn.movement_number.startsWith("PC-"));
    assert.strictEqual(movIn.movement_type, "IN");
    assert.strictEqual(Number(movIn.amount), 500);
    assert.strictEqual(movIn.reason, "Additional morning cash float");
    console.log("✓ 1. Cash IN movement created with PC sequence number");

    // ---------------------------------------------------------
    // Test 2: Create Cash OUT movement (Petty Expense)
    // ---------------------------------------------------------
    const movOut = await createMovement({
      organisationId: orgAId,
      branchId: branchAId,
      cashRegisterSessionId: sessionAId,
      cashierId: cashierAId,
      movementType: "OUT",
      amount: 150,
      reason: "Courier delivery expense",
    });

    assert.ok(movOut.id);
    assert.ok(movOut.movement_number.startsWith("PC-"));
    assert.strictEqual(movOut.movement_type, "OUT");
    assert.strictEqual(Number(movOut.amount), 150);
    assert.strictEqual(movOut.reason, "Courier delivery expense");
    console.log("✓ 2. Cash OUT movement created with PC sequence number");

    // ---------------------------------------------------------
    // Test 3: Amount validation (> 0)
    // ---------------------------------------------------------
    await assert.rejects(
      async () => {
        await createMovement({
          organisationId: orgAId,
          branchId: branchAId,
          cashRegisterSessionId: sessionAId,
          cashierId: cashierAId,
          movementType: "IN",
          amount: 0,
          reason: "Zero amount",
        });
      },
      /amount must be a positive number greater than 0/i
    );

    await assert.rejects(
      async () => {
        await createMovement({
          organisationId: orgAId,
          branchId: branchAId,
          cashRegisterSessionId: sessionAId,
          cashierId: cashierAId,
          movementType: "OUT",
          amount: -50,
          reason: "Negative amount",
        });
      },
      /amount must be a positive number greater than 0/i
    );
    console.log("✓ 3. Non-positive amount rejected");

    // ---------------------------------------------------------
    // Test 4: Invalid movement type rejected
    // ---------------------------------------------------------
    await assert.rejects(
      async () => {
        await createMovement({
          organisationId: orgAId,
          branchId: branchAId,
          cashRegisterSessionId: sessionAId,
          cashierId: cashierAId,
          movementType: "TRANSFER",
          amount: 100,
          reason: "Invalid type",
        });
      },
      /movementType must be either 'IN' or 'OUT'/i
    );
    console.log("✓ 4. Invalid movement type rejected");

    // ---------------------------------------------------------
    // Test 5: Session / branch / organisation relationship validation
    // ---------------------------------------------------------
    await assert.rejects(
      async () => {
        await createMovement({
          organisationId: orgAId,
          branchId: branchAId,
          cashRegisterSessionId: sessionBId, // Session belongs to Org B!
          cashierId: cashierAId,
          movementType: "IN",
          amount: 100,
          reason: "Cross-org attack",
        });
      },
      /Cash register session not found in the specified organisation/i
    );
    console.log("✓ 5. Session / branch / organisation boundary enforced");

    // ---------------------------------------------------------
    // Test 6: List movements by session
    // ---------------------------------------------------------
    const listA = await listMovementsBySession({
      organisationId: orgAId,
      branchId: branchAId,
      sessionId: sessionAId,
    });
    assert.strictEqual(listA.length, 2);
    assert.strictEqual(listA[0].movement_type, "IN");
    assert.strictEqual(listA[1].movement_type, "OUT");
    console.log("✓ 6. List movements by session in chronological order");

    // ---------------------------------------------------------
    // Test 7: Multi-tenant isolation
    // ---------------------------------------------------------
    await assert.rejects(
      async () => {
        await listMovementsBySession({
          organisationId: orgBId,
          branchId: branchBId,
          sessionId: sessionAId, // Belongs to Org A!
        });
      },
      /Cash register session not found in the specified organisation/i
    );

    const listB = await listMovementsBySession({
      organisationId: orgBId,
      branchId: branchBId,
      sessionId: sessionBId,
    });
    assert.strictEqual(listB.length, 0);
    console.log("✓ 7. Multi-tenant isolation verified");

    // ---------------------------------------------------------
    // Test 8: Cache invalidation on new movement
    // ---------------------------------------------------------
    await listMovementsBySession({
      organisationId: orgAId,
      branchId: branchAId,
      sessionId: sessionAId,
    });
    const cacheKey = buildMovementsListCacheKey(orgAId, sessionAId);
    const cachedBefore = await getCache(cacheKey);
    assert.ok(cachedBefore, "Movements list should be cached");

    await createMovement({
      organisationId: orgAId,
      branchId: branchAId,
      cashRegisterSessionId: sessionAId,
      cashierId: cashierAId,
      movementType: "IN",
      amount: 200,
      reason: "Another float topup",
    });

    const cachedAfter = await getCache(cacheKey);
    assert.strictEqual(cachedAfter, null, "Movements list cache must be invalidated after createMovement");
    console.log("✓ 8. Cache invalidation verified");

    // ---------------------------------------------------------
    // Test 9: Posted movements must NOT be physically deleted
    // ---------------------------------------------------------
    const movementRepo = require("../repositories/cash-movement.repository");
    assert.strictEqual(
      movementRepo.deleteMovement,
      undefined,
      "deleteMovement must NOT be exposed as posted movements must not be physically deleted"
    );
    console.log("✓ 9. Audit safety: posted movements cannot be deleted via repository");

    // ---------------------------------------------------------
    // Test 10: Transaction client participation and rollback
    // ---------------------------------------------------------
    const txClient = await pool.connect();
    try {
      await txClient.query("BEGIN");
      const txMov = await createMovement({
        organisationId: orgAId,
        branchId: branchAId,
        cashRegisterSessionId: sessionAId,
        cashierId: cashierAId,
        movementType: "OUT",
        amount: 80,
        reason: "Tea expense in transaction",
        client: txClient,
      });
      assert.ok(txMov.id);

      await txClient.query("ROLLBACK");

      const movementsAfterRollback = await listMovementsBySession({
        organisationId: orgAId,
        branchId: branchAId,
        sessionId: sessionAId,
      });
      const found = movementsAfterRollback.some((m) => m.id === txMov.id);
      assert.strictEqual(found, false, "Rolled-back movement must not exist");
      console.log("✓ 10. Transaction client participation and rollback");
    } finally {
      txClient.release();
    }

    // ---------------------------------------------------------
    // Test 11: Movement fails on CLOSED session (Finding 2)
    // ---------------------------------------------------------
    const closedSession = await closeSession({
      organisationId: orgAId,
      sessionId: sessionAId,
      countedCash: 1550, // 1000 + 500 - 150 + 200 = 1550
    });
    assert.strictEqual(closedSession.status, "CLOSED");

    await assert.rejects(
      async () => {
        await createMovement({
          organisationId: orgAId,
          branchId: branchAId,
          cashRegisterSessionId: sessionAId,
          cashierId: cashierAId,
          movementType: "IN",
          amount: 100,
          reason: "Attempting float topup after close",
        });
      },
      /Cannot post cash movement to a closed session/i,
      "Cash movement must fail when attempted on a closed session"
    );
    console.log("✓ 11. Movement fails on CLOSED session");

    // ---------------------------------------------------------
    // Test 12: Movement and session-close concurrency (Finding 2)
    // ---------------------------------------------------------
    // Open a fresh session on register A2
    const sessionConc = await openSession({
      organisationId: orgAId,
      branchId: branchAId,
      cashRegisterId: registerA2Id,
      cashierId: cashierAId,
      openingBalance: 500,
    });

    // Run closeSession and createMovement concurrently
    const [closeRes, moveRes] = await Promise.allSettled([
      closeSession({ organisationId: orgAId, sessionId: sessionConc.id, countedCash: 500 }),
      createMovement({
        organisationId: orgAId,
        branchId: branchAId,
        cashRegisterSessionId: sessionConc.id,
        cashierId: cashierAId,
        movementType: "IN",
        amount: 100,
        reason: "Concurrent movement",
      }),
    ]);

    // Check invariants:
    // Case 1: Movement won the race -> movement succeeded, close succeeded with expected_cash = 600 (500 + 100).
    // Case 2: Close won the race -> close succeeded with expected_cash = 500, movement was rejected with 'Cannot post cash movement to a closed session'.
    assert.strictEqual(closeRes.status, "fulfilled", "Session close must succeed");
    if (moveRes.status === "fulfilled") {
      // Movement ran before close; check that closing snapshot included the movement
      assert.strictEqual(Number(closeRes.value.expected_cash), 600, "If movement succeeded before close, expected cash must include it");
    } else {
      // Close locked session first; movement must have been cleanly rejected
      assert.ok(
        /Cannot post cash movement to a closed session/i.test(moveRes.reason.message),
        "If close occurred first, movement must fail with 'Cannot post cash movement to a closed session'"
      );
    }
    console.log("✓ 12. Movement / session-close concurrency cannot leave orphaned posted movement after close");

    console.log("\nAll 12 Cash Movement Repository tests passed successfully!\n");
  } finally {
    // Cleanup
    if (orgAId) {
      await pool.query("DELETE FROM cash_movements WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM cash_register_sessions WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM cash_registers WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM organisation_memberships WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM branches WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM organisations WHERE id = $1;", [orgAId]).catch(() => {});
    }
    if (orgBId) {
      await pool.query("DELETE FROM cash_movements WHERE organisation_id = $1;", [orgBId]).catch(() => {});
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

    try {
      if (redisClient.isOpen) {
        await disconnectRedis();
      }
    } catch (e) {}

    await pool.end();
  }
};

runTests().catch((err) => {
  console.error("Cash Movement tests failed:", err);
  process.exit(1);
});

/**
 * Cash Register Session Repository Integration Tests
 *
 * Tests the Cash Register Session Repository against real PostgreSQL and Redis.
 *
 * Verifies:
 * 1. Open session with float and sequential REG business number.
 * 2. Retrieve current active session.
 * 3. Duplicate open session prevented by partial unique index.
 * 4. Multi-tenant isolation.
 * 5. Close session with authoritatively derived expected cash and variance.
 * 6. Second close rejected.
 * 7. Concurrent close attempts where only one succeeds.
 * 8. Rollback leaves session OPEN if transaction fails.
 * 9. Reconciliation cache automatically invalidated on session close.
 * 10. List session history in reverse chronological order.
 * 11. Transaction client participation and Redis bypass.
 */

require("dotenv").config();
const assert = require("assert");
const { pool } = require("../db/connection");
const { redisClient, connectRedis, disconnectRedis } = require("../cache/redis");
const { getCache } = require("../cache/cache");
const {
  openSession,
  getCurrentSession,
  getSessionById,
  closeSession,
  listSessionHistory,
  buildActiveSessionCacheKey,
  buildSessionCacheKey,
} = require("../repositories/cash-register-session.repository");
const {
  getSessionReconciliationSummary,
  buildReconciliationCacheKey,
} = require("../repositories/cash-register-dashboard.repository");

const uniqueValue = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

const runTests = async () => {
  let ownerAId, orgAId, branchA1Id, cashierAId, customerAId;
  let registerA1Id, registerA2Id;
  let ownerBId, orgBId, branchBId, cashierBId, registerBId;
  let session1Id;

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning Cash Register Session Repository tests...\n");

    // Setup Organisation A
    const ownerARes = await pool.query(
      "INSERT INTO users (email, password_hash, name, status) VALUES ($1, 'pwd', 'Owner A', 'ACTIVE') RETURNING id;",
      [`${uniqueValue("sess-owner-a")}@test.local`]
    );
    ownerAId = ownerARes.rows[0].id;

    const orgARes = await pool.query(
      "INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;",
      [ownerAId, uniqueValue("Org A Session Test")]
    );
    orgAId = orgARes.rows[0].id;

    const branchA1Res = await pool.query(
      "INSERT INTO branches (organisation_id, name) VALUES ($1, 'Main Branch') RETURNING id;",
      [orgAId]
    );
    branchA1Id = branchA1Res.rows[0].id;

    const cashierARes = await pool.query(
      "INSERT INTO users (email, password_hash, name, status) VALUES ($1, 'pwd', 'Cashier Alice', 'ACTIVE') RETURNING id;",
      [`${uniqueValue("sess-cashier-a")}@test.local`]
    );
    cashierAId = cashierARes.rows[0].id;

    await pool.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'ACTIVE');",
      [orgAId, cashierAId]
    );

    const custARes = await pool.query(
      "INSERT INTO customers (organisation_id, customer_number, full_name, phone) VALUES ($1, 'CUST-S1', 'Customer One', '9876543210') RETURNING id;",
      [orgAId]
    );
    customerAId = custARes.rows[0].id;

    const regA1Res = await pool.query(
      "INSERT INTO cash_registers (organisation_id, branch_id, name, identifier) VALUES ($1, $2, 'Counter 1', 'POS-01') RETURNING id;",
      [orgAId, branchA1Id]
    );
    registerA1Id = regA1Res.rows[0].id;

    const regA2Res = await pool.query(
      "INSERT INTO cash_registers (organisation_id, branch_id, name, identifier) VALUES ($1, $2, 'Counter 2', 'POS-02') RETURNING id;",
      [orgAId, branchA1Id]
    );
    registerA2Id = regA2Res.rows[0].id;

    // Setup Organisation B
    const ownerBRes = await pool.query(
      "INSERT INTO users (email, password_hash, name, status) VALUES ($1, 'pwd', 'Owner B', 'ACTIVE') RETURNING id;",
      [`${uniqueValue("sess-owner-b")}@test.local`]
    );
    ownerBId = ownerBRes.rows[0].id;

    const orgBRes = await pool.query(
      "INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;",
      [ownerBId, uniqueValue("Org B Session Test")]
    );
    orgBId = orgBRes.rows[0].id;

    const branchBRes = await pool.query(
      "INSERT INTO branches (organisation_id, name) VALUES ($1, 'Branch B') RETURNING id;",
      [orgBId]
    );
    branchBId = branchBRes.rows[0].id;

    const cashierBRes = await pool.query(
      "INSERT INTO users (email, password_hash, name, status) VALUES ($1, 'pwd', 'Cashier Bob', 'ACTIVE') RETURNING id;",
      [`${uniqueValue("sess-cashier-b")}@test.local`]
    );
    cashierBId = cashierBRes.rows[0].id;

    await pool.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'ACTIVE');",
      [orgBId, cashierBId]
    );

    const regBRes = await pool.query(
      "INSERT INTO cash_registers (organisation_id, branch_id, name, identifier) VALUES ($1, $2, 'Counter B1', 'POS-B1') RETURNING id;",
      [orgBId, branchBId]
    );
    registerBId = regBRes.rows[0].id;

    // ---------------------------------------------------------
    // Test 1: Open session with float and REG sequence number
    // ---------------------------------------------------------
    const session1 = await openSession({
      organisationId: orgAId,
      branchId: branchA1Id,
      cashRegisterId: registerA1Id,
      cashierId: cashierAId,
      openingBalance: 1500.50,
      shiftName: "Morning Shift",
      openingNotes: "Starting morning shift with float",
    });

    assert.ok(session1.id);
    assert.strictEqual(session1.organisation_id, orgAId);
    assert.strictEqual(session1.branch_id, branchA1Id);
    assert.strictEqual(session1.cash_register_id, registerA1Id);
    assert.strictEqual(session1.cashier_id, cashierAId);
    assert.ok(session1.session_number.startsWith("REG-"));
    assert.strictEqual(session1.status, "OPEN");
    assert.strictEqual(Number(session1.opening_balance), 1500.50);
    session1Id = session1.id;
    console.log("✓ 1. Open session with float and REG sequence number");

    // ---------------------------------------------------------
    // Test 2: Retrieve current active session
    // ---------------------------------------------------------
    const current = await getCurrentSession(orgAId, branchA1Id, registerA1Id);
    assert.ok(current);
    assert.strictEqual(current.id, session1Id);
    assert.strictEqual(current.status, "OPEN");
    console.log("✓ 2. Retrieve current active session");

    // ---------------------------------------------------------
    // Test 3: Duplicate open-session prevented by partial unique index
    // ---------------------------------------------------------
    await assert.rejects(async () => {
      await openSession({
        organisationId: orgAId,
        branchId: branchA1Id,
        cashRegisterId: registerA1Id,
        cashierId: cashierAId,
        openingBalance: 500,
      });
    }, /A session is already open on this cash register/i);
    console.log("✓ 3. Duplicate open-session prevented by partial unique index");

    // ---------------------------------------------------------
    // Test 4: Multi-tenant isolation verified
    // ---------------------------------------------------------
    const orgBFetch = await getSessionById(orgBId, session1Id);
    assert.strictEqual(orgBFetch, null);

    const orgBActive = await getCurrentSession(orgBId, branchBId, registerBId);
    assert.strictEqual(orgBActive, null);
    console.log("✓ 4. Multi-tenant isolation verified");

    // ---------------------------------------------------------
    // Test 5: Close Session with Authoritatively Derived Expected Cash & Variance
    // ---------------------------------------------------------
    // Add real database transactions linked to session1:
    // 1) Completed Cash payment: ₹500
    const payRes = await pool.query(
      `INSERT INTO payments (
         organisation_id, branch_id, customer_id, receipt_number, total_amount, status, cash_register_session_id
       ) VALUES ($1, $2, $3, 'REC-S1', 500.00, 'COMPLETED', $4) RETURNING id;`,
      [orgAId, branchA1Id, customerAId, session1Id]
    );
    const payId = payRes.rows[0].id;
    await pool.query(
      `INSERT INTO payment_transactions (payment_id, payment_method, amount)
       VALUES ($1, 'CASH', 500.00);`,
      [payId]
    );

    // 2) Processed Cash return: ₹100
    const invRes = await pool.query(
      `INSERT INTO invoices (
         organisation_id, branch_id, customer_id, invoice_number, subtotal, total_amount, status, cash_register_session_id
       ) VALUES ($1, $2, $3, 'INV-S1', 500.00, 500.00, 'COMPLETED', $4) RETURNING id;`,
      [orgAId, branchA1Id, customerAId, session1Id]
    );
    const invId = invRes.rows[0].id;
    await pool.query(
      `INSERT INTO returns (
         organisation_id, branch_id, customer_id, invoice_id, return_number, refund_amount, refund_method, status, cash_register_session_id
       ) VALUES ($1, $2, $3, $4, 'RET-S1', 100.00, 'CASH', 'PROCESSED', $5);`,
      [orgAId, branchA1Id, customerAId, invId, session1Id]
    );

    // 3) Cash Movement IN: ₹200
    await pool.query(
      `INSERT INTO cash_movements (
         organisation_id, branch_id, cash_register_session_id, cashier_id, movement_number, movement_type, amount, reason
       ) VALUES ($1, $2, $3, $4, 'PC-S1', 'IN', 200.00, 'Float addition');`,
      [orgAId, branchA1Id, session1Id, cashierAId]
    );

    // 4) Cash Movement OUT: ₹50
    await pool.query(
      `INSERT INTO cash_movements (
         organisation_id, branch_id, cash_register_session_id, cashier_id, movement_number, movement_type, amount, reason
       ) VALUES ($1, $2, $3, $4, 'PC-S2', 'OUT', 50.00, 'Cleaning expense');`,
      [orgAId, branchA1Id, session1Id, cashierAId]
    );

    // Expected Cash = 1500.50 (opening) + 500 (cash sale) - 100 (cash refund) + 200 (in) - 50 (out) = 2050.50
    // Counted Cash = 2000.00 -> Variance = -50.50 (SHORTAGE)
    const closed = await closeSession({
      organisationId: orgAId,
      sessionId: session1Id,
      countedCash: 2000.00,
      closingNotes: "Slight shortage in drawer",
      // Caller passes bogus expectedCash to prove DB derivation overrides it
      expectedCash: 9999.99,
      variance: 999.99,
    });

    assert.strictEqual(closed.id, session1Id);
    assert.strictEqual(closed.status, "CLOSED");
    assert.strictEqual(Number(closed.counted_cash), 2000.00);
    assert.strictEqual(Number(closed.expected_cash), 2050.50, "Expected cash must be authoritatively derived from DB transactions");
    assert.strictEqual(Number(closed.variance), -50.50, "Variance must be counted_cash - derived expected_cash");
    assert.strictEqual(closed.variance_status, "SHORTAGE");
    assert.ok(closed.closed_at);
    console.log("✓ 5. Close session with authoritatively derived expected cash & variance");

    // ---------------------------------------------------------
    // Test 6: Prevent Closing an Already Closed Session
    // ---------------------------------------------------------
    await assert.rejects(async () => {
      await closeSession({
        organisationId: orgAId,
        sessionId: session1Id,
        countedCash: 2000.00,
      });
    }, /Session is already closed/i);
    console.log("✓ 6. Prevent closing an already closed session");

    // ---------------------------------------------------------
    // Test 7: Concurrent Close Attempts (Only One Succeeds)
    // ---------------------------------------------------------
    const sessionConc = await openSession({
      organisationId: orgAId,
      branchId: branchA1Id,
      cashRegisterId: registerA1Id, // Register is now free
      cashierId: cashierAId,
      openingBalance: 1000.00,
    });

    const [closeRes1, closeRes2] = await Promise.allSettled([
      closeSession({ organisationId: orgAId, sessionId: sessionConc.id, countedCash: 1000.00 }),
      closeSession({ organisationId: orgAId, sessionId: sessionConc.id, countedCash: 1000.00 }),
    ]);

    const successes = [closeRes1, closeRes2].filter((r) => r.status === "fulfilled");
    const failures = [closeRes1, closeRes2].filter((r) => r.status === "rejected");

    assert.strictEqual(successes.length, 1, "Exactly one concurrent close must succeed");
    assert.strictEqual(failures.length, 1, "Exactly one concurrent close must be rejected");
    assert.ok(
      /Session is already closed/i.test(failures[0].reason.message),
      "Rejected close must fail with 'Session is already closed'"
    );
    console.log("✓ 7. Concurrent close attempts: exactly one succeeds, second fails cleanly");

    // ---------------------------------------------------------
    // Test 8: Rollback Leaves Session OPEN if Closing Transaction Fails
    // ---------------------------------------------------------
    const sessionRollback = await openSession({
      organisationId: orgAId,
      branchId: branchA1Id,
      cashRegisterId: registerA1Id,
      cashierId: cashierAId,
      openingBalance: 750.00,
    });

    const txClient = await pool.connect();
    try {
      await txClient.query("BEGIN");
      await closeSession(
        { organisationId: orgAId, sessionId: sessionRollback.id, countedCash: 750.00 },
        txClient
      );
      // Rollback transaction
      await txClient.query("ROLLBACK");
    } finally {
      txClient.release();
    }

    const checkRollback = await getSessionById(orgAId, sessionRollback.id);
    assert.strictEqual(checkRollback.status, "OPEN", "Session must remain OPEN if closing transaction was rolled back");
    console.log("✓ 8. Rollback leaves session OPEN if transaction fails");

    // ---------------------------------------------------------
    // Test 9: Close Session Automatically Invalidates Reconciliation Cache (Finding 5)
    // ---------------------------------------------------------
    // Populate reconciliation cache while session is OPEN
    const reconBefore = await getSessionReconciliationSummary({
      organisationId: orgAId,
      branchId: branchA1Id,
      sessionId: sessionRollback.id,
    });
    assert.strictEqual(reconBefore.status, "OPEN");

    const cacheKey = buildReconciliationCacheKey(orgAId, sessionRollback.id);
    const cachedBefore = await getCache(cacheKey);
    assert.ok(cachedBefore, "Reconciliation summary must be cached in Redis");

    // Close the session
    await closeSession({
      organisationId: orgAId,
      sessionId: sessionRollback.id,
      countedCash: 750.00,
    });

    // Verify cache was invalidated
    const cachedAfter = await getCache(cacheKey);
    assert.strictEqual(cachedAfter, null, "Reconciliation cache must be invalidated on session close");

    // Next query must see fresh closed snapshot
    const reconAfter = await getSessionReconciliationSummary({
      organisationId: orgAId,
      branchId: branchA1Id,
      sessionId: sessionRollback.id,
    });
    assert.strictEqual(reconAfter.status, "CLOSED", "Subsequent query must see fresh CLOSED state");
    console.log("✓ 9. Close session automatically invalidates reconciliation cache");

    // ---------------------------------------------------------
    // Test 10: List Session History
    // ---------------------------------------------------------
    const history = await listSessionHistory({
      organisationId: orgAId,
      branchId: branchA1Id,
      cashRegisterId: registerA1Id,
    });
    assert.ok(history.length >= 3);
    assert.strictEqual(history[0].id, sessionRollback.id); // Most recent first
    console.log("✓ 10. Session history listed in reverse chronological order");

    // ---------------------------------------------------------
    // Test 11: Transaction Client Participation and Redis Bypass
    // ---------------------------------------------------------
    const txClient2 = await pool.connect();
    try {
      await txClient2.query("BEGIN");
      const txSession = await openSession({
        organisationId: orgAId,
        branchId: branchA1Id,
        cashRegisterId: registerA2Id,
        cashierId: cashierAId,
        openingBalance: 500,
        client: txClient2,
      });
      assert.ok(txSession.id);

      const fetchedInTx = await getSessionById(orgAId, txSession.id, txClient2);
      assert.ok(fetchedInTx);
      assert.strictEqual(fetchedInTx.id, txSession.id);

      const txCache = await getCache(buildSessionCacheKey(orgAId, txSession.id));
      assert.strictEqual(txCache, null, "Transaction client reads must bypass Redis");

      await txClient2.query("ROLLBACK");

      const afterRollback = await getSessionById(orgAId, txSession.id);
      assert.strictEqual(afterRollback, null, "Rolled-back session must not exist");
      console.log("✓ 11. Transaction client participation, rollback, and Redis bypass");
    } finally {
      txClient2.release();
    }

    console.log("\nAll 11 Cash Register Session Repository tests passed successfully!\n");
  } finally {
    // Cleanup
    if (orgAId) {
      await pool.query("DELETE FROM returns WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM payment_transactions WHERE payment_id IN (SELECT id FROM payments WHERE organisation_id = $1);", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM payments WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM invoices WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM cash_movements WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM cash_register_sessions WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM cash_registers WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM customers WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM organisation_memberships WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM branches WHERE organisation_id = $1;", [orgAId]).catch(() => {});
      await pool.query("DELETE FROM organisations WHERE id = $1;", [orgAId]).catch(() => {});
    }
    if (orgBId) {
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
  console.error("Cash Register Session tests failed:", err);
  process.exit(1);
});

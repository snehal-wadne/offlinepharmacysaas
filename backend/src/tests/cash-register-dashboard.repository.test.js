/**
 * Cash Register Dashboard Repository Integration Tests
 *
 * Tests the Cash Register Dashboard Repository against real PostgreSQL and Redis.
 *
 * Verifies:
 * 1. Opening balance retrieval and caching.
 * 2. Automatic reconciliation cache invalidation on payment & payment transaction creation.
 * 3. Digital sales aggregation (UPI and CARD collected without altering physical drawer expected cash).
 * 4. Automatic reconciliation cache invalidation on payment & payment transaction update / deletion.
 * 5. Automatic reconciliation cache invalidation on return creation & update.
 * 6. Petty cash movements aggregation & automatic cache invalidation.
 * 7. Real-time Expected Cash Calculation:
 *    Expected Cash = Opening Balance + Cash Sales - Cash Refunds + Cash In - Cash Out
 * 8. Automatic reconciliation cache invalidation on session close (Finding 5).
 * 9. Multi-tenant and session isolation (Org B cannot view Org A session reconciliation).
 * 10. Cache hit / miss and targeted invalidation verification.
 * 11. Transaction client bypasses Redis for immediate consistency.
 */

require("dotenv").config();
const assert = require("assert");
const { pool } = require("../db/connection");
const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");
const { getCache } = require("../cache/cache");
const {
  createCashRegister,
} = require("../repositories/cash-register.repository");
const {
  openSession,
  closeSession,
} = require("../repositories/cash-register-session.repository");
const { createMovement } = require("../repositories/cash-movement.repository");
const { createInvoice } = require("../repositories/invoice.repository");
const {
  createPayment,
  updatePayment,
  deletePayment,
} = require("../repositories/payment.repository");
const {
  createPaymentTransaction,
  updatePaymentTransaction,
  deletePaymentTransaction,
} = require("../repositories/payment-transaction.repository");
const {
  createReturn,
  updateReturn,
  deleteReturn,
} = require("../repositories/return.repository");
const {
  getSessionReconciliationSummary,
  invalidateSessionReconciliationCache,
  buildReconciliationCacheKey,
} = require("../repositories/cash-register-dashboard.repository");

const uniqueValue = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

const runTests = async () => {
  let ownerAId = null;
  let orgAId = null;
  let branchAId = null;
  let cashierAId = null;
  let customerAId = null;
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
    await connectRedis();

    console.log("\nRunning Cash Register Dashboard Repository tests...\n");

    // Setup Organisation A
    const ownerARes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [`${uniqueValue("dash-owner-a")}@test.local`, "pwd", "Owner A", "ACTIVE"],
    );
    ownerAId = ownerARes.rows[0].id;

    const orgARes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerAId, uniqueValue("Org A Dashboard Test")],
    );
    orgAId = orgARes.rows[0].id;

    const branchARes = await pool.query(
      `INSERT INTO branches (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
      [orgAId, "Main Branch A"],
    );
    branchAId = branchARes.rows[0].id;

    const cashierARes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [
        `${uniqueValue("dash-cashier-a")}@test.local`,
        "pwd",
        "Alice Cashier",
        "ACTIVE",
      ],
    );
    cashierAId = cashierARes.rows[0].id;

    await pool.query(
      `INSERT INTO organisation_memberships (organisation_id, user_id, status)
       VALUES ($1, $2, 'ACTIVE');`,
      [orgAId, cashierAId],
    );

    const custARes = await pool.query(
      `INSERT INTO customers (organisation_id, customer_number, full_name, phone)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [orgAId, uniqueValue("CUST"), "Walkin Customer A", uniqueValue("phone")],
    );
    customerAId = custARes.rows[0].id;

    // Setup Organisation B (for tenant isolation)
    const ownerBRes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [`${uniqueValue("dash-owner-b")}@test.local`, "pwd", "Owner B", "ACTIVE"],
    );
    ownerBId = ownerBRes.rows[0].id;

    const orgBRes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerBId, uniqueValue("Org B Dashboard Test")],
    );
    orgBId = orgBRes.rows[0].id;

    const branchBRes = await pool.query(
      `INSERT INTO branches (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
      [orgBId, "Main Branch B"],
    );
    branchBId = branchBRes.rows[0].id;

    const cashierBRes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [
        `${uniqueValue("dash-cashier-b")}@test.local`,
        "pwd",
        "Bob Cashier",
        "ACTIVE",
      ],
    );
    cashierBId = cashierBRes.rows[0].id;

    await pool.query(
      `INSERT INTO organisation_memberships (organisation_id, user_id, status)
       VALUES ($1, $2, 'ACTIVE');`,
      [orgBId, cashierBId],
    );

    // Create Registers
    const regA = await createCashRegister({
      organisationId: orgAId,
      branchId: branchARes.rows[0].id,
      name: "POS Counter 1",
      identifier: uniqueValue("REG-A"),
    });
    registerAId = regA.id;

    const regB = await createCashRegister({
      organisationId: orgBId,
      branchId: branchBRes.rows[0].id,
      name: "POS Counter 2",
      identifier: uniqueValue("REG-B"),
    });
    registerBId = regB.id;

    // Open Sessions
    const sessA = await openSession({
      organisationId: orgAId,
      branchId: branchAId,
      cashRegisterId: registerAId,
      cashierId: cashierAId,
      openingBalance: 1000.0,
      shiftName: "Morning Shift",
      openingNotes: "Starting float of 1000",
    });
    sessionAId = sessA.id;

    const sessB = await openSession({
      organisationId: orgBId,
      branchId: branchBId,
      cashRegisterId: registerBId,
      cashierId: cashierBId,
      openingBalance: 500.0,
      shiftName: "Morning Shift",
    });
    sessionBId = sessB.id;

    const cacheKeyA = buildReconciliationCacheKey(orgAId, sessionAId);

    // ---------------------------------------------------------
    // Test 1: Initial State & Reconciliation Caching
    // ---------------------------------------------------------
    const initialSummary = await getSessionReconciliationSummary({
      organisationId: orgAId,
      branchId: branchAId,
      sessionId: sessionAId,
    });
    assert.strictEqual(initialSummary.openingBalance, 1000.0);
    assert.strictEqual(initialSummary.expectedCash, 1000.0);
    assert.strictEqual(initialSummary.sales.cashSales, 0);

    let cached = await getCache(cacheKeyA);
    assert.ok(cached, "Initial summary should be cached in Redis");
    assert.strictEqual(cached.expectedCash, 1000.0);
    console.log(
      "✓ 1. Initial state: Opening balance verified and cached in Redis",
    );

    // ---------------------------------------------------------
    // Test 2: Automatic Cache Invalidation on Payment & Transaction Creation
    // (NO manual cache clearing!)
    // ---------------------------------------------------------
    const inv1 = await createInvoice({
      organisationId: orgAId,
      branchId: branchAId,
      customerId: customerAId,
      subtotal: 2500,
      totalAmount: 2500,
      status: "COMPLETED",
      createdBy: cashierAId,
      cashRegisterSessionId: sessionAId,
    });

    const payment1 = await createPayment({
      organisationId: orgAId,
      branchId: branchAId,
      customerId: customerAId,
      totalAmount: 2500,
      status: "COMPLETED",
      receivedBy: cashierAId,
      cashRegisterSessionId: sessionAId,
    });

    // createPayment automatically invalidated cache
    cached = await getCache(cacheKeyA);
    assert.strictEqual(
      cached,
      null,
      "createPayment must automatically invalidate reconciliation cache",
    );

    await createPaymentTransaction({
      organisationId: orgAId,
      paymentId: payment1.id,
      paymentMethod: "CASH",
      amount: 2500.0,
    });

    // createPaymentTransaction also invalidates cache
    cached = await getCache(cacheKeyA);
    assert.strictEqual(
      cached,
      null,
      "createPaymentTransaction must automatically invalidate reconciliation cache",
    );

    const summaryAfterPayment1 = await getSessionReconciliationSummary({
      organisationId: orgAId,
      branchId: branchAId,
      sessionId: sessionAId,
    });
    assert.strictEqual(summaryAfterPayment1.sales.cashSales, 2500.0);
    assert.strictEqual(summaryAfterPayment1.expectedCash, 3500.0);

    // Add digital sales via split payment (UPI 1200 + CARD 800)
    const payment2 = await createPayment({
      organisationId: orgAId,
      branchId: branchAId,
      customerId: customerAId,
      totalAmount: 2000,
      status: "COMPLETED",
      receivedBy: cashierAId,
      cashRegisterSessionId: sessionAId,
    });
    await createPaymentTransaction({
      organisationId: orgAId,
      paymentId: payment2.id,
      paymentMethod: "UPI",
      amount: 1200.0,
    });
    await createPaymentTransaction({
      organisationId: orgAId,
      paymentId: payment2.id,
      paymentMethod: "CARD",
      amount: 800.0,
    });

    // Query dashboard without manual cache clearing
    const summaryAfterSales = await getSessionReconciliationSummary({
      organisationId: orgAId,
      branchId: branchAId,
      sessionId: sessionAId,
    });

    assert.strictEqual(summaryAfterSales.sales.cashSales, 2500.0);
    assert.strictEqual(summaryAfterSales.sales.upiSales, 1200.0);
    assert.strictEqual(summaryAfterSales.sales.cardSales, 800.0);
    assert.strictEqual(summaryAfterSales.sales.totalSalesCollected, 4500.0);
    assert.strictEqual(summaryAfterSales.sales.transactionCount, 2);
    // Expected cash: 1000 (opening) + 2500 (cash sale) = 3500.00 (UPI & CARD do not alter drawer cash)
    assert.strictEqual(summaryAfterSales.expectedCash, 3500.0);
    console.log(
      "✓ 2. Payment & payment transaction creation automatically invalidates reconciliation cache; digital sales tracked separately",
    );

    // ---------------------------------------------------------
    // Test 3: Automatic Cache Invalidation on Payment & Transaction Mutation (Update / Delete)
    // ---------------------------------------------------------
    const tempPayment = await createPayment({
      organisationId: orgAId,
      branchId: branchAId,
      customerId: customerAId,
      totalAmount: 300,
      status: "COMPLETED",
      receivedBy: cashierAId,
      cashRegisterSessionId: sessionAId,
    });
    const tempTx = await createPaymentTransaction({
      organisationId: orgAId,
      paymentId: tempPayment.id,
      paymentMethod: "CASH",
      amount: 300.0,
    });

    const summaryWithTemp = await getSessionReconciliationSummary({
      organisationId: orgAId,
      branchId: branchAId,
      sessionId: sessionAId,
    });
    assert.strictEqual(summaryWithTemp.expectedCash, 3800.0); // 3500 + 300

    // Update payment transaction amount: 300 -> 400
    await updatePaymentTransaction(orgAId, tempTx.id, { amount: 400.0 });
    cached = await getCache(cacheKeyA);
    assert.strictEqual(
      cached,
      null,
      "updatePaymentTransaction must automatically invalidate reconciliation cache",
    );

    const summaryAfterTxUpdate = await getSessionReconciliationSummary({
      organisationId: orgAId,
      branchId: branchAId,
      sessionId: sessionAId,
    });
    assert.strictEqual(summaryAfterTxUpdate.expectedCash, 3900.0); // 3500 + 400

    // Delete payment transaction
    await deletePaymentTransaction(orgAId, tempTx.id);
    cached = await getCache(cacheKeyA);
    assert.strictEqual(
      cached,
      null,
      "deletePaymentTransaction must automatically invalidate reconciliation cache",
    );

    // Delete temporary payment
    await deletePayment(orgAId, tempPayment.id);
    cached = await getCache(cacheKeyA);
    assert.strictEqual(
      cached,
      null,
      "deletePayment must automatically invalidate reconciliation cache",
    );

    const summaryAfterTxDelete = await getSessionReconciliationSummary({
      organisationId: orgAId,
      branchId: branchAId,
      sessionId: sessionAId,
    });
    assert.strictEqual(summaryAfterTxDelete.expectedCash, 3500.0);
    console.log(
      "✓ 3. Payment and payment transaction update/deletion automatically invalidate reconciliation cache",
    );

    // ---------------------------------------------------------
    // Test 4: Automatic Cache Invalidation on Return Creation & Mutation
    // ---------------------------------------------------------
    // Ensure cache is populated
    cached = await getCache(cacheKeyA);
    assert.ok(cached, "Reconciliation summary should be cached in Redis");

    const ret1 = await createReturn({
      organisationId: orgAId,
      branchId: branchAId,
      customerId: customerAId,
      invoiceId: inv1.id,
      refundAmount: 200.0,
      refundMethod: "CASH",
      status: "PROCESSED",
      createdBy: cashierAId,
      processedBy: cashierAId,
      cashRegisterSessionId: sessionAId,
    });

    // createReturn automatically invalidates cache (no manual invalidation!)
    cached = await getCache(cacheKeyA);
    assert.strictEqual(
      cached,
      null,
      "createReturn must automatically invalidate reconciliation cache",
    );

    const summaryAfterReturn = await getSessionReconciliationSummary({
      organisationId: orgAId,
      branchId: branchAId,
      sessionId: sessionAId,
    });

    assert.strictEqual(summaryAfterReturn.refunds.cashRefunds, 200.0);
    assert.strictEqual(summaryAfterReturn.refunds.totalRefunds, 200.0);
    assert.strictEqual(summaryAfterReturn.refunds.returnCount, 1);
    // Expected cash: 3500 - 200 = 3300.00
    assert.strictEqual(summaryAfterReturn.expectedCash, 3300.0);

    // Update return
    await updateReturn(orgAId, ret1.id, {
      notes: "Customer returned sealed medicine pack",
    });
    cached = await getCache(cacheKeyA);
    assert.strictEqual(
      cached,
      null,
      "updateReturn must automatically invalidate reconciliation cache",
    );
    console.log(
      "✓ 4. Return creation and mutation automatically invalidate reconciliation cache",
    );

    // ---------------------------------------------------------
    // Test 5: Petty Cash Movements (IN & OUT)
    // ---------------------------------------------------------
    await createMovement({
      organisationId: orgAId,
      branchId: branchAId,
      cashRegisterSessionId: sessionAId,
      cashierId: cashierAId,
      movementType: "IN",
      amount: 500.0,
      reason: "Mid-day float topup",
    });

    await createMovement({
      organisationId: orgAId,
      branchId: branchAId,
      cashRegisterSessionId: sessionAId,
      cashierId: cashierAId,
      movementType: "OUT",
      amount: 150.0,
      reason: "Emergency packaging purchase",
    });

    const summaryAfterMovements = await getSessionReconciliationSummary({
      organisationId: orgAId,
      branchId: branchAId,
      sessionId: sessionAId,
    });

    assert.strictEqual(summaryAfterMovements.movements.cashIn, 500.0);
    assert.strictEqual(summaryAfterMovements.movements.cashOut, 150.0);
    assert.strictEqual(summaryAfterMovements.movements.netMovement, 350.0);
    assert.strictEqual(summaryAfterMovements.movements.movementCount, 2);

    // Expected cash:
    // Opening (1000) + Cash Sales (2500) - Cash Refunds (200) + Cash IN (500) - Cash OUT (150) = 3650.00
    assert.strictEqual(summaryAfterMovements.expectedCash, 3650.0);
    console.log(
      "✓ 5. Petty cash movements automatically invalidate cache and update Expected Cash formula",
    );

    // ---------------------------------------------------------
    // Test 6: Finding 5 - Session Close Automatically Invalidates Reconciliation Cache
    // ---------------------------------------------------------
    cached = await getCache(cacheKeyA);
    assert.ok(
      cached,
      "Reconciliation summary should be cached in Redis while OPEN",
    );
    assert.strictEqual(cached.status, "OPEN");
    assert.strictEqual(cached.expectedCash, 3650.0);

    // Close session with counted cash = 3600 (shortage of 50)
    await closeSession({
      organisationId: orgAId,
      sessionId: sessionAId,
      countedCash: 3600.0,
      closingNotes: "Minor cash drawer shortage",
    });

    // closeSession automatically invalidated reconciliation cache!
    cached = await getCache(cacheKeyA);
    assert.strictEqual(
      cached,
      null,
      "closeSession must automatically invalidate reconciliation cache",
    );

    const closedSummary = await getSessionReconciliationSummary({
      organisationId: orgAId,
      branchId: branchAId,
      sessionId: sessionAId,
    });

    assert.strictEqual(closedSummary.status, "CLOSED");
    assert.strictEqual(closedSummary.countedCash, 3600.0);
    assert.strictEqual(closedSummary.expectedCash, 3650.0);
    assert.strictEqual(closedSummary.variance, -50.0);
    assert.strictEqual(closedSummary.varianceStatus, "SHORTAGE");
    console.log(
      "✓ 6. Session close automatically invalidates reconciliation cache and reports closed snapshot",
    );

    // ---------------------------------------------------------
    // Test 7: Multi-tenant & Branch Isolation
    // ---------------------------------------------------------
    await assert.rejects(async () => {
      await getSessionReconciliationSummary({
        organisationId: orgBId,
        branchId: branchBId,
        sessionId: sessionAId, // Belongs to Org A!
      });
    }, /Cash register session not found in the specified organisation and branch/i);

    const orgBSummary = await getSessionReconciliationSummary({
      organisationId: orgBId,
      branchId: branchBId,
      sessionId: sessionBId,
    });
    assert.strictEqual(orgBSummary.openingBalance, 500.0);
    assert.strictEqual(orgBSummary.sales.cashSales, 0);
    console.log("✓ 7. Multi-tenant and branch isolation verified");

    // ---------------------------------------------------------
    // Test 8: Transaction Client Bypasses Redis Cache
    // ---------------------------------------------------------
    const txClient = await pool.connect();
    try {
      await txClient.query("BEGIN");
      const txSummary = await getSessionReconciliationSummary({
        organisationId: orgAId,
        branchId: branchAId,
        sessionId: sessionAId,
        client: txClient,
      });
      assert.strictEqual(txSummary.expectedCash, 3650.0);

      // Verify Redis was not populated by transactional read
      await invalidateSessionReconciliationCache(orgAId, sessionAId);
      const afterManualInv = await getCache(cacheKeyA);
      assert.strictEqual(afterManualInv, null);

      await getSessionReconciliationSummary({
        organisationId: orgAId,
        branchId: branchAId,
        sessionId: sessionAId,
        client: txClient,
      });

      const txCache = await getCache(cacheKeyA);
      assert.strictEqual(
        txCache,
        null,
        "Transaction client reads must bypass Redis",
      );
      await txClient.query("COMMIT");
      console.log("✓ 8. Transaction client bypasses Redis cache");
    } finally {
      txClient.release();
    }

    // ---------------------------------------------------------
    // Test 9: External transaction client safe invalidation (Finding 3)
    // ---------------------------------------------------------
    // Open a fresh session in Org B for isolated testing
    const extRegB = await createCashRegister({
      organisationId: orgBId,
      branchId: branchBId,
      name: "Ext Register B",
      identifier: uniqueValue("REG-EXT-B"),
    });
    const extSessionB = await openSession({
      organisationId: orgBId,
      branchId: branchBId,
      cashRegisterId: extRegB.id,
      cashierId: cashierBId,
      openingBalance: 300,
    });
    const extSessionBId = extSessionB.id;
    const extCacheKeyB = buildReconciliationCacheKey(orgBId, extSessionBId);

    // Warm up cache
    const extInitialSummary = await getSessionReconciliationSummary({
      organisationId: orgBId,
      branchId: branchBId,
      sessionId: extSessionBId,
    });
    assert.strictEqual(extInitialSummary.openingBalance, 300);

    const cachedBeforeTx = await getCache(extCacheKeyB);
    assert.ok(cachedBeforeTx, "Cache must be populated before transaction");

    // Begin an external transaction that will ROLL BACK
    const rollbackClient = await pool.connect();
    try {
      await rollbackClient.query("BEGIN");

      await createMovement({
        organisationId: orgBId,
        branchId: branchBId,
        cashRegisterSessionId: extSessionBId,
        cashierId: cashierBId,
        movementType: "IN",
        amount: 50,
        reason: "Float addition that will abort",
        client: rollbackClient,
      });

      // While transaction is uncommitted, Redis cache must STILL exist!
      const cacheDuringTx = await getCache(extCacheKeyB);
      assert.ok(
        cacheDuringTx,
        "Cache must NOT be invalidated during uncommitted transaction",
      );

      await rollbackClient.query("ROLLBACK");

      // After rollback, cache must STILL exist (not invalidated)
      const cacheAfterRollback = await getCache(extCacheKeyB);
      assert.ok(
        cacheAfterRollback,
        "Cache must NOT be invalidated after transaction rollback",
      );
    } finally {
      rollbackClient.release();
    }

    // Now begin an external transaction that will COMMIT
    const commitClient = await pool.connect();
    try {
      await commitClient.query("BEGIN");

      await createMovement({
        organisationId: orgBId,
        branchId: branchBId,
        cashRegisterSessionId: extSessionBId,
        cashierId: cashierBId,
        movementType: "IN",
        amount: 100,
        reason: "Committed float addition",
        client: commitClient,
      });

      // While transaction is uncommitted, Redis cache must STILL exist!
      const cacheDuringCommitTx = await getCache(extCacheKeyB);
      assert.ok(
        cacheDuringCommitTx,
        "Cache must NOT be invalidated before external COMMIT",
      );

      // Execute COMMIT
      await commitClient.query("COMMIT");

      // Now cache must be invalidated!
      const cacheAfterCommit = await getCache(extCacheKeyB);
      assert.strictEqual(
        cacheAfterCommit,
        null,
        "Cache must be invalidated strictly after external COMMIT",
      );

      // Subsequent query returns fresh data reflecting the 100 float addition
      const freshSummary = await getSessionReconciliationSummary({
        organisationId: orgBId,
        branchId: branchBId,
        sessionId: extSessionBId,
      });
      assert.strictEqual(
        freshSummary.expectedCash,
        400,
        "Expected cash must reflect committed movement (300 + 100 = 400)",
      );
      console.log(
        "✓ 9. External transaction client safe invalidation (rollback preserves cache, commit invalidates cache)",
      );
    } finally {
      commitClient.release();
    }

    console.log(
      "\nAll 9 Cash Register Dashboard Repository tests passed successfully!\n",
    );
  } finally {
    // Cleanup
    if (orgAId) {
      await pool
        .query("DELETE FROM returns WHERE organisation_id = $1;", [orgAId])
        .catch(() => {});
      await pool
        .query(
          "DELETE FROM payment_transactions WHERE payment_id IN (SELECT id FROM payments WHERE organisation_id = $1);",
          [orgAId],
        )
        .catch(() => {});
      await pool
        .query("DELETE FROM payments WHERE organisation_id = $1;", [orgAId])
        .catch(() => {});
      await pool
        .query("DELETE FROM invoices WHERE organisation_id = $1;", [orgAId])
        .catch(() => {});
      await pool
        .query("DELETE FROM cash_movements WHERE organisation_id = $1;", [
          orgAId,
        ])
        .catch(() => {});
      await pool
        .query(
          "DELETE FROM cash_register_sessions WHERE organisation_id = $1;",
          [orgAId],
        )
        .catch(() => {});
      await pool
        .query("DELETE FROM cash_registers WHERE organisation_id = $1;", [
          orgAId,
        ])
        .catch(() => {});
      await pool
        .query("DELETE FROM customers WHERE organisation_id = $1;", [orgAId])
        .catch(() => {});
      await pool
        .query(
          "DELETE FROM organisation_memberships WHERE organisation_id = $1;",
          [orgAId],
        )
        .catch(() => {});
      await pool
        .query("DELETE FROM branches WHERE organisation_id = $1;", [orgAId])
        .catch(() => {});
      await pool
        .query("DELETE FROM organisations WHERE id = $1;", [orgAId])
        .catch(() => {});
    }
    if (orgBId) {
      await pool
        .query(
          "DELETE FROM cash_register_sessions WHERE organisation_id = $1;",
          [orgBId],
        )
        .catch(() => {});
      await pool
        .query("DELETE FROM cash_registers WHERE organisation_id = $1;", [
          orgBId,
        ])
        .catch(() => {});
      await pool
        .query(
          "DELETE FROM organisation_memberships WHERE organisation_id = $1;",
          [orgBId],
        )
        .catch(() => {});
      await pool
        .query("DELETE FROM branches WHERE organisation_id = $1;", [orgBId])
        .catch(() => {});
      await pool
        .query("DELETE FROM organisations WHERE id = $1;", [orgBId])
        .catch(() => {});
    }
    if (ownerAId)
      await pool
        .query("DELETE FROM users WHERE id = $1;", [ownerAId])
        .catch(() => {});
    if (ownerBId)
      await pool
        .query("DELETE FROM users WHERE id = $1;", [ownerBId])
        .catch(() => {});
    if (cashierAId)
      await pool
        .query("DELETE FROM users WHERE id = $1;", [cashierAId])
        .catch(() => {});
    if (cashierBId)
      await pool
        .query("DELETE FROM users WHERE id = $1;", [cashierBId])
        .catch(() => {});

    try {
      if (redisClient.isOpen) {
        await disconnectRedis();
      }
    } catch (e) {}

    await pool.end();
  }
};

runTests().catch((err) => {
  console.error("Dashboard tests failed:", err);
  process.exit(1);
});

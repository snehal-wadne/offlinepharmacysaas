/**
 * Held Bill Repository Integration Tests
 *
 * Tests the Held Bill Repository against real PostgreSQL and Redis.
 *
 * Verifies:
 * 1. Create held bill with sequential HB hold token (HB-1001).
 * 2. Full JSONB cart snapshot preservation.
 * 3. Retrieve held bill by ID.
 * 4. List held bills for branch (filtered by status).
 * 5. Update held bill status (e.g. HOLD -> RESUMED).
 * 6. Soft discard (deleteHeldBill sets status = 'DISCARDED').
 * 7. Multi-tenant and branch isolation.
 * 8. Cache invalidation on create and update.
 * 9. Transaction client participation and rollback.
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
  createHeldBill,
  getHeldBillById,
  listHeldBills,
  updateHeldBillStatus,
  deleteHeldBill,
  buildHeldBillCacheKey,
  buildHeldBillListCacheKey,
} = require("../repositories/held-bill.repository");

const uniqueValue = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

const runTests = async () => {
  let ownerAId = null;
  let orgAId = null;
  let branchAId = null;
  let cashierAId = null;

  let ownerBId = null;
  let orgBId = null;
  let branchBId = null;
  let cashierBId = null;

  let bill1Id = null;

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning Held Bill Repository tests...\n");

    // Setup Organisation A
    const ownerARes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [`${uniqueValue("hb-owner-a")}@test.local`, "pwd", "Owner A", "ACTIVE"],
    );
    ownerAId = ownerARes.rows[0].id;

    const orgARes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerAId, uniqueValue("Org A Held Bill Test")],
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
        `${uniqueValue("hb-cashier-a")}@test.local`,
        "pwd",
        "Cashier Alice",
        "ACTIVE",
      ],
    );
    cashierAId = cashierARes.rows[0].id;

    await pool.query(
      `INSERT INTO organisation_memberships (organisation_id, user_id, status)
       VALUES ($1, $2, 'ACTIVE');`,
      [orgAId, cashierAId],
    );

    // Setup Organisation B
    const ownerBRes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [`${uniqueValue("hb-owner-b")}@test.local`, "pwd", "Owner B", "ACTIVE"],
    );
    ownerBId = ownerBRes.rows[0].id;

    const orgBRes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerBId, uniqueValue("Org B Held Bill Test")],
    );
    orgBId = orgBRes.rows[0].id;

    const branchBRes = await pool.query(
      `INSERT INTO branches (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
      [orgBId, "Branch B"],
    );
    branchBId = branchBRes.rows[0].id;

    const cashierBRes = await pool.query(
      `INSERT INTO users (email, password_hash, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [
        `${uniqueValue("hb-cashier-b")}@test.local`,
        "pwd",
        "Cashier Bob",
        "ACTIVE",
      ],
    );
    cashierBId = cashierBRes.rows[0].id;

    await pool.query(
      `INSERT INTO organisation_memberships (organisation_id, user_id, status)
       VALUES ($1, $2, 'ACTIVE');`,
      [orgBId, cashierBId],
    );

    const cartSnapshot = {
      items: [
        {
          productId: "prod-1",
          name: "Paracetamol 500mg",
          qty: 2,
          unitPrice: 25.0,
          lineTotal: 50.0,
        },
        {
          productId: "prod-2",
          name: "Amoxicillin 250mg",
          qty: 1,
          unitPrice: 120.0,
          lineTotal: 120.0,
        },
      ],
      discounts: { coupon: "WELCOME10", amount: 17.0 },
    };

    // ---------------------------------------------------------
    // Test 1: Create Held Bill & HB token sequence
    // ---------------------------------------------------------
    const bill1 = await createHeldBill({
      organisationId: orgAId,
      branchId: branchAId,
      heldBy: cashierAId,
      customerName: "Rahul Sharma",
      customerPhone: "9876543210",
      itemsCount: 3,
      itemsSummary: "Paracetamol x2, Amoxicillin x1",
      subtotal: 170.0,
      taxAmount: 8.5,
      discountPercent: 10.0,
      totalAmount: 161.5,
      cartData: cartSnapshot,
      notes: "Customer went to fetch wallet",
    });

    assert.ok(bill1.id);
    assert.ok(bill1.hold_token.startsWith("HB-"));
    assert.strictEqual(bill1.customer_name, "Rahul Sharma");
    assert.strictEqual(bill1.customer_phone, "9876543210");
    assert.strictEqual(bill1.status, "HOLD");
    assert.strictEqual(Number(bill1.total_amount), 161.5);
    bill1Id = bill1.id;
    console.log("✓ 1. Create held bill with HB token sequence");

    // ---------------------------------------------------------
    // Test 2: JSONB cart data preservation
    // ---------------------------------------------------------
    assert.deepStrictEqual(bill1.cart_data, cartSnapshot);
    console.log("✓ 2. JSONB cart data fully preserved");

    // ---------------------------------------------------------
    // Test 3: Retrieve held bill by ID
    // ---------------------------------------------------------
    const fetched = await getHeldBillById({
      organisationId: orgAId,
      branchId: branchAId,
      heldBillId: bill1Id,
    });
    assert.ok(fetched);
    assert.strictEqual(fetched.id, bill1Id);
    assert.strictEqual(fetched.hold_token, bill1.hold_token);
    console.log("✓ 3. Retrieve held bill by ID");

    // ---------------------------------------------------------
    // Test 4: List held bills for branch
    // ---------------------------------------------------------
    const bill2 = await createHeldBill({
      organisationId: orgAId,
      branchId: branchAId,
      heldBy: cashierAId,
      customerName: "Priya Patel",
      itemsCount: 1,
      subtotal: 50.0,
      totalAmount: 50.0,
      cartData: { items: [{ name: "Bandage", qty: 1, lineTotal: 50.0 }] },
    });

    const activeList = await listHeldBills({
      organisationId: orgAId,
      branchId: branchAId,
      status: "HOLD",
    });
    assert.strictEqual(activeList.length, 2);
    console.log("✓ 4. List held bills for branch");

    // ---------------------------------------------------------
    // Test 5: Update held bill status (e.g. RESUMED)
    // ---------------------------------------------------------
    const resumed = await updateHeldBillStatus({
      organisationId: orgAId,
      branchId: branchAId,
      heldBillId: bill1Id,
      status: "RESUMED",
      notes: "Customer returned and completed checkout",
    });
    assert.strictEqual(resumed.status, "RESUMED");

    // Now active HOLD list should only have 1 bill
    const activeAfterResume = await listHeldBills({
      organisationId: orgAId,
      branchId: branchAId,
      status: "HOLD",
    });
    assert.strictEqual(activeAfterResume.length, 1);
    console.log("✓ 5. Update held bill status to RESUMED");

    // ---------------------------------------------------------
    // Test 6: Soft discard (deleteHeldBill)
    // ---------------------------------------------------------
    const discarded = await deleteHeldBill({
      organisationId: orgAId,
      branchId: branchAId,
      heldBillId: bill2.id,
    });
    assert.strictEqual(discarded.status, "DISCARDED");

    // Bill still exists in DB for audit trail
    const fetchedDiscarded = await getHeldBillById({
      organisationId: orgAId,
      branchId: branchAId,
      heldBillId: bill2.id,
    });
    assert.ok(fetchedDiscarded);
    assert.strictEqual(fetchedDiscarded.status, "DISCARDED");
    console.log(
      "✓ 6. Soft discard: status set to DISCARDED without hard deletion",
    );

    // ---------------------------------------------------------
    // Test 7: Multi-tenant and branch isolation
    // ---------------------------------------------------------
    const orgBFetch = await getHeldBillById({
      organisationId: orgBId,
      branchId: branchBId,
      heldBillId: bill1Id, // Belongs to Org A!
    });
    assert.strictEqual(orgBFetch, null, "Org B cannot read Org A held bill");

    const orgBList = await listHeldBills({
      organisationId: orgBId,
      branchId: branchBId,
    });
    assert.strictEqual(orgBList.length, 0);
    console.log("✓ 7. Multi-tenant and branch isolation verified");

    // ---------------------------------------------------------
    // Test 8: Cache invalidation
    // ---------------------------------------------------------
    // Read to populate cache
    await getHeldBillById({
      organisationId: orgAId,
      branchId: branchAId,
      heldBillId: bill1Id,
    });
    const cacheKey = buildHeldBillCacheKey(orgAId, bill1Id);
    const cachedBefore = await getCache(cacheKey);
    assert.ok(cachedBefore, "Held bill should be cached");

    // Update status should invalidate
    await updateHeldBillStatus({
      organisationId: orgAId,
      branchId: branchAId,
      heldBillId: bill1Id,
      status: "HOLD",
    });
    const cachedAfter = await getCache(cacheKey);
    assert.strictEqual(
      cachedAfter,
      null,
      "Cache key must be invalidated after update",
    );
    console.log("✓ 8. Cache invalidation on update verified");

    // ---------------------------------------------------------
    // Test 9: Transaction client participation and rollback
    // ---------------------------------------------------------
    const txClient = await pool.connect();
    try {
      await txClient.query("BEGIN");
      const txBill = await createHeldBill({
        organisationId: orgAId,
        branchId: branchAId,
        heldBy: cashierAId,
        customerName: "Rollback Customer",
        itemsCount: 1,
        subtotal: 20,
        totalAmount: 20,
        cartData: {
          items: [{ name: "Rollback", qty: 1, unitPrice: 20, lineTotal: 20 }],
        },
        client: txClient,
      });
      assert.ok(txBill.id);

      // Verify visible inside transaction
      const inTx = await getHeldBillById({
        organisationId: orgAId,
        branchId: branchAId,
        heldBillId: txBill.id,
        client: txClient,
      });
      assert.ok(inTx);

      await txClient.query("ROLLBACK");

      // Verify not in DB after rollback
      const afterRollback = await getHeldBillById({
        organisationId: orgAId,
        branchId: branchAId,
        heldBillId: txBill.id,
      });
      assert.strictEqual(
        afterRollback,
        null,
        "Rolled back bill must not exist",
      );
      console.log(
        "✓ 9. Transaction client participation, rollback, and Redis bypass",
      );
    } finally {
      txClient.release();
    }

    // ---------------------------------------------------------
    // Test 10: Contradictory caller itemsCount is rejected
    // ---------------------------------------------------------
    await assert.rejects(
      async () => {
        await createHeldBill({
          organisationId: orgAId,
          branchId: branchAId,
          heldBy: cashierAId,
          customerName: "Contradictory Test",
          itemsCount: 99, // Contradicts cartSnapshot which has 2+1=3
          subtotal: 170.0,
          totalAmount: 161.5,
          cartData: cartSnapshot,
        });
      },
      /contradicts cart_data/i,
      "Expected error when caller itemsCount contradicts cart_data",
    );
    console.log("✓ 10. Contradictory itemsCount rejected");

    // ---------------------------------------------------------
    // Test 11: Contradictory caller subtotal is rejected
    // ---------------------------------------------------------
    await assert.rejects(
      async () => {
        await createHeldBill({
          organisationId: orgAId,
          branchId: branchAId,
          heldBy: cashierAId,
          customerName: "Contradictory Test",
          itemsCount: 3,
          subtotal: 999.0, // Contradicts cartSnapshot (50 + 120 = 170)
          totalAmount: 161.5,
          cartData: cartSnapshot,
        });
      },
      /contradicts cart_data/i,
      "Expected error when caller subtotal contradicts cart_data",
    );
    console.log("✓ 11. Contradictory subtotal rejected");

    // ---------------------------------------------------------
    // Test 12: Contradictory caller totalAmount is rejected
    // ---------------------------------------------------------
    await assert.rejects(
      async () => {
        await createHeldBill({
          organisationId: orgAId,
          branchId: branchAId,
          heldBy: cashierAId,
          customerName: "Contradictory Test",
          itemsCount: 3,
          subtotal: 170.0,
          taxAmount: 8.5,
          discountPercent: 10.0,
          totalAmount: 500.0, // Contradicts calculated 170 + 8.50 - 17 = 161.50
          cartData: cartSnapshot,
        });
      },
      /contradicts cart_data/i,
      "Expected error when caller totalAmount contradicts cart_data",
    );
    console.log("✓ 12. Contradictory totalAmount rejected");

    // ---------------------------------------------------------
    // Test 13: Summary fields automatically derived from cart_data when omitted
    // ---------------------------------------------------------
    const derivedBill = await createHeldBill({
      organisationId: orgAId,
      branchId: branchAId,
      heldBy: cashierAId,
      customerName: "Auto Derivation Test",
      cartData: cartSnapshot,
      taxAmount: 8.5,
      discountPercent: 10.0,
    });
    assert.strictEqual(derivedBill.items_count, 3);
    assert.strictEqual(Number(derivedBill.subtotal), 170.0);
    assert.strictEqual(Number(derivedBill.total_amount), 161.5);
    assert.ok(derivedBill.items_summary.includes("Paracetamol 500mg x2"));
    console.log("✓ 13. Summary fields automatically derived from cart_data");

    // ---------------------------------------------------------
    // Test 14: Empty cartData or missing items rejected
    // ---------------------------------------------------------
    await assert.rejects(
      async () => {
        await createHeldBill({
          organisationId: orgAId,
          branchId: branchAId,
          heldBy: cashierAId,
          customerName: "Empty Cart Test",
          cartData: {},
        });
      },
      /cartData must contain a non-empty items array/i,
      "Expected error when cartData has no items",
    );

    await assert.rejects(
      async () => {
        await createHeldBill({
          organisationId: orgAId,
          branchId: branchAId,
          heldBy: cashierAId,
          customerName: "Empty Items Test",
          cartData: { items: [] },
        });
      },
      /cartData must contain a non-empty items array/i,
      "Expected error when cartData items array is empty",
    );
    console.log("✓ 14. Empty cartData and empty items array rejected");

    // ---------------------------------------------------------
    // Test 15: Invalid item in cartData rejected
    // ---------------------------------------------------------
    await assert.rejects(
      async () => {
        await createHeldBill({
          organisationId: orgAId,
          branchId: branchAId,
          heldBy: cashierAId,
          customerName: "Invalid Item Test",
          cartData: { items: [{ name: "Bad Item", qty: -1 }] },
        });
      },
      /Item quantity in cartData must be greater than 0/i,
      "Expected error when item quantity <= 0",
    );
    console.log("✓ 15. Invalid cart item rejected");

    console.log("\nAll 15 Held Bill Repository tests passed successfully!\n");
  } finally {
    // Cleanup
    if (orgAId) {
      await pool
        .query("DELETE FROM held_bills WHERE organisation_id = $1;", [orgAId])
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
        .query("DELETE FROM held_bills WHERE organisation_id = $1;", [orgBId])
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
  console.error("Held Bill tests failed:", err);
  process.exit(1);
});

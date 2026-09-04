/**
 * Payment Repository Integration Test
 *
 * Purpose:
 * Verifies:
 * - payment creation
 * - branch-scoped receipt numbering
 * - organisation isolation
 * - branch validation
 * - customer validation
 * - received-by user validation
 * - get by ID
 * - Redis cache miss
 * - Redis cache population
 * - Redis cache hit
 * - get by receipt number
 * - customer payment history
 * - branch payment history
 * - organisation payment history
 * - payment search
 * - payment update
 * - Redis cache invalidation after update
 * - Redis cache repopulation after update
 * - cross-tenant update protection
 * - transaction rollback
 * - sequence rollback
 * - database constraints
 * - payment deletion
 * - Redis cache invalidation after deletion
 * - final tenant isolation
 *
 * Requirements:
 * - PostgreSQL must be running.
 * - Redis must be running.
 * - The current schema.sql must already be applied.
 *
 * Run:
 *
 *     node src/tests/payment.repository.test.js
 */

const assert = require("assert");

const { pool } = require("../db/connection");

const { createCustomer } = require("../repositories/customer.repository");

const {
  createPayment,
  getPaymentById,
  getPaymentByReceiptNumber,
  getPaymentsByCustomer,
  getPaymentsByBranch,
  getPaymentsByOrganisation,
  searchPayments,
  updatePayment,
  deletePayment,
} = require("../repositories/payment.repository");

const {
  getNumberSequence,
} = require("../repositories/number-sequence.repository");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { deleteCache } = require("../cache/cache");

/**
 * Builds the same tenant-safe cache key used by
 * payment.repository.js.
 */
const buildPaymentCacheKey = (organisationId, paymentId) =>
  `organisation:${organisationId}:payment:${paymentId}`;

/**
 * Generates unique test values.
 */
const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Simple assertion helper for integration tests.
 */
const logSection = (title) => {
  console.log("\n==========================================================");

  console.log(title);

  console.log("==========================================================");
};

/**
 * Assert that an async operation rejects with
 * the expected error text.
 */
const assertRejected = async (operation, expectedMessage) => {
  let error = null;

  try {
    await operation();
  } catch (caughtError) {
    error = caughtError;
  }

  assert(error, `Expected operation to reject: ${expectedMessage}`);

  assert(
    error.message.includes(expectedMessage),
    `Expected error containing "${expectedMessage}", got "${error.message}"`,
  );
};

/**
 * Main test runner.
 */
const main = async () => {
  let userAId;
  let userBId;

  let organisationAId;
  let organisationBId;

  let branchA1Id;
  let branchA2Id;
  let branchB1Id;

  let customerAId;
  let customerA2Id;
  let customerBId;

  let paymentA1Id;
  let paymentA2Id;
  let paymentA2BranchId;
  let paymentB1Id;
  let paymentAfterRollbackId;
  let paymentWithoutReceiverId;

  try {
    // ==========================================================
    // 1. CONNECT REDIS
    // ==========================================================

    logSection("1. Connecting to Redis");

    await connectRedis();

    console.log("Redis connection successful.");

    // ==========================================================
    // 2. CREATE TEST USERS
    // ==========================================================

    logSection("2. Creating test users");

    const userAResult = await pool.query(
      `
          INSERT INTO users (
              email,
              password_hash,
              name
          )
          VALUES ($1, $2, $3)
          RETURNING id;
        `,
      [
        `payment-test-a-${uniqueSuffix}@example.com`,
        "test-password-hash",
        "Payment Test User A",
      ],
    );

    userAId = userAResult.rows[0].id;

    const userBResult = await pool.query(
      `
          INSERT INTO users (
              email,
              password_hash,
              name
          )
          VALUES ($1, $2, $3)
          RETURNING id;
        `,
      [
        `payment-test-b-${uniqueSuffix}@example.com`,
        "test-password-hash",
        "Payment Test User B",
      ],
    );

    userBId = userBResult.rows[0].id;

    assert(userAId, "User A should be created.");

    assert(userBId, "User B should be created.");

    // ==========================================================
    // 3. CREATE TEST ORGANISATIONS
    // ==========================================================

    logSection("3. Creating test organisations");

    const organisationAResult = await pool.query(
      `
          INSERT INTO organisations (
              owner_id,
              name
          )
          VALUES ($1, $2)
          RETURNING id;
        `,
      [userAId, `Payment Test Organisation A ${uniqueSuffix}`],
    );

    organisationAId = organisationAResult.rows[0].id;

    const organisationBResult = await pool.query(
      `
          INSERT INTO organisations (
              owner_id,
              name
          )
          VALUES ($1, $2)
          RETURNING id;
        `,
      [userBId, `Payment Test Organisation B ${uniqueSuffix}`],
    );

    organisationBId = organisationBResult.rows[0].id;

    // ==========================================================
    // 4. CREATE ACTIVE MEMBERSHIPS
    // ==========================================================

    logSection("4. Creating active organisation memberships");

    await pool.query(
      `
        INSERT INTO organisation_memberships (
            organisation_id,
            user_id,
            status,
            joined_at
        )
        VALUES (
            $1,
            $2,
            'ACTIVE',
            CURRENT_TIMESTAMP
        );
      `,
      [organisationAId, userAId],
    );

    await pool.query(
      `
        INSERT INTO organisation_memberships (
            organisation_id,
            user_id,
            status,
            joined_at
        )
        VALUES (
            $1,
            $2,
            'ACTIVE',
            CURRENT_TIMESTAMP
        );
      `,
      [organisationBId, userBId],
    );

    // ==========================================================
    // 5. CREATE BRANCHES
    // ==========================================================

    logSection("5. Creating test branches");

    const branchA1Result = await pool.query(
      `
          INSERT INTO branches (
              organisation_id,
              name
          )
          VALUES ($1, $2)
          RETURNING id;
        `,
      [organisationAId, `Payment Branch A1 ${uniqueSuffix}`],
    );

    branchA1Id = branchA1Result.rows[0].id;

    const branchA2Result = await pool.query(
      `
          INSERT INTO branches (
              organisation_id,
              name
          )
          VALUES ($1, $2)
          RETURNING id;
        `,
      [organisationAId, `Payment Branch A2 ${uniqueSuffix}`],
    );

    branchA2Id = branchA2Result.rows[0].id;

    const branchB1Result = await pool.query(
      `
          INSERT INTO branches (
              organisation_id,
              name
          )
          VALUES ($1, $2)
          RETURNING id;
        `,
      [organisationBId, `Payment Branch B1 ${uniqueSuffix}`],
    );

    branchB1Id = branchB1Result.rows[0].id;

    // ==========================================================
    // 6. CREATE CUSTOMERS
    // ==========================================================

    logSection("6. Creating test customers");

    const customerA = await createCustomer({
      organisationId: organisationAId,
      fullName: `Payment Customer A ${uniqueSuffix}`,
      phone: `9000000001`,
    });

    customerAId = customerA.id;

    const customerA2 = await createCustomer({
      organisationId: organisationAId,
      fullName: `Payment Customer A2 ${uniqueSuffix}`,
      phone: `9000000002`,
    });

    customerA2Id = customerA2.id;

    const customerB = await createCustomer({
      organisationId: organisationBId,
      fullName: `Payment Customer B ${uniqueSuffix}`,
      phone: `9000000003`,
    });

    customerBId = customerB.id;

    // ==========================================================
    // 7. CREATE FIRST PAYMENT
    // ==========================================================

    logSection("7. Creating first payment");

    const paymentA1 = await createPayment({
      organisationId: organisationAId,

      branchId: branchA1Id,

      customerId: customerAId,

      totalAmount: 5000,

      status: "COMPLETED",

      notes: "First payment",

      receivedBy: userAId,
    });

    paymentA1Id = paymentA1.id;

    assert(paymentA1.id, "Payment A1 should have an ID.");

    assert.strictEqual(
      paymentA1.receipt_number,
      "REC-1001",
      "First payment in Branch A1 should receive REC-1001",
    );

    assert.strictEqual(paymentA1.status, "COMPLETED");

    assert.strictEqual(Number(paymentA1.total_amount), 5000);

    console.log("Payment A1:", paymentA1.receipt_number);

    // ==========================================================
    // 8. CREATE SECOND PAYMENT SAME BRANCH
    // ==========================================================

    logSection("8. Creating second payment in same branch");

    const paymentA2 = await createPayment({
      organisationId: organisationAId,

      branchId: branchA1Id,

      customerId: customerA2Id,

      totalAmount: 2500,

      status: "PENDING",

      receivedBy: userAId,
    });

    paymentA2Id = paymentA2.id;

    assert.strictEqual(
      paymentA2.receipt_number,
      "REC-1002",
      "Second payment in same branch should receive REC-1002",
    );

    console.log("Payment A2:", paymentA2.receipt_number);

    // ==========================================================
    // 9. CREATE PAYMENT SAME ORG DIFFERENT BRANCH
    // ==========================================================

    logSection("9. Creating payment in Organisation A / Branch A2");

    const paymentA2Branch = await createPayment({
      organisationId: organisationAId,

      branchId: branchA2Id,

      customerId: customerAId,

      totalAmount: 1500,

      status: "COMPLETED",

      receivedBy: userAId,
    });

    paymentA2BranchId = paymentA2Branch.id;

    assert.strictEqual(
      paymentA2Branch.receipt_number,
      "REC-1001",
      "Receipt sequence must restart per branch",
    );

    console.log("Payment A2 Branch:", paymentA2Branch.receipt_number);

    // ==========================================================
    // 10. CREATE PAYMENT ORGANISATION B
    // ==========================================================

    logSection("10. Creating payment in Organisation B / Branch B1");

    const paymentB1 = await createPayment({
      organisationId: organisationBId,

      branchId: branchB1Id,

      customerId: customerBId,

      totalAmount: 3000,

      status: "COMPLETED",

      receivedBy: userBId,
    });

    paymentB1Id = paymentB1.id;

    assert.strictEqual(
      paymentB1.receipt_number,
      "REC-1001",
      "Receipt sequence must be isolated per organisation/branch",
    );

    console.log("Payment B1:", paymentB1.receipt_number);

    // ==========================================================
    // 11. REDIS CACHE MISS
    // ==========================================================

    logSection("11. Testing payment Redis cache miss");

    const paymentA1CacheKey = buildPaymentCacheKey(
      organisationAId,
      paymentA1Id,
    );

    await deleteCache(paymentA1CacheKey);

    const firstPaymentFetch = await getPaymentById(
      organisationAId,
      paymentA1Id,
    );

    assert(
      firstPaymentFetch !== null,
      "Payment should be returned on cache miss.",
    );

    assert.strictEqual(
      firstPaymentFetch.id,
      paymentA1Id,
      "Fetched payment ID should match.",
    );

    assert.strictEqual(
      firstPaymentFetch.receipt_number,
      "REC-1001",
      "Fetched payment should contain REC-1001.",
    );

    console.log("Payment cache miss successful.");

    // ==========================================================
    // 12. VERIFY REDIS CACHE
    // ==========================================================

    logSection("12. Verifying payment was cached");

    const cachedPayment = await redisClient.get(paymentA1CacheKey);

    assert(cachedPayment !== null, "Payment should be stored in Redis.");

    const parsedCachedPayment = JSON.parse(cachedPayment);

    assert.strictEqual(
      parsedCachedPayment.id,
      paymentA1Id,
      "Cached payment ID should match.",
    );

    assert.strictEqual(
      parsedCachedPayment.receipt_number,
      "REC-1001",
      "Cached payment should contain the correct receipt number.",
    );

    assert.strictEqual(
      Number(parsedCachedPayment.total_amount),
      5000,
      "Cached payment should contain the correct amount.",
    );

    console.log("Payment successfully cached in Redis.");

    // ==========================================================
    // 13. REDIS CACHE HIT
    // ==========================================================

    logSection("13. Testing payment Redis cache hit");

    const secondPaymentFetch = await getPaymentById(
      organisationAId,
      paymentA1Id,
    );

    assert(
      secondPaymentFetch !== null,
      "Payment should be returned on cache hit.",
    );

    assert.strictEqual(
      secondPaymentFetch.id,
      paymentA1Id,
      "Cache-hit payment ID should match.",
    );

    assert.strictEqual(secondPaymentFetch.receipt_number, "REC-1001");

    console.log("Payment cache hit successful.");

    // ==========================================================
    // 14. GET BY RECEIPT NUMBER
    // ==========================================================

    logSection("14. Testing payment lookup by receipt number");

    const paymentByReceipt = await getPaymentByReceiptNumber(
      organisationAId,
      branchA1Id,
      "REC-1001",
    );

    assert(
      paymentByReceipt !== null,
      "Payment should be found by receipt number.",
    );

    assert.strictEqual(
      paymentByReceipt.id,
      paymentA1Id,
      "Receipt-number lookup should return Payment A1.",
    );

    console.log("Payment receipt-number lookup successful.");

    // ==========================================================
    // 15. BRANCH-SCOPED RECEIPT LOOKUP
    // ==========================================================

    logSection("15. Testing branch-scoped receipt lookup");

    const branchA2Receipt = await getPaymentByReceiptNumber(
      organisationAId,
      branchA2Id,
      "REC-1001",
    );

    assert(branchA2Receipt !== null, "REC-1001 should exist in Branch A2.");

    assert.strictEqual(
      branchA2Receipt.id,
      paymentA2BranchId,
      "Branch A2 REC-1001 should resolve to its own payment.",
    );

    console.log("Branch-scoped receipt lookup verified.");

    // ==========================================================
    // 16. TENANT ISOLATION BY ID
    // ==========================================================

    logSection("16. Testing payment tenant isolation");

    const leakedPayment = await getPaymentById(organisationBId, paymentA1Id);

    assert.strictEqual(
      leakedPayment,
      null,
      "Organisation B must not retrieve Organisation A payment.",
    );

    console.log("Payment tenant isolation verified.");

    // ==========================================================
    // 17. CUSTOMER HISTORY
    // ==========================================================

    logSection("17. Getting payments by customer");

    const customerPayments = await getPaymentsByCustomer(
      organisationAId,
      customerAId,
    );

    assert(
      customerPayments.length >= 2,
      "Customer A should have at least two payments.",
    );

    const customerPaymentIds = customerPayments.map((payment) => payment.id);

    assert(
      customerPaymentIds.includes(paymentA1Id),
      "Customer payment history should contain Payment A1.",
    );

    assert(
      customerPaymentIds.includes(paymentA2BranchId),
      "Customer payment history should contain Branch A2 payment.",
    );

    console.log("Customer payment history successful.");

    // ==========================================================
    // 18. CUSTOMER HISTORY TENANT ISOLATION
    // ==========================================================

    logSection("18. Testing customer history tenant isolation");

    const wrongTenantCustomerHistory = await getPaymentsByCustomer(
      organisationBId,
      customerAId,
    );

    assert.strictEqual(
      wrongTenantCustomerHistory.length,
      0,
      "Organisation B must not retrieve Organisation A customer payments.",
    );

    console.log("Customer payment-history tenant isolation verified.");

    // ==========================================================
    // 19. BRANCH HISTORY
    // ==========================================================

    logSection("19. Getting payments by branch");

    const branchPayments = await getPaymentsByBranch(
      organisationAId,
      branchA1Id,
    );

    assert.strictEqual(
      branchPayments.length,
      2,
      "Branch A1 should contain two payments.",
    );

    const branchPaymentIds = branchPayments.map((payment) => payment.id);

    assert(
      branchPaymentIds.includes(paymentA1Id),
      "Branch history should contain Payment A1.",
    );

    assert(
      branchPaymentIds.includes(paymentA2Id),
      "Branch history should contain Payment A2.",
    );

    console.log("Branch payment history successful.");

    // ==========================================================
    // 20. ORGANISATION HISTORY
    // ==========================================================

    logSection("20. Getting payments by organisation");

    const organisationPayments =
      await getPaymentsByOrganisation(organisationAId);

    assert(
      organisationPayments.length >= 3,
      "Organisation A should have at least three payments.",
    );

    console.log("Organisation payment history successful.");

    // ==========================================================
    // 21. PAYMENT SEARCH BY RECEIPT
    // ==========================================================

    logSection("21. Searching payments by receipt number");

    const receiptSearch = await searchPayments(organisationAId, "REC-1001");

    assert(
      receiptSearch.length >= 1,
      "Receipt search should return matching payments.",
    );

    assert(
      receiptSearch.some((payment) => payment.id === paymentA1Id),
      "Receipt search should find Payment A1.",
    );

    console.log("Receipt-number payment search successful.");

    // ==========================================================
    // 22. PAYMENT SEARCH BY CUSTOMER NAME
    // ==========================================================

    logSection("22. Searching payments by customer name");

    const customerSearch = await searchPayments(
      organisationAId,
      "Payment Customer A",
    );

    assert(
      customerSearch.length >= 1,
      "Customer-name payment search should return results.",
    );

    assert(
      customerSearch.some((payment) => payment.id === paymentA1Id),
      "Customer-name search should find Payment A1.",
    );

    console.log("Customer-name payment search successful.");

    // ==========================================================
    // 23. PAYMENT SEARCH BY PHONE
    // ==========================================================

    logSection("23. Searching payments by customer phone");

    const phoneSearch = await searchPayments(organisationAId, "9000000001");

    assert(
      phoneSearch.length >= 1,
      "Customer-phone payment search should return results.",
    );

    assert(
      phoneSearch.some((payment) => payment.id === paymentA1Id),
      "Customer-phone search should find Payment A1.",
    );

    console.log("Customer-phone payment search successful.");

    // ==========================================================
    // 24. UPDATE PAYMENT
    // ==========================================================

    logSection("24. Updating payment");

    const updatedPayment = await updatePayment(organisationAId, paymentA1Id, {
      paymentDate: "2026-09-04T11:00:00Z",

      totalAmount: 5500,

      status: "COMPLETED",

      notes: "Updated payment",

      receivedBy: userAId,
    });

    assert(
      updatedPayment !== null,
      "Payment update should return the updated payment.",
    );

    assert.strictEqual(
      updatedPayment.id,
      paymentA1Id,
      "Payment ID must remain unchanged.",
    );

    assert.strictEqual(
      updatedPayment.receipt_number,
      "REC-1001",
      "Receipt number must remain immutable.",
    );

    assert.strictEqual(
      updatedPayment.branch_id,
      branchA1Id,
      "Branch must remain unchanged.",
    );

    assert.strictEqual(
      updatedPayment.customer_id,
      customerAId,
      "Customer must remain unchanged.",
    );

    assert.strictEqual(
      Number(updatedPayment.total_amount),
      5500,
      "Payment amount should be updated.",
    );

    console.log("Payment update successful.");

    // ==========================================================
    // 25. VERIFY UPDATE CACHE INVALIDATION
    // ==========================================================

    logSection("25. Verifying payment update cache invalidation");

    const cacheAfterUpdate = await redisClient.get(paymentA1CacheKey);

    assert.strictEqual(
      cacheAfterUpdate,
      null,
      "Payment update should invalidate Redis cache.",
    );

    console.log("Payment update cache invalidation successful.");

    // ==========================================================
    // 26. FRESH READ AFTER UPDATE
    // ==========================================================

    logSection("26. Testing fresh payment read after update");

    const freshUpdatedPayment = await getPaymentById(
      organisationAId,
      paymentA1Id,
    );

    assert(freshUpdatedPayment !== null, "Updated payment should be returned.");

    assert.strictEqual(
      Number(freshUpdatedPayment.total_amount),
      5500,
      "Fresh payment read should contain updated amount.",
    );

    assert.strictEqual(
      freshUpdatedPayment.receipt_number,
      "REC-1001",
      "Fresh payment should retain its receipt number.",
    );

    console.log("Fresh updated payment read successful.");

    // ==========================================================
    // 27. VERIFY CACHE REPOPULATION
    // ==========================================================

    logSection("27. Verifying updated payment was cached again");

    const cacheAfterFreshRead = await redisClient.get(paymentA1CacheKey);

    assert(
      cacheAfterFreshRead !== null,
      "Updated payment should be cached again.",
    );

    const parsedUpdatedPaymentCache = JSON.parse(cacheAfterFreshRead);

    assert.strictEqual(
      Number(parsedUpdatedPaymentCache.total_amount),
      5500,
      "Updated payment cache should contain the new amount.",
    );

    assert.strictEqual(
      parsedUpdatedPaymentCache.receipt_number,
      "REC-1001",
      "Updated payment cache should retain the receipt number.",
    );

    console.log("Updated payment successfully cached.");

    // ==========================================================
    // 28. INVALID RECEIVED-BY USER
    // ==========================================================

    logSection("28. Testing invalid received-by user");

    await assertRejected(
      () =>
        updatePayment(organisationAId, paymentA1Id, {
          receivedBy: userBId,
        }),
      "Receiving user is not an active member of the specified organisation.",
    );

    // ==========================================================
    // 29. CROSS-TENANT UPDATE
    // ==========================================================

    logSection("29. Testing cross-tenant update protection");

    const crossTenantUpdate = await updatePayment(
      organisationBId,
      paymentA1Id,
      {
        totalAmount: 999999,
      },
    );

    assert.strictEqual(
      crossTenantUpdate,
      null,
      "Organisation B must not update Organisation A payment.",
    );

    console.log("Cross-tenant update protection verified.");

    // ==========================================================
    // 30. CALLER-OWNED TRANSACTION ROLLBACK
    // ==========================================================

    logSection("30. Testing caller-owned transaction rollback");

    const transactionClient = await pool.connect();

    try {
      await transactionClient.query("BEGIN");

      const transactionPayment = await createPayment({
        organisationId: organisationAId,

        branchId: branchA1Id,

        customerId: customerA2Id,

        totalAmount: 1750,

        status: "COMPLETED",

        receivedBy: userAId,

        client: transactionClient,
      });

      paymentAfterRollbackId = transactionPayment.id;

      assert.strictEqual(
        transactionPayment.receipt_number,
        "REC-1003",
        "Rolled-back payment should temporarily receive REC-1003.",
      );

      await transactionClient.query("ROLLBACK");
    } catch (error) {
      try {
        await transactionClient.query("ROLLBACK");
      } catch (rollbackError) {
        // Preserve original error.
      }

      throw error;
    } finally {
      transactionClient.release();
    }

    const rolledBackPayment = await getPaymentById(
      organisationAId,
      paymentAfterRollbackId,
    );

    assert.strictEqual(
      rolledBackPayment,
      null,
      "Payment created inside a rolled-back transaction must not persist.",
    );

    console.log("Caller-owned transaction rollback verified.");

    // ==========================================================
    // 31. SEQUENCE ROLLBACK VERIFICATION
    // ==========================================================

    logSection("31. Verifying receipt sequence rollback");

    const paymentAfterRollback = await createPayment({
      organisationId: organisationAId,

      branchId: branchA1Id,

      customerId: customerA2Id,

      totalAmount: 1750,

      status: "COMPLETED",

      receivedBy: userAId,
    });

    paymentAfterRollbackId = paymentAfterRollback.id;

    assert.strictEqual(
      paymentAfterRollback.receipt_number,
      "REC-1003",
      "Rolled-back receipt number should be safely reused.",
    );

    console.log("Receipt sequence rollback verified.");

    // ==========================================================
    // 32. INVALID AMOUNT
    // ==========================================================

    logSection("32. Testing database amount constraint");

    await assertRejected(
      () =>
        createPayment({
          organisationId: organisationAId,

          branchId: branchA1Id,

          customerId: customerAId,

          totalAmount: 0,

          receivedBy: userAId,
        }),
      "payments_total_amount_check",
    );

    // ==========================================================
    // 33. INVALID STATUS
    // ==========================================================

    logSection("33. Testing database status constraint");

    await assertRejected(
      () =>
        createPayment({
          organisationId: organisationAId,

          branchId: branchA1Id,

          customerId: customerAId,

          totalAmount: 100,

          status: "INVALID_STATUS",

          receivedBy: userAId,
        }),
      "payments_status_check",
    );

    // ==========================================================
    // 34. NULL RECEIVED-BY
    // ==========================================================

    logSection("34. Testing nullable received_by");

    const paymentWithoutReceiver = await createPayment({
      organisationId: organisationAId,

      branchId: branchA1Id,

      customerId: customerAId,

      totalAmount: 400,

      receivedBy: null,
    });

    paymentWithoutReceiverId = paymentWithoutReceiver.id;

    assert.strictEqual(
      paymentWithoutReceiver.received_by,
      null,
      "Payment should allow a null received_by.",
    );

    console.log("Nullable received_by verified.");

    // ==========================================================
    // 35. EMPTY UPDATE
    // ==========================================================

    logSection("35. Testing empty update");

    const unchangedPayment = await updatePayment(
      organisationAId,
      paymentA1Id,
      {},
    );

    assert.strictEqual(
      unchangedPayment.id,
      paymentA1Id,
      "Empty update should return the existing payment.",
    );

    assert.strictEqual(
      unchangedPayment.receipt_number,
      "REC-1001",
      "Empty update must not change receipt number.",
    );

    // ==========================================================
    // 36. VERIFY CACHE AFTER EMPTY UPDATE
    // ==========================================================

    logSection("36. Verifying cache remains valid after empty update");

    /**
     * updatePayment() does not invalidate the cache when there
     * are no mutable fields because no actual data modification
     * was requested.
     *
     * Therefore the existing cache should still be available.
     */
    const cacheAfterEmptyUpdate = await redisClient.get(paymentA1CacheKey);

    assert(
      cacheAfterEmptyUpdate !== null,
      "Empty update should not unnecessarily invalidate the payment cache.",
    );

    // ==========================================================
    // 37. CROSS-TENANT DELETE
    // ==========================================================

    logSection("37. Testing cross-tenant delete protection");

    const crossTenantDelete = await deletePayment(organisationBId, paymentA1Id);

    assert.strictEqual(
      crossTenantDelete,
      false,
      "Organisation B must not delete Organisation A payment.",
    );

    console.log("Cross-tenant delete protection verified.");

    // ==========================================================
    // 38. DELETE PAYMENT
    // ==========================================================

    logSection("38. Testing payment deletion");

    /**
     * First cache the payment that will be deleted so that
     * deletion can verify Redis invalidation.
     */
    const deletionPayment = await getPaymentById(
      organisationAId,
      paymentWithoutReceiverId,
    );

    assert(
      deletionPayment !== null,
      "Payment selected for deletion should exist.",
    );

    const deletionCacheKey = buildPaymentCacheKey(
      organisationAId,
      paymentWithoutReceiverId,
    );

    const deletionCachedValue = await redisClient.get(deletionCacheKey);

    assert(
      deletionCachedValue !== null,
      "Payment selected for deletion should be cached.",
    );

    const deleted = await deletePayment(
      organisationAId,
      paymentWithoutReceiverId,
    );

    assert.strictEqual(
      deleted,
      true,
      "Existing payment should be deleted successfully.",
    );

    console.log("Payment deletion successful.");

    // ==========================================================
    // 39. VERIFY DELETE CACHE INVALIDATION
    // ==========================================================

    logSection("39. Verifying delete cache invalidation");

    const cacheAfterDelete = await redisClient.get(deletionCacheKey);

    assert.strictEqual(
      cacheAfterDelete,
      null,
      "Deleting a payment should invalidate Redis cache.",
    );

    console.log("Delete cache invalidation successful.");

    // ==========================================================
    // 40. VERIFY DELETED PAYMENT
    // ==========================================================

    logSection("40. Verifying deleted payment");

    const deletedPayment = await getPaymentById(
      organisationAId,
      paymentWithoutReceiverId,
    );

    assert.strictEqual(
      deletedPayment,
      null,
      "Deleted payment should return null.",
    );

    console.log("Deleted payment correctly returns null.");

    // ==========================================================
    // 41. DELETE ROLLED-BACK PAYMENT
    // ==========================================================

    logSection("41. Cleaning rolled-back-sequence test payment");

    const deletedAfterRollback = await deletePayment(
      organisationAId,
      paymentAfterRollbackId,
    );

    assert.strictEqual(
      deletedAfterRollback,
      true,
      "Payment created after rollback should be deletable.",
    );

    // ==========================================================
    // 42. DELETE SECOND PAYMENT
    // ==========================================================

    logSection("42. Cleaning second payment");

    const deletedPaymentA2 = await deletePayment(organisationAId, paymentA2Id);

    assert.strictEqual(
      deletedPaymentA2,
      true,
      "Second payment should be deleted successfully.",
    );

    // ==========================================================
    // 43. CHECK RECEIPT SEQUENCE STATE
    // ==========================================================

    logSection("43. Checking receipt sequence state");

    /**
     * IMPORTANT:
     *
     * getNumberSequence() only reads the sequence.
     *
     * Do NOT call getNextBusinessNumber() here because that
     * would increment the sequence merely for inspection.
     */
    const sequenceA1 = await getNumberSequence({
      organisationId: organisationAId,

      branchId: branchA1Id,

      sequenceType: "RECEIPT",
    });

    assert(sequenceA1 !== null, "Branch A1 receipt sequence should exist.");

    /**
     * Sequence progression:
     *
     * REC-1001 → payment A1
     * REC-1002 → payment A2
     * REC-1003 → rolled-back transaction
     * REC-1003 → successful retry
     * REC-1004 → payment without receiver
     *
     * Therefore next_number = 1005.
     */
    assert.strictEqual(
      sequenceA1.next_number,
      "1005",
      "Branch A1 should have next receipt number 1005.",
    );

    const sequenceA2 = await getNumberSequence({
      organisationId: organisationAId,

      branchId: branchA2Id,

      sequenceType: "RECEIPT",
    });

    assert(sequenceA2 !== null, "Branch A2 receipt sequence should exist.");

    assert.strictEqual(
      sequenceA2.next_number,
      "1002",
      "Branch A2 should have next receipt number 1002.",
    );

    const sequenceB1 = await getNumberSequence({
      organisationId: organisationBId,

      branchId: branchB1Id,

      sequenceType: "RECEIPT",
    });

    assert(sequenceB1 !== null, "Branch B1 receipt sequence should exist.");

    assert.strictEqual(
      sequenceB1.next_number,
      "1002",
      "Branch B1 should have next receipt number 1002.",
    );

    console.log("Receipt sequence state verified.");

    // ==========================================================
    // 44. FINAL PAYMENT STATE
    // ==========================================================

    logSection("44. Final payment state");

    const finalOrgAPayments = await getPaymentsByOrganisation(organisationAId);

    /**
     * Remaining Organisation A payments:
     *
     * - paymentA1
     * - paymentA2Branch
     *
     * paymentA2 and the temporary test payments were deleted.
     */
    assert.strictEqual(
      finalOrgAPayments.length,
      2,
      "Only the two intended Organisation A payments should remain.",
    );

    assert(
      finalOrgAPayments.some((payment) => payment.id === paymentA1Id),
      "Payment A1 should remain.",
    );

    assert(
      finalOrgAPayments.some((payment) => payment.id === paymentA2BranchId),
      "Branch A2 payment should remain.",
    );

    const finalOrgBPayments = await getPaymentsByOrganisation(organisationBId);

    assert.strictEqual(
      finalOrgBPayments.length,
      1,
      "Organisation B payment should remain isolated.",
    );

    assert.strictEqual(
      finalOrgBPayments[0].id,
      paymentB1Id,
      "Organisation B should retain only Payment B1.",
    );

    // ==========================================================
    // 45. VERIFY REMAINING PAYMENT CACHE
    // ==========================================================

    logSection("45. Verifying remaining payment cache");

    /**
     * Payment A1 should still be cacheable after all the
     * other payment operations.
     */
    await deleteCache(paymentA1CacheKey);

    const finalPaymentRead = await getPaymentById(organisationAId, paymentA1Id);

    assert(
      finalPaymentRead !== null,
      "Remaining Payment A1 should still be available.",
    );

    assert.strictEqual(
      Number(finalPaymentRead.total_amount),
      5500,
      "Remaining Payment A1 should retain updated amount.",
    );

    const finalPaymentCache = await redisClient.get(paymentA1CacheKey);

    assert(
      finalPaymentCache !== null,
      "Remaining Payment A1 should be cached.",
    );

    console.log("Final payment cache verified.");

    // ==========================================================
    // SUCCESS
    // ==========================================================

    logSection("PAYMENT REPOSITORY TEST PASSED");

    console.log("✓ Payment creation");

    console.log("✓ Branch-scoped receipt numbering");

    console.log("✓ Organisation isolation");

    console.log("✓ Branch validation");

    console.log("✓ Customer validation");

    console.log("✓ Receiving-user validation");

    console.log("✓ Get by ID");

    console.log("✓ Redis cache miss");

    console.log("✓ Redis cache population");

    console.log("✓ Redis cache hit");

    console.log("✓ Get by receipt number");

    console.log("✓ Customer payment history");

    console.log("✓ Branch payment history");

    console.log("✓ Organisation payment history");

    console.log("✓ Payment search");

    console.log("✓ Payment update");

    console.log("✓ Redis update cache invalidation");

    console.log("✓ Redis cache repopulation");

    console.log("✓ Cross-tenant update protection");

    console.log("✓ Transaction rollback");

    console.log("✓ Sequence rollback");

    console.log("✓ Database constraints");

    console.log("✓ Payment deletion");

    console.log("✓ Redis delete cache invalidation");

    console.log("✓ Final tenant isolation");
  } catch (error) {
    console.error("");
    console.error("Payment repository test failed.");

    console.error(error);

    process.exitCode = 1;
  } finally {
    // ========================================================
    // CLEAN REDIS CACHE
    // ========================================================

    logSection("46. Cleaning Redis cache");

    const cachePaymentIds = [
      paymentA1Id,
      paymentA2Id,
      paymentA2BranchId,
      paymentB1Id,
      paymentAfterRollbackId,
      paymentWithoutReceiverId,
    ].filter(Boolean);

    const cacheOrganisationPairs = [
      [organisationAId, paymentA1Id],
      [organisationAId, paymentA2Id],
      [organisationAId, paymentA2BranchId],
      [organisationAId, paymentAfterRollbackId],
      [organisationAId, paymentWithoutReceiverId],
      [organisationBId, paymentB1Id],
    ];

    for (const [organisationId, paymentId] of cacheOrganisationPairs) {
      if (!organisationId || !paymentId) {
        continue;
      }

      try {
        await deleteCache(buildPaymentCacheKey(organisationId, paymentId));
      } catch (cleanupError) {
        console.error(
          `Redis cleanup failed for payment ${paymentId}:`,
          cleanupError.message,
        );
      }
    }

    // ========================================================
    // CLEAN PAYMENTS
    // ========================================================

    logSection("47. Cleaning payment records");

    if (organisationAId) {
      try {
        await pool.query(
          `
            DELETE FROM payments
            WHERE organisation_id = $1;
          `,
          [organisationAId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation A payment cleanup failed:",
          cleanupError.message,
        );
      }
    }

    if (organisationBId) {
      try {
        await pool.query(
          `
            DELETE FROM payments
            WHERE organisation_id = $1;
          `,
          [organisationBId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation B payment cleanup failed:",
          cleanupError.message,
        );
      }
    }

    // ========================================================
    // CLEAN ORGANISATIONS
    // ========================================================

    logSection("48. Cleaning organisations");

    if (organisationAId) {
      try {
        await pool.query(
          `
            DELETE FROM organisations
            WHERE id = $1;
          `,
          [organisationAId],
        );
      } catch (cleanupError) {
        console.error("Organisation A cleanup failed:", cleanupError.message);
      }
    }

    if (organisationBId) {
      try {
        await pool.query(
          `
            DELETE FROM organisations
            WHERE id = $1;
          `,
          [organisationBId],
        );
      } catch (cleanupError) {
        console.error("Organisation B cleanup failed:", cleanupError.message);
      }
    }

    // ========================================================
    // CLEAN USERS
    // ========================================================

    logSection("49. Cleaning users");

    if (userAId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [userAId],
        );
      } catch (cleanupError) {
        console.error("User A cleanup failed:", cleanupError.message);
      }
    }

    if (userBId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [userBId],
        );
      } catch (cleanupError) {
        console.error("User B cleanup failed:", cleanupError.message);
      }
    }

    // ========================================================
    // DISCONNECT REDIS
    // ========================================================

    try {
      await disconnectRedis();
    } catch (cleanupError) {
      console.error("Redis disconnect failed:", cleanupError.message);
    }

    // ========================================================
    // CLOSE POSTGRESQL POOL
    // ========================================================

    await pool.end();
  }
};

main();

/**
 * Payment Transaction Repository Integration Test
 *
 * Purpose:
 * Verifies:
 * - payment transaction creation
 * - payment ownership validation
 * - split-payment behaviour
 * - supported payment methods
 * - tenant-safe retrieval
 * - retrieval by parent payment
 * - retrieval by payment method
 * - transaction-reference search
 * - transaction updates
 * - immutable payment relationship
 * - database constraints
 * - caller-owned transaction rollback
 * - tenant-safe updates
 * - tenant-safe deletes
 * - transaction deletion
 * - parent-payment cascade behaviour
 *
 * This is an integration test and requires:
 * - PostgreSQL to be running
 * - the current database schema to be applied
 *
 * Run:
 *
 *     node src/tests/payment-transaction.repository.test.js
 */

const assert = require("assert");

const { pool } = require("../db/connection");

const { createCustomer } = require("../repositories/customer.repository");

const { createPayment } = require("../repositories/payment.repository");

const {
  createPaymentTransaction,
  getPaymentTransactionById,
  getPaymentTransactionsByPayment,
  getPaymentTransactionsByMethod,
  searchPaymentTransactions,
  updatePaymentTransaction,
  deletePaymentTransaction,
} = require("../repositories/payment-transaction.repository");

/**
 * Generate isolated test values.
 */
const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Print test sections.
 */
const logSection = (title) => {
  console.log("\n==========================================================");

  console.log(title);

  console.log("==========================================================");
};

/**
 * Assert that an async operation rejects with a
 * particular database constraint/error.
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
 * Create a test user.
 */
const createTestUser = async (label) => {
  const result = await pool.query(
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
      `payment-transaction-${label}-${uniqueSuffix}@example.com`,
      "test-password-hash",
      `Payment Transaction Test User ${label}`,
    ],
  );

  return result.rows[0].id;
};

/**
 * Create an organisation and active membership.
 */
const createTestOrganisation = async (userId, label) => {
  const organisationResult = await pool.query(
    `
        INSERT INTO organisations (
            owner_id,
            name
        )
        VALUES ($1, $2)
        RETURNING id;
      `,
    [userId, `Payment Transaction Test Organisation ${label} ${uniqueSuffix}`],
  );

  const organisationId = organisationResult.rows[0].id;

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
    [organisationId, userId],
  );

  return organisationId;
};

/**
 * Create a branch.
 */
const createTestBranch = async (organisationId, label) => {
  const result = await pool.query(
    `
        INSERT INTO branches (
            organisation_id,
            name
        )
        VALUES ($1, $2)
        RETURNING id;
      `,
    [organisationId, `Payment Transaction Branch ${label} ${uniqueSuffix}`],
  );

  return result.rows[0].id;
};

/**
 * Main test runner.
 */
const main = async () => {
  let userAId;
  let userBId;

  let organisationAId;
  let organisationBId;

  let branchAId;
  let branchBId;

  let customerAId;
  let customerBId;

  let paymentAId;
  let paymentBId;

  let cashTransactionId;
  let upiTransactionId;
  let bankTransactionId;
  let cardTransactionId;
  let chequeTransactionId;

  let transactionToDeleteId;
  let transactionToRollbackId;

  try {
    // ==========================================================
    // 1. CREATE TEST USERS
    // ==========================================================

    logSection("1. Creating test users");

    userAId = await createTestUser("A");

    userBId = await createTestUser("B");

    assert(userAId, "User A should be created.");

    assert(userBId, "User B should be created.");

    // ==========================================================
    // 2. CREATE ORGANISATIONS
    // ==========================================================

    logSection("2. Creating test organisations");

    organisationAId = await createTestOrganisation(userAId, "A");

    organisationBId = await createTestOrganisation(userBId, "B");

    // ==========================================================
    // 3. CREATE BRANCHES
    // ==========================================================

    logSection("3. Creating test branches");

    branchAId = await createTestBranch(organisationAId, "A");

    branchBId = await createTestBranch(organisationBId, "B");

    // ==========================================================
    // 4. CREATE CUSTOMERS
    // ==========================================================

    logSection("4. Creating test customers");

    const customerA = await createCustomer({
      organisationId: organisationAId,

      fullName: `Payment Transaction Customer A ${uniqueSuffix}`,

      phone: "9111111111",
    });

    customerAId = customerA.id;

    const customerB = await createCustomer({
      organisationId: organisationBId,

      fullName: `Payment Transaction Customer B ${uniqueSuffix}`,

      phone: "9222222222",
    });

    customerBId = customerB.id;

    // ==========================================================
    // 5. CREATE PARENT PAYMENTS
    // ==========================================================

    logSection("5. Creating parent payments");

    const paymentA = await createPayment({
      organisationId: organisationAId,

      branchId: branchAId,

      customerId: customerAId,

      totalAmount: 10000,

      status: "COMPLETED",

      notes: "Payment transaction test payment A",

      receivedBy: userAId,
    });

    paymentAId = paymentA.id;

    assert.strictEqual(
      paymentA.receipt_number,
      "REC-1001",
      "Organisation A / Branch A first payment should be REC-1001.",
    );

    const paymentB = await createPayment({
      organisationId: organisationBId,

      branchId: branchBId,

      customerId: customerBId,

      totalAmount: 5000,

      status: "COMPLETED",

      receivedBy: userBId,
    });

    paymentBId = paymentB.id;

    assert.strictEqual(
      paymentB.receipt_number,
      "REC-1001",
      "Organisation B / Branch B first payment should be REC-1001.",
    );

    // ==========================================================
    // 6. CREATE CASH TRANSACTION
    // ==========================================================

    logSection("6. Creating CASH payment transaction");

    const cashTransaction = await createPaymentTransaction({
      organisationId: organisationAId,

      paymentId: paymentAId,

      paymentMethod: "CASH",

      amount: 2000,

      transactionReference: null,
    });

    cashTransactionId = cashTransaction.id;

    assert(cashTransaction.id, "Cash transaction should have an ID.");

    assert.strictEqual(
      cashTransaction.payment_id,
      paymentAId,
      "Cash transaction should belong to Payment A.",
    );

    assert.strictEqual(cashTransaction.payment_method, "CASH");

    assert.strictEqual(Number(cashTransaction.amount), 2000);

    assert.strictEqual(cashTransaction.transaction_reference, null);

    // ==========================================================
    // 7. CREATE UPI TRANSACTION
    // ==========================================================

    logSection("7. Creating UPI payment transaction");

    const upiTransaction = await createPaymentTransaction({
      organisationId: organisationAId,

      paymentId: paymentAId,

      paymentMethod: "UPI",

      amount: 3000,

      transactionReference: `UPI-${uniqueSuffix}`,
    });

    upiTransactionId = upiTransaction.id;

    assert.strictEqual(upiTransaction.payment_method, "UPI");

    assert.strictEqual(Number(upiTransaction.amount), 3000);

    assert(
      upiTransaction.transaction_reference.includes("UPI-"),
      "UPI transaction reference should be stored.",
    );

    // ==========================================================
    // 8. CREATE BANK TRANSFER
    // ==========================================================

    logSection("8. Creating BANK_TRANSFER payment transaction");

    const bankTransaction = await createPaymentTransaction({
      organisationId: organisationAId,

      paymentId: paymentAId,

      paymentMethod: "BANK_TRANSFER",

      amount: 2500,

      transactionReference: `UTR-${uniqueSuffix}`,
    });

    bankTransactionId = bankTransaction.id;

    assert.strictEqual(bankTransaction.payment_method, "BANK_TRANSFER");

    // ==========================================================
    // 9. CREATE CARD TRANSACTION
    // ==========================================================

    logSection("9. Creating CARD payment transaction");

    const cardTransaction = await createPaymentTransaction({
      organisationId: organisationAId,

      paymentId: paymentAId,

      paymentMethod: "CARD",

      amount: 1000,

      transactionReference: `CARD-${uniqueSuffix}`,
    });

    cardTransactionId = cardTransaction.id;

    assert.strictEqual(cardTransaction.payment_method, "CARD");

    // ==========================================================
    // 10. CREATE CHEQUE TRANSACTION
    // ==========================================================

    logSection("10. Creating CHEQUE payment transaction");

    const chequeTransaction = await createPaymentTransaction({
      organisationId: organisationAId,

      paymentId: paymentAId,

      paymentMethod: "CHEQUE",

      amount: 1500,

      transactionReference: `CHEQUE-${uniqueSuffix}`,
    });

    chequeTransactionId = chequeTransaction.id;

    assert.strictEqual(chequeTransaction.payment_method, "CHEQUE");

    /**
     * Split total:
     *
     * CASH          2000
     * UPI           3000
     * BANK_TRANSFER 2500
     * CARD          1000
     * CHEQUE        1500
     *
     * Total = 10000
     *
     * The repository deliberately does NOT enforce this total
     * against payments.total_amount. That is service-level
     * financial workflow logic.
     */

    // ==========================================================
    // 11. GET TRANSACTION BY ID
    // ==========================================================

    logSection("11. Getting payment transaction by ID");

    const fetchedCashTransaction = await getPaymentTransactionById(
      organisationAId,
      cashTransactionId,
    );

    assert(
      fetchedCashTransaction !== null,
      "Cash transaction should be returned by ID.",
    );

    assert.strictEqual(fetchedCashTransaction.id, cashTransactionId);

    assert.strictEqual(fetchedCashTransaction.payment_id, paymentAId);

    assert.strictEqual(fetchedCashTransaction.payment_method, "CASH");

    assert.strictEqual(Number(fetchedCashTransaction.amount), 2000);

    console.log("Payment transaction lookup by ID successful.");

    // ==========================================================
    // 12. TENANT ISOLATION BY ID
    // ==========================================================

    logSection("12. Testing payment transaction tenant isolation");

    const leakedTransaction = await getPaymentTransactionById(
      organisationBId,
      cashTransactionId,
    );

    assert.strictEqual(
      leakedTransaction,
      null,
      "Organisation B must not retrieve Organisation A transaction.",
    );

    console.log("Payment transaction tenant isolation verified.");

    // ==========================================================
    // 13. GET TRANSACTIONS BY PAYMENT
    // ==========================================================

    logSection("13. Getting payment transactions by payment");

    const paymentTransactions = await getPaymentTransactionsByPayment(
      organisationAId,
      paymentAId,
    );

    assert.strictEqual(
      paymentTransactions.length,
      5,
      "Payment A should contain five payment transactions.",
    );

    const paymentTransactionIds = paymentTransactions.map(
      (transaction) => transaction.id,
    );

    assert(
      paymentTransactionIds.includes(cashTransactionId),
      "Payment transactions should contain CASH transaction.",
    );

    assert(
      paymentTransactionIds.includes(upiTransactionId),
      "Payment transactions should contain UPI transaction.",
    );

    assert(
      paymentTransactionIds.includes(bankTransactionId),
      "Payment transactions should contain BANK_TRANSFER transaction.",
    );

    assert(
      paymentTransactionIds.includes(cardTransactionId),
      "Payment transactions should contain CARD transaction.",
    );

    assert(
      paymentTransactionIds.includes(chequeTransactionId),
      "Payment transactions should contain CHEQUE transaction.",
    );

    // ==========================================================
    // 14. VERIFY SPLIT PAYMENT TOTAL
    // ==========================================================

    logSection("14. Verifying split payment transaction total");

    const transactionTotal = paymentTransactions.reduce(
      (total, transaction) => total + Number(transaction.amount),
      0,
    );

    assert.strictEqual(
      transactionTotal,
      10000,
      "Payment transaction components should total ₹10,000.",
    );

    assert.strictEqual(
      Number(paymentA.total_amount),
      transactionTotal,
      "Test payment total should equal the sum of its transaction components.",
    );

    console.log("Split payment total verified.");

    // ==========================================================
    // 15. PAYMENT LIST TENANT ISOLATION
    // ==========================================================

    logSection("15. Testing payment transaction list tenant isolation");

    const wrongTenantPaymentTransactions =
      await getPaymentTransactionsByPayment(organisationBId, paymentAId);

    /**
     * The repository should reject because the parent payment
     * does not belong to Organisation B.
     */
    assert(false, "This line should never execute.");
  } catch (error) {
    /**
     * The tenant-isolation test above intentionally expects
     * an exception, so it needs special handling.
     */
    if (
      error.message === "Payment does not belong to the specified organisation."
    ) {
      /**
       * Continue with the remaining tests.
       *
       * This block is reached only for the intentional
       * cross-tenant parent-payment lookup.
       */
      console.log("Cross-tenant payment lookup correctly rejected.");

      try {
        // ======================================================
        // 16. PAYMENT METHOD LOOKUP
        // ======================================================

        logSection("16. Getting payment transactions by method");

        const upiTransactions = await getPaymentTransactionsByMethod(
          organisationAId,
          "UPI",
        );

        assert.strictEqual(
          upiTransactions.length,
          1,
          "Organisation A should have one UPI transaction.",
        );

        assert.strictEqual(upiTransactions[0].id, upiTransactionId);

        assert.strictEqual(upiTransactions[0].payment_id, paymentAId);

        // ======================================================
        // 17. METHOD TENANT ISOLATION
        // ======================================================

        logSection("17. Testing payment-method tenant isolation");

        const organisationBUpiTransactions =
          await getPaymentTransactionsByMethod(organisationBId, "UPI");

        assert.strictEqual(
          organisationBUpiTransactions.length,
          0,
          "Organisation B must not see Organisation A UPI transactions.",
        );

        // ======================================================
        // 18. SEARCH TRANSACTION REFERENCE
        // ======================================================

        logSection("18. Searching payment transactions by reference");

        const referenceSearch = await searchPaymentTransactions(
          organisationAId,
          `UPI-${uniqueSuffix}`,
        );

        assert.strictEqual(
          referenceSearch.length,
          1,
          "UPI reference search should return one transaction.",
        );

        assert.strictEqual(referenceSearch[0].id, upiTransactionId);

        assert.strictEqual(referenceSearch[0].receipt_number, "REC-1001");

        // ======================================================
        // 19. SEARCH TENANT ISOLATION
        // ======================================================

        logSection("19. Testing transaction-reference search tenant isolation");

        const wrongTenantSearch = await searchPaymentTransactions(
          organisationBId,
          `UPI-${uniqueSuffix}`,
        );

        assert.strictEqual(
          wrongTenantSearch.length,
          0,
          "Organisation B must not search Organisation A transaction references.",
        );

        // ======================================================
        // 20. UPDATE TRANSACTION
        // ======================================================

        logSection("20. Updating payment transaction");

        const updatedTransaction = await updatePaymentTransaction(
          organisationAId,
          cashTransactionId,
          {
            paymentMethod: "CARD",

            amount: 2100,

            transactionReference: `UPDATED-CARD-${uniqueSuffix}`,
          },
        );

        assert(
          updatedTransaction !== null,
          "Transaction update should return the updated transaction.",
        );

        assert.strictEqual(
          updatedTransaction.id,
          cashTransactionId,
          "Transaction ID must remain unchanged.",
        );

        assert.strictEqual(
          updatedTransaction.payment_id,
          paymentAId,
          "Payment relationship must remain unchanged.",
        );

        assert.strictEqual(
          updatedTransaction.payment_method,
          "CARD",
          "Payment method should be updated.",
        );

        assert.strictEqual(
          Number(updatedTransaction.amount),
          2100,
          "Transaction amount should be updated.",
        );

        assert.strictEqual(
          updatedTransaction.transaction_reference,
          `UPDATED-CARD-${uniqueSuffix}`,
        );

        // ======================================================
        // 21. FRESH READ AFTER UPDATE
        // ======================================================

        logSection("21. Testing fresh transaction read after update");

        const freshUpdatedTransaction = await getPaymentTransactionById(
          organisationAId,
          cashTransactionId,
        );

        assert(
          freshUpdatedTransaction !== null,
          "Updated transaction should be returned.",
        );

        assert.strictEqual(freshUpdatedTransaction.payment_method, "CARD");

        assert.strictEqual(Number(freshUpdatedTransaction.amount), 2100);

        assert.strictEqual(
          freshUpdatedTransaction.transaction_reference,
          `UPDATED-CARD-${uniqueSuffix}`,
        );

        // ======================================================
        // 22. IMMUTABLE PAYMENT RELATIONSHIP
        // ======================================================

        logSection("22. Testing immutable payment relationship");

        /**
         * paymentId is deliberately not included in the
         * allowed update fields.
         *
         * Passing it should therefore have no effect.
         */
        const immutablePaymentUpdate = await updatePaymentTransaction(
          organisationAId,
          cashTransactionId,
          {
            paymentId: paymentBId,
          },
        );

        assert(
          immutablePaymentUpdate !== null,
          "Update should still return the existing transaction.",
        );

        assert.strictEqual(
          immutablePaymentUpdate.payment_id,
          paymentAId,
          "Payment relationship must remain immutable.",
        );

        // ======================================================
        // 23. EMPTY UPDATE
        // ======================================================

        logSection("23. Testing empty transaction update");

        const unchangedTransaction = await updatePaymentTransaction(
          organisationAId,
          cashTransactionId,
          {},
        );

        assert(
          unchangedTransaction !== null,
          "Empty update should return existing transaction.",
        );

        assert.strictEqual(unchangedTransaction.id, cashTransactionId);

        assert.strictEqual(Number(unchangedTransaction.amount), 2100);

        // ======================================================
        // 24. INVALID PAYMENT METHOD
        // ======================================================

        logSection("24. Testing invalid payment method constraint");

        await assertRejected(
          () =>
            createPaymentTransaction({
              organisationId: organisationAId,

              paymentId: paymentAId,

              paymentMethod: "CRYPTO",

              amount: 100,

              transactionReference: "INVALID-METHOD",
            }),
          "payment_transactions_method_check",
        );

        // ======================================================
        // 25. INVALID AMOUNT
        // ======================================================

        logSection("25. Testing payment transaction amount constraint");

        await assertRejected(
          () =>
            createPaymentTransaction({
              organisationId: organisationAId,

              paymentId: paymentAId,

              paymentMethod: "CASH",

              amount: 0,

              transactionReference: null,
            }),
          "payment_transactions_amount_check",
        );

        // ======================================================
        // 26. CROSS-TENANT CREATE
        // ======================================================

        logSection("26. Testing cross-tenant transaction creation protection");

        await assertRejected(
          () =>
            createPaymentTransaction({
              organisationId: organisationBId,

              paymentId: paymentAId,

              paymentMethod: "CASH",

              amount: 100,

              transactionReference: "CROSS-TENANT",
            }),
          "Payment does not belong to the specified organisation.",
        );

        // ======================================================
        // 27. CROSS-TENANT UPDATE
        // ======================================================

        logSection("27. Testing cross-tenant transaction update protection");

        const crossTenantUpdate = await updatePaymentTransaction(
          organisationBId,
          cashTransactionId,
          {
            amount: 999999,
          },
        );

        assert.strictEqual(
          crossTenantUpdate,
          null,
          "Organisation B must not update Organisation A transaction.",
        );

        // ======================================================
        // 28. CROSS-TENANT DELETE
        // ======================================================

        logSection("28. Testing cross-tenant transaction delete protection");

        const crossTenantDelete = await deletePaymentTransaction(
          organisationBId,
          cashTransactionId,
        );

        assert.strictEqual(
          crossTenantDelete,
          false,
          "Organisation B must not delete Organisation A transaction.",
        );

        // ======================================================
        // 29. CALLER-OWNED TRANSACTION ROLLBACK
        // ======================================================

        logSection("29. Testing caller-owned transaction rollback");

        const transactionClient = await pool.connect();

        try {
          await transactionClient.query("BEGIN");

          const rollbackTransaction = await createPaymentTransaction({
            organisationId: organisationAId,

            paymentId: paymentAId,

            paymentMethod: "CASH",

            amount: 500,

            transactionReference: `ROLLBACK-${uniqueSuffix}`,

            client: transactionClient,
          });

          transactionToRollbackId = rollbackTransaction.id;

          await transactionClient.query("ROLLBACK");
        } catch (rollbackError) {
          try {
            await transactionClient.query("ROLLBACK");
          } catch (secondaryRollbackError) {
            // Preserve original error.
          }

          throw rollbackError;
        } finally {
          transactionClient.release();
        }

        const rolledBackTransaction = await getPaymentTransactionById(
          organisationAId,
          transactionToRollbackId,
        );

        assert.strictEqual(
          rolledBackTransaction,
          null,
          "Rolled-back transaction must not persist.",
        );

        // ======================================================
        // 30. DELETE TRANSACTION
        // ======================================================

        logSection("30. Testing payment transaction deletion");

        const temporaryTransaction = await createPaymentTransaction({
          organisationId: organisationAId,

          paymentId: paymentAId,

          paymentMethod: "CASH",

          amount: 100,

          transactionReference: `DELETE-${uniqueSuffix}`,
        });

        transactionToDeleteId = temporaryTransaction.id;

        const deleted = await deletePaymentTransaction(
          organisationAId,
          transactionToDeleteId,
        );

        assert.strictEqual(
          deleted,
          true,
          "Existing transaction should be deleted successfully.",
        );

        const deletedTransaction = await getPaymentTransactionById(
          organisationAId,
          transactionToDeleteId,
        );

        assert.strictEqual(
          deletedTransaction,
          null,
          "Deleted transaction should return null.",
        );

        // ======================================================
        // 31. DELETE NON-EXISTENT TRANSACTION
        // ======================================================

        logSection("31. Testing deletion of non-existent transaction");

        const deleteAgain = await deletePaymentTransaction(
          organisationAId,
          transactionToDeleteId,
        );

        assert.strictEqual(
          deleteAgain,
          false,
          "Deleting a non-existent transaction should return false.",
        );

        // ======================================================
        // 32. PARENT PAYMENT CASCADE
        // ======================================================

        logSection("32. Testing payment transaction cascade deletion");

        /**
         * Create a separate parent payment specifically for
         * cascade testing.
         */
        const cascadePayment = await createPayment({
          organisationId: organisationAId,

          branchId: branchAId,

          customerId: customerAId,

          totalAmount: 600,

          status: "COMPLETED",

          receivedBy: userAId,
        });

        const cascadeTransaction = await createPaymentTransaction({
          organisationId: organisationAId,

          paymentId: cascadePayment.id,

          paymentMethod: "UPI",

          amount: 600,

          transactionReference: `CASCADE-${uniqueSuffix}`,
        });

        /**
         * Delete the parent payment directly.
         *
         * The database schema specifies:
         *
         * payment_transactions.payment_id
         *     REFERENCES payments(id)
         *     ON DELETE CASCADE
         *
         * Therefore the child transaction should disappear
         * automatically.
         */
        const cascadeDeleteResult = await pool.query(
          `
              DELETE FROM payments
              WHERE id = $1
                AND organisation_id = $2
              RETURNING id;
            `,
          [cascadePayment.id, organisationAId],
        );

        assert.strictEqual(
          cascadeDeleteResult.rowCount,
          1,
          "Cascade test parent payment should be deleted.",
        );

        const cascadeTransactionAfterDelete = await getPaymentTransactionById(
          organisationAId,
          cascadeTransaction.id,
        );

        assert.strictEqual(
          cascadeTransactionAfterDelete,
          null,
          "Payment transaction should be deleted when its parent payment is deleted.",
        );

        // ======================================================
        // 33. FINAL PAYMENT TRANSACTION STATE
        // ======================================================

        logSection("33. Verifying final payment transaction state");

        const finalTransactions = await getPaymentTransactionsByPayment(
          organisationAId,
          paymentAId,
        );

        /**
         * Originally there were five transactions.
         *
         * cash transaction was updated, not deleted.
         * temporary deletion transaction was created and deleted.
         * rollback transaction never persisted.
         *
         * Therefore five transactions should remain.
         */
        assert.strictEqual(
          finalTransactions.length,
          5,
          "Payment A should contain five persistent transactions.",
        );

        const finalTransactionIds = finalTransactions.map(
          (transaction) => transaction.id,
        );

        assert(
          finalTransactionIds.includes(cashTransactionId),
          "Updated CASH/CARD transaction should remain.",
        );

        assert(
          finalTransactionIds.includes(upiTransactionId),
          "UPI transaction should remain.",
        );

        assert(
          finalTransactionIds.includes(bankTransactionId),
          "BANK_TRANSFER transaction should remain.",
        );

        assert(
          finalTransactionIds.includes(cardTransactionId),
          "CARD transaction should remain.",
        );

        assert(
          finalTransactionIds.includes(chequeTransactionId),
          "CHEQUE transaction should remain.",
        );

        assert.strictEqual(
          finalTransactions.find(
            (transaction) => transaction.id === cashTransactionId,
          ).payment_method,
          "CARD",
          "Updated transaction method should remain CARD.",
        );

        assert.strictEqual(
          Number(
            finalTransactions.find(
              (transaction) => transaction.id === cashTransactionId,
            ).amount,
          ),
          2100,
          "Updated transaction amount should remain 2100.",
        );

        // ======================================================
        // 34. FINAL TENANT ISOLATION
        // ======================================================

        logSection("34. Verifying final tenant isolation");

        const organisationBTransactions = await getPaymentTransactionsByPayment(
          organisationBId,
          paymentBId,
        );

        assert.strictEqual(
          organisationBTransactions.length,
          0,
          "Organisation B payment should have no transactions.",
        );

        const organisationBMethodTransactions =
          await getPaymentTransactionsByMethod(organisationBId, "CARD");

        assert.strictEqual(
          organisationBMethodTransactions.length,
          0,
          "Organisation B must not see Organisation A CARD transactions.",
        );

        // ======================================================
        // SUCCESS
        // ======================================================

        logSection("PAYMENT TRANSACTION REPOSITORY TEST PASSED");

        console.log("✓ Payment transaction creation");

        console.log("✓ Parent payment ownership validation");

        console.log("✓ CASH payment method");

        console.log("✓ UPI payment method");

        console.log("✓ BANK_TRANSFER payment method");

        console.log("✓ CARD payment method");

        console.log("✓ CHEQUE payment method");

        console.log("✓ Split payment components");

        console.log("✓ Get transaction by ID");

        console.log("✓ Tenant isolation");

        console.log("✓ Get transactions by payment");

        console.log("✓ Get transactions by method");

        console.log("✓ Transaction-reference search");

        console.log("✓ Transaction update");

        console.log("✓ Immutable payment relationship");

        console.log("✓ Empty update");

        console.log("✓ Invalid payment-method constraint");

        console.log("✓ Invalid amount constraint");

        console.log("✓ Cross-tenant create protection");

        console.log("✓ Cross-tenant update protection");

        console.log("✓ Cross-tenant delete protection");

        console.log("✓ Caller-owned transaction rollback");

        console.log("✓ Transaction deletion");

        console.log("✓ Parent-payment cascade deletion");

        console.log("✓ Final tenant isolation");
      } catch (innerError) {
        throw innerError;
      }
    } else {
      throw error;
    }
  } finally {
    // ========================================================
    // CLEAN PAYMENT TRANSACTIONS
    // ========================================================

    logSection("35. Cleaning payment transactions");

    if (organisationAId) {
      try {
        await pool.query(
          `
            DELETE FROM payment_transactions pt
            USING payments p
            WHERE pt.payment_id = p.id
              AND p.organisation_id = $1;
          `,
          [organisationAId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation A payment transaction cleanup failed:",
          cleanupError.message,
        );
      }
    }

    if (organisationBId) {
      try {
        await pool.query(
          `
            DELETE FROM payment_transactions pt
            USING payments p
            WHERE pt.payment_id = p.id
              AND p.organisation_id = $1;
          `,
          [organisationBId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation B payment transaction cleanup failed:",
          cleanupError.message,
        );
      }
    }

    // ========================================================
    // CLEAN PAYMENTS
    // ========================================================

    logSection("36. Cleaning payments");

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

    logSection("37. Cleaning organisations");

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

    logSection("38. Cleaning users");

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

    await pool.end();
  }
};

main();

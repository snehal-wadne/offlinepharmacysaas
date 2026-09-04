/**
 * Payment Repository Integration Test
 *
 * Requirements:
 * - PostgreSQL must be running.
 * - The current schema.sql must already be applied.
 * - db/connection.js must expose `pool`.
 * - number-sequence.repository.js must be implemented.
 * - customer.repository.js must be implemented.
 * - payment.repository.js must be implemented.
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

const TEST_PASSWORD_HASH =
  "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNO123456789";

const uniqueSuffix = Date.now();

const TEST_ORG_A_NAME = `Payment Test Org A ${uniqueSuffix}`;

const TEST_ORG_B_NAME = `Payment Test Org B ${uniqueSuffix}`;

const TEST_USER_A_EMAIL = `payment-test-a-${uniqueSuffix}@example.com`;

const TEST_USER_B_EMAIL = `payment-test-b-${uniqueSuffix}@example.com`;

const TEST_BRANCH_A1_NAME = `Payment Branch A1 ${uniqueSuffix}`;

const TEST_BRANCH_A2_NAME = `Payment Branch A2 ${uniqueSuffix}`;

const TEST_BRANCH_B1_NAME = `Payment Branch B1 ${uniqueSuffix}`;

const TEST_CUSTOMER_A_NAME = `Payment Customer A ${uniqueSuffix}`;

const TEST_CUSTOMER_A2_NAME = `Payment Customer A2 ${uniqueSuffix}`;

const TEST_CUSTOMER_B_NAME = `Payment Customer B ${uniqueSuffix}`;

/**
 * Print a clearly separated test section.
 */
const logSection = (title) => {
  console.log("\n==================================================");
  console.log(title);
  console.log("==================================================");
};

/**
 * Assert that an async operation rejects with an expected
 * error message.
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

  try {
    // ==========================================================
    // 1. USERS
    // ==========================================================

    logSection("1. Creating test users");

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
      [TEST_USER_A_EMAIL, TEST_PASSWORD_HASH, "Payment Test User A"],
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
      [TEST_USER_B_EMAIL, TEST_PASSWORD_HASH, "Payment Test User B"],
    );

    userBId = userBResult.rows[0].id;

    console.log("User A:", userAId);
    console.log("User B:", userBId);

    // ==========================================================
    // 2. ORGANISATIONS
    // ==========================================================

    logSection("2. Creating test organisations");

    const organisationAResult = await pool.query(
      `
        INSERT INTO organisations (
            owner_id,
            name
        )
        VALUES ($1, $2)
        RETURNING id;
      `,
      [userAId, TEST_ORG_A_NAME],
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
      [userBId, TEST_ORG_B_NAME],
    );

    organisationBId = organisationBResult.rows[0].id;

    console.log("Organisation A:", organisationAId);

    console.log("Organisation B:", organisationBId);

    // ==========================================================
    // 3. ORGANISATION MEMBERSHIPS
    // ==========================================================

    logSection("3. Creating active organisation memberships");

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
    // 4. BRANCHES
    // ==========================================================

    logSection("4. Creating branches");

    const branchA1Result = await pool.query(
      `
        INSERT INTO branches (
            organisation_id,
            name
        )
        VALUES ($1, $2)
        RETURNING id;
      `,
      [organisationAId, TEST_BRANCH_A1_NAME],
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
      [organisationAId, TEST_BRANCH_A2_NAME],
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
      [organisationBId, TEST_BRANCH_B1_NAME],
    );

    branchB1Id = branchB1Result.rows[0].id;

    // ==========================================================
    // 5. CUSTOMERS
    // ==========================================================

    logSection("5. Creating customers");

    const customerA = await createCustomer({
      organisationId: organisationAId,
      fullName: TEST_CUSTOMER_A_NAME,
      phone: "9000000001",
    });

    customerAId = customerA.id;

    const customerA2 = await createCustomer({
      organisationId: organisationAId,
      fullName: TEST_CUSTOMER_A2_NAME,
      phone: "9000000002",
    });

    customerA2Id = customerA2.id;

    const customerB = await createCustomer({
      organisationId: organisationBId,
      fullName: TEST_CUSTOMER_B_NAME,
      phone: "9000000003",
    });

    customerBId = customerB.id;

    console.log("Customer A:", customerA.customer_number);

    console.log("Customer A2:", customerA2.customer_number);

    console.log("Customer B:", customerB.customer_number);

    // ==========================================================
    // 6. FIRST PAYMENT
    // ==========================================================

    logSection("6. Creating first payment in Organisation A / Branch A1");

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

    assert.strictEqual(
      paymentA1.receipt_number,
      "REC-1001",
      "First payment in branch should receive REC-1001",
    );

    assert.strictEqual(
      paymentA1.total_amount,
      "5000.00",
      "PostgreSQL NUMERIC should be returned as string",
    );

    assert.strictEqual(paymentA1.status, "COMPLETED");

    console.log("Payment A1:", paymentA1.receipt_number);

    // ==========================================================
    // 7. SECOND PAYMENT SAME BRANCH
    // ==========================================================

    logSection("7. Creating second payment in same branch");

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
    // 8. SAME ORGANISATION DIFFERENT BRANCH
    // ==========================================================

    logSection("8. Creating payment in Organisation A / Branch A2");

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

    console.log("Payment A2 branch:", paymentA2Branch.receipt_number);

    // ==========================================================
    // 9. DIFFERENT ORGANISATION
    // ==========================================================

    logSection("9. Creating payment in Organisation B / Branch B1");

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
      "Receipt sequence must be isolated per branch/organisation",
    );

    console.log("Payment B1:", paymentB1.receipt_number);

    // ==========================================================
    // 10. INVALID CUSTOMER TENANT
    // ==========================================================

    logSection("10. Testing cross-tenant customer rejection");

    await assertRejected(
      () =>
        createPayment({
          organisationId: organisationAId,
          branchId: branchA1Id,
          customerId: customerBId,
          totalAmount: 1000,
          receivedBy: userAId,
        }),
      "Customer does not belong to the specified organisation.",
    );

    // ==========================================================
    // 11. INVALID BRANCH TENANT
    // ==========================================================

    logSection("11. Testing cross-tenant branch rejection");

    await assertRejected(
      () =>
        createPayment({
          organisationId: organisationAId,
          branchId: branchB1Id,
          customerId: customerAId,
          totalAmount: 1000,
          receivedBy: userAId,
        }),
      "Branch does not belong to the specified organisation.",
    );

    // ==========================================================
    // 12. INVALID RECEIVING USER
    // ==========================================================

    logSection("12. Testing invalid receiving user");

    await assertRejected(
      () =>
        createPayment({
          organisationId: organisationAId,
          branchId: branchA1Id,
          customerId: customerAId,
          totalAmount: 1000,
          receivedBy: userBId,
        }),
      "Receiving user is not an active member of the specified organisation.",
    );

    // ==========================================================
    // 13. GET BY ID
    // ==========================================================

    logSection("13. Testing getPaymentById");

    const fetchedPayment = await getPaymentById(organisationAId, paymentA1Id);

    assert(fetchedPayment, "Payment should be found by ID");

    assert.strictEqual(fetchedPayment.id, paymentA1Id);

    assert.strictEqual(fetchedPayment.receipt_number, "REC-1001");

    // ==========================================================
    // 14. TENANT ISOLATION BY ID
    // ==========================================================

    logSection("14. Testing tenant isolation by ID");

    const crossTenantPayment = await getPaymentById(
      organisationBId,
      paymentA1Id,
    );

    assert.strictEqual(
      crossTenantPayment,
      null,
      "Organisation B must not see Organisation A payment",
    );

    // ==========================================================
    // 15. GET BY RECEIPT
    // ==========================================================

    logSection("15. Testing getPaymentByReceiptNumber");

    const fetchedByReceipt = await getPaymentByReceiptNumber(
      organisationAId,
      branchA1Id,
      "REC-1001",
    );

    assert(fetchedByReceipt, "Payment should be found by receipt number");

    assert.strictEqual(fetchedByReceipt.id, paymentA1Id);

    // ==========================================================
    // 16. RECEIPT BRANCH ISOLATION
    // ==========================================================

    logSection("16. Testing receipt branch isolation");

    const otherBranchReceipt = await getPaymentByReceiptNumber(
      organisationAId,
      branchA2Id,
      "REC-1001",
    );

    assert(otherBranchReceipt, "Branch A2 should have its own REC-1001");

    assert.notStrictEqual(
      otherBranchReceipt.id,
      paymentA1Id,
      "Same receipt number in another branch must represent a different payment",
    );

    // ==========================================================
    // 17. CUSTOMER PAYMENT HISTORY
    // ==========================================================

    logSection("17. Testing customer payment history");

    const customerPayments = await getPaymentsByCustomer(
      organisationAId,
      customerAId,
    );

    assert.strictEqual(
      customerPayments.length,
      2,
      "Customer A should have two payments",
    );

    assert(customerPayments.some((payment) => payment.id === paymentA1Id));

    assert(
      customerPayments.some((payment) => payment.id === paymentA2BranchId),
    );

    // ==========================================================
    // 18. CUSTOMER TENANT ISOLATION
    // ==========================================================

    logSection("18. Testing customer tenant isolation");

    const wrongCustomerOrganisation = await getPaymentsByCustomer(
      organisationBId,
      customerAId,
    );

    assert.strictEqual(
      wrongCustomerOrganisation.length,
      0,
      "Organisation B must not retrieve Organisation A customer payments",
    );

    // ==========================================================
    // 19. BRANCH PAYMENT HISTORY
    // ==========================================================

    logSection("19. Testing branch payment history");

    const branchPayments = await getPaymentsByBranch(
      organisationAId,
      branchA1Id,
    );

    assert.strictEqual(
      branchPayments.length,
      2,
      "Branch A1 should have two payments",
    );

    // ==========================================================
    // 20. BRANCH TENANT ISOLATION
    // ==========================================================

    logSection("20. Testing branch tenant isolation");

    const wrongBranchOrganisation = await getPaymentsByBranch(
      organisationBId,
      branchA1Id,
    );

    assert.strictEqual(
      wrongBranchOrganisation.length,
      0,
      "Organisation B must not retrieve Organisation A branch payments",
    );

    // ==========================================================
    // 21. ORGANISATION PAYMENT HISTORY
    // ==========================================================

    logSection("21. Testing organisation payment history");

    const organisationPayments =
      await getPaymentsByOrganisation(organisationAId);

    assert.strictEqual(
      organisationPayments.length,
      3,
      "Organisation A should have three payments",
    );

    assert(
      organisationPayments.every(
        (payment) => payment.organisation_id === organisationAId,
      ),
    );

    // ==========================================================
    // 22. SEARCH BY RECEIPT
    // ==========================================================

    logSection("22. Testing payment search by receipt number");

    const receiptSearch = await searchPayments(organisationAId, "REC-1001");

    assert(
      receiptSearch.length >= 2,
      "Organisation A should find both REC-1001 payments",
    );

    assert(
      receiptSearch.every(
        (payment) => payment.organisation_id === organisationAId,
      ),
    );

    // ==========================================================
    // 23. SEARCH BY CUSTOMER
    // ==========================================================

    logSection("23. Testing payment search by customer name");

    const customerSearch = await searchPayments(
      organisationAId,
      TEST_CUSTOMER_A_NAME,
    );

    assert(
      customerSearch.length >= 2,
      "Search should find Customer A payments",
    );

    assert(
      customerSearch.every(
        (payment) => payment.organisation_id === organisationAId,
      ),
    );

    // ==========================================================
    // 24. UPDATE PAYMENT
    // ==========================================================

    logSection("24. Testing payment update");

    const updatedPayment = await updatePayment(organisationAId, paymentA2Id, {
      totalAmount: 2750,
      status: "COMPLETED",
      notes: "Updated payment",
    });

    assert(updatedPayment, "Payment update should return payment");

    assert.strictEqual(updatedPayment.total_amount, "2750.00");

    assert.strictEqual(updatedPayment.status, "COMPLETED");

    assert.strictEqual(updatedPayment.notes, "Updated payment");

    assert.strictEqual(
      updatedPayment.receipt_number,
      "REC-1002",
      "Receipt number must remain immutable",
    );

    // ==========================================================
    // 25. UPDATE RECEIVED-BY
    // ==========================================================

    logSection("25. Testing received-by update");

    const receivedByUpdate = await updatePayment(organisationAId, paymentA2Id, {
      receivedBy: userAId,
    });

    assert.strictEqual(receivedByUpdate.received_by, userAId);

    // ==========================================================
    // 26. INVALID RECEIVED-BY UPDATE
    // ==========================================================

    logSection("26. Testing invalid received-by update");

    await assertRejected(
      () =>
        updatePayment(organisationAId, paymentA2Id, {
          receivedBy: userBId,
        }),
      "Receiving user is not an active member of the specified organisation.",
    );

    // ==========================================================
    // 27. CROSS-TENANT UPDATE
    // ==========================================================

    logSection("27. Testing cross-tenant update protection");

    const crossTenantUpdate = await updatePayment(
      organisationBId,
      paymentA2Id,
      {
        notes: "Should not update",
      },
    );

    assert.strictEqual(
      crossTenantUpdate,
      null,
      "Organisation B must not update Organisation A payment",
    );

    // ==========================================================
    // 28. UPDATE NON-EXISTENT PAYMENT
    // ==========================================================

    logSection("28. Testing update of non-existent payment");

    const missingUpdate = await updatePayment(
      organisationAId,
      "00000000-0000-0000-0000-000000000000",
      {
        notes: "Should not exist",
      },
    );

    assert.strictEqual(missingUpdate, null);

    // ==========================================================
    // 29. CALLER-OWNED TRANSACTION ROLLBACK
    // ==========================================================

    logSection("29. Testing caller-owned transaction rollback");

    const transactionClient = await pool.connect();

    let rolledBackPaymentId;

    try {
      await transactionClient.query("BEGIN");

      const transactionalPayment = await createPayment({
        organisationId: organisationAId,
        branchId: branchA1Id,
        customerId: customerAId,
        totalAmount: 777,
        status: "COMPLETED",
        receivedBy: userAId,
        client: transactionClient,
      });

      rolledBackPaymentId = transactionalPayment.id;

      assert.strictEqual(
        transactionalPayment.receipt_number,
        "REC-1003",
        "Transactional payment should receive REC-1003",
      );

      await transactionClient.query("ROLLBACK");
    } finally {
      transactionClient.release();
    }

    const rolledBackPayment = await getPaymentById(
      organisationAId,
      rolledBackPaymentId,
    );

    assert.strictEqual(
      rolledBackPayment,
      null,
      "Payment created inside rolled-back transaction must not persist",
    );

    // ==========================================================
    // 30. SEQUENCE ROLLBACK VERIFICATION
    // ==========================================================

    logSection("30. Testing receipt sequence rollback");

    /*
     * Because the sequence increment happens inside the same
     * transaction as the payment creation, the rolled-back
     * REC-1003 must be available again.
     */

    const paymentAfterRollback = await createPayment({
      organisationId: organisationAId,
      branchId: branchA1Id,
      customerId: customerAId,
      totalAmount: 888,
      status: "COMPLETED",
      receivedBy: userAId,
    });

    assert.strictEqual(
      paymentAfterRollback.receipt_number,
      "REC-1003",
      "Rolled-back receipt number must be reusable",
    );

    const paymentAfterRollbackId = paymentAfterRollback.id;

    // ==========================================================
    // 31. INVALID TOTAL AMOUNT
    // ==========================================================

    logSection("31. Testing database amount constraint");

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

    /*
     * IMPORTANT:
     *
     * The failed INSERT is inside the repository transaction.
     * Therefore the receipt sequence increment also rolls back.
     *
     * No receipt number is consumed by this failed payment.
     */

    // ==========================================================
    // 32. INVALID STATUS
    // ==========================================================

    logSection("32. Testing database status constraint");

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

    /*
     * Again, the sequence increment rolls back because the
     * payment INSERT fails inside the same transaction.
     */

    // ==========================================================
    // 33. NULL RECEIVED-BY
    // ==========================================================

    logSection("33. Testing nullable received_by");

    const paymentWithoutReceiver = await createPayment({
      organisationId: organisationAId,
      branchId: branchA1Id,
      customerId: customerAId,
      totalAmount: 400,
      receivedBy: null,
    });

    /*
     * At this point:
     *
     * REC-1001 → payment A1
     * REC-1002 → payment A2
     * REC-1003 → payment after rollback
     * REC-1004 → payment without receiver
     *
     * Therefore the next sequence value should be 1005.
     */

    assert.strictEqual(
      paymentWithoutReceiver.receipt_number,
      "REC-1004",
      "Next successful payment should receive REC-1004",
    );

    assert.strictEqual(paymentWithoutReceiver.received_by, null);

    const paymentWithoutReceiverId = paymentWithoutReceiver.id;

    // ==========================================================
    // 34. EMPTY UPDATE
    // ==========================================================

    logSection("34. Testing empty update");

    const unchangedPayment = await updatePayment(
      organisationAId,
      paymentA1Id,
      {},
    );

    assert.strictEqual(unchangedPayment.id, paymentA1Id);

    assert.strictEqual(unchangedPayment.receipt_number, "REC-1001");

    // ==========================================================
    // 35. CROSS-TENANT DELETE
    // ==========================================================

    logSection("35. Testing cross-tenant delete protection");

    const crossTenantDelete = await deletePayment(organisationBId, paymentA1Id);

    assert.strictEqual(
      crossTenantDelete,
      false,
      "Organisation B must not delete Organisation A payment",
    );

    // ==========================================================
    // 36. DELETE PAYMENT
    // ==========================================================

    logSection("36. Testing payment deletion");

    const deleted = await deletePayment(
      organisationAId,
      paymentWithoutReceiverId,
    );

    assert.strictEqual(deleted, true);

    const deletedPayment = await getPaymentById(
      organisationAId,
      paymentWithoutReceiverId,
    );

    assert.strictEqual(deletedPayment, null);

    // ==========================================================
    // 37. DELETE PAYMENT CREATED AFTER ROLLBACK
    // ==========================================================

    logSection("37. Cleaning payment created after rollback test");

    const deletedAfterRollback = await deletePayment(
      organisationAId,
      paymentAfterRollbackId,
    );

    assert.strictEqual(deletedAfterRollback, true);

    // ==========================================================
    // 38. DELETE SECOND PAYMENT
    // ==========================================================

    logSection("38. Cleaning second payment");

    const deletedPaymentA2 = await deletePayment(organisationAId, paymentA2Id);

    assert.strictEqual(deletedPaymentA2, true);

    // ==========================================================
    // 39. CHECK ACTUAL SEQUENCE STATE
    // ==========================================================

    logSection("39. Checking receipt sequence state");

    /*
     * IMPORTANT:
     *
     * We use getNumberSequence() because this is the actual
     * inspection function exposed by number-sequence.repository.js.
     *
     * We DO NOT call getNextBusinessNumber() here because that
     * function generates and consumes the next business number.
     */

    const sequenceA1 = await getNumberSequence({
      organisationId: organisationAId,
      branchId: branchA1Id,
      sequenceType: "RECEIPT",
    });

    assert(sequenceA1, "Branch A1 receipt sequence should exist");

    assert.strictEqual(
      sequenceA1.next_number,
      "1005",
      "Branch A1 should have next receipt number 1005",
    );

    const sequenceA2 = await getNumberSequence({
      organisationId: organisationAId,
      branchId: branchA2Id,
      sequenceType: "RECEIPT",
    });

    assert(sequenceA2, "Branch A2 receipt sequence should exist");

    assert.strictEqual(
      sequenceA2.next_number,
      "1002",
      "Branch A2 should have next receipt number 1002",
    );

    const sequenceB1 = await getNumberSequence({
      organisationId: organisationBId,
      branchId: branchB1Id,
      sequenceType: "RECEIPT",
    });

    assert(sequenceB1, "Branch B1 receipt sequence should exist");

    assert.strictEqual(
      sequenceB1.next_number,
      "1002",
      "Branch B1 should have next receipt number 1002",
    );

    // ==========================================================
    // 40. FINAL PAYMENT STATE
    // ==========================================================

    logSection("40. Final payment state");

    const finalOrgAPayments = await getPaymentsByOrganisation(organisationAId);

    /*
     * Remaining Organisation A payments:
     *
     * REC-1001 → payment A1
     * REC-1001 → Branch A2 payment
     *
     * Deleted:
     * REC-1002
     * REC-1003
     * REC-1004
     */

    assert.strictEqual(
      finalOrgAPayments.length,
      2,
      "Only the two intended Organisation A payments should remain",
    );

    assert(finalOrgAPayments.some((payment) => payment.id === paymentA1Id));

    assert(
      finalOrgAPayments.some((payment) => payment.id === paymentA2BranchId),
    );

    const finalOrgBPayments = await getPaymentsByOrganisation(organisationBId);

    assert.strictEqual(
      finalOrgBPayments.length,
      1,
      "Organisation B payment should remain isolated",
    );

    assert.strictEqual(finalOrgBPayments[0].id, paymentB1Id);

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
    console.log("✓ Get by receipt number");
    console.log("✓ Customer payment history");
    console.log("✓ Branch payment history");
    console.log("✓ Organisation payment history");
    console.log("✓ Payment search");
    console.log("✓ Payment update");
    console.log("✓ Status persistence");
    console.log("✓ Cross-tenant update protection");
    console.log("✓ Cross-tenant delete protection");
    console.log("✓ Transaction rollback");
    console.log("✓ Receipt sequence rollback");
    console.log("✓ Failed payment sequence rollback");
    console.log("✓ Database constraints");
    console.log("✓ Nullable received_by");
    console.log("✓ Payment deletion");
    console.log("✓ Final sequence state");
    console.log("✓ Final tenant isolation");
  } finally {
    // ==========================================================
    // CLEANUP
    // ==========================================================

    logSection("41. Cleaning test data");

    /*
     * Remove payments explicitly before organisation deletion.
     */

    if (organisationAId) {
      await pool.query(
        `
          DELETE FROM payments
          WHERE organisation_id = $1;
        `,
        [organisationAId],
      );
    }

    if (organisationBId) {
      await pool.query(
        `
          DELETE FROM payments
          WHERE organisation_id = $1;
        `,
        [organisationBId],
      );
    }

    /*
     * Organisation deletion cascades:
     *
     * organisations
     *   → branches
     *   → customers
     *   → number_sequences
     *   → memberships
     *   → etc.
     */

    if (organisationAId) {
      await pool.query(
        `
          DELETE FROM organisations
          WHERE id = $1;
        `,
        [organisationAId],
      );
    }

    if (organisationBId) {
      await pool.query(
        `
          DELETE FROM organisations
          WHERE id = $1;
        `,
        [organisationBId],
      );
    }

    if (userAId) {
      await pool.query(
        `
          DELETE FROM users
          WHERE id = $1;
        `,
        [userAId],
      );
    }

    if (userBId) {
      await pool.query(
        `
          DELETE FROM users
          WHERE id = $1;
        `,
        [userBId],
      );
    }

    await pool.end();

    console.log("Test cleanup completed.");
  }
};

main().catch((error) => {
  console.error("\nPAYMENT REPOSITORY TEST FAILED");

  console.error(error);

  process.exitCode = 1;
});

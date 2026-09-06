/**
 * Payment Allocation Repository Integration Test
 *
 * Verifies:
 *
 * - allocation creation
 * - payment ownership validation
 * - invoice ownership validation
 * - cross-tenant protection
 * - multiple invoices receiving one payment
 * - multiple payments being allocated to one invoice
 * - allocation lookup by ID
 * - allocation lookup by payment
 * - allocation lookup by invoice
 * - allocation details with invoice information
 * - allocation updates
 * - immutable payment/invoice relationships
 * - duplicate payment/invoice protection
 * - positive allocation constraint
 * - caller-owned transaction rollback
 * - cross-tenant update protection
 * - cross-tenant delete protection
 * - allocation deletion
 * - parent payment cascade behaviour
 *
 * Requires:
 * - PostgreSQL running
 * - current schema.sql applied
 *
 * Run:
 *
 *     node src/tests/payment-allocation.repository.test.js
 */

const { pool } = require("../db/connection");

const { createCustomer } = require("../repositories/customer.repository");

const { createPayment } = require("../repositories/payment.repository");

const { createInvoice } = require("../repositories/invoice.repository");

const {
  createPaymentAllocation,
  getPaymentAllocationById,
  getPaymentAllocationsByPayment,
  getPaymentAllocationsByInvoice,
  getPaymentAllocationDetailsByPayment,
  updatePaymentAllocation,
  deletePaymentAllocation,
} = require("../repositories/payment-allocation.repository");

/**
 * Simple assertion helper.
 */
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

/**
 * Generate isolated test values.
 */
const uniqueValue = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Assert that an async operation rejects.
 */
const assertRejected = async (operation, expectedMessage) => {
  let error = null;

  try {
    await operation();
  } catch (caughtError) {
    error = caughtError;
  }

  assert(
    error !== null,
    `Expected operation to reject with "${expectedMessage}".`,
  );

  assert(
    error.message.includes(expectedMessage),
    `Expected error containing "${expectedMessage}", got "${error.message}".`,
  );
};

/**
 * Create isolated organisation.
 */
const createTestOrganisation = async (label) => {
  const userResult = await pool.query(
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
      `allocation-${label}-${uniqueValue}@example.com`,
      "test-password-hash",
      `Payment Allocation Test User ${label}`,
    ],
  );

  const userId = userResult.rows[0].id;

  const organisationResult = await pool.query(
    `
      INSERT INTO organisations (
          owner_id,
          name
      )
      VALUES ($1, $2)
      RETURNING id;
    `,
    [userId, `Payment Allocation Test Organisation ${label} ${uniqueValue}`],
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

  return {
    userId,
    organisationId,
  };
};

/**
 * Create branch.
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
    [organisationId, `Allocation Branch ${label} ${uniqueValue}`],
  );

  return result.rows[0].id;
};

/**
 * Main integration test.
 */
const runTests = async () => {
  let organisationA = null;
  let organisationB = null;

  let branchA = null;
  let branchB = null;

  let customerA = null;
  let customerB = null;

  let paymentA = null;
  let paymentA2 = null;
  let paymentB = null;

  let invoiceA1 = null;
  let invoiceA2 = null;
  let invoiceB = null;

  let allocationA1 = null;
  let allocationA2 = null;
  let allocationA3 = null;

  let rollbackAllocationId = null;
  let temporaryAllocationId = null;

  try {
    // ========================================================
    // 1. CREATE ORGANISATIONS
    // ========================================================

    console.log("--- Creating test organisations ---");

    organisationA = await createTestOrganisation("A");
    organisationB = await createTestOrganisation("B");

    console.log("Test organisations created.");

    // ========================================================
    // 2. CREATE BRANCHES
    // ========================================================

    console.log("--- Creating test branches ---");

    branchA = await createTestBranch(organisationA.organisationId, "A");

    branchB = await createTestBranch(organisationB.organisationId, "B");

    // ========================================================
    // 3. CREATE CUSTOMERS
    // ========================================================

    console.log("--- Creating test customers ---");

    customerA = await createCustomer({
      organisationId: organisationA.organisationId,
      fullName: `Allocation Customer A ${uniqueValue}`,
      phone: "9333333333",
    });

    customerB = await createCustomer({
      organisationId: organisationB.organisationId,
      fullName: `Allocation Customer B ${uniqueValue}`,
      phone: "9444444444",
    });

    // ========================================================
    // 4. CREATE PAYMENTS
    // ========================================================

    console.log("--- Creating test payments ---");

    paymentA = await createPayment({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      totalAmount: 7000,
      status: "COMPLETED",
      receivedBy: organisationA.userId,
    });

    assert(
      paymentA.receipt_number === "REC-1001",
      "Organisation A first payment should be REC-1001.",
    );

    paymentA2 = await createPayment({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      totalAmount: 3000,
      status: "COMPLETED",
      receivedBy: organisationA.userId,
    });

    assert(
      paymentA2.receipt_number === "REC-1002",
      "Organisation A second payment should be REC-1002.",
    );

    paymentB = await createPayment({
      organisationId: organisationB.organisationId,
      branchId: branchB,
      customerId: customerB.id,
      totalAmount: 5000,
      status: "COMPLETED",
      receivedBy: organisationB.userId,
    });

    assert(
      paymentB.receipt_number === "REC-1001",
      "Organisation B payment should be REC-1001.",
    );

    // ========================================================
    // 5. CREATE INVOICES
    // ========================================================

    console.log("--- Creating test invoices ---");

    invoiceA1 = await createInvoice({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      invoiceDate: "2026-09-04T10:00:00Z",
      subtotal: 5000,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 5000,
      status: "COMPLETED",
      notes: "Allocation test invoice A1",
      createdBy: organisationA.userId,
    });

    assert(
      invoiceA1.invoice_number === "INV-1001",
      "First Organisation A invoice should be INV-1001.",
    );

    invoiceA2 = await createInvoice({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      invoiceDate: "2026-09-04T10:05:00Z",
      subtotal: 2000,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 2000,
      status: "COMPLETED",
      notes: "Allocation test invoice A2",
      createdBy: organisationA.userId,
    });

    assert(
      invoiceA2.invoice_number === "INV-1002",
      "Second Organisation A invoice should be INV-1002.",
    );

    invoiceB = await createInvoice({
      organisationId: organisationB.organisationId,
      branchId: branchB,
      customerId: customerB.id,
      invoiceDate: "2026-09-04T10:10:00Z",
      subtotal: 5000,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 5000,
      status: "COMPLETED",
      notes: "Allocation test invoice B",
      createdBy: organisationB.userId,
    });

    // ========================================================
    // 6. CREATE FIRST ALLOCATION
    // ========================================================

    console.log("--- Creating first payment allocation ---");

    allocationA1 = await createPaymentAllocation({
      organisationId: organisationA.organisationId,
      paymentId: paymentA.id,
      invoiceId: invoiceA1.id,
      allocatedAmount: 5000,
    });

    assert(allocationA1.id, "Allocation should have an ID.");

    assert(
      allocationA1.payment_id === paymentA.id,
      "Allocation should reference Payment A.",
    );

    assert(
      allocationA1.invoice_id === invoiceA1.id,
      "Allocation should reference Invoice A1.",
    );

    assert(
      Number(allocationA1.allocated_amount) === 5000,
      "Allocation amount should be 5000.",
    );

    // ========================================================
    // 7. CREATE SECOND ALLOCATION
    // ========================================================

    console.log("--- Creating second allocation for same payment ---");

    allocationA2 = await createPaymentAllocation({
      organisationId: organisationA.organisationId,
      paymentId: paymentA.id,
      invoiceId: invoiceA2.id,
      allocatedAmount: 2000,
    });

    assert(
      allocationA2.id !== allocationA1.id,
      "Each allocation must have its own UUID.",
    );

    assert(
      Number(allocationA2.allocated_amount) === 2000,
      "Second allocation amount should be 2000.",
    );

    console.log("One payment allocated across multiple invoices.");

    // ========================================================
    // 8. CREATE SECOND PAYMENT ALLOCATION TO SAME INVOICE
    // ========================================================

    console.log("--- Creating second payment allocation to same invoice ---");

    allocationA3 = await createPaymentAllocation({
      organisationId: organisationA.organisationId,
      paymentId: paymentA2.id,
      invoiceId: invoiceA1.id,
      allocatedAmount: 1000,
    });

    assert(
      allocationA3.id !== allocationA1.id,
      "Second payment allocation should have a different ID.",
    );

    console.log("One invoice receiving multiple payments verified.");

    // ========================================================
    // 9. GET ALLOCATION BY ID
    // ========================================================

    console.log("--- Getting allocation by ID ---");

    const fetchedAllocation = await getPaymentAllocationById(
      organisationA.organisationId,
      allocationA1.id,
    );

    assert(fetchedAllocation !== null, "Allocation should be returned by ID.");

    assert(
      fetchedAllocation.id === allocationA1.id,
      "Fetched allocation ID should match.",
    );

    assert(
      fetchedAllocation.payment_id === paymentA.id,
      "Fetched allocation should reference Payment A.",
    );

    assert(
      fetchedAllocation.invoice_id === invoiceA1.id,
      "Fetched allocation should reference Invoice A1.",
    );

    assert(
      Number(fetchedAllocation.allocated_amount) === 5000,
      "Fetched allocation amount should be 5000.",
    );

    console.log("Allocation lookup by ID successful.");

    // ========================================================
    // 10. TENANT ISOLATION BY ID
    // ========================================================

    console.log("--- Testing allocation tenant isolation ---");

    const leakedAllocation = await getPaymentAllocationById(
      organisationB.organisationId,
      allocationA1.id,
    );

    assert(
      leakedAllocation === null,
      "Organisation B must not retrieve Organisation A allocation.",
    );

    console.log("Allocation tenant isolation verified.");

    // ========================================================
    // 11. GET ALLOCATIONS BY PAYMENT
    // ========================================================

    console.log("--- Getting allocations by payment ---");

    const paymentAllocations = await getPaymentAllocationsByPayment(
      organisationA.organisationId,
      paymentA.id,
    );

    assert(
      paymentAllocations.length === 2,
      "Payment A should have two allocations.",
    );

    const paymentAllocationIds = paymentAllocations.map(
      (allocation) => allocation.id,
    );

    assert(
      paymentAllocationIds.includes(allocationA1.id),
      "Payment allocations should contain Allocation A1.",
    );

    assert(
      paymentAllocationIds.includes(allocationA2.id),
      "Payment allocations should contain Allocation A2.",
    );

    console.log("Payment allocation history successful.");

    // ========================================================
    // 12. GET ALLOCATIONS BY INVOICE
    // ========================================================

    console.log("--- Getting allocations by invoice ---");

    const invoiceAllocations = await getPaymentAllocationsByInvoice(
      organisationA.organisationId,
      invoiceA1.id,
    );

    assert(
      invoiceAllocations.length === 2,
      "Invoice A1 should have two allocations.",
    );

    const invoiceAllocationIds = invoiceAllocations.map(
      (allocation) => allocation.id,
    );

    assert(
      invoiceAllocationIds.includes(allocationA1.id),
      "Invoice A1 allocations should contain Allocation A1.",
    );

    assert(
      invoiceAllocationIds.includes(allocationA3.id),
      "Invoice A1 allocations should contain Allocation A3.",
    );

    console.log("Invoice allocation history successful.");

    // ========================================================
    // 13. ALLOCATION LIST TENANT ISOLATION
    // ========================================================

    console.log("--- Testing allocation list tenant isolation ---");

    await assertRejected(
      () =>
        getPaymentAllocationsByPayment(
          organisationB.organisationId,
          paymentA.id,
        ),
      "Payment does not belong to the specified organisation.",
    );

    await assertRejected(
      () =>
        getPaymentAllocationsByInvoice(
          organisationB.organisationId,
          invoiceA1.id,
        ),
      "Invoice does not belong to the specified organisation.",
    );

    console.log("Allocation list tenant isolation verified.");

    // ========================================================
    // 14. ALLOCATION DETAILS
    // ========================================================

    console.log("--- Getting allocation details by payment ---");

    const allocationDetails = await getPaymentAllocationDetailsByPayment(
      organisationA.organisationId,
      paymentA.id,
    );

    assert(
      allocationDetails.length === 2,
      "Payment A should have two allocation detail rows.",
    );

    const detailA1 = allocationDetails.find(
      (allocation) => allocation.id === allocationA1.id,
    );

    assert(
      detailA1 !== undefined,
      "Allocation details should contain Allocation A1.",
    );

    assert(
      detailA1.invoice_number === invoiceA1.invoice_number,
      "Allocation details should include invoice number.",
    );

    assert(
      Number(detailA1.invoice_total_amount) === 5000,
      "Allocation details should include invoice total.",
    );

    console.log("Allocation details lookup successful.");

    // ========================================================
    // 15. DUPLICATE PAYMENT/INVOICE ALLOCATION
    // ========================================================

    console.log(
      "--- Testing duplicate payment/invoice allocation protection ---",
    );

    await assertRejected(
      () =>
        createPaymentAllocation({
          organisationId: organisationA.organisationId,
          paymentId: paymentA.id,
          invoiceId: invoiceA1.id,
          allocatedAmount: 500,
        }),
      "payment_allocations_payment_invoice_unique",
    );

    console.log("Duplicate payment/invoice allocation protection verified.");

    // ========================================================
    // 16. INVALID ALLOCATION AMOUNT
    // ========================================================

    console.log("--- Testing allocation amount constraint ---");

    await assertRejected(
      () =>
        createPaymentAllocation({
          organisationId: organisationA.organisationId,
          paymentId: paymentA.id,
          invoiceId: invoiceA2.id,
          allocatedAmount: 0,
        }),
      "payment_allocations_amount_check",
    );

    // ========================================================
    // 17. CROSS-TENANT CREATION
    // ========================================================

    console.log("--- Testing cross-tenant allocation creation ---");

    await assertRejected(
      () =>
        createPaymentAllocation({
          organisationId: organisationB.organisationId,
          paymentId: paymentA.id,
          invoiceId: invoiceB.id,
          allocatedAmount: 500,
        }),
      "Payment and invoice must belong to the specified organisation.",
    );

    // ========================================================
    // 18. MIXED-TENANT PAYMENT/INVOICE
    // ========================================================

    console.log("--- Testing mixed-tenant payment/invoice protection ---");

    await assertRejected(
      () =>
        createPaymentAllocation({
          organisationId: organisationA.organisationId,
          paymentId: paymentA.id,
          invoiceId: invoiceB.id,
          allocatedAmount: 500,
        }),
      "Payment and invoice must belong to the specified organisation.",
    );

    console.log("Mixed-tenant payment/invoice protection verified.");

    // ========================================================
    // 19. UPDATE ALLOCATION
    // ========================================================

    console.log("--- Updating payment allocation ---");

    const updatedAllocation = await updatePaymentAllocation(
      organisationA.organisationId,
      allocationA2.id,
      {
        allocatedAmount: 1800,
      },
    );

    assert(
      updatedAllocation !== null,
      "Allocation update should return the updated allocation.",
    );

    assert(
      updatedAllocation.id === allocationA2.id,
      "Allocation ID must remain unchanged.",
    );

    assert(
      updatedAllocation.payment_id === paymentA.id,
      "Payment relationship must remain unchanged.",
    );

    assert(
      updatedAllocation.invoice_id === invoiceA2.id,
      "Invoice relationship must remain unchanged.",
    );

    assert(
      Number(updatedAllocation.allocated_amount) === 1800,
      "Allocation amount should be updated to 1800.",
    );

    console.log("Payment allocation update successful.");

    // ========================================================
    // 20. FRESH READ AFTER UPDATE
    // ========================================================

    console.log("--- Testing fresh allocation read after update ---");

    const freshUpdatedAllocation = await getPaymentAllocationById(
      organisationA.organisationId,
      allocationA2.id,
    );

    assert(
      freshUpdatedAllocation !== null,
      "Updated allocation should be returned.",
    );

    assert(
      Number(freshUpdatedAllocation.allocated_amount) === 1800,
      "Fresh allocation read should contain updated amount.",
    );

    // ========================================================
    // 21. IMMUTABLE PAYMENT RELATIONSHIP
    // ========================================================

    console.log("--- Testing immutable payment relationship ---");

    const immutablePaymentUpdate = await updatePaymentAllocation(
      organisationA.organisationId,
      allocationA2.id,
      {
        paymentId: paymentA2.id,
      },
    );

    assert(
      immutablePaymentUpdate !== null,
      "Update should return the existing allocation.",
    );

    assert(
      immutablePaymentUpdate.payment_id === paymentA.id,
      "payment_id must remain immutable.",
    );

    // ========================================================
    // 22. IMMUTABLE INVOICE RELATIONSHIP
    // ========================================================

    console.log("--- Testing immutable invoice relationship ---");

    const immutableInvoiceUpdate = await updatePaymentAllocation(
      organisationA.organisationId,
      allocationA2.id,
      {
        invoiceId: invoiceA1.id,
      },
    );

    assert(
      immutableInvoiceUpdate.invoice_id === invoiceA2.id,
      "invoice_id must remain immutable.",
    );

    // ========================================================
    // 23. EMPTY UPDATE
    // ========================================================

    console.log("--- Testing empty allocation update ---");

    const unchangedAllocation = await updatePaymentAllocation(
      organisationA.organisationId,
      allocationA2.id,
      {},
    );

    assert(
      unchangedAllocation !== null,
      "Empty update should return the existing allocation.",
    );

    assert(
      Number(unchangedAllocation.allocated_amount) === 1800,
      "Empty update must not change allocation amount.",
    );

    // ========================================================
    // 24. INVALID UPDATE AMOUNT
    // ========================================================

    console.log("--- Testing invalid allocation update amount ---");

    await assertRejected(
      () =>
        updatePaymentAllocation(organisationA.organisationId, allocationA2.id, {
          allocatedAmount: 0,
        }),
      "payment_allocations_amount_check",
    );

    // ========================================================
    // 25. CROSS-TENANT UPDATE
    // ========================================================

    console.log("--- Testing cross-tenant allocation update ---");

    const crossTenantUpdate = await updatePaymentAllocation(
      organisationB.organisationId,
      allocationA1.id,
      {
        allocatedAmount: 9999,
      },
    );

    assert(
      crossTenantUpdate === null,
      "Organisation B must not update Organisation A allocation.",
    );

    // ========================================================
    // 26. CALLER-OWNED TRANSACTION ROLLBACK
    // ========================================================

    console.log("--- Testing caller-owned transaction rollback ---");

    /**
     * IMPORTANT:
     *
     * Do NOT reuse:
     *
     * paymentA + invoiceA2
     *
     * because that pair already has allocationA2.
     *
     * The payment/invoice pair must be unique so that the
     * allocation can actually be created inside the transaction.
     */

    const rollbackPayment = await createPayment({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      totalAmount: 100,
      status: "COMPLETED",
      receivedBy: organisationA.userId,
    });

    const rollbackInvoice = await createInvoice({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      invoiceDate: "2026-09-04T10:20:00Z",
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 100,
      status: "COMPLETED",
      notes: "Rollback allocation test invoice",
      createdBy: organisationA.userId,
    });

    const transactionClient = await pool.connect();

    try {
      await transactionClient.query("BEGIN");

      const rollbackAllocation = await createPaymentAllocation({
        organisationId: organisationA.organisationId,
        paymentId: rollbackPayment.id,
        invoiceId: rollbackInvoice.id,
        allocatedAmount: 100,
        client: transactionClient,
      });

      rollbackAllocationId = rollbackAllocation.id;

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

    const rolledBackAllocation = await getPaymentAllocationById(
      organisationA.organisationId,
      rollbackAllocationId,
    );

    assert(
      rolledBackAllocation === null,
      "Allocation created in rolled-back transaction must not persist.",
    );

    /**
     * Verify that the payment/invoice pair itself still exists.
     *
     * The repository transaction should have rolled back only
     * the allocation, because the payment and invoice were
     * created before BEGIN.
     */
    const rollbackPaymentCheck = await pool.query(
      `
        SELECT id
        FROM payments
        WHERE id = $1
          AND organisation_id = $2;
      `,
      [rollbackPayment.id, organisationA.organisationId],
    );

    assert(
      rollbackPaymentCheck.rowCount === 1,
      "Rollback test payment should still exist.",
    );

    const rollbackInvoiceCheck = await pool.query(
      `
        SELECT id
        FROM invoices
        WHERE id = $1
          AND organisation_id = $2;
      `,
      [rollbackInvoice.id, organisationA.organisationId],
    );

    assert(
      rollbackInvoiceCheck.rowCount === 1,
      "Rollback test invoice should still exist.",
    );

    console.log("Caller-owned transaction rollback verified.");

    // ========================================================
    // 27. CREATE TEMPORARY ALLOCATION FOR DELETE TEST
    // ========================================================

    console.log("--- Creating temporary allocation for deletion test ---");

    /**
     * Create a completely new payment/invoice pair.
     *
     * This is intentionally independent from allocationA1/A2/A3.
     */
    const temporaryPayment = await createPayment({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      totalAmount: 500,
      status: "COMPLETED",
      receivedBy: organisationA.userId,
    });

    const temporaryInvoice = await createInvoice({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      invoiceDate: "2026-09-04T10:30:00Z",
      subtotal: 500,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 500,
      status: "COMPLETED",
      notes: "Temporary allocation delete test invoice",
      createdBy: organisationA.userId,
    });

    const temporaryAllocation = await createPaymentAllocation({
      organisationId: organisationA.organisationId,
      paymentId: temporaryPayment.id,
      invoiceId: temporaryInvoice.id,
      allocatedAmount: 500,
    });

    temporaryAllocationId = temporaryAllocation.id;

    assert(
      temporaryAllocation.payment_id === temporaryPayment.id,
      "Temporary allocation should reference temporary payment.",
    );

    assert(
      temporaryAllocation.invoice_id === temporaryInvoice.id,
      "Temporary allocation should reference temporary invoice.",
    );

    // ========================================================
    // 28. CROSS-TENANT DELETE
    // ========================================================

    console.log("--- Testing cross-tenant allocation deletion ---");

    const crossTenantDelete = await deletePaymentAllocation(
      organisationB.organisationId,
      temporaryAllocation.id,
    );

    assert(
      crossTenantDelete === false,
      "Organisation B must not delete Organisation A allocation.",
    );

    // Verify that the allocation still exists.
    const allocationAfterCrossTenantDelete = await getPaymentAllocationById(
      organisationA.organisationId,
      temporaryAllocation.id,
    );

    assert(
      allocationAfterCrossTenantDelete !== null,
      "Cross-tenant delete must not remove the allocation.",
    );

    // ========================================================
    // 29. DELETE ALLOCATION
    // ========================================================

    console.log("--- Deleting payment allocation ---");

    const deleted = await deletePaymentAllocation(
      organisationA.organisationId,
      temporaryAllocation.id,
    );

    assert(
      deleted === true,
      "Existing allocation should be deleted successfully.",
    );

    const deletedAllocation = await getPaymentAllocationById(
      organisationA.organisationId,
      temporaryAllocation.id,
    );

    assert(
      deletedAllocation === null,
      "Deleted allocation should return null.",
    );

    console.log("Payment allocation deletion successful.");

    // ========================================================
    // 30. DELETE NON-EXISTENT ALLOCATION
    // ========================================================

    console.log("--- Testing deletion of non-existent allocation ---");

    const deleteAgain = await deletePaymentAllocation(
      organisationA.organisationId,
      temporaryAllocation.id,
    );

    assert(
      deleteAgain === false,
      "Deleting a non-existent allocation should return false.",
    );

    // ========================================================
    // 31. PARENT PAYMENT CASCADE
    // ========================================================

    console.log("--- Testing parent payment cascade deletion ---");

    /**
     * Create a dedicated payment/invoice pair for cascade
     * testing.
     */
    const cascadePayment = await createPayment({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      totalAmount: 800,
      status: "COMPLETED",
      receivedBy: organisationA.userId,
    });

    const cascadeInvoice = await createInvoice({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      invoiceDate: "2026-09-04T10:40:00Z",
      subtotal: 800,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 800,
      status: "COMPLETED",
      notes: "Cascade allocation test invoice",
      createdBy: organisationA.userId,
    });

    const cascadeAllocation = await createPaymentAllocation({
      organisationId: organisationA.organisationId,
      paymentId: cascadePayment.id,
      invoiceId: cascadeInvoice.id,
      allocatedAmount: 800,
    });

    /**
     * Verify allocation exists before deleting parent.
     */
    const cascadeAllocationBeforeDelete = await getPaymentAllocationById(
      organisationA.organisationId,
      cascadeAllocation.id,
    );

    assert(
      cascadeAllocationBeforeDelete !== null,
      "Cascade allocation should exist before parent deletion.",
    );

    /**
     * Delete parent payment directly.
     *
     * Schema:
     *
     * payment_allocations.payment_id
     *     REFERENCES payments(id)
     *     ON DELETE CASCADE
     *
     * Therefore the allocation should disappear.
     */
    const cascadeDelete = await pool.query(
      `
        DELETE FROM payments
        WHERE id = $1
          AND organisation_id = $2
        RETURNING id;
      `,
      [cascadePayment.id, organisationA.organisationId],
    );

    assert(
      cascadeDelete.rowCount === 1,
      "Cascade test payment should be deleted.",
    );

    const cascadeAllocationAfterDelete = await getPaymentAllocationById(
      organisationA.organisationId,
      cascadeAllocation.id,
    );

    assert(
      cascadeAllocationAfterDelete === null,
      "Allocation should be removed when its parent payment is deleted.",
    );

    console.log("Parent payment cascade deletion verified.");

    // ========================================================
    // 32. FINAL PAYMENT ALLOCATION STATE
    // ========================================================

    console.log("--- Verifying final allocation state ---");

    const finalPaymentAAllocations = await getPaymentAllocationsByPayment(
      organisationA.organisationId,
      paymentA.id,
    );

    assert(
      finalPaymentAAllocations.length === 2,
      "Payment A should retain its two intended allocations.",
    );

    const finalPaymentAAllocationTotal = finalPaymentAAllocations.reduce(
      (total, allocation) => total + Number(allocation.allocated_amount),
      0,
    );

    /**
     * allocationA1 = ₹5,000
     * allocationA2 = ₹1,800
     *
     * allocationA2 was changed from ₹2,000 to ₹1,800
     * during test 19.
     *
     * Therefore Payment A currently has:
     *
     * ₹5,000 + ₹1,800 = ₹6,800
     */
    assert(
      finalPaymentAAllocationTotal === 6800,
      "Payment A allocations should total ₹6,800 after the update.",
    );

    const finalInvoiceA1Allocations = await getPaymentAllocationsByInvoice(
      organisationA.organisationId,
      invoiceA1.id,
    );

    assert(
      finalInvoiceA1Allocations.length === 2,
      "Invoice A1 should retain two payment allocations.",
    );

    const finalInvoiceA1Total = finalInvoiceA1Allocations.reduce(
      (total, allocation) => total + Number(allocation.allocated_amount),
      0,
    );

    /**
     * allocationA1 = ₹5,000
     * allocationA3 = ₹1,000
     *
     * Total = ₹6,000
     */
    assert(
      finalInvoiceA1Total === 6000,
      "Invoice A1 should have ₹6,000 allocated.",
    );

    // ========================================================
    // 33. FINAL TENANT ISOLATION
    // ========================================================

    console.log("--- Verifying final tenant isolation ---");

    const organisationBPaymentAllocations =
      await getPaymentAllocationsByPayment(
        organisationB.organisationId,
        paymentB.id,
      );

    assert(
      organisationBPaymentAllocations.length === 0,
      "Organisation B payment should have no allocations.",
    );

    const organisationBInvoiceAllocations =
      await getPaymentAllocationsByInvoice(
        organisationB.organisationId,
        invoiceB.id,
      );

    assert(
      organisationBInvoiceAllocations.length === 0,
      "Organisation B invoice should have no allocations.",
    );

    // ========================================================
    // SUCCESS
    // ========================================================

    console.log("");
    console.log("==========================================================");
    console.log("PAYMENT ALLOCATION REPOSITORY TEST PASSED");
    console.log("==========================================================");

    console.log("✓ Allocation creation");
    console.log("✓ One payment → multiple invoices");
    console.log("✓ One invoice → multiple payments");
    console.log("✓ Allocation lookup by ID");
    console.log("✓ Allocation lookup by payment");
    console.log("✓ Allocation lookup by invoice");
    console.log("✓ Allocation detail lookup");
    console.log("✓ Tenant isolation");
    console.log("✓ Cross-tenant creation protection");
    console.log("✓ Mixed-tenant payment/invoice protection");
    console.log("✓ Duplicate allocation protection");
    console.log("✓ Positive allocation constraint");
    console.log("✓ Allocation update");
    console.log("✓ Immutable payment relationship");
    console.log("✓ Immutable invoice relationship");
    console.log("✓ Empty update");
    console.log("✓ Invalid update amount");
    console.log("✓ Cross-tenant update protection");
    console.log("✓ Caller-owned transaction rollback");
    console.log("✓ Cross-tenant delete protection");
    console.log("✓ Allocation deletion");
    console.log("✓ Parent payment cascade deletion");
    console.log("✓ Final allocation state");
    console.log("✓ Final tenant isolation");
  } catch (error) {
    console.error("");
    console.error("Payment allocation repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    // ========================================================
    // CLEAN PAYMENT ALLOCATIONS
    // ========================================================

    console.log("--- Cleaning payment allocations ---");

    if (organisationA && organisationA.organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM payment_allocations pa
            USING payments p
            WHERE pa.payment_id = p.id
              AND p.organisation_id = $1;
          `,
          [organisationA.organisationId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation A allocation cleanup failed:",
          cleanupError.message,
        );
      }
    }

    if (organisationB && organisationB.organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM payment_allocations pa
            USING payments p
            WHERE pa.payment_id = p.id
              AND p.organisation_id = $1;
          `,
          [organisationB.organisationId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation B allocation cleanup failed:",
          cleanupError.message,
        );
      }
    }

    // ========================================================
    // CLEAN PAYMENTS
    // ========================================================

    console.log("--- Cleaning payments ---");

    if (organisationA && organisationA.organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM payments
            WHERE organisation_id = $1;
          `,
          [organisationA.organisationId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation A payment cleanup failed:",
          cleanupError.message,
        );
      }
    }

    if (organisationB && organisationB.organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM payments
            WHERE organisation_id = $1;
          `,
          [organisationB.organisationId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation B payment cleanup failed:",
          cleanupError.message,
        );
      }
    }

    // ========================================================
    // CLEAN INVOICES
    // ========================================================

    console.log("--- Cleaning invoices ---");

    if (organisationA && organisationA.organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM invoices
            WHERE organisation_id = $1;
          `,
          [organisationA.organisationId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation A invoice cleanup failed:",
          cleanupError.message,
        );
      }
    }

    if (organisationB && organisationB.organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM invoices
            WHERE organisation_id = $1;
          `,
          [organisationB.organisationId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation B invoice cleanup failed:",
          cleanupError.message,
        );
      }
    }

    // ========================================================
    // CLEAN ORGANISATIONS
    // ========================================================

    console.log("--- Cleaning organisations ---");

    if (organisationA && organisationA.organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM organisations
            WHERE id = $1;
          `,
          [organisationA.organisationId],
        );
      } catch (cleanupError) {
        console.error("Organisation A cleanup failed:", cleanupError.message);
      }
    }

    if (organisationB && organisationB.organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM organisations
            WHERE id = $1;
          `,
          [organisationB.organisationId],
        );
      } catch (cleanupError) {
        console.error("Organisation B cleanup failed:", cleanupError.message);
      }
    }

    // ========================================================
    // CLEAN USERS
    // ========================================================

    console.log("--- Cleaning users ---");

    if (organisationA && organisationA.userId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [organisationA.userId],
        );
      } catch (cleanupError) {
        console.error("User A cleanup failed:", cleanupError.message);
      }
    }

    if (organisationB && organisationB.userId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [organisationB.userId],
        );
      } catch (cleanupError) {
        console.error("User B cleanup failed:", cleanupError.message);
      }
    }

    await pool.end();
  }
};

runTests();

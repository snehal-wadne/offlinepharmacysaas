/**
 * Customer Ledger Repository Integration Test
 *
 * Verifies:
 *
 * - ledger entry creation
 * - invoice debit entries
 * - payment credit entries
 * - return credit entries
 * - adjustment debit entries
 * - adjustment credit entries
 * - customer ownership validation
 * - branch ownership validation
 * - lookup by ID
 * - customer statement lookup
 * - branch lookup
 * - organisation lookup
 * - reference lookup
 * - latest customer ledger entry
 * - tenant isolation
 * - debit/credit constraint
 * - valid entry/reference types
 * - caller-owned transaction rollback
 * - deletion
 *
 * Requires:
 * - PostgreSQL running
 * - current schema.sql applied
 *
 * Run:
 *
 *     node src/tests/customer-ledger.repository.test.js
 */

const assert = require("assert");

const { pool } = require("../db/connection");

const { createCustomer } = require("../repositories/customer.repository");

const {
  ENTRY_TYPES,
  REFERENCE_TYPES,
  createCustomerLedgerEntry,
  getCustomerLedgerEntryById,
  getCustomerLedgerEntriesByCustomer,
  getCustomerLedgerEntriesByBranch,
  getCustomerLedgerEntriesByOrganisation,
  getCustomerLedgerEntriesByReference,
  getLatestCustomerLedgerEntry,
  deleteCustomerLedgerEntry,
} = require("../repositories/customer-ledger.repository");

/**
 * Unique test suffix.
 */
const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Simple assertion helper.
 */
const assertValue = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

/**
 * Assert an async operation rejects.
 */
const assertRejected = async (operation, expectedMessage) => {
  let error = null;

  try {
    await operation();
  } catch (caughtError) {
    error = caughtError;
  }

  assertValue(
    error !== null,
    `Expected operation to reject with "${expectedMessage}".`,
  );

  assertValue(
    error.message.includes(expectedMessage),
    `Expected error containing "${expectedMessage}", got "${error.message}".`,
  );
};

/**
 * Create test organisation + user + membership.
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
      `ledger-${label}-${uniqueSuffix}@example.com`,
      "test-password-hash",
      `Customer Ledger Test User ${label}`,
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
    [userId, `Customer Ledger Test Organisation ${label} ${uniqueSuffix}`],
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
 * Create test branch.
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
    [organisationId, `Ledger Branch ${label} ${uniqueSuffix}`],
  );

  return result.rows[0].id;
};

/**
 * Main test.
 */
const runTests = async () => {
  let organisationA = null;
  let organisationB = null;

  let branchA1 = null;
  let branchA2 = null;
  let branchB1 = null;

  let customerA = null;
  let customerA2 = null;
  let customerB = null;

  let invoiceReferenceId = null;
  let paymentReferenceId = null;
  let returnReferenceId = null;
  let adjustmentReferenceId = null;

  let invoiceEntry = null;
  let paymentEntry = null;
  let returnEntry = null;
  let adjustmentDebitEntry = null;
  let adjustmentCreditEntry = null;

  let rollbackEntryId = null;
  let deleteEntryId = null;

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

    branchA1 = await createTestBranch(organisationA.organisationId, "A1");

    branchA2 = await createTestBranch(organisationA.organisationId, "A2");

    branchB1 = await createTestBranch(organisationB.organisationId, "B1");

    // ========================================================
    // 3. CREATE CUSTOMERS
    // ========================================================

    console.log("--- Creating test customers ---");

    customerA = await createCustomer({
      organisationId: organisationA.organisationId,
      fullName: `Ledger Customer A ${uniqueSuffix}`,
      phone: "9555555555",
    });

    customerA2 = await createCustomer({
      organisationId: organisationA.organisationId,
      fullName: `Ledger Customer A2 ${uniqueSuffix}`,
      phone: "9666666666",
    });

    customerB = await createCustomer({
      organisationId: organisationB.organisationId,
      fullName: `Ledger Customer B ${uniqueSuffix}`,
      phone: "9777777777",
    });

    // ========================================================
    // 4. CREATE REFERENCE IDS
    // ========================================================

    console.log("--- Creating source reference identifiers ---");

    /**
     * The ledger schema deliberately does not FK reference_id.
     *
     * These UUIDs therefore represent source transaction IDs.
     * Actual source validation belongs to the service layer.
     */
    const referenceResult = await pool.query(
      `
        SELECT
            gen_random_uuid() AS invoice_id,
            gen_random_uuid() AS payment_id,
            gen_random_uuid() AS return_id,
            gen_random_uuid() AS adjustment_id;
      `,
    );

    invoiceReferenceId = referenceResult.rows[0].invoice_id;

    paymentReferenceId = referenceResult.rows[0].payment_id;

    returnReferenceId = referenceResult.rows[0].return_id;

    adjustmentReferenceId = referenceResult.rows[0].adjustment_id;

    // ========================================================
    // 5. CREATE INVOICE DEBIT
    // ========================================================

    console.log("--- Creating invoice debit ledger entry ---");

    invoiceEntry = await createCustomerLedgerEntry({
      organisationId: organisationA.organisationId,
      customerId: customerA.id,
      branchId: branchA1,
      entryType: "INVOICE",
      referenceType: "INVOICE",
      referenceId: invoiceReferenceId,
      debitAmount: 5000,
      creditAmount: 0,
      balanceAfter: 5000,
      entryDate: "2026-09-05T10:00:00Z",
      description: "Invoice debit",
    });

    assertValue(invoiceEntry.id, "Invoice ledger entry should have an ID.");

    assertValue(
      invoiceEntry.organisation_id === organisationA.organisationId,
      "Invoice ledger entry should belong to Organisation A.",
    );

    assertValue(
      invoiceEntry.customer_id === customerA.id,
      "Invoice ledger entry should belong to Customer A.",
    );

    assertValue(
      Number(invoiceEntry.debit_amount) === 5000,
      "Invoice debit should be ₹5,000.",
    );

    assertValue(
      Number(invoiceEntry.credit_amount) === 0,
      "Invoice credit should be zero.",
    );

    assertValue(
      Number(invoiceEntry.balance_after) === 5000,
      "Invoice balance_after should be ₹5,000.",
    );

    // ========================================================
    // 6. CREATE PAYMENT CREDIT
    // ========================================================

    console.log("--- Creating payment credit ledger entry ---");

    paymentEntry = await createCustomerLedgerEntry({
      organisationId: organisationA.organisationId,
      customerId: customerA.id,
      branchId: branchA1,
      entryType: "PAYMENT",
      referenceType: "PAYMENT",
      referenceId: paymentReferenceId,
      debitAmount: 0,
      creditAmount: 2000,
      balanceAfter: 3000,
      entryDate: "2026-09-05T10:05:00Z",
      description: "Payment received",
    });

    assertValue(
      Number(paymentEntry.credit_amount) === 2000,
      "Payment credit should be ₹2,000.",
    );

    assertValue(
      Number(paymentEntry.balance_after) === 3000,
      "Payment balance_after should be ₹3,000.",
    );

    // ========================================================
    // 7. CREATE RETURN CREDIT
    // ========================================================

    console.log("--- Creating return credit ledger entry ---");

    returnEntry = await createCustomerLedgerEntry({
      organisationId: organisationA.organisationId,
      customerId: customerA.id,
      branchId: branchA1,
      entryType: "RETURN",
      referenceType: "RETURN",
      referenceId: returnReferenceId,
      debitAmount: 0,
      creditAmount: 500,
      balanceAfter: 2500,
      entryDate: "2026-09-05T10:10:00Z",
      description: "Customer return",
    });

    assertValue(
      returnEntry.entry_type === "RETURN",
      "Return entry type should be RETURN.",
    );

    assertValue(
      Number(returnEntry.credit_amount) === 500,
      "Return should be a ₹500 credit.",
    );

    // ========================================================
    // 8. CREATE ADJUSTMENT DEBIT
    // ========================================================

    console.log("--- Creating adjustment debit ledger entry ---");

    adjustmentDebitEntry = await createCustomerLedgerEntry({
      organisationId: organisationA.organisationId,
      customerId: customerA.id,
      branchId: branchA2,
      entryType: "ADJUSTMENT",
      referenceType: "ADJUSTMENT",
      referenceId: adjustmentReferenceId,
      debitAmount: 250,
      creditAmount: 0,
      balanceAfter: 2750,
      entryDate: "2026-09-05T10:15:00Z",
      description: "Debit adjustment",
    });

    assertValue(
      Number(adjustmentDebitEntry.debit_amount) === 250,
      "Adjustment debit should be ₹250.",
    );

    // ========================================================
    // 9. CREATE ADJUSTMENT CREDIT
    // ========================================================

    console.log("--- Creating adjustment credit ledger entry ---");

    /**
     * Use a different reference UUID because the schema does not
     * prohibit multiple entries for the same reference.
     */
    const adjustmentCreditReferenceResult = await pool.query(
      `SELECT gen_random_uuid() AS id;`,
    );

    const adjustmentCreditReferenceId =
      adjustmentCreditReferenceResult.rows[0].id;

    adjustmentCreditEntry = await createCustomerLedgerEntry({
      organisationId: organisationA.organisationId,
      customerId: customerA.id,
      branchId: branchA2,
      entryType: "ADJUSTMENT",
      referenceType: "ADJUSTMENT",
      referenceId: adjustmentCreditReferenceId,
      debitAmount: 0,
      creditAmount: 250,
      balanceAfter: 2500,
      entryDate: "2026-09-05T10:20:00Z",
      description: "Credit adjustment",
    });

    assertValue(
      Number(adjustmentCreditEntry.credit_amount) === 250,
      "Adjustment credit should be ₹250.",
    );

    // ========================================================
    // 10. GET BY ID
    // ========================================================

    console.log("--- Getting ledger entry by ID ---");

    const fetchedEntry = await getCustomerLedgerEntryById(
      organisationA.organisationId,
      invoiceEntry.id,
    );

    assertValue(fetchedEntry !== null, "Ledger entry should be found by ID.");

    assertValue(
      fetchedEntry.id === invoiceEntry.id,
      "Fetched ledger ID should match.",
    );

    assertValue(
      fetchedEntry.reference_id === invoiceReferenceId,
      "Fetched reference ID should match.",
    );

    console.log("Ledger entry lookup by ID successful.");

    // ========================================================
    // 11. TENANT ISOLATION BY ID
    // ========================================================

    console.log("--- Testing ledger entry tenant isolation ---");

    const leakedEntry = await getCustomerLedgerEntryById(
      organisationB.organisationId,
      invoiceEntry.id,
    );

    assertValue(
      leakedEntry === null,
      "Organisation B must not retrieve Organisation A ledger entry.",
    );

    console.log("Ledger ID tenant isolation verified.");

    // ========================================================
    // 12. CUSTOMER STATEMENT
    // ========================================================

    console.log("--- Getting customer ledger statement ---");

    const customerEntries = await getCustomerLedgerEntriesByCustomer(
      organisationA.organisationId,
      customerA.id,
    );

    assertValue(
      customerEntries.length === 5,
      "Customer A should have five ledger entries.",
    );

    assertValue(
      customerEntries[0].entry_date >= customerEntries[1].entry_date,
      "Customer ledger should be ordered newest first.",
    );

    const customerEntryIds = customerEntries.map((entry) => entry.id);

    assertValue(
      customerEntryIds.includes(invoiceEntry.id),
      "Customer statement should contain invoice entry.",
    );

    assertValue(
      customerEntryIds.includes(paymentEntry.id),
      "Customer statement should contain payment entry.",
    );

    assertValue(
      customerEntryIds.includes(returnEntry.id),
      "Customer statement should contain return entry.",
    );

    console.log("Customer ledger statement successful.");

    // ========================================================
    // 13. CUSTOMER LIST TENANT ISOLATION
    // ========================================================

    console.log("--- Testing customer ledger tenant isolation ---");

    await assertRejected(
      () =>
        getCustomerLedgerEntriesByCustomer(
          organisationB.organisationId,
          customerA.id,
        ),
      "Customer does not belong to the specified organisation.",
    );

    console.log("Customer ledger tenant isolation verified.");

    // ========================================================
    // 14. BRANCH LEDGER
    // ========================================================

    console.log("--- Getting branch ledger ---");

    const branchA1Entries = await getCustomerLedgerEntriesByBranch(
      organisationA.organisationId,
      branchA1,
    );

    assertValue(
      branchA1Entries.length === 3,
      "Branch A1 should contain three ledger entries.",
    );

    assertValue(
      branchA1Entries.every((entry) => entry.branch_id === branchA1),
      "Branch ledger must contain only entries from that branch.",
    );

    console.log("Branch ledger lookup successful.");

    // ========================================================
    // 15. BRANCH TENANT ISOLATION
    // ========================================================

    console.log("--- Testing branch ledger tenant isolation ---");

    await assertRejected(
      () =>
        getCustomerLedgerEntriesByBranch(
          organisationB.organisationId,
          branchA1,
        ),
      "Branch does not belong to the specified organisation.",
    );

    // ========================================================
    // 16. ORGANISATION LEDGER
    // ========================================================

    console.log("--- Getting organisation ledger ---");

    const organisationEntries = await getCustomerLedgerEntriesByOrganisation(
      organisationA.organisationId,
    );

    assertValue(
      organisationEntries.length === 5,
      "Organisation A should have five ledger entries.",
    );

    assertValue(
      organisationEntries.every(
        (entry) => entry.organisation_id === organisationA.organisationId,
      ),
      "Organisation ledger must contain only Organisation A entries.",
    );

    console.log("Organisation ledger lookup successful.");

    // ========================================================
    // 17. ORGANISATION TENANT ISOLATION
    // ========================================================

    console.log("--- Testing organisation ledger tenant isolation ---");

    const organisationBEntries = await getCustomerLedgerEntriesByOrganisation(
      organisationB.organisationId,
    );

    assertValue(
      organisationBEntries.length === 0,
      "Organisation B should have no ledger entries.",
    );

    // ========================================================
    // 18. REFERENCE LOOKUP
    // ========================================================

    console.log("--- Getting ledger entries by reference ---");

    const invoiceReferenceEntries = await getCustomerLedgerEntriesByReference(
      organisationA.organisationId,
      "INVOICE",
      invoiceReferenceId,
    );

    assertValue(
      invoiceReferenceEntries.length === 1,
      "Invoice reference should return one ledger entry.",
    );

    assertValue(
      invoiceReferenceEntries[0].id === invoiceEntry.id,
      "Reference lookup should return invoice entry.",
    );

    console.log("Reference lookup successful.");

    // ========================================================
    // 19. REFERENCE TENANT ISOLATION
    // ========================================================

    console.log("--- Testing reference lookup tenant isolation ---");

    const leakedReferenceEntries = await getCustomerLedgerEntriesByReference(
      organisationB.organisationId,
      "INVOICE",
      invoiceReferenceId,
    );

    assertValue(
      leakedReferenceEntries.length === 0,
      "Organisation B must not retrieve Organisation A reference entries.",
    );

    // ========================================================
    // 20. LATEST CUSTOMER ENTRY
    // ========================================================

    console.log("--- Getting latest customer ledger entry ---");

    const latestEntry = await getLatestCustomerLedgerEntry(
      organisationA.organisationId,
      customerA.id,
    );

    assertValue(
      latestEntry !== null,
      "Latest customer ledger entry should exist.",
    );

    assertValue(
      latestEntry.id === adjustmentCreditEntry.id,
      "Latest entry should be the newest adjustment credit.",
    );

    assertValue(
      Number(latestEntry.balance_after) === 2500,
      "Latest balance_after should be ₹2,500.",
    );

    console.log("Latest customer ledger entry successful.");

    // ========================================================
    // 21. INVALID ENTRY TYPE
    // ========================================================

    console.log("--- Testing invalid entry type ---");

    await assertRejected(
      () =>
        createCustomerLedgerEntry({
          organisationId: organisationA.organisationId,
          customerId: customerA.id,
          branchId: branchA1,
          entryType: "INVALID",
          referenceType: "INVOICE",
          referenceId: invoiceReferenceId,
          debitAmount: 100,
          creditAmount: 0,
          balanceAfter: 2600,
        }),
      "Invalid entryType.",
    );

    // ========================================================
    // 22. INVALID REFERENCE TYPE
    // ========================================================

    console.log("--- Testing invalid reference type ---");

    await assertRejected(
      () =>
        createCustomerLedgerEntry({
          organisationId: organisationA.organisationId,
          customerId: customerA.id,
          branchId: branchA1,
          entryType: "INVOICE",
          referenceType: "INVALID",
          referenceId: invoiceReferenceId,
          debitAmount: 100,
          creditAmount: 0,
          balanceAfter: 2600,
        }),
      "Invalid referenceType.",
    );

    // ========================================================
    // 23. BOTH DEBIT AND CREDIT
    // ========================================================

    console.log("--- Testing debit/credit one-side constraint ---");

    await assertRejected(
      () =>
        createCustomerLedgerEntry({
          organisationId: organisationA.organisationId,
          customerId: customerA.id,
          branchId: branchA1,
          entryType: "ADJUSTMENT",
          referenceType: "ADJUSTMENT",
          referenceId: adjustmentReferenceId,
          debitAmount: 100,
          creditAmount: 100,
          balanceAfter: 2500,
        }),
      "customer_ledger_one_side_check",
    );

    // ========================================================
    // 24. BOTH ZERO
    // ========================================================

    console.log("--- Testing zero debit/credit constraint ---");

    await assertRejected(
      () =>
        createCustomerLedgerEntry({
          organisationId: organisationA.organisationId,
          customerId: customerA.id,
          branchId: branchA1,
          entryType: "ADJUSTMENT",
          referenceType: "ADJUSTMENT",
          referenceId: adjustmentReferenceId,
          debitAmount: 0,
          creditAmount: 0,
          balanceAfter: 2500,
        }),
      "customer_ledger_one_side_check",
    );

    // ========================================================
    // 25. NEGATIVE DEBIT
    // ========================================================

    console.log("--- Testing negative debit constraint ---");

    await assertRejected(
      () =>
        createCustomerLedgerEntry({
          organisationId: organisationA.organisationId,
          customerId: customerA.id,
          branchId: branchA1,
          entryType: "ADJUSTMENT",
          referenceType: "ADJUSTMENT",
          referenceId: adjustmentReferenceId,
          debitAmount: -100,
          creditAmount: 0,
          balanceAfter: 2400,
        }),
      "customer_ledger_debit_check",
    );

    // ========================================================
    // 26. NEGATIVE CREDIT
    // ========================================================

    console.log("--- Testing negative credit constraint ---");

    await assertRejected(
      () =>
        createCustomerLedgerEntry({
          organisationId: organisationA.organisationId,
          customerId: customerA.id,
          branchId: branchA1,
          entryType: "ADJUSTMENT",
          referenceType: "ADJUSTMENT",
          referenceId: adjustmentReferenceId,
          debitAmount: 0,
          creditAmount: -100,
          balanceAfter: 2600,
        }),
      "customer_ledger_credit_check",
    );

    // ========================================================
    // 27. CROSS-TENANT CUSTOMER CREATION
    // ========================================================

    console.log("--- Testing cross-tenant customer protection ---");

    await assertRejected(
      () =>
        createCustomerLedgerEntry({
          organisationId: organisationB.organisationId,
          customerId: customerA.id,
          branchId: branchB1,
          entryType: "INVOICE",
          referenceType: "INVOICE",
          referenceId: invoiceReferenceId,
          debitAmount: 100,
          creditAmount: 0,
          balanceAfter: 100,
        }),
      "Customer does not belong to the specified organisation.",
    );

    // ========================================================
    // 28. CROSS-TENANT BRANCH CREATION
    // ========================================================

    console.log("--- Testing cross-tenant branch protection ---");

    await assertRejected(
      () =>
        createCustomerLedgerEntry({
          organisationId: organisationA.organisationId,
          customerId: customerA.id,
          branchId: branchB1,
          entryType: "INVOICE",
          referenceType: "INVOICE",
          referenceId: invoiceReferenceId,
          debitAmount: 100,
          creditAmount: 0,
          balanceAfter: 2600,
        }),
      "Branch does not belong to the specified organisation.",
    );

    // ========================================================
    // 29. NULL BRANCH
    // ========================================================

    console.log("--- Testing organisation-level ledger entry ---");

    const noBranchReferenceResult = await pool.query(
      `SELECT gen_random_uuid() AS id;`,
    );

    const noBranchEntry = await createCustomerLedgerEntry({
      organisationId: organisationA.organisationId,
      customerId: customerA2.id,
      branchId: null,
      entryType: "INVOICE",
      referenceType: "INVOICE",
      referenceId: noBranchReferenceResult.rows[0].id,
      debitAmount: 750,
      creditAmount: 0,
      balanceAfter: 750,
      description: "Organisation-level opening invoice",
    });

    assertValue(
      noBranchEntry.branch_id === null,
      "Branch should remain null when not supplied.",
    );

    // ========================================================
    // 30. CALLER-OWNED TRANSACTION ROLLBACK
    // ========================================================

    console.log("--- Testing caller-owned transaction rollback ---");

    const rollbackReferenceResult = await pool.query(
      `SELECT gen_random_uuid() AS id;`,
    );

    const transactionClient = await pool.connect();

    try {
      await transactionClient.query("BEGIN");

      const rollbackEntry = await createCustomerLedgerEntry({
        organisationId: organisationA.organisationId,
        customerId: customerA.id,
        branchId: branchA1,
        entryType: "PAYMENT",
        referenceType: "PAYMENT",
        referenceId: rollbackReferenceResult.rows[0].id,
        debitAmount: 0,
        creditAmount: 300,
        balanceAfter: 2200,
        description: "Rollback payment",
        client: transactionClient,
      });

      rollbackEntryId = rollbackEntry.id;

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

    const rolledBackEntry = await getCustomerLedgerEntryById(
      organisationA.organisationId,
      rollbackEntryId,
    );

    assertValue(
      rolledBackEntry === null,
      "Rolled-back ledger entry must not persist.",
    );

    console.log("Caller-owned transaction rollback verified.");

    // ========================================================
    // 31. CREATE ENTRY FOR DELETE TEST
    // ========================================================

    console.log("--- Creating temporary ledger entry for deletion test ---");

    const deleteReferenceResult = await pool.query(
      `SELECT gen_random_uuid() AS id;`,
    );

    const deleteEntry = await createCustomerLedgerEntry({
      organisationId: organisationA.organisationId,
      customerId: customerA2.id,
      branchId: branchA2,
      entryType: "ADJUSTMENT",
      referenceType: "ADJUSTMENT",
      referenceId: deleteReferenceResult.rows[0].id,
      debitAmount: 100,
      creditAmount: 0,
      balanceAfter: 850,
      description: "Temporary delete test entry",
    });

    deleteEntryId = deleteEntry.id;

    // ========================================================
    // 32. CROSS-TENANT DELETE
    // ========================================================

    console.log("--- Testing cross-tenant ledger deletion ---");

    const crossTenantDelete = await deleteCustomerLedgerEntry(
      organisationB.organisationId,
      deleteEntryId,
    );

    assertValue(
      crossTenantDelete === false,
      "Organisation B must not delete Organisation A ledger entry.",
    );

    const entryAfterCrossTenantDelete = await getCustomerLedgerEntryById(
      organisationA.organisationId,
      deleteEntryId,
    );

    assertValue(
      entryAfterCrossTenantDelete !== null,
      "Cross-tenant delete must not remove the ledger entry.",
    );

    // ========================================================
    // 33. DELETE ENTRY
    // ========================================================

    console.log("--- Deleting temporary ledger entry ---");

    const deleted = await deleteCustomerLedgerEntry(
      organisationA.organisationId,
      deleteEntryId,
    );

    assertValue(deleted === true, "Existing ledger entry should be deleted.");

    const deletedEntry = await getCustomerLedgerEntryById(
      organisationA.organisationId,
      deleteEntryId,
    );

    assertValue(
      deletedEntry === null,
      "Deleted ledger entry should return null.",
    );

    console.log("Ledger entry deletion successful.");

    // ========================================================
    // 34. DELETE NON-EXISTENT ENTRY
    // ========================================================

    console.log("--- Testing deletion of non-existent ledger entry ---");

    const deleteAgain = await deleteCustomerLedgerEntry(
      organisationA.organisationId,
      deleteEntryId,
    );

    assertValue(
      deleteAgain === false,
      "Deleting a non-existent ledger entry should return false.",
    );

    // ========================================================
    // 35. FINAL CUSTOMER STATEMENT
    // ========================================================

    console.log("--- Verifying final customer ledger state ---");

    const finalCustomerEntries = await getCustomerLedgerEntriesByCustomer(
      organisationA.organisationId,
      customerA.id,
    );

    /**
     * Customer A originally had:
     *
     * 5 permanent entries
     *
     * The rollback entry never persisted.
     *
     * Therefore Customer A must still have exactly five entries.
     */
    assertValue(
      finalCustomerEntries.length === 5,
      "Customer A should have exactly five persisted ledger entries.",
    );

    const finalCustomerIds = finalCustomerEntries.map((entry) => entry.id);

    assertValue(
      finalCustomerIds.includes(invoiceEntry.id),
      "Final ledger should contain invoice entry.",
    );

    assertValue(
      finalCustomerIds.includes(paymentEntry.id),
      "Final ledger should contain payment entry.",
    );

    assertValue(
      finalCustomerIds.includes(returnEntry.id),
      "Final ledger should contain return entry.",
    );

    assertValue(
      finalCustomerIds.includes(adjustmentDebitEntry.id),
      "Final ledger should contain debit adjustment.",
    );

    assertValue(
      finalCustomerIds.includes(adjustmentCreditEntry.id),
      "Final ledger should contain credit adjustment.",
    );

    // ========================================================
    // 36. FINAL ORGANISATION STATE
    // ========================================================

    console.log("--- Verifying final organisation ledger state ---");

    const finalOrganisationEntries =
      await getCustomerLedgerEntriesByOrganisation(
        organisationA.organisationId,
      );

    /**
     * Customer A = 5
     * Customer A2 = 1
     *
     * Total = 6
     */
    assertValue(
      finalOrganisationEntries.length === 6,
      "Organisation A should have six persisted ledger entries.",
    );

    // ========================================================
    // 37. FINAL TENANT ISOLATION
    // ========================================================

    console.log("--- Verifying final tenant isolation ---");

    const finalOrganisationBEntries =
      await getCustomerLedgerEntriesByOrganisation(
        organisationB.organisationId,
      );

    assertValue(
      finalOrganisationBEntries.length === 0,
      "Organisation B should still have zero ledger entries.",
    );

    // ========================================================
    // SUCCESS
    // ========================================================

    console.log("");
    console.log("==========================================================");
    console.log("CUSTOMER LEDGER REPOSITORY TEST PASSED");
    console.log("==========================================================");

    console.log("✓ Ledger entry creation");
    console.log("✓ Invoice debit");
    console.log("✓ Payment credit");
    console.log("✓ Return credit");
    console.log("✓ Adjustment debit");
    console.log("✓ Adjustment credit");
    console.log("✓ Lookup by ID");
    console.log("✓ Customer statement");
    console.log("✓ Branch ledger");
    console.log("✓ Organisation ledger");
    console.log("✓ Reference lookup");
    console.log("✓ Latest customer entry");
    console.log("✓ Tenant isolation");
    console.log("✓ Customer ownership validation");
    console.log("✓ Branch ownership validation");
    console.log("✓ Entry type validation");
    console.log("✓ Reference type validation");
    console.log("✓ Debit/credit one-side constraint");
    console.log("✓ Negative debit protection");
    console.log("✓ Negative credit protection");
    console.log("✓ Null branch support");
    console.log("✓ Caller-owned transaction rollback");
    console.log("✓ Cross-tenant deletion protection");
    console.log("✓ Ledger entry deletion");
    console.log("✓ Final ledger state");
  } catch (error) {
    console.error("");
    console.error("Customer ledger repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    // ========================================================
    // CLEAN LEDGER ENTRIES
    // ========================================================

    console.log("--- Cleaning customer ledger entries ---");

    if (organisationA && organisationA.organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM customer_ledger_entries
            WHERE organisation_id = $1;
          `,
          [organisationA.organisationId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation A ledger cleanup failed:",
          cleanupError.message,
        );
      }
    }

    if (organisationB && organisationB.organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM customer_ledger_entries
            WHERE organisation_id = $1;
          `,
          [organisationB.organisationId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation B ledger cleanup failed:",
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

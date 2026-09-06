/**
 * Return Repository Integration Test
 *
 * Verifies:
 *
 * - return creation
 * - branch-scoped return numbering
 * - organisation isolation
 * - branch validation
 * - customer validation
 * - invoice validation
 * - invoice/customer consistency
 * - invoice/branch consistency
 * - created-by validation
 * - processed-by validation
 * - get by ID
 * - tenant isolation by ID
 * - get by return number
 * - branch-scoped return-number isolation
 * - customer return history
 * - invoice return history
 * - branch return history
 * - organisation return history
 * - return search
 * - update
 * - status persistence
 * - refund method persistence
 * - immutable relationships
 * - empty update
 * - invalid database constraints
 * - cross-tenant update protection
 * - cross-tenant delete protection
 * - caller-owned transaction rollback
 * - sequence rollback
 * - deletion
 *
 * IMPORTANT:
 *
 * This test is for the return HEADER repository.
 *
 * return_items are intentionally not created here because
 * return-item.repository.js is a separate repository.
 *
 * Requires:
 * - PostgreSQL running
 * - current schema.sql applied
 * - number-sequence.repository.js updated to support RETURN
 *
 * Run:
 *
 *     node src/tests/return.repository.test.js
 */

const { pool } = require("../db/connection");

const { createCustomer } = require("../repositories/customer.repository");

const { createInvoice } = require("../repositories/invoice.repository");

const {
  createReturn,
  getReturnById,
  getReturnByNumber,
  getReturnsByCustomer,
  getReturnsByInvoice,
  getReturnsByBranch,
  getReturnsByOrganisation,
  searchReturns,
  updateReturn,
  deleteReturn,
} = require("../repositories/return.repository");

const {
  getNumberSequence,
} = require("../repositories/number-sequence.repository");

/**
 * Simple assertion helper.
 */
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

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
 * Generate isolated test values.
 */
const uniqueValue = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Create isolated test organisation.
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
      `return-${label}-${uniqueValue}@example.com`,
      "test-password-hash",
      `Return Test User ${label}`,
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
    [userId, `Return Test Organisation ${label} ${uniqueValue}`],
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
const createTestBranch = async (organisationId, name) => {
  const result = await pool.query(
    `
          INSERT INTO branches (
              organisation_id,
              name
          )
          VALUES ($1, $2)
          RETURNING id;
        `,
    [organisationId, `${name} ${uniqueValue}`],
  );

  return result.rows[0].id;
};

/**
 * Main test runner.
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

  let invoiceA1 = null;
  let invoiceA2 = null;
  let invoiceA2Branch = null;
  let invoiceB1 = null;

  let returnA1 = null;
  let returnA2 = null;
  let returnA2Branch = null;
  let returnB1 = null;

  let rollbackReturnId = null;
  let temporaryReturnId = null;

  try {
    // ==========================================================
    // 1. CREATE TEST ORGANISATIONS
    // ==========================================================

    console.log("--- Creating isolated test organisations ---");

    organisationA = await createTestOrganisation("A");

    organisationB = await createTestOrganisation("B");

    assert(
      organisationA.organisationId !== organisationB.organisationId,
      "Test organisations must be different.",
    );

    console.log("Test organisations created.");

    // ==========================================================
    // 2. CREATE TEST BRANCHES
    // ==========================================================

    console.log("--- Creating test branches ---");

    branchA1 = await createTestBranch(
      organisationA.organisationId,
      "Main Branch A1",
    );

    branchA2 = await createTestBranch(
      organisationA.organisationId,
      "Second Branch A2",
    );

    branchB1 = await createTestBranch(
      organisationB.organisationId,
      "Main Branch B1",
    );

    console.log("Test branches created.");

    // ==========================================================
    // 3. CREATE TEST CUSTOMERS
    // ==========================================================

    console.log("--- Creating test customers ---");

    customerA = await createCustomer({
      organisationId: organisationA.organisationId,

      fullName: `Return Customer A ${uniqueValue}`,

      phone: "9333333333",
    });

    customerA2 = await createCustomer({
      organisationId: organisationA.organisationId,

      fullName: `Return Customer A2 ${uniqueValue}`,

      phone: "9444444444",
    });

    customerB = await createCustomer({
      organisationId: organisationB.organisationId,

      fullName: `Return Customer B ${uniqueValue}`,

      phone: "9555555555",
    });

    console.log("Test customers created.");

    // ==========================================================
    // 4. CREATE TEST INVOICES
    // ==========================================================

    console.log("--- Creating test invoices ---");

    invoiceA1 = await createInvoice({
      organisationId: organisationA.organisationId,

      branchId: branchA1,

      customerId: customerA.id,

      subtotal: 1000,

      discountAmount: 0,

      taxAmount: 0,

      totalAmount: 1000,

      status: "COMPLETED",

      notes: "Return repository invoice A1",

      createdBy: organisationA.userId,
    });

    assert(
      invoiceA1.invoice_number === "INV-1001",
      "First A1 invoice should be INV-1001.",
    );

    invoiceA2 = await createInvoice({
      organisationId: organisationA.organisationId,

      branchId: branchA1,

      customerId: customerA.id,

      subtotal: 2000,

      discountAmount: 0,

      taxAmount: 0,

      totalAmount: 2000,

      status: "COMPLETED",

      notes: "Return repository invoice A2",

      createdBy: organisationA.userId,
    });

    assert(
      invoiceA2.invoice_number === "INV-1002",
      "Second A1 invoice should be INV-1002.",
    );

    invoiceA2Branch = await createInvoice({
      organisationId: organisationA.organisationId,

      branchId: branchA2,

      customerId: customerA.id,

      subtotal: 3000,

      discountAmount: 0,

      taxAmount: 0,

      totalAmount: 3000,

      status: "COMPLETED",

      notes: "Return repository invoice A2 branch",

      createdBy: organisationA.userId,
    });

    assert(
      invoiceA2Branch.invoice_number === "INV-1001",
      "Second branch should have independent INV-1001.",
    );

    invoiceB1 = await createInvoice({
      organisationId: organisationB.organisationId,

      branchId: branchB1,

      customerId: customerB.id,

      subtotal: 4000,

      discountAmount: 0,

      taxAmount: 0,

      totalAmount: 4000,

      status: "COMPLETED",

      notes: "Return repository invoice B1",

      createdBy: organisationB.userId,
    });

    assert(
      invoiceB1.invoice_number === "INV-1001",
      "Organisation B should have independent INV-1001.",
    );

    console.log("Test invoices created.");

    // ==========================================================
    // 5. CREATE FIRST RETURN
    // ==========================================================

    console.log("--- Creating first return ---");

    returnA1 = await createReturn({
      organisationId: organisationA.organisationId,

      branchId: branchA1,

      customerId: customerA.id,

      invoiceId: invoiceA1.id,

      returnDate: "2026-09-06T10:00:00Z",

      status: "PROCESSED",

      refundAmount: 100,

      refundMethod: "CASH",

      reason: "Incorrect medicine purchased",

      notes: "First return repository test",

      createdBy: organisationA.userId,

      processedBy: organisationA.userId,
    });

    assert(returnA1.id, "First return should have an ID.");

    assert(
      returnA1.organisation_id === organisationA.organisationId,
      "Return should belong to Organisation A.",
    );

    assert(
      returnA1.branch_id === branchA1,
      "Return should belong to Branch A1.",
    );

    assert(
      returnA1.customer_id === customerA.id,
      "Return should belong to Customer A.",
    );

    assert(
      returnA1.invoice_id === invoiceA1.id,
      "Return should reference Invoice A1.",
    );

    assert(
      returnA1.return_number === "RET-1001",
      "First return in Branch A1 should be RET-1001.",
    );

    assert(
      Number(returnA1.refund_amount) === 100,
      "First return refund amount should be 100.",
    );

    assert(returnA1.refund_method === "CASH", "First return should use CASH.");

    console.log("First return creation successful.");

    // ==========================================================
    // 6. CREATE SECOND RETURN SAME BRANCH
    // ==========================================================

    console.log("--- Creating second return in same branch ---");

    returnA2 = await createReturn({
      organisationId: organisationA.organisationId,

      branchId: branchA1,

      customerId: customerA.id,

      invoiceId: invoiceA2.id,

      returnDate: "2026-09-06T10:05:00Z",

      status: "PROCESSED",

      refundAmount: 200,

      refundMethod: "STORE_CREDIT",

      reason: "Customer changed requirement",

      notes: "Second return repository test",

      createdBy: organisationA.userId,

      processedBy: organisationA.userId,
    });

    assert(
      returnA2.id !== returnA1.id,
      "Second return must have a different UUID.",
    );

    assert(
      returnA2.return_number === "RET-1002",
      "Second return in Branch A1 should be RET-1002.",
    );

    assert(
      returnA2.refund_method === "STORE_CREDIT",
      "Second return should use STORE_CREDIT.",
    );

    console.log("Sequential branch-scoped return numbering verified.");

    // ==========================================================
    // 7. CREATE RETURN IN SECOND BRANCH
    // ==========================================================

    console.log("--- Creating return in second branch ---");

    returnA2Branch = await createReturn({
      organisationId: organisationA.organisationId,

      branchId: branchA2,

      customerId: customerA.id,

      invoiceId: invoiceA2Branch.id,

      returnDate: "2026-09-06T10:10:00Z",

      status: "PROCESSED",

      refundAmount: 300,

      refundMethod: "CASH",

      reason: "Branch-specific return test",

      notes: "Second branch return",

      createdBy: organisationA.userId,

      processedBy: organisationA.userId,
    });

    assert(
      returnA2Branch.return_number === "RET-1001",
      "Branch A2 should have an independent RET-1001.",
    );

    console.log("Branch-independent return numbering verified.");

    // ==========================================================
    // 8. CREATE RETURN IN ORGANISATION B
    // ==========================================================

    console.log("--- Creating return in Organisation B ---");

    returnB1 = await createReturn({
      organisationId: organisationB.organisationId,

      branchId: branchB1,

      customerId: customerB.id,

      invoiceId: invoiceB1.id,

      returnDate: "2026-09-06T10:15:00Z",

      status: "PROCESSED",

      refundAmount: 400,

      refundMethod: "STORE_CREDIT",

      reason: "Organisation B return",

      notes: "Tenant isolation return",

      createdBy: organisationB.userId,

      processedBy: organisationB.userId,
    });

    assert(
      returnB1.return_number === "RET-1001",
      "Organisation B should have independent RET-1001.",
    );

    console.log("Organisation-scoped numbering isolation verified.");

    // ==========================================================
    // 9. GET RETURN BY ID
    // ==========================================================

    console.log("--- Getting return by ID ---");

    const fetchedById = await getReturnById(
      organisationA.organisationId,
      returnA1.id,
    );

    assert(fetchedById !== null, "Return should be found by ID.");

    assert(fetchedById.id === returnA1.id, "Fetched return ID should match.");

    assert(
      fetchedById.return_number === "RET-1001",
      "Fetched return number should match.",
    );

    console.log("Return lookup by ID successful.");

    // ==========================================================
    // 10. TENANT ISOLATION BY ID
    // ==========================================================

    console.log("--- Testing return tenant isolation ---");

    const crossTenantById = await getReturnById(
      organisationB.organisationId,
      returnA1.id,
    );

    assert(
      crossTenantById === null,
      "Organisation B must not retrieve Organisation A return.",
    );

    console.log("Return tenant isolation verified.");

    // ==========================================================
    // 11. GET BY RETURN NUMBER
    // ==========================================================

    console.log("--- Getting return by number ---");

    const fetchedByNumber = await getReturnByNumber(
      organisationA.organisationId,
      branchA1,
      "RET-1001",
    );

    assert(
      fetchedByNumber !== null,
      "Return should be found by branch-scoped number.",
    );

    assert(
      fetchedByNumber.id === returnA1.id,
      "Return-number lookup should find Return A1.",
    );

    console.log("Return lookup by number successful.");

    // ==========================================================
    // 12. RETURN NUMBER BRANCH ISOLATION
    // ==========================================================

    console.log("--- Testing return-number branch isolation ---");

    const branchA2NumberBefore = await getReturnByNumber(
      organisationA.organisationId,
      branchA2,
      "RET-1001",
    );

    assert(
      branchA2NumberBefore.id === returnA2Branch.id,
      "Branch A2 should resolve its own RET-1001.",
    );

    assert(
      branchA2NumberBefore.id !== returnA1.id,
      "Branch A2 must not resolve Branch A1's return.",
    );

    console.log("Return-number branch isolation verified.");

    // ==========================================================
    // 13. GET RETURNS BY CUSTOMER
    // ==========================================================

    console.log("--- Getting returns by customer ---");

    const customerReturns = await getReturnsByCustomer(
      organisationA.organisationId,
      customerA.id,
    );

    assert(
      customerReturns.length === 3,
      "Customer A should have three returns.",
    );

    assert(
      customerReturns.every((item) => item.customer_id === customerA.id),
      "Customer return history should contain only Customer A returns.",
    );

    console.log("Customer return history successful.");

    // ==========================================================
    // 14. GET RETURNS BY INVOICE
    // ==========================================================

    console.log("--- Getting returns by invoice ---");

    const invoiceReturns = await getReturnsByInvoice(
      organisationA.organisationId,
      invoiceA1.id,
    );

    assert(invoiceReturns.length === 1, "Invoice A1 should have one return.");

    assert(
      invoiceReturns[0].id === returnA1.id,
      "Invoice return history should contain Return A1.",
    );

    console.log("Invoice return history successful.");

    // ==========================================================
    // 15. GET RETURNS BY BRANCH
    // ==========================================================

    console.log("--- Getting returns by branch ---");

    const branchReturns = await getReturnsByBranch(
      organisationA.organisationId,
      branchA1,
    );

    assert(branchReturns.length === 2, "Branch A1 should have two returns.");

    assert(
      branchReturns.every((item) => item.branch_id === branchA1),
      "Branch return history should contain only Branch A1 returns.",
    );

    console.log("Branch return history successful.");

    // ==========================================================
    // 16. GET RETURNS BY ORGANISATION
    // ==========================================================

    console.log("--- Getting returns by organisation ---");

    const organisationReturns = await getReturnsByOrganisation(
      organisationA.organisationId,
    );

    assert(
      organisationReturns.length === 3,
      "Organisation A should have three returns.",
    );

    assert(
      organisationReturns.every(
        (item) => item.organisation_id === organisationA.organisationId,
      ),
      "Organisation return history should remain tenant isolated.",
    );

    console.log("Organisation return history successful.");

    // ==========================================================
    // 17. TEST ORGANISATION LIST ISOLATION
    // ==========================================================

    console.log("--- Testing organisation return-list isolation ---");

    const organisationBReturns = await getReturnsByOrganisation(
      organisationB.organisationId,
    );

    assert(
      organisationBReturns.length === 1,
      "Organisation B should have exactly one return.",
    );

    assert(
      organisationBReturns[0].id === returnB1.id,
      "Organisation B list should contain only its own return.",
    );

    console.log("Organisation return-list isolation verified.");

    // ==========================================================
    // 18. SEARCH BY RETURN NUMBER
    // ==========================================================

    console.log("--- Searching returns by return number ---");

    const returnNumberResults = await searchReturns(
      organisationA.organisationId,
      "RET-1001",
    );

    assert(
      returnNumberResults.length === 2,
      "Organisation A should find both RET-1001 returns across branches.",
    );

    console.log("Return-number search successful.");

    // ==========================================================
    // 19. SEARCH BY INVOICE NUMBER
    // ==========================================================

    console.log("--- Searching returns by invoice number ---");

    const invoiceSearchResults = await searchReturns(
      organisationA.organisationId,
      "INV-1001",
    );

    assert(
      invoiceSearchResults.length === 2,
      "Organisation A should find both returns associated with INV-1001.",
    );

    console.log("Invoice-number return search successful.");

    // ==========================================================
    // 20. SEARCH BY CUSTOMER NAME
    // ==========================================================

    console.log("--- Searching returns by customer name ---");

    const customerSearchResults = await searchReturns(
      organisationA.organisationId,
      `Return Customer A ${uniqueValue}`,
    );

    assert(
      customerSearchResults.length === 3,
      "Customer-name search should return all Customer A returns.",
    );

    console.log("Customer-name return search successful.");

    // ==========================================================
    // 21. SEARCH BY CUSTOMER PHONE
    // ==========================================================

    console.log("--- Searching returns by customer phone ---");

    const phoneSearchResults = await searchReturns(
      organisationA.organisationId,
      "9333333333",
    );

    assert(
      phoneSearchResults.length === 3,
      "Customer-phone search should return all Customer A returns.",
    );

    console.log("Customer-phone return search successful.");

    // ==========================================================
    // 22. SEARCH TENANT ISOLATION
    // ==========================================================

    console.log("--- Testing return search tenant isolation ---");

    const crossTenantSearch = await searchReturns(
      organisationB.organisationId,
      `Return Customer A ${uniqueValue}`,
    );

    assert(
      crossTenantSearch.length === 0,
      "Organisation B must not search Organisation A returns.",
    );

    console.log("Return search tenant isolation verified.");

    // ==========================================================
    // 23. UPDATE RETURN
    // ==========================================================

    console.log("--- Updating return ---");

    const updatedReturn = await updateReturn(
      organisationA.organisationId,
      returnA1.id,
      {
        returnDate: "2026-09-06T11:00:00Z",

        status: "APPROVED",

        refundAmount: 110,

        refundMethod: "STORE_CREDIT",

        reason: "Updated return reason",

        notes: "Updated return repository test",

        processedBy: organisationA.userId,
      },
    );

    assert(
      updatedReturn !== null,
      "Return update should return the updated record.",
    );

    assert(
      updatedReturn.id === returnA1.id,
      "Return ID must remain unchanged.",
    );

    assert(
      updatedReturn.return_number === "RET-1001",
      "Return number must remain immutable.",
    );

    assert(
      updatedReturn.branch_id === branchA1,
      "Branch must remain unchanged.",
    );

    assert(
      updatedReturn.customer_id === customerA.id,
      "Customer must remain unchanged.",
    );

    assert(
      updatedReturn.invoice_id === invoiceA1.id,
      "Invoice must remain unchanged.",
    );

    assert(
      Number(updatedReturn.refund_amount) === 110,
      "Refund amount should be updated.",
    );

    assert(
      updatedReturn.refund_method === "STORE_CREDIT",
      "Refund method should be updated.",
    );

    assert(
      updatedReturn.status === "APPROVED",
      "Return status should be updated.",
    );

    console.log("Return update successful.");

    // ==========================================================
    // 24. FRESH READ AFTER UPDATE
    // ==========================================================

    console.log("--- Testing fresh return read after update ---");

    const freshUpdatedReturn = await getReturnById(
      organisationA.organisationId,
      returnA1.id,
    );

    assert(freshUpdatedReturn !== null, "Updated return should be found.");

    assert(
      Number(freshUpdatedReturn.refund_amount) === 110,
      "Fresh return read should contain updated refund amount.",
    );

    assert(
      freshUpdatedReturn.refund_method === "STORE_CREDIT",
      "Fresh return read should contain updated refund method.",
    );

    assert(
      freshUpdatedReturn.status === "APPROVED",
      "Fresh return read should contain updated status.",
    );

    console.log("Fresh updated return read successful.");

    // ==========================================================
    // 25. IMMUTABLE RELATIONSHIPS
    // ==========================================================

    console.log("--- Testing immutable return relationships ---");

    const immutableUpdate = await updateReturn(
      organisationA.organisationId,
      returnA1.id,
      {
        organisationId: organisationB.organisationId,

        branchId: branchA2,

        customerId: customerA2.id,

        invoiceId: invoiceA2Branch.id,

        returnNumber: "RET-9999",

        createdBy: organisationB.userId,

        notes: "Immutable relationship test",
      },
    );

    assert(
      immutableUpdate.organisation_id === organisationA.organisationId,
      "Organisation must remain immutable.",
    );

    assert(
      immutableUpdate.branch_id === branchA1,
      "Branch must remain immutable.",
    );

    assert(
      immutableUpdate.customer_id === customerA.id,
      "Customer must remain immutable.",
    );

    assert(
      immutableUpdate.invoice_id === invoiceA1.id,
      "Invoice must remain immutable.",
    );

    assert(
      immutableUpdate.return_number === "RET-1001",
      "Return number must remain immutable.",
    );

    assert(
      immutableUpdate.created_by === organisationA.userId,
      "Created-by must remain immutable.",
    );

    console.log("Return relationship immutability verified.");

    // ==========================================================
    // 26. EMPTY UPDATE
    // ==========================================================

    console.log("--- Testing empty return update ---");

    const emptyUpdate = await updateReturn(
      organisationA.organisationId,
      returnA1.id,
      {},
    );

    assert(
      emptyUpdate !== null,
      "Empty update should return the current return.",
    );

    assert(
      emptyUpdate.id === returnA1.id,
      "Empty update should return the correct return.",
    );

    console.log("Empty return update successful.");

    // ==========================================================
    // 27. INVALID REFUND METHOD
    // ==========================================================

    console.log("--- Testing invalid refund method ---");

    await assertRejected(
      () =>
        updateReturn(organisationA.organisationId, returnA1.id, {
          refundMethod: "UPI",
        }),
      "returns_refund_method_check",
    );

    console.log("Invalid refund method protection verified.");

    // ==========================================================
    // 28. NEGATIVE REFUND AMOUNT
    // ==========================================================

    console.log("--- Testing negative refund amount ---");

    await assertRejected(
      () =>
        updateReturn(organisationA.organisationId, returnA1.id, {
          refundAmount: -1,
        }),
      "returns_refund_amount_check",
    );

    console.log("Negative refund amount protection verified.");

    // ==========================================================
    // 29. INVALID STATUS
    // ==========================================================

    console.log("--- Testing invalid return status ---");

    await assertRejected(
      () =>
        updateReturn(organisationA.organisationId, returnA1.id, {
          status: "INVALID_STATUS",
        }),
      "returns_status_check",
    );

    console.log("Invalid return status protection verified.");

    // ==========================================================
    // 30. INVALID CREATED-BY USER
    // ==========================================================

    console.log("--- Testing invalid created-by user ---");

    await assertRejected(
      () =>
        createReturn({
          organisationId: organisationA.organisationId,

          branchId: branchA1,

          customerId: customerA.id,

          invoiceId: invoiceA1.id,

          refundAmount: 50,

          refundMethod: "CASH",

          createdBy: organisationB.userId,
        }),
      "Created-by user is not an active member of the specified organisation.",
    );

    console.log("Created-by organisation validation verified.");

    // ==========================================================
    // 31. INVALID PROCESSED-BY USER
    // ==========================================================

    console.log("--- Testing invalid processed-by user ---");

    await assertRejected(
      () =>
        createReturn({
          organisationId: organisationA.organisationId,

          branchId: branchA1,

          customerId: customerA.id,

          invoiceId: invoiceA1.id,

          refundAmount: 50,

          refundMethod: "CASH",

          createdBy: organisationA.userId,

          processedBy: organisationB.userId,
        }),
      "Processed-by user is not an active member of the specified organisation.",
    );

    console.log("Processed-by organisation validation verified.");

    // ==========================================================
    // 32. CROSS-TENANT BRANCH PROTECTION
    // ==========================================================

    console.log("--- Testing cross-tenant branch protection ---");

    await assertRejected(
      () =>
        createReturn({
          organisationId: organisationA.organisationId,

          branchId: branchB1,

          customerId: customerA.id,

          invoiceId: invoiceA1.id,

          refundAmount: 50,

          refundMethod: "CASH",

          createdBy: organisationA.userId,
        }),
      "Branch does not belong to the specified organisation.",
    );

    console.log("Cross-tenant branch protection verified.");

    // ==========================================================
    // 33. CROSS-TENANT CUSTOMER PROTECTION
    // ==========================================================

    console.log("--- Testing cross-tenant customer protection ---");

    await assertRejected(
      () =>
        createReturn({
          organisationId: organisationA.organisationId,

          branchId: branchA1,

          customerId: customerB.id,

          invoiceId: invoiceA1.id,

          refundAmount: 50,

          refundMethod: "CASH",

          createdBy: organisationA.userId,
        }),
      "Customer does not belong to the specified organisation.",
    );

    console.log("Cross-tenant customer protection verified.");

    // ==========================================================
    // 34. INVOICE/CUSTOMER MISMATCH
    // ==========================================================

    console.log("--- Testing invoice/customer mismatch ---");

    await assertRejected(
      () =>
        createReturn({
          organisationId: organisationA.organisationId,

          branchId: branchA1,

          customerId: customerA2.id,

          invoiceId: invoiceA1.id,

          refundAmount: 50,

          refundMethod: "CASH",

          createdBy: organisationA.userId,
        }),
      "Invoice does not belong to the specified customer.",
    );

    console.log("Invoice/customer consistency protection verified.");

    // ==========================================================
    // 35. INVOICE/BRANCH MISMATCH
    // ==========================================================

    console.log("--- Testing invoice/branch mismatch ---");

    await assertRejected(
      () =>
        createReturn({
          organisationId: organisationA.organisationId,

          branchId: branchA2,

          customerId: customerA.id,

          invoiceId: invoiceA1.id,

          refundAmount: 50,

          refundMethod: "CASH",

          createdBy: organisationA.userId,
        }),
      "Invoice does not belong to the specified branch.",
    );

    console.log("Invoice/branch consistency protection verified.");

    // ==========================================================
    // 36. CROSS-TENANT INVOICE PROTECTION
    // ==========================================================

    console.log("--- Testing cross-tenant invoice protection ---");

    await assertRejected(
      () =>
        createReturn({
          organisationId: organisationA.organisationId,

          branchId: branchA1,

          customerId: customerA.id,

          invoiceId: invoiceB1.id,

          refundAmount: 50,

          refundMethod: "CASH",

          createdBy: organisationA.userId,
        }),
      "Invoice does not belong to the specified organisation.",
    );

    console.log("Cross-tenant invoice protection verified.");

    // ==========================================================
    // 37. CROSS-TENANT UPDATE
    // ==========================================================

    console.log("--- Testing cross-tenant return update ---");

    const crossTenantUpdate = await updateReturn(
      organisationB.organisationId,
      returnA1.id,
      {
        status: "CANCELLED",
      },
    );

    assert(
      crossTenantUpdate === null,
      "Organisation B must not update Organisation A return.",
    );

    const verifyAfterCrossTenantUpdate = await getReturnById(
      organisationA.organisationId,
      returnA1.id,
    );

    assert(
      verifyAfterCrossTenantUpdate.status === "APPROVED",
      "Cross-tenant update must not modify the return.",
    );

    console.log("Cross-tenant return update protection verified.");

    // ==========================================================
    // 38. CALLER-OWNED TRANSACTION ROLLBACK
    // ==========================================================

    console.log("--- Testing caller-owned transaction rollback ---");

    const transactionClient = await pool.connect();

    try {
      await transactionClient.query("BEGIN");

      const rollbackReturn = await createReturn({
        organisationId: organisationA.organisationId,

        branchId: branchA1,

        customerId: customerA.id,

        invoiceId: invoiceA1.id,

        refundAmount: 75,

        refundMethod: "CASH",

        reason: "Rollback return",

        createdBy: organisationA.userId,

        processedBy: organisationA.userId,

        client: transactionClient,
      });

      rollbackReturnId = rollbackReturn.id;

      assert(
        rollbackReturn.return_number === "RET-1003",
        "Rollback return should receive RET-1003.",
      );

      /**
       * Roll back the entire caller-owned transaction.
       *
       * Both:
       *
       * - return row
       * - RETURN sequence increment
       *
       * must disappear.
       */
      await transactionClient.query("ROLLBACK");
    } finally {
      transactionClient.release();
    }

    const rolledBackReturn = await getReturnById(
      organisationA.organisationId,
      rollbackReturnId,
    );

    assert(
      rolledBackReturn === null,
      "Rolled-back return must not remain in the database.",
    );

    console.log("Caller-owned transaction rollback verified.");

    // ==========================================================
    // 39. VERIFY SEQUENCE ROLLBACK
    // ==========================================================

    console.log("--- Verifying RETURN sequence rollback ---");

    const returnSequence = await getNumberSequence({
      organisationId: organisationA.organisationId,

      branchId: branchA1,

      sequenceType: "RETURN",
    });

    assert(returnSequence !== null, "RETURN sequence should exist.");

    assert(
      Number(returnSequence.next_number) === 1003,
      "Rolled-back return must not permanently consume RET-1003.",
    );

    console.log("RETURN sequence rollback verified.");

    // ==========================================================
    // 40. CREATE RETURN AFTER ROLLBACK
    // ==========================================================

    console.log("--- Creating return after rollback ---");

    const returnAfterRollback = await createReturn({
      organisationId: organisationA.organisationId,

      branchId: branchA1,

      customerId: customerA.id,

      invoiceId: invoiceA1.id,

      refundAmount: 75,

      refundMethod: "CASH",

      reason: "Return after rollback",

      createdBy: organisationA.userId,

      processedBy: organisationA.userId,
    });

    assert(
      returnAfterRollback.return_number === "RET-1003",
      "Return after rollback should reuse RET-1003.",
    );

    console.log("Return sequence rollback behavior verified.");

    // ==========================================================
    // 41. CREATE TEMPORARY RETURN FOR DELETE TEST
    // ==========================================================

    console.log("--- Creating temporary return for deletion test ---");

    const temporaryReturn = await createReturn({
      organisationId: organisationA.organisationId,

      branchId: branchA1,

      customerId: customerA.id,

      invoiceId: invoiceA2.id,

      refundAmount: 25,

      refundMethod: "CASH",

      reason: "Temporary deletion test return",

      createdBy: organisationA.userId,

      processedBy: organisationA.userId,
    });

    temporaryReturnId = temporaryReturn.id;

    assert(
      temporaryReturn.return_number === "RET-1004",
      "Temporary return should receive RET-1004.",
    );

    // ==========================================================
    // 42. CROSS-TENANT DELETE
    // ==========================================================

    console.log("--- Testing cross-tenant return deletion ---");

    const crossTenantDelete = await deleteReturn(
      organisationB.organisationId,
      temporaryReturn.id,
    );

    assert(
      crossTenantDelete === false,
      "Organisation B must not delete Organisation A return.",
    );

    console.log("Cross-tenant return deletion protection verified.");

    // ==========================================================
    // 43. DELETE RETURN
    // ==========================================================

    console.log("--- Deleting temporary return ---");

    const deleted = await deleteReturn(
      organisationA.organisationId,
      temporaryReturn.id,
    );

    assert(deleted === true, "Existing return should be deleted successfully.");

    console.log("Return deletion successful.");

    // ==========================================================
    // 44. VERIFY DELETED RETURN
    // ==========================================================

    console.log("--- Verifying deleted return ---");

    const deletedReturn = await getReturnById(
      organisationA.organisationId,
      temporaryReturn.id,
    );

    assert(deletedReturn === null, "Deleted return should return null.");

    console.log("Deleted return correctly returns null.");

    // ==========================================================
    // 45. DELETE NON-EXISTENT RETURN
    // ==========================================================

    console.log("--- Testing deletion of non-existent return ---");

    const deleteAgain = await deleteReturn(
      organisationA.organisationId,
      temporaryReturn.id,
    );

    assert(
      deleteAgain === false,
      "Deleting a non-existent return should return false.",
    );

    console.log("Non-existent return deletion behavior verified.");

    // ==========================================================
    // 46. FINAL ORGANISATION A RETURN STATE
    // ==========================================================

    console.log("--- Verifying final Organisation A return state ---");

    const finalOrganisationAReturns = await getReturnsByOrganisation(
      organisationA.organisationId,
    );

    /**
     * Remaining:
     *
     * returnA1
     * returnA2
     * returnA2Branch
     * returnAfterRollback
     *
     * Temporary return was deleted.
     */
    assert(
      finalOrganisationAReturns.length === 4,
      "Organisation A should have four remaining returns.",
    );

    assert(
      finalOrganisationAReturns.some((item) => item.id === returnA1.id),
      "Return A1 should remain.",
    );

    assert(
      finalOrganisationAReturns.some((item) => item.id === returnA2.id),
      "Return A2 should remain.",
    );

    assert(
      finalOrganisationAReturns.some((item) => item.id === returnA2Branch.id),
      "Branch A2 return should remain.",
    );

    assert(
      finalOrganisationAReturns.some(
        (item) => item.id === returnAfterRollback.id,
      ),
      "Return created after rollback should remain.",
    );

    console.log("Final Organisation A return state verified.");

    // ==========================================================
    // 47. FINAL ORGANISATION B RETURN STATE
    // ==========================================================

    console.log("--- Verifying final Organisation B return state ---");

    const finalOrganisationBReturns = await getReturnsByOrganisation(
      organisationB.organisationId,
    );

    assert(
      finalOrganisationBReturns.length === 1,
      "Organisation B should have one remaining return.",
    );

    assert(
      finalOrganisationBReturns[0].id === returnB1.id,
      "Organisation B return should remain isolated.",
    );

    console.log("Final Organisation B return state verified.");

    // ==========================================================
    // 48. SUCCESS
    // ==========================================================

    console.log("");
    console.log("==============================================");
    console.log("RETURN REPOSITORY TEST PASSED");
    console.log("==============================================");

    console.log("✓ Return creation");

    console.log("✓ Branch-scoped return numbering");

    console.log("✓ Organisation isolation");

    console.log("✓ Branch validation");

    console.log("✓ Customer validation");

    console.log("✓ Invoice validation");

    console.log("✓ Invoice/customer consistency");

    console.log("✓ Invoice/branch consistency");

    console.log("✓ Created-by validation");

    console.log("✓ Processed-by validation");

    console.log("✓ Get by ID");

    console.log("✓ Get by return number");

    console.log("✓ Customer return history");

    console.log("✓ Invoice return history");

    console.log("✓ Branch return history");

    console.log("✓ Organisation return history");

    console.log("✓ Return search");

    console.log("✓ Search tenant isolation");

    console.log("✓ Return update");

    console.log("✓ Immutable relationships");

    console.log("✓ Database constraints");

    console.log("✓ Cross-tenant update protection");

    console.log("✓ Cross-tenant delete protection");

    console.log("✓ Caller-owned transaction rollback");

    console.log("✓ Return sequence rollback");

    console.log("✓ Return deletion");

    console.log("✓ Final tenant isolation checks");
  } catch (error) {
    console.error("");
    console.error("Return repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    // ========================================================
    // CLEANUP RETURNS
    // ========================================================

    console.log("--- Cleaning return test data ---");

    if (organisationA) {
      try {
        await pool.query(
          `
            DELETE FROM returns
            WHERE organisation_id = $1;
          `,
          [organisationA.organisationId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation A return cleanup failed:",
          cleanupError.message,
        );
      }
    }

    if (organisationB) {
      try {
        await pool.query(
          `
            DELETE FROM returns
            WHERE organisation_id = $1;
          `,
          [organisationB.organisationId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation B return cleanup failed:",
          cleanupError.message,
        );
      }
    }

    // ========================================================
    // CLEANUP INVOICES
    // ========================================================

    if (organisationA) {
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

    if (organisationB) {
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
    // CLEANUP ORGANISATIONS
    // ========================================================

    if (organisationA) {
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

    if (organisationB) {
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
    // CLEANUP USERS
    // ========================================================

    if (organisationA) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [organisationA.userId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation A user cleanup failed:",
          cleanupError.message,
        );
      }
    }

    if (organisationB) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [organisationB.userId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation B user cleanup failed:",
          cleanupError.message,
        );
      }
    }

    await pool.end();

    console.log("Return repository test cleanup completed.");
  }
};

runTests();

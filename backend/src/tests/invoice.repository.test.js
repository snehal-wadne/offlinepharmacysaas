/**
 * Invoice Repository Test
 *
 * Purpose:
 * Verifies invoice creation, branch-scoped invoice numbering,
 * tenant isolation, branch/customer/prescription validation,
 * creator membership validation, retrieval, customer history,
 * branch history, organisation listing, invoice search,
 * Redis caching, cache invalidation, updates, status changes,
 * and deletion.
 *
 * This is an integration test and requires:
 * - PostgreSQL to be running
 * - Redis to be running
 * - The current database schema to be applied
 */

const { createCustomer } = require("../repositories/customer.repository");

const {
  createPrescription,
} = require("../repositories/prescription.repository");

const {
  createInvoice,
  getInvoiceById,
  getInvoiceByNumber,
  getInvoicesByCustomer,
  getInvoicesByBranch,
  getInvoicesByOrganisation,
  listInvoicesBySession,
  searchInvoices,
  updateInvoice,
  deleteInvoice,
} = require("../repositories/invoice.repository");

const {
  createCashRegister,
} = require("../repositories/cash-register.repository");
const {
  openSession,
} = require("../repositories/cash-register-session.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { deleteCache } = require("../cache/cache");

/**
 * Simple assertion helper.
 */
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

/**
 * Builds the same tenant-safe cache key used by
 * invoice.repository.js.
 */
const buildInvoiceCacheKey = (organisationId, invoiceId) =>
  `organisation:${organisationId}:invoice:${invoiceId}`;

/**
 * Creates an isolated test user and organisation.
 *
 * The user is also added to organisation_memberships because
 * invoice.repository.js validates that created_by belongs to
 * the organisation.
 */
const createTestOrganisation = async (label) => {
  const uniqueValue = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
      `invoice-${label}-${uniqueValue}@example.com`,
      "test-password-hash",
      `Invoice Test User ${label}`,
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
    [userId, `Invoice Test Organisation ${label} ${uniqueValue}`],
  );

  const organisationId = organisationResult.rows[0].id;

  /**
   * IMPORTANT:
   *
   * The current schema does not store role_id on
   * organisation_memberships.
   *
   * Membership only establishes that the user belongs to
   * the organisation.
   *
   * Branch-specific role/access is handled separately through
   * branch_assignments.
   *
   * Invoice creation only requires an ACTIVE organisation
   * membership for created_by.
   */
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
 * Creates a branch belonging to an organisation.
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
    [organisationId, name],
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
  let customerB = null;

  let prescriptionA = null;

  let invoiceA1 = null;
  let invoiceA2 = null;
  let invoiceA2Branch = null;
  let invoiceB1 = null;

  try {
    // ========================================================
    // 1. CONNECT REDIS
    // ========================================================

    await connectRedis();

    console.log("Redis connection successful.");

    // ========================================================
    // 2. CREATE TEST ORGANISATIONS
    // ========================================================

    console.log("--- Creating isolated test organisations ---");

    organisationA = await createTestOrganisation("A");

    organisationB = await createTestOrganisation("B");

    assert(
      organisationA.organisationId !== organisationB.organisationId,
      "Test organisations must be different.",
    );

    console.log({
      organisationA,
      organisationB,
    });

    // ========================================================
    // 3. CREATE TEST BRANCHES
    // ========================================================

    console.log("--- Creating test branches ---");

    branchA1 = await createTestBranch(
      organisationA.organisationId,
      "Main Branch",
    );

    branchA2 = await createTestBranch(
      organisationA.organisationId,
      "Pune Branch",
    );

    branchB1 = await createTestBranch(
      organisationB.organisationId,
      "Main Branch",
    );

    console.log({
      branchA1,
      branchA2,
      branchB1,
    });

    // ========================================================
    // 4. CREATE TEST CUSTOMERS
    // ========================================================

    console.log("--- Creating test customers ---");

    customerA = await createCustomer({
      organisationId: organisationA.organisationId,

      fullName: "Rajesh Verma",

      phone: "9876543210",

      email: "rajesh@example.com",

      dateOfBirth: "1990-05-15",

      gender: "MALE",

      category: "REGULAR",

      address: "Pune, Maharashtra",
    });

    customerB = await createCustomer({
      organisationId: organisationB.organisationId,

      fullName: "Priya Sharma",

      phone: "9123456780",

      email: "priya@example.com",

      dateOfBirth: "1995-08-20",

      gender: "FEMALE",

      category: "REGULAR",

      address: "Mumbai, Maharashtra",
    });

    // ========================================================
    // 5. CREATE TEST PRESCRIPTION
    // ========================================================

    console.log("--- Creating test prescription ---");

    prescriptionA = await createPrescription({
      organisationId: organisationA.organisationId,

      customerId: customerA.id,

      prescriptionReference: "RX-EXT-2026-001",

      doctorName: "Dr. Rahul Sharma",

      specialization: "Cardiology",

      hospitalOrClinic: "City Care Hospital",

      doctorRegistrationNumber: "MH-MED-123456",

      chronicConditions: "Hypertension",

      drugAllergies: "Penicillin",

      prescriptionDate: "2026-09-04",

      status: "ACTIVE",

      notes: "Test prescription.",
    });

    assert(
      prescriptionA.prescription_number === "RX-1001",
      "Test prescription should receive RX-1001.",
    );

    // ========================================================
    // 6. CREATE FIRST INVOICE
    // ========================================================

    console.log("--- Creating first invoice ---");

    invoiceA1 = await createInvoice({
      organisationId: organisationA.organisationId,

      branchId: branchA1,

      customerId: customerA.id,

      prescriptionId: prescriptionA.id,

      invoiceDate: "2026-09-04T10:00:00Z",

      subtotal: 4500,

      discountAmount: 100,

      taxAmount: 440,

      totalAmount: 4840,

      status: "DRAFT",

      notes: "Test invoice",

      createdBy: organisationA.userId,
    });

    console.log(invoiceA1);

    assert(invoiceA1.id, "Invoice should have an ID.");

    assert(
      invoiceA1.organisation_id === organisationA.organisationId,
      "Invoice should belong to Organisation A.",
    );

    assert(
      invoiceA1.branch_id === branchA1,
      "Invoice should belong to Branch A1.",
    );

    assert(
      invoiceA1.customer_id === customerA.id,
      "Invoice should belong to Customer A.",
    );

    assert(
      invoiceA1.prescription_id === prescriptionA.id,
      "Invoice should reference the test prescription.",
    );

    assert(
      invoiceA1.created_by === organisationA.userId,
      "Invoice should record the test user's ID.",
    );

    assert(
      invoiceA1.invoice_number === "INV-1001",
      "First invoice in Branch A1 should be INV-1001.",
    );

    assert(invoiceA1.status === "DRAFT", "Invoice should have DRAFT status.");

    assert(
      Number(invoiceA1.total_amount) === 4840,
      "Invoice total should be 4840.",
    );

    console.log("First invoice creation successful.");

    // ========================================================
    // 7. CREATE SECOND INVOICE IN SAME BRANCH
    // ========================================================

    console.log("--- Creating second invoice in same branch ---");

    invoiceA2 = await createInvoice({
      organisationId: organisationA.organisationId,

      branchId: branchA1,

      customerId: customerA.id,

      subtotal: 2000,

      discountAmount: 0,

      taxAmount: 240,

      totalAmount: 2240,

      status: "COMPLETED",

      notes: "Second test invoice",

      createdBy: organisationA.userId,
    });

    console.log(invoiceA2);

    assert(
      invoiceA2.invoice_number === "INV-1002",
      "Second invoice in Branch A1 should be INV-1002.",
    );

    console.log("Sequential branch-scoped numbering verified.");

    // ========================================================
    // 8. CREATE INVOICE IN SECOND BRANCH
    // ========================================================

    console.log("--- Creating invoice in second branch ---");

    invoiceA2Branch = await createInvoice({
      organisationId: organisationA.organisationId,

      branchId: branchA2,

      customerId: customerA.id,

      subtotal: 1000,

      discountAmount: 0,

      taxAmount: 120,

      totalAmount: 1120,

      status: "COMPLETED",

      notes: "Second branch test invoice",

      createdBy: organisationA.userId,
    });

    console.log(invoiceA2Branch);

    assert(
      invoiceA2Branch.invoice_number === "INV-1001",
      "A different branch should have its own INV-1001 sequence.",
    );

    console.log("Branch-independent invoice numbering verified.");

    // ========================================================
    // 9. CREATE INVOICE IN SECOND ORGANISATION
    // ========================================================

    console.log("--- Creating invoice in second organisation ---");

    invoiceB1 = await createInvoice({
      organisationId: organisationB.organisationId,

      branchId: branchB1,

      customerId: customerB.id,

      subtotal: 3000,

      discountAmount: 0,

      taxAmount: 360,

      totalAmount: 3360,

      status: "COMPLETED",

      notes: "Organisation B invoice",

      createdBy: organisationB.userId,
    });

    console.log(invoiceB1);

    assert(
      invoiceB1.invoice_number === "INV-1001",
      "A different organisation should have its own branch invoice sequence.",
    );

    console.log("Organisation-independent invoice numbering verified.");

    // ========================================================
    // 10. VERIFY CACHE KEY
    // ========================================================

    console.log("--- Verifying tenant-safe invoice cache key ---");

    const cacheKey = buildInvoiceCacheKey(
      organisationA.organisationId,
      invoiceA1.id,
    );

    const otherOrganisationCacheKey = buildInvoiceCacheKey(
      organisationB.organisationId,
      invoiceA1.id,
    );

    assert(
      cacheKey !== otherOrganisationCacheKey,
      "Different organisations must have different invoice cache keys.",
    );

    console.log("Tenant-safe invoice cache key verified.");

    // ========================================================
    // 11. CACHE MISS
    // ========================================================

    console.log("--- Testing invoice cache miss ---");

    await deleteCache(cacheKey);

    const firstFetch = await getInvoiceById(
      organisationA.organisationId,
      invoiceA1.id,
    );

    console.log(firstFetch);

    assert(firstFetch !== null, "Invoice should be returned on cache miss.");

    assert(firstFetch.id === invoiceA1.id, "Fetched invoice ID should match.");

    assert(
      firstFetch.invoice_number === "INV-1001",
      "Fetched invoice should contain INV-1001.",
    );

    console.log("Invoice cache miss successful.");

    // ========================================================
    // 12. VERIFY REDIS CACHE
    // ========================================================

    console.log("--- Verifying invoice was cached ---");

    const cachedInvoice = await redisClient.get(cacheKey);

    assert(cachedInvoice !== null, "Invoice should be stored in Redis.");

    const parsedCachedInvoice = JSON.parse(cachedInvoice);

    assert(
      parsedCachedInvoice.id === invoiceA1.id,
      "Cached invoice ID should match.",
    );

    assert(
      parsedCachedInvoice.invoice_number === "INV-1001",
      "Cached invoice should contain the correct invoice number.",
    );

    console.log("Invoice successfully cached.");

    // ========================================================
    // 13. CACHE HIT
    // ========================================================

    console.log("--- Testing invoice cache hit ---");

    const secondFetch = await getInvoiceById(
      organisationA.organisationId,
      invoiceA1.id,
    );

    assert(secondFetch !== null, "Invoice should be returned on cache hit.");

    assert(
      secondFetch.id === invoiceA1.id,
      "Cache-hit invoice ID should match.",
    );

    console.log("Invoice cache hit successful.");

    // ========================================================
    // 14. GET BY NUMBER
    // ========================================================

    console.log("--- Testing invoice lookup by business number ---");

    const invoiceByNumber = await getInvoiceByNumber(
      organisationA.organisationId,
      branchA1,
      "INV-1001",
    );

    assert(
      invoiceByNumber !== null,
      "Invoice should be found by invoice number.",
    );

    assert(
      invoiceByNumber.id === invoiceA1.id,
      "Invoice-number lookup should return the correct invoice.",
    );

    console.log("Invoice-number lookup successful.");

    // ========================================================
    // 15. WRONG BRANCH NUMBER LOOKUP
    // ========================================================

    console.log("--- Testing branch-scoped invoice-number lookup ---");

    const wrongBranchLookup = await getInvoiceByNumber(
      organisationA.organisationId,
      branchA2,
      "INV-1001",
    );

    assert(wrongBranchLookup !== null, "INV-1001 should exist in Branch A2.");

    assert(
      wrongBranchLookup.id === invoiceA2Branch.id,
      "Same invoice number in another branch should resolve to that branch's invoice.",
    );

    console.log("Branch-scoped invoice-number lookup verified.");

    // ========================================================
    // 16. TENANT ISOLATION BY ID
    // ========================================================

    console.log("--- Testing invoice tenant isolation ---");

    const leakedInvoice = await getInvoiceById(
      organisationB.organisationId,
      invoiceA1.id,
    );

    assert(
      leakedInvoice === null,
      "Organisation B must not retrieve Organisation A's invoice.",
    );

    console.log("Invoice tenant isolation verified.");

    // ========================================================
    // 17. CUSTOMER HISTORY
    // ========================================================

    console.log("--- Getting invoices by customer ---");

    const customerInvoices = await getInvoicesByCustomer(
      organisationA.organisationId,
      customerA.id,
    );

    assert(
      customerInvoices.length === 3,
      "Customer A should have three test invoices.",
    );

    const customerInvoiceIds = customerInvoices.map((item) => item.id);

    assert(
      customerInvoiceIds.includes(invoiceA1.id),
      "Customer history should contain invoice A1.",
    );

    assert(
      customerInvoiceIds.includes(invoiceA2.id),
      "Customer history should contain invoice A2.",
    );

    assert(
      customerInvoiceIds.includes(invoiceA2Branch.id),
      "Customer history should contain the second-branch invoice.",
    );

    console.log("Customer invoice history successful.");

    // ========================================================
    // 18. CUSTOMER HISTORY TENANT ISOLATION
    // ========================================================

    console.log("--- Testing customer history tenant isolation ---");

    const wrongTenantHistory = await getInvoicesByCustomer(
      organisationB.organisationId,
      customerA.id,
    );

    assert(
      wrongTenantHistory.length === 0,
      "Customer invoice history must be tenant-scoped.",
    );

    console.log("Customer history tenant isolation verified.");

    // ========================================================
    // 19. BRANCH HISTORY
    // ========================================================

    console.log("--- Getting invoices by branch ---");

    const branchInvoices = await getInvoicesByBranch(
      organisationA.organisationId,
      branchA1,
    );

    assert(
      branchInvoices.length === 2,
      "Branch A1 should contain two test invoices.",
    );

    const branchInvoiceNumbers = branchInvoices.map(
      (item) => item.invoice_number,
    );

    assert(
      branchInvoiceNumbers.includes("INV-1001"),
      "Branch A1 history should contain INV-1001.",
    );

    assert(
      branchInvoiceNumbers.includes("INV-1002"),
      "Branch A1 history should contain INV-1002.",
    );

    console.log("Branch invoice history successful.");

    // ========================================================
    // 20. ORGANISATION LISTING
    // ========================================================

    console.log("--- Getting invoices by organisation ---");

    const organisationInvoices = await getInvoicesByOrganisation(
      organisationA.organisationId,
    );

    assert(
      organisationInvoices.length === 3,
      "Organisation A should contain three test invoices.",
    );

    console.log("Organisation invoice listing successful.");

    // ========================================================
    // 21. ORGANISATION LIST ISOLATION
    // ========================================================

    console.log("--- Testing organisation invoice-list isolation ---");

    const organisationBInvoices = await getInvoicesByOrganisation(
      organisationB.organisationId,
    );

    assert(
      organisationBInvoices.length === 1,
      "Organisation B should contain only its own invoice.",
    );

    assert(
      organisationBInvoices[0].id === invoiceB1.id,
      "Organisation B list should contain only its invoice.",
    );

    console.log("Organisation invoice-list isolation verified.");

    // ========================================================
    // 22. SEARCH BY INVOICE NUMBER
    // ========================================================

    console.log("--- Searching invoices by invoice number ---");

    const numberResults = await searchInvoices(
      organisationA.organisationId,
      "INV-1001",
    );

    assert(
      numberResults.length >= 2,
      "Organisation A should find both INV-1001 invoices across branches.",
    );

    console.log("Invoice-number search successful.");

    // ========================================================
    // 23. SEARCH BY CUSTOMER NAME
    // ========================================================

    console.log("--- Searching invoices by customer name ---");

    const customerSearchResults = await searchInvoices(
      organisationA.organisationId,
      "Rajesh Verma",
    );

    assert(
      customerSearchResults.length === 3,
      "Customer-name search should return Customer A's invoices.",
    );

    console.log("Customer-name invoice search successful.");

    // ========================================================
    // 24. SEARCH BY CUSTOMER PHONE
    // ========================================================

    console.log("--- Searching invoices by customer phone ---");

    const phoneSearchResults = await searchInvoices(
      organisationA.organisationId,
      "9876543210",
    );

    assert(
      phoneSearchResults.length === 3,
      "Customer-phone search should return Customer A's invoices.",
    );

    console.log("Customer-phone invoice search successful.");

    // ========================================================
    // 25. UPDATE INVOICE
    // ========================================================

    console.log("--- Updating invoice ---");

    const updatedInvoice = await updateInvoice(
      organisationA.organisationId,
      invoiceA1.id,
      {
        invoiceDate: "2026-09-04T11:00:00Z",

        subtotal: 5000,

        discountAmount: 200,

        taxAmount: 480,

        totalAmount: 5280,

        status: "COMPLETED",

        notes: "Updated completed invoice",
      },
    );

    console.log(updatedInvoice);

    assert(
      updatedInvoice !== null,
      "Invoice update should return the updated invoice.",
    );

    assert(
      Number(updatedInvoice.total_amount) === 5280,
      "Invoice total should be updated.",
    );

    assert(
      updatedInvoice.status === "COMPLETED",
      "Invoice status should be updated.",
    );

    assert(
      updatedInvoice.invoice_number === "INV-1001",
      "Invoice number must remain immutable.",
    );

    assert(
      updatedInvoice.branch_id === branchA1,
      "Branch must remain unchanged.",
    );

    assert(
      updatedInvoice.customer_id === customerA.id,
      "Customer must remain unchanged.",
    );

    assert(
      updatedInvoice.prescription_id === prescriptionA.id,
      "Prescription association must remain unchanged.",
    );

    assert(
      updatedInvoice.created_by === organisationA.userId,
      "Invoice creator must remain unchanged.",
    );

    console.log("Invoice update successful.");

    // ========================================================
    // 26. VERIFY UPDATE CACHE INVALIDATION
    // ========================================================

    console.log("--- Verifying invoice update cache invalidation ---");

    const cacheAfterUpdate = await redisClient.get(cacheKey);

    assert(
      cacheAfterUpdate === null,
      "Invoice update should invalidate Redis cache.",
    );

    console.log("Invoice update cache invalidation successful.");

    // ========================================================
    // 27. FRESH READ AFTER UPDATE
    // ========================================================

    console.log("--- Testing fresh invoice read after update ---");

    const freshInvoice = await getInvoiceById(
      organisationA.organisationId,
      invoiceA1.id,
    );

    assert(freshInvoice !== null, "Updated invoice should be returned.");

    assert(
      Number(freshInvoice.total_amount) === 5280,
      "Fresh invoice read should contain updated total.",
    );

    assert(
      freshInvoice.status === "COMPLETED",
      "Fresh invoice read should contain updated status.",
    );

    console.log("Fresh updated invoice read successful.");

    // ========================================================
    // 28. VERIFY CACHE REPOPULATION
    // ========================================================

    console.log("--- Verifying updated invoice was cached again ---");

    const cacheAfterFreshRead = await redisClient.get(cacheKey);

    assert(
      cacheAfterFreshRead !== null,
      "Updated invoice should be cached again.",
    );

    const parsedUpdatedCache = JSON.parse(cacheAfterFreshRead);

    assert(
      Number(parsedUpdatedCache.total_amount) === 5280,
      "Updated cache should contain the new invoice total.",
    );

    console.log("Updated invoice successfully cached.");

    // ========================================================
    // 29. VOID INVOICE
    // ========================================================

    console.log("--- Testing invoice VOID status ---");

    const voidedInvoice = await updateInvoice(
      organisationA.organisationId,
      invoiceA1.id,
      {
        invoiceDate: "2026-09-04T11:00:00Z",

        subtotal: 5000,

        discountAmount: 200,

        taxAmount: 480,

        totalAmount: 5280,

        status: "VOID",

        notes: "Invoice voided for repository test",
      },
    );

    assert(
      voidedInvoice.status === "VOID",
      "Invoice should support VOID status.",
    );

    assert(
      voidedInvoice.invoice_number === "INV-1001",
      "Voiding must not change invoice number.",
    );

    console.log("Invoice VOID status successful.");

    // ========================================================
    // 30. CREATE DRAFT FOR DELETE TEST
    // ========================================================

    console.log("--- Creating draft invoice for deletion test ---");

    const draftForDeletion = await createInvoice({
      organisationId: organisationA.organisationId,

      branchId: branchA1,

      customerId: customerA.id,

      subtotal: 500,

      discountAmount: 0,

      taxAmount: 60,

      totalAmount: 560,

      status: "DRAFT",

      notes: "Draft invoice to delete",

      createdBy: organisationA.userId,
    });

    assert(
      draftForDeletion.invoice_number === "INV-1003",
      "Draft deletion invoice should receive INV-1003.",
    );

    // ========================================================
    // 31. DELETE DRAFT INVOICE
    // ========================================================

    console.log("--- Deleting draft invoice ---");

    const draftDeleted = await deleteInvoice(
      organisationA.organisationId,
      draftForDeletion.id,
    );

    assert(
      draftDeleted === true,
      "Draft invoice should be deleted successfully.",
    );

    console.log("Draft invoice deletion successful.");

    // ========================================================
    // 32. VERIFY DELETED DRAFT
    // ========================================================

    const deletedDraft = await getInvoiceById(
      organisationA.organisationId,
      draftForDeletion.id,
    );

    assert(deletedDraft === null, "Deleted draft invoice should return null.");

    console.log("Deleted draft invoice correctly returns null.");

    // ========================================================
    // 33. VERIFY COMPLETED INVOICE REMAINS
    // ========================================================

    console.log("--- Verifying completed invoice remains available ---");

    const completedInvoice = await getInvoiceById(
      organisationA.organisationId,
      invoiceA2.id,
    );

    assert(
      completedInvoice !== null,
      "Completed invoice must remain available.",
    );

    assert(
      completedInvoice.status === "COMPLETED",
      "Completed invoice should retain COMPLETED status.",
    );

    console.log("Completed invoice retained successfully.");

    // ========================================================
    // 34. VERIFY BRANCH A1 SEQUENCE STATE
    // ========================================================

    console.log("--- Verifying Branch A1 invoice sequence state ---");

    const branchSequenceResult = await pool.query(
      `
          SELECT
              next_number
          FROM number_sequences
          WHERE organisation_id = $1
            AND branch_id = $2
            AND sequence_type = 'INVOICE';
        `,
      [organisationA.organisationId, branchA1],
    );

    assert(
      branchSequenceResult.rowCount === 1,
      "Branch A1 invoice sequence should exist.",
    );

    /**
     * Branch A1 issued:
     *
     * INV-1001
     * INV-1002
     * INV-1003
     *
     * INV-1003 was deleted afterwards, but its number remains
     * consumed.
     *
     * Therefore next_number must be 1004.
     */
    assert(
      Number(branchSequenceResult.rows[0].next_number) === 1004,
      "Branch A1 invoice sequence should advance to 1004.",
    );

    console.log("Branch A1 invoice sequence state verified.");

    // ========================================================
    // 35. VERIFY BRANCH A2 SEQUENCE STATE
    // ========================================================

    console.log("--- Verifying Branch A2 invoice sequence state ---");

    const branchA2SequenceResult = await pool.query(
      `
          SELECT
              next_number
          FROM number_sequences
          WHERE organisation_id = $1
            AND branch_id = $2
            AND sequence_type = 'INVOICE';
        `,
      [organisationA.organisationId, branchA2],
    );

    assert(
      branchA2SequenceResult.rowCount === 1,
      "Branch A2 invoice sequence should exist.",
    );

    assert(
      Number(branchA2SequenceResult.rows[0].next_number) === 1002,
      "Branch A2 invoice sequence should advance independently to 1002.",
    );

    console.log("Branch A2 invoice sequence state verified.");

    // ========================================================
    // 36. VERIFY ORGANISATION B SEQUENCE STATE
    // ========================================================

    console.log("--- Verifying Organisation B invoice sequence state ---");

    const organisationBSequenceResult = await pool.query(
      `
          SELECT
              next_number
          FROM number_sequences
          WHERE organisation_id = $1
            AND branch_id = $2
            AND sequence_type = 'INVOICE';
        `,
      [organisationB.organisationId, branchB1],
    );

    assert(
      organisationBSequenceResult.rowCount === 1,
      "Organisation B invoice sequence should exist.",
    );

    assert(
      Number(organisationBSequenceResult.rows[0].next_number) === 1002,
      "Organisation B invoice sequence should be independent.",
    );

    console.log("Organisation B invoice sequence state verified.");

    // ========================================================
    // 37. CASH REGISTER SESSION LINKAGE AND QUERY
    // ========================================================

    console.log("--- Testing invoice cash register session linkage ---");

    const testRegister = await createCashRegister({
      organisationId: organisationA.organisationId,
      branchId: branchA1,
      name: "Invoice Test Terminal",
      identifier: "INV-TERM-01",
    });

    const testSession = await openSession({
      organisationId: organisationA.organisationId,
      branchId: branchA1,
      cashRegisterId: testRegister.id,
      cashierId: organisationA.userId,
      openingBalance: 500,
    });

    const sessionInvoice = await createInvoice({
      organisationId: organisationA.organisationId,
      branchId: branchA1,
      customerId: customerA.id,
      subtotal: 1500,
      totalAmount: 1500,
      status: "COMPLETED",
      createdBy: organisationA.userId,
      cashRegisterSessionId: testSession.id,
    });

    assert(
      sessionInvoice.cash_register_session_id === testSession.id,
      "Invoice must be linked to the cash register session.",
    );

    const sessionInvoices = await listInvoicesBySession({
      organisationId: organisationA.organisationId,
      branchId: branchA1,
      sessionId: testSession.id,
    });

    assert(
      sessionInvoices.length === 1,
      "Should find exactly 1 invoice for this session.",
    );
    assert(
      sessionInvoices[0].id === sessionInvoice.id,
      "Invoice returned from session query must match created invoice.",
    );

    console.log("Invoice cash register session linkage verified.");

    // ========================================================
    // 38. SUCCESS
    // ========================================================

    console.log("");
    console.log("Invoice repository tests completed successfully.");
  } catch (error) {
    console.error("");
    console.error("Invoice repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    // ========================================================
    // CLEANUP INVOICES
    // ========================================================

    const invoiceIds = [
      invoiceA1?.id,
      invoiceA2?.id,
      invoiceA2Branch?.id,
      invoiceB1?.id,
    ].filter(Boolean);

    for (const invoiceId of invoiceIds) {
      try {
        await pool.query(
          `
            DELETE FROM invoices
            WHERE id = $1;
          `,
          [invoiceId],
        );
      } catch (cleanupError) {
        console.error(
          `Invoice cleanup failed for ${invoiceId}:`,
          cleanupError.message,
        );
      }
    }

    // ========================================================
    // CLEANUP ORGANISATIONS
    // ========================================================

    /**
     * Deleting the organisation cascades to:
     * - branches
     * - customers
     * - prescriptions
     * - memberships
     * - number sequences
     * - other organisation-owned records
     *
     * This is why the test only needs to explicitly delete
     * the invoice records before removing the organisation.
     */
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

    /**
     * organisation_memberships are already removed by the
     * organisation CASCADE.
     *
     * Users themselves are global records, so remove the
     * isolated test users explicitly.
     */
    if (organisationA?.userId) {
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

    if (organisationB?.userId) {
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

    // ========================================================
    // DISCONNECT REDIS
    // ========================================================

    try {
      await disconnectRedis();
    } catch (redisError) {
      console.error("Redis disconnect failed:", redisError.message);
    }

    // ========================================================
    // CLOSE POSTGRESQL POOL
    // ========================================================

    await pool.end();
  }
};

runTests();

/**
 * ------------------------------------------------------------
 * CUSTOMER & BILLING QUERY REPOSITORY
 * REDIS-INTEGRATED END-TO-END TEST
 * ------------------------------------------------------------
 *
 * Tests:
 *
 * 1. Customer Directory
 * 2. Customer Details
 * 3. Customer Ledger
 * 4. Overdue ageing
 * 5. Payment Receipts dashboard
 * 6. General tenant isolation
 * 7. Redis cache integration
 * 8. Redis cache-hit behavior
 * 9. Redis tenant isolation
 * 10. Transaction-client Redis bypass
 * 11. Cache deletion / invalidation
 *
 * Requirements:
 * - PostgreSQL running
 * - Redis running
 * - schema already applied
 * - development seed already applied
 *
 * Run:
 *
 *   node src/tests/customer-billing-queries.repository.test.js
 */

const assert = require("assert");
const crypto = require("crypto");

const { pool } = require("../db/connection");

const { connectRedis, disconnectRedis } = require("../cache/redis");

const { getCache, setCache, deleteCache } = require("../cache/cache");

const {
  getCustomerDirectoryStats,
  getCustomerDirectoryRows,

  getCustomerDetailsSummary,
  getCustomerPurchaseHistory,
  getCustomerPurchaseSummary,
  getCustomerReturnHistory,

  getCustomerLedgerSummary,
  getCustomerLedgerDashboardStats,
  getCustomerCreditLedgerRows,

  getPaymentReceiptDashboardStats,
  getPaymentReceiptDashboardRows,
} = require("../repositories/customer-billing-queries.repository");

const {
  getNextBusinessNumber,
} = require("../repositories/number-sequence.repository");

// ============================================================
// CACHE CONSTANTS
// ============================================================

const CUSTOMER_BILLING_DASHBOARD_CACHE_TTL = 60;

const buildCustomerDirectoryStatsCacheKey = (organisationId) =>
  `organisation:${organisationId}:customer-billing:directory-stats`;

const buildCustomerLedgerDashboardStatsCacheKey = (organisationId) =>
  `organisation:${organisationId}:customer-billing:ledger-dashboard-stats`;

const buildPaymentReceiptDashboardStatsCacheKey = (organisationId) =>
  `organisation:${organisationId}:customer-billing:payment-receipt-dashboard-stats`;

// ============================================================
// HELPERS
// ============================================================

const uniqueValue = () =>
  `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

const logSection = (title) => {
  console.log("");
  console.log("==========================================================");
  console.log(title);
  console.log("==========================================================");
};

const daysAgo = (days) => {
  const date = new Date();

  date.setDate(date.getDate() - days);

  return date.toISOString().slice(0, 10);
};

// ============================================================
// CACHE HELPERS
// ============================================================

const clearCustomerBillingDashboardCaches = async (organisationId) => {
  const keys = [
    buildCustomerDirectoryStatsCacheKey(organisationId),
    buildCustomerLedgerDashboardStatsCacheKey(organisationId),
    buildPaymentReceiptDashboardStatsCacheKey(organisationId),
  ];

  for (const key of keys) {
    await deleteCache(key);
  }
};

// ============================================================
// TEST HELPERS
// ============================================================

/**
 * Create a temporary organisation.
 */
const createTestOrganisation = async (label, client = pool) => {
  const userResult = await client.query(
    `
      INSERT INTO users (
          email,
          password_hash,
          name,
          status
      )
      VALUES (
          $1,
          $2,
          $3,
          'ACTIVE'
      )
      RETURNING id;
    `,
    [
      `customer-billing-query-${label}-${uniqueValue()}@example.com`,
      "test-password-hash",
      `Customer Billing Query User ${label}`,
    ],
  );

  const userId = userResult.rows[0].id;

  const organisationResult = await client.query(
    `
      INSERT INTO organisations (
          owner_id,
          name
      )
      VALUES (
          $1,
          $2
      )
      RETURNING id;
    `,
    [userId, `Customer Billing Query Organisation ${label} ${uniqueValue()}`],
  );

  return {
    organisationId: organisationResult.rows[0].id,
    userId,
  };
};

/**
 * Create a temporary branch.
 */
const createTestBranch = async (organisationId, label, client = pool) => {
  const result = await client.query(
    `
      INSERT INTO branches (
          organisation_id,
          name
      )
      VALUES (
          $1,
          $2
      )
      RETURNING id;
    `,
    [organisationId, `Customer Billing Query Branch ${label} ${uniqueValue()}`],
  );

  return result.rows[0].id;
};

/**
 * Create an active organisation membership.
 */
const createTestMembership = async (organisationId, userId, client = pool) => {
  const result = await client.query(
    `
      INSERT INTO organisation_memberships (
          organisation_id,
          user_id,
          status
      )
      VALUES (
          $1,
          $2,
          'ACTIVE'
      )
      RETURNING id;
    `,
    [organisationId, userId],
  );

  return result.rows[0].id;
};

/**
 * Create a temporary customer.
 */
const createTestCustomer = async ({
  organisationId,
  fullName,
  phone,
  client = pool,
}) => {
  const customerNumber = await getNextBusinessNumber({
    organisationId,
    branchId: null,
    sequenceType: "CUSTOMER",
    client,
  });

  const result = await client.query(
    `
      INSERT INTO customers (
          organisation_id,
          customer_number,
          full_name,
          phone,
          status
      )
      VALUES (
          $1,
          $2,
          $3,
          $4,
          'ACTIVE'
      )
      RETURNING
          id,
          organisation_id,
          customer_number,
          full_name,
          phone;
    `,
    [organisationId, customerNumber, fullName, phone],
  );

  return result.rows[0];
};

/**
 * Create an invoice directly for query testing.
 */
const createTestInvoice = async ({
  organisationId,
  branchId,
  customerId,
  createdBy,
  invoiceDate,
  totalAmount,
  client = pool,
}) => {
  const invoiceId = crypto.randomUUID();

  const invoiceNumber = await getNextBusinessNumber({
    organisationId,
    branchId,
    sequenceType: "INVOICE",
    client,
  });

  await client.query(
    `
      INSERT INTO invoices (
          id,
          organisation_id,
          branch_id,
          customer_id,
          invoice_number,
          invoice_date,
          subtotal,
          discount_amount,
          tax_amount,
          total_amount,
          status,
          created_by
      )
      VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          0,
          0,
          $7,
          'COMPLETED',
          $8
      );
    `,
    [
      invoiceId,
      organisationId,
      branchId,
      customerId,
      invoiceNumber,
      invoiceDate,
      totalAmount,
      createdBy,
    ],
  );

  return {
    id: invoiceId,
    invoiceNumber,
    totalAmount,
  };
};

/**
 * Create a payment directly for query testing.
 */
const createTestPayment = async ({
  organisationId,
  branchId,
  customerId,
  totalAmount,
  status,
  receivedBy,
  paymentDate,
  client,
}) => {
  const paymentId = crypto.randomUUID();

  const receiptNumber = await getNextBusinessNumber({
    organisationId,
    branchId,
    sequenceType: "RECEIPT",
    client,
  });

  await client.query(
    `
      INSERT INTO payments (
          id,
          organisation_id,
          branch_id,
          customer_id,
          receipt_number,
          payment_date,
          total_amount,
          status,
          received_by
      )
      VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9
      );
    `,
    [
      paymentId,
      organisationId,
      branchId,
      customerId,
      receiptNumber,
      paymentDate,
      totalAmount,
      status,
      receivedBy,
    ],
  );

  return {
    id: paymentId,
    receiptNumber,
  };
};

/**
 * Add payment transaction.
 */
const createTestPaymentTransaction = async ({
  paymentId,
  paymentMethod,
  amount,
  transactionReference,
  client,
}) => {
  const result = await client.query(
    `
          INSERT INTO payment_transactions (
              id,
              payment_id,
              payment_method,
              amount,
              transaction_reference
          )
          VALUES (
              $1,
              $2,
              $3,
              $4,
              $5
          )
          RETURNING id;
        `,
    [
      crypto.randomUUID(),
      paymentId,
      paymentMethod,
      amount,
      transactionReference,
    ],
  );

  return result.rows[0].id;
};

/**
 * Add payment allocation.
 */
const createTestPaymentAllocation = async ({
  paymentId,
  invoiceId,
  allocatedAmount,
  client,
}) => {
  const result = await client.query(
    `
          INSERT INTO payment_allocations (
              id,
              payment_id,
              invoice_id,
              allocated_amount
          )
          VALUES (
              $1,
              $2,
              $3,
              $4
          )
          RETURNING id;
        `,
    [crypto.randomUUID(), paymentId, invoiceId, allocatedAmount],
  );

  return result.rows[0].id;
};

// ============================================================
// 1. CUSTOMER DIRECTORY
// ============================================================

const testCustomerDirectory = async (organisationId) => {
  logSection("CUSTOMER DIRECTORY QUERY TEST");

  await deleteCache(buildCustomerDirectoryStatsCacheKey(organisationId));

  // --------------------------------------------------------
  // STATS
  // --------------------------------------------------------

  logSection("1. Customer Directory statistics");

  const stats = await getCustomerDirectoryStats(organisationId);

  assert(stats, "Directory statistics must exist.");

  assert.strictEqual(Number(stats.total_customers), 6);

  assert.strictEqual(Number(stats.chronic_care_patients), 2);

  assert.strictEqual(Number(stats.active_credit_accounts), 5);

  console.log(stats);

  console.log("✓ Customer Directory statistics");

  // --------------------------------------------------------
  // ROWS
  // --------------------------------------------------------

  logSection("2. Customer Directory rows");

  const rows = await getCustomerDirectoryRows({
    organisationId,
    limit: 50,
    offset: 0,
  });

  assert.strictEqual(rows.length, 6);

  const ayesha = rows.find((row) => row.full_name === "Ayesha Khan");

  assert(ayesha, "Ayesha Khan should exist.");

  assert.strictEqual(ayesha.customer_number.startsWith("CUST-"), true);

  assert.strictEqual(Number(ayesha.age), 32);

  assert.strictEqual(ayesha.category, "REGULAR");

  assert.strictEqual(ayesha.doctor_name, "Dr. Farooq Siddiqui");

  assert.strictEqual(ayesha.active_prescription_number.startsWith("RX-"), true);

  assert.strictEqual(ayesha.credit_enabled, true);

  assert.strictEqual(Number(ayesha.credit_limit), 2000);

  assert.strictEqual(Number(ayesha.total_spent), 1360);

  assert.strictEqual(Number(ayesha.outstanding_balance), 1360);

  console.log(ayesha);

  console.log("✓ Customer Directory rows");

  // --------------------------------------------------------
  // CATEGORY FILTER
  // --------------------------------------------------------

  logSection("3. Directory category filter");

  const chronicRows = await getCustomerDirectoryRows({
    organisationId,
    category: "CHRONIC CARE",
    limit: 50,
    offset: 0,
  });

  assert.strictEqual(chronicRows.length, 2);

  assert(
    chronicRows.every((row) => row.category.toUpperCase() === "CHRONIC CARE"),
  );

  console.log("✓ Category filter");

  // --------------------------------------------------------
  // CREDIT FILTER
  // --------------------------------------------------------

  logSection("4. Directory credit filter");

  const creditRows = await getCustomerDirectoryRows({
    organisationId,
    creditEnabled: true,
    limit: 50,
    offset: 0,
  });

  assert.strictEqual(creditRows.length, 5);

  assert(creditRows.every((row) => row.credit_enabled === true));

  console.log("✓ Credit filter");
};

// ============================================================
// 2. CUSTOMER DETAILS
// ============================================================

const testCustomerDetails = async (organisationId, customerId) => {
  logSection("CUSTOMER DETAILS QUERY TEST");

  // --------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------

  logSection("5. Customer Details summary");

  const summary = await getCustomerDetailsSummary(organisationId, customerId);

  assert(summary);

  assert.strictEqual(summary.full_name, "Ayesha Khan");

  assert.strictEqual(Number(summary.total_purchases), 2);

  assert.strictEqual(Number(summary.total_spent), 1360);

  assert.strictEqual(Number(summary.outstanding_balance), 1360);

  assert.strictEqual(summary.credit_enabled, true);

  assert.strictEqual(Number(summary.credit_limit), 2000);

  console.log(summary);

  console.log("✓ Customer Details summary");

  // --------------------------------------------------------
  // PURCHASE HISTORY
  // --------------------------------------------------------

  logSection("6. Customer Purchase History");

  const purchaseRows = await getCustomerPurchaseHistory({
    organisationId,
    customerId,
    limit: 50,
    offset: 0,
  });

  assert.strictEqual(purchaseRows.length, 2);

  assert(purchaseRows.every((row) => row.customer_id === customerId));

  assert(purchaseRows.every((row) => row.status === "COMPLETED"));

  assert(purchaseRows.every((row) => row.payment_method === "Unpaid"));

  console.log("✓ Purchase history");

  // --------------------------------------------------------
  // SEARCH
  // --------------------------------------------------------

  logSection("7. Purchase history search");

  const searchRows = await getCustomerPurchaseHistory({
    organisationId,
    customerId,
    searchTerm: "INV-1001",
    limit: 50,
    offset: 0,
  });

  assert(searchRows.length >= 1);

  console.log("✓ Purchase history search");

  // --------------------------------------------------------
  // PAGINATION
  // --------------------------------------------------------

  logSection("8. Purchase history pagination");

  const firstPage = await getCustomerPurchaseHistory({
    organisationId,
    customerId,
    limit: 1,
    offset: 0,
  });

  const secondPage = await getCustomerPurchaseHistory({
    organisationId,
    customerId,
    limit: 1,
    offset: 1,
  });

  assert.strictEqual(firstPage.length, 1);

  assert.strictEqual(secondPage.length, 1);

  assert.notStrictEqual(firstPage[0].id, secondPage[0].id);

  console.log("✓ Purchase pagination");

  // --------------------------------------------------------
  // PURCHASE SUMMARY
  // --------------------------------------------------------

  logSection("9. Customer Purchase Summary");

  const purchaseSummary = await getCustomerPurchaseSummary(
    organisationId,
    customerId,
  );

  assert.strictEqual(Number(purchaseSummary.total_invoices), 2);

  assert.strictEqual(Number(purchaseSummary.total_spent), 1360);

  assert.strictEqual(Number(purchaseSummary.total_returns), 0);

  assert.strictEqual(Number(purchaseSummary.outstanding_balance), 1360);

  console.log("✓ Purchase summary");

  // --------------------------------------------------------
  // RETURN HISTORY
  // --------------------------------------------------------

  logSection("10. Customer Return History");

  const returnRows = await getCustomerReturnHistory({
    organisationId,
    customerId,
    limit: 50,
    offset: 0,
  });

  assert.strictEqual(returnRows.length, 0);

  console.log("✓ Return history");

  const emptyReturnRows = await getCustomerReturnHistory({
    organisationId,
    customerId,
    searchTerm: "does-not-exist",
    limit: 50,
    offset: 0,
  });

  assert.strictEqual(emptyReturnRows.length, 0);

  console.log("✓ Empty return history");
};

// ============================================================
// 3. CUSTOMER LEDGER
// ============================================================

const testCustomerLedger = async (organisationId, customerId) => {
  logSection("CUSTOMER LEDGER QUERY TEST");

  // --------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------

  logSection("11. Customer Ledger summary");

  const summary = await getCustomerLedgerSummary(organisationId, customerId);

  assert(summary);

  assert.strictEqual(summary.full_name, "Ayesha Khan");

  assert.strictEqual(summary.credit_enabled, true);

  assert.strictEqual(Number(summary.credit_limit), 2000);

  assert.strictEqual(Number(summary.outstanding_balance), 1360);

  assert.strictEqual(Number(summary.total_debit), 1360);

  assert.strictEqual(Number(summary.total_credit), 0);

  console.log("✓ Customer Ledger summary");

  // --------------------------------------------------------
  // ROWS
  // --------------------------------------------------------

  logSection("12. Customer Ledger rows");

  const rows = await getCustomerCreditLedgerRows({
    organisationId,
    searchTerm: "Ayesha Khan",
    limit: 50,
    offset: 0,
  });

  assert.strictEqual(rows.length, 2);

  assert(rows.every((row) => row.full_name === "Ayesha Khan"));

  assert(rows.every((row) => row.reference_type === "INVOICE"));

  assert(rows.every((row) => Number(row.debit_amount) > 0));

  console.log("✓ Customer Ledger rows");

  // --------------------------------------------------------
  // ENTRY FILTER
  // --------------------------------------------------------

  logSection("13. Ledger entry type filter");

  const invoiceRows = await getCustomerCreditLedgerRows({
    organisationId,
    entryType: "INVOICE",
    limit: 50,
    offset: 0,
  });

  assert(invoiceRows.length >= 2);

  assert(invoiceRows.every((row) => row.entry_type === "INVOICE"));

  console.log("✓ Entry type filter");

  // --------------------------------------------------------
  // REFERENCE FILTER
  // --------------------------------------------------------

  logSection("14. Ledger reference type filter");

  const referenceRows = await getCustomerCreditLedgerRows({
    organisationId,
    referenceType: "INVOICE",
    limit: 50,
    offset: 0,
  });

  assert(referenceRows.length >= 2);

  assert(referenceRows.every((row) => row.reference_type === "INVOICE"));

  console.log("✓ Reference type filter");

  // --------------------------------------------------------
  // PAGINATION
  // --------------------------------------------------------

  logSection("15. Ledger pagination");

  const firstPage = await getCustomerCreditLedgerRows({
    organisationId,
    limit: 1,
    offset: 0,
  });

  const secondPage = await getCustomerCreditLedgerRows({
    organisationId,
    limit: 1,
    offset: 1,
  });

  assert.strictEqual(firstPage.length, 1);

  assert.strictEqual(secondPage.length, 1);

  assert.notStrictEqual(firstPage[0].id, secondPage[0].id);

  console.log("✓ Ledger pagination");

  // --------------------------------------------------------
  // DASHBOARD
  // --------------------------------------------------------

  logSection("16. Customer Ledger dashboard statistics");

  await deleteCache(buildCustomerLedgerDashboardStatsCacheKey(organisationId));

  const dashboardStats = await getCustomerLedgerDashboardStats(organisationId);

  assert.strictEqual(Number(dashboardStats.totalOutstanding), 43850);

  assert.strictEqual(Number(dashboardStats.totalCreditLimit), 102000);

  assert.strictEqual(Number(dashboardStats.customersWithOutstanding), 6);

  assert.strictEqual(Number(dashboardStats.overdueAmount), 8200);

  assert.strictEqual(Number(dashboardStats.customersWithOverdue), 2);

  console.log("✓ Ledger dashboard statistics");
};

// ============================================================
// 4. OVERDUE AGEING
// ============================================================

const testOverdueAgeing = async () => {
  logSection("OVERDUE AGEING TEST");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const organisationResult = await client.query(
      `
            SELECT
                id,
                owner_id
            FROM organisations
            WHERE name =
              'Falah Pharmacy - Development'
            LIMIT 1;
          `,
    );

    assert.strictEqual(organisationResult.rowCount, 1);

    const organisationId = organisationResult.rows[0].id;

    const userId = organisationResult.rows[0].owner_id;

    const branchResult = await client.query(
      `
            SELECT id
            FROM branches
            WHERE organisation_id = $1
            ORDER BY created_at
            LIMIT 1;
          `,
      [organisationId],
    );

    assert.strictEqual(branchResult.rowCount, 1);

    const branchId = branchResult.rows[0].id;

    const customerResult = await client.query(
      `
            SELECT id
            FROM customers
            WHERE organisation_id = $1
            ORDER BY created_at
            LIMIT 1;
          `,
      [organisationId],
    );

    assert.strictEqual(customerResult.rowCount, 1);

    const customerId = customerResult.rows[0].id;

    // ------------------------------------------------------
    // IMPORTANT:
    //
    // Supplying `client` must bypass Redis and query
    // PostgreSQL using the transaction connection.
    // ------------------------------------------------------

    const before = await getCustomerLedgerDashboardStats(
      organisationId,
      client,
    );

    console.log("Before overdue test:", before);

    // ------------------------------------------------------
    // 31-DAY UNPAID
    // ------------------------------------------------------

    await createTestInvoice({
      organisationId,
      branchId,
      customerId,
      createdBy: userId,
      invoiceDate: daysAgo(31),
      totalAmount: 1000,
      client,
    });

    // ------------------------------------------------------
    // 29-DAY UNPAID
    // ------------------------------------------------------

    await createTestInvoice({
      organisationId,
      branchId,
      customerId,
      createdBy: userId,
      invoiceDate: daysAgo(29),
      totalAmount: 2000,
      client,
    });

    // ------------------------------------------------------
    // 31-DAY FULLY PAID
    // ------------------------------------------------------

    const paidInvoice = await createTestInvoice({
      organisationId,
      branchId,
      customerId,
      createdBy: userId,
      invoiceDate: daysAgo(31),
      totalAmount: 3000,
      client,
    });

    const paidPaymentId = crypto.randomUUID();

    const paidReceiptNumber = await getNextBusinessNumber({
      organisationId,
      branchId,
      sequenceType: "RECEIPT",
      client,
    });

    await client.query(
      `
          INSERT INTO payments (
              id,
              organisation_id,
              branch_id,
              customer_id,
              receipt_number,
              payment_date,
              total_amount,
              status
          )
          VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              CURRENT_TIMESTAMP,
              3000,
              'COMPLETED'
          );
        `,
      [paidPaymentId, organisationId, branchId, customerId, paidReceiptNumber],
    );

    await client.query(
      `
          INSERT INTO payment_allocations (
              id,
              payment_id,
              invoice_id,
              allocated_amount
          )
          VALUES (
              $1,
              $2,
              $3,
              3000
          );
        `,
      [crypto.randomUUID(), paidPaymentId, paidInvoice.id],
    );

    // ------------------------------------------------------
    // 31-DAY PARTIALLY PAID
    // ------------------------------------------------------

    const partialInvoice = await createTestInvoice({
      organisationId,
      branchId,
      customerId,
      createdBy: userId,
      invoiceDate: daysAgo(31),
      totalAmount: 4000,
      client,
    });

    const partialPaymentId = crypto.randomUUID();

    const partialReceiptNumber = await getNextBusinessNumber({
      organisationId,
      branchId,
      sequenceType: "RECEIPT",
      client,
    });

    await client.query(
      `
          INSERT INTO payments (
              id,
              organisation_id,
              branch_id,
              customer_id,
              receipt_number,
              payment_date,
              total_amount,
              status
          )
          VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              CURRENT_TIMESTAMP,
              1500,
              'COMPLETED'
          );
        `,
      [
        partialPaymentId,
        organisationId,
        branchId,
        customerId,
        partialReceiptNumber,
      ],
    );

    await client.query(
      `
          INSERT INTO payment_allocations (
              id,
              payment_id,
              invoice_id,
              allocated_amount
          )
          VALUES (
              $1,
              $2,
              $3,
              1500
          );
        `,
      [crypto.randomUUID(), partialPaymentId, partialInvoice.id],
    );

    // ------------------------------------------------------
    // AFTER
    // ------------------------------------------------------

    const after = await getCustomerLedgerDashboardStats(organisationId, client);

    assert.strictEqual(
      Number(after.overdueAmount) - Number(before.overdueAmount),
      3500,
    );

    console.log("✓ 31-day unpaid invoice counted");

    console.log("✓ 29-day invoice excluded");

    console.log("✓ Fully paid old invoice excluded");

    console.log("✓ Partial payment leaves ₹2,500 overdue");

    console.log("✓ Overdue amount increased by ₹3,500");

    await client.query("ROLLBACK");

    console.log("✓ Overdue test rolled back");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {}

    throw error;
  } finally {
    client.release();
  }
};

// ============================================================
// 5. PAYMENT RECEIPT DASHBOARD
// ============================================================

const testPaymentReceiptDashboard = async () => {
  logSection("PAYMENT RECEIPT DASHBOARD QUERY TEST");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ------------------------------------------------------
    // ORGANISATION A
    // ------------------------------------------------------

    logSection("18. Create Payment Receipt test organisation");

    const organisationA = await createTestOrganisation("RECEIPT-A", client);

    const organisationId = organisationA.organisationId;

    const userAId = organisationA.userId;

    const branchAId = await createTestBranch(
      organisationId,
      "RECEIPT-A",
      client,
    );

    await createTestMembership(organisationId, userAId, client);

    const customerA = await createTestCustomer({
      organisationId,
      fullName: `Receipt Customer A ${uniqueValue()}`,
      phone: "9000000001",
      client,
    });

    // ------------------------------------------------------
    // ORGANISATION B
    // ------------------------------------------------------

    const organisationB = await createTestOrganisation("RECEIPT-B", client);

    const organisationBId = organisationB.organisationId;

    const branchBId = await createTestBranch(
      organisationBId,
      "RECEIPT-B",
      client,
    );

    await createTestMembership(organisationBId, organisationB.userId, client);

    const customerB = await createTestCustomer({
      organisationId: organisationBId,
      fullName: `Receipt Customer B ${uniqueValue()}`,
      phone: "9000000002",
      client,
    });

    // ------------------------------------------------------
    // INVOICES
    // ------------------------------------------------------

    const invoiceA1 = await createTestInvoice({
      organisationId,
      branchId: branchAId,
      customerId: customerA.id,
      createdBy: userAId,
      invoiceDate: daysAgo(2),
      totalAmount: 5000,
      client,
    });

    const invoiceA2 = await createTestInvoice({
      organisationId,
      branchId: branchAId,
      customerId: customerA.id,
      createdBy: userAId,
      invoiceDate: daysAgo(1),
      totalAmount: 3000,
      client,
    });

    // ------------------------------------------------------
    // PAYMENT 1
    // ------------------------------------------------------

    const paymentA1 = await createTestPayment({
      organisationId,
      branchId: branchAId,
      customerId: customerA.id,
      totalAmount: 2000,
      status: "COMPLETED",
      receivedBy: userAId,
      paymentDate: "2026-09-06T08:00:00Z",
      client,
    });

    await createTestPaymentTransaction({
      paymentId: paymentA1.id,
      paymentMethod: "CASH",
      amount: 2000,
      transactionReference: null,
      client,
    });

    await createTestPaymentAllocation({
      paymentId: paymentA1.id,
      invoiceId: invoiceA1.id,
      allocatedAmount: 2000,
      client,
    });

    // ------------------------------------------------------
    // PAYMENT 2 - SPLIT
    // ------------------------------------------------------

    const paymentA2 = await createTestPayment({
      organisationId,
      branchId: branchAId,
      customerId: customerA.id,
      totalAmount: 5000,
      status: "COMPLETED",
      receivedBy: userAId,
      paymentDate: "2026-09-05T10:00:00Z",
      client,
    });

    await createTestPaymentTransaction({
      paymentId: paymentA2.id,
      paymentMethod: "CASH",
      amount: 2000,
      transactionReference: null,
      client,
    });

    await createTestPaymentTransaction({
      paymentId: paymentA2.id,
      paymentMethod: "UPI",
      amount: 3000,
      transactionReference: "UPI-TEST-5000",
      client,
    });

    await createTestPaymentAllocation({
      paymentId: paymentA2.id,
      invoiceId: invoiceA2.id,
      allocatedAmount: 5000,
      client,
    });

    // ------------------------------------------------------
    // PAYMENT 3 - PENDING
    // ------------------------------------------------------

    const paymentA3 = await createTestPayment({
      organisationId,
      branchId: branchAId,
      customerId: customerA.id,
      totalAmount: 750,
      status: "PENDING",
      receivedBy: userAId,
      paymentDate: "2026-09-04T10:00:00Z",
      client,
    });

    await createTestPaymentTransaction({
      paymentId: paymentA3.id,
      paymentMethod: "UPI",
      amount: 750,
      transactionReference: "UPI-PENDING-750",
      client,
    });

    // ------------------------------------------------------
    // PAYMENT 4 - REFUNDED
    // ------------------------------------------------------

    const paymentA4 = await createTestPayment({
      organisationId,
      branchId: branchAId,
      customerId: customerA.id,
      totalAmount: 400,
      status: "REFUNDED",
      receivedBy: userAId,
      paymentDate: "2026-09-03T10:00:00Z",
      client,
    });

    await createTestPaymentTransaction({
      paymentId: paymentA4.id,
      paymentMethod: "CARD",
      amount: 400,
      transactionReference: "CARD-REFUND-400",
      client,
    });

    // ------------------------------------------------------
    // ORGANISATION B PAYMENT
    // ------------------------------------------------------

    const paymentB = await createTestPayment({
      organisationId: organisationBId,
      branchId: branchBId,
      customerId: customerB.id,
      totalAmount: 9999,
      status: "COMPLETED",
      receivedBy: organisationB.userId,
      paymentDate: "2026-09-06T09:00:00Z",
      client,
    });

    await createTestPaymentTransaction({
      paymentId: paymentB.id,
      paymentMethod: "BANK_TRANSFER",
      amount: 9999,
      transactionReference: "B-UTR-9999",
      client,
    });

    // ------------------------------------------------------
    // STATS
    // ------------------------------------------------------

    logSection("19. Payment Receipt dashboard statistics");

    const stats = await getPaymentReceiptDashboardStats(organisationId, client);

    assert(stats);

    assert.strictEqual(Number(stats.total_receipts), 4);

    assert.strictEqual(Number(stats.completed_receipts), 2);

    assert.strictEqual(Number(stats.total_collected), 7000);

    assert.strictEqual(Number(stats.pending_amount), 750);

    assert.strictEqual(Number(stats.refunded_amount), 400);

    console.log("✓ Payment Receipt dashboard statistics");

    // ------------------------------------------------------
    // ROWS
    // ------------------------------------------------------

    logSection("20. Payment Receipt dashboard rows");

    const rows = await getPaymentReceiptDashboardRows({
      organisationId,
      limit: 50,
      offset: 0,
      client,
    });

    assert.strictEqual(rows.length, 4);

    assert(rows.every((row) => row.organisation_id === organisationId));

    const splitReceipt = rows.find((row) => row.id === paymentA2.id);

    assert(splitReceipt);

    assert.strictEqual(splitReceipt.total_amount, "5000.00");

    assert.strictEqual(splitReceipt.payment_method, "CASH + UPI");

    assert.strictEqual(splitReceipt.transaction_reference, "UPI-TEST-5000");

    assert.strictEqual(splitReceipt.invoice_reference, invoiceA2.invoiceNumber);

    assert.strictEqual(splitReceipt.full_name, customerA.full_name);

    assert.strictEqual(
      splitReceipt.received_by_name,
      "Customer Billing Query User RECEIPT-A",
    );

    console.log("✓ Payment Receipt dashboard rows");

    // ------------------------------------------------------
    // SEARCH
    // ------------------------------------------------------

    const receiptSearch = await getPaymentReceiptDashboardRows({
      organisationId,
      searchTerm: paymentA2.receiptNumber,
      limit: 50,
      offset: 0,
      client,
    });

    assert.strictEqual(receiptSearch.length, 1);

    assert.strictEqual(receiptSearch[0].id, paymentA2.id);

    console.log("✓ Receipt search");

    const customerSearch = await getPaymentReceiptDashboardRows({
      organisationId,
      searchTerm: customerA.full_name,
      limit: 50,
      offset: 0,
      client,
    });

    assert.strictEqual(customerSearch.length, 4);

    console.log("✓ Customer search");

    const invoiceSearch = await getPaymentReceiptDashboardRows({
      organisationId,
      searchTerm: invoiceA2.invoiceNumber,
      limit: 50,
      offset: 0,
      client,
    });

    assert.strictEqual(invoiceSearch.length, 1);

    assert.strictEqual(invoiceSearch[0].id, paymentA2.id);

    console.log("✓ Invoice search");

    const transactionSearch = await getPaymentReceiptDashboardRows({
      organisationId,
      searchTerm: "UPI-TEST-5000",
      limit: 50,
      offset: 0,
      client,
    });

    assert.strictEqual(transactionSearch.length, 1);

    assert.strictEqual(transactionSearch[0].id, paymentA2.id);

    console.log("✓ Transaction reference search");

    // ------------------------------------------------------
    // STATUS
    // ------------------------------------------------------

    const pendingRows = await getPaymentReceiptDashboardRows({
      organisationId,
      status: "PENDING",
      limit: 50,
      offset: 0,
      client,
    });

    assert.strictEqual(pendingRows.length, 1);

    assert.strictEqual(pendingRows[0].status, "PENDING");

    console.log("✓ Status filter");

    // ------------------------------------------------------
    // METHOD
    // ------------------------------------------------------

    const upiRows = await getPaymentReceiptDashboardRows({
      organisationId,
      paymentMethod: "UPI",
      limit: 50,
      offset: 0,
      client,
    });

    assert.strictEqual(upiRows.length, 2);

    assert(upiRows.every((row) => row.payment_method.includes("UPI")));

    console.log("✓ Payment method filter");

    // ------------------------------------------------------
    // DATE
    // ------------------------------------------------------

    const dateRows = await getPaymentReceiptDashboardRows({
      organisationId,
      dateFrom: "2026-09-05",
      dateTo: "2026-09-06",
      limit: 50,
      offset: 0,
      client,
    });

    assert.strictEqual(dateRows.length, 2);

    console.log("✓ Date filter");

    // ------------------------------------------------------
    // PAGINATION
    // ------------------------------------------------------

    const firstPage = await getPaymentReceiptDashboardRows({
      organisationId,
      limit: 1,
      offset: 0,
      client,
    });

    const secondPage = await getPaymentReceiptDashboardRows({
      organisationId,
      limit: 1,
      offset: 1,
      client,
    });

    assert.strictEqual(firstPage.length, 1);

    assert.strictEqual(secondPage.length, 1);

    assert.notStrictEqual(firstPage[0].id, secondPage[0].id);

    console.log("✓ Receipt pagination");

    // ------------------------------------------------------
    // TENANT ISOLATION
    // ------------------------------------------------------

    const organisationBRows = await getPaymentReceiptDashboardRows({
      organisationId: organisationBId,
      limit: 50,
      offset: 0,
      client,
    });

    assert.strictEqual(organisationBRows.length, 1);

    assert.strictEqual(Number(organisationBRows[0].total_amount), 9999);

    const crossTenantSearch = await getPaymentReceiptDashboardRows({
      organisationId,
      searchTerm: "B-UTR-9999",
      limit: 50,
      offset: 0,
      client,
    });

    assert.strictEqual(crossTenantSearch.length, 0);

    console.log("✓ Payment Receipt tenant isolation");

    await client.query("ROLLBACK");

    console.log("✓ Payment Receipt fixtures rolled back");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {}

    throw error;
  } finally {
    client.release();
  }
};

// ============================================================
// 6. GENERAL TENANT ISOLATION
// ============================================================

const testTenantIsolation = async (
  developmentOrganisationId,
  developmentCustomerId,
) => {
  logSection("GENERAL TENANT ISOLATION TEST");

  const temporaryUserResult = await pool.query(
    `
          INSERT INTO users (
              email,
              password_hash,
              name,
              status
          )
          VALUES (
              $1,
              $2,
              $3,
              'ACTIVE'
          )
          RETURNING id;
        `,
    [
      `tenant-isolation-${uniqueValue()}@example.com`,
      "test-password-hash",
      "Tenant Isolation User",
    ],
  );

  const userId = temporaryUserResult.rows[0].id;

  const organisationResult = await pool.query(
    `
          INSERT INTO organisations (
              owner_id,
              name
          )
          VALUES (
              $1,
              $2
          )
          RETURNING id;
        `,
    [userId, `Tenant Isolation Organisation ${uniqueValue()}`],
  );

  const organisationBId = organisationResult.rows[0].id;

  const customerNumber = await getNextBusinessNumber({
    organisationId: organisationBId,
    branchId: null,
    sequenceType: "CUSTOMER",
    client: pool,
  });

  const customerResult = await pool.query(
    `
          INSERT INTO customers (
              organisation_id,
              customer_number,
              full_name,
              phone,
              status
          )
          VALUES (
              $1,
              $2,
              $3,
              $4,
              'ACTIVE'
          )
          RETURNING id;
        `,
    [organisationBId, customerNumber, "Other Tenant Customer", "9111111111"],
  );

  const customerBId = customerResult.rows[0].id;

  try {
    const wrongSummary = await getCustomerDetailsSummary(
      organisationBId,
      developmentCustomerId,
    );

    assert.strictEqual(wrongSummary, null);

    const wrongLedger = await getCustomerLedgerSummary(
      organisationBId,
      developmentCustomerId,
    );

    assert.strictEqual(wrongLedger, null);

    const wrongDirectory = await getCustomerDirectoryRows({
      organisationId: developmentOrganisationId,
      searchTerm: "Other Tenant Customer",
      limit: 50,
      offset: 0,
    });

    assert.strictEqual(wrongDirectory.length, 0);

    const ownDirectory = await getCustomerDirectoryRows({
      organisationId: organisationBId,
      searchTerm: "Other Tenant Customer",
      limit: 50,
      offset: 0,
    });

    assert.strictEqual(ownDirectory.length, 1);

    assert.strictEqual(ownDirectory[0].id, customerBId);

    console.log("✓ Customer Details tenant isolation");

    console.log("✓ Customer Ledger tenant isolation");

    console.log("✓ Customer Directory tenant isolation");
  } finally {
    await pool.query(
      `
          DELETE FROM organisations
          WHERE id = $1;
        `,
      [organisationBId],
    );

    await pool.query(
      `
          DELETE FROM users
          WHERE id = $1;
        `,
      [userId],
    );
  }
};

// ============================================================
// 7. REDIS CACHE TESTS
// ============================================================

const testRedisCaching = async (developmentOrganisationId) => {
  logSection("REDIS CACHE INTEGRATION TEST");

  // --------------------------------------------------------
  // 30. BASIC CACHE
  // --------------------------------------------------------

  logSection("30. Basic Redis cache operations");

  const testKey = `organisation:${developmentOrganisationId}:customer-billing:test:${uniqueValue()}`;

  const testValue = {
    test: true,
    timestamp: Date.now(),
  };

  await deleteCache(testKey);

  const missingValue = await getCache(testKey);

  assert.strictEqual(missingValue, null, "Expected initial cache miss.");

  await setCache(testKey, testValue, 60);

  const cachedValue = await getCache(testKey);

  assert(cachedValue, "Expected cached value.");

  assert.deepStrictEqual(cachedValue, testValue);

  await deleteCache(testKey);

  const deletedValue = await getCache(testKey);

  assert.strictEqual(deletedValue, null, "Cache value should be deleted.");

  console.log("✓ Cache miss");

  console.log("✓ Cache write");

  console.log("✓ Cache read");

  console.log("✓ Cache deletion");

  // --------------------------------------------------------
  // 31. DIRECTORY CACHE
  // --------------------------------------------------------

  logSection("31. Customer Directory statistics cache");

  const directoryKey = buildCustomerDirectoryStatsCacheKey(
    developmentOrganisationId,
  );

  await deleteCache(directoryKey);

  const directoryStats = await getCustomerDirectoryStats(
    developmentOrganisationId,
  );

  assert(directoryStats);

  const directoryCache = await getCache(directoryKey);

  assert(directoryCache, "Directory statistics should be cached.");

  assert.deepStrictEqual(directoryCache, directoryStats);

  console.log("✓ Directory stats populated Redis");

  // --------------------------------------------------------
  // 32. DIRECTORY CACHE HIT
  // --------------------------------------------------------

  logSection("32. Customer Directory cache-hit behavior");

  const fakeCachedDirectoryStats = {
    ...directoryStats,
    total_customers: "999",
  };

  await setCache(directoryKey, fakeCachedDirectoryStats, 60);

  const directoryCacheHit = await getCustomerDirectoryStats(
    developmentOrganisationId,
  );

  assert.deepStrictEqual(
    directoryCacheHit,
    fakeCachedDirectoryStats,
    "Repository should return Redis value on cache hit.",
  );

  console.log("✓ Directory repository returns cached value");

  // Restore real cache value.
  await setCache(directoryKey, directoryStats, 60);

  // --------------------------------------------------------
  // 33. LEDGER CACHE
  // --------------------------------------------------------

  logSection("33. Customer Ledger dashboard cache");

  const ledgerKey = buildCustomerLedgerDashboardStatsCacheKey(
    developmentOrganisationId,
  );

  await deleteCache(ledgerKey);

  const ledgerStats = await getCustomerLedgerDashboardStats(
    developmentOrganisationId,
  );

  assert(ledgerStats);

  const ledgerCache = await getCache(ledgerKey);

  assert(ledgerCache, "Ledger dashboard statistics should be cached.");

  assert.deepStrictEqual(ledgerCache, ledgerStats);

  console.log("✓ Ledger stats populated Redis");

  // --------------------------------------------------------
  // 34. LEDGER CACHE HIT
  // --------------------------------------------------------

  logSection("34. Customer Ledger cache-hit behavior");

  const fakeCachedLedgerStats = {
    ...ledgerStats,
    totalOutstanding: "999999",
  };

  await setCache(ledgerKey, fakeCachedLedgerStats, 60);

  const ledgerCacheHit = await getCustomerLedgerDashboardStats(
    developmentOrganisationId,
  );

  assert.deepStrictEqual(
    ledgerCacheHit,
    fakeCachedLedgerStats,
    "Repository should return Redis value on ledger cache hit.",
  );

  console.log("✓ Ledger repository returns cached value");

  await setCache(ledgerKey, ledgerStats, 60);

  // --------------------------------------------------------
  // 35. PAYMENT RECEIPT CACHE
  // --------------------------------------------------------

  logSection("35. Payment Receipt dashboard cache");

  const receiptKey = buildPaymentReceiptDashboardStatsCacheKey(
    developmentOrganisationId,
  );

  await deleteCache(receiptKey);

  const receiptStats = await getPaymentReceiptDashboardStats(
    developmentOrganisationId,
  );

  assert(receiptStats);

  const receiptCache = await getCache(receiptKey);

  assert(receiptCache, "Payment Receipt statistics should be cached.");

  assert.deepStrictEqual(receiptCache, receiptStats);

  console.log("✓ Payment Receipt stats populated Redis");

  // --------------------------------------------------------
  // 36. PAYMENT RECEIPT CACHE HIT
  // --------------------------------------------------------

  logSection("36. Payment Receipt cache-hit behavior");

  const fakeCachedReceiptStats = {
    ...receiptStats,
    total_receipts: "999",
  };

  await setCache(receiptKey, fakeCachedReceiptStats, 60);

  const receiptCacheHit = await getPaymentReceiptDashboardStats(
    developmentOrganisationId,
  );

  assert.deepStrictEqual(
    receiptCacheHit,
    fakeCachedReceiptStats,
    "Repository should return Redis value on receipt cache hit.",
  );

  console.log("✓ Payment Receipt repository returns cached value");

  await setCache(receiptKey, receiptStats, 60);

  // --------------------------------------------------------
  // CLEANUP
  // --------------------------------------------------------

  await clearCustomerBillingDashboardCaches(developmentOrganisationId);

  console.log("✓ Redis dashboard caches cleaned");
};

// ============================================================
// 8. REDIS TENANT ISOLATION
// ============================================================

const testRedisTenantIsolation = async (developmentOrganisationId) => {
  logSection("REDIS TENANT ISOLATION TEST");

  const organisationB = await createTestOrganisation(`CACHE-${uniqueValue()}`);

  const organisationBId = organisationB.organisationId;

  const keyA = buildCustomerDirectoryStatsCacheKey(developmentOrganisationId);

  const keyB = buildCustomerDirectoryStatsCacheKey(organisationBId);

  try {
    assert.notStrictEqual(
      keyA,
      keyB,
      "Different organisations must have different cache keys.",
    );

    await deleteCache(keyA);
    await deleteCache(keyB);

    const statsA = await getCustomerDirectoryStats(developmentOrganisationId);

    const statsB = await getCustomerDirectoryStats(organisationBId);

    assert(statsA);

    assert(statsB);

    const cacheA = await getCache(keyA);

    const cacheB = await getCache(keyB);

    assert(cacheA);

    assert(cacheB);

    assert.deepStrictEqual(cacheA, statsA);

    assert.deepStrictEqual(cacheB, statsB);

    assert.notDeepStrictEqual(cacheA, {
      ...cacheB,
      total_customers: cacheA.total_customers,
    });

    console.log("✓ Organisation-specific cache keys are different");

    console.log("✓ Organisation A cache contains only A data");

    console.log("✓ Organisation B cache contains only B data");
  } finally {
    await deleteCache(keyA);
    await deleteCache(keyB);

    await pool.query(
      `
          DELETE FROM organisations
          WHERE id = $1;
        `,
      [organisationBId],
    );

    await pool.query(
      `
          DELETE FROM users
          WHERE id = $1;
        `,
      [organisationB.userId],
    );
  }
};

// ============================================================
// 9. TRANSACTION CLIENT CACHE BYPASS
// ============================================================

const testTransactionClientCacheBypass = async (developmentOrganisationId) => {
  logSection("TRANSACTION CLIENT REDIS BYPASS TEST");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cacheKey = buildCustomerDirectoryStatsCacheKey(
      developmentOrganisationId,
    );

    await deleteCache(cacheKey);

    // ------------------------------------------------------
    // Populate Redis using normal pool read.
    // ------------------------------------------------------

    const baseline = await getCustomerDirectoryStats(developmentOrganisationId);

    assert(baseline);

    const cachedBaseline = await getCache(cacheKey);

    assert(cachedBaseline);

    // ------------------------------------------------------
    // Create customer inside transaction.
    // ------------------------------------------------------

    const customer = await createTestCustomer({
      organisationId: developmentOrganisationId,
      fullName: `Redis Bypass Customer ${uniqueValue()}`,
      phone: "9222222222",
      client,
    });

    assert(customer);

    // ------------------------------------------------------
    // THIS CALL MUST BYPASS REDIS.
    // ------------------------------------------------------

    const transactionStats = await getCustomerDirectoryStats(
      developmentOrganisationId,
      client,
    );

    assert(transactionStats);

    assert.strictEqual(
      Number(transactionStats.total_customers),
      Number(baseline.total_customers) + 1,
      "Transaction-client query must see uncommitted data.",
    );

    // ------------------------------------------------------
    // Redis must still contain old committed snapshot.
    // ------------------------------------------------------

    const redisAfterTransaction = await getCache(cacheKey);

    assert.deepStrictEqual(
      redisAfterTransaction,
      cachedBaseline,
      "Transaction read must not modify Redis snapshot.",
    );

    console.log("✓ Transaction client bypasses Redis");

    console.log("✓ Transaction client sees uncommitted PostgreSQL data");

    console.log("✓ Redis snapshot remains unchanged during transaction");

    await client.query("ROLLBACK");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {}

    throw error;
  } finally {
    client.release();

    await deleteCache(
      buildCustomerDirectoryStatsCacheKey(developmentOrganisationId),
    );
  }
};

// ============================================================
// 10. CACHE INVALIDATION
// ============================================================

const testCacheInvalidation = async (developmentOrganisationId) => {
  logSection("CACHE INVALIDATION TEST");

  const keys = [
    buildCustomerDirectoryStatsCacheKey(developmentOrganisationId),
    buildCustomerLedgerDashboardStatsCacheKey(developmentOrganisationId),
    buildPaymentReceiptDashboardStatsCacheKey(developmentOrganisationId),
  ];

  // --------------------------------------------------------
  // Populate all caches.
  // --------------------------------------------------------

  await getCustomerDirectoryStats(developmentOrganisationId);

  await getCustomerLedgerDashboardStats(developmentOrganisationId);

  await getPaymentReceiptDashboardStats(developmentOrganisationId);

  // --------------------------------------------------------
  // Confirm cache exists.
  // --------------------------------------------------------

  for (const key of keys) {
    const value = await getCache(key);

    assert(value, `Expected cache value for ${key}`);
  }

  console.log("✓ All dashboard caches populated");

  // --------------------------------------------------------
  // Delete caches.
  //
  // Actual write services will eventually perform these
  // invalidations after successful DB commits.
  // --------------------------------------------------------

  for (const key of keys) {
    await deleteCache(key);
  }

  // --------------------------------------------------------
  // Confirm deletion.
  // --------------------------------------------------------

  for (const key of keys) {
    const value = await getCache(key);

    assert.strictEqual(value, null, `Expected deleted cache key: ${key}`);
  }

  console.log("✓ Directory cache invalidated");

  console.log("✓ Ledger cache invalidated");

  console.log("✓ Payment Receipt cache invalidated");
};

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  let developmentOrganisationId = null;

  let developmentCustomerId = null;

  let redisConnected = false;

  try {
    // --------------------------------------------------------
    // DATABASE
    // --------------------------------------------------------

    await pool.query("SELECT 1");

    console.log("");

    console.log("==========================================================");

    console.log("CUSTOMER & BILLING QUERY REPOSITORY");

    console.log("REDIS-INTEGRATED END-TO-END TEST");

    console.log("==========================================================");

    // --------------------------------------------------------
    // REDIS
    // --------------------------------------------------------

    logSection("SETUP: Connect Redis");

    await connectRedis();

    redisConnected = true;

    console.log("✓ Redis connected");

    // --------------------------------------------------------
    // DEVELOPMENT ORGANISATION
    // --------------------------------------------------------

    logSection("SETUP: Locate development organisation");

    const organisationResult = await pool.query(
      `
          SELECT id
          FROM organisations
          WHERE name =
            'Falah Pharmacy - Development'
          LIMIT 1;
        `,
    );

    assert.strictEqual(
      organisationResult.rowCount,
      1,
      "Development organisation must exist. Run seed-dev.js first.",
    );

    developmentOrganisationId = organisationResult.rows[0].id;

    // --------------------------------------------------------
    // AYESHA
    // --------------------------------------------------------

    const customerResult = await pool.query(
      `
          SELECT id
          FROM customers
          WHERE organisation_id = $1
            AND full_name =
              'Ayesha Khan'
          LIMIT 1;
        `,
      [developmentOrganisationId],
    );

    assert.strictEqual(
      customerResult.rowCount,
      1,
      "Ayesha Khan must exist. Run seed-dev.js first.",
    );

    developmentCustomerId = customerResult.rows[0].id;

    console.log("Development organisation:", developmentOrganisationId);

    console.log("Ayesha customer:", developmentCustomerId);

    // --------------------------------------------------------
    // CLEAR OLD CACHE
    // --------------------------------------------------------

    logSection("SETUP: Clear existing dashboard caches");

    await clearCustomerBillingDashboardCaches(developmentOrganisationId);

    console.log("✓ Existing dashboard caches cleared");

    // --------------------------------------------------------
    // ORIGINAL E2E QUERY TESTS
    // --------------------------------------------------------

    await testCustomerDirectory(developmentOrganisationId);

    await testCustomerDetails(developmentOrganisationId, developmentCustomerId);

    await testCustomerLedger(developmentOrganisationId, developmentCustomerId);

    await testOverdueAgeing();

    await testPaymentReceiptDashboard();

    await testTenantIsolation(developmentOrganisationId, developmentCustomerId);

    // --------------------------------------------------------
    // REDIS TESTS
    // --------------------------------------------------------

    await testRedisCaching(developmentOrganisationId);

    await testRedisTenantIsolation(developmentOrganisationId);

    await testTransactionClientCacheBypass(developmentOrganisationId);

    await testCacheInvalidation(developmentOrganisationId);

    // --------------------------------------------------------
    // FINAL CLEANUP
    // --------------------------------------------------------

    await clearCustomerBillingDashboardCaches(developmentOrganisationId);

    console.log("");

    console.log("==========================================================");

    console.log("CUSTOMER & BILLING QUERY REPOSITORY TEST PASSED");

    console.log("==========================================================");

    console.log("✓ Customer Directory");

    console.log("✓ Customer Details");

    console.log("✓ Purchase History");

    console.log("✓ Purchase Summary");

    console.log("✓ Return History");

    console.log("✓ Customer Ledger");

    console.log("✓ Ledger filtering");

    console.log("✓ Ledger pagination");

    console.log("✓ Ledger dashboard statistics");

    console.log("✓ Overdue ageing");

    console.log("✓ Payment Receipt dashboard statistics");

    console.log("✓ Payment Receipt dashboard rows");

    console.log("✓ Split-payment aggregation");

    console.log("✓ Receipt search");

    console.log("✓ Customer search");

    console.log("✓ Invoice search");

    console.log("✓ Transaction reference search");

    console.log("✓ Receipt status filtering");

    console.log("✓ Payment method filtering");

    console.log("✓ Receipt date filtering");

    console.log("✓ Receipt pagination");

    console.log("✓ Payment Receipt tenant isolation");

    console.log("✓ General tenant isolation");

    console.log("✓ Redis connection");

    console.log("✓ Redis cache miss");

    console.log("✓ Redis cache write");

    console.log("✓ Redis cache read");

    console.log("✓ Redis cache deletion");

    console.log("✓ Directory statistics caching");

    console.log("✓ Directory statistics cache hit");

    console.log("✓ Ledger dashboard caching");

    console.log("✓ Ledger dashboard cache hit");

    console.log("✓ Payment Receipt statistics caching");

    console.log("✓ Payment Receipt statistics cache hit");

    console.log("✓ Tenant-safe Redis cache keys");

    console.log("✓ Transaction-client Redis bypass");

    console.log("✓ Transaction sees uncommitted PostgreSQL data");

    console.log("✓ Redis snapshot preserved during transaction");

    console.log("✓ Dashboard cache invalidation");
  } catch (error) {
    console.log("");

    console.log("==========================================================");

    console.log("CUSTOMER & BILLING QUERY REPOSITORY TEST FAILED");

    console.log("==========================================================");

    console.error(error);

    process.exitCode = 1;
  } finally {
    // --------------------------------------------------------
    // CLOSE REDIS
    // --------------------------------------------------------

    if (redisConnected) {
      logSection("CLOSING REDIS CONNECTION");

      try {
        await disconnectRedis();

        console.log("✓ Redis disconnected");
      } catch (error) {
        console.error("Redis disconnect failed:", error.message);
      }
    }

    // --------------------------------------------------------
    // CLOSE DATABASE
    // --------------------------------------------------------

    logSection("CLOSING DATABASE CONNECTION");

    await pool.end();

    console.log("✓ Database connection closed");
  }
};

main();

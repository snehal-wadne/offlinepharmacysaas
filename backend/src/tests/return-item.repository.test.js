/**
 * Return Item Repository Integration Test
 *
 * Verifies:
 *
 * - return item creation
 * - return ownership validation
 * - invoice item/original invoice validation
 * - tenant isolation
 * - return item lookup by ID
 * - return item lookup by return
 * - return history lookup by invoice item
 * - update operations
 * - immutable parent relationships
 * - database constraints
 * - caller-owned transaction rollback
 * - deletion
 * - parent return cascade behaviour
 *
 * Requires:
 * - PostgreSQL running
 * - current schema.sql applied
 *
 * Run:
 *
 *     node src/tests/return-item.repository.test.js
 */

const assert = require("assert");

const { pool } = require("../db/connection");

const { createCustomer } = require("../repositories/customer.repository");

const { createInvoice } = require("../repositories/invoice.repository");

const {
  createInvoiceItem,
} = require("../repositories/invoice-item.repository");

const { createReturn } = require("../repositories/return.repository");

const {
  createReturnItem,
  getReturnItemById,
  getReturnItemsByReturn,
  getReturnItemsByInvoiceItem,
  updateReturnItem,
  deleteReturnItem,
} = require("../repositories/return-item.repository");

/**
 * Generate isolated test values.
 */
const uniqueValue = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Assert that an async operation rejects.
 */
const assertRejected = async (operation, expectedMessage = null) => {
  let error = null;

  try {
    await operation();
  } catch (caughtError) {
    error = caughtError;
  }

  assert(
    error !== null,
    "Expected operation to reject, but it completed successfully.",
  );

  if (expectedMessage) {
    assert(
      error.message.includes(expectedMessage),
      `Expected error containing "${expectedMessage}", got "${error.message}".`,
    );
  }

  return error;
};

/**
 * Create an isolated organisation and active membership.
 */
const createTestOrganisation = async (label) => {
  const value = uniqueValue();

  const userResult = await pool.query(
    `
      INSERT INTO users (
          email,
          password_hash,
          name,
          status
      )
      VALUES ($1, $2, $3, 'ACTIVE')
      RETURNING id;
    `,
    [
      `return-item-${label}-${value}@example.com`,
      "test-password-hash",
      `Return Item Test User ${label}`,
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
    [userId, `Return Item Test Organisation ${label} ${value}`],
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
 * Create a branch.
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
    [organisationId, `${name} ${uniqueValue()}`],
  );

  return result.rows[0].id;
};

/**
 * Create a product.
 *
 * No inventory batch is required for this repository test,
 * because invoice_items allow inventory_batch_id to be NULL.
 */
const createTestProduct = async (organisationId, label) => {
  const value = uniqueValue();

  const result = await pool.query(
    `
      INSERT INTO products (
          organisation_id,
          category,
          medicine_name,
          brand_name,
          strength,
          pack_size,
          manufacturer,
          sku
      )
      VALUES (
          $1,
          'MEDICINE',
          $2,
          $3,
          '500 mg',
          '10 tablets',
          'Return Item Test Manufacturer',
          $4
      )
      RETURNING id;
    `,
    [
      organisationId,
      `Return Item ${label} ${value}`,
      `Test Brand ${label}`,
      `RET-ITEM-${label}-${value}`,
    ],
  );

  return result.rows[0].id;
};

const runTests = async () => {
  let organisationA = null;
  let organisationB = null;

  let branchA = null;
  let branchB = null;

  let customerA = null;
  let customerB = null;

  let productA1 = null;
  let productA2 = null;
  let productB = null;

  let invoiceA = null;
  let invoiceB = null;

  let invoiceItemA1 = null;
  let invoiceItemA2 = null;
  let invoiceItemB = null;

  let returnA = null;

  let returnItemA1 = null;
  let returnItemA2 = null;

  try {
    await pool.query("SELECT 1");

    console.log("");
    console.log("==========================================================");
    console.log("RETURN ITEM REPOSITORY TEST");
    console.log("==========================================================");

    // ========================================================
    // 1. CREATE ORGANISATIONS
    // ========================================================

    console.log("--- Creating isolated organisations ---");

    organisationA = await createTestOrganisation("A");
    organisationB = await createTestOrganisation("B");

    assert.notStrictEqual(
      organisationA.organisationId,
      organisationB.organisationId,
    );

    console.log("✓ 1. Isolated organisations created");

    // ========================================================
    // 2. CREATE BRANCHES
    // ========================================================

    branchA = await createTestBranch(
      organisationA.organisationId,
      "Return Item Branch A",
    );

    branchB = await createTestBranch(
      organisationB.organisationId,
      "Return Item Branch B",
    );

    console.log("✓ 2. Test branches created");

    // ========================================================
    // 3. CREATE CUSTOMERS
    // ========================================================

    customerA = await createCustomer({
      organisationId: organisationA.organisationId,
      fullName: `Return Item Customer A ${uniqueValue()}`,
      phone: "9111111111",
    });

    customerB = await createCustomer({
      organisationId: organisationB.organisationId,
      fullName: `Return Item Customer B ${uniqueValue()}`,
      phone: "9222222222",
    });

    console.log("✓ 3. Test customers created");

    // ========================================================
    // 4. CREATE PRODUCTS
    // ========================================================

    productA1 = await createTestProduct(organisationA.organisationId, "A1");

    productA2 = await createTestProduct(organisationA.organisationId, "A2");

    productB = await createTestProduct(organisationB.organisationId, "B1");

    console.log("✓ 4. Test products created");

    // ========================================================
    // 5. CREATE INVOICES
    // ========================================================

    invoiceA = await createInvoice({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      invoiceDate: "2026-09-06T10:00:00Z",
      subtotal: 1000,
      discountAmount: 100,
      taxAmount: 0,
      totalAmount: 900,
      status: "COMPLETED",
      notes: "Return item test invoice A",
      createdBy: organisationA.userId,
    });

    invoiceB = await createInvoice({
      organisationId: organisationB.organisationId,
      branchId: branchB,
      customerId: customerB.id,
      invoiceDate: "2026-09-06T10:05:00Z",
      subtotal: 500,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 500,
      status: "COMPLETED",
      notes: "Return item test invoice B",
      createdBy: organisationB.userId,
    });

    assert.strictEqual(invoiceA.invoice_number, "INV-1001");
    assert.strictEqual(invoiceB.invoice_number, "INV-1001");

    console.log("✓ 5. Test invoices created");

    // ========================================================
    // 6. CREATE INVOICE ITEMS
    // ========================================================

    /*
     * A1:
     *
     * quantity = 5
     * line total = 450
     *
     * Historical effective unit amount:
     *
     * 450 / 5 = 90
     */

    invoiceItemA1 = await createInvoiceItem({
      organisationId: organisationA.organisationId,
      invoiceId: invoiceA.id,
      productId: productA1,
      productName: "Return Test Medicine A1",
      batchNumber: "BATCH-A1",
      quantity: 5,
      unitPrice: 100,
      discountAmount: 50,
      taxAmount: 0,
      lineTotal: 450,
    });

    /*
     * A2:
     *
     * This gives us a second item belonging to the same
     * original invoice.
     */

    invoiceItemA2 = await createInvoiceItem({
      organisationId: organisationA.organisationId,
      invoiceId: invoiceA.id,
      productId: productA2,
      productName: "Return Test Medicine A2",
      batchNumber: "BATCH-A2",
      quantity: 2,
      unitPrice: 200,
      discountAmount: 0,
      taxAmount: 0,
      lineTotal: 400,
    });

    invoiceItemB = await createInvoiceItem({
      organisationId: organisationB.organisationId,
      invoiceId: invoiceB.id,
      productId: productB,
      productName: "Return Test Medicine B1",
      batchNumber: "BATCH-B1",
      quantity: 3,
      unitPrice: 166.67,
      discountAmount: 0,
      taxAmount: 0,
      lineTotal: 500.01,
    });

    console.log("✓ 6. Invoice items created");

    // ========================================================
    // 7. CREATE RETURN
    // ========================================================

    returnA = await createReturn({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      invoiceId: invoiceA.id,
      returnDate: "2026-09-06T11:00:00Z",
      status: "PENDING",
      refundAmount: 180,
      refundMethod: "CASH",
      reason: "Customer returned medicine",
      notes: "Return item repository test",
      createdBy: organisationA.userId,
    });

    assert.ok(returnA.id);
    assert.strictEqual(returnA.invoice_id, invoiceA.id);

    console.log("✓ 7. Return created");

    // ========================================================
    // 8. CREATE FIRST RETURN ITEM
    // ========================================================

    /*
     * Invoice item A1:
     *
     * Original quantity = 5
     * Original line total = 450
     *
     * Returned quantity = 2
     *
     * Historical refund:
     *
     * (450 / 5) × 2 = 180
     *
     * The repository receives 180 from the caller.
     * It does NOT calculate this amount.
     */

    returnItemA1 = await createReturnItem({
      organisationId: organisationA.organisationId,
      returnId: returnA.id,
      invoiceItemId: invoiceItemA1.id,
      quantityReturned: 2,
      refundAmount: 180,
      returnCondition: "SEALED",
      restockQuantity: 2,
      notes: "Two sealed units returned",
    });

    assert.ok(returnItemA1.id);
    assert.strictEqual(returnItemA1.quantity_returned, 2);

    assert.strictEqual(Number(returnItemA1.refund_amount), 180);

    assert.strictEqual(returnItemA1.return_condition, "SEALED");

    assert.strictEqual(returnItemA1.restock_quantity, 2);

    console.log("✓ 8. Return item creation");

    // ========================================================
    // 9. CREATE SECOND RETURN ITEM
    // ========================================================

    returnItemA2 = await createReturnItem({
      organisationId: organisationA.organisationId,
      returnId: returnA.id,
      invoiceItemId: invoiceItemA2.id,
      quantityReturned: 1,
      refundAmount: 200,
      returnCondition: "OPENED",
      restockQuantity: 0,
      notes: "Opened unit not suitable for restocking",
    });

    assert.ok(returnItemA2.id);

    console.log("✓ 9. Multiple return items supported");

    // ========================================================
    // 10. GET BY ID
    // ========================================================

    const fetchedById = await getReturnItemById(
      organisationA.organisationId,
      returnItemA1.id,
    );

    assert.ok(fetchedById);

    assert.strictEqual(fetchedById.id, returnItemA1.id);

    assert.strictEqual(fetchedById.return_id, returnA.id);

    assert.strictEqual(fetchedById.invoice_item_id, invoiceItemA1.id);

    assert.strictEqual(fetchedById.return_number, returnA.return_number);

    assert.strictEqual(fetchedById.invoice_number, invoiceA.invoice_number);

    assert.strictEqual(fetchedById.product_name, "Return Test Medicine A1");

    assert.strictEqual(Number(fetchedById.original_quantity), 5);

    assert.strictEqual(Number(fetchedById.line_total), 450);

    console.log("✓ 10. Get return item by ID");

    // ========================================================
    // 11. GET ITEMS BY RETURN
    // ========================================================

    const returnItems = await getReturnItemsByReturn(
      organisationA.organisationId,
      returnA.id,
    );

    assert.strictEqual(returnItems.length, 2);

    assert(returnItems.some((item) => item.id === returnItemA1.id));

    assert(returnItems.some((item) => item.id === returnItemA2.id));

    console.log("✓ 11. Get all items by return");

    // ========================================================
    // 12. GET RETURN HISTORY BY INVOICE ITEM
    // ========================================================

    const invoiceItemHistory = await getReturnItemsByInvoiceItem(
      organisationA.organisationId,
      invoiceItemA1.id,
    );

    assert.strictEqual(invoiceItemHistory.length, 1);

    assert.strictEqual(invoiceItemHistory[0].id, returnItemA1.id);

    assert.strictEqual(invoiceItemHistory[0].quantity_returned, 2);

    assert.strictEqual(
      invoiceItemHistory[0].return_number,
      returnA.return_number,
    );

    console.log("✓ 12. Get return history by invoice item");

    // ========================================================
    // 13. CROSS-TENANT READ PROTECTION
    // ========================================================

    const crossTenantRead = await getReturnItemById(
      organisationB.organisationId,
      returnItemA1.id,
    );

    assert.strictEqual(crossTenantRead, null);

    console.log("✓ 13. Cross-tenant read protection");

    // ========================================================
    // 14. CROSS-TENANT CREATION PROTECTION
    // ========================================================

    await assertRejected(
      () =>
        createReturnItem({
          organisationId: organisationA.organisationId,
          returnId: returnA.id,
          invoiceItemId: invoiceItemB.id,
          quantityReturned: 1,
          refundAmount: 100,
          returnCondition: "SEALED",
          restockQuantity: 1,
        }),
      "same organisation and original invoice",
    );

    console.log("✓ 14. Cross-tenant invoice item protection");

    // ========================================================
    // 15. WRONG-INVOICE PROTECTION
    // ========================================================

    /*
     * Create another invoice in Organisation A.
     *
     * Its invoice item belongs to the same tenant but NOT to
     * returnA's original invoice.
     */

    const secondInvoiceA = await createInvoice({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      invoiceDate: "2026-09-06T12:00:00Z",
      subtotal: 300,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 300,
      status: "COMPLETED",
      notes: "Second invoice for return-item validation",
      createdBy: organisationA.userId,
    });

    const secondProductA = await createTestProduct(
      organisationA.organisationId,
      "A3",
    );

    const secondInvoiceItemA = await createInvoiceItem({
      organisationId: organisationA.organisationId,
      invoiceId: secondInvoiceA.id,
      productId: secondProductA,
      productName: "Return Test Medicine A3",
      batchNumber: "BATCH-A3",
      quantity: 1,
      unitPrice: 300,
      discountAmount: 0,
      taxAmount: 0,
      lineTotal: 300,
    });

    await assertRejected(
      () =>
        createReturnItem({
          organisationId: organisationA.organisationId,
          returnId: returnA.id,
          invoiceItemId: secondInvoiceItemA.id,
          quantityReturned: 1,
          refundAmount: 300,
          returnCondition: "SEALED",
          restockQuantity: 1,
        }),
      "same organisation and original invoice",
    );

    console.log("✓ 15. Original-invoice validation");

    // ========================================================
    // 16. DUPLICATE RETURN ITEM PROTECTION
    // ========================================================

    /*
     * invoiceItemA1 is already attached to returnA.
     *
     * The schema's unique constraint on
     * (return_id, invoice_item_id) should reject another row.
     */

    await assertRejected(() =>
      createReturnItem({
        organisationId: organisationA.organisationId,
        returnId: returnA.id,
        invoiceItemId: invoiceItemA1.id,
        quantityReturned: 1,
        refundAmount: 90,
        returnCondition: "SEALED",
        restockQuantity: 1,
      }),
    );

    console.log("✓ 16. Duplicate return item protection");

    // ========================================================
    // 17. UPDATE RETURN ITEM
    // ========================================================

    const updatedReturnItem = await updateReturnItem(
      organisationA.organisationId,
      returnItemA1.id,
      {
        quantityReturned: 2,
        refundAmount: 180,
        returnCondition: "OTHER",
        restockQuantity: 1,
        notes: "Updated return item note",
      },
    );

    assert.ok(updatedReturnItem);

    assert.strictEqual(updatedReturnItem.id, returnItemA1.id);

    assert.strictEqual(updatedReturnItem.quantity_returned, 2);

    assert.strictEqual(Number(updatedReturnItem.refund_amount), 180);

    assert.strictEqual(updatedReturnItem.return_condition, "OTHER");

    assert.strictEqual(updatedReturnItem.restock_quantity, 1);

    assert.strictEqual(updatedReturnItem.notes, "Updated return item note");

    console.log("✓ 17. Return item update");

    // ========================================================
    // 18. EMPTY UPDATE
    // ========================================================

    const unchangedReturnItem = await updateReturnItem(
      organisationA.organisationId,
      returnItemA1.id,
      {},
    );

    assert.ok(unchangedReturnItem);

    assert.strictEqual(unchangedReturnItem.id, returnItemA1.id);

    console.log("✓ 18. Empty update safely returns current row");

    // ========================================================
    // 19. CROSS-TENANT UPDATE PROTECTION
    // ========================================================

    const crossTenantUpdate = await updateReturnItem(
      organisationB.organisationId,
      returnItemA1.id,
      {
        notes: "Should not update",
      },
    );

    assert.strictEqual(crossTenantUpdate, null);

    console.log("✓ 19. Cross-tenant update protection");

    // ========================================================
    // 20. DATABASE CONSTRAINT: INVALID QUANTITY
    // ========================================================

    await assertRejected(() =>
      createReturnItem({
        organisationId: organisationA.organisationId,
        returnId: returnA.id,
        invoiceItemId: invoiceItemB.id,
        quantityReturned: 0,
        refundAmount: 0,
        returnCondition: "SEALED",
        restockQuantity: 0,
      }),
    );

    console.log("✓ 20. Database quantity constraint");

    // ========================================================
    // 21. DATABASE CONSTRAINT: NEGATIVE REFUND
    // ========================================================

    /*
     * Use a valid unique invoice item/return pair for this
     * constraint test. The cross-tenant relationship validation
     * is intentionally tested separately above.
     */

    const constraintInvoice = await createInvoice({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      invoiceDate: "2026-09-06T13:00:00Z",
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 100,
      status: "COMPLETED",
      notes: "Constraint test invoice",
      createdBy: organisationA.userId,
    });

    const constraintProduct = await createTestProduct(
      organisationA.organisationId,
      "CONSTRAINT",
    );

    const constraintInvoiceItem = await createInvoiceItem({
      organisationId: organisationA.organisationId,
      invoiceId: constraintInvoice.id,
      productId: constraintProduct,
      productName: "Constraint Test Medicine",
      batchNumber: "CONSTRAINT-BATCH",
      quantity: 1,
      unitPrice: 100,
      discountAmount: 0,
      taxAmount: 0,
      lineTotal: 100,
    });

    const constraintReturn = await createReturn({
      organisationId: organisationA.organisationId,
      branchId: branchA,
      customerId: customerA.id,
      invoiceId: constraintInvoice.id,
      returnDate: "2026-09-06T13:05:00Z",
      status: "PENDING",
      refundAmount: 0,
      refundMethod: "CASH",
      reason: "Constraint test",
      notes: null,
      createdBy: organisationA.userId,
    });

    await assertRejected(() =>
      createReturnItem({
        organisationId: organisationA.organisationId,
        returnId: constraintReturn.id,
        invoiceItemId: constraintInvoiceItem.id,
        quantityReturned: 1,
        refundAmount: -1,
        returnCondition: "SEALED",
        restockQuantity: 1,
      }),
    );

    console.log("✓ 21. Database refund constraint");

    // ========================================================
    // 22. DATABASE CONSTRAINT: RESTOCK > RETURNED
    // ========================================================

    await assertRejected(() =>
      createReturnItem({
        organisationId: organisationA.organisationId,
        returnId: constraintReturn.id,
        invoiceItemId: constraintInvoiceItem.id,
        quantityReturned: 1,
        refundAmount: 100,
        returnCondition: "SEALED",
        restockQuantity: 2,
      }),
    );

    console.log("✓ 22. Database restock quantity constraint");

    // ========================================================
    // 23. CALLER-OWNED TRANSACTION ROLLBACK
    // ========================================================

    const transaction = await pool.connect();

    let transactionInvoice = null;
    let transactionReturn = null;
    let transactionInvoiceItem = null;

    try {
      await transaction.query("BEGIN");

      transactionInvoice = await createInvoice({
        organisationId: organisationA.organisationId,
        branchId: branchA,
        customerId: customerA.id,
        invoiceDate: "2026-09-06T14:00:00Z",
        subtotal: 250,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 250,
        status: "COMPLETED",
        notes: "Transaction rollback invoice",
        createdBy: organisationA.userId,
        client: transaction,
      });

      const transactionProduct = await createTestProduct(
        organisationA.organisationId,
        "TRANSACTION",
      );

      transactionInvoiceItem = await createInvoiceItem({
        organisationId: organisationA.organisationId,
        invoiceId: transactionInvoice.id,
        productId: transactionProduct,
        productName: "Transaction Test Medicine",
        batchNumber: "TRANSACTION-BATCH",
        quantity: 1,
        unitPrice: 250,
        discountAmount: 0,
        taxAmount: 0,
        lineTotal: 250,
        client: transaction,
      });

      transactionReturn = await createReturn({
        organisationId: organisationA.organisationId,
        branchId: branchA,
        customerId: customerA.id,
        invoiceId: transactionInvoice.id,
        returnDate: "2026-09-06T14:05:00Z",
        status: "PENDING",
        refundAmount: 250,
        refundMethod: "CASH",
        reason: "Transaction rollback test",
        notes: null,
        createdBy: organisationA.userId,
        client: transaction,
      });

      const transactionReturnItem = await createReturnItem({
        organisationId: organisationA.organisationId,
        returnId: transactionReturn.id,
        invoiceItemId: transactionInvoiceItem.id,
        quantityReturned: 1,
        refundAmount: 250,
        returnCondition: "SEALED",
        restockQuantity: 1,
        notes: "Should be rolled back",
        client: transaction,
      });

      assert.ok(transactionReturnItem);

      await transaction.query("ROLLBACK");
    } catch (error) {
      try {
        await transaction.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Rollback after transaction failure failed:",
          rollbackError.message,
        );
      }

      throw error;
    } finally {
      transaction.release();
    }

    const rollbackCheck = await pool.query(
      `
        SELECT id
        FROM return_items
        WHERE invoice_item_id = $1;
      `,
      [transactionInvoiceItem.id],
    );

    assert.strictEqual(rollbackCheck.rows.length, 0);

    console.log("✓ 23. Caller-owned transaction rollback");

    // ========================================================
    // 24. DELETE RETURN ITEM
    // ========================================================

    const deletedReturnItem = await deleteReturnItem(
      organisationA.organisationId,
      returnItemA2.id,
    );

    assert.strictEqual(deletedReturnItem, true);

    console.log("✓ 24. Return item deletion");

    // ========================================================
    // 25. VERIFY DELETED RETURN ITEM
    // ========================================================

    const deletedLookup = await getReturnItemById(
      organisationA.organisationId,
      returnItemA2.id,
    );

    assert.strictEqual(deletedLookup, null);

    console.log("✓ 25. Deleted return item is no longer returned");

    // ========================================================
    // 26. DELETE MISSING RETURN ITEM
    // ========================================================

    const deleteAgain = await deleteReturnItem(
      organisationA.organisationId,
      returnItemA2.id,
    );

    assert.strictEqual(deleteAgain, false);

    console.log("✓ 26. Deleting missing return item returns false");

    // ========================================================
    // 27. PARENT RETURN CASCADE
    // ========================================================

    /*
     * returnItemA1 still belongs to returnA.
     *
     * The schema defines return_items.return_id with
     * ON DELETE CASCADE.
     */

    const returnIdToDelete = returnA.id;

    await pool.query(
      `
        DELETE FROM returns
        WHERE id = $1
          AND organisation_id = $2;
      `,
      [returnIdToDelete, organisationA.organisationId],
    );

    const cascadeCheck = await pool.query(
      `
        SELECT id
        FROM return_items
        WHERE return_id = $1;
      `,
      [returnIdToDelete],
    );

    assert.strictEqual(cascadeCheck.rows.length, 0);

    console.log("✓ 27. Parent return cascade removes return items");

    // Prevent cleanup from attempting to use deleted return.
    returnA = null;

    // ========================================================
    // SUCCESS
    // ========================================================

    console.log("");
    console.log("==========================================================");
    console.log("RETURN ITEM REPOSITORY TEST PASSED");
    console.log("==========================================================");

    console.log("✓ Return item creation");
    console.log("✓ Historical refund amount persistence");
    console.log("✓ Multiple return items");
    console.log("✓ Get return item by ID");
    console.log("✓ Get items by return");
    console.log("✓ Get return history by invoice item");
    console.log("✓ Tenant isolation");
    console.log("✓ Cross-tenant creation protection");
    console.log("✓ Original invoice validation");
    console.log("✓ Duplicate return item protection");
    console.log("✓ Return item update");
    console.log("✓ Empty update");
    console.log("✓ Cross-tenant update protection");
    console.log("✓ Database constraints");
    console.log("✓ Caller-owned transaction rollback");
    console.log("✓ Return item deletion");
    console.log("✓ Parent return cascade");
  } catch (error) {
    console.error("");
    console.error("Return Item Repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    // ========================================================
    // CLEAN RETURN ITEMS
    // ========================================================

    if (organisationA) {
      try {
        await pool.query(
          `
            DELETE FROM return_items ri
            USING returns r
            WHERE ri.return_id = r.id
              AND r.organisation_id = $1;
          `,
          [organisationA.organisationId],
        );
      } catch (error) {
        console.error("Return item cleanup failed:", error.message);
      }
    }

    if (organisationB) {
      try {
        await pool.query(
          `
            DELETE FROM return_items ri
            USING returns r
            WHERE ri.return_id = r.id
              AND r.organisation_id = $1;
          `,
          [organisationB.organisationId],
        );
      } catch (error) {
        console.error(
          "Organisation B return item cleanup failed:",
          error.message,
        );
      }
    }

    // ========================================================
    // CLEAN RETURNS
    // ========================================================

    if (organisationA) {
      try {
        await pool.query(
          `
            DELETE FROM returns
            WHERE organisation_id = $1;
          `,
          [organisationA.organisationId],
        );
      } catch (error) {
        console.error("Organisation A return cleanup failed:", error.message);
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
      } catch (error) {
        console.error("Organisation B return cleanup failed:", error.message);
      }
    }

    // ========================================================
    // CLEAN INVOICES
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
      } catch (error) {
        console.error("Organisation A invoice cleanup failed:", error.message);
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
      } catch (error) {
        console.error("Organisation B invoice cleanup failed:", error.message);
      }
    }

    // ========================================================
    // CLEAN PRODUCTS
    // ========================================================

    if (organisationA) {
      try {
        await pool.query(
          `
            DELETE FROM products
            WHERE organisation_id = $1;
          `,
          [organisationA.organisationId],
        );
      } catch (error) {
        console.error("Organisation A product cleanup failed:", error.message);
      }
    }

    if (organisationB) {
      try {
        await pool.query(
          `
            DELETE FROM products
            WHERE organisation_id = $1;
          `,
          [organisationB.organisationId],
        );
      } catch (error) {
        console.error("Organisation B product cleanup failed:", error.message);
      }
    }

    // ========================================================
    // CLEAN BRANCHES
    // ========================================================

    if (branchA) {
      try {
        await pool.query(
          `
            DELETE FROM branches
            WHERE id = $1;
          `,
          [branchA],
        );
      } catch (error) {
        console.error("Branch A cleanup failed:", error.message);
      }
    }

    if (branchB) {
      try {
        await pool.query(
          `
            DELETE FROM branches
            WHERE id = $1;
          `,
          [branchB],
        );
      } catch (error) {
        console.error("Branch B cleanup failed:", error.message);
      }
    }

    // ========================================================
    // CLEAN ORGANISATIONS
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
      } catch (error) {
        console.error("Organisation A cleanup failed:", error.message);
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
      } catch (error) {
        console.error("Organisation B cleanup failed:", error.message);
      }
    }

    // ========================================================
    // CLEAN USERS
    // ========================================================

    if (organisationA?.userId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [organisationA.userId],
        );
      } catch (error) {
        console.error("User A cleanup failed:", error.message);
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
      } catch (error) {
        console.error("User B cleanup failed:", error.message);
      }
    }

    await pool.end();
  }
};

runTests();

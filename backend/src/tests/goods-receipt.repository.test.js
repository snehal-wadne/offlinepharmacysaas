/**
 * Goods Receipt Repository Integration Tests
 *
 * Tests the Goods Receipt Repository against the real
 * PostgreSQL database and local Redis instance.
 *
 * The tests verify:
 *
 * - Goods receipt creation
 * - Goods receipt item creation
 * - PostgreSQL transaction behaviour
 * - Receipt cache miss and population
 * - Receipt cache hit
 * - Tenant-safe receipt cache keys
 * - Receipt item retrieval
 * - Receipts by purchase
 * - Receipts by organisation
 * - Receipts by branch
 * - Receipt search
 * - Status update
 * - Cache invalidation after status update
 * - Fresh receipt after cache invalidation
 * - Receipt deletion
 * - Cache invalidation after deletion
 * - Receipt items are removed by cascade
 * - Deleting a missing receipt returns false
 */

require("dotenv").config();

const assert = require("assert");

const {
  createGoodsReceipt,
  getGoodsReceiptById,
  getGoodsReceiptItems,
  getGoodsReceiptsByPurchase,
  getGoodsReceiptsByOrganisation,
  getGoodsReceiptsByBranch,
  searchGoodsReceipts,
  updateGoodsReceiptStatus,
  deleteGoodsReceipt,
} = require("../repositories/goods-receipt.repository");

const {
  createPurchase,
  getPurchaseItems,
  deletePurchase,
} = require("../repositories/purchase.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const {
  getCache,
  deleteCache,
} = require("../cache/cache");

const uniqueValue = (prefix) =>
  `${prefix}-${Date.now()}`;

const buildGoodsReceiptCacheKey = (
  organisationId,
  receiptId,
) =>
  `organisation:${organisationId}:goods-receipt:${receiptId}`;

const runTests = async () => {
  let ownerId = null;
  let organisationId = null;
  let branchId = null;
  let supplierId = null;
  let productId = null;
  let purchaseId = null;
  let purchaseItemId = null;
  let receiptId = null;

  try {
    await pool.query("SELECT 1");

    await connectRedis();

    console.log(
      "\nRunning Goods Receipt Repository tests...\n",
    );

    // ---------------------------------------------------------
    // Create test owner
    // ---------------------------------------------------------

    const ownerResult = await pool.query(
      `
        INSERT INTO users (
          email,
          password_hash,
          name,
          status
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id;
      `,
      [
        `${uniqueValue("goods-receipt-owner")}@test.local`,
        "test-password",
        "Goods Receipt Test Owner",
        "ACTIVE",
      ],
    );

    ownerId = ownerResult.rows[0].id;

    console.log(
      "✓ 1. Create test owner",
    );

    // ---------------------------------------------------------
    // Create test organisation
    // ---------------------------------------------------------

    const organisationResult = await pool.query(
      `
        INSERT INTO organisations (
          owner_id,
          name
        )
        VALUES ($1, $2)
        RETURNING id;
      `,
      [
        ownerId,
        uniqueValue("Goods Receipt Test Pharmacy"),
      ],
    );

    organisationId =
      organisationResult.rows[0].id;

    console.log(
      "✓ 2. Create test organisation",
    );

    // ---------------------------------------------------------
    // Create test branch
    // ---------------------------------------------------------

    const branchResult = await pool.query(
      `
        INSERT INTO branches (
          organisation_id,
          name,
          address,
          city,
          state,
          postal_code,
          phone
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `,
      [
        organisationId,
        "Goods Receipt Test Branch",
        "123 Receipt Street",
        "Test City",
        "Test State",
        "400001",
        "9000000001",
      ],
    );

    branchId =
      branchResult.rows[0].id;

    console.log(
      "✓ 3. Create test branch",
    );

    // ---------------------------------------------------------
    // Create test supplier
    // ---------------------------------------------------------

    const supplierResult = await pool.query(
      `
        INSERT INTO suppliers (
          organisation_id,
          name,
          contact_person,
          phone,
          email,
          city,
          gstin,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id;
      `,
      [
        organisationId,
        "Goods Receipt Test Supplier",
        "Receipt Supplier Contact",
        "9876543210",
        "receipt-supplier@test.local",
        "Delhi",
        uniqueValue("GST"),
        "ACTIVE",
      ],
    );

    supplierId =
      supplierResult.rows[0].id;

    console.log(
      "✓ 4. Create test supplier",
    );

    // ---------------------------------------------------------
    // Create test product
    // ---------------------------------------------------------

    const productResult = await pool.query(
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id;
      `,
      [
        organisationId,
        "Medicines",
        "Paracetamol",
        "Goods Receipt Test Brand",
        "650mg",
        "15 Tablets",
        "Test Manufacturer",
        uniqueValue("SKU"),
      ],
    );

    productId =
      productResult.rows[0].id;

    console.log(
      "✓ 5. Create test product",
    );

    // ---------------------------------------------------------
    // Create test purchase
    //
    // Goods receipt items reference purchase_items, so a real
    // purchase and purchase item are required first.
    // ---------------------------------------------------------

    const purchase =
      await createPurchase({
        organisationId,
        purchaseNumber:
          uniqueValue("PO"),
        supplierId,
        branchId,
        orderDate: "2026-09-03",
        expectedDate: "2026-09-10",
        status: "PENDING",
        notes:
          "Goods receipt repository integration test",
        createdBy: ownerId,
        items: [
          {
            productId,
            orderedQuantity: 100,
            unitCost: 10,
            taxAmount: 50,
            discountAmount: 20,
          },
        ],
      });

    assert.ok(purchase);

    assert.ok(purchase.id);

    assert.ok(
      Array.isArray(purchase.items),
    );

    assert.strictEqual(
      purchase.items.length,
      1,
    );

    purchaseId =
      purchase.id;

    purchaseItemId =
      purchase.items[0].id;

    console.log(
      "✓ 6. Create test purchase and purchase item",
    );

    // ---------------------------------------------------------
    // Verify purchase item exists
    // ---------------------------------------------------------

    const purchaseItems =
      await getPurchaseItems(
        organisationId,
        purchaseId,
      );

    assert.strictEqual(
      purchaseItems.length,
      1,
    );

    assert.strictEqual(
      purchaseItems[0].id,
      purchaseItemId,
    );

    assert.strictEqual(
      purchaseItems[0].product_id,
      productId,
    );

    console.log(
      "✓ 7. Verify purchase item",
    );

    // ---------------------------------------------------------
    // Create goods receipt
    // ---------------------------------------------------------

    const receiptNumber =
      uniqueValue("GRN");

    const goodsReceipt =
      await createGoodsReceipt({
        organisationId,
        purchaseId,
        receiptNumber,
        receivedDate: "2026-09-03",
        receivedBy: ownerId,
        supplierInvoiceNumber:
          uniqueValue("INV"),
        packageCount: 5,
        status:
          "PENDING_INSPECTION",
        notes:
          "Goods receipt repository integration test",
        items: [
          {
            purchaseItemId,
            receivedQuantity: 100,
            rejectedQuantity: 5,
          },
        ],
      });

    assert.ok(goodsReceipt);

    assert.ok(goodsReceipt.id);

    assert.strictEqual(
      goodsReceipt.organisation_id,
      organisationId,
    );

    assert.strictEqual(
      goodsReceipt.purchase_id,
      purchaseId,
    );

    assert.strictEqual(
      goodsReceipt.receipt_number,
      receiptNumber,
    );

    assert.strictEqual(
      goodsReceipt.received_by,
      ownerId,
    );

    assert.strictEqual(
      goodsReceipt.package_count,
      5,
    );

    assert.strictEqual(
      goodsReceipt.status,
      "PENDING_INSPECTION",
    );

    assert.ok(
      Array.isArray(goodsReceipt.items),
    );

    assert.strictEqual(
      goodsReceipt.items.length,
      1,
    );

    assert.strictEqual(
      goodsReceipt.items[0].purchase_item_id,
      purchaseItemId,
    );

    assert.strictEqual(
      goodsReceipt.items[0].received_quantity,
      100,
    );

    assert.strictEqual(
      goodsReceipt.items[0].rejected_quantity,
      5,
    );

    receiptId =
      goodsReceipt.id;

    console.log(
      "✓ 8. Create goods receipt with receipt item",
    );

    // ---------------------------------------------------------
    // Ensure receipt cache is clean
    // ---------------------------------------------------------

    const receiptCacheKey =
      buildGoodsReceiptCacheKey(
        organisationId,
        receiptId,
      );

    await deleteCache(
      receiptCacheKey,
    );

    assert.strictEqual(
      await getCache(
        receiptCacheKey,
      ),
      null,
    );

    // ---------------------------------------------------------
    // Get receipt by ID - cache miss
    // ---------------------------------------------------------

    const firstReceiptLookup =
      await getGoodsReceiptById(
        organisationId,
        receiptId,
      );

    assert.ok(
      firstReceiptLookup,
    );

    assert.strictEqual(
      firstReceiptLookup.id,
      receiptId,
    );

    assert.strictEqual(
      firstReceiptLookup.organisation_id,
      organisationId,
    );

    assert.strictEqual(
      firstReceiptLookup.purchase_id,
      purchaseId,
    );

    assert.strictEqual(
      firstReceiptLookup.purchase_number,
      purchase.purchase_number,
    );

    assert.strictEqual(
      firstReceiptLookup.supplier_name,
      "Goods Receipt Test Supplier",
    );

    assert.strictEqual(
      firstReceiptLookup.branch_name,
      "Goods Receipt Test Branch",
    );

    assert.strictEqual(
      firstReceiptLookup.receipt_number,
      receiptNumber,
    );

    assert.strictEqual(
      firstReceiptLookup.status,
      "PENDING_INSPECTION",
    );

    const cachedReceipt =
      await getCache(
        receiptCacheKey,
      );

    assert.ok(
      cachedReceipt,
    );

    assert.strictEqual(
      cachedReceipt.id,
      receiptId,
    );

    assert.strictEqual(
      cachedReceipt.status,
      "PENDING_INSPECTION",
    );

    console.log(
      "✓ 9. Goods receipt cache miss populates Redis",
    );

    // ---------------------------------------------------------
    // Verify receipt cache hit
    //
    // Change PostgreSQL directly. The repository should still
    // return the cached PENDING_INSPECTION receipt.
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE goods_receipts
        SET status = $1
        WHERE id = $2
          AND organisation_id = $3;
      `,
      [
        "VERIFIED",
        receiptId,
        organisationId,
      ],
    );

    const cacheHitReceipt =
      await getGoodsReceiptById(
        organisationId,
        receiptId,
      );

    assert.ok(
      cacheHitReceipt,
    );

    assert.strictEqual(
      cacheHitReceipt.status,
      "PENDING_INSPECTION",
    );

    // Restore PostgreSQL to match cached value.
    await pool.query(
      `
        UPDATE goods_receipts
        SET status = $1
        WHERE id = $2
          AND organisation_id = $3;
      `,
      [
        "PENDING_INSPECTION",
        receiptId,
        organisationId,
      ],
    );

    console.log(
      "✓ 10. Goods receipt lookup uses Redis cache",
    );

    // ---------------------------------------------------------
    // Tenant-safe receipt cache
    // ---------------------------------------------------------

    const otherOrganisationId =
      "00000000-0000-0000-0000-000000000001";

    assert.strictEqual(
      await getCache(
        buildGoodsReceiptCacheKey(
          otherOrganisationId,
          receiptId,
        ),
      ),
      null,
    );

    const crossOrganisationReceipt =
      await getGoodsReceiptById(
        otherOrganisationId,
        receiptId,
      );

    assert.strictEqual(
      crossOrganisationReceipt,
      null,
    );

    console.log(
      "✓ 11. Goods receipt cache remains tenant-safe",
    );

    // ---------------------------------------------------------
    // Get goods receipt items
    // ---------------------------------------------------------

    const receiptItems =
      await getGoodsReceiptItems(
        organisationId,
        receiptId,
      );

    assert.ok(
      Array.isArray(receiptItems),
    );

    assert.strictEqual(
      receiptItems.length,
      1,
    );

    assert.strictEqual(
      receiptItems[0].goods_receipt_id,
      receiptId,
    );

    assert.strictEqual(
      receiptItems[0].purchase_item_id,
      purchaseItemId,
    );

    assert.strictEqual(
      receiptItems[0].product_id,
      productId,
    );

    assert.strictEqual(
      receiptItems[0].medicine_name,
      "Paracetamol",
    );

    assert.strictEqual(
      receiptItems[0].ordered_quantity,
      100,
    );

    assert.strictEqual(
      receiptItems[0].received_quantity,
      100,
    );

    assert.strictEqual(
      receiptItems[0].rejected_quantity,
      5,
    );

    console.log(
      "✓ 12. Goods receipt items are returned correctly",
    );

    // ---------------------------------------------------------
    // Get receipts by purchase
    // ---------------------------------------------------------

    const purchaseReceipts =
      await getGoodsReceiptsByPurchase(
        organisationId,
        purchaseId,
      );

    assert.ok(
      Array.isArray(purchaseReceipts),
    );

    assert.ok(
      purchaseReceipts.some(
        (item) =>
          item.id === receiptId,
      ),
    );

    assert.ok(
      purchaseReceipts.every(
        (item) =>
          item.organisation_id ===
          organisationId,
      ),
    );

    assert.ok(
      purchaseReceipts.every(
        (item) =>
          item.purchase_id ===
          purchaseId,
      ),
    );

    console.log(
      "✓ 13. Goods receipts by purchase work",
    );

    // ---------------------------------------------------------
    // Get receipts by organisation
    // ---------------------------------------------------------

    const organisationReceipts =
      await getGoodsReceiptsByOrganisation(
        organisationId,
      );

    assert.ok(
      Array.isArray(
        organisationReceipts,
      ),
    );

    assert.ok(
      organisationReceipts.some(
        (item) =>
          item.id === receiptId,
      ),
    );

    assert.ok(
      organisationReceipts.every(
        (item) =>
          item.organisation_id ===
          organisationId,
      ),
    );

    console.log(
      "✓ 14. Goods receipts by organisation work",
    );

    // ---------------------------------------------------------
    // Get receipts by branch
    // ---------------------------------------------------------

    const branchReceipts =
      await getGoodsReceiptsByBranch(
        organisationId,
        branchId,
      );

    assert.ok(
      Array.isArray(
        branchReceipts,
      ),
    );

    assert.ok(
      branchReceipts.some(
        (item) =>
          item.id === receiptId,
      ),
    );

    assert.ok(
      branchReceipts.every(
        (item) =>
          item.organisation_id ===
          organisationId,
      ),
    );

    assert.ok(
      branchReceipts.every(
        (item) =>
          item.branch_id ===
          branchId,
      ),
    );

    console.log(
      "✓ 15. Goods receipts by branch work",
    );

    // ---------------------------------------------------------
    // Search goods receipts
    // ---------------------------------------------------------

    const searchResults =
      await searchGoodsReceipts(
        organisationId,
        receiptNumber,
      );

    assert.ok(
      Array.isArray(searchResults),
    );

    assert.ok(
      searchResults.some(
        (item) =>
          item.id === receiptId,
      ),
    );

    console.log(
      "✓ 16. Goods receipt search works",
    );

    // ---------------------------------------------------------
    // Recreate cache before status update
    // ---------------------------------------------------------

    await getGoodsReceiptById(
      organisationId,
      receiptId,
    );

    assert.ok(
      await getCache(
        receiptCacheKey,
      ),
    );

    // ---------------------------------------------------------
    // Update receipt status
    //
    // PENDING_INSPECTION → VERIFIED is valid according to
    // the goods_receipts_status_check constraint.
    // ---------------------------------------------------------

    const updatedReceipt =
      await updateGoodsReceiptStatus(
        organisationId,
        receiptId,
        "VERIFIED",
      );

    assert.ok(
      updatedReceipt,
    );

    assert.strictEqual(
      updatedReceipt.id,
      receiptId,
    );

    assert.strictEqual(
      updatedReceipt.status,
      "VERIFIED",
    );

    // The old cached receipt must be gone.
    assert.strictEqual(
      await getCache(
        receiptCacheKey,
      ),
      null,
    );

    console.log(
      "✓ 17. Goods receipt status update invalidates Redis cache",
    );

    // ---------------------------------------------------------
    // Fresh receipt after invalidation
    // ---------------------------------------------------------

    const freshReceipt =
      await getGoodsReceiptById(
        organisationId,
        receiptId,
      );

    assert.ok(
      freshReceipt,
    );

    assert.strictEqual(
      freshReceipt.id,
      receiptId,
    );

    assert.strictEqual(
      freshReceipt.status,
      "VERIFIED",
    );

    const refreshedReceiptCache =
      await getCache(
        receiptCacheKey,
      );

    assert.ok(
      refreshedReceiptCache,
    );

    assert.strictEqual(
      refreshedReceiptCache.status,
      "VERIFIED",
    );

    console.log(
      "✓ 18. Fresh goods receipt is returned after status update",
    );

    // ---------------------------------------------------------
    // Recreate cache before delete test
    // ---------------------------------------------------------

    await getGoodsReceiptById(
      organisationId,
      receiptId,
    );

    assert.ok(
      await getCache(
        receiptCacheKey,
      ),
    );

    // ---------------------------------------------------------
    // Delete goods receipt
    // ---------------------------------------------------------

    const deleted =
      await deleteGoodsReceipt(
        organisationId,
        receiptId,
      );

    assert.strictEqual(
      deleted,
      true,
    );

    // Cache must be gone.
    assert.strictEqual(
      await getCache(
        receiptCacheKey,
      ),
      null,
    );

    console.log(
      "✓ 19. Goods receipt deletion invalidates Redis cache",
    );

    // ---------------------------------------------------------
    // Verify receipt no longer exists
    // ---------------------------------------------------------

    const deletedReceipt =
      await getGoodsReceiptById(
        organisationId,
        receiptId,
      );

    assert.strictEqual(
      deletedReceipt,
      null,
    );

    console.log(
      "✓ 20. Deleted goods receipt is no longer returned",
    );

    // ---------------------------------------------------------
    // Verify receipt items were deleted by cascade
    // ---------------------------------------------------------

    const remainingItemsResult =
      await pool.query(
        `
          SELECT id
          FROM goods_receipt_items
          WHERE goods_receipt_id = $1;
        `,
        [receiptId],
      );

    assert.strictEqual(
      remainingItemsResult.rows.length,
      0,
    );

    console.log(
      "✓ 21. Goods receipt items are removed by cascade",
    );

    // ---------------------------------------------------------
    // Verify deleting again returns false
    // ---------------------------------------------------------

    const deleteAgain =
      await deleteGoodsReceipt(
        organisationId,
        receiptId,
      );

    assert.strictEqual(
      deleteAgain,
      false,
    );

    console.log(
      "✓ 22. Deleting a missing goods receipt returns false",
    );

    console.log(
      "\n✓ All Goods Receipt Repository tests passed.\n",
    );
  } catch (error) {
    console.error(
      "\n✗ Goods Receipt Repository test failed.",
    );

    console.error(error);

    throw error;
  } finally {
    // ---------------------------------------------------------
    // Clean Redis test key
    // ---------------------------------------------------------

    if (
      redisClient.isOpen &&
      organisationId &&
      receiptId
    ) {
      try {
        await deleteCache(
          buildGoodsReceiptCacheKey(
            organisationId,
            receiptId,
          ),
        );
      } catch (error) {
        console.error(
          "Goods receipt cache cleanup failed:",
          error,
        );
      }
    }

    // ---------------------------------------------------------
    // Clean goods receipt
    // ---------------------------------------------------------

    if (receiptId) {
      try {
        await pool.query(
          `
            DELETE FROM goods_receipts
            WHERE id = $1;
          `,
          [receiptId],
        );
      } catch (error) {
        console.error(
          "Goods receipt cleanup failed:",
          error,
        );
      }
    }

    // ---------------------------------------------------------
    // Clean purchase
    //
    // Deleting the purchase also removes its purchase items
    // because purchase_items references purchases with
    // ON DELETE CASCADE.
    // ---------------------------------------------------------

    if (purchaseId) {
      try {
        await deletePurchase(
          organisationId,
          purchaseId,
        );
      } catch (error) {
        console.error(
          "Purchase cleanup failed:",
          error,
        );
      }
    }

    // ---------------------------------------------------------
    // Clean product
    // ---------------------------------------------------------

    if (productId) {
      try {
        await pool.query(
          `
            DELETE FROM products
            WHERE id = $1;
          `,
          [productId],
        );
      } catch (error) {
        console.error(
          "Product cleanup failed:",
          error,
        );
      }
    }

    // ---------------------------------------------------------
    // Clean supplier
    // ---------------------------------------------------------

    if (supplierId) {
      try {
        await pool.query(
          `
            DELETE FROM suppliers
            WHERE id = $1;
          `,
          [supplierId],
        );
      } catch (error) {
        console.error(
          "Supplier cleanup failed:",
          error,
        );
      }
    }

    // ---------------------------------------------------------
    // Clean branch
    // ---------------------------------------------------------

    if (branchId) {
      try {
        await pool.query(
          `
            DELETE FROM branches
            WHERE id = $1;
          `,
          [branchId],
        );
      } catch (error) {
        console.error(
          "Branch cleanup failed:",
          error,
        );
      }
    }

    // ---------------------------------------------------------
    // Clean organisation
    // ---------------------------------------------------------

    if (organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM organisations
            WHERE id = $1;
          `,
          [organisationId],
        );
      } catch (error) {
        console.error(
          "Organisation cleanup failed:",
          error,
        );
      }
    }

    // ---------------------------------------------------------
    // Clean owner
    // ---------------------------------------------------------

    if (ownerId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [ownerId],
        );
      } catch (error) {
        console.error(
          "Owner cleanup failed:",
          error,
        );
      }
    }

    // ---------------------------------------------------------
    // Disconnect Redis
    // ---------------------------------------------------------

    try {
      if (redisClient.isOpen) {
        await disconnectRedis();
      }
    } catch (error) {
      console.error(
        "Redis disconnect failed:",
        error,
      );
    }

    // ---------------------------------------------------------
    // Close PostgreSQL pool
    // ---------------------------------------------------------

    await pool.end();
  }
};

runTests().catch(() => {
  process.exit(1);
});
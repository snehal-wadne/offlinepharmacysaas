/**
 * Purchase Repository Integration Tests
 *
 * Tests the Purchase Repository against the real PostgreSQL
 * database and local Redis instance.
 *
 * The tests verify:
 *
 * - Purchase creation
 * - Purchase item creation
 * - PostgreSQL transaction behaviour
 * - Purchase cache miss and population
 * - Purchase cache hit
 * - Tenant-safe purchase cache keys
 * - Purchase item retrieval
 * - Organisation purchase listing
 * - Branch purchase listing
 * - Supplier purchase listing
 * - Purchase search
 * - Filtered purchase listing
 * - Cache invalidation after status update
 * - Fresh purchase after cache invalidation
 * - Cache invalidation after deletion
 * - Purchase items are removed with the purchase
 */

require("dotenv").config();

const assert = require("assert");

const {
  createPurchase,
  getPurchaseById,
  getPurchaseItems,
  getPurchasesByOrganisation,
  getPurchasesByBranch,
  getPurchasesBySupplier,
  searchPurchases,
  updatePurchaseStatus,
  deletePurchase,
  getPurchasesWithFilters,
} = require("../repositories/purchase.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { getCache, deleteCache } = require("../cache/cache");

const uniqueValue = (prefix) => `${prefix}-${Date.now()}`;

const buildPurchaseCacheKey = (organisationId, purchaseId) =>
  `organisation:${organisationId}:purchase:${purchaseId}`;

const runTests = async () => {
  let ownerId = null;
  let organisationId = null;
  let branchId = null;
  let supplierId = null;
  let productId = null;
  let secondProductId = null;
  let purchaseId = null;

  try {
    await pool.query("SELECT 1");

    await connectRedis();

    console.log("\nRunning Purchase Repository tests...\n");

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
        `${uniqueValue("purchase-owner")}@test.local`,
        "test-password",
        "Purchase Test Owner",
        "ACTIVE",
      ],
    );

    ownerId = ownerResult.rows[0].id;

    console.log("✓ 1. Create test owner");

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
      [ownerId, uniqueValue("Purchase Test Pharmacy")],
    );

    organisationId = organisationResult.rows[0].id;

    console.log("✓ 2. Create test organisation");

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
        "Purchase Test Branch",
        "123 Purchase Street",
        "Test City",
        "Test State",
        "400001",
        "9000000001",
      ],
    );

    branchId = branchResult.rows[0].id;

    console.log("✓ 3. Create test branch");

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
        "Purchase Test Supplier",
        "Test Supplier Contact",
        "9876543210",
        "supplier@test.local",
        "Delhi",
        uniqueValue("GST"),
        "ACTIVE",
      ],
    );

    supplierId = supplierResult.rows[0].id;

    console.log("✓ 4. Create test supplier");

    // ---------------------------------------------------------
    // Create first test product
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
        "Purchase Test Brand",
        "650mg",
        "15 Tablets",
        "Test Manufacturer",
        uniqueValue("SKU"),
      ],
    );

    productId = productResult.rows[0].id;

    console.log("✓ 5. Create test product");

    // ---------------------------------------------------------
    // Create second test product
    //
    // purchase_items has a UNIQUE constraint on
    // (purchase_id, product_id), so each product can appear
    // only once within the same purchase.
    // ---------------------------------------------------------

    const secondProductResult = await pool.query(
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
        "Amoxicillin",
        "Purchase Test Brand",
        "500mg",
        "10 Capsules",
        "Test Manufacturer",
        uniqueValue("SKU"),
      ],
    );

    secondProductId = secondProductResult.rows[0].id;

    console.log("✓ 6. Create second test product");

    // ---------------------------------------------------------
    // Create purchase with two different products
    // ---------------------------------------------------------

    const purchaseNumber = uniqueValue("PO");

    const purchase = await createPurchase({
      organisationId,
      purchaseNumber,
      supplierId,
      branchId,
      orderDate: "2026-09-03",
      expectedDate: "2026-09-10",
      status: "PENDING",
      notes: "Purchase repository integration test",
      createdBy: ownerId,
      items: [
        {
          productId,
          orderedQuantity: 100,
          unitCost: 10,
          taxAmount: 50,
          discountAmount: 20,
        },
        {
          productId: secondProductId,
          orderedQuantity: 50,
          unitCost: 20,
          taxAmount: 40,
          discountAmount: 10,
        },
      ],
    });

    assert.ok(purchase);

    assert.ok(purchase.id);

    assert.strictEqual(purchase.organisation_id, organisationId);

    assert.strictEqual(purchase.purchase_number, purchaseNumber);

    assert.strictEqual(purchase.supplier_id, supplierId);

    assert.strictEqual(purchase.branch_id, branchId);

    assert.strictEqual(purchase.status, "PENDING");

    assert.ok(Array.isArray(purchase.items));

    assert.strictEqual(purchase.items.length, 2);

    purchaseId = purchase.id;

    console.log("✓ 7. Create purchase with purchase items");

    // ---------------------------------------------------------
    // Ensure purchase cache is clean
    // ---------------------------------------------------------

    const purchaseCacheKey = buildPurchaseCacheKey(organisationId, purchaseId);

    await deleteCache(purchaseCacheKey);

    assert.strictEqual(await getCache(purchaseCacheKey), null);

    // ---------------------------------------------------------
    // Get purchase by ID - cache miss
    // ---------------------------------------------------------

    const firstPurchaseLookup = await getPurchaseById(
      organisationId,
      purchaseId,
    );

    assert.ok(firstPurchaseLookup);

    assert.strictEqual(firstPurchaseLookup.id, purchaseId);

    assert.strictEqual(firstPurchaseLookup.organisation_id, organisationId);

    assert.strictEqual(firstPurchaseLookup.purchase_number, purchaseNumber);

    assert.strictEqual(
      firstPurchaseLookup.supplier_name,
      "Purchase Test Supplier",
    );

    assert.strictEqual(firstPurchaseLookup.branch_name, "Purchase Test Branch");

    assert.strictEqual(firstPurchaseLookup.status, "PENDING");

    const cachedPurchase = await getCache(purchaseCacheKey);

    assert.ok(cachedPurchase);

    assert.strictEqual(cachedPurchase.id, purchaseId);

    assert.strictEqual(cachedPurchase.status, "PENDING");

    console.log("✓ 8. Purchase cache miss populates Redis");

    // ---------------------------------------------------------
    // Verify purchase cache hit
    //
    // Change PostgreSQL directly. The repository should still
    // return the cached PENDING purchase.
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE purchases
        SET status = $1
        WHERE id = $2
          AND organisation_id = $3;
      `,
      ["APPROVED", purchaseId, organisationId],
    );

    const cacheHitPurchase = await getPurchaseById(organisationId, purchaseId);

    assert.ok(cacheHitPurchase);

    assert.strictEqual(cacheHitPurchase.status, "PENDING");

    // Restore PostgreSQL to match the cached value.
    await pool.query(
      `
        UPDATE purchases
        SET status = $1
        WHERE id = $2
          AND organisation_id = $3;
      `,
      ["PENDING", purchaseId, organisationId],
    );

    console.log("✓ 9. Purchase lookup uses Redis cache");

    // ---------------------------------------------------------
    // Tenant-safe purchase cache
    // ---------------------------------------------------------

    const otherOrganisationId = "00000000-0000-0000-0000-000000000001";

    assert.strictEqual(
      await getCache(buildPurchaseCacheKey(otherOrganisationId, purchaseId)),
      null,
    );

    const crossOrganisationPurchase = await getPurchaseById(
      otherOrganisationId,
      purchaseId,
    );

    assert.strictEqual(crossOrganisationPurchase, null);

    console.log("✓ 10. Purchase cache remains tenant-safe");

    // ---------------------------------------------------------
    // Get purchase items
    // ---------------------------------------------------------

    const purchaseItems = await getPurchaseItems(organisationId, purchaseId);

    assert.ok(Array.isArray(purchaseItems));

    assert.strictEqual(purchaseItems.length, 2);

    assert.ok(purchaseItems.every((item) => item.purchase_id === purchaseId));

    assert.ok(purchaseItems.some((item) => item.product_id === productId));

    assert.ok(
      purchaseItems.some((item) => item.product_id === secondProductId),
    );

    console.log("✓ 11. Purchase items are returned correctly");

    // ---------------------------------------------------------
    // Get purchases by organisation
    // ---------------------------------------------------------

    const organisationPurchases =
      await getPurchasesByOrganisation(organisationId);

    assert.ok(Array.isArray(organisationPurchases));

    assert.ok(organisationPurchases.some((item) => item.id === purchaseId));

    assert.ok(
      organisationPurchases.every(
        (item) => item.organisation_id === organisationId,
      ),
    );

    console.log("✓ 12. Purchases by organisation work");

    // ---------------------------------------------------------
    // Get purchases by branch
    // ---------------------------------------------------------

    const branchPurchases = await getPurchasesByBranch(
      organisationId,
      branchId,
    );

    assert.ok(Array.isArray(branchPurchases));

    assert.ok(branchPurchases.some((item) => item.id === purchaseId));

    assert.ok(branchPurchases.every((item) => item.branch_id === branchId));

    console.log("✓ 13. Purchases by branch work");

    // ---------------------------------------------------------
    // Get purchases by supplier
    // ---------------------------------------------------------

    const supplierPurchases = await getPurchasesBySupplier(
      organisationId,
      supplierId,
    );

    assert.ok(Array.isArray(supplierPurchases));

    assert.ok(supplierPurchases.some((item) => item.id === purchaseId));

    assert.ok(
      supplierPurchases.every((item) => item.supplier_id === supplierId),
    );

    console.log("✓ 14. Purchases by supplier work");

    // ---------------------------------------------------------
    // Search purchases
    // ---------------------------------------------------------

    const searchResults = await searchPurchases(organisationId, purchaseNumber);

    assert.ok(Array.isArray(searchResults));

    assert.ok(searchResults.some((item) => item.id === purchaseId));

    console.log("✓ 15. Purchase search works");

    // ---------------------------------------------------------
    // Filter purchases
    // ---------------------------------------------------------

    const filteredPurchases = await getPurchasesWithFilters(organisationId, {
      status: "PENDING",
      branchId,
      supplierId,
      search: purchaseNumber,
    });

    assert.ok(Array.isArray(filteredPurchases));

    assert.ok(filteredPurchases.some((item) => item.id === purchaseId));

    const filteredPurchase = filteredPurchases.find(
      (item) => item.id === purchaseId,
    );

    assert.ok(filteredPurchase);

    assert.strictEqual(filteredPurchase.status, "PENDING");

    assert.strictEqual(filteredPurchase.items_count, 2);

    /*
     * Expected total:
     *
     * Item 1:
     * 100 × 10 + 50 tax - 20 discount = 1030
     *
     * Item 2:
     * 50 × 20 + 40 tax - 10 discount = 1030
     *
     * Total = 2060
     */

    assert.strictEqual(Number(filteredPurchase.total_amount), 2060);

    console.log("✓ 16. Purchase filters and totals work");

    // ---------------------------------------------------------
    // Recreate cache before update test
    // ---------------------------------------------------------

    await getPurchaseById(organisationId, purchaseId);

    assert.ok(await getCache(purchaseCacheKey));

    // ---------------------------------------------------------
    // Update purchase status
    //
    // PENDING → APPROVED is a valid status value according
    // to the purchases_status_check constraint.
    // ---------------------------------------------------------

    const updatedPurchase = await updatePurchaseStatus(
      organisationId,
      purchaseId,
      "APPROVED",
    );

    assert.ok(updatedPurchase);

    assert.strictEqual(updatedPurchase.id, purchaseId);

    assert.strictEqual(updatedPurchase.status, "APPROVED");

    // The old cached purchase must be gone.
    assert.strictEqual(await getCache(purchaseCacheKey), null);

    console.log("✓ 17. Purchase status update invalidates Redis cache");

    // ---------------------------------------------------------
    // Fresh purchase after invalidation
    // ---------------------------------------------------------

    const freshPurchase = await getPurchaseById(organisationId, purchaseId);

    assert.ok(freshPurchase);

    assert.strictEqual(freshPurchase.id, purchaseId);

    assert.strictEqual(freshPurchase.status, "APPROVED");

    const refreshedPurchaseCache = await getCache(purchaseCacheKey);

    assert.ok(refreshedPurchaseCache);

    assert.strictEqual(refreshedPurchaseCache.status, "APPROVED");

    console.log("✓ 18. Fresh purchase is returned after status update");

    // ---------------------------------------------------------
    // Recreate cache before delete test
    // ---------------------------------------------------------

    await getPurchaseById(organisationId, purchaseId);

    assert.ok(await getCache(purchaseCacheKey));

    // ---------------------------------------------------------
    // Delete purchase
    // ---------------------------------------------------------

    const deleted = await deletePurchase(organisationId, purchaseId);

    assert.strictEqual(deleted, true);

    // Cache must be gone.
    assert.strictEqual(await getCache(purchaseCacheKey), null);

    console.log("✓ 19. Purchase deletion invalidates Redis cache");

    // ---------------------------------------------------------
    // Verify purchase no longer exists
    // ---------------------------------------------------------

    const deletedPurchase = await getPurchaseById(organisationId, purchaseId);

    assert.strictEqual(deletedPurchase, null);

    console.log("✓ 20. Deleted purchase is no longer returned");

    // ---------------------------------------------------------
    // Verify purchase items were deleted by cascade
    // ---------------------------------------------------------

    const remainingItemsResult = await pool.query(
      `
        SELECT id
        FROM purchase_items
        WHERE purchase_id = $1;
      `,
      [purchaseId],
    );

    assert.strictEqual(remainingItemsResult.rows.length, 0);

    console.log("✓ 21. Purchase items are removed by cascade");

    // ---------------------------------------------------------
    // Verify deleting again returns false
    // ---------------------------------------------------------

    const deleteAgain = await deletePurchase(organisationId, purchaseId);

    assert.strictEqual(deleteAgain, false);

    console.log("✓ 22. Deleting a missing purchase returns false");

    console.log("\n✓ All Purchase Repository tests passed.\n");
  } catch (error) {
    console.error("\n✗ Purchase Repository test failed.");

    console.error(error);

    throw error;
  } finally {
    // ---------------------------------------------------------
    // Clean Redis test key
    // ---------------------------------------------------------

    if (redisClient.isOpen && organisationId && purchaseId) {
      try {
        await deleteCache(buildPurchaseCacheKey(organisationId, purchaseId));
      } catch (error) {
        console.error("Purchase cache cleanup failed:", error);
      }
    }

    // ---------------------------------------------------------
    // Clean purchase
    // ---------------------------------------------------------

    if (purchaseId) {
      try {
        await pool.query(
          `
            DELETE FROM purchases
            WHERE id = $1;
          `,
          [purchaseId],
        );
      } catch (error) {
        console.error("Purchase cleanup failed:", error);
      }
    }

    // ---------------------------------------------------------
    // Clean second product
    // ---------------------------------------------------------

    if (secondProductId) {
      try {
        await pool.query(
          `
            DELETE FROM products
            WHERE id = $1;
          `,
          [secondProductId],
        );
      } catch (error) {
        console.error("Second product cleanup failed:", error);
      }
    }

    // ---------------------------------------------------------
    // Clean first product
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
        console.error("Product cleanup failed:", error);
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
        console.error("Supplier cleanup failed:", error);
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
        console.error("Branch cleanup failed:", error);
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
        console.error("Organisation cleanup failed:", error);
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
        console.error("Owner cleanup failed:", error);
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
      console.error("Redis disconnect failed:", error);
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

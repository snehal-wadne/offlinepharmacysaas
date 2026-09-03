/**
 * Stock Transfer Repository Integration Tests
 *
 * Tests the Stock Transfer Repository against the real
 * PostgreSQL database and local Redis instance.
 *
 * The tests verify:
 *
 * - Stock transfer creation
 * - Transfer item creation
 * - PostgreSQL transaction behaviour
 * - Purchase/transfer style parent-child relationship
 * - Transfer cache miss and population
 * - Transfer cache hit
 * - Tenant-safe transfer cache keys
 * - Transfer item retrieval
 * - Branch transfer listing
 * - Status update
 * - Cache invalidation after status update
 * - Fresh transfer after cache invalidation
 * - Transfer deletion
 * - Cache invalidation after deletion
 * - Transfer items are removed by cascade
 * - Deleting a missing transfer returns false
 */

require("dotenv").config();

const assert = require("assert");

const {
  createStockTransfer,
  getStockTransferById,
  getStockTransferItems,
  getStockTransfersByBranch,
  updateStockTransferStatus,
  deleteStockTransfer,
} = require("../repositories/stock-transfer.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { getCache, deleteCache } = require("../cache/cache");

const uniqueValue = (prefix) => `${prefix}-${Date.now()}`;

const buildStockTransferCacheKey = (organisationId, transferId) =>
  `organisation:${organisationId}:stock-transfer:${transferId}`;

const runTests = async () => {
  let ownerId = null;
  let organisationId = null;
  let fromBranchId = null;
  let toBranchId = null;
  let supplierId = null;
  let productId = null;
  let inventoryBatchId = null;
  let transferId = null;

  try {
    await pool.query("SELECT 1");

    await connectRedis();

    console.log("\nRunning Stock Transfer Repository tests...\n");

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
        `${uniqueValue("transfer-owner")}@test.local`,
        "test-password",
        "Stock Transfer Test Owner",
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
      [ownerId, uniqueValue("Stock Transfer Test Pharmacy")],
    );

    organisationId = organisationResult.rows[0].id;

    console.log("✓ 2. Create test organisation");

    // ---------------------------------------------------------
    // Create source branch
    // ---------------------------------------------------------

    const fromBranchResult = await pool.query(
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
        "Transfer Source Branch",
        "123 Source Street",
        "Test City",
        "Test State",
        "400001",
        "9000000001",
      ],
    );

    fromBranchId = fromBranchResult.rows[0].id;

    console.log("✓ 3. Create source branch");

    // ---------------------------------------------------------
    // Create destination branch
    // ---------------------------------------------------------

    const toBranchResult = await pool.query(
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
        "Transfer Destination Branch",
        "456 Destination Street",
        "Test City",
        "Test State",
        "400002",
        "9000000002",
      ],
    );

    toBranchId = toBranchResult.rows[0].id;

    console.log("✓ 4. Create destination branch");

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
        "Stock Transfer Test Supplier",
        "Transfer Supplier Contact",
        "9876543210",
        "transfer-supplier@test.local",
        "Delhi",
        uniqueValue("GST"),
        "ACTIVE",
      ],
    );

    supplierId = supplierResult.rows[0].id;

    console.log("✓ 5. Create test supplier");

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
        "Transfer Test Brand",
        "650mg",
        "15 Tablets",
        "Test Manufacturer",
        uniqueValue("SKU"),
      ],
    );

    productId = productResult.rows[0].id;

    console.log("✓ 6. Create test product");

    // ---------------------------------------------------------
    // Create inventory batch
    //
    // The transfer item references an inventory batch rather
    // than a product directly.
    // ---------------------------------------------------------

    const inventoryBatchResult = await pool.query(
      `
        INSERT INTO inventory_batches (
          product_id,
          branch_id,
          supplier_id,
          batch_number,
          expiry_date,
          mrp,
          quantity,
          shelf_location,
          updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id;
      `,
      [
        productId,
        fromBranchId,
        supplierId,
        uniqueValue("BATCH"),
        "2027-09-30",
        25.0,
        500,
        "A1-S1",
        ownerId,
      ],
    );

    inventoryBatchId = inventoryBatchResult.rows[0].id;

    console.log("✓ 7. Create inventory batch");

    // ---------------------------------------------------------
    // Create stock transfer with one item
    // ---------------------------------------------------------

    const transferNumber = uniqueValue("TR");

    const transfer = await createStockTransfer({
      organisationId,
      fromBranchId,
      toBranchId,
      transferDate: "2026-09-03",
      status: "DRAFT",
      transferNumber,
      notes: "Stock transfer repository integration test",
      createdBy: ownerId,
      items: [
        {
          inventoryBatchId,
          quantity: 100,
        },
      ],
    });

    assert.ok(transfer);

    assert.ok(transfer.id);

    assert.strictEqual(transfer.organisation_id, organisationId);

    assert.strictEqual(transfer.from_branch_id, fromBranchId);

    assert.strictEqual(transfer.to_branch_id, toBranchId);

    assert.strictEqual(transfer.transfer_number, transferNumber);

    assert.strictEqual(transfer.status, "DRAFT");

    assert.ok(Array.isArray(transfer.items));

    assert.strictEqual(transfer.items.length, 1);

    assert.strictEqual(transfer.items[0].inventory_batch_id, inventoryBatchId);

    assert.strictEqual(transfer.items[0].quantity, 100);

    transferId = transfer.id;

    console.log("✓ 8. Create stock transfer with transfer item");

    // ---------------------------------------------------------
    // Ensure transfer cache is clean
    // ---------------------------------------------------------

    const transferCacheKey = buildStockTransferCacheKey(
      organisationId,
      transferId,
    );

    await deleteCache(transferCacheKey);

    assert.strictEqual(await getCache(transferCacheKey), null);

    // ---------------------------------------------------------
    // Get transfer by ID - cache miss
    // ---------------------------------------------------------

    const firstTransferLookup = await getStockTransferById(
      organisationId,
      transferId,
    );

    assert.ok(firstTransferLookup);

    assert.strictEqual(firstTransferLookup.id, transferId);

    assert.strictEqual(firstTransferLookup.organisation_id, organisationId);

    assert.strictEqual(firstTransferLookup.from_branch_id, fromBranchId);

    assert.strictEqual(firstTransferLookup.to_branch_id, toBranchId);

    assert.strictEqual(
      firstTransferLookup.from_branch_name,
      "Transfer Source Branch",
    );

    assert.strictEqual(
      firstTransferLookup.to_branch_name,
      "Transfer Destination Branch",
    );

    assert.strictEqual(firstTransferLookup.transfer_number, transferNumber);

    assert.strictEqual(firstTransferLookup.status, "DRAFT");

    const cachedTransfer = await getCache(transferCacheKey);

    assert.ok(cachedTransfer);

    assert.strictEqual(cachedTransfer.id, transferId);

    assert.strictEqual(cachedTransfer.status, "DRAFT");

    console.log("✓ 9. Stock transfer cache miss populates Redis");

    // ---------------------------------------------------------
    // Verify transfer cache hit
    //
    // Change PostgreSQL directly. The repository should still
    // return the cached DRAFT transfer.
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE stock_transfers
        SET status = $1
        WHERE id = $2
          AND organisation_id = $3;
      `,
      ["IN_TRANSIT", transferId, organisationId],
    );

    const cacheHitTransfer = await getStockTransferById(
      organisationId,
      transferId,
    );

    assert.ok(cacheHitTransfer);

    assert.strictEqual(cacheHitTransfer.status, "DRAFT");

    // Restore PostgreSQL to match the cached value.
    await pool.query(
      `
        UPDATE stock_transfers
        SET status = $1
        WHERE id = $2
          AND organisation_id = $3;
      `,
      ["DRAFT", transferId, organisationId],
    );

    console.log("✓ 10. Stock transfer lookup uses Redis cache");

    // ---------------------------------------------------------
    // Tenant-safe transfer cache
    // ---------------------------------------------------------

    const otherOrganisationId = "00000000-0000-0000-0000-000000000001";

    assert.strictEqual(
      await getCache(
        buildStockTransferCacheKey(otherOrganisationId, transferId),
      ),
      null,
    );

    const crossOrganisationTransfer = await getStockTransferById(
      otherOrganisationId,
      transferId,
    );

    assert.strictEqual(crossOrganisationTransfer, null);

    console.log("✓ 11. Stock transfer cache remains tenant-safe");

    // ---------------------------------------------------------
    // Get stock transfer items
    // ---------------------------------------------------------

    const transferItems = await getStockTransferItems(
      organisationId,
      transferId,
    );

    assert.ok(Array.isArray(transferItems));

    assert.strictEqual(transferItems.length, 1);

    assert.strictEqual(transferItems[0].transfer_id, transferId);

    assert.strictEqual(transferItems[0].inventory_batch_id, inventoryBatchId);

    assert.strictEqual(transferItems[0].product_id, productId);

    assert.strictEqual(transferItems[0].medicine_name, "Paracetamol");

    assert.strictEqual(
      transferItems[0].supplier_name,
      "Stock Transfer Test Supplier",
    );

    assert.strictEqual(transferItems[0].quantity, 100);

    console.log("✓ 12. Stock transfer items are returned correctly");

    // ---------------------------------------------------------
    // Get transfers by source branch
    // ---------------------------------------------------------

    const sourceBranchTransfers = await getStockTransfersByBranch(
      organisationId,
      fromBranchId,
    );

    assert.ok(Array.isArray(sourceBranchTransfers));

    assert.ok(sourceBranchTransfers.some((item) => item.id === transferId));

    assert.ok(
      sourceBranchTransfers.every(
        (item) => item.organisation_id === organisationId,
      ),
    );

    console.log("✓ 13. Stock transfers by source branch work");

    // ---------------------------------------------------------
    // Get transfers by destination branch
    // ---------------------------------------------------------

    const destinationBranchTransfers = await getStockTransfersByBranch(
      organisationId,
      toBranchId,
    );

    assert.ok(Array.isArray(destinationBranchTransfers));

    assert.ok(
      destinationBranchTransfers.some((item) => item.id === transferId),
    );

    assert.ok(
      destinationBranchTransfers.every(
        (item) => item.organisation_id === organisationId,
      ),
    );

    console.log("✓ 14. Stock transfers by destination branch work");

    // ---------------------------------------------------------
    // Recreate cache before status update
    // ---------------------------------------------------------

    await getStockTransferById(organisationId, transferId);

    assert.ok(await getCache(transferCacheKey));

    // ---------------------------------------------------------
    // Update transfer status
    //
    // DRAFT → IN_TRANSIT is a valid status value according
    // to the stock_transfers_status_check constraint.
    // ---------------------------------------------------------

    const updatedTransfer = await updateStockTransferStatus(
      organisationId,
      transferId,
      "IN_TRANSIT",
    );

    assert.ok(updatedTransfer);

    assert.strictEqual(updatedTransfer.id, transferId);

    assert.strictEqual(updatedTransfer.status, "IN_TRANSIT");

    // The old cached transfer must be gone.
    assert.strictEqual(await getCache(transferCacheKey), null);

    console.log("✓ 15. Stock transfer status update invalidates Redis cache");

    // ---------------------------------------------------------
    // Fresh transfer after invalidation
    // ---------------------------------------------------------

    const freshTransfer = await getStockTransferById(
      organisationId,
      transferId,
    );

    assert.ok(freshTransfer);

    assert.strictEqual(freshTransfer.id, transferId);

    assert.strictEqual(freshTransfer.status, "IN_TRANSIT");

    const refreshedTransferCache = await getCache(transferCacheKey);

    assert.ok(refreshedTransferCache);

    assert.strictEqual(refreshedTransferCache.status, "IN_TRANSIT");

    console.log("✓ 16. Fresh stock transfer is returned after status update");

    // ---------------------------------------------------------
    // Recreate cache before delete test
    // ---------------------------------------------------------

    await getStockTransferById(organisationId, transferId);

    assert.ok(await getCache(transferCacheKey));

    // ---------------------------------------------------------
    // Delete stock transfer
    // ---------------------------------------------------------

    const deleted = await deleteStockTransfer(organisationId, transferId);

    assert.strictEqual(deleted, true);

    // Cache must be gone.
    assert.strictEqual(await getCache(transferCacheKey), null);

    console.log("✓ 17. Stock transfer deletion invalidates Redis cache");

    // ---------------------------------------------------------
    // Verify transfer no longer exists
    // ---------------------------------------------------------

    const deletedTransfer = await getStockTransferById(
      organisationId,
      transferId,
    );

    assert.strictEqual(deletedTransfer, null);

    console.log("✓ 18. Deleted stock transfer is no longer returned");

    // ---------------------------------------------------------
    // Verify transfer items were deleted by cascade
    // ---------------------------------------------------------

    const remainingItemsResult = await pool.query(
      `
          SELECT id
          FROM stock_transfer_items
          WHERE transfer_id = $1;
        `,
      [transferId],
    );

    assert.strictEqual(remainingItemsResult.rows.length, 0);

    console.log("✓ 19. Stock transfer items are removed by cascade");

    // ---------------------------------------------------------
    // Verify deleting again returns false
    // ---------------------------------------------------------

    const deleteAgain = await deleteStockTransfer(organisationId, transferId);

    assert.strictEqual(deleteAgain, false);

    console.log("✓ 20. Deleting a missing stock transfer returns false");

    console.log("\n✓ All Stock Transfer Repository tests passed.\n");
  } catch (error) {
    console.error("\n✗ Stock Transfer Repository test failed.");

    console.error(error);

    throw error;
  } finally {
    // ---------------------------------------------------------
    // Clean Redis test key
    // ---------------------------------------------------------

    if (redisClient.isOpen && organisationId && transferId) {
      try {
        await deleteCache(
          buildStockTransferCacheKey(organisationId, transferId),
        );
      } catch (error) {
        console.error("Stock transfer cache cleanup failed:", error);
      }
    }

    // ---------------------------------------------------------
    // Clean transfer
    // ---------------------------------------------------------

    if (transferId) {
      try {
        await pool.query(
          `
            DELETE FROM stock_transfers
            WHERE id = $1;
          `,
          [transferId],
        );
      } catch (error) {
        console.error("Stock transfer cleanup failed:", error);
      }
    }

    // ---------------------------------------------------------
    // Clean inventory batch
    // ---------------------------------------------------------

    if (inventoryBatchId) {
      try {
        await pool.query(
          `
            DELETE FROM inventory_batches
            WHERE id = $1;
          `,
          [inventoryBatchId],
        );
      } catch (error) {
        console.error("Inventory batch cleanup failed:", error);
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
    // Clean destination branch
    // ---------------------------------------------------------

    if (toBranchId) {
      try {
        await pool.query(
          `
            DELETE FROM branches
            WHERE id = $1;
          `,
          [toBranchId],
        );
      } catch (error) {
        console.error("Destination branch cleanup failed:", error);
      }
    }

    // ---------------------------------------------------------
    // Clean source branch
    // ---------------------------------------------------------

    if (fromBranchId) {
      try {
        await pool.query(
          `
            DELETE FROM branches
            WHERE id = $1;
          `,
          [fromBranchId],
        );
      } catch (error) {
        console.error("Source branch cleanup failed:", error);
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

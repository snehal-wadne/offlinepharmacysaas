/**
 * Inventory Repository Test
 *
 * Purpose:
 * Verifies the inventory repository against the local
 * PostgreSQL development database.
 *
 * The test covers:
 *
 * - Creating an inventory batch
 * - Finding a batch by ID
 * - Listing branch inventory
 * - Getting batches for a product
 * - Searching inventory
 * - Finding expiring batches
 * - Updating batch information
 * - Updating stock quantity
 * - Deleting the batch
 */

const {
  createInventoryBatch,
  getInventoryBatchById,
  getInventoryByBranch,
  getProductBatchesAtBranch,
  searchInventory,
  getExpiringBatches,
  updateInventoryBatch,
  updateInventoryQuantity,
  deleteInventoryBatch,
} = require("../repositories/inventory.repository");

const { pool } = require("../db/connection");

/*
 * Replace these values with the IDs printed by seed-dev.js.
 */
const branchId = "PUT_YOUR_BRANCH_ID_HERE";
const productId = "PUT_YOUR_PRODUCT_ID_HERE";
const supplierId = "PUT_YOUR_SUPPLIER_ID_HERE";
const userId = "PUT_YOUR_USER_ID_HERE";

const runTests = async () => {
  let inventoryBatchId;

  try {
    /*
     * 1. CREATE INVENTORY BATCH
     */
    console.log("--- Creating inventory batch ---");

    const inventoryBatch = await createInventoryBatch({
      productId,
      branchId,
      supplierId,
      batchNumber: "PCM650-B001",
      expiryDate: "2028-12-31",
      mrp: 35.0,
      quantity: 100,
      shelfLocation: "A-12",
      updatedBy: userId,
    });

    inventoryBatchId = inventoryBatch.id;

    console.log(inventoryBatch);

    /*
     * 2. GET INVENTORY BATCH BY ID
     */
    console.log("--- Getting inventory batch by ID ---");

    const fetchedBatch = await getInventoryBatchById(
      branchId,
      inventoryBatchId,
    );

    console.log(fetchedBatch);

    /*
     * 3. GET ALL INVENTORY FOR BRANCH
     */
    console.log("--- Getting branch inventory ---");

    const branchInventory = await getInventoryByBranch(branchId);

    console.log(branchInventory);

    /*
     * 4. GET PRODUCT BATCHES AT BRANCH
     */
    console.log("--- Getting product batches at branch ---");

    const productBatches = await getProductBatchesAtBranch(branchId, productId);

    console.log(productBatches);

    /*
     * 5. SEARCH INVENTORY
     */
    console.log("--- Searching inventory ---");

    const searchResults = await searchInventory(branchId, "Paracetamol");

    console.log(searchResults);

    /*
     * 6. GET EXPIRING BATCHES
     *
     * This batch expires in the future, so it should not
     * appear if the expiry window does not include it.
     */
    console.log("--- Getting expiring batches ---");

    const expiringBatches = await getExpiringBatches(branchId, 90);

    console.log(expiringBatches);

    /*
     * 7. UPDATE BATCH INFORMATION
     */
    console.log("--- Updating inventory batch ---");

    const updatedBatch = await updateInventoryBatch(
      branchId,
      inventoryBatchId,
      {
        batchNumber: "PCM650-B001-UPDATED",
        expiryDate: "2028-11-30",
        mrp: 36.0,
        shelfLocation: "B-05",
        supplierId,
        updatedBy: userId,
      },
    );

    console.log(updatedBatch);

    /*
     * 8. UPDATE STOCK QUANTITY
     */
    console.log("--- Updating inventory quantity ---");

    const updatedQuantity = await updateInventoryQuantity(
      branchId,
      inventoryBatchId,
      85,
      userId,
    );

    console.log(updatedQuantity);

    /*
     * 9. DELETE INVENTORY BATCH
     */
    console.log("--- Deleting inventory batch ---");

    const deleted = await deleteInventoryBatch(branchId, inventoryBatchId);

    console.log({
      deleted,
    });

    console.log("");
    console.log("Inventory repository tests completed successfully.");
  } catch (error) {
    console.error("Inventory repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

runTests();

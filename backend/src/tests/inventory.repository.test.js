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
 * - Getting available inventory categories
 * - Getting category-level inventory summary
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
  getInventoryCategories,
  getInventoryCategorySummary,
  updateInventoryBatch,
  updateInventoryQuantity,
  deleteInventoryBatch,
} = require("../repositories/inventory.repository");

const { pool } = require("../db/connection");

/**
 * Replace these values with the IDs printed by seed-dev.js.
 *
 * The product used here must have a category assigned.
 */
const branchId = "PUT_YOUR_BRANCH_ID_HERE";
const productId = "PUT_YOUR_PRODUCT_ID_HERE";
const supplierId = "PUT_YOUR_SUPPLIER_ID_HERE";
const userId = "PUT_YOUR_USER_ID_HERE";

/**
 * Simple assertion helper.
 */
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

const runTests = async () => {
  let inventoryBatchId = null;

  try {
    // --------------------------------------------------------
    // 1. CREATE INVENTORY BATCH
    // --------------------------------------------------------

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

    assert(inventoryBatch.id, "Created inventory batch should have an ID.");

    assert(
      inventoryBatch.product_id === productId,
      "Inventory batch should belong to the correct product.",
    );

    assert(
      Number(inventoryBatch.quantity) === 100,
      "Inventory batch should have quantity 100.",
    );

    // --------------------------------------------------------
    // 2. GET INVENTORY BATCH BY ID
    // --------------------------------------------------------

    console.log("--- Getting inventory batch by ID ---");

    const fetchedBatch = await getInventoryBatchById(
      branchId,
      inventoryBatchId,
    );

    console.log(fetchedBatch);

    assert(fetchedBatch !== null, "Created inventory batch should be found.");

    assert(
      fetchedBatch.id === inventoryBatchId,
      "Fetched batch ID should match.",
    );

    assert(
      fetchedBatch.category === "Medicines",
      "Inventory batch should include product category.",
    );

    // --------------------------------------------------------
    // 3. GET ALL INVENTORY FOR BRANCH
    // --------------------------------------------------------

    console.log("--- Getting branch inventory ---");

    const branchInventory = await getInventoryByBranch(branchId);

    console.log(branchInventory);

    const branchInventoryItem = branchInventory.find(
      (item) => item.id === inventoryBatchId,
    );

    assert(
      branchInventoryItem,
      "Created batch should appear in branch inventory.",
    );

    assert(
      branchInventoryItem.category === "Medicines",
      "Branch inventory should include product category.",
    );

    // --------------------------------------------------------
    // 4. GET PRODUCT BATCHES AT BRANCH
    // --------------------------------------------------------

    console.log("--- Getting product batches at branch ---");

    const productBatches = await getProductBatchesAtBranch(branchId, productId);

    console.log(productBatches);

    const productBatch = productBatches.find(
      (item) => item.id === inventoryBatchId,
    );

    assert(productBatch, "Created batch should appear in product batches.");

    assert(
      productBatch.category === "Medicines",
      "Product batch result should include category.",
    );

    // --------------------------------------------------------
    // 5. SEARCH INVENTORY BY PRODUCT NAME
    // --------------------------------------------------------

    console.log("--- Searching inventory ---");

    const searchResults = await searchInventory(branchId, "Paracetamol");

    console.log(searchResults);

    const searchedBatch = searchResults.find(
      (item) => item.id === inventoryBatchId,
    );

    assert(searchedBatch, "Created batch should appear in inventory search.");

    // --------------------------------------------------------
    // 6. SEARCH INVENTORY BY CATEGORY
    // --------------------------------------------------------

    console.log("--- Searching inventory by category ---");

    const categorySearchResults = await searchInventory(branchId, "Medicines");

    console.log(categorySearchResults);

    const categoryBatch = categorySearchResults.find(
      (item) => item.id === inventoryBatchId,
    );

    assert(
      categoryBatch,
      "Inventory should be searchable by product category.",
    );

    // --------------------------------------------------------
    // 7. GET EXPIRING BATCHES
    // --------------------------------------------------------

    console.log("--- Getting expiring batches ---");

    const expiringBatches = await getExpiringBatches(branchId, 90);

    console.log(expiringBatches);

    assert(
      !expiringBatches.some((item) => item.id === inventoryBatchId),
      "The test batch should not appear in the 90-day expiry list.",
    );

    // --------------------------------------------------------
    // 8. GET AVAILABLE INVENTORY CATEGORIES
    // --------------------------------------------------------

    console.log("--- Getting inventory categories ---");

    const categories = await getInventoryCategories(branchId);

    console.log(categories);

    assert(
      Array.isArray(categories),
      "Inventory categories should be returned as an array.",
    );

    assert(
      categories.includes("Medicines"),
      "Medicines should be available in branch inventory categories.",
    );

    // --------------------------------------------------------
    // 9. GET INVENTORY CATEGORY SUMMARY
    // --------------------------------------------------------

    console.log("--- Getting inventory category summary ---");

    const categorySummary = await getInventoryCategorySummary(branchId);

    console.log(categorySummary);

    assert(
      Array.isArray(categorySummary),
      "Category summary should be returned as an array.",
    );

    const medicinesSummary = categorySummary.find(
      (item) => item.category === "Medicines",
    );

    assert(medicinesSummary, "Medicines should have a category summary.");

    /**
     * The test batch contains 100 units.
     *
     * Therefore the category summary must include at least
     * those 100 units. Other existing Medicine inventory may
     * also belong to the same category.
     */
    assert(
      Number(medicinesSummary.total_items) >= 100,
      "Medicine category should include the test batch quantity.",
    );

    assert(
      Number(medicinesSummary.total_products) >= 1,
      "Medicine category should contain at least one product.",
    );

    /**
     * The test batch alone has a valuation of:
     *
     * 100 × ₹35 = ₹3,500
     *
     * Existing Medicine inventory may increase the total.
     */
    assert(
      Number(medicinesSummary.total_valuation) >= 3500,
      "Medicine category valuation should include the test batch.",
    );

    // --------------------------------------------------------
    // 10. UPDATE BATCH INFORMATION
    // --------------------------------------------------------

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

    assert(updatedBatch !== null, "Inventory batch should be updated.");

    assert(
      updatedBatch.batch_number === "PCM650-B001-UPDATED",
      "Batch number should be updated.",
    );

    assert(Number(updatedBatch.mrp) === 36, "MRP should be updated.");

    assert(
      updatedBatch.shelf_location === "B-05",
      "Shelf location should be updated.",
    );

    // --------------------------------------------------------
    // 11. UPDATE STOCK QUANTITY
    // --------------------------------------------------------

    console.log("--- Updating inventory quantity ---");

    const updatedQuantity = await updateInventoryQuantity(
      branchId,
      inventoryBatchId,
      85,
      userId,
    );

    console.log(updatedQuantity);

    assert(updatedQuantity !== null, "Inventory quantity should be updated.");

    assert(
      Number(updatedQuantity.quantity) === 85,
      "Inventory quantity should be updated to 85.",
    );

    // --------------------------------------------------------
    // 12. VERIFY CATEGORY SUMMARY AFTER QUANTITY UPDATE
    // --------------------------------------------------------

    console.log("--- Verifying category summary after quantity update ---");

    const updatedCategorySummary = await getInventoryCategorySummary(branchId);

    console.log(updatedCategorySummary);

    const updatedMedicinesSummary = updatedCategorySummary.find(
      (item) => item.category === "Medicines",
    );

    assert(
      updatedMedicinesSummary,
      "Medicine category should still exist after quantity update.",
    );

    assert(
      Number(updatedMedicinesSummary.total_items) >= 85,
      "Updated category quantity should include the new stock quantity.",
    );

    // --------------------------------------------------------
    // 13. DELETE INVENTORY BATCH
    // --------------------------------------------------------

    console.log("--- Deleting inventory batch ---");

    const deleted = await deleteInventoryBatch(branchId, inventoryBatchId);

    console.log({
      deleted,
    });

    assert(deleted === true, "Existing inventory batch should be deleted.");

    inventoryBatchId = null;

    console.log("");

    console.log("Inventory repository tests completed successfully.");
  } catch (error) {
    console.error("");
    console.error("Inventory repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    /**
     * Clean up the test batch if the test failed before
     * the normal delete operation.
     */
    if (inventoryBatchId) {
      try {
        await deleteInventoryBatch(branchId, inventoryBatchId);
      } catch (cleanupError) {
        console.error("Inventory test cleanup failed:", cleanupError.message);
      }
    }

    await pool.end();
  }
};

runTests();

// Run using:
// node src/tests/inventory.repository.test.js

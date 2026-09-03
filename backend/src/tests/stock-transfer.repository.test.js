/**
 * Stock Transfer Repository Test
 *
 * Purpose:
 * Verifies stock transfer persistence and retrieval against
 * the local PostgreSQL development database.
 *
 * The test creates:
 *
 *     Product
 *        ↓
 *     Inventory Batch
 *        ↓
 *     Stock Transfer
 *        ↓
 *     Stock Transfer Item
 *
 * It then verifies the transfer retrieval, item retrieval,
 * status update and deletion operations.
 */

const {
  createInventoryBatch,
} = require("../repositories/inventory.repository");

const {
  createStockTransfer,
  getStockTransferById,
  getStockTransferItems,
  getStockTransfersByBranch,
  updateStockTransferStatus,
  deleteStockTransfer,
} = require("../repositories/stock-transfer.repository");

const { pool } = require("../db/connection");

/*
 * Replace these values with the IDs from your development
 * database.
 */
const organisationId = "PUT_YOUR_ORGANISATION_ID_HERE";

const userId = "PUT_YOUR_USER_ID_HERE";

const productId = "PUT_YOUR_PRODUCT_ID_HERE";

const supplierId = "PUT_YOUR_SUPPLIER_ID_HERE";

const fromBranchId = "PUT_MAIN_BRANCH_ID_HERE";

const toBranchId = "PUT_NORTH_BRANCH_ID_HERE";

const runTests = async () => {
  let inventoryBatchId;
  let transferId;

  try {
    /*
     * 1. Create an inventory batch that will be transferred.
     */
    console.log("--- Creating inventory batch ---");

    const inventoryBatch = await createInventoryBatch({
      productId,
      branchId: fromBranchId,
      supplierId,
      batchNumber: "PCM650-TRANSFER-001",
      expiryDate: "2028-12-31",
      mrp: 35.0,
      quantity: 100,
      shelfLocation: "A-10",
      updatedBy: userId,
    });

    inventoryBatchId = inventoryBatch.id;

    console.log(inventoryBatch);

    /*
     * 2. Create the stock transfer.
     *
     * The repository should create the transfer header and
     * its item inside one PostgreSQL transaction.
     */
    console.log("--- Creating stock transfer ---");

    const transfer = await createStockTransfer({
      organisationId,
      fromBranchId,
      toBranchId,
      transferDate: "2026-08-31",
      status: "DRAFT",
      transferNumber: "ST-0001",
      notes: "Transfer for North Branch stock replenishment.",
      createdBy: userId,
      items: [
        {
          inventoryBatchId,
          quantity: 20,
        },
      ],
    });

    transferId = transfer.id;

    console.log(transfer);

    /*
     * 3. Get transfer by ID.
     */
    console.log("--- Getting stock transfer by ID ---");

    const fetchedTransfer = await getStockTransferById(
      organisationId,
      transferId,
    );

    console.log(fetchedTransfer);

    /*
     * 4. Get transfer items.
     */
    console.log("--- Getting stock transfer items ---");

    const transferItems = await getStockTransferItems(
      organisationId,
      transferId,
    );

    console.log(transferItems);

    /*
     * 5. Get transfers associated with the source branch.
     */
    console.log("--- Getting transfers for source branch ---");

    const sourceBranchTransfers = await getStockTransfersByBranch(
      organisationId,
      fromBranchId,
    );

    console.log(sourceBranchTransfers);

    /*
     * 6. Get transfers associated with the destination branch.
     */
    console.log("--- Getting transfers for destination branch ---");

    const destinationBranchTransfers = await getStockTransfersByBranch(
      organisationId,
      toBranchId,
    );

    console.log(destinationBranchTransfers);

    /*
     * 7. Update transfer status.
     */
    console.log("--- Updating transfer status ---");

    const updatedTransfer = await updateStockTransferStatus(
      organisationId,
      transferId,
      "IN_TRANSIT",
    );

    console.log(updatedTransfer);

    /*
     * 8. Delete the transfer.
     *
     * This also removes its transfer items because the
     * foreign key uses ON DELETE CASCADE.
     */
    console.log("--- Deleting stock transfer ---");

    const deleted = await deleteStockTransfer(organisationId, transferId);

    console.log({
      deleted,
    });

    /*
     * 9. Clean up the test inventory batch.
     *
     * The transfer has already been deleted, so the batch
     * can now be removed.
     */
    const {
      deleteInventoryBatch,
    } = require("../repositories/inventory.repository");

    const batchDeleted = await deleteInventoryBatch(
      fromBranchId,
      inventoryBatchId,
    );

    console.log({
      inventoryBatchDeleted: batchDeleted,
    });

    console.log("");
    console.log("Stock transfer repository tests completed successfully.");
  } catch (error) {
    console.error("Stock transfer repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

runTests();

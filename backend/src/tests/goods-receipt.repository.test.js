/**
 * Goods Receipt Repository Test
 *
 * Purpose:
 * Verifies goods receipt creation, retrieval, searching,
 * status updates and deletion against the local PostgreSQL
 * development database.
 *
 * The test uses an existing purchase and purchase item.
 */

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

const { pool } = require("../db/connection");

/*
 * Replace these values with IDs from your development database.
 */
const organisationId = "8096698e-eccf-47b2-ad48-d6a73654016a";

const purchaseId = "2bf576cf-86da-48f9-b74f-150dfe85188c";

const purchaseItemId = "c3aed8d7-f796-45db-800d-916e4e4bbcf1";

const userId = "931b2682-a4de-4ca8-84aa-a7e2e537f3fd";

const branchId = "efbf9a78-6845-4dc8-b2d4-8ff311444918";

const runTests = async () => {
  let receiptId;

  try {
    /*
     * 1. CREATE GOODS RECEIPT
     */
    console.log("--- Creating goods receipt ---");

    const receipt = await createGoodsReceipt({
      organisationId,
      purchaseId,
      receiptNumber: "GR-0001",
      receivedDate: "2026-08-31",
      receivedBy: userId,
      supplierInvoiceNumber: "INV-45821",
      packageCount: 5,
      status: "VERIFIED",
      notes: "Goods received in good condition.",

      items: [
        {
          purchaseItemId,
          receivedQuantity: 80,
          rejectedQuantity: 2,
        },
      ],
    });

    receiptId = receipt.id;

    console.log(receipt);

    /*
     * 2. GET RECEIPT BY ID
     */
    console.log("--- Getting goods receipt by ID ---");

    const fetchedReceipt = await getGoodsReceiptById(organisationId, receiptId);

    console.log(fetchedReceipt);

    /*
     * 3. GET RECEIPT ITEMS
     */
    console.log("--- Getting goods receipt items ---");

    const receiptItems = await getGoodsReceiptItems(organisationId, receiptId);

    console.log(receiptItems);

    /*
     * 4. GET RECEIPTS FOR PURCHASE
     */
    console.log("--- Getting receipts for purchase ---");

    const purchaseReceipts = await getGoodsReceiptsByPurchase(
      organisationId,
      purchaseId,
    );

    console.log(purchaseReceipts);

    /*
     * 5. GET ORGANISATION RECEIPTS
     */
    console.log("--- Getting organisation goods receipts ---");

    const organisationReceipts =
      await getGoodsReceiptsByOrganisation(organisationId);

    console.log(organisationReceipts);

    /*
     * 6. GET BRANCH RECEIPTS
     */
    console.log("--- Getting branch goods receipts ---");

    const branchReceipts = await getGoodsReceiptsByBranch(
      organisationId,
      branchId,
    );

    console.log(branchReceipts);

    /*
     * 7. SEARCH RECEIPTS
     */
    console.log("--- Searching goods receipts ---");

    const searchResults = await searchGoodsReceipts(organisationId, "GR-0001");

    console.log(searchResults);

    /*
     * 8. UPDATE RECEIPT STATUS
     */
    console.log("--- Updating goods receipt status ---");

    const updatedReceipt = await updateGoodsReceiptStatus(
      organisationId,
      receiptId,
      "VERIFIED",
    );

    console.log(updatedReceipt);

    /*
     * 9. DELETE RECEIPT
     */
    console.log("--- Deleting goods receipt ---");

    const deleted = await deleteGoodsReceipt(organisationId, receiptId);

    console.log({
      deleted,
    });

    console.log("");
    console.log("Goods receipt repository tests completed successfully.");
  } catch (error) {
    console.error("Goods receipt repository test failed.");

    console.error(error);

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

runTests();

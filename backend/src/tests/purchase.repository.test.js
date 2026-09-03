/**
 * Purchase Repository Test
 *
 * Purpose:
 * Verifies purchase creation, retrieval, searching, status
 * updates and deletion against the local PostgreSQL database.
 */

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
} = require("../repositories/purchase.repository");

const { pool } = require("../db/connection");

/*
 * Replace these values with the IDs from your development
 * database.
 */
const organisationId = "PUT_YOUR_ORGANISATION_ID_HERE";

const userId = "PUT_YOUR_USER_ID_HERE";

const productId = "PUT_YOUR_PRODUCT_ID_HERE";

const supplierId = "PUT_YOUR_SUPPLIER_ID_HERE";

const branchId = "PUT_YOUR_MAIN_BRANCH_ID_HERE";

const runTests = async () => {
  let purchaseId;

  try {
    /*
     * 1. CREATE PURCHASE
     */
    console.log("--- Creating purchase ---");

    const purchase = await createPurchase({
      organisationId,
      purchaseNumber: "PO-0001",
      supplierId,
      branchId,
      orderDate: "2026-08-31",
      expectedDate: "2026-09-05",
      status: "PENDING",
      notes: "Initial development purchase.",
      createdBy: userId,

      items: [
        {
          productId,
          orderedQuantity: 100,
          unitCost: 25.0,
          taxAmount: 45.0,
          discountAmount: 10.0,
        },
      ],
    });

    purchaseId = purchase.id;

    console.log(purchase);

    /*
     * 2. GET PURCHASE BY ID
     */
    console.log("--- Getting purchase by ID ---");

    const fetchedPurchase = await getPurchaseById(organisationId, purchaseId);

    console.log(fetchedPurchase);

    /*
     * 3. GET PURCHASE ITEMS
     */
    console.log("--- Getting purchase items ---");

    const purchaseItems = await getPurchaseItems(organisationId, purchaseId);

    console.log(purchaseItems);

    /*
     * 4. GET ORGANISATION PURCHASES
     */
    console.log("--- Getting organisation purchases ---");

    const organisationPurchases =
      await getPurchasesByOrganisation(organisationId);

    console.log(organisationPurchases);

    /*
     * 5. GET BRANCH PURCHASES
     */
    console.log("--- Getting branch purchases ---");

    const branchPurchases = await getPurchasesByBranch(
      organisationId,
      branchId,
    );

    console.log(branchPurchases);

    /*
     * 6. GET SUPPLIER PURCHASES
     */
    console.log("--- Getting supplier purchases ---");

    const supplierPurchases = await getPurchasesBySupplier(
      organisationId,
      supplierId,
    );

    console.log(supplierPurchases);

    /*
     * 7. SEARCH PURCHASES
     */
    console.log("--- Searching purchases ---");

    const searchResults = await searchPurchases(organisationId, "PO-0001");

    console.log(searchResults);

    /*
     * 8. UPDATE PURCHASE STATUS
     */
    console.log("--- Updating purchase status ---");

    const updatedPurchase = await updatePurchaseStatus(
      organisationId,
      purchaseId,
      "RECEIVED",
    );

    console.log(updatedPurchase);

    /*
     * 9. DELETE PURCHASE
     */
    console.log("--- Deleting purchase ---");

    const deleted = await deletePurchase(organisationId, purchaseId);

    console.log({
      deleted,
    });

    console.log("");
    console.log("Purchase repository tests completed successfully.");
  } catch (error) {
    console.error("Purchase repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

runTests();

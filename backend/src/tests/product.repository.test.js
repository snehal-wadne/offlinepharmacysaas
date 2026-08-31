/**
 * Product Repository Test
 *
 * Purpose:
 * Manually verifies the basic CRUD and search operations
 * provided by product.repository.js.
 *
 * This script is for development only.
 */

const {
  createProduct,
  getProductById,
  getProductsByOrganisation,
  searchProducts,
  updateProduct,
  deleteProduct,
} = require("../repositories/product.repository");

const { pool } = require("../db/connection");

const organisationId = "PUT YOUR ORGANISATION_ID HERE";

const runTests = async () => {
  try {
    console.log("--- Creating product ---");

    const product = await createProduct({
      organisationId,
      medicineName: "Paracetamol",
      brandName: "Dolo",
      strength: "500 mg",
      packSize: "10 tablets",
      manufacturer: "Micro Labs",
      sku: "DOL-500-10",
    });

    console.log(product);

    console.log("--- Getting product by ID ---");

    const fetchedProduct = await getProductById(organisationId, product.id);

    console.log(fetchedProduct);

    console.log("--- Getting products by organisation ---");

    const products = await getProductsByOrganisation(organisationId);

    console.log(products);

    console.log("--- Searching products ---");

    const searchResults = await searchProducts(organisationId, "Paracetamol");

    console.log(searchResults);

    console.log("--- Updating product ---");

    const updatedProduct = await updateProduct(organisationId, product.id, {
      medicineName: "Paracetamol",
      brandName: "Dolo",
      strength: "650 mg",
      packSize: "15 tablets",
      manufacturer: "Micro Labs",
      sku: "DOL-650-15",
    });

    console.log(updatedProduct);

    console.log("--- Deleting product ---");

    const deleted = await deleteProduct(organisationId, product.id);

    console.log({
      deleted,
    });

    console.log("");
    console.log("Product repository tests completed successfully.");
  } catch (error) {
    console.error("Product repository test failed.");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

runTests();

// Run this file using node src/test/product.repository.test.js

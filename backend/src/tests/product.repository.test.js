/**
 * Product Repository Test
 *
 * Purpose:
 * Verifies product CRUD/search operations and Redis cache
 * behavior implemented by product.repository.js.
 *
 * This is an integration test and requires:
 * - PostgreSQL to be running
 * - Redis to be running
 * - A valid development organisation ID
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
const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { deleteCache } = require("../cache/cache");

/**
 * Replace this with an organisation ID that exists
 * in the development database.
 */
const organisationId = "PUT YOUR ORGANISATION_ID HERE";

/**
 * Builds the same tenant-safe cache key used by
 * product.repository.js.
 */
const buildProductCacheKey = (organisationId, productId) =>
  `organisation:${organisationId}:product:${productId}`;

/**
 * Simple assertion helper for integration tests.
 */
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

const runTests = async () => {
  let product = null;
  let productId = null;

  try {
    // --------------------------------------------------------
    // 1. CONNECT REDIS
    // --------------------------------------------------------

    await connectRedis();

    console.log("Redis connection successful.");

    // --------------------------------------------------------
    // 2. CREATE PRODUCT
    // --------------------------------------------------------

    console.log("--- Creating product ---");

    product = await createProduct({
      organisationId,
      category: "Medicines",
      medicineName: "Paracetamol",
      brandName: "Dolo",
      strength: "500 mg",
      packSize: "10 tablets",
      manufacturer: "Micro Labs",
      sku: "DOL-500-10",
    });

    productId = product.id;

    console.log(product);

    assert(product.id, "Created product should have an ID.");

    assert(
      product.category === "Medicines",
      "Created product should have the correct category.",
    );

    // --------------------------------------------------------
    // 3. CACHE MISS
    // --------------------------------------------------------

    console.log("--- Testing cache miss ---");

    const cacheKey = buildProductCacheKey(organisationId, productId);

    await deleteCache(cacheKey);

    const firstFetch = await getProductById(organisationId, productId);

    console.log(firstFetch);

    assert(firstFetch !== null, "Product should be returned on cache miss.");

    assert(firstFetch.id === productId, "Fetched product ID should match.");

    assert(
      firstFetch.category === "Medicines",
      "Fetched product should contain the correct category.",
    );

    // --------------------------------------------------------
    // 4. VERIFY REDIS CACHE
    // --------------------------------------------------------

    console.log("--- Verifying product was cached ---");

    const cachedProduct = await redisClient.get(cacheKey);

    assert(cachedProduct !== null, "Product should be stored in Redis.");

    const parsedCachedProduct = JSON.parse(cachedProduct);

    assert(
      parsedCachedProduct.category === "Medicines",
      "Cached product should contain the correct category.",
    );

    console.log("Product successfully cached in Redis.");

    // --------------------------------------------------------
    // 5. CACHE HIT
    // --------------------------------------------------------

    console.log("--- Testing cache hit ---");

    const secondFetch = await getProductById(organisationId, productId);

    console.log(secondFetch);

    assert(secondFetch !== null, "Product should be returned on cache hit.");

    assert(
      secondFetch.category === "Medicines",
      "Cache hit should return the correct category.",
    );

    console.log("Cache hit successful.");

    // --------------------------------------------------------
    // 6. TENANT-SAFE CACHE KEY
    // --------------------------------------------------------

    console.log("--- Testing tenant-safe cache key ---");

    const anotherOrganisationId = "00000000-0000-0000-0000-000000000001";

    const otherOrganisationCacheKey = buildProductCacheKey(
      anotherOrganisationId,
      productId,
    );

    assert(
      cacheKey !== otherOrganisationCacheKey,
      "Different organisations must have different cache keys.",
    );

    console.log("Tenant-safe cache key verified.");

    // --------------------------------------------------------
    // 7. GET PRODUCTS BY ORGANISATION
    // --------------------------------------------------------

    console.log("--- Getting products by organisation ---");

    const products = await getProductsByOrganisation(organisationId);

    console.log(products);

    const listedProduct = products.find((item) => item.id === productId);

    assert(
      listedProduct,
      "Created product should appear in organisation products.",
    );

    assert(
      listedProduct.category === "Medicines",
      "Organisation product list should contain category.",
    );

    // --------------------------------------------------------
    // 8. SEARCH PRODUCTS
    // --------------------------------------------------------

    console.log("--- Searching products ---");

    const searchResults = await searchProducts(organisationId, "Paracetamol");

    console.log(searchResults);

    const searchedProduct = searchResults.find((item) => item.id === productId);

    assert(searchedProduct, "Created product should appear in search results.");

    assert(
      searchedProduct.category === "Medicines",
      "Search result should contain category.",
    );

    // --------------------------------------------------------
    // 9. SEARCH BY CATEGORY
    // --------------------------------------------------------

    console.log("--- Searching products by category ---");

    const categoryResults = await searchProducts(organisationId, "Medicines");

    console.log(categoryResults);

    const categoryProduct = categoryResults.find(
      (item) => item.id === productId,
    );

    assert(categoryProduct, "Product should be searchable by category.");

    // --------------------------------------------------------
    // 10. UPDATE PRODUCT
    // --------------------------------------------------------

    console.log("--- Updating product ---");

    const updatedProduct = await updateProduct(organisationId, productId, {
      category: "Medicines",
      medicineName: "Paracetamol",
      brandName: "Dolo",
      strength: "650 mg",
      packSize: "15 tablets",
      manufacturer: "Micro Labs",
      sku: "DOL-500-10-UPDATED",
    });

    console.log(updatedProduct);

    assert(
      updatedProduct !== null,
      "Product update should return the updated product.",
    );

    assert(
      updatedProduct.category === "Medicines",
      "Updated product should have the correct category.",
    );

    assert(
      updatedProduct.strength === "650 mg",
      "Product strength should be updated.",
    );

    assert(
      updatedProduct.sku === "DOL-500-10-UPDATED",
      "Product SKU should be updated.",
    );

    // --------------------------------------------------------
    // 11. VERIFY UPDATE CACHE INVALIDATION
    // --------------------------------------------------------

    console.log("--- Verifying update cache invalidation ---");

    const cacheAfterUpdate = await redisClient.get(cacheKey);

    assert(
      cacheAfterUpdate === null,
      "Updating a product should invalidate its Redis cache.",
    );

    console.log("Update cache invalidation successful.");

    // --------------------------------------------------------
    // 12. VERIFY FRESH UPDATED PRODUCT
    // --------------------------------------------------------

    console.log("--- Testing fresh read after update ---");

    const freshProduct = await getProductById(organisationId, productId);

    console.log(freshProduct);

    assert(
      freshProduct.category === "Medicines",
      "Fresh read should return the correct category.",
    );

    assert(
      freshProduct.strength === "650 mg",
      "Fresh read should return updated strength.",
    );

    assert(
      updatedProduct.sku === "DOL-500-10-UPDATED",
      "Product SKU should be updated.",
    );

    // --------------------------------------------------------
    // 13. VERIFY PRODUCT IS CACHED AGAIN
    // --------------------------------------------------------

    console.log("--- Verifying updated product was cached again ---");

    const cacheAfterFreshRead = await redisClient.get(cacheKey);

    assert(
      cacheAfterFreshRead !== null,
      "Updated product should be cached again.",
    );

    const parsedUpdatedCache = JSON.parse(cacheAfterFreshRead);

    assert(
      parsedUpdatedCache.category === "Medicines",
      "Updated cached product should contain category.",
    );

    console.log("Updated product successfully cached.");

    // --------------------------------------------------------
    // 14. DELETE PRODUCT
    // --------------------------------------------------------

    console.log("--- Deleting product ---");

    const deleted = await deleteProduct(organisationId, productId);

    console.log({
      deleted,
    });

    assert(
      deleted === true,
      "Existing product should be deleted successfully.",
    );

    product = null;

    // --------------------------------------------------------
    // 15. VERIFY DELETE CACHE INVALIDATION
    // --------------------------------------------------------

    console.log("--- Verifying delete cache invalidation ---");

    const cacheAfterDelete = await redisClient.get(cacheKey);

    assert(
      cacheAfterDelete === null,
      "Deleting a product should invalidate Redis cache.",
    );

    console.log("Delete cache invalidation successful.");

    // --------------------------------------------------------
    // 16. VERIFY DELETED PRODUCT RETURNS NULL
    // --------------------------------------------------------

    console.log("--- Verifying deleted product ---");

    const deletedProduct = await getProductById(organisationId, productId);

    assert(deletedProduct === null, "Deleted product should return null.");

    console.log("Deleted product correctly returns null.");

    console.log("");
    console.log("Product repository tests completed successfully.");
  } catch (error) {
    console.error("");
    console.error("Product repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    /**
     * If the test failed before the normal deletion,
     * clean up the created product.
     */
    if (product) {
      try {
        await deleteProduct(organisationId, productId);
      } catch (cleanupError) {
        console.error("Test cleanup failed:", cleanupError.message);
      }
    }

    try {
      if (productId) {
        await deleteCache(buildProductCacheKey(organisationId, productId));
      }
    } catch (cleanupError) {
      console.error("Redis cleanup failed:", cleanupError.message);
    }

    await disconnectRedis();
    await pool.end();
  }
};

runTests();

// Run using:
// node src/tests/product.repository.test.js

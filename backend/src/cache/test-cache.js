/**
 * ------------------------------------------------------------
 * CACHE LAYER TEST
 * ------------------------------------------------------------
 *
 * Verifies that our application-level cache helper can:
 *
 * 1. Store JavaScript data in Redis.
 * 2. Retrieve and deserialize the data.
 * 3. Delete cached data.
 * 4. Correctly report a cache miss.
 */

require("dotenv").config();

const { connectRedis, disconnectRedis } = require("../cache/redis");

const { getCache, setCache, deleteCache } = require("../cache/cache");

const testCache = async () => {
  const cacheKey = "falah:test:cache";

  const testData = {
    id: "test-product-1",
    medicineName: "Paracetamol",
    quantity: 100,
  };

  try {
    console.log("Connecting to Redis...");

    await connectRedis();

    // --------------------------------------------------------
    // 1. Make sure the test starts with a clean cache key.
    // --------------------------------------------------------

    await deleteCache(cacheKey);

    // --------------------------------------------------------
    // 2. Verify cache miss.
    // --------------------------------------------------------

    const missingValue = await getCache(cacheKey);

    if (missingValue !== null) {
      throw new Error("Expected cache miss, but received data.");
    }

    console.log("Cache miss test passed.");

    // --------------------------------------------------------
    // 3. Store test data.
    // --------------------------------------------------------

    await setCache(cacheKey, testData, 60);

    console.log("Cache write successful.");

    // --------------------------------------------------------
    // 4. Retrieve the cached data.
    // --------------------------------------------------------

    const cachedValue = await getCache(cacheKey);

    if (
      !cachedValue ||
      cachedValue.id !== testData.id ||
      cachedValue.medicineName !== testData.medicineName ||
      cachedValue.quantity !== testData.quantity
    ) {
      throw new Error("Cached data did not match the original data.");
    }

    console.log("Cache read test passed.");

    // --------------------------------------------------------
    // 5. Delete the cached value.
    // --------------------------------------------------------

    await deleteCache(cacheKey);

    // --------------------------------------------------------
    // 6. Verify that deletion worked.
    // --------------------------------------------------------

    const deletedValue = await getCache(cacheKey);

    if (deletedValue !== null) {
      throw new Error("Cache value still exists after deletion.");
    }

    console.log("Cache deletion test passed.");

    console.log("Cache layer test passed successfully.");
  } catch (error) {
    console.error("Cache layer test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    await disconnectRedis();
  }
};

testCache();

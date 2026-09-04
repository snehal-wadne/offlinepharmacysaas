/**
 * Customer Repository Test
 *
 * Purpose:
 * Verifies customer creation, retrieval, listing, searching,
 * updating, deletion, tenant isolation, business-number
 * generation, and Redis cache behavior implemented by
 * customer.repository.js.
 *
 * This is an integration test and requires:
 * - PostgreSQL to be running
 * - Redis to be running
 * - The current database schema to be applied
 */

const {
  createCustomer,
  getCustomerById,
  getCustomersByOrganisation,
  searchCustomers,
  updateCustomer,
  deleteCustomer,
} = require("../repositories/customer.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { deleteCache } = require("../cache/cache");

/**
 * Simple assertion helper for integration tests.
 */
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

/**
 * Builds the same tenant-safe cache key used by
 * customer.repository.js.
 */
const buildCustomerCacheKey = (organisationId, customerId) =>
  `organisation:${organisationId}:customer:${customerId}`;

/**
 * Creates a test user and organisation.
 *
 * A fresh organisation is used so that the customer sequence
 * starts independently from other tests.
 */
const createTestOrganisation = async () => {
  const uniqueValue = Date.now();

  const userResult = await pool.query(
    `
      INSERT INTO users (
          email,
          password_hash,
          name
      )
      VALUES ($1, $2, $3)
      RETURNING id;
    `,
    [
      `customer-test-${uniqueValue}@example.com`,
      "test-password-hash",
      "Customer Repository Test User",
    ],
  );

  const userId = userResult.rows[0].id;

  const organisationResult = await pool.query(
    `
      INSERT INTO organisations (
          owner_id,
          name
      )
      VALUES ($1, $2)
      RETURNING id;
    `,
    [userId, `Customer Repository Test Organisation ${uniqueValue}`],
  );

  return {
    userId,
    organisationId: organisationResult.rows[0].id,
  };
};

/**
 * Main test runner.
 */
const runTests = async () => {
  let testUserId = null;
  let organisationId = null;

  let customer = null;
  let customerId = null;

  try {
    // --------------------------------------------------------
    // 1. CONNECT REDIS
    // --------------------------------------------------------

    await connectRedis();

    console.log("Redis connection successful.");

    // --------------------------------------------------------
    // 2. CREATE TEST ORGANISATION
    // --------------------------------------------------------

    console.log("--- Creating isolated test organisation ---");

    const testOrganisation = await createTestOrganisation();

    testUserId = testOrganisation.userId;
    organisationId = testOrganisation.organisationId;

    console.log({
      testUserId,
      organisationId,
    });

    assert(organisationId, "Test organisation should have an ID.");

    // --------------------------------------------------------
    // 3. CREATE CUSTOMER
    // --------------------------------------------------------

    console.log("--- Creating customer ---");

    customer = await createCustomer({
      organisationId,
      fullName: "Rajesh Verma",
      phone: "9876543210",
      email: "rajesh@example.com",
      dateOfBirth: "1990-05-15",
      gender: "MALE",
      category: "REGULAR",
      address: "Pune, Maharashtra",
    });

    customerId = customer.id;

    console.log(customer);

    assert(customer.id, "Created customer should have an ID.");

    assert(
      customer.organisation_id === organisationId,
      "Customer should belong to the test organisation.",
    );

    assert(
      customer.customer_number === "CUST-1001",
      "First customer should receive CUST-1001.",
    );

    assert(
      customer.full_name === "Rajesh Verma",
      "Created customer should have the correct name.",
    );

    assert(
      customer.phone === "9876543210",
      "Created customer should have the correct phone.",
    );

    assert(
      customer.category === "REGULAR",
      "Created customer should have the correct category.",
    );

    console.log("Customer creation and business-number generation successful.");

    // --------------------------------------------------------
    // 4. VERIFY CUSTOMER CACHE KEY
    // --------------------------------------------------------

    console.log("--- Verifying tenant-safe customer cache key ---");

    const cacheKey = buildCustomerCacheKey(organisationId, customerId);

    const anotherOrganisationId = "00000000-0000-0000-0000-000000000001";

    const otherOrganisationCacheKey = buildCustomerCacheKey(
      anotherOrganisationId,
      customerId,
    );

    assert(
      cacheKey !== otherOrganisationCacheKey,
      "Different organisations must have different customer cache keys.",
    );

    console.log("Tenant-safe cache key verified.");

    // --------------------------------------------------------
    // 5. CACHE MISS
    // --------------------------------------------------------

    console.log("--- Testing customer cache miss ---");

    await deleteCache(cacheKey);

    const firstFetch = await getCustomerById(organisationId, customerId);

    console.log(firstFetch);

    assert(firstFetch !== null, "Customer should be returned on cache miss.");

    assert(firstFetch.id === customerId, "Fetched customer ID should match.");

    assert(
      firstFetch.customer_number === "CUST-1001",
      "Fetched customer should have the correct customer number.",
    );

    assert(
      firstFetch.full_name === "Rajesh Verma",
      "Fetched customer should have the correct name.",
    );

    console.log("Customer cache miss successful.");

    // --------------------------------------------------------
    // 6. VERIFY REDIS CACHE
    // --------------------------------------------------------

    console.log("--- Verifying customer was cached ---");

    const cachedCustomer = await redisClient.get(cacheKey);

    assert(cachedCustomer !== null, "Customer should be stored in Redis.");

    const parsedCachedCustomer = JSON.parse(cachedCustomer);

    assert(
      parsedCachedCustomer.id === customerId,
      "Cached customer ID should match.",
    );

    assert(
      parsedCachedCustomer.full_name === "Rajesh Verma",
      "Cached customer should contain the correct name.",
    );

    assert(
      parsedCachedCustomer.customer_number === "CUST-1001",
      "Cached customer should contain the correct business number.",
    );

    console.log("Customer successfully cached in Redis.");

    // --------------------------------------------------------
    // 7. CACHE HIT
    // --------------------------------------------------------

    console.log("--- Testing customer cache hit ---");

    const secondFetch = await getCustomerById(organisationId, customerId);

    console.log(secondFetch);

    assert(secondFetch !== null, "Customer should be returned on cache hit.");

    assert(
      secondFetch.id === customerId,
      "Cache-hit customer ID should match.",
    );

    assert(
      secondFetch.full_name === "Rajesh Verma",
      "Cache-hit customer should have the correct name.",
    );

    console.log("Customer cache hit successful.");

    // --------------------------------------------------------
    // 8. TENANT ISOLATION
    // --------------------------------------------------------

    console.log("--- Testing customer tenant isolation ---");

    const customerFromOtherOrganisation = await getCustomerById(
      anotherOrganisationId,
      customerId,
    );

    assert(
      customerFromOtherOrganisation === null,
      "Customer must not be accessible through another organisation.",
    );

    console.log("Customer tenant isolation verified.");

    // --------------------------------------------------------
    // 9. GET CUSTOMERS BY ORGANISATION
    // --------------------------------------------------------

    console.log("--- Getting customers by organisation ---");

    const customers = await getCustomersByOrganisation(organisationId);

    console.log(customers);

    const listedCustomer = customers.find((item) => item.id === customerId);

    assert(
      listedCustomer,
      "Created customer should appear in organisation customer list.",
    );

    assert(
      listedCustomer.customer_number === "CUST-1001",
      "Organisation customer list should contain the correct customer number.",
    );

    assert(
      listedCustomer.full_name === "Rajesh Verma",
      "Organisation customer list should contain the correct name.",
    );

    console.log("Organisation customer listing successful.");

    // --------------------------------------------------------
    // 10. SEARCH BY NAME
    // --------------------------------------------------------

    console.log("--- Searching customers by name ---");

    const nameResults = await searchCustomers(organisationId, "Rajesh");

    console.log(nameResults);

    const nameMatch = nameResults.find((item) => item.id === customerId);

    assert(nameMatch, "Customer should appear in name search results.");

    console.log("Customer name search successful.");

    // --------------------------------------------------------
    // 11. SEARCH BY PHONE
    // --------------------------------------------------------

    console.log("--- Searching customers by phone ---");

    const phoneResults = await searchCustomers(organisationId, "9876543210");

    console.log(phoneResults);

    const phoneMatch = phoneResults.find((item) => item.id === customerId);

    assert(phoneMatch, "Customer should appear in phone search results.");

    console.log("Customer phone search successful.");

    // --------------------------------------------------------
    // 12. SEARCH BY CATEGORY
    // --------------------------------------------------------

    console.log("--- Searching customers by category ---");

    const categoryResults = await searchCustomers(organisationId, "REGULAR");

    console.log(categoryResults);

    const categoryMatch = categoryResults.find(
      (item) => item.id === customerId,
    );

    assert(categoryMatch, "Customer should appear in category search results.");

    console.log("Customer category search successful.");

    // --------------------------------------------------------
    // 13. SEARCH BY CUSTOMER NUMBER
    // --------------------------------------------------------

    console.log("--- Searching customers by customer number ---");

    const numberResults = await searchCustomers(organisationId, "CUST-1001");

    console.log(numberResults);

    const numberMatch = numberResults.find((item) => item.id === customerId);

    assert(
      numberMatch,
      "Customer should appear when searching by customer number.",
    );

    console.log("Customer-number search successful.");

    // --------------------------------------------------------
    // 14. CREATE SECOND CUSTOMER
    // --------------------------------------------------------

    console.log("--- Creating second customer ---");

    const secondCustomer = await createCustomer({
      organisationId,
      fullName: "Priya Sharma",
      phone: "9123456780",
      email: "priya@example.com",
      dateOfBirth: "1995-08-20",
      gender: "FEMALE",
      category: "CORPORATE",
      address: "Mumbai, Maharashtra",
    });

    console.log(secondCustomer);

    assert(
      secondCustomer.customer_number === "CUST-1002",
      "Second customer should receive CUST-1002.",
    );

    assert(
      secondCustomer.full_name === "Priya Sharma",
      "Second customer should have the correct name.",
    );

    console.log("Independent customer sequence increment verified.");

    // --------------------------------------------------------
    // 15. UPDATE CUSTOMER
    // --------------------------------------------------------

    console.log("--- Updating customer ---");

    const updatedCustomer = await updateCustomer(organisationId, customerId, {
      fullName: "Rajesh Kumar Verma",
      phone: "9876543211",
      email: "rajesh.updated@example.com",
      dateOfBirth: "1990-05-15",
      gender: "MALE",
      category: "PREMIUM",
      address: "Pune, Maharashtra, India",
      status: "ACTIVE",
    });

    console.log(updatedCustomer);

    assert(
      updatedCustomer !== null,
      "Customer update should return the updated customer.",
    );

    assert(
      updatedCustomer.full_name === "Rajesh Kumar Verma",
      "Customer name should be updated.",
    );

    assert(
      updatedCustomer.phone === "9876543211",
      "Customer phone should be updated.",
    );

    assert(
      updatedCustomer.email === "rajesh.updated@example.com",
      "Customer email should be updated.",
    );

    assert(
      updatedCustomer.category === "PREMIUM",
      "Customer category should be updated.",
    );

    assert(
      updatedCustomer.customer_number === "CUST-1001",
      "Customer number must remain unchanged after update.",
    );

    console.log("Customer update successful.");

    // --------------------------------------------------------
    // 16. VERIFY UPDATE CACHE INVALIDATION
    // --------------------------------------------------------

    console.log("--- Verifying customer update cache invalidation ---");

    const cacheAfterUpdate = await redisClient.get(cacheKey);

    assert(
      cacheAfterUpdate === null,
      "Updating a customer should invalidate its Redis cache.",
    );

    console.log("Customer update cache invalidation successful.");

    // --------------------------------------------------------
    // 17. VERIFY FRESH UPDATED CUSTOMER
    // --------------------------------------------------------

    console.log("--- Testing fresh customer read after update ---");

    const freshCustomer = await getCustomerById(organisationId, customerId);

    console.log(freshCustomer);

    assert(
      freshCustomer !== null,
      "Updated customer should be returned after cache invalidation.",
    );

    assert(
      freshCustomer.full_name === "Rajesh Kumar Verma",
      "Fresh customer read should return updated name.",
    );

    assert(
      freshCustomer.phone === "9876543211",
      "Fresh customer read should return updated phone.",
    );

    assert(
      freshCustomer.category === "PREMIUM",
      "Fresh customer read should return updated category.",
    );

    assert(
      freshCustomer.customer_number === "CUST-1001",
      "Fresh customer read should preserve customer number.",
    );

    console.log("Fresh updated customer read successful.");

    // --------------------------------------------------------
    // 18. VERIFY UPDATED CUSTOMER IS CACHED AGAIN
    // --------------------------------------------------------

    console.log("--- Verifying updated customer was cached again ---");

    const cacheAfterFreshRead = await redisClient.get(cacheKey);

    assert(
      cacheAfterFreshRead !== null,
      "Updated customer should be cached again.",
    );

    const parsedUpdatedCache = JSON.parse(cacheAfterFreshRead);

    assert(
      parsedUpdatedCache.full_name === "Rajesh Kumar Verma",
      "Updated cached customer should contain the new name.",
    );

    assert(
      parsedUpdatedCache.category === "PREMIUM",
      "Updated cached customer should contain the new category.",
    );

    console.log("Updated customer successfully cached.");

    // --------------------------------------------------------
    // 19. VERIFY INACTIVE STATUS
    // --------------------------------------------------------

    console.log("--- Testing customer deactivation ---");

    const deactivatedCustomer = await updateCustomer(
      organisationId,
      customerId,
      {
        fullName: "Rajesh Kumar Verma",
        phone: "9876543211",
        email: "rajesh.updated@example.com",
        dateOfBirth: "1990-05-15",
        gender: "MALE",
        category: "PREMIUM",
        address: "Pune, Maharashtra, India",
        status: "INACTIVE",
      },
    );

    console.log(deactivatedCustomer);

    assert(
      deactivatedCustomer !== null,
      "Customer should be updateable to INACTIVE status.",
    );

    assert(
      deactivatedCustomer.status === "INACTIVE",
      "Customer status should become INACTIVE.",
    );

    console.log("Customer deactivation successful.");

    // --------------------------------------------------------
    // 20. DELETE CUSTOMER
    // --------------------------------------------------------

    console.log("--- Deleting customers ---");

    /**
     * Delete the test customers.
     *
     * These customers have no dependent invoice,
     * prescription, ledger, or other financial records, so
     * PostgreSQL should allow deletion.
     */
    const deletedFirstCustomer = await deleteCustomer(
      organisationId,
      customerId,
    );

    const deletedSecondCustomer = await deleteCustomer(
      organisationId,
      secondCustomer.id,
    );

    console.log({
      deletedFirstCustomer,
      deletedSecondCustomer,
    });

    assert(
      deletedFirstCustomer === true,
      "Existing first customer should be deleted successfully.",
    );

    assert(
      deletedSecondCustomer === true,
      "Existing second customer should be deleted successfully.",
    );

    customer = null;

    console.log("Customer deletion successful.");

    // --------------------------------------------------------
    // 21. VERIFY DELETE CACHE INVALIDATION
    // --------------------------------------------------------

    console.log("--- Verifying customer delete cache invalidation ---");

    const cacheAfterDelete = await redisClient.get(cacheKey);

    assert(
      cacheAfterDelete === null,
      "Deleting a customer should invalidate Redis cache.",
    );

    console.log("Customer delete cache invalidation successful.");

    // --------------------------------------------------------
    // 22. VERIFY DELETED CUSTOMER RETURNS NULL
    // --------------------------------------------------------

    console.log("--- Verifying deleted customer ---");

    const deletedCustomer = await getCustomerById(organisationId, customerId);

    assert(deletedCustomer === null, "Deleted customer should return null.");

    console.log("Deleted customer correctly returns null.");

    // --------------------------------------------------------
    // 23. VERIFY CUSTOMER SEQUENCE STATE
    // --------------------------------------------------------

    console.log("--- Verifying customer sequence state ---");

    const sequenceResult = await pool.query(
      `
        SELECT
            next_number
        FROM number_sequences
        WHERE organisation_id = $1
          AND branch_id IS NULL
          AND sequence_type = 'CUSTOMER';
      `,
      [organisationId],
    );

    assert(
      sequenceResult.rowCount === 1,
      "Customer number sequence should exist for the organisation.",
    );

    assert(
      Number(sequenceResult.rows[0].next_number) === 1003,
      "Customer sequence should advance to 1003 after issuing two customer numbers.",
    );

    console.log("Customer number sequence state verified.");

    // --------------------------------------------------------
    // 24. SUCCESS
    // --------------------------------------------------------

    console.log("");
    console.log("Customer repository tests completed successfully.");
  } catch (error) {
    console.error("");
    console.error("Customer repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    // --------------------------------------------------------
    // CLEANUP CUSTOMER
    // --------------------------------------------------------

    /**
     * If the test failed before the normal deletion,
     * attempt to remove the created customer.
     */
    if (customerId && organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM customers
            WHERE id = $1
              AND organisation_id = $2;
          `,
          [customerId, organisationId],
        );
      } catch (cleanupError) {
        console.error("Customer cleanup failed:", cleanupError.message);
      }
    }

    // --------------------------------------------------------
    // CLEANUP ORGANISATION
    // --------------------------------------------------------

    if (organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM organisations
            WHERE id = $1;
          `,
          [organisationId],
        );
      } catch (cleanupError) {
        console.error("Organisation cleanup failed:", cleanupError.message);
      }
    }

    // --------------------------------------------------------
    // CLEANUP USER
    // --------------------------------------------------------

    if (testUserId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [testUserId],
        );
      } catch (cleanupError) {
        console.error("Test user cleanup failed:", cleanupError.message);
      }
    }

    // --------------------------------------------------------
    // DISCONNECT REDIS
    // --------------------------------------------------------

    try {
      await disconnectRedis();
    } catch (redisError) {
      console.error("Redis disconnect failed:", redisError.message);
    }

    // --------------------------------------------------------
    // CLOSE POSTGRESQL POOL
    // --------------------------------------------------------

    await pool.end();
  }
};

runTests();

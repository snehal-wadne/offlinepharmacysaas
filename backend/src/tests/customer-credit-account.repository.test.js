/**
 * Customer Credit Account Repository Test
 *
 * Purpose:
 * Verifies customer credit-account creation, retrieval,
 * organisation listing, tenant isolation, duplicate-account
 * protection, updates, Redis caching, cache invalidation,
 * and deletion.
 *
 * This is an integration test and requires:
 * - PostgreSQL to be running
 * - Redis to be running
 * - The current database schema to be applied
 */

const { createCustomer } = require("../repositories/customer.repository");

const {
  createCreditAccount,
  getCreditAccountById,
  getCreditAccountByCustomerId,
  getCreditAccountsByOrganisation,
  updateCreditAccount,
  deleteCreditAccount,
} = require("../repositories/customer-credit-account.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { deleteCache } = require("../cache/cache");

/**
 * Simple assertion helper.
 */
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

/**
 * Builds the same cache key used by the repository.
 */
const buildCreditAccountCacheKey = (organisationId, creditAccountId) =>
  `organisation:${organisationId}:customer-credit-account:${creditAccountId}`;

/**
 * Creates an isolated test organisation.
 */
const createTestOrganisation = async (label) => {
  const uniqueValue = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
      `credit-${label}-${uniqueValue}@example.com`,
      "test-password-hash",
      `Credit Account Test User ${label}`,
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
    [userId, `Credit Account Test Organisation ${label} ${uniqueValue}`],
  );

  return {
    userId,
    organisationId: organisationResult.rows[0].id,
  };
};

const runTests = async () => {
  let organisationA = null;
  let organisationB = null;

  let customerA = null;
  let customerB = null;

  let creditAccount = null;

  try {
    // --------------------------------------------------------
    // 1. CONNECT REDIS
    // --------------------------------------------------------

    await connectRedis();

    console.log("Redis connection successful.");

    // --------------------------------------------------------
    // 2. CREATE TEST ORGANISATIONS
    // --------------------------------------------------------

    console.log("--- Creating isolated test organisations ---");

    organisationA = await createTestOrganisation("A");

    organisationB = await createTestOrganisation("B");

    assert(
      organisationA.organisationId !== organisationB.organisationId,
      "Test organisations must be different.",
    );

    // --------------------------------------------------------
    // 3. CREATE CUSTOMER A
    // --------------------------------------------------------

    console.log("--- Creating Customer A ---");

    customerA = await createCustomer({
      organisationId: organisationA.organisationId,

      fullName: "Rajesh Verma",

      phone: "9876543210",

      email: "rajesh@example.com",

      dateOfBirth: "1990-05-15",

      gender: "MALE",

      category: "REGULAR",

      address: "Pune, Maharashtra",
    });

    assert(
      customerA.customer_number === "CUST-1001",
      "Customer A should receive CUST-1001.",
    );

    // --------------------------------------------------------
    // 4. CREATE CUSTOMER B
    // --------------------------------------------------------

    console.log("--- Creating Customer B ---");

    customerB = await createCustomer({
      organisationId: organisationB.organisationId,

      fullName: "Priya Sharma",

      phone: "9123456780",

      email: "priya@example.com",

      dateOfBirth: "1995-08-20",

      gender: "FEMALE",

      category: "REGULAR",

      address: "Mumbai, Maharashtra",
    });

    assert(
      customerB.customer_number === "CUST-1001",
      "Customer B should have an independent organisation-scoped number.",
    );

    // --------------------------------------------------------
    // 5. CREATE CREDIT ACCOUNT
    // --------------------------------------------------------

    console.log("--- Creating credit account ---");

    creditAccount = await createCreditAccount({
      organisationId: organisationA.organisationId,

      customerId: customerA.id,

      creditEnabled: true,

      creditLimit: 25000,
    });

    console.log(creditAccount);

    assert(creditAccount.id, "Credit account should have an ID.");

    assert(
      creditAccount.organisation_id === organisationA.organisationId,
      "Credit account should belong to Organisation A.",
    );

    assert(
      creditAccount.customer_id === customerA.id,
      "Credit account should belong to Customer A.",
    );

    assert(creditAccount.credit_enabled === true, "Credit should be enabled.");

    assert(
      Number(creditAccount.credit_limit) === 25000,
      "Credit limit should be 25000.",
    );

    console.log("Credit account creation successful.");

    // --------------------------------------------------------
    // 6. VERIFY ONE ACCOUNT PER CUSTOMER
    // --------------------------------------------------------

    console.log("--- Testing duplicate credit-account protection ---");

    let duplicateError = null;

    try {
      await createCreditAccount({
        organisationId: organisationA.organisationId,

        customerId: customerA.id,

        creditEnabled: true,

        creditLimit: 50000,
      });
    } catch (error) {
      duplicateError = error;
    }

    assert(
      duplicateError !== null,
      "Creating a second credit account for the same customer must fail.",
    );

    console.log("One-credit-account-per-customer constraint verified.");

    // --------------------------------------------------------
    // 7. GET BY ID - CACHE MISS
    // --------------------------------------------------------

    console.log("--- Testing credit-account cache miss ---");

    const cacheKey = buildCreditAccountCacheKey(
      organisationA.organisationId,
      creditAccount.id,
    );

    await deleteCache(cacheKey);

    const firstFetch = await getCreditAccountById(
      organisationA.organisationId,
      creditAccount.id,
    );

    console.log(firstFetch);

    assert(
      firstFetch !== null,
      "Credit account should be returned on cache miss.",
    );

    assert(
      firstFetch.id === creditAccount.id,
      "Fetched credit account ID should match.",
    );

    console.log("Credit-account cache miss successful.");

    // --------------------------------------------------------
    // 8. VERIFY REDIS CACHE
    // --------------------------------------------------------

    console.log("--- Verifying credit account was cached ---");

    const cachedAccount = await redisClient.get(cacheKey);

    assert(cachedAccount !== null, "Credit account should be stored in Redis.");

    const parsedCachedAccount = JSON.parse(cachedAccount);

    assert(
      parsedCachedAccount.id === creditAccount.id,
      "Cached credit account ID should match.",
    );

    assert(
      Number(parsedCachedAccount.credit_limit) === 25000,
      "Cached credit account should contain the correct limit.",
    );

    console.log("Credit account successfully cached.");

    // --------------------------------------------------------
    // 9. CACHE HIT
    // --------------------------------------------------------

    console.log("--- Testing credit-account cache hit ---");

    const secondFetch = await getCreditAccountById(
      organisationA.organisationId,
      creditAccount.id,
    );

    assert(
      secondFetch !== null,
      "Credit account should be returned on cache hit.",
    );

    assert(
      secondFetch.id === creditAccount.id,
      "Cache-hit credit account ID should match.",
    );

    console.log("Credit-account cache hit successful.");

    // --------------------------------------------------------
    // 10. GET BY CUSTOMER ID
    // --------------------------------------------------------

    console.log("--- Getting credit account by customer ---");

    const customerAccount = await getCreditAccountByCustomerId(
      organisationA.organisationId,
      customerA.id,
    );

    console.log(customerAccount);

    assert(
      customerAccount !== null,
      "Customer credit account should be found.",
    );

    assert(
      customerAccount.id === creditAccount.id,
      "Customer lookup should return the correct credit account.",
    );

    console.log("Customer credit-account lookup successful.");

    // --------------------------------------------------------
    // 11. TENANT ISOLATION BY ID
    // --------------------------------------------------------

    console.log("--- Testing credit-account tenant isolation ---");

    const leakedAccount = await getCreditAccountById(
      organisationB.organisationId,
      creditAccount.id,
    );

    assert(
      leakedAccount === null,
      "Credit account must not be accessible through another organisation.",
    );

    console.log("Credit-account tenant isolation verified.");

    // --------------------------------------------------------
    // 12. TENANT ISOLATION BY CUSTOMER
    // --------------------------------------------------------

    console.log("--- Testing customer lookup tenant isolation ---");

    const wrongTenantLookup = await getCreditAccountByCustomerId(
      organisationB.organisationId,
      customerA.id,
    );

    assert(
      wrongTenantLookup === null,
      "Customer credit-account lookup must be tenant-scoped.",
    );

    console.log("Customer lookup tenant isolation verified.");

    // --------------------------------------------------------
    // 13. CROSS-TENANT CREATE PROTECTION
    // --------------------------------------------------------

    console.log("--- Testing cross-tenant credit-account creation ---");

    let crossTenantError = null;

    try {
      await createCreditAccount({
        organisationId: organisationA.organisationId,

        /**
         * Customer B belongs to Organisation B.
         */
        customerId: customerB.id,

        creditEnabled: true,

        creditLimit: 10000,
      });
    } catch (error) {
      crossTenantError = error;
    }

    assert(
      crossTenantError !== null,
      "Cross-tenant credit-account creation must fail.",
    );

    assert(
      crossTenantError.message.includes(
        "Customer not found in the specified organisation",
      ),
      "Cross-tenant creation should return the expected error.",
    );

    console.log("Cross-tenant credit-account protection verified.");

    // --------------------------------------------------------
    // 14. GET ACCOUNTS BY ORGANISATION
    // --------------------------------------------------------

    console.log("--- Getting credit accounts by organisation ---");

    const accounts = await getCreditAccountsByOrganisation(
      organisationA.organisationId,
    );

    console.log(accounts);

    const listedAccount = accounts.find((item) => item.id === creditAccount.id);

    assert(
      listedAccount,
      "Credit account should appear in organisation listing.",
    );

    assert(
      listedAccount.customer_id === customerA.id,
      "Organisation listing should contain the correct customer.",
    );

    console.log("Organisation credit-account listing successful.");

    // --------------------------------------------------------
    // 15. VERIFY ORGANISATION B CANNOT SEE ACCOUNT
    // --------------------------------------------------------

    console.log("--- Testing organisation-level isolation ---");

    const otherOrganisationAccounts = await getCreditAccountsByOrganisation(
      organisationB.organisationId,
    );

    const leakedListAccount = otherOrganisationAccounts.find(
      (item) => item.id === creditAccount.id,
    );

    assert(
      !leakedListAccount,
      "Credit account must not appear in another organisation's list.",
    );

    console.log("Organisation-level credit-account isolation verified.");

    // --------------------------------------------------------
    // 16. UPDATE CREDIT ACCOUNT
    // --------------------------------------------------------

    console.log("--- Updating credit account ---");

    const updatedAccount = await updateCreditAccount(
      organisationA.organisationId,
      creditAccount.id,
      {
        creditEnabled: true,

        creditLimit: 50000,
      },
    );

    console.log(updatedAccount);

    assert(
      updatedAccount !== null,
      "Credit account update should return the updated account.",
    );

    assert(
      updatedAccount.credit_enabled === true,
      "Credit should remain enabled.",
    );

    assert(
      Number(updatedAccount.credit_limit) === 50000,
      "Credit limit should be updated to 50000.",
    );

    assert(
      updatedAccount.customer_id === customerA.id,
      "Customer association must remain unchanged.",
    );

    console.log("Credit-account update successful.");

    // --------------------------------------------------------
    // 17. VERIFY UPDATE CACHE INVALIDATION
    // --------------------------------------------------------

    console.log("--- Verifying update cache invalidation ---");

    const cacheAfterUpdate = await redisClient.get(cacheKey);

    assert(
      cacheAfterUpdate === null,
      "Updating credit account should invalidate Redis cache.",
    );

    console.log("Update cache invalidation successful.");

    // --------------------------------------------------------
    // 18. VERIFY FRESH UPDATED READ
    // --------------------------------------------------------

    console.log("--- Testing fresh credit-account read ---");

    const freshAccount = await getCreditAccountById(
      organisationA.organisationId,
      creditAccount.id,
    );

    assert(freshAccount !== null, "Updated credit account should be returned.");

    assert(
      Number(freshAccount.credit_limit) === 50000,
      "Fresh read should return the updated credit limit.",
    );

    console.log("Fresh updated credit-account read successful.");

    // --------------------------------------------------------
    // 19. VERIFY CACHE REPOPULATION
    // --------------------------------------------------------

    console.log("--- Verifying updated credit account was cached ---");

    const cacheAfterFreshRead = await redisClient.get(cacheKey);

    assert(
      cacheAfterFreshRead !== null,
      "Updated credit account should be cached again.",
    );

    const parsedUpdatedCache = JSON.parse(cacheAfterFreshRead);

    assert(
      Number(parsedUpdatedCache.credit_limit) === 50000,
      "Updated cache should contain the new credit limit.",
    );

    console.log("Updated credit account successfully cached.");

    // --------------------------------------------------------
    // 20. DISABLE CREDIT
    // --------------------------------------------------------

    console.log("--- Testing credit disabling ---");

    const disabledAccount = await updateCreditAccount(
      organisationA.organisationId,
      creditAccount.id,
      {
        creditEnabled: false,

        creditLimit: 50000,
      },
    );

    assert(disabledAccount !== null, "Credit account should be updateable.");

    assert(
      disabledAccount.credit_enabled === false,
      "Credit should be disabled.",
    );

    assert(
      Number(disabledAccount.credit_limit) === 50000,
      "Credit limit should remain unchanged when disabling credit.",
    );

    console.log("Credit disabling successful.");

    // --------------------------------------------------------
    // 21. DELETE CREDIT ACCOUNT
    // --------------------------------------------------------

    console.log("--- Deleting credit account ---");

    const deleted = await deleteCreditAccount(
      organisationA.organisationId,
      creditAccount.id,
    );

    assert(deleted === true, "Existing credit account should be deleted.");

    creditAccount = null;

    console.log("Credit-account deletion successful.");

    // --------------------------------------------------------
    // 22. VERIFY DELETE CACHE INVALIDATION
    // --------------------------------------------------------

    console.log("--- Verifying delete cache invalidation ---");

    const cacheAfterDelete = await redisClient.get(cacheKey);

    assert(
      cacheAfterDelete === null,
      "Deleting credit account should invalidate Redis cache.",
    );

    console.log("Delete cache invalidation successful.");

    // --------------------------------------------------------
    // 23. VERIFY DELETED ACCOUNT
    // --------------------------------------------------------

    console.log("--- Verifying deleted credit account ---");

    const deletedAccount = await getCreditAccountById(
      organisationA.organisationId,
      /**
       * We still have the original ID through cacheKey
       * construction, so extract it from the original
       * account ID before deletion.
       */
      JSON.parse(
        JSON.stringify({
          id: cacheKey.split(":").pop(),
        }),
      ).id,
    );

    assert(
      deletedAccount === null,
      "Deleted credit account should return null.",
    );

    console.log("Deleted credit account correctly returns null.");

    // --------------------------------------------------------
    // 24. VERIFY CUSTOMER NO LONGER HAS ACCOUNT
    // --------------------------------------------------------

    console.log("--- Verifying customer credit-account removal ---");

    const removedCustomerAccount = await getCreditAccountByCustomerId(
      organisationA.organisationId,
      customerA.id,
    );

    assert(
      removedCustomerAccount === null,
      "Deleted credit account should no longer be found by customer.",
    );

    console.log("Customer credit-account removal verified.");

    // --------------------------------------------------------
    // 25. SUCCESS
    // --------------------------------------------------------

    console.log("");
    console.log(
      "Customer credit account repository tests completed successfully.",
    );
  } catch (error) {
    console.error("");
    console.error("Customer credit account repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    // --------------------------------------------------------
    // CLEANUP ORGANISATIONS
    // --------------------------------------------------------

    if (organisationA) {
      try {
        await pool.query(
          `
            DELETE FROM organisations
            WHERE id = $1;
          `,
          [organisationA.organisationId],
        );
      } catch (cleanupError) {
        console.error("Organisation A cleanup failed:", cleanupError.message);
      }
    }

    if (organisationB) {
      try {
        await pool.query(
          `
            DELETE FROM organisations
            WHERE id = $1;
          `,
          [organisationB.organisationId],
        );
      } catch (cleanupError) {
        console.error("Organisation B cleanup failed:", cleanupError.message);
      }
    }

    // --------------------------------------------------------
    // CLEANUP USERS
    // --------------------------------------------------------

    if (organisationA?.userId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [organisationA.userId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation A user cleanup failed:",
          cleanupError.message,
        );
      }
    }

    if (organisationB?.userId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [organisationB.userId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation B user cleanup failed:",
          cleanupError.message,
        );
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

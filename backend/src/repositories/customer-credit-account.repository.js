/**
 * Customer Credit Account Repository
 *
 * Purpose:
 * Handles direct PostgreSQL operations for customer credit accounts.
 *
 * Responsibilities:
 * - Tenant-safe database access
 * - Credit-account CRUD
 * - Customer ownership validation
 * - Redis caching for individual credit-account reads
 *
 * Business rules such as:
 * - Whether a customer is eligible for credit
 * - Whether an invoice may exceed the credit limit
 * - Whether outstanding balance is sufficient
 * - Whether credit should be enabled/disabled
 *
 * belong in the service layer.
 *
 * PostgreSQL remains the source of truth.
 */

const { pool } = require("../db/connection");

const { getCache, setCache, deleteCache } = require("../cache/cache");

/**
 * Individual credit-account cache TTL.
 */
const CREDIT_ACCOUNT_CACHE_TTL = 60;

/**
 * Builds the tenant-safe cache key for a credit account.
 *
 * @param {string} organisationId
 * @param {string} creditAccountId
 *
 * @returns {string}
 */
const buildCreditAccountCacheKey = (organisationId, creditAccountId) =>
  `organisation:${organisationId}:customer-credit-account:${creditAccountId}`;

/**
 * Explicit credit-account columns.
 */
const CREDIT_ACCOUNT_COLUMNS = `
    id,
    organisation_id,
    customer_id,
    credit_enabled,
    credit_limit,
    created_at,
    updated_at
`;

/**
 * Create a customer credit account.
 *
 * A customer can have only one credit account.
 *
 * The customer is validated against the supplied organisation
 * before the account is inserted.
 *
 * @param {Object} account
 * @param {string} account.organisationId
 * @param {string} account.customerId
 * @param {boolean} account.creditEnabled
 * @param {number|string} account.creditLimit
 * @param {Object|null} client PostgreSQL client
 *
 * @returns {Promise<Object>}
 */
const createCreditAccount = async ({
  organisationId,
  customerId,
  creditEnabled = false,
  creditLimit = 0,
  client = null,
}) => {
  const dbClient = client || pool;

  const query = `
        INSERT INTO customer_credit_accounts (
            organisation_id,
            customer_id,
            credit_enabled,
            credit_limit
        )
        SELECT
            $1,
            c.id,
            $3,
            $4
        FROM customers c
        WHERE c.id = $2
          AND c.organisation_id = $1
        RETURNING
            ${CREDIT_ACCOUNT_COLUMNS};
    `;

  const values = [organisationId, customerId, creditEnabled, creditLimit];

  const result = await dbClient.query(query, values);

  /**
   * No row means the customer either:
   * - does not exist, or
   * - belongs to another organisation.
   */
  if (result.rowCount === 0) {
    throw new Error("Customer not found in the specified organisation.");
  }

  return result.rows[0];
};

/**
 * Get a credit account by its ID.
 *
 * Tenant isolation is enforced through organisation_id.
 *
 * @param {string} organisationId
 * @param {string} creditAccountId
 *
 * @returns {Promise<Object|null>}
 */
const getCreditAccountById = async (organisationId, creditAccountId) => {
  const cacheKey = buildCreditAccountCacheKey(organisationId, creditAccountId);

  /**
   * Cache-aside read.
   */
  try {
    const cachedAccount = await getCache(cacheKey);

    if (cachedAccount) {
      return cachedAccount;
    }
  } catch (cacheError) {
    console.error(
      "Cache read failed for getCreditAccountById:",
      cacheError.message,
    );
  }

  const query = `
        SELECT
            ${CREDIT_ACCOUNT_COLUMNS}
        FROM customer_credit_accounts
        WHERE id = $1
          AND organisation_id = $2;
    `;

  const values = [creditAccountId, organisationId];

  const result = await pool.query(query, values);

  const account = result.rows[0] || null;

  if (account) {
    try {
      await setCache(cacheKey, account, CREDIT_ACCOUNT_CACHE_TTL);
    } catch (cacheError) {
      console.error(
        "Cache write failed for getCreditAccountById:",
        cacheError.message,
      );
    }
  }

  return account;
};

/**
 * Get a customer's credit account.
 *
 * customer_id is globally unique in the current schema, but
 * organisation_id is still included for explicit tenant safety.
 *
 * @param {string} organisationId
 * @param {string} customerId
 *
 * @returns {Promise<Object|null>}
 */
const getCreditAccountByCustomerId = async (organisationId, customerId) => {
  const query = `
        SELECT
            ${CREDIT_ACCOUNT_COLUMNS}
        FROM customer_credit_accounts
        WHERE organisation_id = $1
          AND customer_id = $2;
    `;

  const values = [organisationId, customerId];

  const result = await pool.query(query, values);

  return result.rows[0] || null;
};

/**
 * Get credit accounts belonging to an organisation.
 *
 * List queries are intentionally not cached.
 *
 * @param {string} organisationId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getCreditAccountsByOrganisation = async (
  organisationId,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            ${CREDIT_ACCOUNT_COLUMNS}
        FROM customer_credit_accounts
        WHERE organisation_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
        OFFSET $3;
    `;

  const values = [organisationId, limit, offset];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Update a customer's credit account.
 *
 * customer_id and organisation_id are intentionally immutable.
 *
 * @param {string} organisationId
 * @param {string} creditAccountId
 * @param {Object} account
 * @param {boolean} account.creditEnabled
 * @param {number|string} account.creditLimit
 *
 * @returns {Promise<Object|null>}
 */
const updateCreditAccount = async (
  organisationId,
  creditAccountId,
  { creditEnabled = false, creditLimit = 0 },
) => {
  const query = `
        UPDATE customer_credit_accounts
        SET
            credit_enabled = $1,
            credit_limit = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
          AND organisation_id = $4
        RETURNING
            ${CREDIT_ACCOUNT_COLUMNS};
    `;

  const values = [creditEnabled, creditLimit, creditAccountId, organisationId];

  const result = await pool.query(query, values);

  const updatedAccount = result.rows[0] || null;

  /**
   * Invalidate only after PostgreSQL successfully updates
   * the record.
   */
  if (updatedAccount) {
    const cacheKey = buildCreditAccountCacheKey(
      organisationId,
      creditAccountId,
    );

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for updateCreditAccount:",
        cacheError.message,
      );
    }
  }

  return updatedAccount;
};

/**
 * Delete a credit account.
 *
 * The service layer should determine whether deletion is
 * appropriate. In normal operation, disabling credit may be
 * preferable to physical deletion.
 *
 * @param {string} organisationId
 * @param {string} creditAccountId
 *
 * @returns {Promise<boolean>}
 */
const deleteCreditAccount = async (organisationId, creditAccountId) => {
  const query = `
        DELETE FROM customer_credit_accounts
        WHERE id = $1
          AND organisation_id = $2
        RETURNING id;
    `;

  const values = [creditAccountId, organisationId];

  const result = await pool.query(query, values);

  const deleted = result.rowCount > 0;

  if (deleted) {
    const cacheKey = buildCreditAccountCacheKey(
      organisationId,
      creditAccountId,
    );

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for deleteCreditAccount:",
        cacheError.message,
      );
    }
  }

  return deleted;
};

module.exports = {
  createCreditAccount,
  getCreditAccountById,
  getCreditAccountByCustomerId,
  getCreditAccountsByOrganisation,
  updateCreditAccount,
  deleteCreditAccount,
};

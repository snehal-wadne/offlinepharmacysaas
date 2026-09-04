/**
 * Customer Repository
 *
 * Purpose:
 * Handles all direct database operations related to customers.
 *
 * The repository layer is responsible for:
 * - PostgreSQL queries
 * - Tenant-safe customer access
 * - Customer business-number generation
 * - Redis caching for individual customer reads
 *
 * The repository does NOT handle:
 * - HTTP request/response logic
 * - Authentication/authorization
 * - User permissions
 * - Complex business rules
 *
 * Application flow:
 *
 * Controller
 *     ↓
 * Service
 *     ↓
 * Customer Repository
 *     ↓
 * PostgreSQL
 *
 * Redis is used only as a read cache.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const { getNextBusinessNumber } = require("./number-sequence.repository");

/**
 * Cache TTL in seconds.
 *
 * Redis is only a temporary cache. PostgreSQL remains the
 * authoritative source of customer data.
 */
const CUSTOMER_CACHE_TTL = 60;

/**
 * Builds the tenant-safe cache key used for an individual
 * customer.
 *
 * organisation_id is intentionally included in the key so that
 * the same customer UUID can never accidentally resolve to
 * another organisation's cached data.
 *
 * @param {string} organisationId
 * @param {string} customerId
 *
 * @returns {string}
 */
const buildCustomerCacheKey = (organisationId, customerId) =>
  `organisation:${organisationId}:customer:${customerId}`;

/**
 * Columns returned by customer queries.
 *
 * Keeping the selected columns explicit prevents accidental
 * exposure of future columns added to the table.
 */
const CUSTOMER_COLUMNS = `
    id,
    organisation_id,
    customer_number,
    full_name,
    phone,
    email,
    date_of_birth,
    gender,
    category,
    address,
    status,
    created_at,
    updated_at
`;

/**
 * Create a new customer.
 *
 * Customer numbers are organisation-scoped and generated through
 * number-sequence.repository.js.
 *
 * IMPORTANT:
 * The business number and customer INSERT must happen inside the
 * same PostgreSQL transaction.
 *
 * If the caller supplies a transaction client, that transaction
 * is used directly.
 *
 * If no client is supplied, this function creates and manages
 * its own transaction.
 *
 * @param {Object} customer
 * @param {string} customer.organisationId
 * @param {string} customer.fullName
 * @param {string|null} customer.phone
 * @param {string|null} customer.email
 * @param {string|null} customer.dateOfBirth
 * @param {string|null} customer.gender
 * @param {string|null} customer.category
 * @param {string|null} customer.address
 * @param {string|null} customer.status
 * @param {Object|null} client PostgreSQL transaction client
 *
 * @returns {Promise<Object>} Newly created customer
 */
const createCustomer = async ({
  organisationId,
  fullName,
  phone = null,
  email = null,
  dateOfBirth = null,
  gender = null,
  category = null,
  address = null,
  status = "ACTIVE",
  client = null,
}) => {
  let dbClient = client;
  let ownsTransaction = false;

  try {
    /**
     * When the service does not provide an existing transaction,
     * create one here.
     */
    if (!dbClient) {
      dbClient = await pool.connect();
      ownsTransaction = true;

      await dbClient.query("BEGIN");
    }

    /**
     * Generate the organisation-scoped customer number.
     *
     * This locks the corresponding number_sequences row and
     * increments it atomically.
     */
    const customerNumber = await getNextBusinessNumber({
      organisationId,
      branchId: null,
      sequenceType: "CUSTOMER",
      client: dbClient,
    });

    const query = `
        INSERT INTO customers (
            organisation_id,
            customer_number,
            full_name,
            phone,
            email,
            date_of_birth,
            gender,
            category,
            address,
            status
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10
        )
        RETURNING
            ${CUSTOMER_COLUMNS};
    `;

    const values = [
      organisationId,
      customerNumber,
      fullName,
      phone,
      email,
      dateOfBirth,
      gender,
      category,
      address,
      status,
    ];

    const result = await dbClient.query(query, values);

    const customer = result.rows[0];

    /**
     * Commit only when this repository created the transaction.
     *
     * If the caller supplied a transaction client, the caller
     * remains responsible for COMMIT / ROLLBACK.
     */
    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    return customer;
  } catch (error) {
    /**
     * Roll back only transactions owned by this repository.
     */
    if (ownsTransaction && dbClient) {
      try {
        await dbClient.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Customer transaction rollback failed:",
          rollbackError.message,
        );
      }
    }

    throw error;
  } finally {
    /**
     * Release only clients acquired by this repository.
     *
     * A caller-supplied transaction client must remain under
     * the caller's control.
     */
    if (ownsTransaction && dbClient) {
      dbClient.release();
    }
  }
};

/**
 * Find a customer by ID within a specific organisation.
 *
 * organisation_id is deliberately included in the WHERE clause.
 *
 * This is mandatory for tenant isolation:
 *
 * Organisation A must never retrieve Organisation B's customer
 * simply by knowing the customer's UUID.
 *
 * Individual customer records are cached because customer-detail
 * reads are expected to be frequent.
 *
 * @param {string} organisationId
 * @param {string} customerId
 *
 * @returns {Promise<Object|null>}
 */
const getCustomerById = async (organisationId, customerId) => {
  const cacheKey = buildCustomerCacheKey(organisationId, customerId);

  /**
   * Cache-aside read.
   *
   * Redis failure must never prevent PostgreSQL from serving
   * the request.
   */
  try {
    const cachedCustomer = await getCache(cacheKey);

    if (cachedCustomer) {
      return cachedCustomer;
    }
  } catch (cacheError) {
    console.error("Cache read failed for getCustomerById:", cacheError.message);
  }

  const query = `
        SELECT
            ${CUSTOMER_COLUMNS}
        FROM customers
        WHERE id = $1
          AND organisation_id = $2;
    `;

  const values = [customerId, organisationId];

  const result = await pool.query(query, values);

  const customer = result.rows[0] || null;

  /**
   * Cache only successful reads.
   *
   * Negative results are intentionally not cached.
   */
  if (customer) {
    try {
      await setCache(cacheKey, customer, CUSTOMER_CACHE_TTL);
    } catch (cacheError) {
      console.error(
        "Cache write failed for getCustomerById:",
        cacheError.message,
      );
    }
  }

  return customer;
};

/**
 * Retrieve all customers belonging to an organisation.
 *
 * Customer records are organisation-scoped rather than
 * branch-scoped. Therefore no branch_id filter is required.
 *
 * Lists are intentionally NOT cached because:
 * - pagination changes the result
 * - search/filter combinations change the result
 * - customer creation/update can make invalidation complicated
 *
 * PostgreSQL remains the source for directory queries.
 *
 * @param {string} organisationId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getCustomersByOrganisation = async (
  organisationId,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            ${CUSTOMER_COLUMNS}
        FROM customers
        WHERE organisation_id = $1
        ORDER BY full_name ASC, id ASC
        LIMIT $2
        OFFSET $3;
    `;

  const values = [organisationId, limit, offset];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Search customers within an organisation.
 *
 * The search term is checked against commonly searchable
 * customer-directory fields:
 *
 * - customer number
 * - full name
 * - phone
 * - email
 * - category
 *
 * The query is always tenant-scoped.
 *
 * @param {string} organisationId
 * @param {string} searchTerm
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const searchCustomers = async (
  organisationId,
  searchTerm,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            ${CUSTOMER_COLUMNS}
        FROM customers
        WHERE organisation_id = $1
          AND (
                customer_number ILIKE $2
                OR full_name ILIKE $2
                OR phone ILIKE $2
                OR email ILIKE $2
                OR category ILIKE $2
          )
        ORDER BY full_name ASC, id ASC
        LIMIT $3
        OFFSET $4;
    `;

  const searchPattern = `%${searchTerm}%`;

  const values = [organisationId, searchPattern, limit, offset];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Update an existing customer.
 *
 * customer_number is intentionally NOT updated.
 *
 * The business number is generated by the system and should
 * remain permanently associated with the customer.
 *
 * organisation_id is included in the WHERE clause to enforce
 * tenant isolation.
 *
 * @param {string} organisationId
 * @param {string} customerId
 * @param {Object} customer
 *
 * @returns {Promise<Object|null>}
 */
const updateCustomer = async (
  organisationId,
  customerId,
  {
    fullName,
    phone = null,
    email = null,
    dateOfBirth = null,
    gender = null,
    category = null,
    address = null,
    status = "ACTIVE",
  },
) => {
  const query = `
        UPDATE customers
        SET
            full_name = $1,
            phone = $2,
            email = $3,
            date_of_birth = $4,
            gender = $5,
            category = $6,
            address = $7,
            status = $8,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
          AND organisation_id = $10
        RETURNING
            ${CUSTOMER_COLUMNS};
    `;

  const values = [
    fullName,
    phone,
    email,
    dateOfBirth,
    gender,
    category,
    address,
    status,
    customerId,
    organisationId,
  ];

  const result = await pool.query(query, values);

  const updatedCustomer = result.rows[0] || null;

  /**
   * Invalidate the individual customer cache after a
   * successful PostgreSQL update.
   */
  if (updatedCustomer) {
    const cacheKey = buildCustomerCacheKey(organisationId, customerId);

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for updateCustomer:",
        cacheError.message,
      );
    }
  }

  return updatedCustomer;
};

/**
 * Delete a customer.
 *
 * The service layer should determine whether physical deletion
 * is actually appropriate.
 *
 * A customer referenced by invoices, prescriptions, ledger
 * entries, or other dependent records may be protected by
 * PostgreSQL foreign-key constraints.
 *
 * For normal business operation, an existing customer may be
 * better deactivated by setting status = 'INACTIVE'.
 *
 * This repository function exists for controlled deletion of
 * customers that are legally and operationally safe to remove.
 *
 * @param {string} organisationId
 * @param {string} customerId
 *
 * @returns {Promise<boolean>}
 */
const deleteCustomer = async (organisationId, customerId) => {
  const query = `
        DELETE FROM customers
        WHERE id = $1
          AND organisation_id = $2
        RETURNING id;
    `;

  const values = [customerId, organisationId];

  const result = await pool.query(query, values);

  const deleted = result.rowCount > 0;

  /**
   * Invalidate Redis only after a successful PostgreSQL delete.
   */
  if (deleted) {
    const cacheKey = buildCustomerCacheKey(organisationId, customerId);

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for deleteCustomer:",
        cacheError.message,
      );
    }
  }

  return deleted;
};

/**
 * Export repository functions.
 */
module.exports = {
  createCustomer,
  getCustomerById,
  getCustomersByOrganisation,
  searchCustomers,
  updateCustomer,
  deleteCustomer,
};

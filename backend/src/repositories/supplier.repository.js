/**
 * Supplier Repository
 *
 * Purpose:
 * Handles all direct database operations related to suppliers.
 *
 * The repository communicates with PostgreSQL and uses Redis
 * only as a short-lived read cache.
 *
 * PostgreSQL remains the source of truth.
 *
 * Supplier records are organisation-scoped because this is a
 * multi-tenant SaaS application.
 */

const { pool } = require("../db/connection");

const { getCache, setCache, deleteCache } = require("../cache/cache");

const SUPPLIER_CACHE_TTL = 60;

const buildSupplierCacheKey = (organisationId, supplierId) =>
  `organisation:${organisationId}:supplier:${supplierId}`;

/**
 * Create a new supplier.
 *
 * Every supplier belongs to an organisation, so organisationId
 * is required.
 *
 * @param {Object} supplier
 * @param {string} supplier.organisationId
 * @param {string} supplier.name
 * @param {string} supplier.contactPerson
 * @param {string} supplier.phone
 * @param {string} supplier.email
 * @param {string} supplier.city
 * @param {string} supplier.gstin
 * @param {string} supplier.status
 *
 * @returns {Object} The newly created supplier
 */
const createSupplier = async ({
  organisationId,
  name,
  contactPerson = null,
  phone = null,
  email = null,
  city = null,
  gstin = null,
  status = "ACTIVE",
}) => {
  const query = `
        INSERT INTO suppliers (
            organisation_id,
            name,
            contact_person,
            phone,
            email,
            city,
            gstin,
            status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
            id,
            organisation_id,
            name,
            contact_person,
            phone,
            email,
            city,
            gstin,
            status,
            created_at,
            updated_at;
    `;

  const values = [
    organisationId,
    name,
    contactPerson,
    phone,
    email,
    city,
    gstin,
    status,
  ];

  const result = await pool.query(query, values);

  return result.rows[0];
};

/**
 * Find a supplier by ID within a specific organisation.
 *
 * Redis is checked first. On a cache miss, PostgreSQL is queried
 * and the result is stored in Redis for a short period.
 *
 * Both supplier ID and organisation ID are part of the cache key
 * and database query to maintain tenant isolation.
 *
 * @param {string} organisationId
 * @param {string} supplierId
 *
 * @returns {Object|null} Supplier if found, otherwise null
 */
const getSupplierById = async (organisationId, supplierId) => {
  const cacheKey = buildSupplierCacheKey(organisationId, supplierId);

  /*
   * Redis is an optimisation only. If Redis is unavailable,
   * continue with PostgreSQL.
   */
  try {
    const cachedSupplier = await getCache(cacheKey);

    if (cachedSupplier !== null) {
      return cachedSupplier;
    }
  } catch (error) {
    console.error("Supplier cache read failed:", error.message);
  }

  const query = `
        SELECT
            id,
            organisation_id,
            name,
            contact_person,
            phone,
            email,
            city,
            gstin,
            status,
            created_at,
            updated_at
        FROM suppliers
        WHERE id = $1
          AND organisation_id = $2;
    `;

  const values = [supplierId, organisationId];

  const result = await pool.query(query, values);

  const supplier = result.rows[0] || null;

  /*
   * Do not cache missing suppliers. A deleted record should not
   * remain represented by a cached null value.
   */
  if (supplier !== null) {
    try {
      await setCache(cacheKey, supplier, SUPPLIER_CACHE_TTL);
    } catch (error) {
      console.error("Supplier cache write failed:", error.message);
    }
  }

  return supplier;
};

/**
 * Retrieve all suppliers belonging to an organisation.
 *
 * Pagination is included so that the API does not need to load
 * an unlimited number of supplier records into memory.
 *
 * This query intentionally remains uncached for now because
 * supplier creation, updates and deletes can affect multiple
 * pages of the result.
 *
 * @param {string} organisationId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} List of suppliers
 */
const getSuppliersByOrganisation = async (
  organisationId,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            id,
            organisation_id,
            name,
            contact_person,
            phone,
            email,
            city,
            gstin,
            status,
            created_at,
            updated_at
        FROM suppliers
        WHERE organisation_id = $1
        ORDER BY name ASC, id ASC
        LIMIT $2
        OFFSET $3;
    `;

  const values = [organisationId, limit, offset];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Search suppliers within an organisation.
 *
 * The search is performed against fields that are useful when
 * locating a supplier from the pharmacy interface:
 *
 * - supplier name
 * - contact person
 * - phone
 * - email
 * - city
 * - GSTIN
 *
 * This query intentionally remains uncached because the result
 * can change whenever supplier data changes.
 *
 * @param {string} organisationId
 * @param {string} searchTerm
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Matching suppliers
 */
const searchSuppliers = async (
  organisationId,
  searchTerm,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            id,
            organisation_id,
            name,
            contact_person,
            phone,
            email,
            city,
            gstin,
            status,
            created_at,
            updated_at
        FROM suppliers
        WHERE organisation_id = $1
          AND (
                name ILIKE $2
                OR contact_person ILIKE $2
                OR phone ILIKE $2
                OR email ILIKE $2
                OR city ILIKE $2
                OR gstin ILIKE $2
          )
        ORDER BY name ASC, id ASC
        LIMIT $3
        OFFSET $4;
    `;

  const searchPattern = `%${searchTerm}%`;

  const values = [organisationId, searchPattern, limit, offset];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Update an existing supplier.
 *
 * The supplier is identified using both supplierId and
 * organisationId to maintain tenant isolation.
 *
 * After the database update succeeds, the supplier's cached
 * record is invalidated so the next read gets fresh data.
 *
 * @param {string} organisationId
 * @param {string} supplierId
 * @param {Object} supplier
 *
 * @returns {Object|null} Updated supplier or null if not found
 */
const updateSupplier = async (
  organisationId,
  supplierId,
  {
    name,
    contactPerson = null,
    phone = null,
    email = null,
    city = null,
    gstin = null,
    status = "ACTIVE",
  },
) => {
  const query = `
        UPDATE suppliers
        SET
            name = $1,
            contact_person = $2,
            phone = $3,
            email = $4,
            city = $5,
            gstin = $6,
            status = $7,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
          AND organisation_id = $9
        RETURNING
            id,
            organisation_id,
            name,
            contact_person,
            phone,
            email,
            city,
            gstin,
            status,
            created_at,
            updated_at;
    `;

  const values = [
    name,
    contactPerson,
    phone,
    email,
    city,
    gstin,
    status,
    supplierId,
    organisationId,
  ];

  const result = await pool.query(query, values);

  const supplier = result.rows[0] || null;

  if (supplier !== null) {
    /*
     * PostgreSQL has the latest data. Remove the old Redis
     * value so the next read fetches the updated supplier.
     */
    try {
      await deleteCache(buildSupplierCacheKey(organisationId, supplierId));
    } catch (error) {
      console.error("Supplier cache invalidation failed:", error.message);
    }
  }

  return supplier;
};

/**
 * Delete a supplier.
 *
 * The repository performs a hard delete when requested.
 *
 * After successful deletion, the supplier's cached record is
 * removed so a later lookup cannot return stale data.
 *
 * Whether a supplier is actually allowed to be deleted should
 * be decided by the service layer.
 *
 * @param {string} organisationId
 * @param {string} supplierId
 *
 * @returns {boolean} True if the supplier was deleted
 */
const deleteSupplier = async (organisationId, supplierId) => {
  const query = `
        DELETE FROM suppliers
        WHERE id = $1
          AND organisation_id = $2
        RETURNING id;
    `;

  const values = [supplierId, organisationId];

  const result = await pool.query(query, values);

  if (result.rowCount > 0) {
    /*
     * Invalidate the ID cache only after the database delete
     * succeeds.
     */
    try {
      await deleteCache(buildSupplierCacheKey(organisationId, supplierId));
    } catch (error) {
      console.error("Supplier cache invalidation failed:", error.message);
    }

    return true;
  }

  return false;
};

/**
 * Export supplier repository functions.
 */
module.exports = {
  createSupplier,
  getSupplierById,
  getSuppliersByOrganisation,
  searchSuppliers,
  updateSupplier,
  deleteSupplier,
};

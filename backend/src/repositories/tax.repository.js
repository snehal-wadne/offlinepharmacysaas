/**
 * Tax Repository
 *
 * Purpose:
 * Provides database persistence and cache access for the `taxes` table.
 *
 * All operations are tenant-safe:
 * - Scoped strictly by organisation_id.
 * - No default tax records are automatically seeded.
 *
 * PostgreSQL is the transactional source of truth.
 * Redis is used only as a short-lived read cache.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const TAX_CACHE_TTL = 60;

/**
 * Columns returned by all tax queries.
 */
const TAX_COLUMNS = `
  id,
  organisation_id,
  name,
  tax_type,
  rate,
  is_default,
  is_active,
  description,
  created_at,
  updated_at
`;

/**
 * Cache key helpers.
 */
const buildTaxCacheKey = (organisationId, taxId) =>
  `organisation:${organisationId}:tax:${taxId}`;

const buildTaxListCacheKey = (organisationId) =>
  `organisation:${organisationId}:taxes:list`;

/**
 * Invalidate tax cache entries.
 */
const invalidateTaxCache = async (organisationId, taxId = null) => {
  const operations = [deleteCache(buildTaxListCacheKey(organisationId))];

  if (taxId) {
    operations.push(deleteCache(buildTaxCacheKey(organisationId, taxId)));
  }

  try {
    await Promise.all(operations);
  } catch (error) {
    console.error("Tax cache invalidation error:", error.message);
  }
};

/**
 * Create a new tax definition for an organisation.
 *
 * @param {Object} data
 * @param {string} data.organisationId
 * @param {string} data.name
 * @param {string} data.taxType - CENTRAL_TAX, STATE_TAX, VAT_TAX, CESS, OTHER
 * @param {number} [data.rate=0.0]
 * @param {boolean} [data.isDefault=false]
 * @param {boolean} [data.isActive=true]
 * @param {string|null} [data.description]
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object>}
 */
const createTax = async (
  {
    organisationId,
    name,
    taxType,
    rate = 0.0,
    isDefault = false,
    isActive = true,
    description = null,
  },
  client = pool,
) => {
  const query = `
    INSERT INTO taxes (
      organisation_id,
      name,
      tax_type,
      rate,
      is_default,
      is_active,
      description
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING
      ${TAX_COLUMNS};
  `;

  const values = [
    organisationId,
    name,
    taxType,
    rate,
    isDefault,
    isActive,
    description,
  ];

  const result = await client.query(query, values);
  const tax = result.rows[0];

  await invalidateTaxCache(organisationId, tax.id);

  return tax;
};

/**
 * Get a tax definition by ID within an organisation.
 *
 * @param {string} organisationId
 * @param {string} taxId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const getTaxById = async (organisationId, taxId, client = pool) => {
  const cacheKey = buildTaxCacheKey(organisationId, taxId);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cached = await getCache(cacheKey);
      if (cached !== null) {
        return cached;
      }
    } catch (error) {
      console.error("Tax cache read failed:", error.message);
    }
  }

  const query = `
    SELECT
      ${TAX_COLUMNS}
    FROM taxes
    WHERE organisation_id = $1
      AND id = $2;
  `;

  const result = await client.query(query, [organisationId, taxId]);
  const tax = result.rows[0] || null;

  if (useCache && tax) {
    try {
      await setCache(cacheKey, tax, TAX_CACHE_TTL);
    } catch (error) {
      console.error("Tax cache write failed:", error.message);
    }
  }

  return tax;
};

/**
 * List taxes for an organisation with optional active filter.
 *
 * @param {string} organisationId
 * @param {Object} [options={}]
 * @param {boolean} [options.activeOnly=false]
 * @param {number} [options.limit=100]
 * @param {number} [options.offset=0]
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>}
 */
const listTaxes = async (
  organisationId,
  { activeOnly = false, limit = 100, offset = 0 } = {},
  client = pool,
) => {
  const isUnfiltered = !activeOnly && limit === 100 && offset === 0;
  const cacheKey = buildTaxListCacheKey(organisationId);
  const useCache = client === pool && isUnfiltered;

  if (useCache) {
    try {
      const cached = await getCache(cacheKey);
      if (cached !== null) {
        return cached;
      }
    } catch (error) {
      console.error("Tax list cache read failed:", error.message);
    }
  }

  const conditions = ["organisation_id = $1"];
  const values = [organisationId];
  let paramIndex = 2;

  if (activeOnly) {
    conditions.push(`is_active = $${paramIndex++}`);
    values.push(true);
  }

  const query = `
    SELECT
      ${TAX_COLUMNS}
    FROM taxes
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at ASC
    LIMIT $${paramIndex++} OFFSET $${paramIndex};
  `;

  values.push(limit, offset);

  const result = await client.query(query, values);
  const rows = result.rows;

  if (useCache && rows) {
    try {
      await setCache(cacheKey, rows, TAX_CACHE_TTL);
    } catch (error) {
      console.error("Tax list cache write failed:", error.message);
    }
  }

  return rows;
};

/**
 * Update an existing tax definition.
 *
 * @param {string} organisationId
 * @param {string} taxId
 * @param {Object} updates
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const updateTax = async (organisationId, taxId, updates, client = pool) => {
  const { name, taxType, rate, isDefault, isActive, description } = updates;

  const query = `
    UPDATE taxes
    SET
      name = COALESCE($3, name),
      tax_type = COALESCE($4, tax_type),
      rate = COALESCE($5, rate),
      is_default = COALESCE($6, is_default),
      is_active = COALESCE($7, is_active),
      description = COALESCE($8, description),
      updated_at = CURRENT_TIMESTAMP
    WHERE organisation_id = $1
      AND id = $2
    RETURNING
      ${TAX_COLUMNS};
  `;

  const values = [
    organisationId,
    taxId,
    name !== undefined ? name : null,
    taxType !== undefined ? taxType : null,
    rate !== undefined ? rate : null,
    isDefault !== undefined ? isDefault : null,
    isActive !== undefined ? isActive : null,
    description !== undefined ? description : null,
  ];

  const result = await client.query(query, values);
  const tax = result.rows[0] || null;

  if (tax) {
    await invalidateTaxCache(organisationId, taxId);
  }

  return tax;
};

/**
 * Set tax active status (is_active).
 *
 * @param {string} organisationId
 * @param {string} taxId
 * @param {boolean} isActive
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const setTaxStatus = async (organisationId, taxId, isActive, client = pool) => {
  const query = `
    UPDATE taxes
    SET
      is_active = $1,
      updated_at = CURRENT_TIMESTAMP
    WHERE organisation_id = $2
      AND id = $3
    RETURNING
      ${TAX_COLUMNS};
  `;

  const result = await client.query(query, [isActive, organisationId, taxId]);
  const tax = result.rows[0] || null;

  if (tax) {
    await invalidateTaxCache(organisationId, taxId);
  }

  return tax;
};

/**
 * Delete a tax definition.
 *
 * @param {string} organisationId
 * @param {string} taxId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const deleteTax = async (organisationId, taxId, client = pool) => {
  const query = `
    DELETE FROM taxes
    WHERE organisation_id = $1
      AND id = $2
    RETURNING
      ${TAX_COLUMNS};
  `;

  const result = await client.query(query, [organisationId, taxId]);
  const deleted = result.rows[0] || null;

  if (deleted) {
    await invalidateTaxCache(organisationId, taxId);
  }

  return deleted;
};

module.exports = {
  createTax,
  getTaxById,
  listTaxes,
  updateTax,
  setTaxStatus,
  deleteTax,
};

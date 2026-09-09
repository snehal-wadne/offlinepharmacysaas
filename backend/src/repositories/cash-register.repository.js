/**
 * Cash Register Repository
 *
 * Purpose:
 * Provides database persistence and cache access for the `cash_registers` table.
 * Represents physical counter terminals / drawers within a pharmacy branch.
 *
 * All queries are tenant-safe:
 * - Reads and writes are strictly scoped by organisation_id and branch_id.
 * - Cross-organisation or cross-branch access is prohibited.
 *
 * PostgreSQL is the authoritative source of truth.
 * Redis is used only as a short-lived read cache for register queries.
 * Transaction clients bypass the Redis cache to ensure read-your-own-writes consistency.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const CASH_REGISTER_CACHE_TTL = 60;

const CASH_REGISTER_COLUMNS = `
  id,
  organisation_id,
  branch_id,
  name,
  identifier,
  is_active,
  created_at,
  updated_at
`;

/**
 * Cache key helpers.
 */
const buildCashRegisterCacheKey = (organisationId, registerId) =>
  `organisation:${organisationId}:cash-register:${registerId}`;

const buildCashRegisterListCacheKey = (organisationId, branchId) =>
  `organisation:${organisationId}:branch:${branchId}:cash-registers:list`;

/**
 * Invalidate cash register cache entries.
 */
const invalidateCashRegisterCache = async (
  organisationId,
  branchId = null,
  registerId = null,
) => {
  const operations = [];

  if (branchId) {
    operations.push(
      deleteCache(buildCashRegisterListCacheKey(organisationId, branchId)),
    );
  }

  if (registerId) {
    operations.push(
      deleteCache(buildCashRegisterCacheKey(organisationId, registerId)),
    );
  }

  try {
    await Promise.all(operations);
  } catch (error) {
    console.error("Cash register cache invalidation error:", error.message);
  }
};

/**
 * Create a new physical cash register (workstation/counter terminal).
 *
 * @param {Object} data
 * @param {string} data.organisationId
 * @param {string} data.branchId
 * @param {string} data.name
 * @param {string} data.identifier
 * @param {boolean} [data.isActive=true]
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object>} Created cash register
 */
const createCashRegister = async (
  { organisationId, branchId, name, identifier, isActive = true },
  client = pool,
) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");
  if (!name || !name.trim()) throw new Error("name is required.");
  if (!identifier || !identifier.trim())
    throw new Error("identifier is required.");

  // Validate branch belongs to organisation
  const branchValidation = await client.query(
    `SELECT 1 FROM branches WHERE id = $1 AND organisation_id = $2;`,
    [branchId, organisationId],
  );

  if (branchValidation.rowCount === 0) {
    throw new Error("Branch not found in the specified organisation.");
  }

  const query = `
    INSERT INTO cash_registers (
      organisation_id,
      branch_id,
      name,
      identifier,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING ${CASH_REGISTER_COLUMNS};
  `;

  const values = [
    organisationId,
    branchId,
    name.trim(),
    identifier.trim(),
    isActive !== false,
  ];

  try {
    const result = await client.query(query, values);
    const register = result.rows[0];

    await invalidateCashRegisterCache(organisationId, branchId, register.id);

    return register;
  } catch (error) {
    if (error.code === "23505") {
      throw new Error(
        "Cash register identifier already exists on this branch.",
      );
    }
    throw error;
  }
};

/**
 * Get cash register by ID.
 *
 * @param {string} organisationId
 * @param {string} registerId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const getCashRegisterById = async (
  organisationId,
  registerId,
  client = pool,
) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!registerId) throw new Error("registerId is required.");

  const cacheKey = buildCashRegisterCacheKey(organisationId, registerId);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cached = await getCache(cacheKey);
      if (cached !== null) {
        return cached;
      }
    } catch (error) {
      console.error("Cash register cache read failed:", error.message);
    }
  }

  const query = `
    SELECT ${CASH_REGISTER_COLUMNS}
    FROM cash_registers
    WHERE id = $1 AND organisation_id = $2;
  `;

  const result = await client.query(query, [registerId, organisationId]);
  const register = result.rows[0] || null;

  if (useCache && register) {
    try {
      await setCache(cacheKey, register, CASH_REGISTER_CACHE_TTL);
    } catch (error) {
      console.error("Cash register cache write failed:", error.message);
    }
  }

  return register;
};

/**
 * Get cash register by branch and identifier (e.g. "CR-01").
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {string} identifier
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const getCashRegisterByIdentifier = async (
  organisationId,
  branchId,
  identifier,
  client = pool,
) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");
  if (!identifier) throw new Error("identifier is required.");

  const query = `
    SELECT ${CASH_REGISTER_COLUMNS}
    FROM cash_registers
    WHERE organisation_id = $1
      AND branch_id = $2
      AND LOWER(identifier) = LOWER($3);
  `;

  const result = await client.query(query, [
    organisationId,
    branchId,
    identifier.trim(),
  ]);
  return result.rows[0] || null;
};

/**
 * List all cash registers for a given branch.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>}
 */
const listCashRegistersByBranch = async (
  organisationId,
  branchId,
  client = pool,
) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");

  const cacheKey = buildCashRegisterListCacheKey(organisationId, branchId);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cached = await getCache(cacheKey);
      if (cached !== null) {
        return cached;
      }
    } catch (error) {
      console.error("Cash register list cache read failed:", error.message);
    }
  }

  const query = `
    SELECT ${CASH_REGISTER_COLUMNS}
    FROM cash_registers
    WHERE organisation_id = $1 AND branch_id = $2
    ORDER BY created_at ASC;
  `;

  const result = await client.query(query, [organisationId, branchId]);
  const registers = result.rows;

  if (useCache) {
    try {
      await setCache(cacheKey, registers, CASH_REGISTER_CACHE_TTL);
    } catch (error) {
      console.error("Cash register list cache write failed:", error.message);
    }
  }

  return registers;
};

/**
 * Update cash register fields.
 *
 * @param {string} organisationId
 * @param {string} registerId
 * @param {Object} updates
 * @param {string} [updates.name]
 * @param {string} [updates.identifier]
 * @param {boolean} [updates.isActive]
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object>} Updated cash register
 */
const updateCashRegister = async (
  organisationIdOrParams,
  registerIdParam = null,
  updatesParam = {},
  clientParam = pool,
) => {
  let organisationId;
  let registerId;
  let updates;
  let client;

  if (
    typeof organisationIdOrParams === "object" &&
    organisationIdOrParams !== null &&
    !registerIdParam
  ) {
    organisationId = organisationIdOrParams.organisationId;
    registerId = organisationIdOrParams.registerId;
    updates = organisationIdOrParams;
    client = organisationIdOrParams.client || clientParam;
  } else {
    organisationId = organisationIdOrParams;
    registerId = registerIdParam;
    updates = updatesParam || {};
    client = clientParam;
  }

  if (!organisationId) throw new Error("organisationId is required.");
  if (!registerId) throw new Error("registerId is required.");

  const existing = await getCashRegisterById(
    organisationId,
    registerId,
    client,
  );
  if (!existing) {
    throw new Error("Cash register not found in the specified organisation.");
  }

  const { name, identifier, isActive } = updates;
  const updatedName = name !== undefined ? name.trim() : existing.name;
  const updatedIdentifier =
    identifier !== undefined ? identifier.trim() : existing.identifier;
  const updatedIsActive =
    isActive !== undefined ? isActive : existing.is_active;

  const query = `
    UPDATE cash_registers
    SET
      name = $1,
      identifier = $2,
      is_active = $3,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $4 AND organisation_id = $5
    RETURNING ${CASH_REGISTER_COLUMNS};
  `;

  try {
    const values = [
      updatedName,
      updatedIdentifier,
      updatedIsActive,
      registerId,
      organisationId,
    ];
    const result = await client.query(query, values);
    const updated = result.rows[0];

    await invalidateCashRegisterCache(
      organisationId,
      existing.branch_id,
      registerId,
    );

    return updated;
  } catch (error) {
    if (error.code === "23505") {
      throw new Error(
        "Cash register identifier already exists on this branch.",
      );
    }
    throw error;
  }
};

module.exports = {
  createCashRegister,
  getCashRegisterById,
  getCashRegisterByIdentifier,
  listCashRegistersByBranch,
  updateCashRegister,
  invalidateCashRegisterCache,
  buildCashRegisterCacheKey,
  buildCashRegisterListCacheKey,
};

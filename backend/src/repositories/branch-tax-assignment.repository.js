/**
 * Branch Tax Assignment Repository
 *
 * Purpose:
 * Provides database operations and cache management for `branch_tax_assignments`.
 *
 * CRITICAL TENANT SAFETY RULE:
 * A valid assignment requires:
 *   branch.organisation_id = tax.organisation_id
 *
 * A branch belonging to Organisation A can NEVER be associated with a tax
 * belonging to Organisation B. Every query enforces tenant boundaries directly
 * in PostgreSQL.
 *
 * PostgreSQL is the transactional source of truth.
 * Redis is used only as a short-lived read cache.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const BRANCH_TAX_CACHE_TTL = 60;

/**
 * Build Redis cache key for a branch's assigned taxes.
 */
const buildBranchTaxCacheKey = (organisationId, branchId) =>
  `organisation:${organisationId}:branch:${branchId}:taxes`;

/**
 * Invalidate branch tax assignments cache.
 */
const invalidateBranchTaxCache = async (organisationId, branchId) => {
  try {
    await deleteCache(buildBranchTaxCacheKey(organisationId, branchId));
  } catch (error) {
    console.error("Branch tax cache invalidation failed:", error.message);
  }
};

/**
 * Assign a tax definition to a branch.
 *
 * Enforces that both the branch and the tax belong to the same organisation.
 * If either belongs to a different organisation or does not exist, no row is
 * inserted and null is returned.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {string} taxId
 * @param {boolean} [isApplied=true]
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const assignTaxToBranch = async (
  organisationId,
  branchId,
  taxId,
  isApplied = true,
  client = pool,
) => {
  const query = `
    INSERT INTO branch_tax_assignments (
      branch_id,
      tax_id,
      is_applied
    )
    SELECT
      b.id,
      t.id,
      $3
    FROM branches b
    CROSS JOIN taxes t
    WHERE b.id = $1
      AND b.organisation_id = $4
      AND t.id = $2
      AND t.organisation_id = $4
    ON CONFLICT (branch_id, tax_id)
    DO UPDATE SET
      is_applied = EXCLUDED.is_applied
    RETURNING
      branch_id,
      tax_id,
      is_applied,
      created_at;
  `;

  const result = await client.query(query, [
    branchId,
    taxId,
    isApplied,
    organisationId,
  ]);

  const assignment = result.rows[0] || null;

  if (assignment) {
    await invalidateBranchTaxCache(organisationId, branchId);
  }

  return assignment;
};

/**
 * Get all tax assignments for a branch, including tax details.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>}
 */
const getBranchTaxAssignments = async (
  organisationId,
  branchId,
  client = pool,
) => {
  const cacheKey = buildBranchTaxCacheKey(organisationId, branchId);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cached = await getCache(cacheKey);
      if (cached !== null) {
        return cached;
      }
    } catch (error) {
      console.error("Branch tax cache read failed:", error.message);
    }
  }

  const query = `
    SELECT
      bta.branch_id,
      bta.tax_id,
      bta.is_applied,
      bta.created_at,
      t.name AS tax_name,
      t.tax_type,
      t.rate,
      t.is_default,
      t.is_active,
      t.description
    FROM branch_tax_assignments bta
    INNER JOIN branches b
      ON b.id = bta.branch_id
    INNER JOIN taxes t
      ON t.id = bta.tax_id
    WHERE b.organisation_id = $1
      AND t.organisation_id = $1
      AND bta.branch_id = $2
    ORDER BY t.created_at ASC;
  `;

  const result = await client.query(query, [organisationId, branchId]);
  const assignments = result.rows;

  if (useCache && assignments) {
    try {
      await setCache(cacheKey, assignments, BRANCH_TAX_CACHE_TTL);
    } catch (error) {
      console.error("Branch tax cache write failed:", error.message);
    }
  }

  return assignments;
};

/**
 * Update the is_applied status of a branch tax assignment.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {string} taxId
 * @param {boolean} isApplied
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const updateBranchTaxAssignment = async (
  organisationId,
  branchId,
  taxId,
  isApplied,
  client = pool,
) => {
  const query = `
    UPDATE branch_tax_assignments bta
    SET
      is_applied = $1
    FROM branches b, taxes t
    WHERE bta.branch_id = b.id
      AND bta.tax_id = t.id
      AND b.organisation_id = $2
      AND t.organisation_id = $2
      AND bta.branch_id = $3
      AND bta.tax_id = $4
    RETURNING
      bta.branch_id,
      bta.tax_id,
      bta.is_applied,
      bta.created_at;
  `;

  const result = await client.query(query, [
    isApplied,
    organisationId,
    branchId,
    taxId,
  ]);

  const updated = result.rows[0] || null;

  if (updated) {
    await invalidateBranchTaxCache(organisationId, branchId);
  }

  return updated;
};

/**
 * Remove a specific branch tax assignment.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {string} taxId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<boolean>} True if assignment was removed
 */
const removeBranchTaxAssignment = async (
  organisationId,
  branchId,
  taxId,
  client = pool,
) => {
  const query = `
    DELETE FROM branch_tax_assignments bta
    USING branches b, taxes t
    WHERE bta.branch_id = b.id
      AND bta.tax_id = t.id
      AND b.organisation_id = $1
      AND t.organisation_id = $1
      AND bta.branch_id = $2
      AND bta.tax_id = $3
    RETURNING
      bta.branch_id,
      bta.tax_id;
  `;

  const result = await client.query(query, [organisationId, branchId, taxId]);
  const removed = result.rowCount > 0;

  if (removed) {
    await invalidateBranchTaxCache(organisationId, branchId);
  }

  return removed;
};

/**
 * Remove all tax assignments for a branch.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<number>} Number of removed assignments
 */
const removeAllBranchTaxAssignments = async (
  organisationId,
  branchId,
  client = pool,
) => {
  const query = `
    DELETE FROM branch_tax_assignments bta
    USING branches b
    WHERE bta.branch_id = b.id
      AND b.organisation_id = $1
      AND bta.branch_id = $2
    RETURNING
      bta.branch_id;
  `;

  const result = await client.query(query, [organisationId, branchId]);
  const count = result.rowCount;

  if (count > 0) {
    await invalidateBranchTaxCache(organisationId, branchId);
  }

  return count;
};

module.exports = {
  assignTaxToBranch,
  getBranchTaxAssignments,
  updateBranchTaxAssignment,
  removeBranchTaxAssignment,
  removeAllBranchTaxAssignments,
};

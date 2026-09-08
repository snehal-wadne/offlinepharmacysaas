/**
 * Branch Repository
 *
 * Purpose:
 * Provides database persistence and cache access for the `branches` table.
 *
 * All queries are tenant-safe:
 * - Reads and writes are scoped by organisation_id.
 * - Cross-organisation queries are prohibited.
 *
 * PostgreSQL is the authoritative source of truth.
 * Redis is used only as a short-lived read cache for individual
 * branch reads and organisation branch lists.
 *
 * Transaction clients bypass the Redis cache to ensure read-your-own-writes consistency.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");
const {
  invalidateBranchManagementDashboardCache,
} = require("./branch-management-dashboard.repository");

const BRANCH_CACHE_TTL = 60;

/**
 * Columns returned by all branch queries.
 * Explicit list ensures all branch fields are projected.
 */
const BRANCH_COLUMNS = `
  id,
  organisation_id,
  branch_code,
  name,
  facility_type,
  contact_person,
  contact_phone,
  contact_email,
  address,
  city,
  state,
  postal_code,
  phone,
  operating_hours,
  drug_license_number,
  invoice_prefix,
  status,
  created_at,
  updated_at
`;

/**
 * Cache key helpers.
 */
const buildBranchCacheKey = (organisationId, branchId) =>
  `organisation:${organisationId}:branch:${branchId}`;

const buildBranchListCacheKey = (organisationId) =>
  `organisation:${organisationId}:branches:list`;

/**
 * Invalidate branch cache entries.
 */
const invalidateBranchCache = async (organisationId, branchId = null) => {
  const operations = [deleteCache(buildBranchListCacheKey(organisationId))];

  if (branchId) {
    operations.push(deleteCache(buildBranchCacheKey(organisationId, branchId)));
  }

  try {
    await Promise.all(operations);
  } catch (error) {
    console.error("Branch cache invalidation error:", error.message);
  }
};

const invalidateBranchWriteCaches = async (organisationId, branchId = null) => {
  await Promise.all([
    invalidateBranchCache(organisationId, branchId),
    invalidateBranchManagementDashboardCache(organisationId, { branch: true }),
  ]);
};

/**
 * Find all branches for a given organisation.
 *
 * @param {string} organisationId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>}
 */
const getBranchesByOrganisation = async (organisationId, client = pool) => {
  const cacheKey = buildBranchListCacheKey(organisationId);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cached = await getCache(cacheKey);
      if (cached !== null) {
        return cached;
      }
    } catch (error) {
      console.error("Branch list cache read failed:", error.message);
    }
  }

  const query = `
    SELECT
      ${BRANCH_COLUMNS}
    FROM branches
    WHERE organisation_id = $1
    ORDER BY created_at ASC;
  `;

  const result = await client.query(query, [organisationId]);
  const branches = result.rows;

  if (useCache && branches) {
    try {
      await setCache(cacheKey, branches, BRANCH_CACHE_TTL);
    } catch (error) {
      console.error("Branch list cache write failed:", error.message);
    }
  }

  return branches;
};

/**
 * Get branch by ID within an organisation.
 *
 * @param {string} branchId
 * @param {string|null} [organisationId=null]
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const getBranchById = async (
  branchId,
  organisationId = null,
  client = pool,
) => {
  const useCache = client === pool && organisationId !== null;
  const cacheKey = organisationId
    ? buildBranchCacheKey(organisationId, branchId)
    : null;

  if (useCache && cacheKey) {
    try {
      const cached = await getCache(cacheKey);
      if (cached !== null) {
        return cached;
      }
    } catch (error) {
      console.error("Branch cache read failed:", error.message);
    }
  }

  let query = `
    SELECT
      ${BRANCH_COLUMNS}
    FROM branches
    WHERE id = $1
  `;
  const params = [branchId];

  if (organisationId) {
    query += ` AND organisation_id = $2;`;
    params.push(organisationId);
  } else {
    query += `;`;
  }

  const result = await client.query(query, params);
  const branch = result.rows[0] || null;

  if (useCache && cacheKey && branch) {
    try {
      await setCache(cacheKey, branch, BRANCH_CACHE_TTL);
    } catch (error) {
      console.error("Branch cache write failed:", error.message);
    }
  }

  return branch;
};

/**
 * Get a branch by its business branch_code within an organisation.
 *
 * @param {string} organisationId
 * @param {string} branchCode
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const getBranchByCode = async (organisationId, branchCode, client = pool) => {
  const query = `
    SELECT
      ${BRANCH_COLUMNS}
    FROM branches
    WHERE organisation_id = $1
      AND branch_code = $2;
  `;

  const result = await client.query(query, [organisationId, branchCode]);
  return result.rows[0] || null;
};

/**
 * Create a new branch record.
 *
 * Note: branch_code is generated by the service layer via number_sequences,
 * not by the repository.
 *
 * @param {Object} data
 * @param {string} data.organisationId
 * @param {string|null} [data.branchCode]
 * @param {string} data.name
 * @param {string} [data.facilityType='RETAIL_DISPENSARY']
 * @param {string|null} [data.contactPerson]
 * @param {string|null} [data.contactPhone]
 * @param {string|null} [data.contactEmail]
 * @param {string|null} [data.address]
 * @param {string|null} [data.city]
 * @param {string|null} [data.state]
 * @param {string|null} [data.postalCode]
 * @param {string|null} [data.phone]
 * @param {string|null} [data.operatingHours]
 * @param {string|null} [data.drugLicenseNumber]
 * @param {string|null} [data.invoicePrefix]
 * @param {string} [data.status='ACTIVE']
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object>} Created branch
 */
const createBranch = async (
  {
    organisationId,
    branchCode = null,
    name,
    facilityType = "RETAIL_DISPENSARY",
    contactPerson = null,
    contactPhone = null,
    contactEmail = null,
    address = null,
    city = null,
    state = null,
    postalCode = null,
    phone = null,
    operatingHours = null,
    drugLicenseNumber = null,
    invoicePrefix = null,
    status = "ACTIVE",
  },
  client = pool,
) => {
  const query = `
    INSERT INTO branches (
      organisation_id,
      branch_code,
      name,
      facility_type,
      contact_person,
      contact_phone,
      contact_email,
      address,
      city,
      state,
      postal_code,
      phone,
      operating_hours,
      drug_license_number,
      invoice_prefix,
      status
    )
    VALUES (
      $1, $2, $3, $4,
      $5, $6, $7,
      $8, $9, $10, $11,
      $12, $13, $14,
      $15, $16
    )
    RETURNING
      ${BRANCH_COLUMNS};
  `;

  const values = [
    organisationId,
    branchCode,
    name,
    facilityType,
    contactPerson,
    contactPhone,
    contactEmail,
    address,
    city,
    state,
    postalCode,
    phone,
    operatingHours,
    drugLicenseNumber,
    invoicePrefix,
    status,
  ];

  const result = await client.query(query, values);
  const branch = result.rows[0];

  await invalidateBranchWriteCaches(organisationId, branch.id);

  return branch;
};

/**
 * List branches with optional filtering and pagination.
 *
 * @param {string} organisationId
 * @param {Object} [filters={}]
 * @param {string} [filters.status]
 * @param {string} [filters.facilityType]
 * @param {string} [filters.search]
 * @param {number} [filters.limit=50]
 * @param {number} [filters.offset=0]
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>}
 */
const listBranches = async (
  organisationId,
  { status, facilityType, search, limit = 50, offset = 0 } = {},
  client = pool,
) => {
  const conditions = ["organisation_id = $1"];
  const values = [organisationId];
  let paramIndex = 2;

  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(status);
  }

  if (facilityType) {
    conditions.push(`facility_type = $${paramIndex++}`);
    values.push(facilityType);
  }

  if (search) {
    conditions.push(
      `(name ILIKE $${paramIndex} OR branch_code ILIKE $${paramIndex} OR city ILIKE $${paramIndex} OR contact_person ILIKE $${paramIndex})`,
    );
    values.push(`%${search}%`);
    paramIndex++;
  }

  const query = `
    SELECT
      ${BRANCH_COLUMNS}
    FROM branches
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at ASC
    LIMIT $${paramIndex++} OFFSET $${paramIndex};
  `;

  values.push(limit, offset);

  const result = await client.query(query, values);
  return result.rows;
};

/**
 * Update an existing branch.
 *
 * @param {string} branchId
 * @param {string} organisationId
 * @param {Object} updates
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const updateBranch = async (
  branchId,
  organisationId,
  updates,
  client = pool,
) => {
  const {
    branchCode,
    name,
    facilityType,
    contactPerson,
    contactPhone,
    contactEmail,
    address,
    city,
    state,
    postalCode,
    phone,
    operatingHours,
    drugLicenseNumber,
    invoicePrefix,
    status,
  } = updates;

  const query = `
    UPDATE branches
    SET
      branch_code = COALESCE($3, branch_code),
      name = COALESCE($4, name),
      facility_type = COALESCE($5, facility_type),
      contact_person = COALESCE($6, contact_person),
      contact_phone = COALESCE($7, contact_phone),
      contact_email = COALESCE($8, contact_email),
      address = COALESCE($9, address),
      city = COALESCE($10, city),
      state = COALESCE($11, state),
      postal_code = COALESCE($12, postal_code),
      phone = COALESCE($13, phone),
      operating_hours = COALESCE($14, operating_hours),
      drug_license_number = COALESCE($15, drug_license_number),
      invoice_prefix = COALESCE($16, invoice_prefix),
      status = COALESCE($17, status),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND organisation_id = $2
    RETURNING
      ${BRANCH_COLUMNS};
  `;

  const values = [
    branchId,
    organisationId,
    branchCode !== undefined ? branchCode : null,
    name !== undefined ? name : null,
    facilityType !== undefined ? facilityType : null,
    contactPerson !== undefined ? contactPerson : null,
    contactPhone !== undefined ? contactPhone : null,
    contactEmail !== undefined ? contactEmail : null,
    address !== undefined ? address : null,
    city !== undefined ? city : null,
    state !== undefined ? state : null,
    postalCode !== undefined ? postalCode : null,
    phone !== undefined ? phone : null,
    operatingHours !== undefined ? operatingHours : null,
    drugLicenseNumber !== undefined ? drugLicenseNumber : null,
    invoicePrefix !== undefined ? invoicePrefix : null,
    status !== undefined ? status : null,
  ];

  const result = await client.query(query, values);
  const branch = result.rows[0] || null;

  if (branch) {
    await invalidateBranchWriteCaches(organisationId, branchId);
  }

  return branch;
};

/**
 * Update branch status (ACTIVE / INACTIVE).
 *
 * @param {string} branchId
 * @param {string} organisationId
 * @param {string} status
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const updateBranchStatus = async (
  branchId,
  organisationId,
  status,
  client = pool,
) => {
  const query = `
    UPDATE branches
    SET
      status = $1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
      AND organisation_id = $3
    RETURNING
      ${BRANCH_COLUMNS};
  `;

  const result = await client.query(query, [status, branchId, organisationId]);
  const branch = result.rows[0] || null;

  if (branch) {
    await invalidateBranchWriteCaches(organisationId, branchId);
  }

  return branch;
};

/**
 * Delete a branch.
 *
 * @param {string} branchId
 * @param {string} organisationId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const deleteBranch = async (branchId, organisationId, client = pool) => {
  const query = `
    DELETE FROM branches
    WHERE id = $1
      AND organisation_id = $2
    RETURNING
      ${BRANCH_COLUMNS};
  `;

  const result = await client.query(query, [branchId, organisationId]);
  const deleted = result.rows[0] || null;

  if (deleted) {
    await invalidateBranchWriteCaches(organisationId, branchId);
  }

  return deleted;
};

module.exports = {
  getBranchesByOrganisation,
  getBranchById,
  getBranchByCode,
  createBranch,
  listBranches,
  updateBranch,
  updateBranchStatus,
  setBranchStatus: updateBranchStatus,
  deleteBranch,
};

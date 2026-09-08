/**
 * Branch GST Repository
 *
 * Purpose:
 * Provides database persistence and cache access for `branch_gst_settings`.
 *
 * Every branch has its own GST configuration (1:1 relationship with branches).
 * All operations are tenant-safe and require organisation_id.
 *
 * PostgreSQL is the transactional source of truth.
 * Redis is used only as a short-lived read cache.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");
const {
  invalidateBranchManagementDashboardCache,
} = require("./branch-management-dashboard.repository");

const BRANCH_GST_CACHE_TTL = 60;

/**
 * Columns returned by all branch GST queries.
 */
const BRANCH_GST_COLUMNS = `
  id,
  organisation_id,
  branch_id,
  gstin,
  legal_name,
  trade_name,
  state,
  state_code,
  gst_scheme,
  tax_inclusive_pricing,
  auto_interstate_split,
  e_invoicing_enabled,
  status,
  created_at,
  updated_at
`;

/**
 * Build Redis cache key for branch GST settings.
 */
const buildBranchGstCacheKey = (organisationId, branchId) =>
  `organisation:${organisationId}:branch:${branchId}:gst`;

/**
 * Invalidate branch GST cache.
 */
const invalidateBranchGstCache = async (organisationId, branchId) => {
  try {
    await deleteCache(buildBranchGstCacheKey(organisationId, branchId));
  } catch (error) {
    console.error("Branch GST cache invalidation failed:", error.message);
  }
};

const invalidateBranchGstWriteCaches = async (organisationId, branchId) => {
  await Promise.all([
    invalidateBranchGstCache(organisationId, branchId),
    invalidateBranchManagementDashboardCache(organisationId, { branch: true }),
  ]);
};

/**
 * Create GST settings for a branch.
 *
 * @param {Object} data
 * @param {string} data.organisationId
 * @param {string} data.branchId
 * @param {string} data.gstin
 * @param {string|null} [data.legalName]
 * @param {string|null} [data.tradeName]
 * @param {string|null} [data.state]
 * @param {string|null} [data.stateCode]
 * @param {string} [data.gstScheme='REGULAR']
 * @param {boolean} [data.taxInclusivePricing=true]
 * @param {boolean} [data.autoInterstateSplit=true]
 * @param {boolean} [data.eInvoicingEnabled=false]
 * @param {string} [data.status='ACTIVE']
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object>}
 */
const createBranchGstSettings = async (
  {
    organisationId,
    branchId,
    gstin,
    legalName = null,
    tradeName = null,
    state = null,
    stateCode = null,
    gstScheme = "REGULAR",
    taxInclusivePricing = true,
    autoInterstateSplit = true,
    eInvoicingEnabled = false,
    status = "ACTIVE",
  },
  client = pool,
) => {
  const query = `
    INSERT INTO branch_gst_settings (
      organisation_id,
      branch_id,
      gstin,
      legal_name,
      trade_name,
      state,
      state_code,
      gst_scheme,
      tax_inclusive_pricing,
      auto_interstate_split,
      e_invoicing_enabled,
      status
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
    )
    RETURNING
      ${BRANCH_GST_COLUMNS};
  `;

  const values = [
    organisationId,
    branchId,
    gstin,
    legalName,
    tradeName,
    state,
    stateCode,
    gstScheme,
    taxInclusivePricing,
    autoInterstateSplit,
    eInvoicingEnabled,
    status,
  ];

  const result = await client.query(query, values);
  const gstSettings = result.rows[0];

  await invalidateBranchGstWriteCaches(organisationId, branchId);

  return gstSettings;
};

/**
 * Get GST settings for a specific branch.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const getBranchGstSettings = async (
  organisationId,
  branchId,
  client = pool,
) => {
  const cacheKey = buildBranchGstCacheKey(organisationId, branchId);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cached = await getCache(cacheKey);
      if (cached !== null) {
        return cached;
      }
    } catch (error) {
      console.error("Branch GST cache read failed:", error.message);
    }
  }

  const query = `
    SELECT
      ${BRANCH_GST_COLUMNS}
    FROM branch_gst_settings
    WHERE organisation_id = $1
      AND branch_id = $2;
  `;

  const result = await client.query(query, [organisationId, branchId]);
  const gstSettings = result.rows[0] || null;

  if (useCache && gstSettings) {
    try {
      await setCache(cacheKey, gstSettings, BRANCH_GST_CACHE_TTL);
    } catch (error) {
      console.error("Branch GST cache write failed:", error.message);
    }
  }

  return gstSettings;
};

/**
 * Update GST settings for a branch.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {Object} updates
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const updateBranchGstSettings = async (
  organisationId,
  branchId,
  updates,
  client = pool,
) => {
  const {
    gstin,
    legalName,
    tradeName,
    state,
    stateCode,
    gstScheme,
    taxInclusivePricing,
    autoInterstateSplit,
    eInvoicingEnabled,
    status,
  } = updates;

  const query = `
    UPDATE branch_gst_settings
    SET
      gstin = COALESCE($3, gstin),
      legal_name = COALESCE($4, legal_name),
      trade_name = COALESCE($5, trade_name),
      state = COALESCE($6, state),
      state_code = COALESCE($7, state_code),
      gst_scheme = COALESCE($8, gst_scheme),
      tax_inclusive_pricing = COALESCE($9, tax_inclusive_pricing),
      auto_interstate_split = COALESCE($10, auto_interstate_split),
      e_invoicing_enabled = COALESCE($11, e_invoicing_enabled),
      status = COALESCE($12, status),
      updated_at = CURRENT_TIMESTAMP
    WHERE organisation_id = $1
      AND branch_id = $2
    RETURNING
      ${BRANCH_GST_COLUMNS};
  `;

  const values = [
    organisationId,
    branchId,
    gstin !== undefined ? gstin : null,
    legalName !== undefined ? legalName : null,
    tradeName !== undefined ? tradeName : null,
    state !== undefined ? state : null,
    stateCode !== undefined ? stateCode : null,
    gstScheme !== undefined ? gstScheme : null,
    taxInclusivePricing !== undefined ? taxInclusivePricing : null,
    autoInterstateSplit !== undefined ? autoInterstateSplit : null,
    eInvoicingEnabled !== undefined ? eInvoicingEnabled : null,
    status !== undefined ? status : null,
  ];

  const result = await client.query(query, values);
  const updated = result.rows[0] || null;

  if (updated) {
    await invalidateBranchGstWriteCaches(organisationId, branchId);
  }

  return updated;
};

/**
 * Delete GST settings for a branch.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const deleteBranchGstSettings = async (
  organisationId,
  branchId,
  client = pool,
) => {
  const query = `
    DELETE FROM branch_gst_settings
    WHERE organisation_id = $1
      AND branch_id = $2
    RETURNING
      ${BRANCH_GST_COLUMNS};
  `;

  const result = await client.query(query, [organisationId, branchId]);
  const deleted = result.rows[0] || null;

  if (deleted) {
    await invalidateBranchGstWriteCaches(organisationId, branchId);
  }

  return deleted;
};

module.exports = {
  createBranchGstSettings,
  getBranchGstSettings,
  updateBranchGstSettings,
  deleteBranchGstSettings,
};

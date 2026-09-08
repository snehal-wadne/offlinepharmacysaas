/**
 * Branch Management Dashboard Read Queries
 *
 * Purpose:
 * Provides read-only, cross-entity queries and aggregations for:
 * 1. Branch Management screen
 * 2. User & Staff Management screen
 * 3. User Roles & Access Levels screen
 * 4. Tax & GST Settings screen
 *
 * Responsibilities:
 * - tenant-safe reads
 * - joins across branches, GST, taxes, users, memberships, roles, assignments
 * - aggregations calculated directly in PostgreSQL
 * - prevention of row multiplication via subqueries / CTEs
 * - Redis cache-aside for expensive organisation-level dashboard statistics
 *
 * No write or CRUD operations are implemented here.
 * PostgreSQL remains the source of truth.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const BRANCH_MGMT_DASHBOARD_CACHE_TTL = 60;

// Cache keys
const buildBranchManagementStatsCacheKey = (organisationId) =>
  `organisation:${organisationId}:branch-mgmt:branch-stats`;

const buildUserStaffStatsCacheKey = (organisationId) =>
  `organisation:${organisationId}:branch-mgmt:staff-stats`;

const buildRoleManagementStatsCacheKey = (organisationId) =>
  `organisation:${organisationId}:branch-mgmt:role-stats`;

/**
 * Invalidate only the cached dashboard aggregates affected by a write.
 * Dashboard list/detail projections are deliberately not cached.
 */
const invalidateBranchManagementDashboardCache = async (
  organisationId,
  { branch = false, staff = false, role = false } = {},
) => {
  const keys = [];

  if (branch) keys.push(buildBranchManagementStatsCacheKey(organisationId));
  if (staff) keys.push(buildUserStaffStatsCacheKey(organisationId));
  if (role) keys.push(buildRoleManagementStatsCacheKey(organisationId));

  try {
    await Promise.all(keys.map((key) => deleteCache(key)));
  } catch (error) {
    // Cache invalidation must never make a committed database write fail.
    console.error("Branch management dashboard cache invalidation failed:", error.message);
  }
};

/**
 * Read from Redis with error resilience.
 */
const readDashboardCache = async (cacheKey) => {
  try {
    return await getCache(cacheKey);
  } catch (error) {
    console.error(`Cache read failed for [${cacheKey}]:`, error.message);
    return null;
  }
};

/**
 * Write to Redis with error resilience.
 */
const writeDashboardCache = async (cacheKey, value) => {
  try {
    await setCache(cacheKey, value, BRANCH_MGMT_DASHBOARD_CACHE_TTL);
  } catch (error) {
    console.error(`Cache write failed for [${cacheKey}]:`, error.message);
  }
};

// ============================================================
// 1. BRANCH MANAGEMENT DASHBOARD
// ============================================================

/**
 * Get aggregated summary statistics for the Branch Management screen.
 *
 * Returns:
 * - total_branches
 * - active_branches
 * - inactive_branches
 * - hospital_pharmacies
 * - retail_dispensaries
 * - central_warehouses
 * - total_assigned_staff (distinct members assigned across branches)
 * - total_gst_registered (branches having a GST record)
 *
 * @param {string} organisationId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object>}
 */
const getBranchManagementStats = async (organisationId, client = pool) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  const cacheKey = buildBranchManagementStatsCacheKey(organisationId);
  const useCache = client === pool;

  if (useCache) {
    const cached = await readDashboardCache(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  const query = `
    SELECT
      COUNT(*)::int AS total_branches,
      COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END)::int AS active_branches,
      COUNT(CASE WHEN status = 'INACTIVE' THEN 1 END)::int AS inactive_branches,
      COUNT(CASE WHEN facility_type = 'HOSPITAL_PHARMACY' THEN 1 END)::int AS hospital_pharmacies,
      COUNT(CASE WHEN facility_type = 'RETAIL_DISPENSARY' THEN 1 END)::int AS retail_dispensaries,
      COUNT(CASE WHEN facility_type = 'CENTRAL_WAREHOUSE' THEN 1 END)::int AS central_warehouses,
      (
        SELECT COUNT(DISTINCT ba.membership_id)::int
        FROM branch_assignments ba
        INNER JOIN branches b ON b.id = ba.branch_id
        WHERE b.organisation_id = $1
      ) AS total_assigned_staff,
      (
        SELECT COUNT(DISTINCT bgs.branch_id)::int
        FROM branch_gst_settings bgs
        WHERE bgs.organisation_id = $1
      ) AS total_gst_registered
    FROM branches
    WHERE organisation_id = $1;
  `;

  const result = await client.query(query, [organisationId]);
  const stats = result.rows[0] || {
    total_branches: 0,
    active_branches: 0,
    inactive_branches: 0,
    hospital_pharmacies: 0,
    retail_dispensaries: 0,
    central_warehouses: 0,
    total_assigned_staff: 0,
    total_gst_registered: 0,
  };

  if (useCache) {
    await writeDashboardCache(cacheKey, stats);
  }

  return stats;
};

/**
 * Get branch list projections for the Branch Management table.
 * Includes staff count and GSTIN without duplicate row multiplication.
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
const getBranchListProjections = async (
  organisationId,
  {
    status,
    facilityType,
    search,
    limit = 50,
    offset = 0,
  } = {},
  client = pool,
) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  const conditions = ["b.organisation_id = $1"];
  const values = [organisationId];
  let paramIndex = 2;

  if (status && status !== "All") {
    conditions.push(`b.status = $${paramIndex++}`);
    values.push(status.toUpperCase());
  }

  if (facilityType && facilityType !== "All Types") {
    conditions.push(`b.facility_type = $${paramIndex++}`);
    values.push(facilityType);
  }

  if (search) {
    conditions.push(
      `(b.name ILIKE $${paramIndex} OR b.branch_code ILIKE $${paramIndex} OR b.city ILIKE $${paramIndex} OR b.contact_person ILIKE $${paramIndex} OR b.phone ILIKE $${paramIndex})`,
    );
    values.push(`%${search}%`);
    paramIndex++;
  }

  const query = `
    SELECT
      b.id,
      b.organisation_id,
      b.branch_code,
      b.name,
      b.facility_type,
      b.contact_person,
      b.contact_phone,
      b.contact_email,
      b.address,
      b.city,
      b.state,
      b.postal_code,
      b.phone,
      b.operating_hours,
      b.drug_license_number,
      b.invoice_prefix,
      b.status,
      b.created_at,
      b.updated_at,
      bgs.gstin,
      bgs.legal_name AS gst_legal_name,
      bgs.gst_scheme,
      COALESCE(staff_agg.staff_count, 0) AS staff_count,
      COALESCE(tax_agg.assigned_tax_count, 0) AS assigned_tax_count
    FROM branches b
    LEFT JOIN branch_gst_settings bgs
      ON bgs.branch_id = b.id AND bgs.organisation_id = b.organisation_id
    LEFT JOIN (
      SELECT
        ba.branch_id,
        COUNT(DISTINCT ba.membership_id)::int AS staff_count
      FROM branch_assignments ba
      GROUP BY ba.branch_id
    ) staff_agg ON staff_agg.branch_id = b.id
    LEFT JOIN (
      SELECT
        bta.branch_id,
        COUNT(*)::int AS assigned_tax_count
      FROM branch_tax_assignments bta
      WHERE bta.is_applied = TRUE
      GROUP BY bta.branch_id
    ) tax_agg ON tax_agg.branch_id = b.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY b.created_at ASC
    LIMIT $${paramIndex++} OFFSET $${paramIndex};
  `;

  values.push(limit, offset);

  const result = await client.query(query, values);
  return result.rows;
};

/**
 * Get comprehensive details for a single branch.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const getBranchDetailProjection = async (
  organisationId,
  branchId,
  client = pool,
) => {
  if (!organisationId || !branchId) {
    throw new Error("organisationId and branchId are required.");
  }

  // 1. Get branch base info
  const branchQuery = `
    SELECT
      b.*,
      bgs.gstin,
      bgs.legal_name AS gst_legal_name,
      bgs.trade_name AS gst_trade_name,
      bgs.state AS gst_state,
      bgs.state_code AS gst_state_code,
      bgs.gst_scheme,
      bgs.tax_inclusive_pricing,
      bgs.auto_interstate_split,
      bgs.e_invoicing_enabled,
      bgs.status AS gst_status
    FROM branches b
    LEFT JOIN branch_gst_settings bgs
      ON bgs.branch_id = b.id AND bgs.organisation_id = b.organisation_id
    WHERE b.id = $1
      AND b.organisation_id = $2;
  `;

  const branchResult = await client.query(branchQuery, [branchId, organisationId]);
  const branch = branchResult.rows[0] || null;

  if (!branch) {
    return null;
  }

  // 2. Get assigned staff
  const staffQuery = `
    SELECT
      ba.membership_id,
      ba.role_id,
      ba.is_primary,
      u.id AS user_id,
      u.name AS user_name,
      u.email AS user_email,
      u.staff_id,
      u.phone AS user_phone,
      u.professional_registration_number,
      u.working_shift,
      r.name AS role_name,
      r.role_identifier,
      r.clearance_level
    FROM branch_assignments ba
    INNER JOIN organisation_memberships om ON om.id = ba.membership_id
    INNER JOIN users u ON u.id = om.user_id
    INNER JOIN roles r ON r.id = ba.role_id
    WHERE ba.branch_id = $1
    ORDER BY ba.is_primary DESC, u.name ASC;
  `;

  const staffResult = await client.query(staffQuery, [branchId]);

  // 3. Get assigned taxes
  const taxesQuery = `
    SELECT
      bta.tax_id,
      bta.is_applied,
      t.name,
      t.tax_type,
      t.rate,
      t.is_default,
      t.is_active,
      t.description
    FROM branch_tax_assignments bta
    INNER JOIN taxes t ON t.id = bta.tax_id
    WHERE bta.branch_id = $1
      AND t.organisation_id = $2
    ORDER BY t.created_at ASC;
  `;

  const taxesResult = await client.query(taxesQuery, [branchId, organisationId]);

  return {
    ...branch,
    staff: staffResult.rows,
    taxes: taxesResult.rows,
  };
};

// ============================================================
// 2. USER & STAFF MANAGEMENT DASHBOARD
// ============================================================

/**
 * Get aggregated summary statistics for the User & Staff Management screen.
 *
 * Returns:
 * - total_staff
 * - active_staff
 * - inactive_staff
 * - registered_pharmacists
 * - billing_cashiers
 * - multi_branch_admins
 *
 * @param {string} organisationId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object>}
 */
const getUserStaffManagementStats = async (organisationId, client = pool) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  const cacheKey = buildUserStaffStatsCacheKey(organisationId);
  const useCache = client === pool;

  if (useCache) {
    const cached = await readDashboardCache(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  const query = `
    SELECT
      COUNT(DISTINCT om.id)::int AS total_staff,
      COUNT(DISTINCT CASE WHEN om.status = 'ACTIVE' THEN om.id END)::int AS active_staff,
      COUNT(DISTINCT CASE WHEN om.status = 'INACTIVE' THEN om.id END)::int AS inactive_staff,
      COUNT(DISTINCT CASE
        WHEN r.role_identifier = 'PHARMACIST'
          OR r.clearance_level = 'CLINICAL_DISPENSING'
          OR (u.professional_registration_number IS NOT NULL AND u.professional_registration_number <> '')
        THEN om.id
      END)::int AS registered_pharmacists,
      COUNT(DISTINCT CASE
        WHEN r.role_identifier = 'CASHIER'
          OR r.name ILIKE '%cashier%'
          OR r.name ILIKE '%billing%'
        THEN om.id
      END)::int AS billing_cashiers,
      COUNT(DISTINCT CASE
        WHEN r.role_identifier = 'ADMIN'
          OR r.clearance_level = 'ADMIN'
        THEN om.id
      END)::int AS multi_branch_admins
    FROM organisation_memberships om
    INNER JOIN users u ON u.id = om.user_id
    LEFT JOIN branch_assignments ba ON ba.membership_id = om.id
    LEFT JOIN roles r ON r.id = ba.role_id
    WHERE om.organisation_id = $1;
  `;

  const result = await client.query(query, [organisationId]);
  const stats = result.rows[0] || {
    total_staff: 0,
    active_staff: 0,
    inactive_staff: 0,
    registered_pharmacists: 0,
    billing_cashiers: 0,
    multi_branch_admins: 0,
  };

  if (useCache) {
    await writeDashboardCache(cacheKey, stats);
  }

  return stats;
};

/**
 * Get staff directory rows with full branch assignment aggregations.
 * Prevents duplicate row multiplication using JSON aggregation.
 *
 * @param {string} organisationId
 * @param {Object} [filters={}]
 * @param {string} [filters.roleId]
 * @param {string} [filters.branchId]
 * @param {string} [filters.status]
 * @param {string} [filters.search]
 * @param {number} [filters.limit=50]
 * @param {number} [filters.offset=0]
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>}
 */
const getUserStaffDirectoryRows = async (
  organisationId,
  {
    roleId,
    branchId,
    status,
    search,
    limit = 50,
    offset = 0,
  } = {},
  client = pool,
) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  const conditions = ["om.organisation_id = $1"];
  const values = [organisationId];
  let paramIndex = 2;

  if (status && status !== "All") {
    conditions.push(`om.status = $${paramIndex++}`);
    values.push(status.toUpperCase());
  }

  if (branchId && branchId !== "All Branches") {
    conditions.push(`EXISTS (
      SELECT 1 FROM branch_assignments ba_sub
      WHERE ba_sub.membership_id = om.id
        AND ba_sub.branch_id = $${paramIndex++}
    )`);
    values.push(branchId);
  }

  if (roleId && roleId !== "All Roles") {
    conditions.push(`EXISTS (
      SELECT 1 FROM branch_assignments ba_sub
      WHERE ba_sub.membership_id = om.id
        AND ba_sub.role_id = $${paramIndex++}
    )`);
    values.push(roleId);
  }

  if (search) {
    conditions.push(
      `(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.staff_id ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex} OR u.professional_registration_number ILIKE $${paramIndex})`,
    );
    values.push(`%${search}%`);
    paramIndex++;
  }

  const query = `
    SELECT
      om.id AS membership_id,
      om.organisation_id,
      om.status AS membership_status,
      om.joined_at,
      u.id AS user_id,
      u.email,
      u.name,
      u.staff_id,
      u.phone,
      u.professional_registration_number,
      u.working_shift,
      u.status AS user_status,
      u.last_login_at,
      primary_branch_info.primary_branch_id,
      primary_branch_info.primary_branch_name,
      primary_branch_info.primary_role_name,
      primary_branch_info.primary_role_identifier,
      primary_branch_info.primary_clearance_level,
      COALESCE(branch_agg.assigned_branches, '[]'::json) AS assigned_branches,
      COALESCE(branch_agg.branch_count, 0) AS branch_count
    FROM organisation_memberships om
    INNER JOIN users u ON u.id = om.user_id
    LEFT JOIN LATERAL (
      SELECT
        b.id AS primary_branch_id,
        b.name AS primary_branch_name,
        r.name AS primary_role_name,
        r.role_identifier AS primary_role_identifier,
        r.clearance_level AS primary_clearance_level
      FROM branch_assignments ba
      INNER JOIN branches b ON b.id = ba.branch_id
      INNER JOIN roles r ON r.id = ba.role_id
      WHERE ba.membership_id = om.id
        AND ba.is_primary = TRUE
      LIMIT 1
    ) primary_branch_info ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS branch_count,
        json_agg(
          json_build_object(
            'branch_id', b.id,
            'branch_name', b.name,
            'branch_code', b.branch_code,
            'role_id', r.id,
            'role_name', r.name,
            'role_identifier', r.role_identifier,
            'clearance_level', r.clearance_level,
            'is_primary', ba.is_primary
          )
        ) AS assigned_branches
      FROM branch_assignments ba
      INNER JOIN branches b ON b.id = ba.branch_id
      INNER JOIN roles r ON r.id = ba.role_id
      WHERE ba.membership_id = om.id
    ) branch_agg ON true
    WHERE ${conditions.join(" AND ")}
    ORDER BY om.created_at ASC
    LIMIT $${paramIndex++} OFFSET $${paramIndex};
  `;

  values.push(limit, offset);

  const result = await client.query(query, values);
  return result.rows;
};

// ============================================================
// 3. ROLE MANAGEMENT DASHBOARD
// ============================================================

/**
 * Get aggregated summary statistics for the Roles & Permissions screen.
 *
 * @param {string} organisationId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object>}
 */
const getRoleManagementStats = async (organisationId, client = pool) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  const cacheKey = buildRoleManagementStatsCacheKey(organisationId);
  const useCache = client === pool;

  if (useCache) {
    const cached = await readDashboardCache(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  const query = `
    SELECT
      COUNT(*)::int AS total_roles,
      COUNT(CASE WHEN is_system_role = TRUE THEN 1 END)::int AS system_roles,
      COUNT(CASE WHEN is_system_role = FALSE THEN 1 END)::int AS custom_roles,
      (
        SELECT COUNT(DISTINCT ba.membership_id)::int
        FROM branch_assignments ba
        INNER JOIN roles r ON r.id = ba.role_id
        WHERE r.organisation_id = $1
      ) AS assigned_staff_count
    FROM roles
    WHERE organisation_id = $1;
  `;

  const result = await client.query(query, [organisationId]);
  const stats = result.rows[0] || {
    total_roles: 0,
    system_roles: 0,
    custom_roles: 0,
    assigned_staff_count: 0,
  };

  if (useCache) {
    await writeDashboardCache(cacheKey, stats);
  }

  return stats;
};

/**
 * Get role directory rows with assigned user count and permissions count.
 *
 * @param {string} organisationId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>}
 */
const getRoleDirectoryRows = async (organisationId, client = pool) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  const query = `
    SELECT
      r.id,
      r.organisation_id,
      r.name,
      r.role_identifier,
      r.clearance_level,
      r.description,
      r.is_system_role,
      r.created_at,
      r.updated_at,
      COALESCE(user_agg.user_count, 0)::int AS user_count,
      COALESCE(perm_agg.permission_count, 0)::int AS permission_count
    FROM roles r
    LEFT JOIN (
      SELECT
        ba.role_id,
        COUNT(DISTINCT ba.membership_id)::int AS user_count
      FROM branch_assignments ba
      GROUP BY ba.role_id
    ) user_agg ON user_agg.role_id = r.id
    LEFT JOIN (
      SELECT
        rp.role_id,
        COUNT(*)::int AS permission_count
      FROM role_permissions rp
      GROUP BY rp.role_id
    ) perm_agg ON perm_agg.role_id = r.id
    WHERE r.organisation_id = $1
    ORDER BY r.is_system_role DESC, r.created_at ASC;
  `;

  const result = await client.query(query, [organisationId]);
  return result.rows;
};

// ============================================================
// 4. TAX & GST DASHBOARD
// ============================================================

/**
 * Get Tax & GST configuration summary for an organisation or branch.
 *
 * Calculates:
 * - total active applied tax rate
 * - list of active taxes
 * - GST configuration
 *
 * @param {string} organisationId
 * @param {string|null} [branchId=null]
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object>}
 */
const getTaxGstSettingsSummary = async (
  organisationId,
  branchId = null,
  client = pool,
) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  let gstSettings = null;

  if (branchId) {
    const gstResult = await client.query(
      `
        SELECT *
        FROM branch_gst_settings
        WHERE organisation_id = $1
          AND branch_id = $2;
      `,
      [organisationId, branchId],
    );
    gstSettings = gstResult.rows[0] || null;
  }

  // Taxes
  let taxesQuery;
  let taxesParams;

  if (branchId) {
    taxesQuery = `
      SELECT
        t.id,
        t.name,
        t.tax_type,
        t.rate,
        t.is_default,
        t.is_active,
        t.description,
        COALESCE(bta.is_applied, FALSE) AS is_applied
      FROM taxes t
      LEFT JOIN branch_tax_assignments bta
        ON bta.tax_id = t.id AND bta.branch_id = $2
      WHERE t.organisation_id = $1
      ORDER BY t.created_at ASC;
    `;
    taxesParams = [organisationId, branchId];
  } else {
    taxesQuery = `
      SELECT
        t.id,
        t.name,
        t.tax_type,
        t.rate,
        t.is_default,
        t.is_active,
        t.description,
        t.is_active AS is_applied
      FROM taxes t
      WHERE t.organisation_id = $1
      ORDER BY t.created_at ASC;
    `;
    taxesParams = [organisationId];
  }

  const taxesResult = await client.query(taxesQuery, taxesParams);
  const taxes = taxesResult.rows;

  const appliedTaxes = taxes.filter(
    (t) => t.is_applied === true && t.is_active === true,
  );
  const totalAppliedRate = appliedTaxes.reduce(
    (sum, t) => sum + Number(t.rate),
    0,
  );

  return {
    branch_id: branchId,
    organisation_id: organisationId,
    gst_settings: gstSettings,
    taxes,
    applied_taxes_count: appliedTaxes.length,
    total_applied_tax_rate: totalAppliedRate,
  };
};

module.exports = {
  invalidateBranchManagementDashboardCache,
  getBranchManagementStats,
  getBranchListProjections,
  getBranchDetailProjection,
  getUserStaffManagementStats,
  getUserStaffDirectoryRows,
  getRoleManagementStats,
  getRoleDirectoryRows,
  getTaxGstSettingsSummary,
};

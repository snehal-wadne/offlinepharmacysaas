/**
 * Platform Pharmacy Repository
 *
 * Handles platform-level directory, search, filter, and 360-degree tenant view.
 * Operates across all organisations without tenant isolation scoping.
 */

const { pool } = require("../db/connection");
const {
  getCache,
  setCache,
  deleteCache,
  deleteMatchingKeys,
} = require("../cache/cache");

const PHARMACY_CACHE_TTL = 60; // 1 min

/**
 * List pharmacies with multi-attribute filtering and pagination.
 */
const listPharmacies = async (
  {
    search = "",
    status = "All Status",
    plan = "All Plans",
    limit = 10,
    offset = 0,
  } = {},
  client = pool,
) => {
  const conditions = [];
  const values = [];
  let paramIdx = 1;

  if (status && status !== "All Status") {
    if (status === "Expiring Soon") {
      conditions.push(`(
        s.status = 'ACTIVE' 
        AND s.current_period_end BETWEEN CURRENT_TIMESTAMP AND (CURRENT_TIMESTAMP + INTERVAL '30 days')
      )`);
    } else if (status === "Expired") {
      conditions.push(`(
        s.status = 'EXPIRED' 
        OR (s.status = 'ACTIVE' AND s.current_period_end <= CURRENT_TIMESTAMP)
      )`);
    } else {
      conditions.push(`o.status = $${paramIdx++}`);
      values.push(status.toUpperCase());
    }
  }

  if (plan && plan !== "All Plans") {
    conditions.push(
      `(UPPER(p.name) = UPPER($${paramIdx}) OR UPPER(p.tier_code) = UPPER($${paramIdx}))`,
    );
    values.push(plan);
    paramIdx++;
  }

  if (search && search.trim()) {
    conditions.push(`(
      o.name ILIKE $${paramIdx}
      OR o.pharmacy_code ILIKE $${paramIdx}
      OR o.email ILIKE $${paramIdx}
      OR o.phone ILIKE $${paramIdx}
      OR o.city ILIKE $${paramIdx}
      OR o.admin_name ILIKE $${paramIdx}
    )`);
    values.push(`%${search.trim()}%`);
    paramIdx++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // 1. Total Count Query
  const countQuery = `
    SELECT COUNT(DISTINCT o.id)::int AS total
    FROM organisations o
    LEFT JOIN LATERAL (
      SELECT plan_id, status, current_period_end 
      FROM subscriptions 
      WHERE organisation_id = o.id 
      ORDER BY created_at DESC 
      LIMIT 1
    ) s ON TRUE
    LEFT JOIN subscription_plans p ON p.id = s.plan_id
    ${whereClause};
  `;
  const countRes = await client.query(countQuery, values);
  const total = countRes.rows[0]?.total || 0;

  // 2. Paginated Data Query
  const dataQuery = `
    SELECT 
      o.id,
      o.pharmacy_code,
      o.name,
      o.admin_name,
      o.email,
      o.phone,
      o.city,
      o.state,
      o.status,
      o.created_at,
      p.name AS plan_name,
      p.tier_code AS plan_tier,
      s.status AS subscription_status,
      s.current_period_end AS expiry_date,
      (
        SELECT COUNT(*)::int 
        FROM branches b 
        WHERE b.organisation_id = o.id
      ) AS branch_count,
      (
        SELECT COUNT(*)::int 
        FROM organisation_memberships om 
        WHERE om.organisation_id = o.id
      ) AS user_count
    FROM organisations o
    LEFT JOIN LATERAL (
      SELECT plan_id, status, current_period_end 
      FROM subscriptions 
      WHERE organisation_id = o.id 
      ORDER BY created_at DESC 
      LIMIT 1
    ) s ON TRUE
    LEFT JOIN subscription_plans p ON p.id = s.plan_id
    ${whereClause}
    ORDER BY o.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++};
  `;

  values.push(limit, offset);
  const dataRes = await client.query(dataQuery, values);

  return {
    pharmacies: dataRes.rows,
    total,
  };
};

/**
 * Get 360-degree pharmacy details by ID.
 */
const getPharmacyDetailById = async (pharmacyId, client = pool) => {
  const query = `
    SELECT 
      o.id,
      o.owner_id,
      o.name,
      o.pharmacy_code,
      o.admin_name,
      o.email,
      o.phone,
      o.address,
      o.city,
      o.state,
      o.pincode,
      o.gst_number,
      o.business_type,
      o.status,
      o.created_at,
      o.updated_at,
      s.id AS subscription_id,
      s.status AS subscription_status,
      s.billing_cycle,
      s.current_period_start,
      s.current_period_end,
      s.auto_renew,
      p.id AS plan_id,
      p.name AS plan_name,
      p.tier_code AS plan_tier,
      p.price AS plan_price,
      p.max_branches AS plan_max_branches,
      p.max_users AS plan_max_users,
      p.features AS plan_features,
      p.module_summary AS plan_module_summary,
      p.color_hex AS plan_color_hex,
      (
        SELECT COUNT(*)::int 
        FROM branches b 
        WHERE b.organisation_id = o.id
      ) AS branch_count,
      (
        SELECT COUNT(*)::int 
        FROM organisation_memberships om 
        WHERE om.organisation_id = o.id
      ) AS user_count,
      u.name AS owner_name,
      u.email AS owner_email
    FROM organisations o
    INNER JOIN users u ON u.id = o.owner_id
    LEFT JOIN LATERAL (
      SELECT * 
      FROM subscriptions 
      WHERE organisation_id = o.id 
      ORDER BY created_at DESC 
      LIMIT 1
    ) s ON TRUE
    LEFT JOIN subscription_plans p ON p.id = s.plan_id
    WHERE o.id::text = $1 OR o.pharmacy_code = $1;
  `;

  const result = await client.query(query, [String(pharmacyId)]);
  return result.rows[0] || null;
};

/**
 * Update pharmacy status (e.g. ACTIVE, SUSPENDED, DEACTIVATED).
 */
const updatePharmacyStatus = async (pharmacyId, status, client = pool) => {
  const query = `
    UPDATE organisations
    SET status = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING id, name, pharmacy_code, status, updated_at;
  `;
  const result = await client.query(query, [status, pharmacyId]);
  return result.rows[0] || null;
};

module.exports = {
  listPharmacies,
  getPharmacyDetailById,
  updatePharmacyStatus,
};

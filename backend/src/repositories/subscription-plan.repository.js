/**
 * Subscription Plan Repository
 *
 * Handles database operations for SaaS subscription plans.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const PLANS_ALL_CACHE_KEY = "platform:plans:all";
const PLANS_ACTIVE_CACHE_KEY = "platform:plans:active";
const PLAN_CACHE_TTL = 3600; // 1 hour

/**
 * List subscription plans.
 */
const listPlans = async ({ activeOnly = false } = {}, client = pool) => {
  const cacheKey = activeOnly ? PLANS_ACTIVE_CACHE_KEY : PLANS_ALL_CACHE_KEY;

  if (client === pool) {
    try {
      const cached = await getCache(cacheKey);
      if (cached) return cached;
    } catch (err) {
      console.warn("Plans cache read warning:", err.message);
    }
  }

  const query = `
    SELECT 
      id,
      name,
      tier_code,
      description,
      price,
      currency,
      billing_interval,
      max_branches,
      max_users,
      max_storage_bytes,
      features,
      module_summary,
      color_hex,
      is_popular,
      is_active,
      created_at,
      updated_at
    FROM subscription_plans
    ${activeOnly ? "WHERE is_active = TRUE" : ""}
    ORDER BY price ASC;
  `;

  const result = await client.query(query);
  const plans = result.rows;

  if (client === pool) {
    try {
      await setCache(cacheKey, plans, PLAN_CACHE_TTL);
    } catch (err) {
      console.warn("Plans cache write warning:", err.message);
    }
  }

  return plans;
};

/**
 * Get subscription plan by ID or tier code.
 */
const getPlanById = async (planId, client = pool) => {
  const query = `
    SELECT 
      id,
      name,
      tier_code,
      description,
      price,
      currency,
      billing_interval,
      max_branches,
      max_users,
      max_storage_bytes,
      features,
      module_summary,
      color_hex,
      is_popular,
      is_active,
      created_at,
      updated_at
    FROM subscription_plans
    WHERE id = $1;
  `;

  const result = await client.query(query, [planId]);
  return result.rows[0] || null;
};

/**
 * Get plan by tier code (e.g. 'BASIC', 'PROFESSIONAL').
 */
const getPlanByTierCode = async (tierCode, client = pool) => {
  const query = `
    SELECT * FROM subscription_plans
    WHERE UPPER(tier_code) = UPPER($1) OR UPPER(name) = UPPER($1)
    ORDER BY created_at ASC
    LIMIT 1;
  `;
  const result = await client.query(query, [tierCode]);
  return result.rows[0] || null;
};

/**
 * Create a new subscription plan.
 */
const createPlan = async (data, client = pool) => {
  const query = `
    INSERT INTO subscription_plans (
      name, tier_code, description, price, currency, billing_interval,
      max_branches, max_users, max_storage_bytes, features, module_summary,
      color_hex, is_popular, is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *;
  `;

  const result = await client.query(query, [
    data.name,
    data.tierCode || data.name.toUpperCase(),
    data.description,
    data.price,
    data.currency || "INR",
    data.billingInterval || "YEAR",
    data.maxBranches || 1,
    data.maxUsers || 5,
    data.maxStorageBytes || null,
    JSON.stringify(data.features || []),
    data.moduleSummary || "2 Modules",
    data.colorHex || "#2563EB",
    Boolean(data.isPopular),
    data.isActive !== undefined ? Boolean(data.isActive) : true,
  ]);

  try {
    await Promise.all([
      deleteCache(PLANS_ALL_CACHE_KEY),
      deleteCache(PLANS_ACTIVE_CACHE_KEY),
    ]);
  } catch (err) {
    console.warn("Plans cache clear warning:", err.message);
  }

  return result.rows[0];
};

/**
 * Update an existing subscription plan.
 */
const updatePlan = async (planId, data, client = pool) => {
  const query = `
    UPDATE subscription_plans
    SET 
      name = COALESCE($1, name),
      tier_code = COALESCE($2, tier_code),
      description = COALESCE($3, description),
      price = COALESCE($4, price),
      max_branches = COALESCE($5, max_branches),
      max_users = COALESCE($6, max_users),
      features = COALESCE($7, features),
      module_summary = COALESCE($8, module_summary),
      color_hex = COALESCE($9, color_hex),
      is_popular = COALESCE($10, is_popular),
      is_active = COALESCE($11, is_active),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $12
    RETURNING *;
  `;

  const result = await client.query(query, [
    data.name,
    data.tierCode,
    data.description,
    data.price,
    data.maxBranches,
    data.maxUsers,
    data.features ? JSON.stringify(data.features) : null,
    data.moduleSummary,
    data.colorHex,
    data.isPopular,
    data.isActive,
    planId,
  ]);

  try {
    await Promise.all([
      deleteCache(PLANS_ALL_CACHE_KEY),
      deleteCache(PLANS_ACTIVE_CACHE_KEY),
    ]);
  } catch (err) {
    console.warn("Plans cache clear warning:", err.message);
  }

  return result.rows[0] || null;
};

module.exports = {
  listPlans,
  getPlanById,
  getPlanByTierCode,
  createPlan,
  updatePlan,
};

/**
 * Subscription Repository
 *
 * Handles database operations for tenant subscriptions.
 * Enforces single current active/pending subscription per organisation.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const buildOrgSubscriptionCacheKey = (organisationId) =>
  `subscription:org:${organisationId}`;
const SUB_CACHE_TTL = 120;

/**
 * Get current active or pending subscription for an organisation.
 */
const getCurrentSubscriptionByOrgId = async (organisationId, client = pool) => {
  const query = `
    SELECT 
      s.id,
      s.organisation_id,
      s.plan_id,
      s.status,
      s.billing_cycle,
      s.auto_renew,
      s.max_branches_override,
      s.max_users_override,
      s.started_at,
      s.current_period_start,
      s.current_period_end,
      s.cancelled_at,
      s.created_at,
      s.updated_at,
      p.name AS plan_name,
      p.tier_code AS plan_tier,
      p.price AS plan_price,
      p.max_branches AS plan_max_branches,
      p.max_users AS plan_max_users,
      p.features AS plan_features,
      p.module_summary AS plan_module_summary,
      p.color_hex AS plan_color_hex
    FROM subscriptions s
    INNER JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.organisation_id = $1
      AND s.status IN ('PENDING_PAYMENT', 'ACTIVE')
    ORDER BY s.created_at DESC
    LIMIT 1;
  `;

  const result = await client.query(query, [organisationId]);
  return result.rows[0] || null;
};

/**
 * Get subscription by ID.
 */
const getSubscriptionById = async (subscriptionId, client = pool) => {
  const query = `
    SELECT 
      s.*,
      p.name AS plan_name,
      p.tier_code AS plan_tier,
      p.price AS plan_price,
      p.max_branches AS plan_max_branches,
      p.max_users AS plan_max_users,
      p.features AS plan_features
    FROM subscriptions s
    INNER JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.id = $1;
  `;
  const result = await client.query(query, [subscriptionId]);
  return result.rows[0] || null;
};

/**
 * Create initial subscription (typically in PENDING_PAYMENT or ACTIVE state).
 */
const createSubscription = async (
  {
    organisationId,
    planId,
    status = "PENDING_PAYMENT",
    billingCycle = "ANNUAL",
    startedAt = new Date(),
    currentPeriodStart = null,
    currentPeriodEnd = null,
    autoRenew = false,
    maxBranchesOverride = null,
    maxUsersOverride = null,
  },
  client = pool,
) => {
  const query = `
    INSERT INTO subscriptions (
      organisation_id,
      plan_id,
      status,
      billing_cycle,
      started_at,
      current_period_start,
      current_period_end,
      auto_renew,
      max_branches_override,
      max_users_override
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `;

  const result = await client.query(query, [
    organisationId,
    planId,
    status,
    billingCycle,
    startedAt,
    currentPeriodStart,
    currentPeriodEnd,
    autoRenew,
    maxBranchesOverride,
    maxUsersOverride,
  ]);

  try {
    await deleteCache(buildOrgSubscriptionCacheKey(organisationId));
  } catch (err) {
    console.warn("Subscription cache clear warning:", err.message);
  }

  return result.rows[0];
};

/**
 * Update an existing subscription.
 */
const updateSubscription = async (subscriptionId, updates, client = pool) => {
  const query = `
    UPDATE subscriptions
    SET 
      plan_id = COALESCE($1, plan_id),
      status = COALESCE($2, status),
      billing_cycle = COALESCE($3, billing_cycle),
      current_period_start = COALESCE($4, current_period_start),
      current_period_end = COALESCE($5, current_period_end),
      cancelled_at = COALESCE($6, cancelled_at),
      auto_renew = COALESCE($7, auto_renew),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $8
    RETURNING *;
  `;

  const result = await client.query(query, [
    updates.planId,
    updates.status,
    updates.billingCycle,
    updates.currentPeriodStart,
    updates.currentPeriodEnd,
    updates.cancelledAt,
    updates.autoRenew,
    subscriptionId,
  ]);

  const sub = result.rows[0] || null;
  if (sub) {
    try {
      await deleteCache(buildOrgSubscriptionCacheKey(sub.organisation_id));
    } catch (err) {
      console.warn("Subscription cache clear warning:", err.message);
    }
  }

  return sub;
};

/**
 * Transition overdue ACTIVE subscriptions to EXPIRED.
 */
const expireOverdueSubscriptions = async (client = pool) => {
  const query = `
    UPDATE subscriptions
    SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'ACTIVE'
      AND current_period_end <= CURRENT_TIMESTAMP
    RETURNING id, organisation_id;
  `;

  const result = await client.query(query);
  return result.rows;
};

/**
 * List all historical subscriptions for an organisation.
 */
const listSubscriptionsByOrgId = async (organisationId, client = pool) => {
  const query = `
    SELECT 
      s.*,
      p.name AS plan_name,
      p.tier_code AS plan_tier
    FROM subscriptions s
    INNER JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.organisation_id = $1
    ORDER BY s.created_at DESC;
  `;

  const result = await client.query(query, [organisationId]);
  return result.rows;
};

module.exports = {
  getCurrentSubscriptionByOrgId,
  getSubscriptionById,
  createSubscription,
  updateSubscription,
  expireOverdueSubscriptions,
  listSubscriptionsByOrgId,
};

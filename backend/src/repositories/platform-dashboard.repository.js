/**
 * Platform Dashboard Repository
 *
 * Provides aggregated analytics, metrics, and trends for the Superadmin Dashboard.
 * Guarantees zero SQL join multiplication by using independent aggregate subqueries.
 */

const { pool } = require("../db/connection");
const { getCache, setCache } = require("../cache/cache");

const DASHBOARD_METRICS_CACHE_KEY = "platform:dashboard:metrics";
const DASHBOARD_CHARTS_CACHE_KEY = "platform:dashboard:charts";
const DASHBOARD_RECENT_CACHE_KEY = "platform:dashboard:recent";
const DASHBOARD_CACHE_TTL = 120; // 2 minutes

/**
 * Get 5 top-level KPI metric cards.
 */
const getDashboardMetrics = async (client = pool) => {
  if (client === pool) {
    try {
      const cached = await getCache(DASHBOARD_METRICS_CACHE_KEY);
      if (cached) return cached;
    } catch (err) {
      console.warn("Dashboard metrics cache read warning:", err.message);
    }
  }

  // 1. Total Pharmacies & Growth
  const orgsRes = await client.query(`
    SELECT 
      COUNT(*)::int AS total_pharmacies,
      COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP))::int AS new_this_month,
      COUNT(*) FILTER (
        WHERE created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP - INTERVAL '1 month')
          AND created_at < DATE_TRUNC('month', CURRENT_TIMESTAMP)
      )::int AS new_last_month
    FROM organisations
    WHERE status != 'DEACTIVATED';
  `);
  const orgStats = orgsRes.rows[0];

  // 2. Subscriptions & Expiring Soon
  const subsRes = await client.query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'ACTIVE' AND current_period_end > CURRENT_TIMESTAMP)::int AS active_subscriptions,
      COUNT(*)::int AS total_subscriptions,
      COUNT(*) FILTER (
        WHERE status = 'ACTIVE' 
          AND current_period_end BETWEEN CURRENT_TIMESTAMP AND (CURRENT_TIMESTAMP + INTERVAL '30 days')
      )::int AS expiring_soon
    FROM subscriptions;
  `);
  const subStats = subsRes.rows[0];

  // 3. Monthly Net SaaS Revenue (Independent subqueries: payments minus refunds)
  const revRes = await client.query(`
    SELECT 
      COALESCE((
        SELECT SUM(p.total_amount) 
        FROM platform_subscription_payments p 
        WHERE p.status IN ('SUCCESS', 'PARTIALLY_REFUNDED')
          AND p.paid_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP)
      ), 0) -
      COALESCE((
        SELECT SUM(r.amount) 
        FROM platform_payment_refunds r 
        WHERE r.status = 'PROCESSED'
          AND r.created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP)
      ), 0) AS current_month_revenue,

      COALESCE((
        SELECT SUM(p.total_amount) 
        FROM platform_subscription_payments p 
        WHERE p.status IN ('SUCCESS', 'PARTIALLY_REFUNDED')
          AND p.paid_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP - INTERVAL '1 month')
          AND p.paid_at < DATE_TRUNC('month', CURRENT_TIMESTAMP)
      ), 0) -
      COALESCE((
        SELECT SUM(r.amount) 
        FROM platform_payment_refunds r 
        WHERE r.status = 'PROCESSED'
          AND r.created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP - INTERVAL '1 month')
          AND r.created_at < DATE_TRUNC('month', CURRENT_TIMESTAMP)
      ), 0) AS last_month_revenue;
  `);
  const revStats = revRes.rows[0];

  // 4. Total SaaS Users
  const userRes = await client.query(`
    SELECT COUNT(*)::int AS total_saas_users 
    FROM users 
    WHERE status = 'ACTIVE' AND is_platform_superadmin = FALSE;
  `);
  const totalUsers = userRes.rows[0]?.total_saas_users || 0;

  // Formatting calculations
  const totalPharmacies = Number(orgStats.total_pharmacies || 0);
  const newThisMonth = Number(orgStats.new_this_month || 0);
  const newLastMonth = Number(orgStats.new_last_month || 0);
  const totalPharmaciesChange =
    newLastMonth > 0
      ? `${newThisMonth >= newLastMonth ? "+" : ""}${Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100)}% from last month`
      : `+${newThisMonth} this month`;

  const activeSubs = Number(subStats.active_subscriptions || 0);
  const totalSubs = Number(subStats.total_subscriptions || 0);
  const activeRate =
    totalSubs > 0
      ? `${((activeSubs / totalSubs) * 100).toFixed(1)}% retention`
      : "100% retention";

  const monthlyRev = Math.round(Number(revStats.current_month_revenue || 0));
  const lastMonthRev = Math.round(Number(revStats.last_month_revenue || 0));
  const revChange =
    lastMonthRev > 0
      ? `${monthlyRev >= lastMonthRev ? "+" : ""}${(((monthlyRev - lastMonthRev) / lastMonthRev) * 100).toFixed(1)}% vs last month`
      : "+0% vs last month";

  const metrics = {
    totalPharmacies,
    totalPharmaciesChange,
    activeSubscriptions: activeSubs,
    activeSubscriptionsRate: activeRate,
    expiringSoon: Number(subStats.expiring_soon || 0),
    expiringSoonActionRequired: Number(subStats.expiring_soon || 0) > 0,
    monthlySaasRevenue: monthlyRev,
    revenueChange: revChange,
    totalSaasUsers: Number(totalUsers),
    usersChange: `Active staff members`,
  };

  if (client === pool) {
    try {
      await setCache(DASHBOARD_METRICS_CACHE_KEY, metrics, DASHBOARD_CACHE_TTL);
    } catch (err) {
      console.warn("Dashboard metrics cache write warning:", err.message);
    }
  }

  return metrics;
};

/**
 * Get dashboard charts: status distribution donut, 6-month trend, revenue by tier.
 */
const getDashboardCharts = async (client = pool) => {
  if (client === pool) {
    try {
      const cached = await getCache(DASHBOARD_CHARTS_CACHE_KEY);
      if (cached) return cached;
    } catch (err) {
      console.warn("Dashboard charts cache read warning:", err.message);
    }
  }

  // 1. Status Distribution (Donut)
  const statusRes = await client.query(`
    SELECT 
      COUNT(*) FILTER (WHERE s.status = 'ACTIVE' AND s.current_period_end > CURRENT_TIMESTAMP + INTERVAL '30 days')::int AS active,
      COUNT(*) FILTER (WHERE s.status = 'ACTIVE' AND s.current_period_end BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '30 days')::int AS expiring_soon,
      COUNT(*) FILTER (WHERE s.status = 'EXPIRED' OR (s.status = 'ACTIVE' AND s.current_period_end <= CURRENT_TIMESTAMP))::int AS expired,
      COUNT(*) FILTER (WHERE o.status = 'DEACTIVATED')::int AS deactivated
    FROM organisations o
    LEFT JOIN LATERAL (
      SELECT status, current_period_end 
      FROM subscriptions 
      WHERE organisation_id = o.id 
      ORDER BY created_at DESC 
      LIMIT 1
    ) s ON TRUE;
  `);
  const statusCounts = statusRes.rows[0];

  // 2. 6-Month Onboarding Trend
  const trendRes = await client.query(`
    SELECT 
      TO_CHAR(d, 'Mon') AS month,
      TO_CHAR(d, 'YYYY-MM') AS month_key,
      COUNT(o.id)::int AS count
    FROM GENERATE_SERIES(
      DATE_TRUNC('month', CURRENT_TIMESTAMP - INTERVAL '5 months'),
      DATE_TRUNC('month', CURRENT_TIMESTAMP),
      '1 month'::interval
    ) d
    LEFT JOIN organisations o ON DATE_TRUNC('month', o.created_at) = d
    GROUP BY d
    ORDER BY d ASC;
  `);

  // 3. Top Plans by Revenue
  const planRevRes = await client.query(`
    SELECT 
      p.name AS plan_name,
      p.color_hex,
      COUNT(sub.id)::int AS subscriber_count,
      COALESCE(SUM(pay.total_amount), 0)::int AS total_revenue
    FROM subscription_plans p
    LEFT JOIN subscriptions sub ON sub.plan_id = p.id AND sub.status = 'ACTIVE'
    LEFT JOIN platform_subscription_payments pay ON pay.subscription_id = sub.id AND pay.status = 'SUCCESS'
    GROUP BY p.id, p.name, p.color_hex
    ORDER BY total_revenue DESC, p.price DESC;
  `);

  const charts = {
    statusDistribution: {
      active: Number(statusCounts.active || 0),
      expiringSoon: Number(statusCounts.expiring_soon || 0),
      expired: Number(statusCounts.expired || 0),
      deactivated: Number(statusCounts.deactivated || 0),
    },
    trend: trendRes.rows,
    topPlans: planRevRes.rows,
  };

  if (client === pool) {
    try {
      await setCache(DASHBOARD_CHARTS_CACHE_KEY, charts, DASHBOARD_CACHE_TTL);
    } catch (err) {
      console.warn("Dashboard charts cache write warning:", err.message);
    }
  }

  return charts;
};

/**
 * Get recent dashboard activity: recently onboarded & upcoming expirations.
 */
const getRecentActivity = async (client = pool) => {
  if (client === pool) {
    try {
      const cached = await getCache(DASHBOARD_RECENT_CACHE_KEY);
      if (cached) return cached;
    } catch (err) {
      console.warn(
        "Dashboard recent activity cache read warning:",
        err.message,
      );
    }
  }

  // 1. Recently Onboarded (5 latest)
  const recentOrgs = await client.query(`
    SELECT 
      o.id,
      o.name,
      o.pharmacy_code,
      o.admin_name,
      o.city,
      o.status,
      o.created_at,
      p.name AS plan_name,
      p.tier_code AS plan_tier,
      s.current_period_end AS expiry_date
    FROM organisations o
    LEFT JOIN LATERAL (
      SELECT plan_id, current_period_end 
      FROM subscriptions 
      WHERE organisation_id = o.id 
      ORDER BY created_at DESC 
      LIMIT 1
    ) s ON TRUE
    LEFT JOIN subscription_plans p ON p.id = s.plan_id
    ORDER BY o.created_at DESC
    LIMIT 5;
  `);

  // 2. Upcoming Expirations (5 nearest)
  const upcomingExp = await client.query(`
    SELECT 
      o.id,
      o.name,
      o.pharmacy_code,
      o.email,
      s.current_period_end AS expiry_date,
      p.name AS plan_name,
      GREATEST(0, EXTRACT(DAY FROM (s.current_period_end - CURRENT_TIMESTAMP)))::int AS days_remaining
    FROM subscriptions s
    INNER JOIN organisations o ON o.id = s.organisation_id
    INNER JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.status = 'ACTIVE'
      AND s.current_period_end > CURRENT_TIMESTAMP
    ORDER BY s.current_period_end ASC
    LIMIT 5;
  `);

  const activity = {
    recentlyOnboarded: recentOrgs.rows,
    upcomingExpirations: upcomingExp.rows,
  };

  if (client === pool) {
    try {
      await setCache(DASHBOARD_RECENT_CACHE_KEY, activity, DASHBOARD_CACHE_TTL);
    } catch (err) {
      console.warn(
        "Dashboard recent activity cache write warning:",
        err.message,
      );
    }
  }

  return activity;
};

module.exports = {
  getDashboardMetrics,
  getDashboardCharts,
  getRecentActivity,
};

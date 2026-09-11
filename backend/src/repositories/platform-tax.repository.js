/**
 * Platform Tax Configuration Repository
 *
 * Handles database operations for effective-dated SaaS tax configuration.
 *
 * Current business requirement: 18.00% GST, but never hardcoded.
 * Selected rule: the latest configuration whose effective_from <= calculation time
 * and (effective_to IS NULL or effective_to > calculation time).
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const TAX_CACHE_KEY = "platform:tax:active";
const TAX_CACHE_TTL = 300; // 5 minutes

/**
 * Retrieve the active tax configuration for a given date (default NOW).
 */
const getActiveTaxConfig = async (
  effectiveDate = new Date(),
  client = pool,
) => {
  // Try Redis cache if using default pool
  if (client === pool) {
    try {
      const cached = await getCache(TAX_CACHE_KEY);
      if (cached) {
        return cached;
      }
    } catch (err) {
      console.warn("Tax cache read warning:", err.message);
    }
  }

  const query = `
    SELECT 
      id,
      config_code,
      tax_name,
      rate_percent,
      sac_code,
      description,
      effective_from,
      effective_to,
      created_at
    FROM platform_tax_configs
    WHERE config_code = 'SAAS_SUBSCRIPTION_GST'
      AND effective_from <= $1
      AND (effective_to IS NULL OR effective_to > $1)
    ORDER BY effective_from DESC
    LIMIT 1;
  `;

  const result = await client.query(query, [effectiveDate]);
  const config = result.rows[0] || {
    config_code: "SAAS_SUBSCRIPTION_GST",
    tax_name: "Goods and Services Tax",
    rate_percent: "18.00",
    sac_code: "998313",
  };

  if (client === pool && result.rows[0]) {
    try {
      await setCache(TAX_CACHE_KEY, config, TAX_CACHE_TTL);
    } catch (err) {
      console.warn("Tax cache write warning:", err.message);
    }
  }

  return config;
};

/**
 * Create a new effective-dated tax configuration.
 */
const createTaxConfig = async (
  {
    configCode = "SAAS_SUBSCRIPTION_GST",
    taxName,
    ratePercent,
    sacCode = "998313",
    description,
    effectiveFrom,
  },
  client = pool,
) => {
  const query = `
    INSERT INTO platform_tax_configs (
      config_code, tax_name, rate_percent, sac_code, description, effective_from
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;

  const result = await client.query(query, [
    configCode,
    taxName || "Goods and Services Tax",
    ratePercent,
    sacCode,
    description,
    effectiveFrom || new Date(),
  ]);

  try {
    await deleteCache(TAX_CACHE_KEY);
  } catch (err) {
    console.warn("Tax cache clear warning:", err.message);
  }

  return result.rows[0];
};

/**
 * List all tax configurations (including historical).
 */
const listTaxConfigs = async (client = pool) => {
  const query = `
    SELECT * FROM platform_tax_configs
    ORDER BY effective_from DESC;
  `;
  const result = await client.query(query);
  return result.rows;
};

module.exports = {
  getActiveTaxConfig,
  createTaxConfig,
  listTaxConfigs,
};

/**
 * Platform Business Configuration Repository
 *
 * Manages the platform's seller/business identity used on SaaS invoices.
 * Guaranteed single active seller profile via partial unique index.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const BUSINESS_CONFIG_CACHE_KEY = "platform:business:active";
const BUSINESS_CONFIG_CACHE_TTL = 300;

/**
 * Get active platform business seller configuration.
 */
const getActiveBusinessConfig = async (client = pool) => {
  if (client === pool) {
    try {
      const cached = await getCache(BUSINESS_CONFIG_CACHE_KEY);
      if (cached) return cached;
    } catch (err) {
      console.warn("Business config cache read warning:", err.message);
    }
  }

  const query = `
    SELECT 
      id,
      legal_name,
      trade_name,
      gstin,
      address_line1,
      city,
      state,
      pincode,
      contact_email,
      contact_phone,
      is_active,
      created_at,
      updated_at
    FROM platform_business_configs
    WHERE is_active = TRUE
    LIMIT 1;
  `;

  const result = await client.query(query);
  const config = result.rows[0] || null;

  if (client === pool && config) {
    try {
      await setCache(
        BUSINESS_CONFIG_CACHE_KEY,
        config,
        BUSINESS_CONFIG_CACHE_TTL,
      );
    } catch (err) {
      console.warn("Business config cache write warning:", err.message);
    }
  }

  return config;
};

/**
 * Upsert or update active platform business configuration.
 */
const updateBusinessConfig = async (data, client = pool) => {
  const current = await getActiveBusinessConfig(client);

  let result;
  if (current) {
    const query = `
      UPDATE platform_business_configs
      SET 
        legal_name = COALESCE($1, legal_name),
        trade_name = COALESCE($2, trade_name),
        gstin = COALESCE($3, gstin),
        address_line1 = COALESCE($4, address_line1),
        city = COALESCE($5, city),
        state = COALESCE($6, state),
        pincode = COALESCE($7, pincode),
        contact_email = COALESCE($8, contact_email),
        contact_phone = COALESCE($9, contact_phone),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING *;
    `;
    result = await client.query(query, [
      data.legalName,
      data.tradeName,
      data.gstin,
      data.addressLine1,
      data.city,
      data.state,
      data.pincode,
      data.contactEmail,
      data.contactPhone,
      current.id,
    ]);
  } else {
    const query = `
      INSERT INTO platform_business_configs (
        legal_name, trade_name, gstin, address_line1, city, state, pincode, contact_email, contact_phone, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
      RETURNING *;
    `;
    result = await client.query(query, [
      data.legalName,
      data.tradeName,
      data.gstin,
      data.addressLine1,
      data.city,
      data.state || "Maharashtra",
      data.pincode,
      data.contactEmail,
      data.contactPhone,
    ]);
  }

  try {
    await deleteCache(BUSINESS_CONFIG_CACHE_KEY);
  } catch (err) {
    console.warn("Business config cache clear warning:", err.message);
  }

  return result.rows[0];
};

module.exports = {
  getActiveBusinessConfig,
  updateBusinessConfig,
};

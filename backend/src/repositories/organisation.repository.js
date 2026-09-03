/**
 * Organisation Repository
 *
 * Purpose:
 * Handles direct database operations for organisations.
 *
 * In our SaaS architecture, an organisation represents a tenant.
 *
 * The repository is responsible for database access and
 * organisation-level caching only.
 * Tenant authorization and business rules belong to the service layer.
 *
 * PostgreSQL remains the source of truth.
 * Redis is used only as a short-lived read cache.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const ORGANISATION_CACHE_TTL = 60;

/**
 * Build Redis cache keys.
 */
const buildOrganisationCacheKey = (organisationId) =>
  `organisation:${organisationId}`;

const buildOwnerOrganisationsCacheKey = (ownerId) =>
  `organisation:owner:${ownerId}`;

/**
 * Create a new organisation.
 *
 * @param {Object} data
 * @param {string} data.ownerId
 * @param {string} data.name
 *
 * @returns {Object} Created organisation
 */
const createOrganisation = async ({ ownerId, name }) => {
  const query = `
        INSERT INTO organisations (
            owner_id,
            name
        )
        VALUES ($1, $2)
        RETURNING
            id,
            owner_id,
            name,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [ownerId, name]);
  const organisation = result.rows[0];

  /**
   * The organisation itself has no existing cache entry.
   * Only the owner's organisation list needs invalidation.
   */
  try {
    await deleteCache(buildOwnerOrganisationsCacheKey(ownerId));
  } catch (error) {
    console.error("Organisation owner cache invalidation failed:", error);
  }

  return organisation;
};

/**
 * Get an organisation by its ID.
 *
 * @param {string} organisationId
 *
 * @returns {Object|null} Organisation or null if not found
 */
const getOrganisationById = async (organisationId) => {
  const cacheKey = buildOrganisationCacheKey(organisationId);

  try {
    const cachedOrganisation = await getCache(cacheKey);

    if (cachedOrganisation !== null) {
      return cachedOrganisation;
    }
  } catch (error) {
    console.error("Organisation cache read failed:", error);
  }

  const query = `
        SELECT
            id,
            owner_id,
            name,
            created_at,
            updated_at
        FROM organisations
        WHERE id = $1;
    `;

  const result = await pool.query(query, [organisationId]);
  const organisation = result.rows[0] || null;

  if (organisation) {
    try {
      await setCache(cacheKey, organisation, ORGANISATION_CACHE_TTL);
    } catch (error) {
      console.error("Organisation cache write failed:", error);
    }
  }

  return organisation;
};

/**
 * Get organisations owned by a specific user.
 *
 * @param {string} ownerId
 *
 * @returns {Array} Organisations owned by the user
 */
const getOrganisationsByOwnerId = async (ownerId) => {
  const cacheKey = buildOwnerOrganisationsCacheKey(ownerId);

  try {
    const cachedOrganisations = await getCache(cacheKey);

    if (cachedOrganisations !== null) {
      return cachedOrganisations;
    }
  } catch (error) {
    console.error("Organisation owner cache read failed:", error);
  }

  const query = `
        SELECT
            id,
            owner_id,
            name,
            created_at,
            updated_at
        FROM organisations
        WHERE owner_id = $1
        ORDER BY created_at ASC;
    `;

  const result = await pool.query(query, [ownerId]);
  const organisations = result.rows;

  try {
    await setCache(cacheKey, organisations, ORGANISATION_CACHE_TTL);
  } catch (error) {
    console.error("Organisation owner cache write failed:", error);
  }

  return organisations;
};

/**
 * Update an organisation's name.
 *
 * @param {string} organisationId
 * @param {string} name
 *
 * @returns {Object|null} Updated organisation
 */
const updateOrganisation = async (organisationId, name) => {
  const query = `
        UPDATE organisations
        SET
            name = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING
            id,
            owner_id,
            name,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [name, organisationId]);

  const organisation = result.rows[0] || null;

  if (organisation) {
    try {
      await Promise.all([
        deleteCache(buildOrganisationCacheKey(organisation.id)),
        deleteCache(buildOwnerOrganisationsCacheKey(organisation.owner_id)),
      ]);
    } catch (error) {
      console.error("Organisation cache invalidation failed:", error);
    }
  }

  return organisation;
};

/**
 * Delete an organisation.
 *
 * The organisation is loaded before deletion so that the
 * organisation and owner-list cache keys can be invalidated
 * after the database deletion succeeds.
 *
 * @param {string} organisationId
 *
 * @returns {boolean} True if the organisation was deleted
 */
const deleteOrganisation = async (organisationId) => {
  const existingOrganisation = await getOrganisationById(organisationId);

  const query = `
        DELETE FROM organisations
        WHERE id = $1
        RETURNING id;
    `;

  const result = await pool.query(query, [organisationId]);

  if (result.rowCount > 0 && existingOrganisation) {
    try {
      await Promise.all([
        deleteCache(buildOrganisationCacheKey(existingOrganisation.id)),
        deleteCache(
          buildOwnerOrganisationsCacheKey(existingOrganisation.owner_id),
        ),
      ]);
    } catch (error) {
      console.error("Organisation cache invalidation failed:", error);
    }
  }

  return result.rowCount > 0;
};

/**
 * Export organisation repository functions.
 */
module.exports = {
  createOrganisation,
  getOrganisationById,
  getOrganisationsByOwnerId,
  updateOrganisation,
  deleteOrganisation,
};

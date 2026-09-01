/**
 * Organisation Repository
 *
 * Purpose:
 * Handles direct database operations for organisations.
 *
 * In our SaaS architecture, an organisation represents a tenant.
 * Products, suppliers, branches, purchases, inventory, and other
 * organisation-owned data are associated with an organisation.
 *
 * The repository is responsible only for database access.
 * Tenant authorization and business rules belong to the service layer.
 */

const { pool } = require("../db/connection");

/**
 * Create a new organisation.
 *
 * ownerId identifies the user who owns the organisation.
 *
 * The service layer should verify that the caller is allowed to
 * create an organisation before calling this function.
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

  return result.rows[0];
};

/**
 * Get an organisation by its ID.
 *
 * @param {string} organisationId
 *
 * @returns {Object|null} Organisation or null if not found
 */
const getOrganisationById = async (organisationId) => {
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

  return result.rows[0] || null;
};

/**
 * Get organisations owned by a specific user.
 *
 * This query intentionally returns all matching organisations
 * rather than assuming that a user can own only one organisation.
 *
 * If the product requirements later enforce one organisation
 * per owner, that rule can be enforced separately.
 *
 * @param {string} ownerId
 *
 * @returns {Array} Organisations owned by the user
 */
const getOrganisationsByOwnerId = async (ownerId) => {
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

  return result.rows;
};

/**
 * Update an organisation's name.
 *
 * The service layer should verify that the requesting user
 * has permission to modify the organisation.
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

  return result.rows[0] || null;
};

/**
 * Delete an organisation.
 *
 * This operation should normally be protected by service-layer
 * authorization and business rules.
 *
 * The database foreign-key relationships determine what related
 * records can be deleted along with the organisation.
 *
 * @param {string} organisationId
 *
 * @returns {boolean} True if the organisation was deleted
 */
const deleteOrganisation = async (organisationId) => {
  const query = `
        DELETE FROM organisations
        WHERE id = $1
        RETURNING id;
    `;

  const result = await pool.query(query, [organisationId]);

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

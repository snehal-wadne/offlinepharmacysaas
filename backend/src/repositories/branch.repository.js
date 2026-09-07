/**
 * Branch Repository
 *
 * Purpose:
 * Provides database persistence logic for the branches table.
 */

const { pool } = require('../db/connection');

/**
 * Find all branches for a given organisation.
 * @param {string} organisationId - UUID of organisation
 */
const getBranchesByOrganisation = async (organisationId) => {
  const query = `
    SELECT 
      id,
      organisation_id,
      name,
      address,
      city,
      state,
      postal_code,
      phone,
      created_at,
      updated_at
    FROM branches
    WHERE organisation_id = $1
    ORDER BY created_at ASC;
  `;
  const result = await pool.query(query, [organisationId]);
  return result.rows;
};

/**
 * Get branch by ID.
 * @param {string} branchId - UUID of branch
 * @param {string} [organisationId] - Optional organisation filter
 */
const getBranchById = async (branchId, organisationId = null) => {
  let query = `
    SELECT 
      id,
      organisation_id,
      name,
      address,
      city,
      state,
      postal_code,
      phone,
      created_at,
      updated_at
    FROM branches
    WHERE id = $1
  `;
  const params = [branchId];

  if (organisationId) {
    query += ` AND organisation_id = $2`;
    params.push(organisationId);
  }

  const result = await pool.query(query, params);
  return result.rows[0] || null;
};

/**
 * Create a new branch.
 */
const createBranch = async ({ organisationId, name, address, city, state, postalCode, phone }) => {
  const query = `
    INSERT INTO branches (
      organisation_id,
      name,
      address,
      city,
      state,
      postal_code,
      phone
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;
  const values = [organisationId, name, address, city, state, postalCode, phone];
  const result = await pool.query(query, values);
  return result.rows[0];
};

/**
 * Update existing branch.
 */
const updateBranch = async (branchId, organisationId, updates) => {
  const { name, address, city, state, postalCode, phone } = updates;
  const query = `
    UPDATE branches
    SET
      name = COALESCE($3, name),
      address = COALESCE($4, address),
      city = COALESCE($5, city),
      state = COALESCE($6, state),
      postal_code = COALESCE($7, postal_code),
      phone = COALESCE($8, phone),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND organisation_id = $2
    RETURNING *;
  `;
  const values = [branchId, organisationId, name, address, city, state, postalCode, phone];
  const result = await pool.query(query, values);
  return result.rows[0] || null;
};

/**
 * Delete branch.
 */
const deleteBranch = async (branchId, organisationId) => {
  const query = `
    DELETE FROM branches
    WHERE id = $1 AND organisation_id = $2
    RETURNING *;
  `;
  const result = await pool.query(query, [branchId, organisationId]);
  return result.rows[0] || null;
};

module.exports = {
  getBranchesByOrganisation,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
};

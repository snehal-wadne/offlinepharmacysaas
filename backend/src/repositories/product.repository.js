/**
 * Product Repository
 *
 * Purpose:
 * Handles all direct database operations related to products.
 *
 * The repository layer is responsible for communicating with
 * PostgreSQL. It should not contain HTTP logic, request/response
 * handling, authentication logic, or business rules.
 *
 * Application flow:
 *
 * Controller
 *     ↓
 * Service
 *     ↓
 * Product Repository
 *     ↓
 * PostgreSQL
 */

const { pool } = require("../db/connection");

/**
 * Create a new product.
 *
 * A product belongs to an organisation, so organisation_id is
 * required. This ensures that products remain isolated between
 * tenants in our multi-tenant SaaS application.
 *
 * @param {Object} product
 * @param {string} product.organisationId
 * @param {string} product.medicineName
 * @param {string} product.brandName
 * @param {string} product.strength
 * @param {string} product.packSize
 * @param {string} product.manufacturer
 * @param {string} product.sku
 *
 * @returns {Object} The newly created product
 */
const createProduct = async ({
  organisationId,
  medicineName,
  brandName,
  strength,
  packSize,
  manufacturer,
  sku,
}) => {
  const query = `
        INSERT INTO products (
            organisation_id,
            medicine_name,
            brand_name,
            strength,
            pack_size,
            manufacturer,
            sku
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
            id,
            organisation_id,
            medicine_name,
            brand_name,
            strength,
            pack_size,
            manufacturer,
            sku,
            created_at,
            updated_at;
    `;

  const values = [
    organisationId,
    medicineName,
    brandName,
    strength,
    packSize,
    manufacturer,
    sku,
  ];

  const result = await pool.query(query, values);

  return result.rows[0];
};

/**
 * Find a product by its ID within a specific organisation.
 *
 * organisation_id is deliberately included in the WHERE clause.
 *
 * This is important for our multi-tenant architecture:
 *
 * organisation A must never be able to retrieve a product
 * belonging to organisation B simply by knowing its UUID.
 *
 * @param {string} organisationId
 * @param {string} productId
 *
 * @returns {Object|null} Product if found, otherwise null
 */
const getProductById = async (organisationId, productId) => {
  const query = `
        SELECT
            id,
            organisation_id,
            medicine_name,
            brand_name,
            strength,
            pack_size,
            manufacturer,
            sku,
            created_at,
            updated_at
        FROM products
        WHERE id = $1
          AND organisation_id = $2;
    `;

  const values = [productId, organisationId];

  const result = await pool.query(query, values);

  return result.rows[0] || null;
};

/**
 * Retrieve all products belonging to an organisation.
 *
 * Products are always filtered by organisation_id because the
 * application uses a shared database with tenant-level data
 * isolation.
 *
 * Pagination is supported so that the API does not attempt to
 * load thousands of products into memory at once.
 *
 * @param {string} organisationId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} List of products
 */
const getProductsByOrganisation = async (
  organisationId,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            id,
            organisation_id,
            medicine_name,
            brand_name,
            strength,
            pack_size,
            manufacturer,
            sku,
            created_at,
            updated_at
        FROM products
        WHERE organisation_id = $1
        ORDER BY medicine_name ASC, id ASC
        LIMIT $2
        OFFSET $3;
    `;

  const values = [organisationId, limit, offset];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Search products within an organisation.
 *
 * The search term is checked against commonly searchable
 * product fields:
 *
 * - medicine name
 * - brand name
 * - manufacturer
 * - SKU
 *
 * organisation_id remains part of the query to prevent
 * cross-organisation data access.
 *
 * @param {string} organisationId
 * @param {string} searchTerm
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Matching products
 */
const searchProducts = async (
  organisationId,
  searchTerm,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            id,
            organisation_id,
            medicine_name,
            brand_name,
            strength,
            pack_size,
            manufacturer,
            sku,
            created_at,
            updated_at
        FROM products
        WHERE organisation_id = $1
          AND (
                medicine_name ILIKE $2
                OR brand_name ILIKE $2
                OR manufacturer ILIKE $2
                OR sku ILIKE $2
          )
        ORDER BY medicine_name ASC, id ASC
        LIMIT $3
        OFFSET $4;
    `;

  const searchPattern = `%${searchTerm}%`;

  const values = [organisationId, searchPattern, limit, offset];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Update an existing product.
 *
 * The product is identified by both product_id and
 * organisation_id to maintain tenant isolation.
 *
 * updated_at is explicitly refreshed whenever the product
 * is modified.
 *
 * @param {string} organisationId
 * @param {string} productId
 * @param {Object} product
 *
 * @returns {Object|null} Updated product or null if not found
 */
const updateProduct = async (
  organisationId,
  productId,
  { medicineName, brandName, strength, packSize, manufacturer, sku },
) => {
  const query = `
        UPDATE products
        SET
            medicine_name = $1,
            brand_name = $2,
            strength = $3,
            pack_size = $4,
            manufacturer = $5,
            sku = $6,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
          AND organisation_id = $8
        RETURNING
            id,
            organisation_id,
            medicine_name,
            brand_name,
            strength,
            pack_size,
            manufacturer,
            sku,
            created_at,
            updated_at;
    `;

  const values = [
    medicineName,
    brandName,
    strength,
    packSize,
    manufacturer,
    sku,
    productId,
    organisationId,
  ];

  const result = await pool.query(query, values);

  return result.rows[0] || null;
};

/**
 * Delete a product.
 *
 * A product is deleted only when both its ID and organisation ID
 * match.
 *
 * IMPORTANT:
 * The service layer should determine whether deleting a product
 * is actually allowed. For example, a product that already has
 * inventory or purchase history may need to be deactivated
 * instead of physically deleted.
 *
 * The repository only performs the requested database operation.
 *
 * @param {string} organisationId
 * @param {string} productId
 *
 * @returns {boolean} True if a product was deleted
 */
const deleteProduct = async (organisationId, productId) => {
  const query = `
        DELETE FROM products
        WHERE id = $1
          AND organisation_id = $2
        RETURNING id;
    `;

  const values = [productId, organisationId];

  const result = await pool.query(query, values);

  return result.rowCount > 0;
};

/**
 * Export repository functions.
 *
 * Services can import these functions and use them without
 * needing to know the SQL implementation details.
 */
module.exports = {
  createProduct,
  getProductById,
  getProductsByOrganisation,
  searchProducts,
  updateProduct,
  deleteProduct,
};

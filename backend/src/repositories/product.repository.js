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
const { getCache, setCache, deleteCache } = require("../cache/cache");

// Cache TTL in seconds. Redis is a temporary read cache.
// The TTL provides fallback protection against stale data
// if cache invalidation is missed for any reason.
const PRODUCT_CACHE_TTL = 60;

// Tenant-safe cache key: the organisation_id is embedded so that
// one tenant can never retrieve another tenant's cached product.
const buildProductCacheKey = (organisationId, productId) =>
  `organisation:${organisationId}:product:${productId}`;

/**
 * Create a new product.
 *
 * A product belongs to an organisation, so organisation_id is
 * required. Category describes what type of product this is.
 *
 * @param {Object} product
 * @param {string} product.organisationId
 * @param {string} product.category
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
  category,
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
            category,
            medicine_name,
            brand_name,
            strength,
            pack_size,
            manufacturer,
            sku
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
            id,
            organisation_id,
            category,
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
    category,
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
  const cacheKey = buildProductCacheKey(organisationId, productId);

  // Cache-aside read: check Redis first so we can skip PostgreSQL
  // entirely on a cache hit.
  try {
    const cachedProduct = await getCache(cacheKey);

    if (cachedProduct) {
      return cachedProduct;
    }
  } catch (cacheError) {
    // Redis is an optimisation, not a requirement. A cache failure
    // must never block a valid database read.
    console.error("Cache read failed for getProductById:", cacheError.message);
  }

  const query = `
        SELECT
            id,
            organisation_id,
            category,
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

  const product = result.rows[0] || null;

  // Only cache positive results.
  if (product) {
    try {
      await setCache(cacheKey, product, PRODUCT_CACHE_TTL);
    } catch (cacheError) {
      // A failed cache write is non-fatal because PostgreSQL
      // already provided the authoritative result.
      console.error(
        "Cache write failed for getProductById:",
        cacheError.message,
      );
    }
  }

  return product;
};

/**
 * Retrieve all products belonging to an organisation.
 *
 * Products are always filtered by organisation_id because the
 * application uses a shared database with tenant-level isolation.
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
            category,
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
 * product fields, including category.
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
            category,
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
                category ILIKE $2
                OR medicine_name ILIKE $2
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
 * @param {string} organisationId
 * @param {string} productId
 * @param {Object} product
 *
 * @returns {Object|null} Updated product or null if not found
 */
const updateProduct = async (
  organisationId,
  productId,
  { category, medicineName, brandName, strength, packSize, manufacturer, sku },
) => {
  const query = `
        UPDATE products
        SET
            category = $1,
            medicine_name = $2,
            brand_name = $3,
            strength = $4,
            pack_size = $5,
            manufacturer = $6,
            sku = $7,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
          AND organisation_id = $9
        RETURNING
            id,
            organisation_id,
            category,
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
    category,
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

  const updatedProduct = result.rows[0] || null;

  // PostgreSQL is the source of truth. Invalidate the cached
  // product after a successful update so the next read obtains
  // the latest category and product information.
  if (updatedProduct) {
    const cacheKey = buildProductCacheKey(organisationId, productId);

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for updateProduct:",
        cacheError.message,
      );
    }
  }

  return updatedProduct;
};

/**
 * Delete a product.
 *
 * The service layer should determine whether deleting a product
 * is actually allowed. For example, a product that already has
 * inventory or purchase history may need to be deactivated
 * instead of physically deleted.
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

  const deleted = result.rowCount > 0;

  // Invalidate the corresponding Redis entry after a successful
  // PostgreSQL deletion.
  if (deleted) {
    const cacheKey = buildProductCacheKey(organisationId, productId);

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for deleteProduct:",
        cacheError.message,
      );
    }
  }

  return deleted;
};

/**
 * Export repository functions.
 */
module.exports = {
  createProduct,
  getProductById,
  getProductsByOrganisation,
  searchProducts,
  updateProduct,
  deleteProduct,
};

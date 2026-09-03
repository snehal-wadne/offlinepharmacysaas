/**
 * Purchase Repository
 *
 * Purpose:
 * Handles direct database operations related to purchases
 * and purchase items.
 *
 * A purchase consists of:
 *
 *     purchases
 *          ↓
 *     purchase_items
 *
 * PostgreSQL remains the source of truth.
 * Redis is used only as a short-lived cache for individual
 * purchase lookups.
 *
 * Business rules such as:
 *
 * - whether the user can create a purchase
 * - whether the supplier is active
 * - whether the branch belongs to the organisation
 * - whether a purchase can be cancelled
 * - whether a purchase can be edited after receiving goods
 * - when inventory should be increased
 *
 * belong to the service layer.
 */

const { pool } = require("../db/connection");

const { getCache, setCache, deleteCache } = require("../cache/cache");

const PURCHASE_CACHE_TTL = 60;

const buildPurchaseCacheKey = (organisationId, purchaseId) =>
  `organisation:${organisationId}:purchase:${purchaseId}`;

/**
 * Create a purchase together with its purchase items.
 *
 * The purchase header and all purchase items are inserted
 * inside a single PostgreSQL transaction.
 *
 * This prevents partially-created purchases.
 *
 * IMPORTANT:
 * Creating a purchase does NOT modify inventory.
 * Inventory is updated later when goods are received.
 *
 * @param {Object} purchase
 * @param {string} purchase.organisationId
 * @param {string} purchase.purchaseNumber
 * @param {string} purchase.supplierId
 * @param {string} purchase.branchId
 * @param {string} purchase.orderDate
 * @param {string|null} purchase.expectedDate
 * @param {string} purchase.status
 * @param {string|null} purchase.notes
 * @param {string|null} purchase.createdBy
 * @param {Array<Object>} purchase.items
 *
 * @returns {Object} Created purchase with its items
 */
const createPurchase = async ({
  organisationId,
  purchaseNumber,
  supplierId,
  branchId,
  orderDate,
  expectedDate = null,
  status = "PENDING",
  notes = null,
  createdBy = null,
  items,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
     * Create the purchase header first.
     */
    const purchaseResult = await client.query(
      `
        INSERT INTO purchases (
            organisation_id,
            purchase_number,
            supplier_id,
            branch_id,
            order_date,
            expected_date,
            status,
            notes,
            created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING
            id,
            organisation_id,
            purchase_number,
            supplier_id,
            branch_id,
            order_date,
            expected_date,
            status,
            notes,
            created_by,
            created_at,
            updated_at;
      `,
      [
        organisationId,
        purchaseNumber,
        supplierId,
        branchId,
        orderDate,
        expectedDate,
        status,
        notes,
        createdBy,
      ],
    );

    const purchase = purchaseResult.rows[0];

    /*
     * Insert each product ordered in this purchase into the
     * separate purchase_items table.
     */
    const createdItems = [];

    for (const item of items) {
      const itemResult = await client.query(
        `
          INSERT INTO purchase_items (
              purchase_id,
              product_id,
              ordered_quantity,
              unit_cost,
              tax_amount,
              discount_amount
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING
              id,
              purchase_id,
              product_id,
              ordered_quantity,
              unit_cost,
              tax_amount,
              discount_amount,
              created_at,
              updated_at;
        `,
        [
          purchase.id,
          item.productId,
          item.orderedQuantity,
          item.unitCost,
          item.taxAmount ?? 0,
          item.discountAmount ?? 0,
        ],
      );

      createdItems.push(itemResult.rows[0]);
    }

    await client.query("COMMIT");

    return {
      ...purchase,
      items: createdItems,
    };
  } catch (error) {
    /*
     * If anything fails, undo the purchase and every item
     * created during this transaction.
     */
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get a purchase by ID.
 *
 * Redis is checked first. On a cache miss, PostgreSQL is
 * queried and the result is stored in Redis for a short period.
 *
 * Both purchase ID and organisation ID are used for tenant
 * isolation in the database query and cache key.
 *
 * @param {string} organisationId
 * @param {string} purchaseId
 *
 * @returns {Object|null} Purchase or null if not found
 */
const getPurchaseById = async (organisationId, purchaseId) => {
  const cacheKey = buildPurchaseCacheKey(organisationId, purchaseId);

  /*
   * Redis is an optimisation only. If Redis is unavailable,
   * continue with PostgreSQL.
   */
  try {
    const cachedPurchase = await getCache(cacheKey);

    if (cachedPurchase !== null) {
      return cachedPurchase;
    }
  } catch (error) {
    console.error("Purchase cache read failed:", error.message);
  }

  const query = `
    SELECT
        p.id,
        p.organisation_id,
        p.purchase_number,
        p.supplier_id,
        s.name AS supplier_name,
        p.branch_id,
        b.name AS branch_name,
        p.order_date,
        p.expected_date,
        p.status,
        p.notes,
        p.created_by,
        u.name AS created_by_name,
        p.created_at,
        p.updated_at
    FROM purchases p
    INNER JOIN suppliers s
        ON s.id = p.supplier_id
    INNER JOIN branches b
        ON b.id = p.branch_id
    LEFT JOIN users u
        ON u.id = p.created_by
    WHERE p.id = $1
      AND p.organisation_id = $2;
  `;

  const result = await pool.query(query, [purchaseId, organisationId]);

  const purchase = result.rows[0] || null;

  /*
   * Do not cache missing purchases.
   */
  if (purchase !== null) {
    try {
      await setCache(cacheKey, purchase, PURCHASE_CACHE_TTL);
    } catch (error) {
      console.error("Purchase cache write failed:", error.message);
    }
  }

  return purchase;
};

/**
 * Get all items belonging to a purchase.
 *
 * Product information is joined so the caller receives the
 * medicine details together with the ordered quantity and cost.
 *
 * @param {string} organisationId
 * @param {string} purchaseId
 *
 * @returns {Object[]} Purchase items
 */
const getPurchaseItems = async (organisationId, purchaseId) => {
  const query = `
    SELECT
        pi.id,
        pi.purchase_id,
        pi.product_id,
        p.medicine_name,
        p.brand_name,
        p.strength,
        p.pack_size,
        p.manufacturer,
        p.sku,
        pi.ordered_quantity,
        pi.unit_cost,
        pi.tax_amount,
        pi.discount_amount,
        pi.created_at,
        pi.updated_at
    FROM purchase_items pi
    INNER JOIN purchases purchase
        ON purchase.id = pi.purchase_id
    INNER JOIN products p
        ON p.id = pi.product_id
    WHERE pi.purchase_id = $1
      AND purchase.organisation_id = $2
    ORDER BY p.medicine_name ASC, pi.id ASC;
  `;

  const result = await pool.query(query, [purchaseId, organisationId]);

  return result.rows;
};

/**
 * Get purchases belonging to an organisation.
 *
 * Pagination is intentionally kept database-backed because
 * purchase creation, updates and deletes can affect different
 * pages of the result.
 *
 * @param {string} organisationId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Purchases
 */
const getPurchasesByOrganisation = async (
  organisationId,
  limit = 50,
  offset = 0,
) => {
  const query = `
    SELECT
        p.id,
        p.organisation_id,
        p.purchase_number,
        p.supplier_id,
        s.name AS supplier_name,
        p.branch_id,
        b.name AS branch_name,
        p.order_date,
        p.expected_date,
        p.status,
        p.notes,
        p.created_by,
        u.name AS created_by_name,
        p.created_at,
        p.updated_at
    FROM purchases p
    INNER JOIN suppliers s
        ON s.id = p.supplier_id
    INNER JOIN branches b
        ON b.id = p.branch_id
    LEFT JOIN users u
        ON u.id = p.created_by
    WHERE p.organisation_id = $1
    ORDER BY p.order_date DESC, p.created_at DESC
    LIMIT $2
    OFFSET $3;
  `;

  const result = await pool.query(query, [organisationId, limit, offset]);

  return result.rows;
};

/**
 * Get purchases associated with a particular branch.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Purchases for the branch
 */
const getPurchasesByBranch = async (
  organisationId,
  branchId,
  limit = 50,
  offset = 0,
) => {
  const query = `
    SELECT
        p.id,
        p.organisation_id,
        p.purchase_number,
        p.supplier_id,
        s.name AS supplier_name,
        p.branch_id,
        b.name AS branch_name,
        p.order_date,
        p.expected_date,
        p.status,
        p.notes,
        p.created_by,
        u.name AS created_by_name,
        p.created_at,
        p.updated_at
    FROM purchases p
    INNER JOIN suppliers s
        ON s.id = p.supplier_id
    INNER JOIN branches b
        ON b.id = p.branch_id
    LEFT JOIN users u
        ON u.id = p.created_by
    WHERE p.organisation_id = $1
      AND p.branch_id = $2
    ORDER BY p.order_date DESC, p.created_at DESC
    LIMIT $3
    OFFSET $4;
  `;

  const result = await pool.query(query, [
    organisationId,
    branchId,
    limit,
    offset,
  ]);

  return result.rows;
};

/**
 * Get purchases from a particular supplier.
 *
 * @param {string} organisationId
 * @param {string} supplierId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Purchases from the supplier
 */
const getPurchasesBySupplier = async (
  organisationId,
  supplierId,
  limit = 50,
  offset = 0,
) => {
  const query = `
    SELECT
        p.id,
        p.organisation_id,
        p.purchase_number,
        p.supplier_id,
        s.name AS supplier_name,
        p.branch_id,
        b.name AS branch_name,
        p.order_date,
        p.expected_date,
        p.status,
        p.notes,
        p.created_by,
        u.name AS created_by_name,
        p.created_at,
        p.updated_at
    FROM purchases p
    INNER JOIN suppliers s
        ON s.id = p.supplier_id
    INNER JOIN branches b
        ON b.id = p.branch_id
    LEFT JOIN users u
        ON u.id = p.created_by
    WHERE p.organisation_id = $1
      AND p.supplier_id = $2
    ORDER BY p.order_date DESC, p.created_at DESC
    LIMIT $3
    OFFSET $4;
  `;

  const result = await pool.query(query, [
    organisationId,
    supplierId,
    limit,
    offset,
  ]);

  return result.rows;
};

/**
 * Search purchases within an organisation.
 *
 * Searches against:
 *
 * - purchase number
 * - supplier name
 * - branch name
 *
 * @param {string} organisationId
 * @param {string} searchTerm
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Matching purchases
 */
const searchPurchases = async (
  organisationId,
  searchTerm,
  limit = 50,
  offset = 0,
) => {
  const query = `
    SELECT
        p.id,
        p.organisation_id,
        p.purchase_number,
        p.supplier_id,
        s.name AS supplier_name,
        p.branch_id,
        b.name AS branch_name,
        p.order_date,
        p.expected_date,
        p.status,
        p.notes,
        p.created_by,
        u.name AS created_by_name,
        p.created_at,
        p.updated_at
    FROM purchases p
    INNER JOIN suppliers s
        ON s.id = p.supplier_id
    INNER JOIN branches b
        ON b.id = p.branch_id
    LEFT JOIN users u
        ON u.id = p.created_by
    WHERE p.organisation_id = $1
      AND (
            p.purchase_number ILIKE $2
            OR s.name ILIKE $2
            OR b.name ILIKE $2
      )
    ORDER BY p.order_date DESC, p.created_at DESC
    LIMIT $3
    OFFSET $4;
  `;

  const searchPattern = `%${searchTerm}%`;

  const result = await pool.query(query, [
    organisationId,
    searchPattern,
    limit,
    offset,
  ]);

  return result.rows;
};

/**
 * Update the status of a purchase.
 *
 * The service layer should determine whether the requested
 * status transition is valid.
 *
 * Valid statuses are defined by the database schema:
 *
 *     DRAFT
 *     PENDING
 *     APPROVED
 *     PARTIALLY_RECEIVED
 *     RECEIVED
 *     CANCELLED
 *
 * PostgreSQL is updated first. The individual purchase cache
 * is invalidated only after the update succeeds.
 *
 * @param {string} organisationId
 * @param {string} purchaseId
 * @param {string} status
 *
 * @returns {Object|null} Updated purchase
 */
const updatePurchaseStatus = async (organisationId, purchaseId, status) => {
  const query = `
    UPDATE purchases
    SET
        status = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
      AND organisation_id = $3
    RETURNING
        id,
        organisation_id,
        purchase_number,
        supplier_id,
        branch_id,
        order_date,
        expected_date,
        status,
        notes,
        created_by,
        created_at,
        updated_at;
  `;

  const result = await pool.query(query, [status, purchaseId, organisationId]);

  const updatedPurchase = result.rows[0] || null;

  if (updatedPurchase !== null) {
    try {
      await deleteCache(buildPurchaseCacheKey(organisationId, purchaseId));
    } catch (error) {
      console.error("Purchase cache invalidation failed:", error.message);
    }
  }

  return updatedPurchase;
};

/**
 * Delete a purchase.
 *
 * purchase_items references purchases with ON DELETE CASCADE,
 * so deleting a purchase also removes its purchase items.
 *
 * The purchase cache is invalidated only after the database
 * delete succeeds.
 *
 * @param {string} organisationId
 * @param {string} purchaseId
 *
 * @returns {boolean} True if the purchase was deleted
 */
const deletePurchase = async (organisationId, purchaseId) => {
  const query = `
    DELETE FROM purchases
    WHERE id = $1
      AND organisation_id = $2
    RETURNING id;
  `;

  const result = await pool.query(query, [purchaseId, organisationId]);

  const deleted = result.rowCount > 0;

  if (deleted) {
    try {
      await deleteCache(buildPurchaseCacheKey(organisationId, purchaseId));
    } catch (error) {
      console.error("Purchase cache invalidation failed:", error.message);
    }
  }

  return deleted;
};

/**
 * Get purchases with optional filters.
 *
 * This remains database-backed because every combination of
 * filters, pagination and sorting can produce a different result.
 *
 * @param {string} organisationId
 * @param {Object} filters
 * @returns {Object[]} Matching purchases
 */
const getPurchasesWithFilters = async (
  organisationId,
  {
    status = null,
    search = null,
    branchId = null,
    supplierId = null,
    limit = 50,
    offset = 0,
  } = {},
) => {
  const params = [organisationId];
  let paramCount = 1;

  let query = `
    SELECT
        p.id,
        p.organisation_id,
        p.purchase_number,
        p.supplier_id,
        s.name AS supplier_name,
        p.branch_id,
        b.name AS branch_name,
        p.order_date,
        p.expected_date,
        p.status,
        p.notes,
        p.created_by,
        u.name AS created_by_name,
        p.created_at,
        p.updated_at,
        COALESCE(
          SUM(
            pi.ordered_quantity * pi.unit_cost
            + pi.tax_amount
            - pi.discount_amount
          ),
          0
        ) AS total_amount,
        COUNT(pi.id)::INT AS items_count
    FROM purchases p
    INNER JOIN suppliers s
        ON s.id = p.supplier_id
    INNER JOIN branches b
        ON b.id = p.branch_id
    LEFT JOIN users u
        ON u.id = p.created_by
    LEFT JOIN purchase_items pi
        ON pi.purchase_id = p.id
    WHERE p.organisation_id = $1
  `;

  if (status && status !== "All Statuses") {
    paramCount++;

    query += `
      AND UPPER(p.status) = UPPER($${paramCount})
    `;

    params.push(status);
  }

  if (branchId) {
    paramCount++;

    query += `
      AND p.branch_id = $${paramCount}
    `;

    params.push(branchId);
  }

  if (supplierId) {
    paramCount++;

    query += `
      AND p.supplier_id = $${paramCount}
    `;

    params.push(supplierId);
  }

  if (search && search.trim()) {
    paramCount++;

    query += `
      AND (
        p.purchase_number ILIKE $${paramCount}
        OR s.name ILIKE $${paramCount}
        OR b.name ILIKE $${paramCount}
      )
    `;

    params.push(`%${search.trim()}%`);
  }

  query += `
    GROUP BY
        p.id,
        s.name,
        b.name,
        u.name
    ORDER BY
        p.order_date DESC,
        p.created_at DESC
    LIMIT $${paramCount + 1}
    OFFSET $${paramCount + 2};
  `;

  params.push(limit, offset);

  const result = await pool.query(query, params);

  return result.rows;
};

/**
 * Export purchase repository functions.
 */
module.exports = {
  createPurchase,
  getPurchaseById,
  getPurchaseItems,
  getPurchasesByOrganisation,
  getPurchasesByBranch,
  getPurchasesBySupplier,
  searchPurchases,
  updatePurchaseStatus,
  deletePurchase,
  getPurchasesWithFilters,
};

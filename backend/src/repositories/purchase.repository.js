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
 * The purchase table stores the purchase/order information,
 * while purchase_items stores the individual products ordered.
 *
 * Example:
 *
 *     Purchase PO-0001
 *          │
 *          ├── Paracetamol 650mg × 100
 *          ├── Amoxicillin 500mg × 50
 *          └── Cetirizine 10mg × 75
 *
 * The repository is responsible for database persistence.
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

/**
 * Create a purchase together with its purchase items.
 *
 * The purchase header and all purchase items are inserted
 * inside a single PostgreSQL transaction.
 *
 * This prevents partially-created purchases.
 *
 * For example, if the purchase has three items and the third
 * item fails to insert, the purchase and the first two items
 * are rolled back as well.
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
  status = "DRAFT",
  notes = null,
  createdBy = null,
  items,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
     * Create the purchase header.
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
     * Insert each product ordered in this purchase.
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
    /*
     * Return the database connection to the pool.
     */
    client.release();
  }
};

/**
 * Get a purchase by ID.
 *
 * organisation_id is included to maintain tenant isolation.
 *
 * Supplier, branch and creator information are included so
 * callers can display useful purchase information without
 * making additional queries.
 *
 * @param {string} organisationId
 * @param {string} purchaseId
 *
 * @returns {Object|null} Purchase or null if not found
 */
const getPurchaseById = async (organisationId, purchaseId) => {
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

  return result.rows[0] || null;
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
 * This is useful for the main purchase listing screen.
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
 * This is useful when viewing a supplier's purchase history.
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
 * Example:
 *
 *     DRAFT → ORDERED
 *     ORDERED → PARTIALLY_RECEIVED
 *     PARTIALLY_RECEIVED → RECEIVED
 *
 * The repository only persists the requested status.
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

  return result.rows[0] || null;
};

/**
 * Delete a purchase.
 *
 * purchase_items references purchases with ON DELETE CASCADE,
 * so deleting a purchase also removes its purchase items.
 *
 * Whether deletion is allowed should be decided by the
 * service layer.
 *
 * For example, a purchase that has already been received should
 * normally not be physically deleted.
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

  return result.rowCount > 0;
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
};

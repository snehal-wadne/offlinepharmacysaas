/**
 * Stock Transfer Repository
 *
 * Purpose:
 * Handles direct database operations related to stock transfers
 * and their transfer items.
 *
 * A stock transfer consists of:
 *
 *     stock_transfers
 *          ↓
 *     stock_transfer_items
 *
 * The transfer table stores information about the movement,
 * while transfer items specify which inventory batches and
 * quantities are included in that transfer.
 *
 * The repository is responsible for database persistence.
 *
 * Business rules such as:
 *
 * - whether the user is allowed to transfer stock
 * - whether enough stock is available
 * - whether the source and destination branches are valid
 * - when inventory quantities should be decreased/increased
 * - which transfer statuses are allowed
 *
 * belong to the service layer.
 */

const { pool } = require("../db/connection");

const { getCache, setCache, deleteCache } = require("../cache/cache");

const STOCK_TRANSFER_CACHE_TTL = 60;

/**
 * Build the Redis key for a stock transfer.
 *
 * The organisation ID is part of the key so that the same
 * transfer ID can never accidentally resolve to another
 * organisation's cached data.
 *
 * @param {string} organisationId
 * @param {string} transferId
 *
 * @returns {string} Redis cache key
 */
const buildStockTransferCacheKey = (organisationId, transferId) =>
  `organisation:${organisationId}:stock-transfer:${transferId}`;

/**
 * Create a stock transfer together with all of its items.
 *
 * The transfer header and all transfer items are created inside
 * one PostgreSQL transaction.
 *
 * This guarantees that we don't end up with:
 *
 *     transfer created
 *     item 1 created
 *     item 2 failed
 *
 * Instead, either everything is committed or everything is
 * rolled back.
 *
 * @param {Object} transfer
 * @param {string} transfer.organisationId
 * @param {string} transfer.fromBranchId
 * @param {string} transfer.toBranchId
 * @param {string} transfer.transferDate
 * @param {string} transfer.status
 * @param {string} transfer.transferNumber
 * @param {string|null} transfer.notes
 * @param {string|null} transfer.createdBy
 * @param {Array<Object>} transfer.items
 *
 * @returns {Object} Created transfer with its items
 */
const createStockTransfer = async ({
  organisationId,
  fromBranchId,
  toBranchId,
  transferDate,
  status = "DRAFT",
  transferNumber,
  notes = null,
  createdBy = null,
  items,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
     * Create the transfer header first.
     */
    const transferResult = await client.query(
      `
        INSERT INTO stock_transfers (
            organisation_id,
            from_branch_id,
            to_branch_id,
            transfer_date,
            status,
            transfer_number,
            notes,
            created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
            id,
            organisation_id,
            from_branch_id,
            to_branch_id,
            transfer_date,
            status,
            transfer_number,
            notes,
            created_by,
            created_at,
            updated_at;
      `,
      [
        organisationId,
        fromBranchId,
        toBranchId,
        transferDate,
        status,
        transferNumber,
        notes,
        createdBy,
      ],
    );

    const transfer = transferResult.rows[0];

    /*
     * Insert every item using the newly created transfer ID.
     */
    const createdItems = [];

    for (const item of items) {
      const itemResult = await client.query(
        `
          INSERT INTO stock_transfer_items (
              transfer_id,
              inventory_batch_id,
              quantity
          )
          VALUES ($1, $2, $3)
          RETURNING
              id,
              transfer_id,
              inventory_batch_id,
              quantity,
              created_at;
        `,
        [transfer.id, item.inventoryBatchId, item.quantity],
      );

      createdItems.push(itemResult.rows[0]);
    }

    await client.query("COMMIT");

    return {
      ...transfer,
      items: createdItems,
    };
  } catch (error) {
    /*
     * If either the transfer or any of its items fails,
     * none of the changes should remain in the database.
     */
    await client.query("ROLLBACK");

    throw error;
  } finally {
    /*
     * Release the client back to the connection pool.
     */
    client.release();
  }
};

/**
 * Get a stock transfer by ID.
 *
 * Redis is checked first. PostgreSQL remains the source of
 * truth and is queried when the cache does not contain the
 * requested transfer.
 *
 * The organisation ID is included in both the database query
 * and Redis key to maintain tenant isolation.
 *
 * @param {string} organisationId
 * @param {string} transferId
 *
 * @returns {Object|null} Transfer or null if not found
 */
const getStockTransferById = async (organisationId, transferId) => {
  const cacheKey = buildStockTransferCacheKey(organisationId, transferId);

  /*
   * Redis is an optimization only.
   * If Redis is unavailable, continue with PostgreSQL.
   */
  try {
    const cachedTransfer = await getCache(cacheKey);

    if (cachedTransfer !== null) {
      return cachedTransfer;
    }
  } catch (cacheError) {
    console.error(
      "Cache read failed for getStockTransferById:",
      cacheError.message,
    );
  }

  const query = `
    SELECT
        st.id,
        st.organisation_id,
        st.from_branch_id,
        fb.name AS from_branch_name,
        st.to_branch_id,
        tb.name AS to_branch_name,
        st.transfer_date,
        st.status,
        st.transfer_number,
        st.notes,
        st.created_by,
        u.name AS created_by_name,
        st.created_at,
        st.updated_at
    FROM stock_transfers st
    INNER JOIN branches fb
        ON fb.id = st.from_branch_id
    INNER JOIN branches tb
        ON tb.id = st.to_branch_id
    LEFT JOIN users u
        ON u.id = st.created_by
    WHERE st.id = $1
      AND st.organisation_id = $2;
  `;

  const result = await pool.query(query, [transferId, organisationId]);

  const transfer = result.rows[0] || null;

  /*
   * Only cache transfers that actually exist.
   * Redis failures must never make the repository operation fail.
   */
  if (transfer) {
    try {
      await setCache(cacheKey, transfer, STOCK_TRANSFER_CACHE_TTL);
    } catch (cacheError) {
      console.error(
        "Cache write failed for getStockTransferById:",
        cacheError.message,
      );
    }
  }

  return transfer;
};

/**
 * Get all items belonging to a stock transfer.
 *
 * Product, batch and supplier information is joined so that
 * the caller receives useful information for displaying the
 * transfer details.
 *
 * @param {string} organisationId
 * @param {string} transferId
 *
 * @returns {Object[]} Transfer items
 */
const getStockTransferItems = async (organisationId, transferId) => {
  const query = `
    SELECT
        sti.id,
        sti.transfer_id,
        sti.inventory_batch_id,
        p.id AS product_id,
        p.medicine_name,
        p.brand_name,
        p.strength,
        p.pack_size,
        ib.batch_number,
        s.id AS supplier_id,
        s.name AS supplier_name,
        sti.quantity,
        sti.created_at
    FROM stock_transfer_items sti
    INNER JOIN stock_transfers st
        ON st.id = sti.transfer_id
    INNER JOIN inventory_batches ib
        ON ib.id = sti.inventory_batch_id
    INNER JOIN products p
        ON p.id = ib.product_id
    INNER JOIN suppliers s
        ON s.id = ib.supplier_id
    WHERE sti.transfer_id = $1
      AND st.organisation_id = $2
    ORDER BY p.medicine_name ASC, sti.id ASC;
  `;

  const result = await pool.query(query, [transferId, organisationId]);

  return result.rows;
};

/**
 * Get stock transfers associated with a branch.
 *
 * A transfer is relevant to a branch when the branch is either
 * the source or destination.
 *
 * This method intentionally remains database-backed rather than
 * cached because branch transfer lists are more difficult to
 * invalidate correctly after every transfer change.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Stock transfers
 */
const getStockTransfersByBranch = async (
  organisationId,
  branchId,
  limit = 50,
  offset = 0,
) => {
  const query = `
    SELECT
        st.id,
        st.organisation_id,
        st.from_branch_id,
        fb.name AS from_branch_name,
        st.to_branch_id,
        tb.name AS to_branch_name,
        st.transfer_date,
        st.status,
        st.transfer_number,
        st.notes,
        st.created_by,
        u.name AS created_by_name,
        st.created_at,
        st.updated_at
    FROM stock_transfers st
    INNER JOIN branches fb
        ON fb.id = st.from_branch_id
    INNER JOIN branches tb
        ON tb.id = st.to_branch_id
    LEFT JOIN users u
        ON u.id = st.created_by
    WHERE st.organisation_id = $1
      AND (
            st.from_branch_id = $2
            OR st.to_branch_id = $2
      )
    ORDER BY st.transfer_date DESC, st.created_at DESC
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
 * Update the status of a stock transfer.
 *
 * The service layer should determine whether the requested
 * status transition is valid.
 *
 * For example:
 *
 *     DRAFT → IN_TRANSIT
 *     IN_TRANSIT → COMPLETED
 *
 * The repository simply persists the new status.
 *
 * After PostgreSQL is successfully updated, the individual
 * Redis cache entry is invalidated so the next read gets the
 * fresh status from PostgreSQL.
 *
 * @param {string} organisationId
 * @param {string} transferId
 * @param {string} status
 *
 * @returns {Object|null} Updated transfer
 */
const updateStockTransferStatus = async (
  organisationId,
  transferId,
  status,
) => {
  const query = `
    UPDATE stock_transfers
    SET
        status = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
      AND organisation_id = $3
    RETURNING
        id,
        organisation_id,
        from_branch_id,
        to_branch_id,
        transfer_date,
        status,
        transfer_number,
        notes,
        created_by,
        created_at,
        updated_at;
  `;

  const result = await pool.query(query, [status, transferId, organisationId]);

  const updatedTransfer = result.rows[0] || null;

  /*
   * PostgreSQL has already been updated.
   * Remove the old cached representation.
   */
  if (updatedTransfer) {
    const cacheKey = buildStockTransferCacheKey(organisationId, transferId);

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for updateStockTransferStatus:",
        cacheError.message,
      );
    }
  }

  return updatedTransfer;
};

/**
 * Delete a stock transfer.
 *
 * Because stock_transfer_items references the transfer with
 * ON DELETE CASCADE, deleting the transfer also deletes its
 * associated items.
 *
 * After successful deletion, the Redis cache entry is removed.
 *
 * @param {string} organisationId
 * @param {string} transferId
 *
 * @returns {boolean} True if the transfer was deleted
 */
const deleteStockTransfer = async (organisationId, transferId) => {
  const query = `
    DELETE FROM stock_transfers
    WHERE id = $1
      AND organisation_id = $2
    RETURNING id;
  `;

  const result = await pool.query(query, [transferId, organisationId]);

  const deleted = result.rowCount > 0;

  /*
   * Invalidate the cache only when PostgreSQL actually deleted
   * the transfer.
   */
  if (deleted) {
    const cacheKey = buildStockTransferCacheKey(organisationId, transferId);

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for deleteStockTransfer:",
        cacheError.message,
      );
    }
  }

  return deleted;
};

/**
 * Export stock transfer repository functions.
 */
module.exports = {
  createStockTransfer,
  getStockTransferById,
  getStockTransferItems,
  getStockTransfersByBranch,
  updateStockTransferStatus,
  deleteStockTransfer,
};

/**
 * Held Bill Repository
 *
 * Purpose:
 * Provides PostgreSQL persistence and cache management for the `held_bills` table.
 * Stores parked POS draft carts as JSONB snapshots without prematurely creating finalized invoices.
 *
 * Key Constraints:
 * - Number sequence: branch-scoped `HELD_BILL` (HB-1001).
 * - Supported statuses: 'HOLD', 'PENDING_PRESCRIPTION', 'AWAITING_PAYMENT', 'RESUMED', 'DISCARDED'.
 * - Non-destructive lifecycle: draft discard updates status to 'DISCARDED'.
 * - Multi-tenant isolation: strictly scoped by organisation_id and branch_id.
 * - Transaction client support: transaction clients bypass Redis.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");
const { getNextBusinessNumber } = require("./number-sequence.repository");

const HELD_BILL_CACHE_TTL = 60;

const VALID_HELD_BILL_STATUSES = [
  "HOLD",
  "PENDING_PRESCRIPTION",
  "AWAITING_PAYMENT",
  "RESUMED",
  "DISCARDED",
];

const HELD_BILL_COLUMNS = `
  id,
  organisation_id,
  branch_id,
  cash_register_session_id,
  held_by,
  hold_token,
  customer_id,
  customer_name,
  customer_phone,
  items_count,
  items_summary,
  subtotal,
  tax_amount,
  discount_percent,
  total_amount,
  cart_data,
  status,
  notes,
  created_at,
  updated_at
`;

/**
 * Cache key helpers.
 */
const buildHeldBillCacheKey = (organisationId, heldBillId) =>
  `organisation:${organisationId}:held-bill:${heldBillId}`;

const buildHeldBillListCacheKey = (organisationId, branchId, status = "all") =>
  `organisation:${organisationId}:branch:${branchId}:held-bills:list:status:${status}`;

/**
 * Invalidate held bill cache entries.
 */
const invalidateHeldBillCache = async (
  organisationId,
  branchId = null,
  heldBillId = null,
) => {
  const operations = [];

  if (heldBillId) {
    operations.push(
      deleteCache(buildHeldBillCacheKey(organisationId, heldBillId)),
    );
  }

  if (branchId) {
    for (const st of ["all", ...VALID_HELD_BILL_STATUSES]) {
      operations.push(
        deleteCache(buildHeldBillListCacheKey(organisationId, branchId, st)),
      );
    }
  }

  try {
    await Promise.all(operations);
  } catch (error) {
    console.error("Held bill cache invalidation error:", error.message);
  }
};

/**
 * Validate branch exists and belongs to organisation.
 */
const validateBranch = async (db, organisationId, branchId) => {
  const result = await db.query(
    `SELECT id FROM branches WHERE id = $1 AND organisation_id = $2;`,
    [branchId, organisationId],
  );
  if (result.rowCount === 0) {
    throw new Error("Branch not found in the specified organisation.");
  }
};

/**
 * Validate user exists and belongs to organisation.
 */
const validateHeldBy = async (db, organisationId, userId) => {
  const result = await db.query(
    `SELECT u.id
       FROM users u
       INNER JOIN organisation_memberships om ON om.user_id = u.id
       WHERE u.id = $1 AND om.organisation_id = $2 AND om.status = 'ACTIVE';`,
    [userId, organisationId],
  );
  if (result.rowCount === 0) {
    throw new Error(
      "User holding the bill is not an active member of the specified organisation.",
    );
  }
};

/**
 * Validate customer if provided.
 */
const validateCustomer = async (db, organisationId, customerId) => {
  if (!customerId) return;
  const result = await db.query(
    `SELECT id FROM customers WHERE id = $1 AND organisation_id = $2;`,
    [customerId, organisationId],
  );
  if (result.rowCount === 0) {
    throw new Error("Customer not found in the specified organisation.");
  }
};

/**
 * Validate session if provided.
 */
const validateSession = async (db, organisationId, branchId, sessionId) => {
  if (!sessionId) return;
  const result = await db.query(
    `SELECT id, branch_id FROM cash_register_sessions WHERE id = $1 AND organisation_id = $2;`,
    [sessionId, organisationId],
  );
  if (result.rowCount === 0) {
    throw new Error(
      "Cash register session not found in the specified organisation.",
    );
  }
  if (result.rows[0].branch_id !== branchId) {
    throw new Error(
      "Cash register session does not belong to the specified branch.",
    );
  }
};

/**
 * Create a new held bill (parked draft sale).
 *
 * @param {Object} data
 * @param {string} data.organisationId
 * @param {string} data.branchId
 * @param {string|null} [data.cashRegisterSessionId=null]
 * @param {string} data.heldBy
 * @param {string|null} [data.customerId=null]
 * @param {string} data.customerName
 * @param {string|null} [data.customerPhone=null]
 * @param {number} data.itemsCount
 * @param {string|null} [data.itemsSummary=null]
 * @param {number|string} data.subtotal
 * @param {number|string} [data.taxAmount=0]
 * @param {number|string} [data.discountPercent=0]
 * @param {number|string} data.totalAmount
 * @param {Object} data.cartData JSONB cart snapshot
 * @param {string} [data.status='HOLD']
 * @param {string|null} [data.notes=null]
 * @param {Object|null} [data.client=null]
 *
 * @returns {Promise<Object>} Created held bill
 */
const createHeldBill = async ({
  organisationId,
  branchId,
  cashRegisterSessionId = null,
  heldBy,
  customerId = null,
  customerName,
  customerPhone = null,
  itemsCount,
  itemsSummary = null,
  subtotal,
  taxAmount = 0,
  discountPercent = 0,
  totalAmount,
  cartData,
  status = "HOLD",
  notes = null,
  client = null,
}) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");
  if (!heldBy) throw new Error("heldBy is required.");
  if (!customerName || !customerName.trim())
    throw new Error("customerName is required.");
  if (
    !cartData ||
    typeof cartData !== "object" ||
    Array.isArray(cartData) ||
    !Array.isArray(cartData.items) ||
    cartData.items.length === 0
  ) {
    throw new Error("cartData must contain a non-empty items array.");
  }
  if (!VALID_HELD_BILL_STATUSES.includes(status)) {
    throw new Error(
      `Invalid status: ${status}. Permitted: ${VALID_HELD_BILL_STATUSES.join(", ")}`,
    );
  }

  // Validate each item in cartData
  for (const it of cartData.items) {
    if (!it || typeof it !== "object") {
      throw new Error("Each item in cartData.items must be an object.");
    }
    const qty = Number(it.qty !== undefined ? it.qty : it.quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new Error("Item quantity in cartData must be greater than 0.");
    }
  }

  // Finding 6: Make cart_data authoritative and prevent contradictory summary values
  let resolvedItemsCount = itemsCount;
  let resolvedSubtotal = subtotal;
  let resolvedTotal = totalAmount;
  let resolvedItemsSummary = itemsSummary;

  const derivedItemsCount = cartData.items.reduce(
    (acc, it) =>
      acc + (Number(it.qty !== undefined ? it.qty : it.quantity) || 1),
    0,
  );
  if (
    resolvedItemsCount !== undefined &&
    resolvedItemsCount !== null &&
    Number(resolvedItemsCount) !== derivedItemsCount
  ) {
    throw new Error("Provided itemsCount contradicts cart_data.");
  }
  resolvedItemsCount = derivedItemsCount;

  const derivedSubtotal = Number(
    cartData.items
      .reduce((acc, it) => {
        const lineTotal =
          it.lineTotal !== undefined
            ? Number(it.lineTotal)
            : (Number(it.unitPrice !== undefined ? it.unitPrice : it.price) ||
                0) * (Number(it.qty !== undefined ? it.qty : it.quantity) || 1);
        return acc + (isNaN(lineTotal) ? 0 : lineTotal);
      }, 0)
      .toFixed(2),
  );
  if (
    resolvedSubtotal !== undefined &&
    resolvedSubtotal !== null &&
    Math.abs(Number(resolvedSubtotal) - derivedSubtotal) > 0.05
  ) {
    throw new Error("Provided subtotal contradicts cart_data.");
  }
  resolvedSubtotal = derivedSubtotal;

  if (!resolvedItemsSummary && cartData.items.length > 0) {
    resolvedItemsSummary = cartData.items
      .map(
        (it) =>
          `${it.name || it.productName || "Item"} x${it.qty !== undefined ? it.qty : it.quantity || 1}`,
      )
      .join(", ");
  }

  if (cartData.total !== undefined && cartData.total !== null) {
    const cartTotal = Number(cartData.total);
    if (
      resolvedTotal !== undefined &&
      resolvedTotal !== null &&
      Math.abs(Number(resolvedTotal) - cartTotal) > 0.05
    ) {
      throw new Error("Provided totalAmount contradicts cart_data.");
    }
    resolvedTotal = cartTotal;
  } else {
    const discountVal = Number(
      (cartData.discounts && cartData.discounts.amount) ||
        (Number(resolvedSubtotal) * Number(discountPercent || 0)) / 100 ||
        0,
    );
    const expectedTotal = Number(
      (Number(resolvedSubtotal) + Number(taxAmount || 0) - discountVal).toFixed(
        2,
      ),
    );
    if (
      resolvedTotal !== undefined &&
      resolvedTotal !== null &&
      Math.abs(Number(resolvedTotal) - expectedTotal) > 0.05
    ) {
      throw new Error("Provided totalAmount contradicts cart_data.");
    }
    if (resolvedTotal === undefined || resolvedTotal === null) {
      resolvedTotal = expectedTotal;
    }
  }

  if (
    resolvedItemsCount === undefined ||
    resolvedItemsCount === null ||
    resolvedItemsCount < 0
  ) {
    throw new Error("itemsCount must be a non-negative integer.");
  }
  if (resolvedSubtotal === undefined || resolvedSubtotal === null)
    throw new Error("subtotal is required.");
  if (resolvedTotal === undefined || resolvedTotal === null)
    throw new Error("totalAmount is required.");

  let dbClient = client;
  let ownsTransaction = false;

  try {
    if (!dbClient) {
      dbClient = await pool.connect();
      ownsTransaction = true;
      await dbClient.query("BEGIN");
    }

    // Context validations
    await validateBranch(dbClient, organisationId, branchId);
    await validateHeldBy(dbClient, organisationId, heldBy);
    await validateCustomer(dbClient, organisationId, customerId);
    await validateSession(
      dbClient,
      organisationId,
      branchId,
      cashRegisterSessionId,
    );

    // Sequence token (HB-1001)
    const holdToken = await getNextBusinessNumber({
      organisationId,
      branchId,
      sequenceType: "HELD_BILL",
      client: dbClient,
    });

    const query = `
      INSERT INTO held_bills (
        organisation_id,
        branch_id,
        cash_register_session_id,
        held_by,
        hold_token,
        customer_id,
        customer_name,
        customer_phone,
        items_count,
        items_summary,
        subtotal,
        tax_amount,
        discount_percent,
        total_amount,
        cart_data,
        status,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING
        ${HELD_BILL_COLUMNS};
    `;

    const result = await dbClient.query(query, [
      organisationId,
      branchId,
      cashRegisterSessionId,
      heldBy,
      holdToken,
      customerId,
      customerName.trim(),
      customerPhone ? customerPhone.trim() : null,
      resolvedItemsCount,
      resolvedItemsSummary,
      Number(resolvedSubtotal),
      Number(taxAmount),
      Number(discountPercent),
      Number(resolvedTotal),
      JSON.stringify(cartData),
      status,
      notes,
    ]);

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    const created = result.rows[0];

    // Invalidate branch list cache
    await invalidateHeldBillCache(organisationId, branchId);

    return created;
  } catch (error) {
    if (ownsTransaction && dbClient) {
      try {
        await dbClient.query("ROLLBACK");
      } catch (rbErr) {
        console.error("Rollback error in createHeldBill:", rbErr.message);
      }
    }
    throw error;
  } finally {
    if (ownsTransaction && dbClient) {
      dbClient.release();
    }
  }
};

/**
 * Get a held bill by ID with tenant isolation.
 *
 * @param {Object} params
 * @param {string} params.organisationId
 * @param {string} params.branchId
 * @param {string} params.heldBillId
 * @param {Object|null} [params.client=null]
 *
 * @returns {Promise<Object|null>}
 */
const getHeldBillById = async ({
  organisationId,
  branchId,
  heldBillId,
  client = null,
}) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");
  if (!heldBillId) throw new Error("heldBillId is required.");

  const cacheKey = buildHeldBillCacheKey(organisationId, heldBillId);

  if (!client) {
    try {
      const cached = await getCache(cacheKey);
      if (cached) return cached;
    } catch (cacheErr) {
      console.error("Held bill cache read error:", cacheErr.message);
    }
  }

  const dbClient = client || pool;

  const query = `
    SELECT
      ${HELD_BILL_COLUMNS}
    FROM held_bills
    WHERE id = $1
      AND organisation_id = $2
      AND branch_id = $3;
  `;

  const result = await dbClient.query(query, [
    heldBillId,
    organisationId,
    branchId,
  ]);

  if (result.rowCount === 0) return null;

  const bill = result.rows[0];

  if (!client) {
    try {
      await setCache(cacheKey, bill, HELD_BILL_CACHE_TTL);
    } catch (cacheErr) {
      console.error("Held bill cache write error:", cacheErr.message);
    }
  }

  return bill;
};

/**
 * List held bills for a branch.
 *
 * @param {Object} params
 * @param {string} params.organisationId
 * @param {string} params.branchId
 * @param {string|null} [params.status=null]
 * @param {string|null} [params.sessionId=null]
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @param {Object|null} [params.client=null]
 *
 * @returns {Promise<Array<Object>>}
 */
const listHeldBills = async ({
  organisationId,
  branchId,
  status = null,
  sessionId = null,
  limit = 50,
  offset = 0,
  client = null,
}) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");

  const cacheKey = buildHeldBillListCacheKey(
    organisationId,
    branchId,
    status || "all",
  );

  if (!client && offset === 0 && limit === 50 && !sessionId) {
    try {
      const cached = await getCache(cacheKey);
      if (cached) return cached;
    } catch (cacheErr) {
      console.error("Held bills list cache read error:", cacheErr.message);
    }
  }

  const dbClient = client || pool;

  const conditions = ["organisation_id = $1", "branch_id = $2"];
  const params = [organisationId, branchId];
  let paramIndex = 3;

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (sessionId) {
    conditions.push(`cash_register_session_id = $${paramIndex}`);
    params.push(sessionId);
    paramIndex++;
  }

  params.push(limit, offset);
  const limitPlaceholder = `$${paramIndex}`;
  const offsetPlaceholder = `$${paramIndex + 1}`;

  const query = `
    SELECT
      ${HELD_BILL_COLUMNS}
    FROM held_bills
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder};
  `;

  const result = await dbClient.query(query, params);
  const rows = result.rows;

  if (!client && offset === 0 && limit === 50 && !sessionId) {
    try {
      await setCache(cacheKey, rows, HELD_BILL_CACHE_TTL);
    } catch (cacheErr) {
      console.error("Held bills list cache write error:", cacheErr.message);
    }
  }

  return rows;
};

/**
 * Update the status of a held bill (e.g. RESUMED, DISCARDED, etc.).
 *
 * @param {Object} params
 * @param {string} params.organisationId
 * @param {string} params.branchId
 * @param {string} params.heldBillId
 * @param {string} params.status
 * @param {string|null} [params.notes=null]
 * @param {Object|null} [params.client=null]
 *
 * @returns {Promise<Object>}
 */
const updateHeldBillStatus = async ({
  organisationId,
  branchId,
  heldBillId,
  status,
  notes = null,
  client = null,
}) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");
  if (!heldBillId) throw new Error("heldBillId is required.");
  if (!VALID_HELD_BILL_STATUSES.includes(status)) {
    throw new Error(
      `Invalid status: ${status}. Permitted: ${VALID_HELD_BILL_STATUSES.join(", ")}`,
    );
  }

  const dbClient = client || pool;

  const query = `
    UPDATE held_bills
    SET
      status = $1,
      notes = COALESCE($2, notes),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
      AND organisation_id = $4
      AND branch_id = $5
    RETURNING
      ${HELD_BILL_COLUMNS};
  `;

  const result = await dbClient.query(query, [
    status,
    notes,
    heldBillId,
    organisationId,
    branchId,
  ]);

  if (result.rowCount === 0) {
    throw new Error(
      "Held bill not found in the specified organisation and branch.",
    );
  }

  const updated = result.rows[0];

  await invalidateHeldBillCache(organisationId, branchId, heldBillId);

  return updated;
};

/**
 * Non-destructive discard of a held bill.
 * Updates status to 'DISCARDED' to preserve auditability.
 *
 * @param {Object} params
 * @param {string} params.organisationId
 * @param {string} params.branchId
 * @param {string} params.heldBillId
 * @param {Object|null} [params.client=null]
 *
 * @returns {Promise<Object>}
 */
const deleteHeldBill = async ({
  organisationId,
  branchId,
  heldBillId,
  client = null,
}) => {
  return updateHeldBillStatus({
    organisationId,
    branchId,
    heldBillId,
    status: "DISCARDED",
    notes: "Discarded draft sale",
    client,
  });
};

module.exports = {
  createHeldBill,
  getHeldBillById,
  listHeldBills,
  updateHeldBillStatus,
  deleteHeldBill,
  invalidateHeldBillCache,
  buildHeldBillCacheKey,
  buildHeldBillListCacheKey,
  VALID_HELD_BILL_STATUSES,
};

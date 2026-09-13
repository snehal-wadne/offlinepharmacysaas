/**
 * Cash Movement Repository
 *
 * Purpose:
 * Provides PostgreSQL persistence and cache management for the `cash_movements` table.
 * Records cash entering or leaving the register outside normal sales/refunds
 * (e.g. petty cash in/out, cash float adjustments, courier, cleaning expenses).
 *
 * Constraints & Invariants:
 * - Movement type must be 'IN' or 'OUT'.
 * - Amount must be strictly greater than 0.
 * - Centralized sequence `CASH_MOVEMENT` (PC-1001) is used.
 * - Posted cash movements are immutable and MUST NOT be physically deleted.
 * - Multi-tenant and branch boundaries are strictly enforced.
 * - Transaction clients bypass Redis for read-your-own-writes consistency.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");
const { getNextBusinessNumber } = require("./number-sequence.repository");
const { invalidateSessionReconciliationCache, registerAfterCommit } = require("./cash-register-dashboard.repository");

const MOVEMENT_CACHE_TTL = 60;

const CASH_MOVEMENT_COLUMNS = `
  id,
  organisation_id,
  branch_id,
  cash_register_session_id,
  cashier_id,
  movement_number,
  movement_type,
  amount,
  reason,
  created_at
`;

/**
 * Cache key helpers.
 */
const buildMovementsListCacheKey = (organisationId, sessionId) =>
  `organisation:${organisationId}:session:${sessionId}:movements`;

const buildReconciliationCacheKey = (organisationId, sessionId) =>
  `organisation:${organisationId}:session:${sessionId}:reconciliation`;

/**
 * Invalidate affected cache entries on cash movement.
 */
const invalidateCashMovementCache = async (organisationId, sessionId) => {
  if (!organisationId || !sessionId) return;
  try {
    await Promise.all([
      deleteCache(buildMovementsListCacheKey(organisationId, sessionId)),
      deleteCache(buildReconciliationCacheKey(organisationId, sessionId)),
    ]);
  } catch (error) {
    console.error("Cash movement cache invalidation error:", error.message);
  }
};

/**
 * Validate that the session exists, belongs to the given organisation and branch,
 * and optionally verify that the session is OPEN (with FOR SHARE row locking).
 */
const validateSessionContext = async (
  db,
  organisationId,
  branchId,
  sessionId,
  requireOpen = false,
) => {
  let query = `
    SELECT id, status, branch_id, organisation_id
    FROM cash_register_sessions
    WHERE id = $1 AND organisation_id = $2
  `;
  if (requireOpen) {
    query += ` FOR SHARE`;
  }
  const result = await db.query(query, [sessionId, organisationId]);

  if (result.rowCount === 0) {
    throw new Error(
      "Cash register session not found in the specified organisation.",
    );
  }

  const session = result.rows[0];
  if (session.branch_id !== branchId) {
    throw new Error(
      "Cash register session does not belong to the specified branch.",
    );
  }

  if (requireOpen && session.status !== "OPEN") {
    throw new Error("Cannot post cash movement to a closed session.");
  }

  return session;
};

/**
 * Validate that the cashier is an active member of the organisation.
 */
const validateCashier = async (db, organisationId, cashierId) => {
  const result = await db.query(
    `SELECT u.id
       FROM users u
       LEFT JOIN organisation_memberships om ON om.user_id = u.id AND om.organisation_id = $2
       LEFT JOIN organisations o ON o.id = $2 AND o.owner_id = u.id
       WHERE u.id = $1 AND (om.status = 'ACTIVE' OR u.is_platform_superadmin = TRUE OR o.id IS NOT NULL);`,
    [cashierId, organisationId],
  );

  if (result.rowCount === 0) {
    throw new Error(
      "Cashier is not an active member of the specified organisation.",
    );
  }

  return result.rows[0];
};

/**
 * Create a new cash movement (petty cash in/out).
 *
 * @param {Object} data
 * @param {string} data.organisationId
 * @param {string} data.branchId
 * @param {string} data.cashRegisterSessionId
 * @param {string} data.cashierId
 * @param {'IN'|'OUT'} data.movementType
 * @param {number|string} data.amount
 * @param {string} data.reason
 * @param {Object|null} [data.client=null]
 *
 * @returns {Promise<Object>} Created cash movement
 */
const createMovement = async ({
  organisationId,
  branchId,
  cashRegisterSessionId,
  cashierId,
  movementType,
  amount,
  reason,
  client = null,
}) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");
  if (!cashRegisterSessionId)
    throw new Error("cashRegisterSessionId is required.");
  if (!cashierId) throw new Error("cashierId is required.");
  if (!movementType || !["IN", "OUT"].includes(movementType)) {
    throw new Error("movementType must be either 'IN' or 'OUT'.");
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error("amount must be a positive number greater than 0.");
  }

  if (!reason || !reason.trim()) {
    throw new Error("reason is required.");
  }

  let dbClient = client;
  let ownsTransaction = false;

  try {
    if (!dbClient) {
      dbClient = await pool.connect();
      ownsTransaction = true;
      await dbClient.query("BEGIN");
    }

    // Validate session & cashier (atomically locks session with FOR SHARE and checks status = OPEN)
    await validateSessionContext(
      dbClient,
      organisationId,
      branchId,
      cashRegisterSessionId,
      true,
    );
    await validateCashier(dbClient, organisationId, cashierId);

    // Generate PC-1001 sequence
    const movementNumber = await getNextBusinessNumber({
      organisationId,
      branchId,
      sequenceType: "CASH_MOVEMENT",
      client: dbClient,
    });

    const query = `
      INSERT INTO cash_movements (
        organisation_id,
        branch_id,
        cash_register_session_id,
        cashier_id,
        movement_number,
        movement_type,
        amount,
        reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        ${CASH_MOVEMENT_COLUMNS};
    `;

    const result = await dbClient.query(query, [
      organisationId,
      branchId,
      cashRegisterSessionId,
      cashierId,
      movementNumber,
      movementType,
      numericAmount,
      reason.trim(),
    ]);

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    const createdMovement = result.rows[0];

    // Invalidate caches strictly after commit
    if (ownsTransaction) {
      await invalidateCashMovementCache(organisationId, cashRegisterSessionId);
      await invalidateSessionReconciliationCache(organisationId, cashRegisterSessionId);
    } else {
      registerAfterCommit(dbClient, async () => {
        await invalidateCashMovementCache(organisationId, cashRegisterSessionId);
        await invalidateSessionReconciliationCache(organisationId, cashRegisterSessionId);
      });
    }

    return createdMovement;
  } catch (error) {
    if (ownsTransaction && dbClient) {
      try {
        await dbClient.query("ROLLBACK");
      } catch (rbErr) {
        console.error("Rollback error in createMovement:", rbErr.message);
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
 * List all cash movements for a register session.
 *
 * @param {Object} params
 * @param {string} params.organisationId
 * @param {string} params.branchId
 * @param {string} params.sessionId
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @param {Object|null} [params.client=null]
 *
 * @returns {Promise<Array<Object>>}
 */
const listMovementsBySession = async ({
  organisationId,
  branchId,
  sessionId,
  limit = 50,
  offset = 0,
  client = null,
}) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");
  if (!sessionId) throw new Error("sessionId is required.");

  const cacheKey = buildMovementsListCacheKey(organisationId, sessionId);

  if (!client && offset === 0 && limit === 50) {
    try {
      const cached = await getCache(cacheKey);
      if (cached) return cached;
    } catch (cacheErr) {
      console.error("Cash movement cache read error:", cacheErr.message);
    }
  }

  const dbClient = client || pool;

  // Validate session exists and belongs to organisation & branch
  await validateSessionContext(dbClient, organisationId, branchId, sessionId);

  const query = `
    SELECT
      ${CASH_MOVEMENT_COLUMNS}
    FROM cash_movements
    WHERE organisation_id = $1
      AND branch_id = $2
      AND cash_register_session_id = $3
    ORDER BY created_at ASC
    LIMIT $4 OFFSET $5;
  `;

  const result = await dbClient.query(query, [
    organisationId,
    branchId,
    sessionId,
    limit,
    offset,
  ]);

  const rows = result.rows;

  if (!client && offset === 0 && limit === 50) {
    try {
      await setCache(cacheKey, rows, MOVEMENT_CACHE_TTL);
    } catch (cacheErr) {
      console.error("Cash movement cache write error:", cacheErr.message);
    }
  }

  return rows;
};

module.exports = {
  createMovement,
  listMovementsBySession,
  invalidateCashMovementCache,
  buildMovementsListCacheKey,
};

/**
 * Sync Authentication & Multi-Tenant Authorization Middleware
 *
 * Protects:
 * - POST /api/sync/push
 * - GET  /api/sync/pull
 * - GET  /api/sync/status
 *
 * Enforces:
 * 1. Valid token presence (Bearer <token> or x-sync-auth header)
 * 2. Active user account verification in PostgreSQL users table
 * 3. Strict organisation resolution & membership validation (HTTP 403 if user does not belong to org)
 * 4. Active organisation status check (status = 'ACTIVE')
 * 5. Branch ownership and user branch authorization checks
 */

const { pool } = require("../db/connection");
const { verifyPlatformToken } = require("./superadmin-auth.middleware");

const isUuid = (str) =>
  typeof str === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

/**
 * Extract and authenticate user from request token
 */
const authenticateUser = async (req) => {
  const authHeader = req.headers.authorization;
  const syncAuthHeader = req.headers["x-sync-auth"];

  let token = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (syncAuthHeader) {
    token = String(syncAuthHeader).trim();
  }

  if (!token) {
    return { error: "Missing authentication token", statusCode: 401 };
  }

  // 1. Platform Superadmin Tokens (pf_platform_... or dev superadmin)
  const platformDecoded = verifyPlatformToken(token);
  if (platformDecoded) {
    if (platformDecoded.isDev) {
      const res = await pool.query(
        `SELECT id, name, email, status, is_platform_superadmin
         FROM users
         WHERE is_platform_superadmin = TRUE AND status = 'ACTIVE'
         ORDER BY created_at ASC
         LIMIT 1`,
      );
      if (res.rows.length > 0) {
        return { user: res.rows[0] };
      }
    } else if (platformDecoded.userId) {
      const res = await pool.query(
        `SELECT id, name, email, status, is_platform_superadmin
         FROM users
         WHERE id = $1 AND status = 'ACTIVE'`,
        [platformDecoded.userId],
      );
      if (res.rows.length > 0) {
        return { user: res.rows[0] };
      }
    }
  }

  // 2. JWT Online Token: jwt_online_<userId>_<timestamp>
  if (token.startsWith("jwt_online_")) {
    const parts = token.split("_");
    const userId = parts[2];
    if (isUuid(userId)) {
      const res = await pool.query(
        `SELECT id, name, email, status, is_platform_superadmin
         FROM users
         WHERE id = $1 AND status = 'ACTIVE'`,
        [userId],
      );
      if (res.rows.length > 0) {
        return { user: res.rows[0] };
      }
    }
  }

  // 3. Offline / Test Token: offline_token_<userId>_<timestamp> or test_user_<userId>
  if (token.startsWith("offline_token_") || token.startsWith("test_user_")) {
    const parts = token.split("_");
    const userId = parts[parts.length - 2];
    if (isUuid(userId)) {
      const res = await pool.query(
        `SELECT id, name, email, status, is_platform_superadmin
         FROM users
         WHERE id = $1 AND status = 'ACTIVE'`,
        [userId],
      );
      if (res.rows.length > 0) {
        return { user: res.rows[0] };
      }
    }
  }

  // 4. Direct UUID token (for testing and microservice sync)
  if (isUuid(token)) {
    const res = await pool.query(
      `SELECT id, name, email, status, is_platform_superadmin
       FROM users
       WHERE id = $1 AND status = 'ACTIVE'`,
      [token],
    );
    if (res.rows.length > 0) {
      return { user: res.rows[0] };
    }
  }

  return {
    error: "Invalid or inactive user authentication token",
    statusCode: 401,
  };
};

/**
 * Express Middleware: Authenticate Sync Endpoint Request
 */
const requireSyncAuth = async (req, res, next) => {
  try {
    const authResult = await authenticateUser(req);
    if (authResult.error) {
      return res.status(authResult.statusCode || 401).json({
        success: false,
        error: `Unauthorized: ${authResult.error}`,
      });
    }

    req.user = authResult.user;

    // Resolve tenant / organisation context
    const body = req.body || {};
    const rawOrgId =
      req.headers["x-organisation-id"] ||
      req.headers["x-tenant-id"] ||
      req.query?.organisationId ||
      body.organisationId ||
      (Array.isArray(body.mutations) && body.mutations[0]?.organisationId);

    const rawBranchId =
      req.headers["x-branch-id"] ||
      req.query?.branchId ||
      body.branchId ||
      (Array.isArray(body.mutations) && body.mutations[0]?.branchId);

    // For push and pull, organisationId is mandatory
    const isPushOrPull =
      req.path.includes("/push") || req.path.includes("/pull");

    if (isPushOrPull && !rawOrgId) {
      return res.status(400).json({
        success: false,
        error:
          "Missing mandatory organisation identifier in sync request (x-organisation-id header or organisationId payload)",
      });
    }

    if (rawOrgId) {
      if (!isUuid(rawOrgId)) {
        return res.status(400).json({
          success: false,
          error: `Invalid organisation identifier format: ${rawOrgId}`,
        });
      }

      // Verify organisation exists and is ACTIVE
      const orgRes = await pool.query(
        "SELECT id, name, status, owner_id FROM organisations WHERE id = $1",
        [rawOrgId],
      );

      if (orgRes.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: Organisation ${rawOrgId} not found`,
        });
      }

      const org = orgRes.rows[0];
      if (org.status !== "ACTIVE") {
        return res.status(403).json({
          success: false,
          error: `Forbidden: Organisation ${rawOrgId} is not active (status: ${org.status})`,
        });
      }

      // Verify user membership in this organisation
      let isAuthorized = false;

      // 1. Platform Superadmin has universal access
      if (req.user.is_platform_superadmin) {
        isAuthorized = true;
      }
      // 2. Organisation owner
      else if (org.owner_id === req.user.id) {
        isAuthorized = true;
      }
      // 3. Active member in organisation_memberships
      else {
        const memRes = await pool.query(
          `SELECT id, status FROM organisation_memberships
           WHERE organisation_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
          [rawOrgId, req.user.id],
        );
        if (memRes.rows.length > 0) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: User ${req.user.id} does not have active membership in organisation ${rawOrgId}`,
        });
      }

      // Branch validation (if specified)
      if (rawBranchId) {
        if (!isUuid(rawBranchId)) {
          return res.status(400).json({
            success: false,
            error: `Invalid branch identifier format: ${rawBranchId}`,
          });
        }

        const brRes = await pool.query(
          "SELECT id, name, status, organisation_id FROM branches WHERE id = $1",
          [rawBranchId],
        );

        if (brRes.rows.length === 0) {
          return res.status(403).json({
            success: false,
            error: `Forbidden: Branch ${rawBranchId} not found`,
          });
        }

        const branch = brRes.rows[0];
        if (branch.organisation_id !== rawOrgId) {
          return res.status(403).json({
            success: false,
            error: `Forbidden: Branch ${rawBranchId} does not belong to organisation ${rawOrgId}`,
          });
        }

        if (branch.status !== "ACTIVE") {
          return res.status(403).json({
            success: false,
            error: `Forbidden: Branch ${rawBranchId} is not active`,
          });
        }

        // Branch authorization check
        let isBranchAuthorized = false;
        if (req.user.is_platform_superadmin || org.owner_id === req.user.id) {
          isBranchAuthorized = true;
        } else {
          // Check branch_assignments
          const baRes = await pool.query(
            `SELECT ba.branch_id FROM branch_assignments ba
             JOIN organisation_memberships om ON om.id = ba.membership_id
             WHERE om.organisation_id = $1 AND om.user_id = $2 AND om.status = 'ACTIVE'`,
            [rawOrgId, req.user.id],
          );

          if (baRes.rows.length === 0) {
            // User is member without specific branch restrictions -> allow
            isBranchAuthorized = true;
          } else {
            const allowedBranchIds = baRes.rows.map((r) => r.branch_id);
            if (allowedBranchIds.includes(rawBranchId)) {
              isBranchAuthorized = true;
            }
          }
        }

        if (!isBranchAuthorized) {
          return res.status(403).json({
            success: false,
            error: `Forbidden: User ${req.user.id} is not authorized for branch ${rawBranchId}`,
          });
        }
      }

    req.tenantContext = {
        organisationId: rawOrgId,
        branchId: rawBranchId || null,
      };
    }

    next();
  } catch (err) {
    console.error("[SyncAuthMiddleware] Authentication error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal sync security authentication error",
    });
  }
};

const optionalSyncAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const syncAuthHeader = req.headers["x-sync-auth"];
  if (!authHeader && !syncAuthHeader) {
    return next();
  }
  return requireSyncAuth(req, res, next);
};

module.exports = {
  requireSyncAuth,
  optionalSyncAuth,
  authenticateUser,
  isUuid,
};


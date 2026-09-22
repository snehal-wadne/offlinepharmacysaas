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
const { verifyToken } = require("../utils/token.util");
const { verifySupabaseToken } = require("../utils/supabase");

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
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEV_AUTH === "true"
    ) {
      const rawOrgId =
        req.headers["x-organisation-id"] ||
        req.headers["x-tenant-id"] ||
        req.query?.organisationId ||
        req.body?.organisationId;

      let fallbackUserRes = null;
      if (rawOrgId && isUuid(rawOrgId)) {
        fallbackUserRes = await pool.query(
          `SELECT u.id, u.name, u.email, u.status, u.is_platform_superadmin
           FROM users u
           JOIN organisation_memberships om ON om.user_id = u.id AND om.status = 'ACTIVE'
           WHERE om.organisation_id = $1 AND u.status = 'ACTIVE'
           ORDER BY u.created_at ASC
           LIMIT 1;`,
          [rawOrgId],
        );
      }

      if (!fallbackUserRes || fallbackUserRes.rows.length === 0) {
        fallbackUserRes = await pool.query(`
          SELECT id, name, email, status, is_platform_superadmin
          FROM users
          WHERE status = 'ACTIVE'
          ORDER BY created_at ASC
          LIMIT 1;
        `);
      }

      if (fallbackUserRes.rows.length > 0) {
        return { user: fallbackUserRes.rows[0] };
      }
    }
    return { error: "Missing authentication token", statusCode: 401 };
  }

  // 1. Platform Superadmin Tokens (pf_platform_... or dev superadmin)
  // 1. Supabase Auth JWT (Primary)
  const supabaseDecoded = await verifySupabaseToken(token);
  if (supabaseDecoded && supabaseDecoded.sub) {
    const crypto = require("crypto");
    const subUuid = isUuid(supabaseDecoded.sub)
      ? supabaseDecoded.sub
      : (() => {
          const hash = crypto
            .createHash("md5")
            .update(supabaseDecoded.sub)
            .digest("hex");
          return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        })();

    const res = await pool.query(
      `SELECT id, name, email, status, is_platform_superadmin, supabase_auth_id
       FROM users
       WHERE (supabase_auth_id = $1 OR (supabase_auth_id IS NULL AND LOWER(email) = LOWER($2)))
         AND status = 'ACTIVE'`,
      [subUuid, supabaseDecoded.email || ""],
    );
    if (res.rows.length > 0) {
      const u = res.rows[0];
      if (!u.supabase_auth_id && subUuid) {
        await pool
          .query("UPDATE users SET supabase_auth_id = $1 WHERE id = $2", [
            subUuid,
            u.id,
          ])
          .catch(() => {});
        u.supabase_auth_id = subUuid;
      }
      return { user: u };
    }
  }

  // 2. Platform Superadmin Tokens (pf_platform_... or dev superadmin)
  const platformDecoded = verifyPlatformToken(token);
  if (platformDecoded) {
    if (platformDecoded.isDev) {
      if (
        process.env.NODE_ENV === "production" ||
        process.env.ALLOW_DEV_AUTH !== "true"
      ) {
        return {
          error: "Development tokens are disabled in this environment",
          statusCode: 401,
        };
      }
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

  // 2. Standard application user tokens (pf_user_...)
  const appDecoded = verifyToken(token);
  if (appDecoded && appDecoded.userId && isUuid(appDecoded.userId)) {
    const res = await pool.query(
      `SELECT id, name, email, status, is_platform_superadmin
       FROM users
       WHERE id = $1 AND status = 'ACTIVE'`,
      [appDecoded.userId],
    );
    if (res.rows.length > 0) {
      return { user: res.rows[0] };
    }
  }

  // 3. Development-only tokens (jwt_online_, offline_token_, test_user_, direct UUID)
  // Strictly disabled in production or unless ALLOW_DEV_AUTH=true
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_DEV_AUTH === "true"
  ) {
    // 3a. JWT Online Token: jwt_online_<userId>_<timestamp>, jwt_pg_<userId>_<timestamp>, jwt_google_<userId>_<timestamp>
    if (
      token.startsWith("jwt_online_") ||
      token.startsWith("jwt_pg_") ||
      token.startsWith("jwt_google_")
    ) {
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

    // 3b. Offline / Test Token: offline_token_<userId>_<timestamp> or test_user_<userId>
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

    // 3c. Direct UUID token (for testing and microservice sync)
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
    let rawOrgId =
      req.headers["x-organisation-id"] ||
      req.headers["x-tenant-id"] ||
      req.query?.organisationId ||
      body.organisationId ||
      (Array.isArray(body.mutations) && body.mutations[0]?.organisationId);

    if (!rawOrgId && req.user?.id) {
      const userOrgRes = await pool.query(
        `SELECT om.organisation_id 
         FROM organisation_memberships om
         JOIN organisations o ON o.id = om.organisation_id
         WHERE om.user_id = $1 AND om.status = 'ACTIVE' AND o.status = 'ACTIVE'
         ORDER BY om.created_at ASC LIMIT 1;`,
        [req.user.id],
      );
      if (userOrgRes.rows.length > 0) {
        rawOrgId = userOrgRes.rows[0].organisation_id;
      }
    }

    let rawBranchId =
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

      // Resolve and attach the user's role for this organisation. Other
      // authorization helpers (e.g. tenant-context.js's getAuthorizedBranchId)
      // read req.user.role to decide whether to skip the per-branch
      // assignment check for OWNER/ADMIN/MANAGER users. Without this, an
      // otherwise-authorized admin who lacks a branch_assignments row for a
      // specific branch (because their role grants org-wide access instead)
      // gets incorrectly blocked as "not assigned to the requested branch".
      if (req.user.is_platform_superadmin || org.owner_id === req.user.id) {
        req.user.role = "OWNER";
      } else {
        const roleRes = await pool.query(
          `SELECT r.role_identifier, r.name
           FROM branch_assignments ba
           JOIN organisation_memberships om ON om.id = ba.membership_id
           JOIN roles r ON r.id = ba.role_id
           WHERE om.organisation_id = $1 AND om.user_id = $2 AND om.status = 'ACTIVE'
           ORDER BY CASE r.role_identifier
             WHEN 'OWNER' THEN 1
             WHEN 'ADMIN' THEN 2
             WHEN 'MANAGER' THEN 3
             ELSE 4
           END
           LIMIT 1;`,
          [rawOrgId, req.user.id],
        );
        if (roleRes.rows.length > 0) {
          req.user.role =
            roleRes.rows[0].role_identifier || roleRes.rows[0].name;
        }
      }

      // Branch validation (if specified)
      const isSentinelBranch =
        rawBranchId === "All Branches" ||
        rawBranchId === "all" ||
        rawBranchId === "No Active Branch" ||
        rawBranchId === "null" ||
        rawBranchId === "undefined";

      if (isSentinelBranch) {
        rawBranchId = null;
        if (req.query && req.query.branchId) delete req.query.branchId;
        if (req.headers && req.headers["x-branch-id"])
          delete req.headers["x-branch-id"];
      }

      if (rawBranchId) {
        let branchIdToVerify = rawBranchId;
        if (!isUuid(rawBranchId)) {
          const nameRes = await pool.query(
            "SELECT id FROM branches WHERE organisation_id = $1 AND (name ILIKE $2 OR branch_code ILIKE $2) LIMIT 1;",
            [rawOrgId, rawBranchId],
          );
          if (nameRes.rows.length > 0) {
            branchIdToVerify = nameRes.rows[0].id;
            if (req.query && req.query.branchId)
              req.query.branchId = branchIdToVerify;
            if (req.headers) req.headers["x-branch-id"] = branchIdToVerify;
          } else {
            return res.status(400).json({
              success: false,
              error: `Invalid branch identifier format: ${rawBranchId}`,
            });
          }
        }

        const brRes = await pool.query(
          "SELECT id, name, status, organisation_id FROM branches WHERE id = $1",
          [branchIdToVerify],
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
          // Check if user has an ADMIN or OWNER role in this organisation
          const adminCheck = await pool.query(
            `SELECT r.role_identifier, r.name
             FROM branch_assignments ba
             JOIN organisation_memberships om ON om.id = ba.membership_id
             JOIN roles r ON r.id = ba.role_id
             WHERE om.organisation_id = $1 AND om.user_id = $2 AND om.status = 'ACTIVE'
               AND (r.role_identifier IN ('ADMIN', 'OWNER', 'SUPERADMIN') OR r.name ILIKE '%admin%' OR r.name ILIKE '%owner%')
             LIMIT 1;`,
            [rawOrgId, req.user.id],
          );

          if (adminCheck.rows.length > 0) {
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
              if (allowedBranchIds.includes(branchIdToVerify)) {
                isBranchAuthorized = true;
              }
            }
          }
        }

        if (!isBranchAuthorized) {
          return res.status(403).json({
            success: false,
            error: `Forbidden: User ${req.user.id} is not authorized for branch ${rawBranchId}`,
          });
        }

        req.tenantContext = {
          organisationId: rawOrgId,
          branchId: branchIdToVerify,
        };
        req.tenant = req.tenantContext;
        if (req.user) {
          req.user.organisationId = rawOrgId;
          req.user.branchId = branchIdToVerify;
        }
      } else {
        req.tenantContext = {
          organisationId: rawOrgId,
          branchId: null,
        };
        req.tenant = req.tenantContext;
        if (req.user) {
          req.user.organisationId = rawOrgId;
          req.user.branchId = null;
        }
      }
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

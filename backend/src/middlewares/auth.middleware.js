/**
 * Authentication Middleware
 *
 * Extracts and validates bearer tokens using Supabase Auth JWTs,
 * resolving the authenticated user identity, organisation tenancy,
 * and branch context from PostgreSQL.
 */

const { pool } = require("../db/connection");
const { verifySupabaseToken } = require("../utils/supabase");
const { verifyToken } = require("../utils/token.util");

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const hasAuthHeader = Boolean(authHeader && authHeader.trim());
    let user = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1].trim();

      // 1. Primary: Verify Supabase Auth JWT
      const supabaseDecoded = verifySupabaseToken(token);
      if (supabaseDecoded && supabaseDecoded.sub) {
        const isUuid = (str) =>
          typeof str === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            str,
          );

        const subUuid = isUuid(supabaseDecoded.sub)
          ? supabaseDecoded.sub
          : (() => {
              const crypto = require("crypto");
              const hash = crypto
                .createHash("md5")
                .update(supabaseDecoded.sub)
                .digest("hex");
              return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
            })();

        const userRes = await pool.query(
          `SELECT id, name, email, phone, staff_id AS "staffId", status, 
                  is_platform_superadmin, supabase_auth_id
           FROM users
           WHERE (supabase_auth_id = $1 OR (supabase_auth_id IS NULL AND LOWER(email) = LOWER($2)))
             AND status = 'ACTIVE'
           LIMIT 1;`,
          [subUuid, supabaseDecoded.email || ""],
        );

        if (userRes.rows.length > 0) {
          user = userRes.rows[0];
          // JIT link if supabase_auth_id was not yet set on existing matching user
          if (!user.supabase_auth_id && subUuid) {
            await pool
              .query("UPDATE users SET supabase_auth_id = $1 WHERE id = $2;", [
                subUuid,
                user.id,
              ])
              .catch(() => {});
            user.supabase_auth_id = subUuid;
          }
        }
      }

      // 2. Secondary: Backward-compatible support for signed tokens (pf_user_...)
      if (!user) {
        const legacyDecoded = verifyToken(token);
        if (legacyDecoded && legacyDecoded.userId) {
          const userRes = await pool.query(
            `SELECT id, name, email, phone, staff_id AS "staffId", status, 
                    is_platform_superadmin, supabase_auth_id
             FROM users
             WHERE id = $1 AND status = 'ACTIVE'
             LIMIT 1;`,
            [legacyDecoded.userId],
          );
          if (userRes.rows.length > 0) {
            user = userRes.rows[0];
          }
        }
      }
    }

    // Development-only fallback: strictly gated behind non-production AND ALLOW_DEV_AUTH=true
    if (
      !user &&
      !hasAuthHeader &&
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEV_AUTH === "true"
    ) {
      const fallbackUserRes = await pool.query(`
        SELECT 
          u.id, u.name, u.email, u.phone, u.staff_id AS "staffId",
          om.organisation_id, ba.branch_id, r.id AS role_id, r.name AS role_name, r.role_identifier
        FROM users u
        LEFT JOIN organisation_memberships om ON om.user_id = u.id AND om.status = 'ACTIVE'
        LEFT JOIN branch_assignments ba ON ba.membership_id = om.id
        LEFT JOIN roles r ON r.id = ba.role_id
        WHERE u.status = 'ACTIVE'
        ORDER BY u.created_at ASC
        LIMIT 1;
      `);

      if (fallbackUserRes.rows.length > 0) {
        const devUser = fallbackUserRes.rows[0];

        req.user = {
          id: devUser.id,
          name: devUser.name,
          email: devUser.email,
          role: devUser.role_identifier || devUser.role_name || "ADMIN",
          roleId: devUser.role_id,
          organisationId: devUser.organisation_id || null,
          branchId: devUser.branch_id || null,
        };
        return next();
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or missing authentication token.",
      });
    }

    // 2. Query legitimate ACTIVE organisation memberships from PostgreSQL
    const memRes = await pool.query(
      `SELECT 
         om.id AS membership_id,
         om.organisation_id,
         o.name AS organisation_name,
         o.owner_id,
         ba.branch_id,
         r.id AS role_id,
         r.name AS role_name,
         r.role_identifier
       FROM organisation_memberships om
       JOIN organisations o ON o.id = om.organisation_id
       LEFT JOIN branch_assignments ba ON ba.membership_id = om.id
       LEFT JOIN roles r ON r.id = ba.role_id
       WHERE om.user_id = $1 AND om.status = 'ACTIVE' AND o.status = 'ACTIVE';`,
      [user.id],
    );

    const memberships = memRes.rows;
    const requestedOrgId = req.headers["x-organisation-id"];
    const requestedBranchId = req.headers["x-branch-id"];

    let selectedMembership = null;

    if (requestedOrgId) {
      // Platform superadmins have universal cross-tenant access
      if (user.is_platform_superadmin) {
        const orgCheck = await pool.query(
          "SELECT id, name FROM organisations WHERE id = $1 AND status = 'ACTIVE';",
          [requestedOrgId],
        );
        if (orgCheck.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Requested organisation not found or inactive.",
          });
        }
        selectedMembership = {
          organisation_id: requestedOrgId,
          role_name: "Platform Superadmin",
          role_identifier: "ADMIN",
        };
      } else {
        // Standard users MUST have an active membership in the requested organisation
        selectedMembership = memberships.find(
          (m) => m.organisation_id === requestedOrgId,
        );
        if (!selectedMembership) {
          return res.status(403).json({
            success: false,
            message:
              "Forbidden: You do not have active membership in the requested organisation.",
          });
        }
      }
    } else {
      // No header provided: use user's first legitimate active membership if exists
      if (memberships.length > 0) {
        selectedMembership = memberships[0];
      }
    }

    // 3. Branch authorization
    let resolvedBranchId = null;
    if (selectedMembership) {
      if (requestedBranchId) {
        // Verify branch belongs to the selected organisation
        const branchCheck = await pool.query(
          "SELECT id, name, status, organisation_id FROM branches WHERE id = $1 AND organisation_id = $2 AND status = 'ACTIVE';",
          [requestedBranchId, selectedMembership.organisation_id],
        );
        if (branchCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message:
              "Forbidden: Branch does not exist or does not belong to the authorized organisation.",
          });
        }

        // If user is not superadmin / owner / admin, verify they are assigned to this branch
        const isOwnerOrAdmin =
          user.is_platform_superadmin ||
          selectedMembership.owner_id === user.id ||
          selectedMembership.role_identifier === "ADMIN" ||
          selectedMembership.role_name === "Administrator";

        if (!isOwnerOrAdmin) {
          const assignedBranches = memberships
            .filter(
              (m) => m.organisation_id === selectedMembership.organisation_id,
            )
            .map((m) => m.branch_id)
            .filter(Boolean);

          if (
            assignedBranches.length > 0 &&
            !assignedBranches.includes(requestedBranchId)
          ) {
            return res.status(403).json({
              success: false,
              message:
                "Forbidden: You are not assigned to the requested branch.",
            });
          }
        }
        resolvedBranchId = requestedBranchId;
      } else {
        resolvedBranchId = selectedMembership.branch_id || null;
      }
    }

    const isOwner = selectedMembership?.owner_id === user.id;

    req.user = {
      id: user.id,
      supabaseAuthId: user.supabase_auth_id || null,
      name: user.name,
      email: user.email,
      phone: user.phone,
      staffId: user.staffId,
      isPlatformSuperadmin: Boolean(user.is_platform_superadmin),
      role: isOwner
        ? "OWNER"
        : selectedMembership?.role_identifier ||
          selectedMembership?.role_name ||
          "STAFF",
      roleId: selectedMembership?.role_id || null,
      organisationId: selectedMembership?.organisation_id || null,
      branchId: resolvedBranchId,
    };

    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Authentication error occurred.",
    });
  }
};

const optionalAuth = (req, res, next) => {
  authenticate(req, res, () => next()).catch(() => next());
};

module.exports = {
  authenticate,
  optionalAuth,
};

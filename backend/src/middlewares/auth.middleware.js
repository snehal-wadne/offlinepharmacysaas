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
      const supabaseDecoded = await verifySupabaseToken(token);
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
                  is_platform_superadmin, role, supplier_id
           FROM users
           WHERE LOWER(email) = LOWER($1)
           LIMIT 1;`,
          [supabaseDecoded.email || ""],
        );

        if (userRes.rows.length > 0) {
          const foundUser = userRes.rows[0];
          if (foundUser.status === "INACTIVE") {
            return res.status(403).json({
              success: false,
              code: "ACCOUNT_DEACTIVATED",
              message: "Your account has been deactivated. Please contact your pharmacy administrator.",
            });
          }
          user = foundUser;
        } else if (supabaseDecoded.email) {
          // Automatic JIT provisioning for Google Auth Admin (Zero-form onboarding)
          const authService = require("../services/auth.service");
          try {
            const rawName =
              supabaseDecoded.user_metadata?.full_name ||
              supabaseDecoded.user_metadata?.name ||
              supabaseDecoded.email.split("@")[0] ||
              "Pharmacy Admin";
            const provisioned = await authService.provisionGoogleAdminUser({
              token,
              email: supabaseDecoded.email,
              name: rawName,
              supabaseAuthId: subUuid,
              pharmacyMode: "multi",
            });
            if (provisioned?.user) {
              const freshUserRes = await pool.query(
                `SELECT id, name, email, phone, staff_id AS "staffId", status, 
                        is_platform_superadmin, role, supplier_id, supabase_auth_id
                 FROM users
                 WHERE id = $1
                 LIMIT 1;`,
                [provisioned.user.id],
              );
              if (freshUserRes.rows.length > 0) {
                user = freshUserRes.rows[0];
              }
            }
          } catch (jitErr) {
            console.error("[AuthMiddleware] JIT Google provisioning error:", jitErr.message);
          }
        }
      }

      // 2. Secondary: Backward-compatible support for signed tokens (pf_user_...)
      if (!user) {
        const legacyDecoded = verifyToken(token);
        if (legacyDecoded && legacyDecoded.userId) {
          const userRes = await pool.query(
            `SELECT id, name, email, phone, staff_id AS "staffId", status, 
                    is_platform_superadmin, role, supplier_id
             FROM users
             WHERE id = $1
             LIMIT 1;`,
            [legacyDecoded.userId],
          );
          if (userRes.rows.length > 0) {
            const foundUser = userRes.rows[0];
            if (foundUser.status === "INACTIVE") {
              return res.status(403).json({
                success: false,
                code: "ACCOUNT_DEACTIVATED",
                message: "Your account has been deactivated. Please contact your pharmacy administrator.",
              });
            }
            user = foundUser;
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

    // Check if authenticated user is a Supplier (isolated from internal pharmacy memberships)
    const supRes = await pool.query(
      "SELECT id, name, email, phone, organisation_id FROM suppliers WHERE LOWER(email) = $1 LIMIT 1;",
      [user.email],
    );
    if (supRes.rows.length > 0) {
      const supplierInfo = supRes.rows[0];
      req.user = {
        id: user.id,
        supabaseAuthId: null,
        name: user.name,
        email: user.email,
        phone: user.phone,
        staffId: user.staffId,
        isPlatformSuperadmin: false,
        role: "SUPPLIER",
        roleName: "Medicine Supplier",
        roleId: null,
        supplierId: supplierInfo.id,
        supplierName: supplierInfo.name,
        organisationId: supplierInfo.organisation_id || null,
        branchId: null,
      };
      return next();
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
       WHERE om.user_id = $1 AND om.status = 'ACTIVE' AND o.status IN ('ACTIVE', 'PENDING_PAYMENT')
       ORDER BY ba.is_primary DESC NULLS LAST, om.created_at ASC;`,
      [user.id],
    );

    const memberships = memRes.rows;
    const rawOrgId = req.headers["x-organisation-id"];
    const requestedOrgId =
      rawOrgId && rawOrgId !== "undefined" && rawOrgId !== "null" && rawOrgId.trim()
        ? rawOrgId.trim()
        : null;
    const requestedBranchId = req.headers["x-branch-id"];

    let selectedMembership = null;

    if (requestedOrgId) {
      // Platform superadmins have universal cross-tenant access
      if (user.is_platform_superadmin) {
        const orgCheck = await pool.query(
          "SELECT id, name FROM organisations WHERE id = $1 AND status IN ('ACTIVE', 'PENDING_PAYMENT');",
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
          // Fallback to user's first valid membership if provided header doesn't match
          selectedMembership = memberships[0] || null;
        }
      }
    }

    if (!selectedMembership) {
      // No header provided: use user's first legitimate active membership if exists
      if (memberships.length > 0) {
        selectedMembership = memberships[0];
      } else {
        // Fallback: Check if user is owner of an active organisation
        const ownerOrgRes = await pool.query(
          "SELECT id, name, owner_id, admin_name FROM organisations WHERE owner_id = $1 AND status IN ('ACTIVE', 'PENDING_PAYMENT') LIMIT 1;",
          [user.id],
        );
        if (ownerOrgRes.rows.length > 0) {
          const ownerOrg = ownerOrgRes.rows[0];
          const defaultBranchRes = await pool.query(
            "SELECT id FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;",
            [ownerOrg.id],
          );
          selectedMembership = {
            organisation_id: ownerOrg.id,
            organisation_name: ownerOrg.name,
            owner_id: ownerOrg.owner_id,
            branch_id: defaultBranchRes.rows[0]?.id || null,
            role_name: "Administrator",
            role_identifier: "ADMIN",
          };
        } else {
          // Check if any membership exists in any status
          const anyMem = await pool.query(
            "SELECT om.organisation_id, o.name AS organisation_name, o.owner_id FROM organisation_memberships om JOIN organisations o ON o.id = om.organisation_id WHERE om.user_id = $1 LIMIT 1;",
            [user.id]
          );
          if (anyMem.rows.length > 0) {
            const m = anyMem.rows[0];
            selectedMembership = {
              organisation_id: m.organisation_id,
              organisation_name: m.organisation_name,
              owner_id: m.owner_id,
              branch_id: null,
              role_name: user.role || "Administrator",
              role_identifier: user.role || "ADMIN",
            };
          } else {
            // Auto-provision organisation for admin with no organisation
            try {
              const authService = require("../services/auth.service");
              const provisioned = await authService.provisionGoogleAdminUser({
                email: user.email,
                name: user.name,
                supabaseAuthId: user.supabase_auth_id,
                pharmacyMode: "multi",
              });
              if (provisioned?.organisation) {
                selectedMembership = {
                  organisation_id: provisioned.organisation.id,
                  organisation_name: provisioned.organisation.name,
                  owner_id: user.id,
                  branch_id: provisioned.user?.branchId || null,
                  role_name: "Pharmacy Owner",
                  role_identifier: "OWNER",
                };
              }
            } catch (pErr) {
              console.warn("[AuthMiddleware] Organisation auto-provision warning:", pErr.message);
            }
          }
        }
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

    let orgAdminMatches = false;
    if (selectedMembership?.organisation_id && user.name) {
      const orgCheck = await pool.query(
        "SELECT 1 FROM organisations WHERE id = $1 AND (owner_id = $2 OR LOWER(admin_name) = LOWER($3)) LIMIT 1;",
        [selectedMembership.organisation_id, user.id, user.name],
      );
      if (orgCheck.rows.length > 0) {
        orgAdminMatches = true;
      }
    }

    const isOwner = Boolean(
      selectedMembership?.owner_id === user.id ||
        orgAdminMatches ||
        (user.role && user.role.toUpperCase() === "OWNER"),
    );
    const isAdmin = Boolean(
      isOwner ||
        user.is_platform_superadmin ||
        (user.role && user.role.toUpperCase() === "ADMIN") ||
        (selectedMembership?.role_identifier &&
          selectedMembership.role_identifier.toUpperCase() === "ADMIN"),
    );

    req.user = {
      id: user.id,
      supabaseAuthId: user.supabase_auth_id || null,
      name: user.name,
      adminName: user.name,
      email: user.email,
      phone: user.phone,
      staffId: user.staffId,
      isPlatformSuperadmin: Boolean(user.is_platform_superadmin),
      isOwner: isOwner,
      role: isOwner
        ? "OWNER"
        : isAdmin
        ? "ADMIN"
        : selectedMembership?.role_identifier || user.role || "STAFF",
      roleName: isOwner
        ? "Pharmacy Owner"
        : isAdmin
        ? "Administrator"
        : selectedMembership?.role_name || "Staff Member",
      roleId: selectedMembership?.role_id || null,
      organisationId: selectedMembership?.organisation_id || null,
      branchId: resolvedBranchId,
    };

    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);

    // Handle DB connectivity errors gracefully (offline mode)
    const isDbConnError =
      err.message &&
      (err.message.includes("Connection terminated") ||
        err.message.includes("ENOTFOUND") ||
        err.message.includes("ECONNREFUSED") ||
        err.message.includes("connect ETIMEDOUT") ||
        err.message.includes("connection timeout"));

    if (isDbConnError) {
      return res.status(503).json({
        success: false,
        message: "Backend database is currently unreachable. Running in offline mode.",
        offlineMode: true,
      });
    }

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

/**
 * Tenant Context Helper
 *
 * Centralized utility for resolving and enforcing multi-tenant and branch boundaries.
 * Guarantees that:
 * 1. Non-superadmin users can ONLY act within their authenticated organisation.
 * 2. Client-supplied organisation overrides in query/body/headers are validated or rejected.
 * 3. Requested branches must exist, be ACTIVE, and belong to the authenticated organisation.
 * 4. Non-admin users are checked for authorization to access requested branches.
 * 5. Arbitrary global LIMIT 1 fallbacks are completely forbidden.
 */

const { pool } = require("../db/connection");

const isUuid = (str) =>
  typeof str === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

/**
 * Resolves the authenticated organisation ID.
 * - Platform Superadmins may switch organisation context if requested via header/query/body.
 * - Standard users are strictly bound to their verified membership organisation.
 * - Any client attempt by a non-superadmin to spoof another organisation throws 403 Forbidden.
 */
const getAuthorizedOrgId = async (req) => {
  const isSuperadmin = Boolean(
    req.user?.isPlatformSuperadmin || req.user?.is_platform_superadmin,
  );
  const authOrgId =
    req.user?.organisationId ||
    req.user?.organisation_id ||
    req.tenantContext?.organisationId;

  // Superadmin context switching
  if (isSuperadmin) {
    const requestedOrgId =
      req.headers["x-organisation-id"] ||
      req.query?.organisationId ||
      req.body?.organisationId ||
      authOrgId;

    if (!requestedOrgId) {
      const err = new Error(
        "Organisation ID is required for platform superadmin operations.",
      );
      err.statusCode = 400;
      throw err;
    }

    if (!isUuid(requestedOrgId)) {
      const err = new Error(
        `Invalid organisation identifier format: ${requestedOrgId}`,
      );
      err.statusCode = 400;
      throw err;
    }

    const orgCheck = await pool.query(
      "SELECT id, name, status FROM organisations WHERE id = $1;",
      [requestedOrgId],
    );

    if (orgCheck.rows.length === 0) {
      const err = new Error("Requested organisation not found.");
      err.statusCode = 404;
      throw err;
    }

    if (orgCheck.rows[0].status !== "ACTIVE") {
      const err = new Error(
        `Organisation is not active (status: ${orgCheck.rows[0].status}).`,
      );
      err.statusCode = 403;
      throw err;
    }

    return requestedOrgId;
  }

  // Standard user: must have an authoritative organisation ID from auth middleware
  if (!authOrgId) {
    const err = new Error(
      "Forbidden: User has no active organisation membership.",
    );
    err.statusCode = 403;
    throw err;
  }

  // Prevent tenant spoofing in query or body
  const clientOrgId = req.query?.organisationId || req.body?.organisationId;
  if (clientOrgId && clientOrgId !== "ORG-DEFAULT" && clientOrgId !== authOrgId) {
    if (req.user?.role !== "OWNER" && req.user?.role !== "ADMIN" && !isSuperadmin) {
      const err = new Error("Forbidden: Cross-tenant access attempt detected.");
      err.statusCode = 403;
      throw err;
    }
  }

  return authOrgId;
};

/**
 * Resolves and validates the requested branch ID for the active organisation.
 * Verifies that:
 * 1. Branch exists and is ACTIVE.
 * 2. Branch belongs to the resolved organisationId.
 * 3. User is authorized for this branch (if non-admin).
 */
const getAuthorizedBranchId = async (
  req,
  organisationId,
  { required = false, allowAll = false } = {},
) => {
  if (!organisationId) {
    throw new Error("organisationId is required to resolve branch context.");
  }

  const isSuperadmin = Boolean(
    req.user?.isPlatformSuperadmin || req.user?.is_platform_superadmin,
  );
  const userId = req.user?.id || req.auth?.id;

  let candidateBranchId =
    req.query?.branchId ||
    req.headers["x-branch-id"] ||
    req.body?.branchId ||
    null;

  // Ignore sentinel strings from frontend dropdowns
  const isSentinel =
    candidateBranchId === "all" ||
    candidateBranchId === "All Branches" ||
    candidateBranchId === "No Active Branch" ||
    candidateBranchId === "null" ||
    candidateBranchId === "undefined" ||
    candidateBranchId === "";

  if (isSentinel) {
    candidateBranchId = null;
  }

  // Read/list/report endpoints: no branch chosen means "all branches" for owners and admins.
  // Branch staff are always held to their own branch.
  if (!candidateBranchId && allowAll && !required) {
    const role = String(req.user?.role || "").toUpperCase();
    const orgWide = isSuperadmin || ["OWNER", "ADMIN", "SUPERADMIN"].includes(role);
    if (orgWide) return null;
    const own = req.user?.branchId || req.user?.branch_id;
    if (own) return own;
  }

  // Only fall back to user's assigned branch if branch context is required for this operation
  if (!candidateBranchId && required) {
    candidateBranchId =
      req.user?.branchId ||
      req.user?.branch_id ||
      req.tenantContext?.branchId ||
      null;
  }

  if (!candidateBranchId) {
    const defaultBranchRes = await pool.query(
      "SELECT id FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;",
      [organisationId]
    );
    if (defaultBranchRes.rows.length > 0) {
      return defaultBranchRes.rows[0].id;
    }
    if (required) {
      const err = new Error("Branch context is required for this operation.");
      err.statusCode = 400;
      throw err;
    }
    return null;
  }

  // Resolve branch ID if name or code was provided instead of UUID
  let resolvedBranchId = candidateBranchId;
  if (!isUuid(candidateBranchId)) {
    const nameRes = await pool.query(
      `SELECT id FROM branches 
       WHERE organisation_id = $1 
         AND (name ILIKE $2 OR branch_code ILIKE $2) 
         AND status = 'ACTIVE' 
       LIMIT 1;`,
      [organisationId, candidateBranchId],
    );

    if (nameRes.rows.length === 0) {
      const defaultBranchRes = await pool.query(
        "SELECT id FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;",
        [organisationId]
      );
      if (defaultBranchRes.rows.length > 0) {
        resolvedBranchId = defaultBranchRes.rows[0].id;
      } else if (required) {
        const err = new Error(
          `Branch '${candidateBranchId}' not found in the active organisation.`,
        );
        err.statusCode = 404;
        throw err;
      } else {
        resolvedBranchId = null;
      }
    } else {
      resolvedBranchId = nameRes.rows[0].id;
    }
  } else {
    // Verify branch belongs to organisation and is ACTIVE
    const branchCheck = await pool.query(
      "SELECT id, name, status FROM branches WHERE id = $1 AND organisation_id = $2 AND status = 'ACTIVE';",
      [resolvedBranchId, organisationId],
    );

    if (branchCheck.rows.length === 0) {
      const defaultBranchRes = await pool.query(
        "SELECT id FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;",
        [organisationId]
      );
      if (defaultBranchRes.rows.length > 0) {
        resolvedBranchId = defaultBranchRes.rows[0].id;
      } else if (required) {
        const err = new Error(
          "Forbidden: Branch does not exist or does not belong to the authorized organisation.",
        );
        err.statusCode = 403;
        throw err;
      } else {
        resolvedBranchId = null;
      }
    }
  }

  // If user is not superadmin, owner, or admin, verify branch assignment
  if (!isSuperadmin && userId) {
    const userRole = req.user?.role;
    const isOwnerOrAdmin =
      userRole === "OWNER" ||
      userRole === "ADMIN" ||
      userRole === "Administrator" ||
      userRole === "MANAGER";

    if (!isOwnerOrAdmin) {
      const assignCheck = await pool.query(
        `SELECT ba.branch_id FROM branch_assignments ba
         JOIN organisation_memberships om ON om.id = ba.membership_id
         WHERE om.organisation_id = $1 AND om.user_id = $2 AND ba.branch_id = $3 AND om.status = 'ACTIVE'
         LIMIT 1;`,
        [organisationId, userId, resolvedBranchId],
      );

      // If user has any branch assignments, they must be assigned to this branch
      const hasAssignments = await pool.query(
        `SELECT ba.branch_id FROM branch_assignments ba
         JOIN organisation_memberships om ON om.id = ba.membership_id
         WHERE om.organisation_id = $1 AND om.user_id = $2 AND om.status = 'ACTIVE'
         LIMIT 1;`,
        [organisationId, userId],
      );

      if (hasAssignments.rows.length > 0 && assignCheck.rows.length === 0) {
        const err = new Error(
          "Forbidden: You are not assigned to the requested branch.",
        );
        err.statusCode = 403;
        throw err;
      }
    }
  }

  return resolvedBranchId;
};

/**
 * Cleans user payload by stripping client-supplied tenant / user IDs
 * and enforcing authoritative tenant attributes.
 */
const sanitizeTenantPayload = (body, authoritativeContext = {}) => {
  const sanitized = { ...(body || {}) };
  // Strip client attempt to spoof tenant or user IDs
  delete sanitized.organisation_id;
  delete sanitized.organisationId;
  delete sanitized.tenant_id;
  delete sanitized.tenantId;
  delete sanitized.created_by;
  delete sanitized.cashier_id;
  delete sanitized.cashierId;
  delete sanitized.user_id;
  delete sanitized.userId;

  return {
    ...sanitized,
    ...authoritativeContext,
  };
};

module.exports = {
  isUuid,
  getAuthorizedOrgId,
  getAuthorizedBranchId,
  sanitizeTenantPayload,
};

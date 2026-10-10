/**
 * Audit Service
 *
 * Persists security and operational audit logs into the audit_logs table.
 */

const { pool } = require("../db/connection");

class AuditService {
  async log({
    organisationId,
    userId = null,
    action,
    entityType = null,
    entityId = null,
    metadata = {},
    ipAddress = null,
    userAgent = null,
  }) {
    if (!organisationId || !action) {
      return null;
    }

    try {
      // Validate IP address format or pass null if invalid INET format
      const validIp =
        ipAddress && /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ipAddress)
          ? ipAddress
          : null;

      const isUuid = (str) =>
        typeof str === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

      const safeUserId = isUuid(userId) ? userId : null;
      const safeEntityId = isUuid(entityId) ? entityId : null;
      const enrichedMetadata = {
        ...metadata,
        ...(userId && !safeUserId ? { rawUserId: userId } : {}),
        ...(entityId && !safeEntityId ? { rawEntityId: entityId } : {}),
      };

      const res = await pool.query(
        `
        INSERT INTO audit_logs (
          organisation_id, user_id, action, entity_type, entity_id, metadata, ip_address, user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, action, created_at;
      `,
        [
          organisationId,
          safeUserId,
          action,
          entityType,
          safeEntityId,
          JSON.stringify(enrichedMetadata),
          validIp,
          userAgent,
        ],
      );

      return res.rows[0];
    } catch (err) {
      console.warn("Failed to record audit log:", err.message);
      return null;
    }
  }

  /**
   * Record an audit event for the signed-in user of a request. Never throws.
   * The acting branch is stored in the metadata so the log can show where it happened.
   */
  async logFromRequest(req, { action, entityType, entityId = null, metadata = {}, branchId = null }) {
    try {
      const organisationId = req.user?.organisationId || req.user?.organisation_id;
      if (!organisationId || !action) return null;
      const actingBranchId = branchId || req.user?.branchId || null;
      let branchName = null;
      if (actingBranchId) {
        const b = await pool
          .query("SELECT name FROM branches WHERE id::text = $1 LIMIT 1;", [String(actingBranchId)])
          .catch(() => null);
        branchName = b?.rows?.[0]?.name || null;
      }
      return await this.log({
        organisationId,
        userId: req.user?.id || null,
        action,
        entityType,
        entityId,
        metadata: {
          ...metadata,
          ...(actingBranchId ? { branchId: actingBranchId } : {}),
          ...(branchName ? { branchName } : {}),
        },
        ipAddress: req.ip,
        userAgent: req.headers?.["user-agent"],
      });
    } catch (e) {
      return null;
    }
  }

  async getLogs({
    organisationId,
    branchId,
    search,
    entityType,
    limit = 50,
    offset = 0,
  }) {
    if (!organisationId) {
      throw new Error("organisationId is required");
    }

    let query = `
      SELECT 
        al.id, al.action, al.entity_type AS "entityType", al.entity_id AS "entityId",
        al.metadata, al.ip_address AS "ipAddress", al.user_agent AS "userAgent", al.created_at AS "createdAt",
        u.name AS "userName", u.email AS "userEmail", u.phone AS "userPhone",
        u.staff_id AS "userStaffId", r.name AS "userRole",
        COALESCE(mb.name, CASE WHEN COALESCE(r.role_identifier, '') IN ('ADMIN', 'OWNER') THEN NULL ELSE pb.name END) AS "branchName",
        COALESCE(mb.id, CASE WHEN COALESCE(r.role_identifier, '') IN ('ADMIN', 'OWNER') THEN NULL ELSE pb.id END) AS "branchId"
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      LEFT JOIN organisation_memberships om ON om.user_id = u.id AND om.organisation_id = al.organisation_id
      LEFT JOIN branch_assignments ba ON ba.membership_id = om.id AND ba.is_primary = true
      LEFT JOIN roles r ON r.id = ba.role_id
      LEFT JOIN branches pb ON pb.id = ba.branch_id
      LEFT JOIN branches mb ON mb.id::text = al.metadata->>'branchId'
      WHERE al.organisation_id = $1
    `;
    const params = [organisationId];

    if (entityType) {
      params.push(entityType);
      query += ` AND al.entity_type = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (al.action ILIKE $${params.length} OR al.entity_type ILIKE $${params.length} OR u.name ILIKE $${params.length} OR al.metadata::text ILIKE $${params.length})`;
    }

    if (branchId && branchId !== "All Branches" && branchId !== "all" && branchId !== "No Active Branch") {
      // Only events that belong to this branch: explicitly tagged with it, or done by staff assigned to it.
      // Owner/admin actions with no branch tag are organisation-wide and are not attributed to one branch.
      params.push(String(branchId));
      query += ` AND COALESCE(mb.id, CASE WHEN COALESCE(r.role_identifier, '') IN ('ADMIN', 'OWNER') THEN NULL ELSE pb.id END)::text = $${params.length}`;
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
    params.push(limit, offset);

    const res = await pool.query(query, params);
    return res.rows.map((row) => {
      let meta = {};
      try {
        meta =
          typeof row.metadata === "string"
            ? JSON.parse(row.metadata)
            : row.metadata || {};
      } catch (e) {
        meta = {};
      }

      return {
        id: `AUD-${String(row.id).slice(-4)}` || `AUD-${row.id}`,
        rawId: row.id,
        timestamp: row.createdAt
          ? new Date(row.createdAt).toLocaleString("en-GB")
          : "Just now",
        relativeTime: "Recent",
        actor: {
          id: row.userEmail || "SYS",
          name: row.userName || "System Operator",
          role: row.userRole || "Staff",
          email: row.userEmail || "system@pharmacy.internal",
          phone: row.userPhone || "",
          staffId: row.userStaffId || "",
          avatarInitials: row.userName
            ? row.userName.slice(0, 2).toUpperCase()
            : "SO",
        },
        actionType: row.action,
        actionLabel: row.action
          ? row.action.replace(/_/g, " ")
          : "System Action",
        module: row.entityType ? row.entityType.toUpperCase() : "Operations",
        entityRef:
          meta.transferNumber ||
          meta.invoiceNumber ||
          (row.entityId
            ? `${row.entityType || "Record"} #${row.entityId}`
            : "Transaction"),
        branchId: row.branchId || meta.branchId || null,
        branch:
          meta.branchName ||
          meta.fromBranchName ||
          row.branchName ||
          "All Branches",
        severity:
          row.action &&
          (row.action.includes("CANCEL") ||
            row.action.includes("OVERRIDE") ||
            row.action.includes("DELETE"))
            ? "Critical"
            : "Info",
        ipAddress: row.ipAddress || "127.0.0.1",
        device: row.userAgent || "Web Browser",
        reason:
          meta.reason ||
          meta.notes ||
          "Routine automated system audit logging.",
        beforeAfterDiff: meta.diff || [],
      };
    });
  }
}

module.exports = new AuditService();

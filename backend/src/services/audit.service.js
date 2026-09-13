/**
 * Audit Service
 *
 * Persists security and operational audit logs into the audit_logs table.
 */

const { pool } = require('../db/connection');

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
      const validIp = (ipAddress && /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ipAddress)) ? ipAddress : null;

      const res = await pool.query(`
        INSERT INTO audit_logs (
          organisation_id, user_id, action, entity_type, entity_id, metadata, ip_address, user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, action, created_at;
      `, [
        organisationId,
        userId,
        action,
        entityType,
        entityId,
        JSON.stringify(metadata),
        validIp,
        userAgent,
      ]);

      return res.rows[0];
    } catch (err) {
      console.warn('Failed to record audit log:', err.message);
      return null;
    }
  }

  async getLogs({ organisationId, branchId, search, entityType, limit = 50, offset = 0 }) {
    if (!organisationId) {
      throw new Error('organisationId is required');
    }

    let query = `
      SELECT 
        al.id, al.action, al.entity_type AS "entityType", al.entity_id AS "entityId",
        al.metadata, al.ip_address AS "ipAddress", al.user_agent AS "userAgent", al.created_at AS "createdAt",
        u.name AS "userName", u.email AS "userEmail", r.name AS "userRole"
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      LEFT JOIN organisation_memberships om ON om.user_id = u.id AND om.organisation_id = al.organisation_id
      LEFT JOIN roles r ON r.id = om.role_id
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

    if (branchId && branchId !== 'All Branches' && branchId !== 'all') {
      params.push(`%${branchId}%`);
      query += ` AND (al.metadata::text ILIKE $${params.length})`;
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
    params.push(limit, offset);

    const res = await pool.query(query, params);
    return res.rows.map((row) => {
      let meta = {};
      try {
        meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
      } catch (e) {
        meta = {};
      }

      return {
        id: `AUD-${String(row.id).slice(-4)}` || `AUD-${row.id}`,
        rawId: row.id,
        timestamp: row.createdAt ? new Date(row.createdAt).toLocaleString('en-GB') : 'Just now',
        relativeTime: 'Recent',
        actor: {
          id: row.userEmail || 'SYS',
          name: row.userName || 'System Operator',
          role: row.userRole || 'Staff',
          email: row.userEmail || 'system@pharmacy.internal',
          avatarInitials: (row.userName ? row.userName.slice(0, 2).toUpperCase() : 'SO'),
        },
        actionType: row.action,
        actionLabel: row.action ? row.action.replace(/_/g, ' ') : 'System Action',
        module: row.entityType ? row.entityType.toUpperCase() : 'Operations',
        entityRef: meta.transferNumber || meta.invoiceNumber || (row.entityId ? `${row.entityType || 'Record'} #${row.entityId}` : 'Transaction'),
        branch: meta.branchName || meta.fromBranchName || (branchId && branchId !== 'All Branches' ? branchId : 'Main Branch'),
        severity: row.action && (row.action.includes('CANCEL') || row.action.includes('OVERRIDE') || row.action.includes('DELETE')) ? 'Critical' : 'Info',
        ipAddress: row.ipAddress || '127.0.0.1',
        device: row.userAgent || 'Web Browser',
        reason: meta.reason || meta.notes || 'Routine automated system audit logging.',
        beforeAfterDiff: meta.diff || [],
      };
    });
  }
}

module.exports = new AuditService();

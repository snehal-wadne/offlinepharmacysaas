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

  async getLogs({ organisationId, entityType, limit = 50, offset = 0 }) {
    if (!organisationId) {
      throw new Error('organisationId is required');
    }

    let query = `
      SELECT 
        al.id, al.action, al.entity_type AS "entityType", al.entity_id AS "entityId",
        al.metadata, al.ip_address AS "ipAddress", al.created_at AS "createdAt",
        u.name AS "userName", u.email AS "userEmail"
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.organisation_id = $1
    `;
    const params = [organisationId];

    if (entityType) {
      query += ` AND al.entity_type = $2`;
      params.push(entityType);
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
    params.push(limit, offset);

    const res = await pool.query(query, params);
    return res.rows;
  }
}

module.exports = new AuditService();

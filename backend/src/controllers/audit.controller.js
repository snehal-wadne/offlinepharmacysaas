/**
 * Audit Log Controller
 *
 * Exposes Express request handlers for retrieving system and security audit trails.
 */

const auditService = require('../services/audit.service');
const { pool } = require('../db/connection');

const getOrgId = async (req) => {
  if (req.user && (req.user.organisationId || req.user.organisation_id)) {
    return req.user.organisationId || req.user.organisation_id;
  }
  if (req.tenant && req.tenant.organisationId) return req.tenant.organisationId;
  if (req.headers['x-organisation-id']) return req.headers['x-organisation-id'];
  if (req.query && req.query.organisationId) return req.query.organisationId;

  // Resolve from user's active membership
  if (req.user?.id) {
    try {
      const memRes = await pool.query(
        "SELECT organisation_id FROM organisation_memberships WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1;",
        [req.user.id]
      );
      if (memRes.rows.length > 0) {
        return memRes.rows[0].organisation_id;
      }
    } catch (e) {}
  }

  // Fallback to first active organisation in DB
  try {
    const anyOrg = await pool.query(
      "SELECT id FROM organisations WHERE status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;"
    );
    if (anyOrg.rows.length > 0) {
      return anyOrg.rows[0].id;
    }
  } catch (e) {}

  return null;
};

const getAuditLogs = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    const { branchId, search, entityType, limit, offset } = req.query;

    const logs = await auditService.getLogs({
      organisationId,
      branchId: branchId || req.headers['x-branch-id'],
      search,
      entityType,
      limit: Number(limit) || 100,
      offset: Number(offset) || 0,
    });

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch audit logs',
    });
  }
};

const createAuditLog = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ success: false, error: 'Organisation context required.' });
    }

    const { action, entityType, entityId, metadata, reason } = req.body;
    const logResult = await auditService.log({
      organisationId,
      userId: req.user?.id || null,
      action: action || 'TRACK_ACTION',
      entityType: entityType || 'USER',
      entityId: entityId || req.user?.id,
      metadata: {
        ...(metadata || {}),
        reason: reason || metadata?.reason || 'User action tracking verified.',
        userName: req.user?.name || metadata?.userName || 'Staff User',
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      success: true,
      data: logResult,
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to record audit log',
    });
  }
};

module.exports = {
  getAuditLogs,
  createAuditLog,
};


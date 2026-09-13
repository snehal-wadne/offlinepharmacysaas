/**
 * Audit Log Controller
 *
 * Exposes Express request handlers for retrieving system and security audit trails.
 */

const auditService = require('../services/audit.service');

const getOrgId = async (req) => {
  if (req.user && req.user.organisationId) return req.user.organisationId;
  if (req.tenant && req.tenant.organisationId) return req.tenant.organisationId;
  if (req.headers['x-organisation-id']) return req.headers['x-organisation-id'];
  if (req.query && req.query.organisationId) return req.query.organisationId;
  return null;
};

const getAuditLogs = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    const { branchId, search, entityType, limit, offset } = req.query;

    const logs = await auditService.getLogs({
      organisationId: organisationId || 'ORG-FIT-001',
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

module.exports = {
  getAuditLogs,
};

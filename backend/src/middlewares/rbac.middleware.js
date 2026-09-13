/**
 * RBAC Permission Middleware
 *
 * Enforces role-based permissions against the 139 permissions in PostgreSQL.
 * Role 'ADMIN' has full system clearance.
 */

const { pool } = require('../db/connection');

const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required for this resource.',
        });
      }

      // ADMIN role has wildcard permission bypass
      if (user.role === 'ADMIN' || user.role === 'OWNER') {
        return next();
      }

      if (!user.roleId) {
        return res.status(403).json({
          success: false,
          message: `Access denied. No active role assignment for user.`,
        });
      }

      const permRes = await pool.query(`
        SELECT 1
        FROM role_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1 AND p.name = $2
        LIMIT 1;
      `, [user.roleId, permissionName]);

      if (permRes.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: `Forbidden. Missing required permission: ${permissionName}`,
        });
      }

      next();
    } catch (err) {
      console.error('RBAC middleware error:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Permission verification failed.',
      });
    }
  };
};

module.exports = {
  requirePermission,
};

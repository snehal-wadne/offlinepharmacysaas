/**
 * Authentication Middleware
 *
 * Extracts and validates bearer tokens, resolving the authenticated user,
 * organisation tenancy, and branch context from PostgreSQL.
 */

const { pool } = require('../db/connection');
const { verifyToken } = require('../utils/token.util');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const hasAuthHeader = Boolean(authHeader && authHeader.trim());
    let userId = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token);
      if (decoded && decoded.userId) {
        userId = decoded.userId;
      }
    }

    // Development-only fallback: must be explicitly opted into via ALLOW_DEV_AUTH=true.
    // Previously this activated by default whenever NODE_ENV wasn't 'production',
    // which meant any request with no Authorization header silently authenticated
    // as the first active user (effectively an unauthenticated admin session).
    if (!hasAuthHeader && process.env.ALLOW_DEV_AUTH === 'true') {
      const fallbackUserRes = await pool.query(`
        SELECT 
          u.id, u.name, u.email, u.phone, u.staff_id AS "staffId",
          om.organisation_id, ba.branch_id, r.id AS role_id, r.name AS role_name, r.role_identifier
        FROM users u
        LEFT JOIN organisation_memberships om ON om.user_id = u.id
        LEFT JOIN branch_assignments ba ON ba.membership_id = om.id
        LEFT JOIN roles r ON r.id = ba.role_id
        WHERE u.status = 'ACTIVE'
        ORDER BY u.created_at ASC
        LIMIT 1;
      `);

      if (fallbackUserRes.rows.length > 0) {
        const devUser = fallbackUserRes.rows[0];
        
        // Resolve default organisation if membership not yet recorded
        if (!devUser.organisation_id) {
          const orgRes = await pool.query('SELECT id FROM organisations LIMIT 1;');
          devUser.organisation_id = orgRes.rows[0]?.id || null;
        }
        if (!devUser.branch_id && devUser.organisation_id) {
          const branchRes = await pool.query('SELECT id FROM branches WHERE organisation_id = $1 LIMIT 1;', [devUser.organisation_id]);
          devUser.branch_id = branchRes.rows[0]?.id || null;
        }

        req.user = {
          id: devUser.id,
          name: devUser.name,
          email: devUser.email,
          role: devUser.role_identifier || devUser.role_name || 'ADMIN',
          roleId: devUser.role_id,
          organisationId: devUser.organisation_id,
          branchId: devUser.branch_id,
        };
        return next();
      }
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or missing authentication token.',
      });
    }

    const userRes = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.staff_id AS "staffId",
        om.organisation_id, ba.branch_id, r.id AS role_id, r.name AS role_name, r.role_identifier
      FROM users u
      LEFT JOIN organisation_memberships om ON om.user_id = u.id
      LEFT JOIN branch_assignments ba ON ba.membership_id = om.id
      LEFT JOIN roles r ON r.id = ba.role_id
      WHERE u.id = $1 AND u.status = 'ACTIVE'
      LIMIT 1;
    `, [userId]);

    if (userRes.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token or inactive user account.',
      });
    }

    const user = userRes.rows[0];
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role_identifier || user.role_name || 'CASHIER',
      roleId: user.role_id,
      organisationId: user.organisation_id,
      branchId: user.branch_id,
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Authentication error occurred.',
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

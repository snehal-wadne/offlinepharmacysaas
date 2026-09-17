/**
 * PostgreSQL Authentication Service
 *
 * Provides:
 * 1. Email/Phone/StaffId and Password Authentication against PostgreSQL
 * 2. Cashier Quick PIN Authentication
 * 3. User Registration and Role/Branch Assignment in PostgreSQL
 */

const bcrypt = require("bcrypt");
const { pool } = require("../db/connection");
const { signToken } = require("../utils/token.util");

class AuthService {
  /**
   * Authenticate with email/phone and password against PostgreSQL
   */
  async login({ emailOrPhone, password, branchId }) {
    if (!emailOrPhone) {
      throw new Error("Email or phone number is required.");
    }

    const cleanIdentifier = emailOrPhone.trim().toLowerCase();

    // 1. Query user from PostgreSQL
    const query = `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.phone, 
        u.staff_id AS "staffId",
        u.status, 
        u.password_hash,
        om.organisation_id,
        ba.branch_id,
        r.name AS role_name,
        r.role_identifier,
        o.name AS organisation_name
      FROM users u
      LEFT JOIN organisation_memberships om ON om.user_id = u.id
      LEFT JOIN organisations o ON o.id = om.organisation_id
      LEFT JOIN branch_assignments ba ON ba.membership_id = om.id
      LEFT JOIN roles r ON r.id = ba.role_id
      WHERE (LOWER(u.email) = $1 OR u.phone = $1 OR LOWER(u.staff_id) = $1)
        AND u.status = 'ACTIVE'
      LIMIT 1;
    `;

    const res = await pool.query(query, [cleanIdentifier]);
    const user = res.rows[0];

    if (!user) {
      throw new Error("Invalid email, phone number, or password.");
    }

    if (!user.password_hash) {
      throw new Error(
        "This account has no password configured. Use Google Sign-In or contact your administrator.",
      );
    }

    const match = await bcrypt
      .compare(password, user.password_hash)
      .catch(() => false);
    if (!match) {
      throw new Error("Invalid credentials.");
    }

    // Resolve organisation if not set on user
    if (!user.organisation_id) {
      // 1. Check if user is owner of an active organisation
      const ownerOrgRes = await pool.query(
        "SELECT id, name FROM organisations WHERE owner_id = $1 AND status = 'ACTIVE' LIMIT 1;",
        [user.id],
      );
      if (ownerOrgRes.rows.length > 0) {
        user.organisation_id = ownerOrgRes.rows[0].id;
        user.organisation_name = ownerOrgRes.rows[0].name;
      } else {
        // 2. Check active membership in organisation_memberships
        const memRes = await pool.query(
          `SELECT o.id, o.name FROM organisations o
           JOIN organisation_memberships om ON om.organisation_id = o.id
           WHERE om.user_id = $1 AND om.status = 'ACTIVE' AND o.status = 'ACTIVE'
           ORDER BY om.created_at ASC LIMIT 1;`,
          [user.id],
        );
        if (memRes.rows.length > 0) {
          user.organisation_id = memRes.rows[0].id;
          user.organisation_name = memRes.rows[0].name;
        }
      }
    }

    // Resolve branch strictly within user's organisation
    let branch = null;
    if (branchId && user.organisation_id) {
      const branchRes = await pool.query(
        "SELECT id, name, branch_code AS \"branchCode\" FROM branches WHERE id = $1 AND organisation_id = $2 AND status = 'ACTIVE' LIMIT 1;",
        [branchId, user.organisation_id],
      );
      if (branchRes.rows.length > 0) {
        branch = branchRes.rows[0];
      }
    }
    if (!branch && user.organisation_id) {
      const defaultBranchRes = await pool.query(
        "SELECT id, name, branch_code AS \"branchCode\" FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;",
        [user.organisation_id],
      );
      branch = defaultBranchRes.rows[0] || null;
    }

    const token = signToken({ userId: user.id, email: user.email });

    return {
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        staffId: user.staffId,
        role: user.role_identifier || user.role_name || "ADMIN",
        roleName: user.role_name || "Administrator",
        organisationId: user.organisation_id,
        organisationName: user.organisation_name || "Falah Pharmacy",
        branchId: branch?.id,
        branch: branch?.name || "Main Branch",
        isOffline: false,
      },
    };
  }

  /**
   * Quick PIN authentication for cashiers
   */
  async pinLogin({ pin }) {
    if (!pin) {
      throw new Error("PIN is required.");
    }

    // There is currently no per-user PIN column in the schema (users table has no
    // pin_hash / cashier_pin field). This previously authenticated as whichever
    // active user was created first regardless of the PIN entered - i.e. any
    // 4-digit guess logged a stranger in as that account. Failing closed here
    // until a real per-user PIN hash is added to the schema and checked here.
    throw new Error(
      "Quick PIN login is not yet configured for this account. Please sign in with email/phone and password.",
    );
  }

  /**
   * Register a new user in PostgreSQL
   */
  async register(userData) {
    const { email, password, name, phone, roleId, organisationId } = userData;

    if (!email || !name) {
      throw new Error("Email and name are required.");
    }

    const existingRes = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1;",
      [email.trim().toLowerCase()],
    );
    if (existingRes.rows.length > 0) {
      throw new Error("User with this email already exists.");
    }

    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const insertUserRes = await pool.query(
      `
      INSERT INTO users (name, email, password_hash, phone, status)
      VALUES ($1, $2, $3, $4, 'ACTIVE')
      RETURNING id, name, email, phone, status, created_at;
    `,
      [name.trim(), email.trim().toLowerCase(), passwordHash, phone || null],
    );

    const newUser = insertUserRes.rows[0];

    // If organisationId provided, add organisation membership
    if (organisationId) {
      await pool
        .query(
          `
        INSERT INTO organisation_memberships (organisation_id, user_id, role_id)
        VALUES ($1, $2, $3);
      `,
          [organisationId, newUser.id, roleId || null],
        )
        .catch((err) => {
          console.warn("Membership assignment notice:", err.message);
        });
    }

    return {
      success: true,
      message: "User registered successfully",
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: "STAFF",
      },
    };
  }

  /**
   * Google OAuth Login / Authentication for Owner & Staff
   */
  async googleLogin({ email, name, googleSub, role, branchId }) {
    if (!email) {
      throw new Error("Google email is required.");
    }

    const cleanEmail = email.trim().toLowerCase();
    const effectiveSub = googleSub || `google_${cleanEmail}_${Date.now()}`;

    // 1. Check if user already exists
    const userRes = await pool.query(
      `SELECT id, name, email, phone, staff_id AS "staffId", status, google_sub
       FROM users
       WHERE (LOWER(email) = $1 OR (google_sub IS NOT NULL AND google_sub = $2))
         AND status = 'ACTIVE'
       LIMIT 1;`,
      [cleanEmail, effectiveSub],
    );
    let user = userRes.rows[0];

    if (!user) {
      // Create new user in PostgreSQL without automatic organisation assignment
      const displayName =
        name || cleanEmail.split("@")[0].replace(".", " ").toUpperCase();
      const insertRes = await pool.query(
        `INSERT INTO users (name, email, google_sub, status)
         VALUES ($1, $2, $3, 'ACTIVE')
         RETURNING id, name, email, google_sub, status;`,
        [displayName, cleanEmail, effectiveSub],
      );
      user = insertRes.rows[0];
    } else if (googleSub && !user.google_sub) {
      await pool
        .query("UPDATE users SET google_sub = $1 WHERE id = $2;", [
          effectiveSub,
          user.id,
        ])
        .catch(() => {});
      user.google_sub = effectiveSub;
    }

    // 2. Resolve organisation context legitimately from database
    let organisationId = null;
    let organisationName = null;
    let isOwner = false;
    let roleIdentifier = "STAFF";
    let roleName = "Staff";

    // Check if user owns an active organisation
    const ownerOrgRes = await pool.query(
      "SELECT id, name, owner_id FROM organisations WHERE owner_id = $1 AND status = 'ACTIVE' LIMIT 1;",
      [user.id],
    );

    if (ownerOrgRes.rows.length > 0) {
      organisationId = ownerOrgRes.rows[0].id;
      organisationName = ownerOrgRes.rows[0].name;
      isOwner = true;
      roleIdentifier = "OWNER";
      roleName = "Pharmacy Owner";
    } else {
      // Check active membership in organisation_memberships
      const memRes = await pool.query(
        `SELECT om.organisation_id, o.name AS organisation_name, o.owner_id,
                r.name AS role_name, r.role_identifier
         FROM organisation_memberships om
         JOIN organisations o ON o.id = om.organisation_id AND o.status = 'ACTIVE'
         LEFT JOIN branch_assignments ba ON ba.membership_id = om.id
         LEFT JOIN roles r ON r.id = ba.role_id
         WHERE om.user_id = $1 AND om.status = 'ACTIVE'
         ORDER BY om.created_at ASC
         LIMIT 1;`,
        [user.id],
      );

      if (memRes.rows.length > 0) {
        const membership = memRes.rows[0];
        organisationId = membership.organisation_id;
        organisationName = membership.organisation_name;
        isOwner = membership.owner_id === user.id;
        roleIdentifier = isOwner
          ? "OWNER"
          : membership.role_identifier || "STAFF";
        roleName = isOwner ? "Pharmacy Owner" : membership.role_name || "Staff";
      }
    }

    // 3. Resolve branch strictly within resolved organisation
    let branch = null;
    if (organisationId) {
      if (branchId) {
        const branchRes = await pool.query(
          "SELECT id, name, branch_code AS \"branchCode\" FROM branches WHERE id = $1 AND organisation_id = $2 AND status = 'ACTIVE' LIMIT 1;",
          [branchId, organisationId],
        );
        if (branchRes.rows.length > 0) {
          branch = branchRes.rows[0];
        }
      }
      if (!branch) {
        const defaultBranchRes = await pool.query(
          "SELECT id, name, branch_code AS \"branchCode\" FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;",
          [organisationId],
        );
        branch = defaultBranchRes.rows[0] || null;
      }
    }

    const token = signToken({ userId: user.id, email: user.email });
    const displayName =
      name || user.name || cleanEmail.split("@")[0].toUpperCase();

    return {
      success: true,
      message: isOwner
        ? "Welcome Pharmacy Owner! Google Login successful."
        : "Google Login successful",
      token,
      user: {
        id: user.id,
        name: displayName,
        display_name: displayName,
        email: user.email,
        phone: user.phone || null,
        staffId: user.staffId || null,
        role: isOwner ? "OWNER" : roleIdentifier,
        roleName,
        accessLevel: isOwner
          ? "Owner"
          : roleIdentifier === "ADMIN"
            ? "Admin"
            : "Staff",
        isOwner: Boolean(isOwner),
        organisationId: organisationId || null,
        organisationName: organisationName || null,
        branchId: branch?.id || null,
        branch: branch?.name || null,
        isOffline: false,
        isGoogleAuth: true,
      },
    };
  }
}

module.exports = new AuthService();

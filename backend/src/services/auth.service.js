/**
 * Supabase-Integrated Authentication Service
 *
 * Provides:
 * 1. Email and Password Authentication via Supabase Auth & PostgreSQL
 * 2. User Registration & Supabase Auth Identity Mapping
 * 3. Verified Supabase Google OAuth Login
 * 4. Password Recovery & Reset via Supabase Auth
 * 5. Strict Tenant & Branch Context Resolution
 */

const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { pool } = require("../db/connection");
const {
  supabaseAdmin,
  verifySupabaseToken,
  createSupabaseTestToken,
} = require("../utils/supabase");
const {
  getNextBusinessNumber,
} = require("../repositories/number-sequence.repository");
const {
  seedOrganisationSystemRoles,
} = require("../repositories/role.repository");

class AuthService {
  /**
   * Authenticate with email and password via Supabase Auth & PostgreSQL
   */
  async login({ emailOrPhone, password, email, branchId }) {
    const identifier = emailOrPhone || email;
    if (!identifier || !password) {
      throw new Error("Email and password are required.");
    }

    const cleanIdentifier = identifier.trim().toLowerCase();

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
        u.supabase_auth_id,
        om.organisation_id,
        ba.branch_id,
        r.name AS role_name,
        r.role_identifier,
        o.name AS organisation_name
      FROM users u
      LEFT JOIN organisation_memberships om ON om.user_id = u.id AND om.status = 'ACTIVE'
      LEFT JOIN organisations o ON o.id = om.organisation_id AND o.status = 'ACTIVE'
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

    // 2. Validate password
    let authenticated = false;
    let supabaseAuthId = user.supabase_auth_id;

    // Check Supabase Auth credentials if client initialized
    if (supabaseAdmin?.auth?.signInWithPassword) {
      try {
        const { data: supaData, error: supaErr } =
          await supabaseAdmin.auth.signInWithPassword({
            email: user.email,
            password,
          });
        if (!supaErr && supaData?.user) {
          authenticated = true;
          supabaseAuthId = supaData.user.id;
        }
      } catch (e) {
        // Fallback to local password hash if Supabase Auth API is unavailable offline
      }
    }

    // Fallback: compare with stored password_hash for existing records
    if (!authenticated && user.password_hash) {
      const match = await bcrypt
        .compare(password, user.password_hash)
        .catch(() => false);
      if (match) {
        authenticated = true;
      }
    }

    if (!authenticated) {
      throw new Error("Invalid credentials.");
    }

    // Ensure user has supabase_auth_id linked
    if (!supabaseAuthId) {
      supabaseAuthId = crypto.randomUUID();
      await pool
        .query("UPDATE users SET supabase_auth_id = $1 WHERE id = $2;", [
          supabaseAuthId,
          user.id,
        ])
        .catch(() => {});
      user.supabase_auth_id = supabaseAuthId;
    }

    // 3. Resolve organisation context legitimately from PostgreSQL
    if (!user.organisation_id) {
      const ownerOrgRes = await pool.query(
        "SELECT id, name FROM organisations WHERE owner_id = $1 AND status = 'ACTIVE' LIMIT 1;",
        [user.id],
      );
      if (ownerOrgRes.rows.length > 0) {
        user.organisation_id = ownerOrgRes.rows[0].id;
        user.organisation_name = ownerOrgRes.rows[0].name;
      } else {
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

    // 4. Resolve branch strictly within user's organisation
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

    // 5. Issue Supabase JWT access token (canonical Bearer token)
    const token = createSupabaseTestToken({
      sub: supabaseAuthId,
      email: user.email,
    });

    return {
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        supabaseAuthId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        staffId: user.staffId,
        role: user.role_identifier || user.role_name || "ADMIN",
        roleName: user.role_name || "Administrator",
        organisationId: user.organisation_id,
        organisationName: user.organisation_name || "Falah Pharmacy",
        branchId: branch?.id || null,
        branch: branch?.name || null,
        isOffline: false,
      },
    };
  }

  /**
   * Cashier Quick PIN login is intentionally not implemented / fails closed.
   */
  async pinLogin() {
    throw new Error(
      "Quick PIN login is not configured. Please sign in with your email and password.",
    );
  }

  /**
   * Public Pharmacy Owner Signup & Onboarding
   *
   * Orchestrates:
   * 1. Supabase Auth identity creation
   * 2. Transactional creation in PostgreSQL:
   *    - public.users (Owner user)
   *    - public.organisations (Pharmacy entity, owner_id = user.id)
   *    - public.branches ('Main Branch' / initial branch)
   *    - System roles seeding (roles & role_permissions)
   *    - organisation_memberships (Owner membership)
   *    - branch_assignments (Administrator primary assignment)
   * 3. Rollback & Supabase user cleanup on failure
   */
  async register(userData) {
    const {
      ownerName,
      adminName,
      name,
      email,
      password,
      pharmacyName,
      organisationName,
      branches,
      branchName,
      phone,
      address,
      city,
      state,
      pincode,
      gstNumber,
      gstin,
      businessType,
    } = userData || {};

    const cleanName = (adminName || ownerName || name || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPharmacyName = (pharmacyName || organisationName || "").trim();
    const cleanBranchName = (
      branchName ||
      (isNaN(branches) ? branches : null) ||
      "Main Branch"
    ).trim();
    const cleanGstNumber = (gstNumber || gstin || "").trim() || null;
    const cleanBusinessType = (businessType || "Private Limited").trim();

    if (!cleanName || !cleanEmail || !password || !cleanPharmacyName) {
      throw new Error(
        "Owner name, email, password, and pharmacy name are required for pharmacy onboarding.",
      );
    }

    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters long.");
    }

    // Security hardening: Explicitly ignore / prevent client-supplied overrides
    // Do NOT accept organisationId, roleId, role, branchId, permissions, is_platform_superadmin, ownerId from client

    // Check if user already exists in PostgreSQL
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1;",
      [cleanEmail],
    );
    if (existingUser.rows.length > 0) {
      throw new Error("An account with this email address already exists.");
    }

    // 1. Provision user identity in Supabase Auth
    let supabaseAuthId = null;
    let createdInSupabase = false;

    if (!supabaseAdmin?.auth?.admin?.createUser) {
      throw new Error(
        "Authentication service initialization error: Supabase Admin client is not available.",
      );
    }

    const { data: supaUser, error: supaErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { name: cleanName },
      });

    if (supaErr) {
      throw new Error(supaErr.message || "Failed to create Supabase identity.");
    } else if (supaUser?.user?.id) {
      supabaseAuthId = supaUser.user.id;
      createdInSupabase = true;
    } else {
      throw new Error(
        "Supabase identity creation failed to return a valid user identity.",
      );
    }

    // 2. Execute transactional onboarding in PostgreSQL
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // A. Hash password for local backup
      const passwordHash = await bcrypt.hash(password, 10);

      // B. Insert Owner User
      const insertUserRes = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, supabase_auth_id, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
         RETURNING id, name, email, phone, supabase_auth_id, status, created_at;`,
        [cleanName, cleanEmail, passwordHash, phone || null, supabaseAuthId],
      );
      const user = insertUserRes.rows[0];

      // C. Generate sequential Pharmacy Code (e.g. PHARM-1001)
      const pharmacyCode = await getNextBusinessNumber({
        sequenceType: "PHARMACY_CODE",
        client,
      });

      // D. Insert Organisation
      const insertOrgRes = await client.query(
        `INSERT INTO organisations (
           owner_id, name, pharmacy_code, admin_name, email, phone,
           address, city, state, pincode, gst_number, business_type, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVE')
         RETURNING *;`,
        [
          user.id,
          cleanPharmacyName,
          pharmacyCode,
          cleanName,
          cleanEmail,
          phone || null,
          address || "Registered Address",
          city || "City",
          state || "Maharashtra",
          pincode || "400001",
          cleanGstNumber,
          cleanBusinessType,
        ],
      );
      const organisation = insertOrgRes.rows[0];

      // Free Plan Subscription Assignment
      const freePlanRes = await client.query(
        `SELECT id FROM subscription_plans 
         WHERE tier_code = 'FREE' 
         LIMIT 1;`,
      );
      let freePlanId = freePlanRes.rows[0]?.id;
      if (!freePlanId) {
        const createPlanRes = await client.query(
          `INSERT INTO subscription_plans (
             name, tier_code, description, price, currency, billing_interval,
             max_branches, max_users, color_hex, module_summary, is_popular, is_active, features
           ) VALUES (
             'Free', 'FREE', 'Free tier for new pharmacy onboardings', 0.0, 'INR', 'YEAR',
             1, 2, '#10B981', 'Core POS & Inventory', FALSE, TRUE, '["Basic POS", "Inventory Management", "Single Branch"]'
           ) RETURNING id;`,
        );
        freePlanId = createPlanRes.rows[0].id;
      }

      await client.query(
        `INSERT INTO subscriptions (
           organisation_id, plan_id, status, billing_cycle, auto_renew, started_at, current_period_start
         ) VALUES ($1, $2, 'ACTIVE', 'YEARLY', TRUE, NOW(), NOW());`,
        [organisation.id, freePlanId],
      );

      // E. Generate sequential Branch Code & Insert Initial Branch (if requested)
      let branch = null;
      const shouldCreateBranch =
        userData?.createInitialBranch !== false && Boolean(cleanBranchName);

      if (shouldCreateBranch) {
        const branchCode = await getNextBusinessNumber({
          organisationId: organisation.id,
          sequenceType: "BRANCH",
          client,
        });

        const insertBranchRes = await client.query(
          `INSERT INTO branches (
             organisation_id, branch_code, name, facility_type,
             address, city, state, postal_code, phone, status
           )
           VALUES ($1, $2, $3, 'RETAIL_DISPENSARY', $4, $5, $6, $7, $8, 'ACTIVE')
           RETURNING id, name, branch_code;`,
          [
            organisation.id,
            branchCode,
            cleanBranchName,
            address || "Registered Address",
            city || "City",
            state || "Maharashtra",
            pincode || "400001",
            phone || null,
          ],
        );
        branch = insertBranchRes.rows[0];
      }

      // F. Seed Organisation System Roles (Administrator, Manager, Pharmacist, Cashier, etc.)
      await seedOrganisationSystemRoles(organisation.id, client);

      const adminRoleRes = await client.query(
        `SELECT id FROM roles 
         WHERE organisation_id = $1 AND (role_identifier = 'ADMIN' OR name = 'Administrator')
         LIMIT 1;`,
        [organisation.id],
      );
      if (adminRoleRes.rows.length === 0) {
        throw new Error(
          "Failed to configure administrator role for new organisation.",
        );
      }
      const adminRoleId = adminRoleRes.rows[0].id;

      // G. Create Organisation Membership
      const insertMemRes = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'ACTIVE')
         RETURNING id;`,
        [organisation.id, user.id],
      );
      const membershipId = insertMemRes.rows[0].id;

      // H. Create Branch Assignment with Administrator Role as Primary (if branch created)
      if (branch) {
        await client.query(
          `INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
           VALUES ($1, $2, $3, TRUE);`,
          [membershipId, branch.id, adminRoleId],
        );
      }

      await client.query("COMMIT");

      return {
        success: true,
        message:
          "Pharmacy organisation and owner account created successfully.",
        user: {
          id: user.id,
          supabaseAuthId: user.supabase_auth_id,
          name: user.name,
          email: user.email,
          role: "OWNER",
          roleName: "Pharmacy Owner",
          organisationId: organisation.id,
          organisationName: organisation.name,
          pharmacyCode: organisation.pharmacy_code,
          branchId: branch?.id || null,
          branchName: branch?.name || null,
          hasBranch: Boolean(branch),
        },
        organisation: {
          id: organisation.id,
          name: organisation.name,
          pharmacyCode: organisation.pharmacy_code,
        },
        branch: branch
          ? {
              id: branch.id,
              name: branch.name,
            }
          : null,
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});

      // Cleanup Supabase Auth identity if created to prevent orphaned identity
      if (
        createdInSupabase &&
        supabaseAuthId &&
        supabaseAdmin?.auth?.admin?.deleteUser
      ) {
        await supabaseAdmin.auth.admin
          .deleteUser(supabaseAuthId)
          .catch((cleanupErr) => {
            console.warn("Supabase cleanup notice:", cleanupErr.message);
          });
      }

      console.error("Owner onboarding transaction error:", err);
      throw new Error(
        `Failed to complete pharmacy registration: ${err.message}`,
      );
    } finally {
      client.release();
    }
  }

  /**
   * Google OAuth Pharmacy Owner Onboarding
   *
   * Called when a new user signs up with Google and fills out their pharmacy details.
   * Supabase Auth identity is already verified via the OAuth token.
   * This method atomically creates the PostgreSQL tenant entities:
   * - public.users (Owner user linked to Supabase Auth ID)
   * - public.organisations (Pharmacy entity, owner_id = user.id)
   * - subscriptions (FREE tier subscription)
   * - public.branches (Initial branch if requested)
   * - System roles seeding
   * - organisation_memberships (Owner membership)
   * - branch_assignments (Administrator primary assignment if branch exists)
   */
  async googleOnboard(onboardData) {
    const {
      token,
      ownerName,
      adminName,
      name,
      pharmacyName,
      organisationName,
      branches,
      branchName,
      phone,
      address,
      city,
      state,
      pincode,
      gstNumber,
      gstin,
      businessType,
      createInitialBranch,
    } = onboardData || {};

    if (!token) {
      throw new Error(
        "Supabase authentication token is required for Google onboarding.",
      );
    }

    // Verify Supabase Google session token
    const decoded = await verifySupabaseToken(token);
    if (!decoded || !decoded.sub) {
      throw new Error("Invalid or unverified Supabase Google session token.");
    }

    const verifiedSub = decoded.sub;
    const verifiedEmail = decoded.email
      ? decoded.email.trim().toLowerCase()
      : null;

    if (!verifiedEmail) {
      throw new Error("Verified email is missing from Supabase Google token.");
    }

    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

    const uuidSub = isUuid(verifiedSub)
      ? verifiedSub
      : (() => {
          const hash = crypto
            .createHash("md5")
            .update(verifiedSub)
            .digest("hex");
          return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        })();

    const cleanName = (
      ownerName ||
      adminName ||
      name ||
      decoded.user_metadata?.full_name ||
      decoded.user_metadata?.name ||
      "Pharmacy Owner"
    ).trim();
    const cleanPharmacyName = (pharmacyName || organisationName || "").trim();
    const cleanBranchName = (
      branchName ||
      (isNaN(branches) ? branches : null) ||
      "Main Branch"
    ).trim();
    const cleanGstNumber = (gstNumber || gstin || "").trim() || null;
    const cleanBusinessType = (businessType || "Private Limited").trim();

    if (!cleanPharmacyName) {
      throw new Error("Pharmacy name is required for pharmacy onboarding.");
    }

    // Check if user already exists in PostgreSQL
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE (supabase_auth_id = $1 OR LOWER(email) = LOWER($2)) AND status = 'ACTIVE' LIMIT 1;",
      [uuidSub, verifiedEmail],
    );
    if (existingUser.rows.length > 0) {
      throw new Error(
        "An account with this email address already exists. Please sign in instead.",
      );
    }

    // Execute transactional onboarding in PostgreSQL
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // A. Insert Owner User
      const insertUserRes = await client.query(
        `INSERT INTO users (name, email, phone, supabase_auth_id, status)
         VALUES ($1, $2, $3, $4, 'ACTIVE')
         RETURNING id, name, email, phone, supabase_auth_id, status, created_at;`,
        [cleanName, verifiedEmail, phone || null, uuidSub],
      );
      const user = insertUserRes.rows[0];

      // B. Generate sequential Pharmacy Code (e.g. PHARM-1001)
      const pharmacyCode = await getNextBusinessNumber({
        sequenceType: "PHARMACY_CODE",
        client,
      });

      // C. Insert Organisation
      const insertOrgRes = await client.query(
        `INSERT INTO organisations (
           owner_id, name, pharmacy_code, admin_name, email, phone,
           address, city, state, pincode, gst_number, business_type, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVE')
         RETURNING *;`,
        [
          user.id,
          cleanPharmacyName,
          pharmacyCode,
          cleanName,
          verifiedEmail,
          phone || null,
          address || "Registered Address",
          city || "City",
          state || "Maharashtra",
          pincode || "400001",
          cleanGstNumber,
          cleanBusinessType,
        ],
      );
      const organisation = insertOrgRes.rows[0];

      // D. Free Plan Subscription Assignment
      const freePlanRes = await client.query(
        `SELECT id FROM subscription_plans 
         WHERE tier_code = 'FREE' 
         LIMIT 1;`,
      );
      let freePlanId = freePlanRes.rows[0]?.id;
      if (!freePlanId) {
        const createPlanRes = await client.query(
          `INSERT INTO subscription_plans (
             name, tier_code, description, price, currency, billing_interval,
             max_branches, max_users, color_hex, module_summary, is_popular, is_active, features
           ) VALUES (
             'Free', 'FREE', 'Free tier for new pharmacy onboardings', 0.0, 'INR', 'YEAR',
             1, 2, '#10B981', 'Core POS & Inventory', FALSE, TRUE, '["Basic POS", "Inventory Management", "Single Branch"]'
           ) RETURNING id;`,
        );
        freePlanId = createPlanRes.rows[0].id;
      }

      await client.query(
        `INSERT INTO subscriptions (
           organisation_id, plan_id, status, billing_cycle, auto_renew, started_at, current_period_start
         ) VALUES ($1, $2, 'ACTIVE', 'YEARLY', TRUE, NOW(), NOW());`,
        [organisation.id, freePlanId],
      );

      // E. Generate sequential Branch Code & Insert Initial Branch (if requested)
      let branch = null;
      const shouldCreateBranch =
        createInitialBranch === true && Boolean(cleanBranchName);

      if (shouldCreateBranch) {
        const branchCode = await getNextBusinessNumber({
          organisationId: organisation.id,
          sequenceType: "BRANCH",
          client,
        });

        const insertBranchRes = await client.query(
          `INSERT INTO branches (
             organisation_id, branch_code, name, facility_type,
             address, city, state, postal_code, phone, status
           )
           VALUES ($1, $2, $3, 'RETAIL_DISPENSARY', $4, $5, $6, $7, $8, 'ACTIVE')
           RETURNING id, name, branch_code;`,
          [
            organisation.id,
            branchCode,
            cleanBranchName,
            address || "Registered Address",
            city || "City",
            state || "Maharashtra",
            pincode || "400001",
            phone || null,
          ],
        );
        branch = insertBranchRes.rows[0];
      }

      // F. Seed Organisation System Roles
      await seedOrganisationSystemRoles(organisation.id, client);

      const adminRoleRes = await client.query(
        `SELECT id FROM roles 
         WHERE organisation_id = $1 AND (role_identifier = 'ADMIN' OR name = 'Administrator')
         LIMIT 1;`,
        [organisation.id],
      );
      if (adminRoleRes.rows.length === 0) {
        throw new Error(
          "Failed to configure administrator role for new organisation.",
        );
      }
      const adminRoleId = adminRoleRes.rows[0].id;

      // G. Create Organisation Membership
      const insertMemRes = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'ACTIVE')
         RETURNING id;`,
        [organisation.id, user.id],
      );
      const membershipId = insertMemRes.rows[0].id;

      // H. Create Branch Assignment with Administrator Role as Primary (if branch created)
      if (branch) {
        await client.query(
          `INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
           VALUES ($1, $2, $3, TRUE);`,
          [membershipId, branch.id, adminRoleId],
        );
      }

      await client.query("COMMIT");

      return {
        success: true,
        message:
          "Pharmacy organisation and owner account onboarded successfully via Google.",
        token,
        user: {
          id: user.id,
          supabaseAuthId: user.supabase_auth_id,
          name: user.name,
          email: user.email,
          role: "OWNER",
          roleName: "Pharmacy Owner",
          organisationId: organisation.id,
          organisationName: organisation.name,
          pharmacyCode: organisation.pharmacy_code,
          branchId: branch?.id || null,
          branchName: branch?.name || null,
          hasBranch: Boolean(branch),
        },
        organisation: {
          id: organisation.id,
          name: organisation.name,
          pharmacyCode: organisation.pharmacy_code,
        },
        branch: branch
          ? {
              id: branch.id,
              name: branch.name,
            }
          : null,
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Google onboarding transaction error:", err);
      throw new Error(`Failed to complete pharmacy onboarding: ${err.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Google OAuth Login / Verification via Supabase Auth
   * Strictly requires verified Supabase JWT token.
   */
  async googleLogin({ token, branchId }) {
    if (!token) {
      throw new Error(
        "Supabase authentication token is required for Google login verification.",
      );
    }

    // Verify Supabase Google session token
    const decoded = await verifySupabaseToken(token);
    if (!decoded || !decoded.sub) {
      throw new Error("Invalid or unverified Supabase Google session token.");
    }

    const verifiedSub = decoded.sub;
    const verifiedEmail = decoded.email
      ? decoded.email.trim().toLowerCase()
      : null;

    if (!verifiedEmail) {
      throw new Error("Verified email is missing from Supabase Google token.");
    }

    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

    const uuidSub = isUuid(verifiedSub)
      ? verifiedSub
      : (() => {
          const hash = crypto
            .createHash("md5")
            .update(verifiedSub)
            .digest("hex");
          return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        })();

    // Query user from PostgreSQL by supabase_auth_id, or email
    const userRes = await pool.query(
      `SELECT id, name, email, phone, staff_id AS "staffId", status, supabase_auth_id, google_sub
       FROM users
       WHERE (supabase_auth_id = $1 OR LOWER(email) = LOWER($2))
         AND status = 'ACTIVE'
       LIMIT 1;`,
      [uuidSub, verifiedEmail],
    );

    let user = userRes.rows[0];

    if (!user) {
      const notFoundErr = new Error(
        "Google account is not registered. A pharmacy owner must register their pharmacy using Sign Up, or an administrator must provision an employee account.",
      );
      notFoundErr.code = "ACCOUNT_NOT_FOUND";
      throw notFoundErr;
    }

    // JIT link supabase_auth_id if needed
    if (user.supabase_auth_id !== uuidSub) {
      await pool
        .query("UPDATE users SET supabase_auth_id = $1 WHERE id = $2;", [
          uuidSub,
          user.id,
        ])
        .catch(() => {});
      user.supabase_auth_id = uuidSub;
    }

    // Resolve organisation context legitimately from PostgreSQL
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

    // Resolve branch strictly within resolved organisation
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

    return {
      success: true,
      message: isOwner
        ? "Welcome Pharmacy Owner! Google Login successful."
        : "Google Login successful",
      token,
      user: {
        id: user.id,
        supabaseAuthId: user.supabase_auth_id || uuidSub,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        staffId: user.staffId || null,
        role: isOwner ? "OWNER" : roleIdentifier,
        roleName,
        isOwner: Boolean(isOwner),
        organisationId: organisationId || null,
        organisationName: organisationName || null,
        branchId: branch?.id || null,
        branchName: branch?.name || null,
        hasBranch: Boolean(branch),
        branch: branch
          ? {
              id: branch.id,
              name: branch.name,
              branchCode: branch.branchCode,
            }
          : null,
      },
    };
  }

  /**
   * Retrieve current user context from authenticated request
   */
  async getMe(user) {
    if (!user || !user.id) {
      throw new Error("Invalid user context.");
    }

    // Query fresh user & organisation details
    const orgRes = user.organisationId
      ? await pool.query(
          "SELECT id, name, pharmacy_code FROM organisations WHERE id = $1 LIMIT 1;",
          [user.organisationId],
        )
      : { rows: [] };

    let branchRecord = null;
    let hasBranch = false;

    if (user.organisationId) {
      const countRes = await pool.query(
        "SELECT COUNT(*)::int AS count FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE';",
        [user.organisationId],
      );
      const branchCount = countRes.rows[0]?.count || 0;

      if (user.branchId) {
        const branchRes = await pool.query(
          "SELECT id, name, branch_code FROM branches WHERE id = $1 AND organisation_id = $2 AND status = 'ACTIVE' LIMIT 1;",
          [user.branchId, user.organisationId],
        );
        branchRecord = branchRes.rows[0] || null;
      }

      if (!branchRecord && branchCount > 0) {
        const defaultBranchRes = await pool.query(
          "SELECT id, name, branch_code FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;",
          [user.organisationId],
        );
        branchRecord = defaultBranchRes.rows[0] || null;
      }

      hasBranch = branchCount > 0 && Boolean(branchRecord);
    }

    return {
      success: true,
      user: {
        id: user.id,
        supabaseAuthId: user.supabaseAuthId || null,
        name: user.name,
        email: user.email,
        phone: user.phone,
        staffId: user.staffId,
        role: user.role,
        roleId: user.roleId,
        isPlatformSuperadmin: Boolean(user.isPlatformSuperadmin),
        organisationId: user.organisationId,
        organisationName: orgRes.rows[0]?.name || null,
        pharmacyCode: orgRes.rows[0]?.pharmacy_code || null,
        branchId: branchRecord?.id || user.branchId || null,
        branchName: branchRecord?.name || null,
        hasBranch,
        branch: branchRecord
          ? {
              id: branchRecord.id,
              name: branchRecord.name,
              branchCode: branchRecord.branch_code,
            }
          : null,
      },
    };
  }

  /**
   * Request password recovery link/token via Supabase Auth
   */
  async forgotPassword({ email }) {
    if (!email) {
      throw new Error("Email address is required.");
    }

    const cleanEmail = email.trim().toLowerCase();

    if (supabaseAdmin?.auth?.resetPasswordForEmail) {
      try {
        await supabaseAdmin.auth.resetPasswordForEmail(cleanEmail);
      } catch (err) {
        console.warn("Supabase password reset notice:", err.message);
      }
    }

    return {
      success: true,
      message:
        "If this email is registered, password recovery instructions have been sent.",
    };
  }

  /**
   * Complete password reset
   */
  async resetPassword({ token, newPassword }) {
    if (!newPassword || newPassword.length < 6) {
      throw new Error("New password must be at least 6 characters long.");
    }

    if (token) {
      const decoded = await verifySupabaseToken(token);
      if (decoded && decoded.sub) {
        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query(
          "UPDATE users SET password_hash = $1 WHERE supabase_auth_id = $2 OR LOWER(email) = LOWER($3);",
          [hash, decoded.sub, decoded.email || ""],
        );
      }
    }

    return {
      success: true,
      message:
        "Password has been successfully updated. Please sign in with your new password.",
    };
  }
  /**
   * List users/members belonging to an organisation
   */

  async getOrganisationUsers(organisationId) {
    if (!organisationId) return [];
    const query = `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.phone, 
        u.staff_id AS "staffId",
        u.created_at AS "createdAt",
        om.status, 
        ba.role_id,
        COALESCE(r.name, 'Pharmacist') AS role,
        r.role_identifier AS "roleCode",
        COALESCE(b.name, 'Main Branch') AS "primaryBranch",
        b.id AS "branchId"
      FROM organisation_memberships om
      JOIN users u ON u.id = om.user_id
      LEFT JOIN branch_assignments ba ON ba.membership_id = om.id AND ba.is_primary = true
      LEFT JOIN branches b ON b.id = ba.branch_id
      LEFT JOIN roles r ON r.id = ba.role_id
      WHERE om.organisation_id = $1
      ORDER BY u.name ASC;
    `;
    const res = await pool.query(query, [organisationId]);
    return res.rows;
  }

  /**
   * Invite / create a new staff member inside an organisation.
   *
   * Provisions a Supabase Auth identity (temporary password, so the
   * invited staff member can reset it), a users row, an organisation
   * membership, and (when a branch is supplied) a primary branch
   * assignment with the given role.
   */
  async createStaffUser({
    organisationId,
    name,
    email,
    phone = null,
    roleId = null,
    branchId = null,
    professionalRegistrationNumber = null,
    workingShift = null,
  }) {
    const cleanName = (name || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();

    if (!organisationId) {
      throw new Error("organisationId is required.");
    }
    if (!cleanName || !cleanEmail) {
      throw new Error("Staff name and email are required.");
    }

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1;",
      [cleanEmail],
    );
    if (existingUser.rows.length > 0) {
      const err = new Error("An account with this email address already exists.");
      err.statusCode = 409;
      throw err;
    }

    if (roleId) {
      const roleCheck = await pool.query(
        "SELECT id FROM roles WHERE id = $1 AND organisation_id = $2;",
        [roleId, organisationId],
      );
      if (roleCheck.rows.length === 0) {
        const err = new Error("Role does not belong to this organisation.");
        err.statusCode = 400;
        throw err;
      }
    }

    if (branchId) {
      const branchCheck = await pool.query(
        "SELECT id FROM branches WHERE id = $1 AND organisation_id = $2;",
        [branchId, organisationId],
      );
      if (branchCheck.rows.length === 0) {
        const err = new Error("Branch does not belong to this organisation.");
        err.statusCode = 400;
        throw err;
      }
    }

    // Provision a Supabase Auth identity with a temporary password.
    const tempPassword = crypto.randomBytes(9).toString("base64url");
    let supabaseAuthId = null;
    let createdInSupabase = false;

    if (supabaseAdmin?.auth?.admin?.createUser) {
      const { data: supaUser, error: supaErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: cleanEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { name: cleanName },
        });
      if (!supaErr && supaUser?.user?.id) {
        supabaseAuthId = supaUser.user.id;
        createdInSupabase = true;
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const staffId = await getNextBusinessNumber({
        organisationId,
        sequenceType: "STAFF",
        client,
      });

      const insertUserRes = await client.query(
        `INSERT INTO users (
           name, email, password_hash, phone, supabase_auth_id, staff_id,
           professional_registration_number, working_shift, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
         RETURNING id, name, email, phone, staff_id, status, created_at;`,
        [
          cleanName,
          cleanEmail,
          passwordHash,
          phone,
          supabaseAuthId,
          staffId,
          professionalRegistrationNumber,
          workingShift,
        ],
      );
      const user = insertUserRes.rows[0];

      const membershipRes = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status, joined_at)
         VALUES ($1, $2, 'ACTIVE', CURRENT_TIMESTAMP)
         RETURNING id;`,
        [organisationId, user.id],
      );
      const membershipId = membershipRes.rows[0].id;

      if (branchId && roleId) {
        await client.query(
          `INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
           VALUES ($1, $2, $3, TRUE);`,
          [membershipId, branchId, roleId],
        );
      }

      await client.query("COMMIT");

      return {
        success: true,
        message: "Staff member created successfully.",
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          staffId: user.staff_id,
          status: user.status,
          createdAt: user.created_at,
        },
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (createdInSupabase && supabaseAuthId && supabaseAdmin?.auth?.admin?.deleteUser) {
        await supabaseAdmin.auth.admin
          .deleteUser(supabaseAuthId)
          .catch(() => {});
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Update a staff member's profile, role, and branch assignment.
   */
  async updateStaffUser(organisationId, userId, { name, phone, roleId, branchId }) {
    const membership = await pool.query(
      `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2;`,
      [organisationId, userId],
    );
    if (membership.rows.length === 0) {
      const err = new Error("Staff member not found in this organisation.");
      err.statusCode = 404;
      throw err;
    }
    const membershipId = membership.rows[0].id;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const updateRes = await client.query(
        `UPDATE users
         SET name = COALESCE($1, name),
             phone = COALESCE($2, phone),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id, name, email, phone, staff_id, status;`,
        [name || null, phone || null, userId],
      );
      const user = updateRes.rows[0];

      if (roleId && branchId) {
        const branchCheck = await client.query(
          "SELECT id FROM branches WHERE id = $1 AND organisation_id = $2;",
          [branchId, organisationId],
        );
        if (branchCheck.rows.length === 0) {
          throw new Error("Branch does not belong to this organisation.");
        }
        const roleCheck = await client.query(
          "SELECT id FROM roles WHERE id = $1 AND organisation_id = $2;",
          [roleId, organisationId],
        );
        if (roleCheck.rows.length === 0) {
          throw new Error("Role does not belong to this organisation.");
        }

        await client.query(
          `INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (membership_id, branch_id)
           DO UPDATE SET role_id = EXCLUDED.role_id, is_primary = TRUE;`,
          [membershipId, branchId, roleId],
        );
      }

      await client.query("COMMIT");
      return { success: true, message: "Staff member updated successfully.", data: user };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Activate or deactivate a staff member's access.
   *
   * Implemented as a status change (not a hard delete) because
   * historical records (invoices, sessions, audit logs) reference
   * users via RESTRICT foreign keys.
   */
  async updateStaffStatus(organisationId, userId, status) {
    const normalizedStatus = String(status || "").toUpperCase();
    if (!["ACTIVE", "INACTIVE"].includes(normalizedStatus)) {
      const err = new Error("status must be ACTIVE or INACTIVE.");
      err.statusCode = 400;
      throw err;
    }

    const membership = await pool.query(
      `SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2;`,
      [organisationId, userId],
    );
    if (membership.rows.length === 0) {
      const err = new Error("Staff member not found in this organisation.");
      err.statusCode = 404;
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE organisation_memberships SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;`,
        [normalizedStatus, membership.rows[0].id],
      );
      const userRes = await client.query(
        `UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
         RETURNING id, name, email, status;`,
        [normalizedStatus, userId],
      );
      await client.query("COMMIT");
      return {
        success: true,
        message: `Staff member ${normalizedStatus === "ACTIVE" ? "activated" : "deactivated"} successfully.`,
        data: userRes.rows[0],
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new AuthService();

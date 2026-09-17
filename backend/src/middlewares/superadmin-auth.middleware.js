/**
 * Platform Superadmin Authentication & Authorization Middleware
 *
 * Enforces:
 * 1. Valid token presence (Bearer <token>)
 * 2. Active user account verification
 * 3. Strict users.is_platform_superadmin = TRUE validation
 *
 * Completely outside tenant-role authorization. Normal tenant users receive HTTP 403.
 */

const crypto = require("crypto");
const { pool } = require("../db/connection");

const JWT_SECRET =
  process.env.JWT_SECRET || "pharmaflow_superadmin_secret_key_2026";

/**
 * Generate a cryptographically signed platform token.
 */
const generatePlatformToken = (user) => {
  const payload = {
    userId: user.id,
    email: user.email,
    isPlatformSuperadmin: Boolean(user.is_platform_superadmin),
    issuedAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(payloadB64)
    .digest("base64url");

  return `pf_platform_${payloadB64}.${signature}`;
};

/**
 * Verify and decode a platform token.
 */
const verifyPlatformToken = (token) => {
  if (!token) return null;

  // Development convenience token - strictly gated behind non-production AND explicit ALLOW_DEV_AUTH=true
  if (token === "pf_platform_default_dev" || token === "dev_superadmin") {
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEV_AUTH === "true"
    ) {
      return { isDev: true };
    }
    return null;
  }

  if (!token.startsWith("pf_platform_")) {
    // Support legacy/dev token format strictly in development mode
    if (
      token.startsWith("jwt_online_") &&
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEV_AUTH === "true"
    ) {
      const parts = token.split("_");
      return { userId: parts[2] };
    }
    return null;
  }

  const tokenBody = token.replace("pf_platform_", "");
  const [payloadB64, signature] = tokenBody.split(".");

  if (!payloadB64 || !signature) {
    return null;
  }

  const expectedSig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(payloadB64)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);

  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    );
    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      return null; // Expired
    }
    return payload;
  } catch (err) {
    return null;
  }
};

const { verifySupabaseToken } = require("../utils/supabase");

/**
 * Express Middleware: Require Platform Superadmin clearance.
 */
const requirePlatformSuperadmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized: Missing or malformed authorization token.",
    });
  }

  const token = authHeader.split(" ")[1].trim();

  // 1. Check Supabase Auth JWT
  const supabaseDecoded = verifySupabaseToken(token);
  if (supabaseDecoded && supabaseDecoded.sub) {
    try {
      const isUuid = (str) =>
        typeof str === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          str,
        );

      const subUuid = isUuid(supabaseDecoded.sub)
        ? supabaseDecoded.sub
        : (() => {
            const hash = crypto
              .createHash("md5")
              .update(supabaseDecoded.sub)
              .digest("hex");
            return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
          })();

      const userRes = await pool.query(
        `SELECT id, name, email, status, is_platform_superadmin, supabase_auth_id
         FROM users
         WHERE (supabase_auth_id = $1 OR (supabase_auth_id IS NULL AND LOWER(email) = LOWER($2)))
           AND status = 'ACTIVE'
         LIMIT 1;`,
        [subUuid, supabaseDecoded.email || ""],
      );

      const user = userRes.rows[0];
      if (!user) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized: User account is inactive or not found.",
        });
      }

      // JIT link if needed
      if (!user.supabase_auth_id && subUuid) {
        await pool
          .query("UPDATE users SET supabase_auth_id = $1 WHERE id = $2;", [
            subUuid,
            user.id,
          ])
          .catch(() => {});
        user.supabase_auth_id = subUuid;
      }

      if (!user.is_platform_superadmin) {
        return res.status(403).json({
          success: false,
          error: "Forbidden: Platform Superadmin clearance required.",
        });
      }

      req.superadmin = user;
      req.user = user;
      return next();
    } catch (err) {
      console.error("Superadmin auth middleware error:", err);
      return res.status(500).json({
        success: false,
        error: "Internal security authentication error.",
      });
    }
  }

  // 2. Legacy Platform Tokens (pf_platform_... or dev)
  const decoded = verifyPlatformToken(token);

  if (!decoded || (!decoded.userId && !decoded.isDev)) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized: Invalid or expired platform token.",
    });
  }

  try {
    let user;
    if (decoded.isDev) {
      if (
        process.env.NODE_ENV === "production" ||
        process.env.ALLOW_DEV_AUTH !== "true"
      ) {
        return res.status(401).json({
          success: false,
          error:
            "Unauthorized: Development tokens are disabled in this environment.",
        });
      }
      const query = `
        SELECT id, name, email, status, is_platform_superadmin
        FROM users
        WHERE is_platform_superadmin = TRUE AND status = 'ACTIVE'
        ORDER BY created_at ASC
        LIMIT 1;
      `;
      const result = await pool.query(query);
      user = result.rows[0];
    } else {
      // Query authoritative database record
      const query = `
        SELECT 
          id,
          name,
          email,
          status,
          is_platform_superadmin
        FROM users
        WHERE id = $1
        LIMIT 1;
      `;
      const result = await pool.query(query, [decoded.userId]);
      user = result.rows[0];
    }

    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({
        success: false,
        error: "Unauthorized: User account is inactive or not found.",
      });
    }

    if (!user.is_platform_superadmin) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: Platform Superadmin clearance required.",
      });
    }

    req.superadmin = user;
    req.user = user;
    next();
  } catch (error) {
    console.error("Superadmin auth middleware error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal security authentication error.",
    });
  }
};

module.exports = {
  generatePlatformToken,
  verifyPlatformToken,
  requirePlatformSuperadmin,
};

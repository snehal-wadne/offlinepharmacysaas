/**
 * Supabase Utility for PharmaFlow Backend
 *
 * Provides:
 * 1. Supabase Admin Client for server-side administrative operations
 * 2. Supabase JWT cryptographic verification
 * 3. Test token generator for deterministic security & regression tests
 */

const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://caczaozjaxqxzctphdfd.supabase.co";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "dummy_service_role_key_for_offline_dev";

const SUPABASE_JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "pharmaflow_superadmin_secret_key_2026";

/**
 * Server-side Supabase client with administrative service privileges.
 */
let supabaseAdmin = null;
try {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
} catch (err) {
  console.warn("Supabase client initialization notice:", err.message);
}

/**
 * Verify and decode a Supabase Auth JWT access token.
 * Validates cryptographic signature, expiration, and required claims.
 *
 * @param {string} token - Raw JWT string (without 'Bearer ' prefix)
 * @returns {object|null} - Decoded claims { sub, email, ... } or null if invalid
 */
function verifySupabaseToken(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const trimmed = token.trim();
  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    // 1. Verify cryptographic signature & expiration using SUPABASE_JWT_SECRET
    const decoded = jwt.verify(trimmed, SUPABASE_JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (!decoded || !decoded.sub) {
      return null;
    }

    return decoded;
  } catch (err) {
    // In development/test mode, if JWT secret differs, attempt fallback verification
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEV_AUTH === "true"
    ) {
      try {
        const unverified = jwt.decode(trimmed);
        if (
          unverified &&
          unverified.sub &&
          (!unverified.exp || Date.now() / 1000 < unverified.exp)
        ) {
          return unverified;
        }
      } catch (e) {}
    }
    return null;
  }
}

/**
 * Generate a cryptographically valid Supabase JWT for testing & development.
 *
 * @param {object} params
 * @param {string} params.sub - Supabase Auth User UUID (auth.users.id)
 * @param {string} params.email - User email address
 * @param {string} [params.role='authenticated'] - Supabase auth role
 * @param {string|number} [params.expiresIn='1h'] - Expiration window
 * @returns {string} Signed JWT
 */
function createSupabaseTestToken({
  sub,
  email,
  role = "authenticated",
  expiresIn = "1h",
}) {
  const payload = {
    sub,
    email,
    aud: "authenticated",
    role,
    iss: `${SUPABASE_URL}/auth/v1`,
  };

  return jwt.sign(payload, SUPABASE_JWT_SECRET, {
    algorithm: "HS256",
    expiresIn,
  });
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_JWT_SECRET,
  supabaseAdmin,
  verifySupabaseToken,
  createSupabaseTestToken,
};

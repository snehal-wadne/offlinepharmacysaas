/**
 * Supabase Utility for PharmaFlow Backend
 *
 * Provides:
 * 1. Supabase Admin Client for server-side administrative operations
 * 2. Cryptographic Supabase JWT verification supporting:
 *    - Modern Supabase ES256 (asymmetric ECDSA via JWKS)
 *    - Legacy / test HS256 (symmetric HMAC via SUPABASE_JWT_SECRET)
 *    - Authoritative fallback verification via Supabase Admin API
 * 3. Deterministic test token generator for automated test suites
 */

if (typeof globalThis.WebSocket === "undefined") {
  try {
    globalThis.WebSocket = require("ws");
  } catch (e) {}
}

const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error(
    "Configuration Error: SUPABASE_URL environment variable is required.",
  );
}

// Server-side secret key (supports modern SUPABASE_SECRET_KEY or standard SUPABASE_SERVICE_ROLE_KEY)
// Do NOT fall back to anon key or dummy strings.
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Configuration Error: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) environment variable is required.",
  );
}

// Symmetric secret for HS256 verification (legacy projects and test tokens)
const SUPABASE_JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "pharmaflow_test_jwt_secret_only";

/**
 * Server-side Supabase client with administrative service privileges.
 */
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * In-memory cache for JWKS public keys
 */
const jwksKeyMap = new Map();
let lastJwksFetch = 0;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch and convert JWKS keys from Supabase Auth into Node.js KeyObjects
 */
async function fetchJwksKeys(forceRefresh = false) {
  const now = Date.now();
  if (
    !forceRefresh &&
    jwksKeyMap.size > 0 &&
    now - lastJwksFetch < JWKS_CACHE_TTL_MS
  ) {
    return jwksKeyMap;
  }

  try {
    const jwksUrl = `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`;
    const res = await fetch(jwksUrl);
    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} fetching Supabase JWKS from ${jwksUrl}`,
      );
    }
    const data = await res.json();
    if (Array.isArray(data.keys)) {
      for (const k of data.keys) {
        if (k.kid && k.kty === "EC") {
          try {
            const keyObj = crypto.createPublicKey({ key: k, format: "jwk" });
            jwksKeyMap.set(k.kid, keyObj);
          } catch (keyErr) {
            console.warn(`Failed to parse JWK kid ${k.kid}:`, keyErr.message);
          }
        }
      }
      lastJwksFetch = now;
    }
  } catch (err) {
    console.warn("Notice: Unable to fetch Supabase JWKS:", err.message);
  }
  return jwksKeyMap;
}

// Pre-fetch JWKS on module load asynchronously
fetchJwksKeys().catch(() => {});

/**
 * Verify and decode a Supabase Auth JWT access token.
 * Validates cryptographic signature, expiration, and required claims.
 *
 * Supports:
 * - ES256 (asymmetric ECDSA using Supabase JWKS public keys)
 * - HS256 (symmetric HMAC using SUPABASE_JWT_SECRET)
 * - Authoritative fallback via Supabase Admin API if local check fails
 *
 * @param {string} token - Raw JWT string (without 'Bearer ' prefix)
 * @returns {Promise<object|null>} - Decoded claims { sub, email, ... } or null if invalid
 */
async function verifySupabaseToken(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const trimmed = token.trim();
  const unverified = jwt.decode(trimmed, { complete: true });
  if (!unverified || !unverified.header) {
    return null;
  }

  const { alg, kid } = unverified.header;

  // 1. ES256: Modern Supabase asymmetric ECDSA verification via JWKS
  if (alg === "ES256" && kid) {
    let publicKey = jwksKeyMap.get(kid);
    if (!publicKey) {
      await fetchJwksKeys(true);
      publicKey = jwksKeyMap.get(kid);
    }

    if (publicKey) {
      try {
        const decoded = jwt.verify(trimmed, publicKey, {
          algorithms: ["ES256"],
        });
        if (decoded && decoded.sub) {
          return decoded;
        }
      } catch (err) {
        // Fall through to authoritative check if signature or key issue
      }
    }
  }

  // 2. HS256: Legacy or local test suite token verification
  if (alg === "HS256" && SUPABASE_JWT_SECRET) {
    try {
      const decoded = jwt.verify(trimmed, SUPABASE_JWT_SECRET, {
        algorithms: ["HS256"],
      });
      if (decoded && decoded.sub) {
        return decoded;
      }
    } catch (err) {
      // Signature mismatch or expired
    }
  }

  // 3. Authoritative fallback: verify against Supabase Auth service
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(trimmed);
    if (!error && data?.user?.id) {
      return {
        sub: data.user.id,
        email: data.user.email,
        role: data.user.role || "authenticated",
        app_metadata: data.user.app_metadata,
        user_metadata: data.user.user_metadata,
      };
    }
  } catch (apiErr) {
    // Network error or Supabase unavailable
  }

  return null;
}

/**
 * Generate a cryptographically valid Supabase JWT for testing & development.
 */
function createSupabaseTestToken({
  sub,
  userId,
  email,
  role = "authenticated",
  expiresIn = "1h",
}) {
  const resolvedSub = sub || userId;
  const payload = {
    sub: resolvedSub,
    email,
    role,
    aud: "authenticated",
    iss: `${SUPABASE_URL}/auth/v1`,
  };

  const secret = SUPABASE_JWT_SECRET || "pharmaflow_test_jwt_secret_only";
  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn,
  });
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET,
  supabaseAdmin,
  verifySupabaseToken,
  createSupabaseTestToken,
  fetchJwksKeys,
};

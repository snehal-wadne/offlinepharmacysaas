/**
 * Signed Session Token Utility
 *
 * Replaces the previous unsigned `jwt_pg_<userId>_<timestamp>` / `pin_token_<userId>_<timestamp>`
 * tokens (trivially forgeable by anyone who knew or guessed a user's UUID) with an
 * HMAC-SHA256 signed token, mirroring the pattern already used for platform superadmin
 * tokens in middleware/superadmin-auth.middleware.js.
 */

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'pharmaflow_superadmin_secret_key_2026';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const signToken = (payload, ttlMs = DEFAULT_TTL_MS) => {
  const body = {
    ...payload,
    issuedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  };

  const payloadB64 = Buffer.from(JSON.stringify(body)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(payloadB64)
    .digest('base64url');

  return `pf_user_${payloadB64}.${signature}`;
};

const verifyToken = (token) => {
  if (!token || !token.startsWith('pf_user_')) {
    return null;
  }

  const tokenBody = token.slice('pf_user_'.length);
  const [payloadB64, signature] = tokenBody.split('.');
  if (!payloadB64 || !signature) {
    return null;
  }

  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(payloadB64)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      return null;
    }
    return payload;
  } catch (err) {
    return null;
  }
};

module.exports = { signToken, verifyToken };

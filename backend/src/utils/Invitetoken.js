/**
 * Invite Token Utility
 *
 * Staff invites are stateless: the schema has no `invitations` table
 * and no invite-token column, so instead of storing a token in the
 * database we sign a short-lived JWT that encodes exactly what
 * accept-invite needs to look up the pending membership.
 */

const jwt = require('jsonwebtoken');

const INVITE_SECRET = process.env.JWT_INVITE_SECRET || process.env.JWT_SECRET;
const INVITE_EXPIRY = process.env.STAFF_INVITE_EXPIRY || '7d';

if (!INVITE_SECRET) {
  console.warn(
    'JWT_INVITE_SECRET (or JWT_SECRET) is not set. Staff invite tokens will fail to sign.',
  );
}

const signInviteToken = ({ membershipId, userId, organisationId, email }) => {
  return jwt.sign(
    {
      purpose: 'STAFF_INVITE',
      membershipId,
      userId,
      organisationId,
      email,
    },
    INVITE_SECRET,
    { expiresIn: INVITE_EXPIRY },
  );
};

const verifyInviteToken = (token) => {
  const payload = jwt.verify(token, INVITE_SECRET);

  if (payload.purpose !== 'STAFF_INVITE') {
    const error = new Error('Invalid invite token');
    error.statusCode = 400;
    throw error;
  }

  return payload;
};

module.exports = { signInviteToken, verifyInviteToken };
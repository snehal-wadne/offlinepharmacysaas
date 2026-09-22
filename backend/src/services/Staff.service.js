/**
 * Staff Service
 *
 * Business logic for the "Invite Staff Member" feature: onboarding a
 * new (or existing) user into an organisation with a role and branch.
 */

const staffRepo = require('../repositories/Staff.repository');
const { pool } = require('../db/connection');
const { getNextSequenceNumber } = require('../utils/Numbersequence');
const { generatePlaceholderPasswordHash, hashPassword } = require('../utils/Password');
const { signInviteToken, verifyInviteToken } = require('../utils/Invitetoken');

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

/**
 * "Invite Staff Member" — creates (or reuses) a user, creates their
 * organisation membership, assigns them a branch + role, and returns
 * a signed invite link.
 *
 * Sending the actual email is intentionally left to the caller / an
 * email provider integration — this returns everything needed to
 * send one.
 */
const inviteStaffMember = async ({
  organisationId,
  email,
  name,
  phone = null,
  professionalRegistrationNumber = null,
  workingShift = null,
  roleId,
  branchId,
  isPrimary = true,
}) => {
  if (!organisationId || !email || !name || !roleId || !branchId) {
    const error = new Error('organisationId, email, name, roleId and branchId are required');
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const [branchOk, roleOk] = await Promise.all([
      staffRepo.branchBelongsToOrganisation(organisationId, branchId, client),
      staffRepo.roleBelongsToOrganisation(organisationId, roleId, client),
    ]);

    if (!branchOk) {
      const error = new Error('branchId does not belong to this organisation');
      error.statusCode = 400;
      throw error;
    }

    if (!roleOk) {
      const error = new Error('roleId does not belong to this organisation');
      error.statusCode = 400;
      throw error;
    }

    let user = await staffRepo.findUserByEmail(normalizedEmail, client);

    if (user) {
      const existingMembership = await staffRepo.getMembership(organisationId, user.id, client);
      if (existingMembership) {
        const error = new Error('This person is already a member of this organisation');
        error.statusCode = 409;
        throw error;
      }
    } else {
      const nextNumber = await getNextSequenceNumber(client, organisationId, 'STAFF');
      const staffId = `EMP-${nextNumber}`;
      const placeholderHash = await generatePlaceholderPasswordHash();

      user = await staffRepo.createInvitedUser(
        {
          email: normalizedEmail,
          name,
          phone,
          staffId,
          professionalRegistrationNumber,
          workingShift,
          passwordHash: placeholderHash,
        },
        client,
      );
    }

    const membership = await staffRepo.createMembership(
      { organisationId, userId: user.id, status: 'INVITED' },
      client,
    );

    const branchAssignment = await staffRepo.createBranchAssignment(
      { membershipId: membership.id, branchId, roleId, isPrimary },
      client,
    );

    await client.query('COMMIT');

    const inviteToken = signInviteToken({
      membershipId: membership.id,
      userId: user.id,
      organisationId,
      email: normalizedEmail,
    });

    const inviteLink = `${APP_BASE_URL}/accept-invite?token=${inviteToken}`;

    return {
      user: { id: user.id, email: user.email, name: user.name, staffId: user.staff_id },
      membership,
      branchAssignment,
      inviteToken,
      inviteLink,
    };
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      const friendly = new Error('This person is already invited or a member of this organisation');
      friendly.statusCode = 409;
      throw friendly;
    }

    throw error;
  } finally {
    client.release();
  }
};

/**
 * Called when the invited person opens the invite link and sets
 * their password for the first time.
 */
const acceptInvite = async ({ token, password }) => {
  if (!token || !password) {
    const error = new Error('token and password are required');
    error.statusCode = 400;
    throw error;
  }

  let payload;
  try {
    payload = verifyInviteToken(token);
  } catch (err) {
    const error = new Error('This invite link is invalid or has expired');
    error.statusCode = 400;
    throw error;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const membership = await staffRepo.getMembershipById(
      payload.organisationId,
      payload.membershipId,
      client,
    );

    if (!membership) {
      const error = new Error('Invite not found');
      error.statusCode = 404;
      throw error;
    }

    if (membership.status !== 'INVITED') {
      const error = new Error('This invite has already been accepted or is no longer valid');
      error.statusCode = 409;
      throw error;
    }

    const passwordHash = await hashPassword(password);
    await staffRepo.setUserPassword(payload.userId, passwordHash, client);
    const activatedMembership = await staffRepo.activateMembership(membership.id, client);

    await client.query('COMMIT');
    return { membership: activatedMembership };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getStaffMembers = async (organisationId) => {
  if (!organisationId) {
    const error = new Error('organisationId is required');
    error.statusCode = 400;
    throw error;
  }

  return staffRepo.getStaffByOrganisation(organisationId);
};

const updateStaffStatus = async (organisationId, membershipId, status) => {
  const allowed = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
  const normalized = allowed.includes(String(status).toUpperCase())
    ? String(status).toUpperCase()
    : null;

  if (!normalized) {
    const error = new Error(`status must be one of: ${allowed.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  const membership = await staffRepo.updateMembershipStatus(organisationId, membershipId, normalized);

  if (!membership) {
    const error = new Error(`Staff membership ${membershipId} not found`);
    error.statusCode = 404;
    throw error;
  }

  return membership;
};

module.exports = {
  inviteStaffMember,
  acceptInvite,
  getStaffMembers,
  updateStaffStatus,
};
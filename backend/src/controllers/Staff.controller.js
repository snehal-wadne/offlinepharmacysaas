/**
 * Staff Controller
 *
 * Request handlers for staff endpoints, including "Invite Staff
 * Member".
 */

const staffService = require('../services/Staff.service');
const {
  getAuthorizedOrgId,
  sanitizeTenantPayload,
} = require('../utils/tenant-context');

const inviteStaffMember = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const inviteData = sanitizeTenantPayload(req.body, { organisationId });

    const result = await staffService.inviteStaffMember(inviteData);

    // TODO: wire up an email provider and send `result.inviteLink`
    // to `result.user.email` instead of / in addition to returning it.

    res.status(201).json({
      success: true,
      message: 'Staff member invited successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error inviting staff member:', error);
    res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || 'Failed to invite staff member',
    });
  }
};

/**
 * Public endpoint — the invited person is not authenticated yet, so
 * this must NOT sit behind the organisation auth middleware.
 */
const acceptInvite = async (req, res) => {
  try {
    const { token, password } = req.body;
    const result = await staffService.acceptInvite({ token, password });

    res.status(200).json({
      success: true,
      message: 'Invite accepted. You can now sign in.',
      data: result,
    });
  } catch (error) {
    console.error('Error accepting invite:', error);
    res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || 'Failed to accept invite',
    });
  }
};

const getStaffMembers = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const staff = await staffService.getStaffMembers(organisationId);

    res.status(200).json({ success: true, count: staff.length, data: staff });
  } catch (error) {
    console.error('Error fetching staff members:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to fetch staff members',
    });
  }
};

const updateStaffStatus = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const { membershipId } = req.params;
    const { status } = req.body;

    const membership = await staffService.updateStaffStatus(organisationId, membershipId, status);

    res.status(200).json({
      success: true,
      message: 'Staff status updated successfully',
      data: membership,
    });
  } catch (error) {
    console.error(`Error updating staff status ${req.params.membershipId}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to update staff status',
    });
  }
};

module.exports = {
  inviteStaffMember,
  acceptInvite,
  getStaffMembers,
  updateStaffStatus,
};
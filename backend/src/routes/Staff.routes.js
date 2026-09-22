const express = require('express');
const staffController = require('../controllers/Staff.controller');
const {authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

// Public — no organisation session exists yet at this point.
router.post('/accept-invite', staffController.acceptInvite);

router.use(authenticate);

router.post('/invite', staffController.inviteStaffMember); // Invite Staff Member
router.get('/', staffController.getStaffMembers);
router.patch('/:membershipId/status', staffController.updateStaffStatus);

module.exports = router;
/**
 * Manager Routes
 *
 * Aggregates the branch, staff and role routers under one mount
 * point. Wire this into your main app (wherever your other routers
 * such as supplier.routes.js are already mounted) with:
 *
 *   const managerRoutes = require('./routes/manager.routes');
 *   app.use('/api', managerRoutes);
 *
 * which exposes:
 *
 *   POST   /api/branches                     Add Branch
 *   GET    /api/branches
 *   GET    /api/branches/:id
 *   PATCH  /api/branches/:id
 *   PATCH  /api/branches/:id/status
 *
 *   POST   /api/staff/invite                 Invite Staff Member
 *   POST   /api/staff/accept-invite          (public — no auth)
 *   GET    /api/staff
 *   PATCH  /api/staff/:membershipId/status
 *
 *   POST   /api/roles                        Create New Role
 *   GET    /api/roles
 *   GET    /api/roles/:id
 *   PATCH  /api/roles/:id
 *   DELETE /api/roles/:id
 */

const express = require('express');

const branchRoutes = require('./branch.routes');
const staffRoutes = require('./Staff.routes');
const roleRoutes = require('./Role.routes ');

const router = express.Router();

router.use('/branches', branchRoutes);
router.use('/staff', staffRoutes);
router.use('/roles', roleRoutes);

module.exports = router;
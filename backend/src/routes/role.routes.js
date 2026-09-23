/**
 * Role & Permission Routes
 *
 * Base endpoint: /api/roles
 */

const express = require("express");
const router = express.Router();
const roleController = require("../controllers/Role.controller");
const { authenticate } = require("../middlewares/auth.middleware");

router.use(authenticate);

// GET /api/roles/permissions - Global permission catalogue grouped by domain
router.get("/permissions", roleController.getPermissions);

// GET /api/roles - List organisation roles with their permissions
router.get("/", roleController.getRoles);

// GET /api/roles/:id - Get a single role with permissions
router.get("/:id", roleController.getRoleById);

// POST /api/roles - Create a role
router.post("/", roleController.createRole);

// PUT /api/roles/:id - Update role details
router.put("/:id", roleController.updateRole);

// PUT /api/roles/:id/permissions - Replace the role's assigned permissions
router.put("/:id/permissions", roleController.updateRolePermissions);

// DELETE /api/roles/:id - Delete a custom role
router.delete("/:id", roleController.deleteRole);

module.exports = router;

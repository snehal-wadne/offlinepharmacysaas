const express = require('express');
const roleController = require('../controllers/Role.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.post('/', roleController.createRole); // Create New Role
router.get('/', roleController.getRoles);
router.get('/:id', roleController.getRoleById);
router.patch('/:id', roleController.updateRole);
router.delete('/:id', roleController.deleteRole);

module.exports = router;
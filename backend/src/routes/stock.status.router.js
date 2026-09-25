const express = require("express");

const router = express.Router();

const {
  reorderStock,
  writeOffStock,
} = require("../controllers/stock.status.controller");
const { authenticate } = require("../middlewares/auth.middleware");

/**
 * Stock Status Routes
 *
 * POST /api/v1/inventory/stock-status/reorder
 * POST /api/v1/inventory/stock-status/write-off
 */
router.use(authenticate);


router.post(
  "/reorder",
  reorderStock
);

router.post(
  "/write-off",
  writeOffStock
);

module.exports = router;
/**
 * Stock Status Controller
 *
 * Handles:
 * POST /reorder
 * POST /write-off
 */

const stockStatusRepository = require("../repositories/stock.status.repository");

/**
 * Get organisation ID.
 *
 * Your frontend already sends:
 *
 * x-organisation-id
 *
 * through getAuthHeaders().
 *
 * Prefer the value populated by authentication middleware,
 * but keep the header fallback for the current API architecture.
 */
const getOrganisationId = (req) => {
  return (
    req.organisationId ||
    req.user?.organisationId ||
    req.headers["x-organisation-id"]
  );
};

/**
 * Get current user ID.
 */
const getUserId = (req) => {
  return (
    req.user?.id ||
    req.user?.userId ||
    req.auth?.userId ||
    null
  );
};

/**
 * POST /api/v1/inventory/stock-status/reorder
 *
 * Increase inventory quantity by reorderLevel.
 */
const reorderStock = async (req, res) => {
  try {
    const organisationId = getOrganisationId(req);
    const userId = getUserId(req);

    const {
      inventoryBatchId,
      sku,
      batchNo,
      batchNumber,
      reorderLevel,
    } = req.body;

    const resolvedBatchNumber = batchNumber || batchNo;

    if (!organisationId) {
      return res.status(400).json({
        success: false,
        message: "organisationId is required",
      });
    }

    if (!inventoryBatchId && !sku) {
      return res.status(400).json({
        success: false,
        message: "inventoryBatchId or sku is required",
      });
    }

    if (!inventoryBatchId && !resolvedBatchNumber) {
      return res.status(400).json({
        success: false,
        message: "batchNumber is required when inventoryBatchId is not provided",
      });
    }

    const level = Number(reorderLevel);

    if (!Number.isFinite(level) || level <= 0) {
      return res.status(400).json({
        success: false,
        message: "reorderLevel must be greater than 0",
      });
    }

    const updatedBatch = await stockStatusRepository.reorderStock({
      organisationId,
      sku,
      batchNumber: resolvedBatchNumber,
      inventoryBatchId,
      reorderLevel: level,
      updatedBy: userId,
    });

    if (!updatedBatch) {
      return res.status(404).json({
        success: false,
        message: "Inventory batch not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Stock reordered by ${level}`,
      data: {
        action: "REORDER",
        previousQuantity: updatedBatch.quantity - level,
        addedQuantity: level,
        quantity: updatedBatch.quantity,
        batch: updatedBatch,
      },
    });
  } catch (error) {
    console.error("reorderStock error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reorder stock",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/inventory/stock-status/write-off
 *
 * Set inventory quantity to 0.
 */
const writeOffStock = async (req, res) => {
  try {
    const organisationId = getOrganisationId(req);
    const userId = getUserId(req);

    const {
      inventoryBatchId,
      sku,
      batchNo,
      batchNumber,
    } = req.body;

    const resolvedBatchNumber = batchNumber || batchNo;

    if (!organisationId) {
      return res.status(400).json({
        success: false,
        message: "organisationId is required",
      });
    }

    if (!inventoryBatchId && !sku) {
      return res.status(400).json({
        success: false,
        message: "inventoryBatchId or sku is required",
      });
    }

    if (!inventoryBatchId && !resolvedBatchNumber) {
      return res.status(400).json({
        success: false,
        message: "batchNumber is required when inventoryBatchId is not provided",
      });
    }

    const existingBatch =
      await stockStatusRepository.findInventoryBatch({
        organisationId,
        sku,
        batchNumber: resolvedBatchNumber,
        inventoryBatchId,
      });

    if (!existingBatch) {
      return res.status(404).json({
        success: false,
        message: "Inventory batch not found",
      });
    }

    const previousQuantity = Number(existingBatch.quantity);

    const updatedBatch =
      await stockStatusRepository.writeOffStock({
        organisationId,
        sku,
        batchNumber: resolvedBatchNumber,
        inventoryBatchId,
        updatedBy: userId,
      });

    if (!updatedBatch) {
      return res.status(404).json({
        success: false,
        message: "Inventory batch not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Stock written off successfully",
      data: {
        action: "WRITE_OFF",
        previousQuantity,
        quantity: updatedBatch.quantity,
        batch: updatedBatch,
      },
    });
  } catch (error) {
    console.error("writeOffStock error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to write off stock",
      error: error.message,
    });
  }
};

module.exports = {
  reorderStock,
  writeOffStock,
};
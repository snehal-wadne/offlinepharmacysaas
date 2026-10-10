/**
 * Goods Receipt Controller
 *
 * Request handlers for Goods Receipts.
 */

const goodsReceiptService = require("../services/goods-receipt.service");
const {
  getAuthorizedOrgId,
  getAuthorizedBranchId,
  sanitizeTenantPayload,
} = require("../utils/tenant-context");

const getGoodsReceipts = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const branchId = await getAuthorizedBranchId(req, organisationId, { allowAll: true });
    const { purchaseId, limit, offset } = req.query;

    const receipts = await goodsReceiptService.getGoodsReceipts({
      organisationId,
      purchaseId,
      branchId,
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      count: receipts.length,
      data: receipts,
    });
  } catch (error) {
    console.error("Error fetching goods receipts:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "Failed to fetch goods receipts",
    });
  }
};

const getGoodsReceiptById = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const { id } = req.params;

    const receipt = await goodsReceiptService.getGoodsReceiptById(
      organisationId,
      id,
    );
    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: `Goods receipt ${id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      data: receipt,
    });
  } catch (error) {
    console.error(`Error fetching goods receipt ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "Failed to fetch goods receipt",
    });
  }
};

const createGoodsReceipt = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const branchId = await getAuthorizedBranchId(req, organisationId);

    const receiptData = sanitizeTenantPayload(req.body, {
      organisationId,
      branchId: branchId || undefined,
      receivedBy: req.user?.id,
    });

    const newReceipt =
      await goodsReceiptService.createGoodsReceipt(receiptData);

    res.status(201).json({
      success: true,
      message: "Goods receipt created successfully",
      data: newReceipt,
    });
  } catch (error) {
    console.error("Error creating goods receipt:", error);
    res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || "Failed to create goods receipt",
    });
  }
};

const updateGoodsReceiptStatus = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Status is required",
      });
    }

    const updatedReceipt = await goodsReceiptService.updateGoodsReceiptStatus({
      organisationId,
      receiptId: id,
      status,
    });

    res.status(200).json({
      success: true,
      message: "Goods receipt status updated successfully",
      data: updatedReceipt,
    });
  } catch (error) {
    console.error(
      `Error updating status for goods receipt ${req.params.id}:`,
      error,
    );
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "Failed to update goods receipt status",
    });
  }
};

module.exports = {
  getGoodsReceipts,
  getGoodsReceiptById,
  createGoodsReceipt,
  updateGoodsReceiptStatus,
};

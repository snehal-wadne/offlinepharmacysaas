/**
 * Sync Controller
 * Handles batch push of mutations and pull of changes
 */

const syncService = require("../services/sync.service");

const getStatus = async (req, res) => {
  try {
    const orgId = req.tenantContext?.organisationId || req.query.organisationId;
    const status = await syncService.getStatus(orgId);
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const pushMutations = async (req, res) => {
  try {
    const { deviceId, mutations } = req.body;
    if (!deviceId) {
      return res
        .status(400)
        .json({ success: false, error: "Missing deviceId in push payload" });
    }
    if (!Array.isArray(mutations)) {
      return res
        .status(400)
        .json({ success: false, error: "Mutations must be an array" });
    }

    const result = await syncService.processPushBatch({
      deviceId,
      mutations,
      userContext: req.user,
      tenantContext: req.tenantContext,
    });
    res.status(200).json(result);
  } catch (error) {
    console.error("[SyncController] Push error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const pullChanges = async (req, res) => {
  try {
    const { cursor, limit } = req.query;
    const organisationId =
      req.tenantContext?.organisationId || req.query.organisationId;
    const branchId = req.tenantContext?.branchId || req.query.branchId;

    const result = await syncService.pullChanges({
      cursor,
      organisationId,
      branchId,
      limit: Number(limit) || 50,
      userContext: req.user,
    });
    res.status(200).json(result);
  } catch (error) {
    console.error("[SyncController] Pull error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const testConnection = async (req, res) => {
  try {
    const result = await syncService.testConnection();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const bootstrap = async (req, res) => {
  try {
    const organisationId =
      req.tenantContext?.organisationId || req.query.organisationId;
    const branchId = req.tenantContext?.branchId || req.query.branchId;

    if (!organisationId) {
      return res.status(400).json({
        success: false,
        error: "Missing organisationId for bootstrap",
      });
    }

    if (!branchId) {
      return res.status(400).json({
        success: false,
        error: "Missing branchId for bootstrap",
      });
    }

    const data = await syncService.bootstrapTenantData({
      organisationId,
      branchId,
      userId: req.user?.id,
    });

    res.status(200).json(data);
  } catch (error) {
    console.error("[SyncController] Bootstrap error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getStatus,
  pushMutations,
  pullChanges,
  testConnection,
  bootstrap,
};

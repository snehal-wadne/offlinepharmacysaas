/**
 * Sync Controller
 * Handles batch push of mutations and pull of changes
 */

const syncService = require("../services/sync.service");

const getStatus = async (req, res) => {
  try {
    const orgId = req.tenantContext?.organisationId || req.user?.organisationId;
    const status = await syncService.getStatus(orgId);
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const processBatch = async (req, res) => {
  try {
    const { mutations, batchId } = req.body;
    const orgId = req.tenantContext?.organisationId || req.user?.organisationId;
    const result = await syncService.processBatch(
      mutations || [],
      batchId,
      orgId,
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("[SyncController] Batch error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const pushMutations = async (req, res) => {
  try {
    const { deviceId, mutations, batchId } = req.body;
    if (deviceId && Array.isArray(mutations)) {
      const result = await syncService.processPushBatch({
        deviceId,
        mutations,
        userContext: req.user,
        tenantContext: req.tenantContext,
      });
      return res.status(200).json(result);
    }
    // Fallback to processBatch for simple batch payloads
    const orgId = req.tenantContext?.organisationId || req.user?.organisationId;
    const result = await syncService.processBatch(
      mutations || [],
      batchId,
      orgId,
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error("[SyncController] Push error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const pullChanges = async (req, res) => {
  try {
    const { cursor, limit } = req.query;
    const organisationId =
      req.tenantContext?.organisationId || req.user?.organisationId;
    const branchId = req.tenantContext?.branchId || req.user?.branchId;

    if (!organisationId) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: No active organisation context",
      });
    }

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
      req.tenantContext?.organisationId || req.user?.organisationId;
    const branchId = req.tenantContext?.branchId || req.user?.branchId;

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
  processBatch,
  pushMutations,
  pullChanges,
  testConnection,
  bootstrap,
};

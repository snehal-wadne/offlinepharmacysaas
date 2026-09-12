/**
 * Sync Controller
 */

const syncService = require('../services/sync.service');

const getStatus = async (req, res) => {
  try {
    const status = await syncService.getStatus();
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const processBatch = async (req, res) => {
  try {
    const { mutations, batchId } = req.body;
    const result = await syncService.processBatch(mutations || [], batchId);
    res.status(200).json(result);
  } catch (error) {
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

module.exports = {
  getStatus,
  processBatch,
  testConnection,
};


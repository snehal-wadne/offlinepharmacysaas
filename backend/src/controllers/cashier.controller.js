/**
 * Cashier Controller
 *
 * Handles HTTP requests for:
 * - Register session opening, closing, and reconciliation
 * - POS sale billing and invoice generation
 * - Barcode and batch product searching
 * - Held bill parking and retrieval
 * - Sales returns and refund processing
 */

const cashierService = require('../services/cashier.service');

// --- Register Sessions ---
const getCurrentSession = async (req, res) => {
  try {
    const result = await cashierService.getCurrentSession();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error getting register session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const openSession = async (req, res) => {
  try {
    const { openedBy, openingBalance, branch, notes } = req.body;
    const result = await cashierService.openSession({ openedBy, openingBalance, branch, notes });
    res.status(201).json(result);
  } catch (error) {
    console.error('Error opening register session:', error);
    res.status(400).json({ success: false, error: error.message });
  }
};

const closeSession = async (req, res) => {
  try {
    const { countedCash, notes, denominations } = req.body;
    const result = await cashierService.closeSession({ countedCash, notes, denominations });
    res.status(200).json(result);
  } catch (error) {
    console.error('Error closing register session:', error);
    res.status(400).json({ success: false, error: error.message });
  }
};

const getSessionHistory = async (req, res) => {
  try {
    const result = await cashierService.getSessionHistory();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error getting session history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// --- Products & Barcode Search ---
const searchProducts = async (req, res) => {
  try {
    const { search, barcode } = req.query;
    const result = await cashierService.searchProducts({ search, barcode });
    res.status(200).json(result);
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// --- POS Sales ---
const createSale = async (req, res) => {
  try {
    const saleData = req.body;
    const result = await cashierService.createSale(saleData);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error processing sale:', error);
    res.status(400).json({ success: false, error: error.message });
  }
};

const getRecentSales = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const result = await cashierService.getRecentSales(limit);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching recent sales:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getSaleByInvoiceNo = async (req, res) => {
  try {
    const { invoiceNo } = req.params;
    const result = await cashierService.getSaleByInvoiceNo(invoiceNo);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// --- Held Bills ---
const getHeldBills = async (req, res) => {
  try {
    const result = await cashierService.getHeldBills();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error getting held bills:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const saveHeldBill = async (req, res) => {
  try {
    const billData = req.body;
    const result = await cashierService.saveHeldBill(billData);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error holding bill:', error);
    res.status(400).json({ success: false, error: error.message });
  }
};

const deleteHeldBill = async (req, res) => {
  try {
    const { holdId } = req.params;
    const result = await cashierService.deleteHeldBill(holdId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error removing held bill:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// --- Sales Returns ---
const searchReturnInvoice = async (req, res) => {
  try {
    const { invoiceNo } = req.query;
    const result = await cashierService.searchReturnInvoice(invoiceNo);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.status(200).json(result);
  } catch (error) {
    console.error('Error searching invoice for return:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const processReturn = async (req, res) => {
  try {
    const returnData = req.body;
    const result = await cashierService.processReturn(returnData);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error processing return:', error);
    res.status(400).json({ success: false, error: error.message });
  }
};

const getReturnHistory = async (req, res) => {
  try {
    const result = await cashierService.getReturnHistory();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching return history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getCurrentSession,
  openSession,
  closeSession,
  getSessionHistory,
  searchProducts,
  createSale,
  getRecentSales,
  getSaleByInvoiceNo,
  getHeldBills,
  saveHeldBill,
  deleteHeldBill,
  searchReturnInvoice,
  processReturn,
  getReturnHistory,
};

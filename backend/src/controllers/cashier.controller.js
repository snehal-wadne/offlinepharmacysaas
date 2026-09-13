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
const cashRegisterRepo = require('../repositories/cash-register.repository');
const cashRegisterSessionRepo = require('../repositories/cash-register-session.repository');
const cashMovementRepo = require('../repositories/cash-movement.repository');
const cashDenominationRepo = require('../repositories/cash-denomination.repository');
const cashRegisterDashboardRepo = require('../repositories/cash-register-dashboard.repository');
const { pool } = require('../db/connection');

const resolveAuthContext = async (req) => {
  let organisationId = req.tenant?.organisationId || req.user?.organisationId || req.headers['x-organisation-id'];
  let branchId = req.tenant?.branchId || req.user?.branchId || req.headers['x-branch-id'];
  let cashierId = req.auth?.id || req.user?.id;

  if (!organisationId) {
    const orgRes = await pool.query("SELECT id FROM organisations WHERE status = 'ACTIVE' LIMIT 1;");
    organisationId = orgRes.rows[0]?.id;
  }
  if (!branchId && organisationId) {
    const branchRes = await pool.query("SELECT id FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE' LIMIT 1;", [organisationId]);
    branchId = branchRes.rows[0]?.id;
  }
  if (!cashierId) {
    const userRes = await pool.query("SELECT id FROM users WHERE status = 'ACTIVE' LIMIT 1;");
    cashierId = userRes.rows[0]?.id;
  }

  return { organisationId, branchId, cashierId };
};

// --- Register Sessions ---
const getBranchRegisters = async (req, res) => {
  try {
    const { organisationId, branchId } = await resolveAuthContext(req);
    if (!organisationId || !branchId) {
      return res.status(400).json({ success: false, error: 'organisationId and branchId are required' });
    }
    let registers = await cashRegisterRepo.listCashRegistersByBranch(organisationId, branchId);
    if (registers.length === 0) {
      const defaultReg = await cashRegisterRepo.createCashRegister({
        organisationId,
        branchId,
        name: 'Main Counter',
        identifier: 'POS-01',
        isActive: true,
      });
      registers = [defaultReg];
    }
    return res.status(200).json({ success: true, count: registers.length, data: registers });
  } catch (error) {
    console.error('Error fetching branch registers:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getCurrentSession = async (req, res) => {
  try {
    const { organisationId, branchId } = await resolveAuthContext(req);
    const { cashRegisterId } = req.query;
    if (!organisationId || !branchId) {
      const fallback = await cashierService.getCurrentSession();
      return res.status(200).json(fallback);
    }
    const session = await cashRegisterSessionRepo.getCurrentSession(organisationId, branchId, cashRegisterId || null);
    return res.status(200).json({
      success: true,
      data: session,
      source: 'postgresql',
    });
  } catch (error) {
    console.error('Error getting register session:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const openSession = async (req, res) => {
  try {
    const { organisationId, branchId, cashierId } = await resolveAuthContext(req);
    const { openingBalance = 0, shiftName = 'Day Shift', notes, cashRegisterId: reqRegisterId } = req.body;

    if (!organisationId || !branchId) {
      return res.status(400).json({ success: false, error: 'organisationId and branchId are required.' });
    }

    let registerId = reqRegisterId;
    if (!registerId) {
      let registers = await cashRegisterRepo.listCashRegistersByBranch(organisationId, branchId);
      if (registers.length === 0) {
        const newReg = await cashRegisterRepo.createCashRegister({
          organisationId,
          branchId,
          name: 'Main Counter',
          identifier: 'POS-01',
          isActive: true,
        });
        registerId = newReg.id;
      } else {
        registerId = registers[0].id;
      }
    }

    const session = await cashRegisterSessionRepo.openSession({
      organisationId,
      branchId,
      cashRegisterId: registerId,
      cashierId,
      openingBalance: Number(openingBalance) || 0,
      shiftName,
      openingNotes: notes || null,
    });

    const floatAmount = Number(openingBalance) || 0;
    if (floatAmount > 0) {
      await cashMovementRepo.createMovement({
        organisationId,
        branchId,
        cashRegisterSessionId: session.id,
        cashierId,
        movementType: 'IN',
        amount: floatAmount,
        reason: 'Opening float balance',
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Register session opened successfully',
      data: {
        ...session,
        sessionCode: session.session_number,
        openingBalance: floatAmount,
      },
    });
  } catch (error) {
    console.error('Error opening register session:', error);
    const isConflict = error.message && (
      error.message.includes('already open') ||
      error.message.includes('unique_open_session') ||
      error.message.includes('idx_unique_open_session_per_register')
    );
    return res.status(isConflict ? 409 : 400).json({
      success: false,
      error: error.message,
    });
  }
};

const closeSession = async (req, res) => {
  try {
    const { organisationId, branchId } = await resolveAuthContext(req);
    const { countedCash = 0, notes, denominations, sessionId: reqSessionId } = req.body;

    let sessionId = reqSessionId;
    if (!sessionId) {
      const openSession = await cashRegisterSessionRepo.getCurrentSession(organisationId, branchId);
      if (!openSession) {
        return res.status(400).json({ success: false, error: 'No open cash register session found to close.' });
      }
      sessionId = openSession.id;
    }

    const closed = await cashRegisterSessionRepo.closeSession({
      organisationId,
      sessionId,
      countedCash: Number(countedCash) || 0,
      closingNotes: notes || null,
    });

    if (denominations && typeof denominations === 'object') {
      await cashDenominationRepo.saveDenominations({
        organisationId,
        sessionId,
        denominations,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Register session closed and reconciled successfully in PostgreSQL',
      data: closed,
    });
  } catch (error) {
    console.error('Error closing register session:', error);
    return res.status(400).json({ success: false, error: error.message });
  }
};

const getSessionHistory = async (req, res) => {
  try {
    const { organisationId, branchId } = await resolveAuthContext(req);
    if (!organisationId || !branchId) {
      const fallback = await cashierService.getSessionHistory();
      return res.status(200).json(fallback);
    }
    const history = await cashRegisterSessionRepo.listSessionHistory({
      organisationId,
      branchId,
      limit: 50,
    });
    return res.status(200).json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error('Error getting session history:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const recordCashMovement = async (req, res) => {
  try {
    const { organisationId, branchId, cashierId } = await resolveAuthContext(req);
    const { movementType = 'OUT', amount = 0, reason = '', sessionId: reqSessionId } = req.body;

    let sessionId = reqSessionId;
    if (!sessionId) {
      let openSession = await cashRegisterSessionRepo.getCurrentSession(organisationId, branchId);
      if (!openSession) {
        let registers = await cashRegisterRepo.listCashRegistersByBranch(organisationId, branchId);
        let registerId = registers[0]?.id;
        if (!registerId) {
          const newReg = await cashRegisterRepo.createCashRegister({
            organisationId,
            branchId,
            name: 'Main Counter',
            identifier: 'POS-01',
            isActive: true,
          });
          registerId = newReg.id;
        }
        openSession = await cashRegisterSessionRepo.openSession({
          organisationId,
          branchId,
          cashRegisterId: registerId,
          cashierId,
          openingBalance: 0,
          shiftName: 'Day Shift',
          openingNotes: 'Auto-opened for cash movement',
        });
      }
      sessionId = openSession.id;
    }

    const type = String(movementType).toUpperCase() === 'IN' ? 'IN' : 'OUT';
    const movement = await cashMovementRepo.createMovement({
      organisationId,
      branchId,
      cashRegisterSessionId: sessionId,
      cashierId,
      movementType: type,
      amount: Number(amount),
      reason: reason || (type === 'IN' ? 'Cash float addition' : 'General cash payout'),
    });

    return res.status(201).json({
      success: true,
      message: 'Cash movement recorded successfully',
      data: movement,
    });
  } catch (error) {
    console.error('Error recording cash movement:', error);
    return res.status(400).json({ success: false, error: error.message });
  }
};

const getCashMovements = async (req, res) => {
  try {
    const { organisationId, branchId } = await resolveAuthContext(req);
    let { sessionId } = req.query;

    if (!sessionId) {
      const openSession = await cashRegisterSessionRepo.getCurrentSession(organisationId, branchId);
      if (openSession) {
        sessionId = openSession.id;
      }
    }

    if (!sessionId) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    const movements = await cashMovementRepo.listMovementsBySession({
      organisationId,
      branchId,
      sessionId,
      limit: 100,
    });

    return res.status(200).json({
      success: true,
      count: movements.length,
      data: movements,
    });
  } catch (error) {
    console.error('Error getting cash movements:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getSessionSummary = async (req, res) => {
  try {
    const { organisationId, branchId } = await resolveAuthContext(req);
    let sessionId = req.query.sessionId || req.params.sessionId;

    if (!sessionId) {
      const openSession = await cashRegisterSessionRepo.getCurrentSession(organisationId, branchId);
      if (!openSession) {
        return res.status(404).json({ success: false, error: 'No active register session found.' });
      }
      sessionId = openSession.id;
    }

    const summary = await cashRegisterDashboardRepo.getSessionReconciliationSummary({
      organisationId,
      branchId,
      sessionId,
    });

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error generating session reconciliation summary:', error);
    return res.status(500).json({ success: false, error: error.message });
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
  getBranchRegisters,
  getCurrentSession,
  openSession,
  closeSession,
  getSessionHistory,
  recordCashMovement,
  getCashMovements,
  getSessionSummary,
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

/**
 * Local Offline Storage Engine for Pharmacy Billing SaaS
 *
 * Purpose:
 * Provides a resilient, zero-dependency offline database that persists
 * locally on disk (backend/data/offline_store.json).
 *
 * Even if the machine has NO internet connection, NO cloud access, and
 * PostgreSQL is completely offline, the pharmacy POS, Cashier, Inventory,
 * Held Bills, and Sales Returns run 100% seamlessly.
 *
 * All offline mutations (sales, register actions, returns) are tracked in an
 * Outbox Sync Queue for automatic synchronization when PostgreSQL connects.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'offline_store.json');

// Default initial dataset
const INITIAL_DATA = {
  version: '1.0.0',
  lastUpdated: new Date().toISOString(),
  organisation: {
    id: 'org-falah-01',
    name: 'Falah Pharmacy',
  },
  branch: {
    id: 'br-main-01',
    name: 'Main Branch',
  },
  products: [
    {
      id: 'PRD-101',
      name: 'Dolo 650 Tablets (15s)',
      generic: 'Paracetamol 650mg',
      barcode: '8901234567890',
      sku: 'MED-DOLO-650',
      category: 'Analgesics',
      batch: 'BTH-2026-A1',
      expiry: '11/2027',
      mrp: 34.5,
      sellingPrice: 31.05,
      stock: 145,
      gstRate: 12,
      pack: 'Strip of 15',
    },
    {
      id: 'PRD-102',
      name: 'Augmentin 625 Duo (10s)',
      generic: 'Amoxicillin + Clavulanic Acid',
      barcode: '8902345678901',
      sku: 'MED-AUG-625',
      category: 'Antibiotics',
      batch: 'AUG-8821',
      expiry: '08/2026',
      mrp: 224.0,
      sellingPrice: 201.6,
      stock: 82,
      gstRate: 12,
      pack: 'Strip of 10',
    },
    {
      id: 'PRD-103',
      name: 'Pan 40 Tablets (15s)',
      generic: 'Pantoprazole Sodium 40mg',
      barcode: '8903456789012',
      sku: 'MED-PAN-40',
      category: 'Antacids / PPI',
      batch: 'PAN-7419',
      expiry: '04/2027',
      mrp: 175.5,
      sellingPrice: 158.0,
      stock: 210,
      gstRate: 12,
      pack: 'Strip of 15',
    },
    {
      id: 'PRD-104',
      name: 'Azithral 500mg (5s)',
      generic: 'Azithromycin 500mg',
      barcode: '8904567890123',
      sku: 'MED-AZI-500',
      category: 'Antibiotics',
      batch: 'AZI-4491',
      expiry: '09/2026',
      mrp: 132.0,
      sellingPrice: 118.8,
      stock: 64,
      gstRate: 12,
      pack: 'Strip of 5',
    },
    {
      id: 'PRD-105',
      name: 'Montair LC (10s)',
      generic: 'Montelukast + Levocetirizine',
      barcode: '8905678901234',
      sku: 'MED-MON-LC',
      category: 'Respiratory',
      batch: 'MON-3320',
      expiry: '01/2027',
      mrp: 198.0,
      sellingPrice: 178.2,
      stock: 115,
      gstRate: 12,
      pack: 'Strip of 10',
    },
    {
      id: 'PRD-106',
      name: 'Glycomet GP 1mg/500mg (15s)',
      generic: 'Glimepiride + Metformin',
      barcode: '8906789012345',
      sku: 'MED-GLY-GP1',
      category: 'Antidiabetic',
      batch: 'GLY-9021',
      expiry: '12/2026',
      mrp: 142.0,
      sellingPrice: 127.8,
      stock: 94,
      gstRate: 12,
      pack: 'Strip of 15',
    },
    {
      id: 'PRD-107',
      name: 'Benadryl Cough Syrup (100ml)',
      generic: 'Diphenhydramine + Ammonium Chloride',
      barcode: '8907890123456',
      sku: 'OTC-BEN-100',
      category: 'OTC Cough & Cold',
      batch: 'BND-2026-C',
      expiry: '05/2027',
      mrp: 125.0,
      sellingPrice: 115.0,
      stock: 58,
      gstRate: 18,
      pack: 'Bottle of 100ml',
    },
    {
      id: 'PRD-108',
      name: 'Electral ORS Powder (21.8g)',
      generic: 'Oral Rehydration Salts IP',
      barcode: '8908901234567',
      sku: 'OTC-ELE-ORS',
      category: 'Hydration',
      batch: 'ELE-1011',
      expiry: '03/2028',
      mrp: 23.5,
      sellingPrice: 22.0,
      stock: 350,
      gstRate: 5,
      pack: 'Sachet 21.8g',
    },
  ],
  registerSession: {
    isOpen: true,
    sessionId: 'REG-2026-0829-01',
    openedBy: 'Cashier 01',
    openedAt: '29 Aug 2026, 09:15 AM',
    branch: 'Main Branch',
    openingBalance: 2000.0,
    cashSales: 8750.0,
    upiSales: 4250.0,
    cardSales: 2800.0,
    creditSales: 1500.0,
    cashRefunds: 350.0,
    totalDiscounts: 420.0,
    expectedCash: 10400.0,
    notes: 'Opening shift float verified by Cashier 01',
  },
  registerHistory: [
    {
      id: 'REG-2026-0828-02',
      date: '28 Aug 2026',
      shift: 'Evening Shift',
      cashier: 'Rajesh Verma',
      openedAt: '02:00 PM',
      closedAt: '10:15 PM',
      branch: 'Main Branch',
      openingBalance: 2000.0,
      cashSales: 12600.0,
      cashRefunds: 350.0,
      expectedCash: 14250.0,
      countedCash: 14250.0,
      variance: 0.0,
      status: 'Balanced',
      notes: 'Shift closed without variance. All cash handed over to locker.',
    },
    {
      id: 'REG-2026-0828-01',
      date: '28 Aug 2026',
      shift: 'Morning Shift',
      cashier: 'Priya Sharma',
      openedAt: '08:30 AM',
      closedAt: '02:00 PM',
      branch: 'Main Branch',
      openingBalance: 2000.0,
      cashSales: 7950.0,
      cashRefunds: 200.0,
      expectedCash: 9750.0,
      countedCash: 9700.0,
      variance: -50.0,
      status: 'Shortage',
      notes: 'Shortage of ₹50 verified in coins count, approved by Store Manager.',
    },
  ],
  heldBills: [
    {
      holdId: 'HOLD-01',
      token: 'T-108',
      customerName: 'Suresh Raina',
      customerPhone: '+91 98450 12345',
      itemsCount: 3,
      itemsSummary: 'Dolo 650 (2), Pan 40 (1)',
      subtotal: 220.1,
      total: 246.5,
      heldAt: '11:42 AM',
      heldBy: 'Cashier 01',
      note: 'Customer went to get prescription from clinic',
      items: [
        {
          id: 'PRD-101',
          name: 'Dolo 650 Tablets (15s)',
          batch: 'BTH-2026-A1',
          qty: 2,
          price: 31.05,
          total: 62.1,
          gstRate: 12,
        },
        {
          id: 'PRD-103',
          name: 'Pan 40 Tablets (15s)',
          batch: 'PAN-7419',
          qty: 1,
          price: 158.0,
          total: 158.0,
          gstRate: 12,
        },
      ],
    },
    {
      holdId: 'HOLD-02',
      token: 'T-109',
      customerName: 'Meena Sharma',
      customerPhone: '+91 97312 88990',
      itemsCount: 1,
      itemsSummary: 'Augmentin 625 Duo (1)',
      subtotal: 201.6,
      total: 225.8,
      heldAt: '12:10 PM',
      heldBy: 'Cashier 01',
      note: 'Card declined, checking UPI app',
      items: [
        {
          id: 'PRD-102',
          name: 'Augmentin 625 Duo (10s)',
          batch: 'AUG-8821',
          qty: 1,
          price: 201.6,
          total: 201.6,
          gstRate: 12,
        },
      ],
    },
  ],
  invoices: [
    {
      invoiceNo: 'INV-2026-8942',
      date: '29 Aug 2026, 11:24 AM',
      customer: 'Rajesh Verma',
      phone: '+91 98201 44521',
      paymentMode: 'Cash',
      splitPayments: [{ method: 'Cash', amount: 2450.0 }],
      subtotal: 2187.5,
      tax: 262.5,
      total: 2450.0,
      cashier: 'Cashier 01',
      status: 'PAID',
      items: [
        { name: 'Augmentin 625 Duo (10s)', batch: 'AUG-8821', qty: 2, price: 201.6, total: 403.2 },
        { name: 'Pan 40 Tablets (15s)', batch: 'PAN-7419', qty: 2, price: 158.0, total: 316.0 },
        { name: 'Glycomet GP 1mg/500mg (15s)', batch: 'GLY-9021', qty: 4, price: 127.8, total: 511.2 },
      ],
    },
    {
      invoiceNo: 'INV-2026-8941',
      date: '29 Aug 2026, 10:50 AM',
      customer: 'Sunita Patil',
      phone: '+91 99870 12399',
      paymentMode: 'UPI',
      splitPayments: [{ method: 'UPI', amount: 1280.0, reference: 'UPI-8849102' }],
      subtotal: 1142.85,
      tax: 137.15,
      total: 1280.0,
      cashier: 'Cashier 01',
      status: 'PAID',
      items: [
        { name: 'Montair LC (10s)', batch: 'MON-3320', qty: 2, price: 178.2, total: 356.4 },
        { name: 'Benadryl Cough Syrup (100ml)', batch: 'BND-2026-C', qty: 2, price: 115.0, total: 230.0 },
      ],
    },
  ],
  returns: [
    {
      returnNo: 'RET-2026-101',
      invoiceNo: 'INV-2026-8940',
      customer: 'Walk-in Customer',
      refundAmount: 350.0,
      refundMethod: 'Cash',
      date: '29 Aug 2026, 11:05 AM',
      cashier: 'Cashier 01',
      reason: 'Wrong dosage purchased',
      items: [
        { name: 'Dolo 650 Tablets (15s)', batch: 'BTH-2026-A1', qty: 3, refundAmount: 93.15, condition: 'SEALED' },
      ],
    },
  ],
  users: [
    {
      id: 'USR-001',
      name: 'Dr. Admin',
      email: 'admin@flora.edu.in',
      phone: '9876543210',
      password: 'admin123',
      pin: '1234',
      role: 'ADMIN',
      branch: 'Main Branch',
      status: 'ACTIVE',
    },
    {
      id: 'USR-002',
      name: 'Dr. Falah Admin',
      email: 'admin@falah.com',
      phone: '9820011223',
      password: 'admin123',
      pin: '1234',
      role: 'ADMIN',
      branch: 'Main Branch',
      status: 'ACTIVE',
    },
    {
      id: 'USR-003',
      name: 'Cashier 01',
      email: 'cashier@falah.com',
      phone: '9820144521',
      password: 'cashier123',
      pin: '0000',
      role: 'CASHIER',
      branch: 'Main Branch',
      status: 'ACTIVE',
    },
    {
      id: 'USR-004',
      name: 'Rajesh Verma (Store Manager)',
      email: 'manager@falah.com',
      phone: '9845012345',
      password: 'manager123',
      pin: '1111',
      role: 'MANAGER',
      branch: 'Main Branch',
      status: 'ACTIVE',
    },
  ],
  syncQueue: [],
};

class LocalStore {
  constructor() {
    this.memoryData = null;
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        this.memoryData = JSON.parse(raw);
      } else {
        this.memoryData = { ...INITIAL_DATA };
        this.persist();
      }
    } catch (err) {
      console.error('Failed to load offline store file, initializing in-memory fallback:', err);
      this.memoryData = { ...INITIAL_DATA };
    }
  }

  persist() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      this.memoryData.lastUpdated = new Date().toISOString();
      const tempPath = `${STORE_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.memoryData, null, 2), 'utf8');
      fs.renameSync(tempPath, STORE_FILE);
    } catch (err) {
      console.error('Error persisting offline store:', err);
    }
  }

  // --- Users & Offline Auth ---
  findUser(emailOrPhone) {
    if (!this.memoryData.users) {
      this.memoryData.users = [...INITIAL_DATA.users];
    }
    const query = (emailOrPhone || '').toLowerCase().trim();
    return (this.memoryData.users || []).find(
      (u) => (u.email && u.email.toLowerCase() === query) || (u.phone && u.phone === query)
    );
  }

  findUserByPin(pin) {
    if (!this.memoryData.users) {
      this.memoryData.users = [...INITIAL_DATA.users];
    }
    return (this.memoryData.users || []).find((u) => u.pin === String(pin).trim());
  }

  addUser(userData) {
    if (!this.memoryData.users) this.memoryData.users = [];
    const newUser = {
      id: `USR-${Date.now().toString().slice(-4)}`,
      status: 'ACTIVE',
      ...userData,
    };
    this.memoryData.users.push(newUser);
    this.persist();
    return newUser;
  }

  // --- Products ---
  getProducts(search = '', barcode = '') {
    let list = this.memoryData.products || [];
    if (barcode) {
      const match = list.filter((p) => p.barcode === barcode.trim());
      if (match.length > 0) return match;
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.generic.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.batch.toLowerCase().includes(q) ||
          p.barcode.includes(q)
      );
    }
    return list;
  }

  deductStock(batchNo, qty) {
    const product = this.memoryData.products.find((p) => p.batch === batchNo);
    if (product) {
      product.stock = Math.max(0, (product.stock || 0) - Number(qty));
      this.persist();
      return product;
    }
    return null;
  }

  restock(batchNo, qty) {
    const product = this.memoryData.products.find((p) => p.batch === batchNo);
    if (product) {
      product.stock = (product.stock || 0) + Number(qty);
      this.persist();
      return product;
    }
    return null;
  }

  // --- Register Session ---
  getCurrentSession() {
    return (
      this.memoryData.registerSession || {
        isOpen: false,
        sessionId: null,
      }
    );
  }

  openSession({ openedBy = 'Cashier 01', openingBalance = 2000.0, branch = 'Main Branch', notes = '' }) {
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const sessionId = `REG-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    const newSession = {
      isOpen: true,
      sessionId,
      openedBy,
      openedAt: `${dateStr}, ${timeStr}`,
      branch,
      sessionTime: '0h 0m',
      lastActivity: 'Just now',
      openingBalance: Number(openingBalance) || 0,
      cashSales: 0.0,
      upiSales: 0.0,
      cardSales: 0.0,
      creditSales: 0.0,
      cashRefunds: 0.0,
      totalDiscounts: 0.0,
      expectedCash: Number(openingBalance) || 0,
      notes: notes || `Shift opened by ${openedBy}`,
    };

    this.memoryData.registerSession = newSession;
    this.addSyncItem('OPEN_SESSION', newSession);
    this.persist();
    return newSession;
  }

  closeSession({ countedCash = 0, notes = '', denominations = null }) {
    const current = this.memoryData.registerSession;
    if (!current || !current.isOpen) {
      throw new Error('No open register session to close.');
    }

    const counted = Number(countedCash) || 0;
    const expected = Number(current.expectedCash) || 0;
    const variance = counted - expected;
    let status = 'Balanced';
    if (variance < 0) status = 'Shortage';
    if (variance > 0) status = 'Overage';

    const closedRecord = {
      id: current.sessionId,
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      shift: 'Shift Closed',
      cashier: current.openedBy,
      openedAt: current.openedAt,
      closedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      branch: current.branch,
      openingBalance: current.openingBalance,
      cashSales: current.cashSales,
      cashRefunds: current.cashRefunds,
      expectedCash: expected,
      countedCash: counted,
      variance,
      status,
      denominations,
      notes: notes || `Closed with status: ${status}`,
    };

    if (!this.memoryData.registerHistory) {
      this.memoryData.registerHistory = [];
    }
    this.memoryData.registerHistory.unshift(closedRecord);

    // Reset current register session to closed state
    this.memoryData.registerSession = {
      isOpen: false,
      sessionId: current.sessionId,
      openedBy: current.openedBy,
      openedAt: current.openedAt,
      closedAt: closedRecord.closedAt,
      openingBalance: current.openingBalance,
      expectedCash: expected,
      countedCash: counted,
      variance,
      status,
      notes: closedRecord.notes,
    };

    this.addSyncItem('CLOSE_SESSION', closedRecord);
    this.persist();
    return closedRecord;
  }

  getRegisterHistory() {
    return this.memoryData.registerHistory || [];
  }

  // --- Sales / Invoices ---
  createInvoice(saleData) {
    const invCount = (this.memoryData.invoices?.length || 0) + 8943;
    const invoiceNo = saleData.invoiceNo || `INV-${new Date().getFullYear()}-${invCount}`;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const newInvoice = {
      invoiceNo,
      date: `${dateStr}, ${timeStr}`,
      customer: saleData.customer?.name || saleData.customer || 'Walk-in Customer',
      phone: saleData.customer?.phone || saleData.phone || '—',
      paymentMode: saleData.paymentMode || 'Cash',
      splitPayments: saleData.splitPayments || [{ method: saleData.paymentMode || 'Cash', amount: saleData.total }],
      subtotal: Number(saleData.subtotal || 0),
      discount: Number(saleData.discount || 0),
      tax: Number(saleData.tax || 0),
      total: Number(saleData.total || 0),
      cashier: saleData.cashier || 'Cashier 01',
      status: 'PAID',
      items: saleData.items || [],
      notes: saleData.notes || '',
      offlineCreated: true,
      createdAt: new Date().toISOString(),
    };

    // Deduct stock for each sold item
    if (Array.isArray(saleData.items)) {
      saleData.items.forEach((item) => {
        if (item.batch && item.qty) {
          this.deductStock(item.batch, item.qty);
        }
      });
    }

    // Update active register session financial aggregates
    const session = this.memoryData.registerSession;
    if (session && session.isOpen) {
      const split = newInvoice.splitPayments || [];
      let cashTotal = 0;
      let upiTotal = 0;
      let cardTotal = 0;
      let creditTotal = 0;

      split.forEach((p) => {
        const amt = Number(p.amount) || 0;
        const method = (p.method || '').toUpperCase();
        if (method.includes('CASH')) cashTotal += amt;
        else if (method.includes('UPI') || method.includes('QR')) upiTotal += amt;
        else if (method.includes('CARD')) cardTotal += amt;
        else if (method.includes('CREDIT')) creditTotal += amt;
        else cashTotal += amt; // default to cash if unspecified
      });

      session.cashSales = (session.cashSales || 0) + cashTotal;
      session.upiSales = (session.upiSales || 0) + upiTotal;
      session.cardSales = (session.cardSales || 0) + cardTotal;
      session.creditSales = (session.creditSales || 0) + creditTotal;
      session.expectedCash = (session.expectedCash || 0) + cashTotal;
      session.totalDiscounts = (session.totalDiscounts || 0) + (newInvoice.discount || 0);
      session.lastActivity = 'Just now';
    }

    if (!this.memoryData.invoices) {
      this.memoryData.invoices = [];
    }
    this.memoryData.invoices.unshift(newInvoice);

    this.addSyncItem('CREATE_INVOICE', newInvoice);
    this.persist();
    return newInvoice;
  }

  getRecentInvoices(limit = 20) {
    const list = this.memoryData.invoices || [];
    return list.slice(0, limit);
  }

  getInvoiceByNumber(invoiceNo) {
    return (this.memoryData.invoices || []).find((inv) => inv.invoiceNo === invoiceNo);
  }

  // --- Held Bills ---
  getHeldBills() {
    return this.memoryData.heldBills || [];
  }

  addHeldBill(billData) {
    const holdCount = (this.memoryData.heldBills?.length || 0) + 1;
    const holdId = `HOLD-${String(Date.now()).slice(-4)}`;
    const token = `T-${100 + holdCount}`;
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const newHold = {
      holdId,
      token,
      customerName: billData.customerName || 'Walk-in Customer',
      customerPhone: billData.customerPhone || '—',
      itemsCount: billData.items?.length || 0,
      itemsSummary:
        billData.itemsSummary ||
        (billData.items || []).map((i) => `${i.name} (${i.qty})`).join(', ') ||
        'Medicines',
      subtotal: Number(billData.subtotal || 0),
      total: Number(billData.total || 0),
      heldAt: timeStr,
      heldBy: billData.heldBy || 'Cashier 01',
      note: billData.note || '',
      items: billData.items || [],
    };

    if (!this.memoryData.heldBills) {
      this.memoryData.heldBills = [];
    }
    this.memoryData.heldBills.unshift(newHold);
    this.persist();
    return newHold;
  }

  deleteHeldBill(holdId) {
    const prev = this.memoryData.heldBills || [];
    const found = prev.find((h) => h.holdId === holdId);
    this.memoryData.heldBills = prev.filter((h) => h.holdId !== holdId);
    this.persist();
    return found;
  }

  // --- Sales Returns ---
  createReturn(returnData) {
    const returnCount = (this.memoryData.returns?.length || 0) + 101;
    const returnNo = `RET-${new Date().getFullYear()}-${returnCount}`;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const newReturn = {
      returnNo,
      invoiceNo: returnData.invoiceNo,
      customer: returnData.customer || 'Walk-in Customer',
      refundAmount: Number(returnData.refundAmount || 0),
      refundMethod: returnData.refundMethod || 'Cash',
      date: `${dateStr}, ${timeStr}`,
      cashier: returnData.cashier || 'Cashier 01',
      reason: returnData.reason || 'Customer request',
      items: returnData.items || [],
      notes: returnData.notes || '',
    };

    // Restock returned items if sealed or restock flag is true
    (returnData.items || []).forEach((item) => {
      if (item.condition === 'SEALED' || item.restock) {
        this.restock(item.batch, item.qty || 1);
      }
    });

    // If refund was cash, deduct from current register session expected cash
    const session = this.memoryData.registerSession;
    if (session && session.isOpen && (newReturn.refundMethod || '').toUpperCase() === 'CASH') {
      session.cashRefunds = (session.cashRefunds || 0) + newReturn.refundAmount;
      session.expectedCash = Math.max(0, (session.expectedCash || 0) - newReturn.refundAmount);
    }

    if (!this.memoryData.returns) {
      this.memoryData.returns = [];
    }
    this.memoryData.returns.unshift(newReturn);

    this.addSyncItem('CREATE_RETURN', newReturn);
    this.persist();
    return newReturn;
  }

  getReturnHistory() {
    return this.memoryData.returns || [];
  }

  // --- Sync Queue & Outbox ---
  addSyncItem(action, payload) {
    if (!this.memoryData.syncQueue) {
      this.memoryData.syncQueue = [];
    }
    this.memoryData.syncQueue.push({
      id: `SYNC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      action,
      payload,
      createdAt: new Date().toISOString(),
      status: 'PENDING',
    });
  }

  getSyncQueue() {
    return this.memoryData.syncQueue || [];
  }

  clearSyncItems(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    this.memoryData.syncQueue = (this.memoryData.syncQueue || []).filter((item) => !ids.includes(item.id));
    this.persist();
  }

  getStats() {
    return {
      productsCount: this.memoryData.products?.length || 0,
      invoicesCount: this.memoryData.invoices?.length || 0,
      heldBillsCount: this.memoryData.heldBills?.length || 0,
      returnsCount: this.memoryData.returns?.length || 0,
      pendingSyncCount: this.memoryData.syncQueue?.length || 0,
      lastUpdated: this.memoryData.lastUpdated,
    };
  }
}

// Singleton instance
const localStore = new LocalStore();

module.exports = localStore;

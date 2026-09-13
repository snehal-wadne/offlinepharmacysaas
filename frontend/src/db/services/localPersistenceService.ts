/**
 * Local Persistence Service
 *
 * Core service coordinating multi-store operations, atomic sales commits,
 * local catalog seeding, and read projections between POS and IndexedDB.
 */

import { PharmaFlowDatabase, db as defaultDb } from '../pharmaflowDb';
import {
  ProductRecord,
  CustomerRecord,
  InventoryBatchRecord,
  TransactionRecord,
  SyncOutboxRecord,
  SaleCommitResult,
  CashRegisterRecord,
  RegisterSessionRecord,
  CashMovementRecord,
  CashDenominationRecord,
} from '../types';
import { SyncMetadataRepository } from '../repositories/syncMetadataRepository';
import { ProductRepository } from '../repositories/productRepository';
import { CustomerRepository } from '../repositories/customerRepository';
import { InventoryRepository } from '../repositories/inventoryRepository';
import { TransactionRepository } from '../repositories/transactionRepository';
import { OutboxRepository } from '../repositories/outboxRepository';
import { generateUUID } from '../utils/uuid';
import { MOCK_POS_PRODUCTS } from '../../data/cashierMockData';

export const DEFAULT_ORG_ID = 'ORG-DEFAULT';
export const DEFAULT_BRANCH_ID = 'BRANCH-MAIN';
export const DEFAULT_USER_ID = 'USER-CASHIER-01';

export class LocalPersistenceService {
  private db: PharmaFlowDatabase;
  private syncMetaRepo: SyncMetadataRepository;
  private productRepo: ProductRepository;
  private customerRepo: CustomerRepository;
  private inventoryRepo: InventoryRepository;
  private transactionRepo: TransactionRepository;
  private outboxRepo: OutboxRepository;
  private defaultOrgId: string = DEFAULT_ORG_ID;
  private defaultBranchId: string = DEFAULT_BRANCH_ID;
  private defaultUserId: string = DEFAULT_USER_ID;

  constructor(database: PharmaFlowDatabase = defaultDb) {
    this.db = database;
    this.syncMetaRepo = new SyncMetadataRepository(database);
    this.productRepo = new ProductRepository(database);
    this.customerRepo = new CustomerRepository(database);
    this.inventoryRepo = new InventoryRepository(database);
    this.transactionRepo = new TransactionRepository(database);
    this.outboxRepo = new OutboxRepository(database);
  }

  setTenantContext(organisationId: string, branchId: string, userId?: string): void {
    this.defaultOrgId = organisationId;
    this.defaultBranchId = branchId;
    if (userId) this.defaultUserId = userId;
  }

  getTenantContext(): { organisationId: string; branchId: string; userId: string; isDemo: boolean } {
    const org = this.defaultOrgId || DEFAULT_ORG_ID;
    return {
      organisationId: org,
      branchId: this.defaultBranchId || DEFAULT_BRANCH_ID,
      userId: this.defaultUserId || DEFAULT_USER_ID,
      isDemo: !this.defaultOrgId || this.defaultOrgId === DEFAULT_ORG_ID,
    };
  }

  /**
   * Initializes the local persistence layer:
   * - Ensures unique, durable deviceId exists
   * - Seeds initial catalog & inventory into IndexedDB if local store is empty
   */
  async initialize(
    organisationId = DEFAULT_ORG_ID,
    branchId = DEFAULT_BRANCH_ID,
    options: { seedMockIfEmpty?: boolean } = {}
  ): Promise<{ deviceId: string; productCount: number }> {
    this.defaultOrgId = organisationId;
    this.defaultBranchId = branchId;
    const deviceId = await this.syncMetaRepo.getDeviceId();

    // In production offline mode, only seed mock data if explicitly requested or in default demo mode without real tenant context
    const isMockDemo = organisationId === DEFAULT_ORG_ID;
    const shouldSeedMock = options.seedMockIfEmpty ?? isMockDemo;

    const count = await this.db.products.count();
    if (count === 0 && shouldSeedMock && MOCK_POS_PRODUCTS && MOCK_POS_PRODUCTS.length > 0) {
      await this.seedInitialCatalog(organisationId, branchId);
    }

    const finalCount = await this.db.products.count();
    return { deviceId, productCount: finalCount };
  }

  /**
   * Seeds initial products and inventory batches from POS mock catalog
   */
  async seedInitialCatalog(
    organisationId = DEFAULT_ORG_ID,
    branchId = DEFAULT_BRANCH_ID
  ): Promise<void> {
    const now = new Date().toISOString();
    const productRecords: ProductRecord[] = [];
    const inventoryRecords: InventoryBatchRecord[] = [];

    for (const item of MOCK_POS_PRODUCTS) {
      const productId = item.id || `PRD-${generateUUID().slice(0, 6)}`;

      productRecords.push({
        productId,
        organisationId,
        name: item.name,
        genericName: item.generic || '',
        barcode: item.barcode || '',
        sku: item.sku || '',
        category: item.category || 'General',
        gstRate: item.gstRate || 5,
        mrp: item.mrp || 0,
        sellingPrice: item.sellingPrice || item.mrp || 0,
        unit: 'Strip',
        packSize: item.pack || '',
        isPrescriptionRequired: false,
        isNarcotic: false,
        active: true,
        updatedAt: now,
      });

      // Seed batches for inventory
      if (item.batches && Array.isArray(item.batches)) {
        for (const b of item.batches) {
          inventoryRecords.push({
            id: `${branchId}_${b.batch}_${productId}`,
            organisationId,
            branchId,
            productId,
            batchNumber: b.batch,
            expiryDate: b.expiry || '12/2026',
            availableQuantity: b.stock || 0,
            costPrice: (b.price || item.sellingPrice) * 0.7,
            mrp: item.mrp || 0,
            sellingPrice: b.price || item.sellingPrice || 0,
            updatedAt: now,
          });
        }
      } else if (item.batch) {
        inventoryRecords.push({
          id: `${branchId}_${item.batch}_${productId}`,
          organisationId,
          branchId,
          productId,
          batchNumber: item.batch,
          expiryDate: item.expiry || '12/2026',
          availableQuantity: item.stock || 0,
          costPrice: (item.sellingPrice || item.mrp) * 0.7,
          mrp: item.mrp || 0,
          sellingPrice: item.sellingPrice || item.mrp || 0,
          updatedAt: now,
        });
      }
    }

    await this.db.products.bulkPut(productRecords);
    await this.db.inventory.bulkPut(inventoryRecords);
  }

  /**
   * Commit a POS Sale ATOMICALLY:
   * 1. Writes transaction aggregate to `transactions` table (status: 'LOCAL_COMMITTED', syncStatus: 'PENDING')
   * 2. Writes sync command to `sync_outbox` table (mutationType: 'CREATE_SALE', status: 'PENDING')
   * 3. Decrements batch stock in `inventory` table
   *
   * All three operations are executed inside an atomic Dexie transaction `db.transaction('rw', ...)`.
   * If any step fails, all changes are rolled back automatically.
   */
  async commitLocalSale(
    saleData: any,
    context: {
      organisationId?: string;
      branchId?: string;
      userId?: string;
      deviceId?: string;
    } = {}
  ): Promise<SaleCommitResult> {
    const organisationId = context.organisationId || this.defaultOrgId || DEFAULT_ORG_ID;
    const branchId = context.branchId || this.defaultBranchId || DEFAULT_BRANCH_ID;
    const userId = context.userId || this.defaultUserId || DEFAULT_USER_ID;
    const deviceId = context.deviceId || (await this.syncMetaRepo.getDeviceId());

    const transactionId = generateUUID();
    const mutationId = generateUUID();
    const occurredAt = new Date().toISOString();
    const invoiceNumber = saleData.invoiceNo || `INV-${Math.floor(100000 + Math.random() * 900000)}`;

    const totalAmount = Number(saleData.total || saleData.grandTotal || saleData.totalAmount || 0);
    const subtotal = Number(saleData.subtotal || 0);
    const taxAmount = Number(saleData.tax || saleData.totalTax || saleData.taxAmount || 0);
    const discountAmount = Number(saleData.discountAmount || saleData.totalDiscounts || 0);
    const discountPercent = Number(saleData.discountPercent || 0);
    const paymentMode = saleData.paymentMode || 'Cash';
    const payments = saleData.payments || [
      {
        method: paymentMode,
        amount: totalAmount,
      },
    ];

    const normalizedItems = (saleData.items || []).map((item: any) => {
      const pId = item.id || item.productId;
      const bNumber = item.batch || item.batchNumber || '';
      const quantity = Number(item.qty || item.quantity || 1);
      const unitPrice = Number(item.sellingPrice || item.price || 0);
      const mrp = Number(item.mrp || unitPrice);
      const discPercent = Number(item.discountPercent || item.discount || 0);
      const discAmt = Number(item.discountAmount || (unitPrice * quantity * discPercent) / 100 || 0);
      const gstRate = Number(item.gstRate || item.taxRate || 5);
      const itemTax = Number(item.taxAmount || item.tax || (unitPrice * quantity * gstRate) / 100 || 0);
      const itemTotal = Number(item.total || (unitPrice * quantity - discAmt + itemTax));

      return {
        productId: pId,
        name: item.name,
        barcode: item.barcode || '',
        sku: item.sku || '',
        batchNumber: bNumber,
        expiry: item.expiry || '',
        quantity,
        sellingPrice: unitPrice,
        mrp,
        discountPercent: discPercent,
        discountAmount: discAmt,
        gstRate,
        taxAmount: itemTax,
        total: itemTotal,
      };
    });

    const canonicalPayload = {
      clientTransactionId: transactionId,
      mutationId,
      invoiceNumber,
      organisationId,
      branchId,
      branchName: saleData.branch || saleData.branchName || 'Main Branch',
      userId,
      cashierName: saleData.cashier || saleData.cashierName || 'Cashier 01',
      deviceId,
      occurredAt,
      customer: {
        id: saleData.customerId || (saleData.customer === 'Walk-in Customer' ? undefined : saleData.customerId),
        name: saleData.customer || saleData.customerName || 'Walk-in Customer',
        phone: saleData.customerPhone || saleData.phone || '',
      },
      items: normalizedItems,
      pricing: {
        subtotal,
        discountPercent,
        discountAmount,
        taxAmount,
        totalAmount,
        roundOff: Number(saleData.roundOff || 0),
      },
      payment: {
        mode: paymentMode,
        payments,
        cashTendered: Number(saleData.cashTendered || totalAmount),
        changeDue: Number(saleData.changeDue || 0),
        creditAllowed: Boolean(saleData.creditAllowed),
      },
      metadata: {
        draftId: saleData.draftId || undefined,
        note: saleData.note || '',
        doctorName: saleData.doctorName || undefined,
      },
      // Backward-compatible flat fields
      ...saleData,
    };

    const transactionRecord: TransactionRecord = {
      transactionId,
      mutationId,
      type: 'SALE',
      organisationId,
      branchId,
      userId,
      deviceId,
      invoiceNumber,
      payload: canonicalPayload,
      occurredAt,
      status: 'LOCAL_COMMITTED',
      syncStatus: 'PENDING',
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    const outboxRecord: Omit<SyncOutboxRecord, 'sequence'> = {
      mutationId,
      mutationType: 'CREATE_SALE',
      organisationId,
      branchId,
      deviceId,
      userId,
      payload: canonicalPayload,
      status: 'PENDING',
      attemptCount: 0,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    // Execute multi-store atomic write:
    // transactions + sync_outbox + local inventory batch projection
    await this.db.transaction('rw', [this.db.transactions, this.db.sync_outbox, this.db.inventory], async () => {
      // 1. Save Transaction Aggregate
      await this.db.transactions.put(transactionRecord);

      // 2. Enqueue Outbound Mutation
      await this.db.sync_outbox.add(outboxRecord as SyncOutboxRecord);

      // 3. Decrement Inventory Batches (Local Projection Only)
      if (Array.isArray(saleData.items)) {
        for (const item of saleData.items) {
          const productId = item.id || item.productId;
          const batchNumber = item.batch || item.batchNumber;
          const qty = Number(item.qty || item.quantity || 1);

          if (productId) {
            if (batchNumber) {
              const batch = await this.db.inventory
                .where('[branchId+productId]')
                .equals([branchId, productId])
                .filter((b) => b.batchNumber === batchNumber)
                .first();

              if (batch) {
                const newQty = Math.max(0, batch.availableQuantity - qty);
                await this.db.inventory.put({
                  ...batch,
                  availableQuantity: newQty,
                  updatedAt: occurredAt,
                });
              }
            } else {
              // FEFO fallback
              const batches = await this.db.inventory
                .where('[branchId+productId]')
                .equals([branchId, productId])
                .filter((b) => b.availableQuantity > 0)
                .sortBy('expiryDate');

              let remainingToDeduct = qty;
              for (const b of batches) {
                if (remainingToDeduct <= 0) break;
                const deduct = Math.min(b.availableQuantity, remainingToDeduct);
                remainingToDeduct -= deduct;
                await this.db.inventory.put({
                  ...b,
                  availableQuantity: b.availableQuantity - deduct,
                  updatedAt: occurredAt,
                });
              }
            }
          }
        }
      }
    });

    return {
      transactionId,
      mutationId,
      invoiceNumber,
      status: 'LOCAL_COMMITTED',
      syncStatus: 'PENDING',
      occurredAt,
    };
  }

  /**
   * Fetch recent transactions formatted for POS Invoices list
   */
  async getRecentInvoices(
    branchId = DEFAULT_BRANCH_ID,
    limit = 50,
    organisationId?: string
  ): Promise<any[]> {
    const records = await this.transactionRepo.getRecentTransactions(branchId, limit, organisationId);
    return records.map((tx) => {
      const p = tx.payload || {};
      const cust = p.customer || {};
      const pricing = p.pricing || {};
      const pmt = p.payment || {};

      return {
        invoiceNo: tx.invoiceNumber || p.invoiceNo || p.invoiceNumber || tx.transactionId.slice(0, 8),
        date: new Date(tx.occurredAt).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        customer: cust.name || p.customer || p.customerName || 'Walk-in Customer',
        phone: cust.phone || p.phone || p.customerPhone || '—',
        paymentMode: pmt.mode || p.paymentMode || (p.payments?.[0]?.method) || 'Cash',
        subtotal: pricing.subtotal ?? p.subtotal ?? 0,
        tax: pricing.taxAmount ?? p.tax ?? p.taxAmount ?? 0,
        total: pricing.totalAmount ?? p.total ?? p.totalAmount ?? 0,
        status: tx.status === 'LOCAL_COMMITTED' ? 'Completed' : tx.status,
        syncStatus: tx.syncStatus,
        cashier: p.cashierName || p.cashier || 'Cashier 01',
        branch: p.branchName || p.branch || 'Main Branch',
        items: p.items || [],
        transactionId: tx.transactionId,
        mutationId: tx.mutationId,
      };
    });
  }

  /**
   * Get all active products for POS catalog
   */
  async getProducts(organisationId = DEFAULT_ORG_ID): Promise<ProductRecord[]> {
    return this.productRepo.getAllProducts(organisationId);
  }

  /**
   * Fetch local catalogue projection for POS UI:
   * Aggregates products with their available branch batches, stock, and pricing.
   */
  async getCatalogForPos(
    organisationId: string = this.defaultOrgId || DEFAULT_ORG_ID,
    branchId: string = this.defaultBranchId || DEFAULT_BRANCH_ID
  ): Promise<any[]> {
    const products = await this.db.products
      .where('organisationId')
      .equals(organisationId)
      .filter((p) => p.active !== false)
      .toArray();

    if (products.length === 0) {
      return [];
    }

    const result = [];
    for (const p of products) {
      const batches = await this.db.inventory
        .where('[branchId+productId]')
        .equals([branchId, p.productId])
        .toArray();

      const totalStock = batches.reduce((sum, b) => sum + (b.availableQuantity || 0), 0);
      const activeBatches = batches.filter((b) => b.availableQuantity > 0);
      const primaryBatch = activeBatches[0] || batches[0] || null;

      result.push({
        id: p.productId,
        name: p.name,
        generic: p.genericName || '',
        barcode: p.barcode || p.sku || '',
        sku: p.sku || '',
        category: p.category || 'General',
        batch: primaryBatch?.batchNumber || '',
        expiry: primaryBatch?.expiryDate || '',
        mrp: primaryBatch?.mrp || p.mrp || 0,
        sellingPrice: primaryBatch?.sellingPrice || p.sellingPrice || primaryBatch?.mrp || p.mrp || 0,
        stock: totalStock,
        gstRate: p.gstRate || 5,
        pack: p.packSize ? String(p.packSize) : 'Unit',
        batches: batches.map((b) => ({
          batch: b.batchNumber,
          expiry: b.expiryDate,
          stock: b.availableQuantity,
          price: b.sellingPrice,
          mrp: b.mrp,
        })),
      });
    }

    return result;
  }

  /**
   * Fetch local customers list for POS UI
   */
  async getCustomersForPos(
    organisationId: string = this.defaultOrgId || DEFAULT_ORG_ID
  ): Promise<CustomerRecord[]> {
    return this.db.customers
      .where('organisationId')
      .equals(organisationId)
      .toArray();
  }

  /**
   * Search products by barcode or text query
   */
  async searchProducts(query: string, organisationId = DEFAULT_ORG_ID): Promise<ProductRecord[]> {
    return this.productRepo.searchProducts(organisationId, query);
  }

  /**
   * Lookup customer by phone
   */
  async findCustomerByPhone(phone: string, organisationId = DEFAULT_ORG_ID): Promise<CustomerRecord | undefined> {
    return this.customerRepo.findCustomerByPhone(organisationId, phone);
  }

  /**
   * Commit a newly created offline customer atomically:
   * 1. Writes customer to `customers` store (isLocallyCreated: true, syncStatus: 'PENDING')
   * 2. Writes sync command to `sync_outbox` store (mutationType: 'CREATE_CUSTOMER', status: 'PENDING')
   *
   * Executed inside an atomic Dexie transaction `db.transaction('rw', ...)`.
   */
  async commitLocalCustomer(
    customerData: {
      customerId?: string;
      name: string;
      phone: string;
      email?: string;
      address?: string;
      doctorName?: string;
      gstin?: string;
      category?: string;
      gender?: string;
      dateOfBirth?: string;
    },
    context: {
      organisationId?: string;
      branchId?: string;
      userId?: string;
      deviceId?: string;
    } = {}
  ): Promise<{ customer: CustomerRecord; mutationId: string }> {
    const organisationId = context.organisationId || this.defaultOrgId || DEFAULT_ORG_ID;
    const branchId = context.branchId || this.defaultBranchId || DEFAULT_BRANCH_ID;
    const userId = context.userId || this.defaultUserId || DEFAULT_USER_ID;
    const deviceId = context.deviceId || (await this.syncMetaRepo.getDeviceId());

    const customerId = customerData.customerId || generateUUID();
    const mutationId = generateUUID();
    const occurredAt = new Date().toISOString();

    const customerRecord: CustomerRecord = {
      ...customerData,
      customerId,
      organisationId,
      name: customerData.name.trim(),
      phone: customerData.phone.trim(),
      email: customerData.email?.trim(),
      address: customerData.address?.trim(),
      doctorName: customerData.doctorName?.trim(),
      gstin: customerData.gstin?.trim(),
      isLocallyCreated: true,
      syncStatus: 'PENDING',
      updatedAt: occurredAt,
    };

    const outboxRecord: Omit<SyncOutboxRecord, 'sequence'> = {
      mutationId,
      mutationType: 'CREATE_CUSTOMER',
      organisationId,
      branchId,
      deviceId,
      userId,
      payload: {
        customerId,
        name: customerRecord.name,
        phone: customerRecord.phone,
        email: customerRecord.email || null,
        address: customerRecord.address || null,
        doctorName: customerRecord.doctorName || null,
        gstin: customerRecord.gstin || null,
        category: (customerData as any).category || null,
      },
      status: 'PENDING',
      attemptCount: 0,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    await this.db.transaction('rw', [this.db.customers, this.db.sync_outbox], async () => {
      await this.db.customers.put(customerRecord);
      await this.db.sync_outbox.add(outboxRecord as SyncOutboxRecord);
    });

    return { customer: customerRecord, mutationId };
  }

  /**
   * Create or update local customer (persists customer + creates durable outbox mutation)
   */
  async saveCustomer(
    customerData: any,
    contextOrOrgId: any = DEFAULT_ORG_ID
  ): Promise<CustomerRecord> {
    const context =
      typeof contextOrOrgId === 'string'
        ? { organisationId: contextOrOrgId }
        : contextOrOrgId || {};
    const res = await this.commitLocalCustomer(customerData, context);
    return res.customer;
  }

  /**
   * Record a customer payment offline atomically:
   * 1. Updates customer's `outstandingBalance` in `customers` table if customer exists.
   * 2. Writes durable sync command to `sync_outbox` (mutationType: 'RECORD_CUSTOMER_PAYMENT', status: 'PENDING').
   *
   * Executed inside an atomic Dexie transaction `db.transaction('rw', ...)`.
   */
  async recordLocalCustomerPayment(
    paymentData: {
      paymentId?: string;
      customerId: string;
      amount: number;
      paymentMethod?: string;
      receiptNumber?: string;
      notes?: string;
      reference?: string;
      allocations?: Array<{ invoiceId: string; amount: number }>;
    },
    context: {
      organisationId?: string;
      branchId?: string;
      userId?: string;
      deviceId?: string;
    } = {}
  ): Promise<{ paymentId: string; mutationId: string; newBalance?: number }> {
    const organisationId = context.organisationId || this.defaultOrgId || DEFAULT_ORG_ID;
    const branchId = context.branchId || this.defaultBranchId || DEFAULT_BRANCH_ID;
    const userId = context.userId || this.defaultUserId || DEFAULT_USER_ID;
    const deviceId = context.deviceId || (await this.syncMetaRepo.getDeviceId());

    const paymentId = paymentData.paymentId || generateUUID();
    const mutationId = generateUUID();
    const occurredAt = new Date().toISOString();
    const amount = Number(paymentData.amount || 0);
    const receiptNumber =
      paymentData.receiptNumber ||
      `REC-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    let newBalance: number | undefined;

    const outboxRecord: Omit<SyncOutboxRecord, 'sequence'> = {
      mutationId,
      mutationType: 'RECORD_CUSTOMER_PAYMENT',
      organisationId,
      branchId,
      deviceId,
      userId,
      payload: {
        paymentId,
        customerId: paymentData.customerId,
        amount,
        paymentMethod: paymentData.paymentMethod || 'Cash',
        receiptNumber,
        notes: paymentData.notes || null,
        reference: paymentData.reference || null,
        allocations: paymentData.allocations || [],
      },
      status: 'PENDING',
      attemptCount: 0,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    await this.db.transaction('rw', [this.db.customers, this.db.transactions, this.db.sync_outbox], async () => {
      const cust = await this.db.customers.get(paymentData.customerId);
      if (cust) {
        const currentBal = Number(cust.outstandingBalance || 0);
        newBalance = currentBal - amount;
        await this.db.customers.put({
          ...cust,
          outstandingBalance: newBalance,
          updatedAt: occurredAt,
        });
      }

      await this.db.transactions.put({
        transactionId: paymentId,
        mutationId,
        type: 'CUSTOMER_PAYMENT',
        organisationId,
        branchId,
        userId,
        deviceId,
        invoiceNumber: receiptNumber,
        payload: {
          ...outboxRecord.payload,
          customerName: cust?.name || '',
          customerPhone: cust?.phone || '',
        },
        occurredAt,
        status: 'LOCAL_COMMITTED',
        syncStatus: 'PENDING',
        createdAt: occurredAt,
        updatedAt: occurredAt,
      });

      await this.db.sync_outbox.add(outboxRecord as SyncOutboxRecord);
    });

    return { paymentId, mutationId, newBalance };
  }

  /**
   * Fetch local customer payment receipts for UI and credit ledger
   */
  async getPaymentReceipts(
    organisationId: string = this.defaultOrgId || DEFAULT_ORG_ID,
    customerId?: string,
    limit = 50
  ): Promise<any[]> {
    const records = await this.db.transactions
      .where('type')
      .equals('CUSTOMER_PAYMENT')
      .reverse()
      .sortBy('occurredAt');

    const filtered = records
      .filter((tx) => !organisationId || tx.organisationId === organisationId)
      .filter((tx) => !customerId || tx.payload?.customerId === customerId)
      .slice(0, limit);

    return filtered.map((tx) => {
      const p = tx.payload || {};
      const amountVal = Number(p.amount || 0);
      return {
        id: p.receiptNumber || tx.invoiceNumber || `REC-${tx.transactionId.slice(0, 8)}`,
        transactionId: tx.transactionId,
        mutationId: tx.mutationId,
        customerId: p.customerId,
        customerName: p.customerName || 'Customer',
        phone: p.customerPhone || '—',
        amount: `₹${amountVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        amountRaw: amountVal,
        paymentMode: p.paymentMethod || 'Cash',
        transactionRef: p.reference || 'DIRECT-RECEIPT',
        linkedRef: p.allocations && p.allocations.length > 0
          ? p.allocations.map((a: any) => a.invoiceId).join(', ')
          : 'Ledger Dues',
        date: new Date(tx.occurredAt).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        status: tx.status === 'LOCAL_COMMITTED' ? 'Completed' : tx.status,
        syncStatus: tx.syncStatus,
        receivedBy: tx.userId || 'Pharmacist',
        branch: tx.branchId || 'Main Branch',
        notes: p.notes || '',
      };
    });
  }

  /**
   * Record a return locally while offline:
   * 1. Restocks inventory batches in local IndexedDB for returned items marked for restock.
   * 2. Enqueues a durable `CREATE_RETURN` mutation into `sync_outbox`.
   *
   * All executed inside an atomic Dexie transaction `db.transaction('rw', ...)`.
   */
  async recordLocalReturn(
    returnData: {
      returnId?: string;
      invoiceId?: string;
      customerId?: string;
      returnNumber?: string;
      refundAmount: number;
      refundMethod?: 'CASH' | 'STORE_CREDIT';
      reason?: string;
      notes?: string;
      items: Array<{
        invoiceItemId?: string;
        productId?: string;
        batchNumber?: string;
        quantityReturned: number;
        refundAmount: number;
        returnCondition?: 'SEALED' | 'OPENED' | 'DAMAGED' | 'EXPIRED' | 'OTHER';
        restockQuantity?: number;
      }>;
    },
    context: {
      organisationId?: string;
      branchId?: string;
      userId?: string;
      deviceId?: string;
    } = {}
  ): Promise<{ returnId: string; mutationId: string }> {
    const organisationId = context.organisationId || this.defaultOrgId || DEFAULT_ORG_ID;
    const branchId = context.branchId || this.defaultBranchId || DEFAULT_BRANCH_ID;
    const userId = context.userId || this.defaultUserId || DEFAULT_USER_ID;
    const deviceId = context.deviceId || (await this.syncMetaRepo.getDeviceId());

    const returnId = returnData.returnId || generateUUID();
    const invoiceId = returnData.invoiceId || generateUUID();
    const customerId = returnData.customerId || generateUUID();
    const mutationId = generateUUID();
    const occurredAt = new Date().toISOString();
    const returnNumber =
      returnData.returnNumber ||
      `RET-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const outboxRecord: Omit<SyncOutboxRecord, 'sequence'> = {
      mutationId,
      mutationType: 'CREATE_RETURN',
      organisationId,
      branchId,
      deviceId,
      userId,
      payload: {
        returnId,
        invoiceId,
        customerId,
        returnNumber,
        refundAmount: Number(returnData.refundAmount || 0),
        refundMethod: returnData.refundMethod || 'CASH',
        reason: returnData.reason || null,
        notes: returnData.notes || null,
        items: returnData.items || [],
      },
      status: 'PENDING',
      attemptCount: 0,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    await this.db.transaction(
      'rw',
      [this.db.inventory, this.db.transactions, this.db.sync_outbox],
      async () => {
        for (const item of returnData.items || []) {
          const restockQty = Number(item.restockQuantity || 0);
          if (restockQty > 0 && item.productId && item.batchNumber) {
            const batch = await this.db.inventory
              .where('[branchId+productId]')
              .equals([branchId, item.productId])
              .filter((b) => b.batchNumber === item.batchNumber)
              .first();
            if (batch) {
              await this.db.inventory.put({
                ...batch,
                availableQuantity: batch.availableQuantity + restockQty,
                updatedAt: occurredAt,
              });
            }
          }
        }

        // 2. Persist local transaction record for durable local ledger & audit trail
        await this.db.transactions.put({
          transactionId: returnId,
          mutationId,
          type: 'RETURN',
          organisationId,
          branchId,
          userId,
          deviceId,
          occurredAt,
          status: 'LOCAL_COMMITTED',
          syncStatus: 'PENDING',
          payload: outboxRecord.payload,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        });

        // 3. Enqueue durable mutation into sync_outbox
        await this.db.sync_outbox.add(outboxRecord as SyncOutboxRecord);
      }
    );

    return { returnId, mutationId };
  }

  /**
   * Receive goods/stock locally while offline:
   * 1. Restocks / creates inventory batches in local IndexedDB for received items.
   * 2. Enqueues a durable `RECEIVE_PURCHASE` mutation into `sync_outbox`.
   */
  async receiveLocalPurchase(
    purchaseData: {
      purchaseId?: string;
      goodsReceiptId?: string;
      supplierId?: string;
      supplierName?: string;
      purchaseNumber?: string;
      receiptNumber?: string;
      notes?: string;
      supplierInvoiceNumber?: string;
      packageCount?: number;
      items: Array<{
        purchaseItemId?: string;
        productId: string;
        productName?: string;
        batchNumber: string;
        expiryDate?: string;
        quantity: number;
        costPrice?: number;
        mrp?: number;
        sellingPrice?: number;
      }>;
    },
    context: {
      organisationId?: string;
      branchId?: string;
      userId?: string;
      deviceId?: string;
    } = {}
  ): Promise<{ purchaseId: string; goodsReceiptId: string; mutationId: string }> {
    const organisationId = context.organisationId || this.defaultOrgId || DEFAULT_ORG_ID;
    const branchId = context.branchId || this.defaultBranchId || DEFAULT_BRANCH_ID;
    const userId = context.userId || this.defaultUserId || DEFAULT_USER_ID;
    const deviceId = context.deviceId || (await this.syncMetaRepo.getDeviceId());

    const purchaseId = purchaseData.purchaseId || generateUUID();
    const goodsReceiptId = purchaseData.goodsReceiptId || generateUUID();
    const mutationId = generateUUID();
    const occurredAt = new Date().toISOString();
    const receiptNumber =
      purchaseData.receiptNumber || `GR-${Date.now().toString().slice(-6)}`;

    const outboxRecord: Omit<SyncOutboxRecord, 'sequence'> = {
      mutationId,
      mutationType: 'RECEIVE_PURCHASE',
      organisationId,
      branchId,
      deviceId,
      userId,
      payload: {
        purchaseId,
        goodsReceiptId,
        supplierId: purchaseData.supplierId,
        purchaseNumber: purchaseData.purchaseNumber,
        receiptNumber,
        notes: purchaseData.notes || null,
        supplierInvoiceNumber: purchaseData.supplierInvoiceNumber || null,
        packageCount: purchaseData.packageCount || 1,
        items: purchaseData.items || [],
      },
      status: 'PENDING',
      attemptCount: 0,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    if (!purchaseData.items || !Array.isArray(purchaseData.items) || purchaseData.items.length === 0) {
      throw new Error('Purchase receipt must contain at least one item');
    }

    for (const item of purchaseData.items) {
      if (!item.productId || typeof item.productId !== 'string' || !item.productId.trim()) {
        throw new Error('Valid productId is required for each received item');
      }
      if (!item.batchNumber || typeof item.batchNumber !== 'string' || !item.batchNumber.trim()) {
        throw new Error('Valid batchNumber is required for each received item');
      }
      const qty = Number(item.quantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Valid positive quantity is required for each received item');
      }
    }

    const transactionRecord: TransactionRecord = {
      transactionId: goodsReceiptId,
      mutationId,
      type: 'PURCHASE',
      organisationId,
      branchId,
      userId,
      deviceId,
      invoiceNumber: purchaseData.supplierInvoiceNumber || receiptNumber,
      payload: {
        purchaseId,
        goodsReceiptId,
        supplierId: purchaseData.supplierId,
        supplierName: (purchaseData as any).supplierName || (purchaseData as any).supplier || 'Supplier',
        purchaseNumber: purchaseData.purchaseNumber || `PO-${Date.now().toString().slice(-4)}`,
        receiptNumber,
        receivedDate: (purchaseData as any).receivedDate || new Date().toISOString().split('T')[0],
        receivedBy: (purchaseData as any).receivedBy || 'Staff',
        branchName: (purchaseData as any).branchName || 'Main Branch',
        supplierInvoiceNumber: purchaseData.supplierInvoiceNumber || null,
        packageCount: purchaseData.packageCount || 1,
        itemsCount: (purchaseData.items || []).length,
        notes: purchaseData.notes || null,
        items: purchaseData.items || [],
        status: 'Verified',
      },
      occurredAt,
      status: 'LOCAL_COMMITTED',
      syncStatus: 'PENDING',
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    await this.db.transaction('rw', [this.db.inventory, this.db.transactions, this.db.sync_outbox], async () => {
      for (const item of purchaseData.items || []) {
        const qty = Number(item.quantity || 0);
        if (qty > 0 && item.productId && item.batchNumber) {
          const batch = await this.db.inventory
            .where('[branchId+productId]')
            .equals([branchId, item.productId])
            .filter((b) => b.batchNumber === item.batchNumber)
            .first();

          if (batch) {
            await this.db.inventory.put({
              ...batch,
              availableQuantity: batch.availableQuantity + qty,
              updatedAt: occurredAt,
            });
          } else {
            await this.db.inventory.put({
              id: `${branchId}_${item.batchNumber}_${item.productId}`,
              organisationId,
              branchId,
              productId: item.productId,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate || '2028-12-31',
              availableQuantity: qty,
              costPrice: item.costPrice || 100,
              mrp: item.mrp || 130,
              sellingPrice: item.sellingPrice || item.mrp || 130,
              updatedAt: occurredAt,
            });
          }
        }
      }
      await this.db.transactions.put(transactionRecord);
      await this.db.sync_outbox.add(outboxRecord as SyncOutboxRecord);
    });

    return { purchaseId, goodsReceiptId, mutationId };
  }

  /**
   * Retrieve locally persisted goods receipts / purchase transactions.
   */
  async getLocalPurchaseReceipts(
    organisationId: string = this.defaultOrgId || DEFAULT_ORG_ID,
    branchId?: string,
    limit = 50
  ): Promise<any[]> {
    const records = await this.db.transactions
      .where('type')
      .equals('PURCHASE')
      .reverse()
      .sortBy('occurredAt');

    const filtered = records
      .filter((tx) => !organisationId || tx.organisationId === organisationId)
      .filter((tx) => !branchId || tx.branchId === branchId)
      .slice(0, limit);

    return filtered.map((tx) => {
      const p = tx.payload || {};
      return {
        realId: tx.transactionId,
        id: p.receiptNumber || tx.invoiceNumber || `GRN-${tx.transactionId.slice(0, 8)}`,
        poReference: p.purchaseNumber || 'PO-1026',
        supplier: p.supplierName || p.supplier || 'Supplier',
        receivedDate: p.receivedDate || new Date(tx.occurredAt).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        receivedBy: p.receivedBy || 'Staff',
        itemsCount: p.itemsCount || (p.items ? p.items.length : 0),
        packagesCount: p.packageCount || 1,
        invoiceNo: p.supplierInvoiceNumber || tx.invoiceNumber || '—',
        status: p.status || 'Verified',
        branch: p.branchName || 'Main Branch',
        syncStatus: tx.syncStatus,
        transactionId: tx.transactionId,
        mutationId: tx.mutationId,
        items: p.items || [],
      };
    });
  }

  /**
   * Adjust inventory batch stock locally while offline:
   * 1. Validates delta, product, and batch; asserts newQuantity >= 0.
   * 2. Atomically updates local batch in `db.inventory`:
   *    newQuantity = currentQuantity + deltaQuantity.
   * 3. Appends transaction record (type: 'ADJUSTMENT') in `db.transactions`.
   * 4. Enqueues durable `ADJUST_STOCK` mutation into `db.sync_outbox`.
   */
  async adjustLocalStock(
    adjustmentData: {
      adjustmentId?: string;
      adjustmentNumber?: string;
      productId: string;
      productName?: string;
      batchNumber: string;
      deltaQuantity: number;
      adjustmentType?: string;
      reason?: string;
      notes?: string;
    },
    context: {
      organisationId?: string;
      branchId?: string;
      userId?: string;
      deviceId?: string;
    } = {}
  ): Promise<{ adjustmentId: string; mutationId: string; newQuantity: number }> {
    const organisationId = context.organisationId || this.defaultOrgId || DEFAULT_ORG_ID;
    const branchId = context.branchId || this.defaultBranchId || DEFAULT_BRANCH_ID;
    const userId = context.userId || this.defaultUserId || DEFAULT_USER_ID;
    const deviceId = context.deviceId || (await this.syncMetaRepo.getDeviceId());

    if (!adjustmentData.productId || typeof adjustmentData.productId !== 'string' || !adjustmentData.productId.trim()) {
      throw new Error('Valid productId is required for stock adjustment');
    }
    if (!adjustmentData.batchNumber || typeof adjustmentData.batchNumber !== 'string' || !adjustmentData.batchNumber.trim()) {
      throw new Error('Valid batchNumber is required for stock adjustment');
    }
    const delta = Number(adjustmentData.deltaQuantity);
    if (isNaN(delta) || delta === 0) {
      throw new Error('Valid non-zero deltaQuantity is required for stock adjustment');
    }

    // Find the batch in Dexie
    const batch = await this.db.inventory
      .where('[branchId+productId]')
      .equals([branchId, adjustmentData.productId])
      .filter((b) => b.batchNumber === adjustmentData.batchNumber)
      .first();

    if (!batch) {
      throw new Error(`Inventory batch not found for product ${adjustmentData.productId} and batch ${adjustmentData.batchNumber} at branch ${branchId}`);
    }

    const currentQty = Number(batch.availableQuantity || 0);
    const newQty = currentQty + delta;
    if (newQty < 0) {
      throw new Error(`Stock adjustment would cause negative quantity: ${currentQty} + (${delta}) = ${newQty}`);
    }

    const adjustmentId = adjustmentData.adjustmentId || generateUUID();
    const mutationId = generateUUID();
    const occurredAt = new Date().toISOString();
    const adjustmentNumber =
      adjustmentData.adjustmentNumber || `ADJ-${Date.now().toString().slice(-6)}`;
    const reason = adjustmentData.reason || adjustmentData.adjustmentType || 'Stock count adjustment';

    const outboxRecord: Omit<SyncOutboxRecord, 'sequence'> = {
      mutationId,
      mutationType: 'ADJUST_STOCK',
      organisationId,
      branchId,
      deviceId,
      userId,
      payload: {
        adjustmentId,
        adjustmentNumber,
        productId: adjustmentData.productId,
        productName: adjustmentData.productName || batch.productId,
        batchNumber: adjustmentData.batchNumber,
        deltaQuantity: delta,
        previousQuantity: currentQty,
        newQuantity: newQty,
        adjustmentType: adjustmentData.adjustmentType || 'CYCLE_COUNT',
        reason,
        notes: adjustmentData.notes || null,
        occurredAt,
      },
      status: 'PENDING',
      attemptCount: 0,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    const transactionRecord: TransactionRecord = {
      transactionId: adjustmentId,
      mutationId,
      type: 'ADJUSTMENT',
      organisationId,
      branchId,
      userId,
      deviceId,
      invoiceNumber: adjustmentNumber,
      payload: {
        adjustmentId,
        adjustmentNumber,
        productId: adjustmentData.productId,
        productName: adjustmentData.productName || batch.productId,
        batchNumber: adjustmentData.batchNumber,
        deltaQuantity: delta,
        previousQuantity: currentQty,
        newQuantity: newQty,
        adjustmentType: adjustmentData.adjustmentType || 'CYCLE_COUNT',
        reason,
        notes: adjustmentData.notes || null,
      },
      occurredAt,
      status: 'LOCAL_COMMITTED',
      syncStatus: 'PENDING',
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    await this.db.transaction('rw', [this.db.inventory, this.db.transactions, this.db.sync_outbox], async () => {
      await this.db.inventory.put({
        ...batch,
        availableQuantity: newQty,
        updatedAt: occurredAt,
      });
      await this.db.transactions.put(transactionRecord);
      await this.db.sync_outbox.add(outboxRecord as SyncOutboxRecord);
    });

    return { adjustmentId, mutationId, newQuantity: newQty };
  }

  /**
   * Retrieve locally persisted stock adjustment records.
   */
  async getLocalStockAdjustments(
    organisationId: string = this.defaultOrgId || DEFAULT_ORG_ID,
    branchId?: string,
    limit = 50
  ): Promise<any[]> {
    const records = await this.db.transactions
      .where('type')
      .equals('ADJUSTMENT')
      .reverse()
      .sortBy('occurredAt');

    const filtered = records
      .filter((tx) => !organisationId || tx.organisationId === organisationId)
      .filter((tx) => !branchId || tx.branchId === branchId)
      .slice(0, limit);

    return filtered.map((tx) => {
      const p = tx.payload || {};
      return {
        realId: tx.transactionId,
        id: p.adjustmentNumber || tx.invoiceNumber || `ADJ-${tx.transactionId.slice(0, 8)}`,
        adjustmentId: tx.transactionId,
        productId: p.productId,
        productName: p.productName || 'Medicine Item',
        batchNumber: p.batchNumber,
        deltaQuantity: p.deltaQuantity,
        newQuantity: p.newQuantity,
        previousQuantity: p.previousQuantity,
        reason: p.reason,
        adjustmentType: p.adjustmentType || 'CYCLE_COUNT',
        occurredAt: tx.occurredAt,
        syncStatus: tx.syncStatus,
        mutationId: tx.mutationId,
      };
    });
  }

  /**
   * Transfer inventory stock locally while offline:
   * 1. Validates different source and destination branches.
   * 2. Validates product, batch, and sufficient local source stock.
   * 3. Decrements source branch stock in `db.inventory`.
   * 4. Logs transfer transaction in `db.transactions` (type: 'TRANSFER').
   * 5. Enqueues durable `TRANSFER_STOCK` mutation in `db.sync_outbox`.
   */
  async transferLocalStock(
    transferData: {
      transferId?: string;
      transferNumber?: string;
      fromBranchId?: string;
      toBranchId: string;
      toBranchName?: string;
      transferDate?: string;
      notes?: string;
      items: Array<{
        productId: string;
        productName?: string;
        batchNumber: string;
        quantity: number;
      }>;
    },
    context: {
      organisationId?: string;
      branchId?: string;
      userId?: string;
      deviceId?: string;
    } = {}
  ): Promise<{ transferId: string; transferNumber: string; mutationId: string }> {
    const organisationId = context.organisationId || this.defaultOrgId || DEFAULT_ORG_ID;
    const fromBranchId = transferData.fromBranchId || context.branchId || this.defaultBranchId || DEFAULT_BRANCH_ID;
    const toBranchId = transferData.toBranchId;
    const userId = context.userId || this.defaultUserId || DEFAULT_USER_ID;
    const deviceId = context.deviceId || (await this.syncMetaRepo.getDeviceId());

    if (!toBranchId || typeof toBranchId !== 'string' || !toBranchId.trim()) {
      throw new Error('Destination branch (toBranchId) is required');
    }
    if (fromBranchId === toBranchId) {
      throw new Error('Source and destination branches must be different');
    }
    if (!transferData.items || !Array.isArray(transferData.items) || transferData.items.length === 0) {
      throw new Error('Transfer must contain at least one line item');
    }

    // Pre-validate all items have sufficient local stock in source branch
    const batchesToUpdate: Array<{ batch: any; newQty: number }> = [];
    for (const item of transferData.items) {
      if (!item.productId || typeof item.productId !== 'string' || !item.productId.trim()) {
        throw new Error('Valid productId is required for each transferred item');
      }
      if (!item.batchNumber || typeof item.batchNumber !== 'string' || !item.batchNumber.trim()) {
        throw new Error('Valid batchNumber is required for each transferred item');
      }
      const qty = Number(item.quantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Valid positive transfer quantity is required for each item');
      }

      const batch = await this.db.inventory
        .where('[branchId+productId]')
        .equals([fromBranchId, item.productId])
        .filter((b) => b.batchNumber === item.batchNumber)
        .first();

      if (!batch) {
        throw new Error(`Source batch not found for product ${item.productId} and batch ${item.batchNumber} at branch ${fromBranchId}`);
      }

      const avail = Number(batch.availableQuantity || 0);
      if (avail < qty) {
        throw new Error(`Insufficient stock for product ${item.productName || item.productId} (batch ${item.batchNumber}): available ${avail}, requested ${qty}`);
      }

      batchesToUpdate.push({ batch, newQty: avail - qty });
    }

    const transferId = transferData.transferId || generateUUID();
    const mutationId = generateUUID();
    const occurredAt = new Date().toISOString();
    const transferDate = transferData.transferDate || occurredAt.split('T')[0];
    const transferNumber =
      transferData.transferNumber || `TR-${Date.now().toString().slice(-6)}`;
    const totalQuantity = transferData.items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

    const outboxRecord: Omit<SyncOutboxRecord, 'sequence'> = {
      mutationId,
      mutationType: 'TRANSFER_STOCK',
      organisationId,
      branchId: fromBranchId,
      deviceId,
      userId,
      payload: {
        transferId,
        transferNumber,
        fromBranchId,
        toBranchId,
        toBranchName: transferData.toBranchName || 'Destination Branch',
        transferDate,
        notes: transferData.notes || null,
        status: 'IN_TRANSIT',
        items: transferData.items,
        totalQuantity,
        occurredAt,
      },
      status: 'PENDING',
      attemptCount: 0,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    const transactionRecord: TransactionRecord = {
      transactionId: transferId,
      mutationId,
      type: 'TRANSFER',
      organisationId,
      branchId: fromBranchId,
      userId,
      deviceId,
      invoiceNumber: transferNumber,
      payload: {
        transferId,
        transferNumber,
        fromBranchId,
        toBranchId,
        toBranchName: transferData.toBranchName || 'Destination Branch',
        transferDate,
        notes: transferData.notes || null,
        status: 'In Transit',
        items: transferData.items,
        totalQuantity,
        itemsCount: transferData.items.length,
      },
      occurredAt,
      status: 'LOCAL_COMMITTED',
      syncStatus: 'PENDING',
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    await this.db.transaction('rw', [this.db.inventory, this.db.transactions, this.db.sync_outbox], async () => {
      for (const update of batchesToUpdate) {
        await this.db.inventory.put({
          ...update.batch,
          availableQuantity: update.newQty,
          updatedAt: occurredAt,
        });
      }
      await this.db.transactions.put(transactionRecord);
      await this.db.sync_outbox.add(outboxRecord as SyncOutboxRecord);
    });

    return { transferId, transferNumber, mutationId };
  }

  /**
   * Retrieve locally persisted stock transfer records.
   */
  async getLocalTransfers(
    organisationId: string = this.defaultOrgId || DEFAULT_ORG_ID,
    branchId?: string,
    limit = 50
  ): Promise<any[]> {
    const records = await this.db.transactions
      .where('type')
      .equals('TRANSFER')
      .reverse()
      .sortBy('occurredAt');

    const filtered = records
      .filter((tx) => !organisationId || tx.organisationId === organisationId)
      .filter((tx) => !branchId || tx.branchId === branchId)
      .slice(0, limit);

    return filtered.map((tx) => {
      const p = tx.payload || {};
      return {
        realId: tx.transactionId,
        id: p.transferNumber || tx.invoiceNumber || `TR-${tx.transactionId.slice(0, 8)}`,
        transferId: tx.transactionId,
        fromBranch: p.fromBranchName || (p.fromBranchId === branchId ? 'This Branch' : p.fromBranchId) || 'Main Branch',
        fromBranchId: p.fromBranchId,
        toBranch: p.toBranchName || p.toBranchId || 'Destination Branch',
        toBranchId: p.toBranchId,
        transferDate: p.transferDate || new Date(tx.occurredAt).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        items: p.itemsCount || (p.items ? p.items.length : 1),
        totalQuantity: p.totalQuantity || 0,
        status: p.status || 'In Transit',
        notes: p.notes || '',
        syncStatus: tx.syncStatus,
        mutationId: tx.mutationId,
        createdBy: 'Staff',
      };
    });
  }

  /**
   * Record a cash expense locally while offline:
   * Enqueues a durable `RECORD_CASH_EXPENSE` mutation into `sync_outbox`.
   */
  async recordLocalCashExpense(
    expenseData: {
      movementId?: string;
      cashRegisterSessionId?: string;
      amount: number;
      reason: string;
      movementNumber?: string;
      notes?: string;
    },
    context: {
      organisationId?: string;
      branchId?: string;
      userId?: string;
      deviceId?: string;
    } = {}
  ): Promise<{ movementId: string; mutationId: string }> {
    const organisationId = context.organisationId || this.defaultOrgId || DEFAULT_ORG_ID;
    const branchId = context.branchId || this.defaultBranchId || DEFAULT_BRANCH_ID;
    const userId = context.userId || this.defaultUserId || DEFAULT_USER_ID;
    const deviceId = context.deviceId || (await this.syncMetaRepo.getDeviceId());

    const movementId = expenseData.movementId || generateUUID();
    const mutationId = generateUUID();
    const occurredAt = new Date().toISOString();

    const outboxRecord: Omit<SyncOutboxRecord, 'sequence'> = {
      mutationId,
      mutationType: 'RECORD_CASH_EXPENSE',
      organisationId,
      branchId,
      deviceId,
      userId,
      payload: {
        movementId,
        cashRegisterSessionId: expenseData.cashRegisterSessionId,
        amount: Number(expenseData.amount || 0),
        reason: expenseData.reason || 'Cash expense',
        movementNumber:
          expenseData.movementNumber || `EXP-${Date.now().toString().slice(-6)}`,
      },
      status: 'PENDING',
      attemptCount: 0,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    await this.db.sync_outbox.add(outboxRecord as SyncOutboxRecord);

    return { movementId, mutationId };
  }

  // ==========================================
  // PHASE 5: CASH REGISTER & MOVEMENTS
  // ==========================================

  /**
   * Retrieve all cash registers configured for this branch.
   */
  async getLocalRegisters(
    organisationId = this.defaultOrgId || DEFAULT_ORG_ID,
    branchId = this.defaultBranchId || DEFAULT_BRANCH_ID
  ): Promise<CashRegisterRecord[]> {
    return this.db.cash_registers
      .where('[organisationId+branchId]')
      .equals([organisationId, branchId])
      .toArray();
  }

  /**
   * Retrieve the active OPEN or CLOSE_PENDING register session for this branch.
   */
  async getLocalOpenRegisterSession(
    organisationId = this.defaultOrgId || DEFAULT_ORG_ID,
    branchId = this.defaultBranchId || DEFAULT_BRANCH_ID
  ): Promise<RegisterSessionRecord | null> {
    const sessions = await this.db.register_sessions
      .where('[organisationId+branchId]')
      .equals([organisationId, branchId])
      .filter((s) => s.status === 'OPEN' || s.status === 'CLOSE_PENDING')
      .reverse()
      .sortBy('openedAt');

    return sessions.length > 0 ? sessions[0] : null;
  }

  /**
   * Atomically open a new register session locally in Dexie:
   * 1. Validates no other session is currently OPEN for the register/branch.
   * 2. Persists session record into `db.register_sessions` (status: 'OPEN').
   * 3. If opening balance > 0, creates initial float movement in `db.cash_movements`.
   * 4. Persists append-only business transaction in `db.transactions`.
   * 5. Enqueues durable `OPEN_REGISTER_SESSION` mutation in `db.sync_outbox`.
   */
  async openLocalRegisterSession(
    sessionData: {
      sessionId?: string;
      cashRegisterId?: string;
      openingBalance?: number;
      shiftName?: string;
      notes?: string;
    },
    context: {
      organisationId?: string;
      branchId?: string;
      userId?: string;
      deviceId?: string;
    } = {}
  ): Promise<{ session: RegisterSessionRecord; mutationId: string }> {
    const organisationId = context.organisationId || this.defaultOrgId || DEFAULT_ORG_ID;
    const branchId = context.branchId || this.defaultBranchId || DEFAULT_BRANCH_ID;
    const userId = context.userId || this.defaultUserId || DEFAULT_USER_ID;
    const deviceId = context.deviceId || (await this.syncMetaRepo.getDeviceId());

    const sessionId = sessionData.sessionId || generateUUID();
    const mutationId = generateUUID();
    const occurredAt = new Date().toISOString();
    const openingBalance = Math.max(0, Number(sessionData.openingBalance || 0));
    const sessionNumber = `REG-${Date.now().toString().slice(-6)}`;
    const shiftName = sessionData.shiftName || 'Day Shift';

    return this.db.transaction(
      'rw',
      [
        this.db.register_sessions,
        this.db.cash_registers,
        this.db.cash_movements,
        this.db.transactions,
        this.db.sync_outbox,
      ],
      async () => {
        // 1. Resolve or create cash register
        let cashRegisterId = sessionData.cashRegisterId;
        if (!cashRegisterId) {
          const existingRegs = await this.db.cash_registers
            .where('[organisationId+branchId]')
            .equals([organisationId, branchId])
            .toArray();

          if (existingRegs.length > 0) {
            cashRegisterId = existingRegs[0].id;
          } else {
            cashRegisterId = generateUUID();
            await this.db.cash_registers.put({
              id: cashRegisterId,
              organisationId,
              branchId,
              name: 'Main Counter',
              identifier: 'POS-01',
              isActive: true,
              createdAt: occurredAt,
              updatedAt: occurredAt,
            });
          }
        }

        // 2. Enforce only one OPEN session per register
        const activeSessions = await this.db.register_sessions
          .where('cashRegisterId')
          .equals(cashRegisterId)
          .filter((s) => s.status === 'OPEN')
          .toArray();

        if (activeSessions.length > 0) {
          throw new Error('A session is already open for this cash register.');
        }

        // 3. Persist local session
        const sessionRecord: RegisterSessionRecord = {
          id: sessionId,
          organisationId,
          branchId,
          cashRegisterId,
          cashierId: userId,
          sessionNumber,
          shiftName,
          openingBalance,
          status: 'OPEN',
          openingNotes: sessionData.notes || undefined,
          openedAt: occurredAt,
          syncStatus: 'PENDING',
          updatedAt: occurredAt,
        };
        await this.db.register_sessions.put(sessionRecord);

        // 4. Record opening float in movements if > 0
        let openingFloatMovementId: string | undefined = undefined;
        if (openingBalance > 0) {
          openingFloatMovementId = generateUUID();
          await this.db.cash_movements.put({
            id: openingFloatMovementId,
            organisationId,
            branchId,
            cashRegisterSessionId: sessionId,
            cashierId: userId,
            movementNumber: `PC-${Date.now().toString().slice(-6)}`,
            movementType: 'IN',
            amount: openingBalance,
            reason: 'Opening float balance',
            occurredAt,
            syncStatus: 'PENDING',
            updatedAt: occurredAt,
          });
        }

        // 5. Append-only transaction audit log
        const transactionRecord: TransactionRecord = {
          transactionId: generateUUID(),
          mutationId,
          type: 'REGISTER_OPEN',
          organisationId,
          branchId,
          userId,
          deviceId,
          payload: {
            sessionId,
            cashRegisterId,
            sessionNumber,
            openingBalance,
            shiftName,
            notes: sessionData.notes,
            openingFloatMovementId,
          },
          occurredAt,
          status: 'LOCAL_COMMITTED',
          syncStatus: 'PENDING',
          createdAt: occurredAt,
          updatedAt: occurredAt,
        };
        await this.db.transactions.put(transactionRecord);

        // 6. Enqueue OPEN_REGISTER_SESSION in sync_outbox
        const outboxRecord: Omit<SyncOutboxRecord, 'sequence'> = {
          mutationId,
          mutationType: 'OPEN_REGISTER_SESSION',
          organisationId,
          branchId,
          deviceId,
          userId,
          payload: {
            sessionId,
            cashRegisterId,
            sessionNumber,
            openingBalance,
            shiftName,
            notes: sessionData.notes,
            openingFloatMovementId,
          },
          status: 'PENDING',
          attemptCount: 0,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        };
        await this.db.sync_outbox.add(outboxRecord as SyncOutboxRecord);

        return { session: sessionRecord, mutationId };
      }
    );
  }

  /**
   * Atomically record a petty cash movement (IN or OUT) in Dexie:
   * 1. Validates active session exists and is OPEN.
   * 2. Persists movement into `db.cash_movements`.
   * 3. Persists transaction log into `db.transactions`.
   * 4. Enqueues durable `RECORD_CASH_MOVEMENT` mutation in `db.sync_outbox`.
   */
  async recordLocalCashMovement(
    movementData: {
      movementId?: string;
      cashRegisterSessionId?: string;
      movementType: 'IN' | 'OUT';
      amount: number;
      reason: string;
      movementNumber?: string;
    },
    context: {
      organisationId?: string;
      branchId?: string;
      userId?: string;
      deviceId?: string;
    } = {}
  ): Promise<{ movement: CashMovementRecord; mutationId: string }> {
    const organisationId = context.organisationId || this.defaultOrgId || DEFAULT_ORG_ID;
    const branchId = context.branchId || this.defaultBranchId || DEFAULT_BRANCH_ID;
    const userId = context.userId || this.defaultUserId || DEFAULT_USER_ID;
    const deviceId = context.deviceId || (await this.syncMetaRepo.getDeviceId());

    const amount = Number(movementData.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Movement amount must be greater than 0.');
    }

    const type = movementData.movementType.toUpperCase() === 'IN' ? 'IN' : 'OUT';
    const movementId = movementData.movementId || generateUUID();
    const mutationId = generateUUID();
    const occurredAt = new Date().toISOString();
    const movementNumber =
      movementData.movementNumber || `PC-${Date.now().toString().slice(-6)}`;

    return this.db.transaction(
      'rw',
      [
        this.db.register_sessions,
        this.db.cash_movements,
        this.db.transactions,
        this.db.sync_outbox,
      ],
      async () => {
        // 1. Resolve session
        let sessionId = movementData.cashRegisterSessionId;
        if (!sessionId) {
          const activeSession = await this.db.register_sessions
            .where('[organisationId+branchId]')
            .equals([organisationId, branchId])
            .filter((s) => s.status === 'OPEN')
            .first();

          if (!activeSession) {
            throw new Error('Cannot record cash movement without an active open register session.');
          }
          sessionId = activeSession.id;
        } else {
          const sess = await this.db.register_sessions.get(sessionId);
          if (!sess) {
            throw new Error(`Register session ${sessionId} not found.`);
          }
          if (sess.status === 'CLOSED' || sess.status === 'CLOSE_PENDING') {
            throw new Error(`Register session ${sessionId} is ${sess.status.toLowerCase()}. Movements cannot be added.`);
          }
        }

        // 2. Persist movement record
        const movementRecord: CashMovementRecord = {
          id: movementId,
          organisationId,
          branchId,
          cashRegisterSessionId: sessionId,
          cashierId: userId,
          movementNumber,
          movementType: type,
          amount,
          reason: movementData.reason || (type === 'IN' ? 'Cash float addition' : 'General payout'),
          occurredAt,
          syncStatus: 'PENDING',
          updatedAt: occurredAt,
        };
        await this.db.cash_movements.put(movementRecord);

        // 3. Audit transaction log
        const transactionRecord: TransactionRecord = {
          transactionId: generateUUID(),
          mutationId,
          type: 'CASH_MOVEMENT',
          organisationId,
          branchId,
          userId,
          deviceId,
          payload: {
            movementId,
            cashRegisterSessionId: sessionId,
            movementNumber,
            movementType: type,
            amount,
            reason: movementRecord.reason,
          },
          occurredAt,
          status: 'LOCAL_COMMITTED',
          syncStatus: 'PENDING',
          createdAt: occurredAt,
          updatedAt: occurredAt,
        };
        await this.db.transactions.put(transactionRecord);

        // 4. Enqueue RECORD_CASH_MOVEMENT in outbox
        const outboxRecord: Omit<SyncOutboxRecord, 'sequence'> = {
          mutationId,
          mutationType: 'RECORD_CASH_MOVEMENT',
          organisationId,
          branchId,
          deviceId,
          userId,
          payload: {
            movementId,
            cashRegisterSessionId: sessionId,
            movementNumber,
            movementType: type,
            amount,
            reason: movementRecord.reason,
          },
          status: 'PENDING',
          attemptCount: 0,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        };
        await this.db.sync_outbox.add(outboxRecord as SyncOutboxRecord);

        return { movement: movementRecord, mutationId };
      }
    );
  }

  /**
   * Retrieve all cash movements for a given session.
   */
  async getLocalCashMovements(
    sessionId: string,
    organisationId = this.defaultOrgId || DEFAULT_ORG_ID,
    branchId = this.defaultBranchId || DEFAULT_BRANCH_ID
  ): Promise<CashMovementRecord[]> {
    return this.db.cash_movements
      .where('cashRegisterSessionId')
      .equals(sessionId)
      .toArray();
  }

  /**
   * Save denomination counts entered during register reconciliation.
   */
  async saveLocalDenominations(
    sessionId: string,
    denominations: Record<string | number, number>,
    context: { organisationId?: string } = {}
  ): Promise<void> {
    const organisationId = context.organisationId || this.defaultOrgId || DEFAULT_ORG_ID;
    const now = new Date().toISOString();

    for (const [val, count] of Object.entries(denominations)) {
      const denomVal = Number(val);
      const denomCount = Number(count);
      if (denomVal > 0 && denomCount >= 0) {
        await this.db.cash_denominations.put({
          id: `${sessionId}_${denomVal}`,
          organisationId,
          cashRegisterSessionId: sessionId,
          denominationValue: denomVal,
          denominationCount: denomCount,
          updatedAt: now,
        });
      }
    }
  }

  /**
   * Prepare local register close & reconciliation:
   * 1. Marks session as CLOSE_PENDING locally (does NOT mark CLOSED offline!).
   * 2. Computes expected cash, counted cash, and variance.
   * 3. Stores closing denominations in Dexie.
   * 4. Enqueues durable `CLOSE_REGISTER_SESSION` mutation to push to authoritative server.
   */
  async prepareLocalDayClose(
    closeData: {
      sessionId?: string;
      countedCash: number;
      notes?: string;
      denominations?: Record<string | number, number>;
    },
    context: {
      organisationId?: string;
      branchId?: string;
      userId?: string;
      deviceId?: string;
    } = {}
  ): Promise<{ session: RegisterSessionRecord; mutationId: string }> {
    const organisationId = context.organisationId || this.defaultOrgId || DEFAULT_ORG_ID;
    const branchId = context.branchId || this.defaultBranchId || DEFAULT_BRANCH_ID;
    const userId = context.userId || this.defaultUserId || DEFAULT_USER_ID;
    const deviceId = context.deviceId || (await this.syncMetaRepo.getDeviceId());

    const mutationId = generateUUID();
    const occurredAt = new Date().toISOString();
    const countedCash = Number(Number(closeData.countedCash || 0).toFixed(2));

    return this.db.transaction(
      'rw',
      [
        this.db.register_sessions,
        this.db.cash_movements,
        this.db.cash_denominations,
        this.db.transactions,
        this.db.sync_outbox,
      ],
      async () => {
        let sessionId = closeData.sessionId;
        if (!sessionId) {
          const activeSession = await this.db.register_sessions
            .where('[organisationId+branchId]')
            .equals([organisationId, branchId])
            .filter((s) => s.status === 'OPEN' || s.status === 'CLOSE_PENDING')
            .first();

          if (!activeSession) {
            throw new Error('No open cash register session found to close.');
          }
          sessionId = activeSession.id;
        }

        const session = await this.db.register_sessions.get(sessionId);
        if (!session) {
          throw new Error(`Register session ${sessionId} not found.`);
        }
        if (session.status === 'CLOSED') {
          throw new Error(`Register session ${sessionId} is already closed.`);
        }

        // Calculate expected cash from local movements & opening float
        const movements = await this.db.cash_movements
          .where('cashRegisterSessionId')
          .equals(sessionId)
          .toArray();

        const cashIn = movements
          .filter((m) => m.movementType === 'IN' && m.reason !== 'Opening float balance')
          .reduce((sum, m) => sum + Number(m.amount), 0);

        const cashOut = movements
          .filter((m) => m.movementType === 'OUT')
          .reduce((sum, m) => sum + Number(m.amount), 0);

        // Authoritative formula: openingBalance + cashIn - cashOut (+ cashSales will be reconciled on server)
        const expectedCash = Number((session.openingBalance + cashIn - cashOut).toFixed(2));
        const variance = Number((countedCash - expectedCash).toFixed(2));
        const varianceStatus: 'BALANCED' | 'SHORTAGE' | 'OVERAGE' =
          variance === 0 ? 'BALANCED' : variance > 0 ? 'OVERAGE' : 'SHORTAGE';

        // Update local session to CLOSE_PENDING (server push is authoritative for CLOSED)
        const updatedSession: RegisterSessionRecord = {
          ...session,
          status: 'CLOSE_PENDING',
          countedCash,
          expectedCash,
          variance,
          varianceStatus,
          closingNotes: closeData.notes || undefined,
          syncStatus: 'PENDING',
          updatedAt: occurredAt,
        };
        await this.db.register_sessions.put(updatedSession);

        // Save denominations if provided
        if (closeData.denominations && typeof closeData.denominations === 'object') {
          for (const [val, count] of Object.entries(closeData.denominations)) {
            const denomVal = Number(val);
            const denomCount = Number(count);
            if (denomVal > 0 && denomCount >= 0) {
              await this.db.cash_denominations.put({
                id: `${sessionId}_${denomVal}`,
                organisationId,
                cashRegisterSessionId: sessionId,
                denominationValue: denomVal,
                denominationCount: denomCount,
                updatedAt: occurredAt,
              });
            }
          }
        }

        // Transaction record
        const transactionRecord: TransactionRecord = {
          transactionId: generateUUID(),
          mutationId,
          type: 'REGISTER_CLOSE',
          organisationId,
          branchId,
          userId,
          deviceId,
          payload: {
            sessionId,
            countedCash,
            expectedCash,
            variance,
            varianceStatus,
            notes: closeData.notes,
            denominations: closeData.denominations,
          },
          occurredAt,
          status: 'LOCAL_COMMITTED',
          syncStatus: 'PENDING',
          createdAt: occurredAt,
          updatedAt: occurredAt,
        };
        await this.db.transactions.put(transactionRecord);

        // Enqueue CLOSE_REGISTER_SESSION in sync_outbox
        const outboxRecord: Omit<SyncOutboxRecord, 'sequence'> = {
          mutationId,
          mutationType: 'CLOSE_REGISTER_SESSION',
          organisationId,
          branchId,
          deviceId,
          userId,
          payload: {
            sessionId,
            countedCash,
            expectedCash,
            variance,
            varianceStatus,
            notes: closeData.notes,
            denominations: closeData.denominations,
          },
          status: 'PENDING',
          attemptCount: 0,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        };
        await this.db.sync_outbox.add(outboxRecord as SyncOutboxRecord);

        return { session: updatedSession, mutationId };
      }
    );
  }
}

export const localPersistenceService = new LocalPersistenceService();
export default localPersistenceService;

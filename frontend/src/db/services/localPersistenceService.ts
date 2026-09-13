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

  /**
   * Initializes the local persistence layer:
   * - Ensures unique, durable deviceId exists
   * - Seeds initial catalog & inventory into IndexedDB if local store is empty
   */
  async initialize(
    organisationId = DEFAULT_ORG_ID,
    branchId = DEFAULT_BRANCH_ID
  ): Promise<{ deviceId: string; productCount: number }> {
    const deviceId = await this.syncMetaRepo.getDeviceId();

    // Check if products store has data
    const count = await this.db.products.count();
    if (count === 0 && MOCK_POS_PRODUCTS && MOCK_POS_PRODUCTS.length > 0) {
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
              if (remainingToDeduct > 0) {
                throw new Error('Insufficient stock: ' + remainingToDeduct + ' units short');
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

    await this.db.transaction('rw', [this.db.customers, this.db.sync_outbox], async () => {
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
      await this.db.sync_outbox.add(outboxRecord as SyncOutboxRecord);
    });

    return { paymentId, mutationId, newBalance };
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

    await this.db.transaction('rw', [this.db.inventory, this.db.sync_outbox], async () => {
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
              sellingPrice: item.sellingPrice || 130,
              updatedAt: occurredAt,
            });
          }
        }
      }
      await this.db.sync_outbox.add(outboxRecord as SyncOutboxRecord);
    });

    return { purchaseId, goodsReceiptId, mutationId };
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
}

export const localPersistenceService = new LocalPersistenceService();
export default localPersistenceService;

/**
 * PharmaFlow Offline-First Persistence Layer Types
 *
 * Core domain and storage interfaces for the local IndexedDB database ("pharmaflow_local").
 */

// ==========================================
// 1. ENUMS & CONSTANTS
// ==========================================

export type TransactionType =
  | 'SALE'
  | 'RETURN'
  | 'EXPENSE'
  | 'REGISTER_OPEN'
  | 'REGISTER_CLOSE'
  | 'ADJUSTMENT';

export type TransactionStatus =
  | 'DRAFT'
  | 'LOCAL_COMMITTED'
  | 'CANCELLED';

export type SyncStatus =
  | 'PENDING'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED'
  | 'CONFLICT';

export type OutboxStatus =
  | 'PENDING'
  | 'IN_FLIGHT'
  | 'COMPLETED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_FATAL'
  | 'CONFLICT';

export type MutationType =
  | 'CREATE_SALE'
  | 'CREATE_RETURN'
  | 'PROCESS_RETURN'
  | 'CREATE_CUSTOMER'
  | 'RECORD_CUSTOMER_PAYMENT'
  | 'RECEIVE_PURCHASE'
  | 'RECORD_CASH_EXPENSE'
  | 'UPDATE_INVENTORY'
  | 'REGISTER_OPEN'
  | 'REGISTER_CLOSE';

// ==========================================
// 2. STORE RECORDS
// ==========================================

/**
 * Products Cache Store
 * Read-optimized local replica of server product catalog.
 */
export interface ProductRecord {
  productId: string;           // Primary Key
  organisationId: string;      // Indexed
  name: string;                // Indexed
  genericName?: string;
  barcode?: string;            // Indexed
  sku?: string;                // Indexed
  category?: string;
  hsnCode?: string;
  gstRate: number;
  mrp: number;
  sellingPrice: number;
  unit: string;
  packSize?: string | number;
  isPrescriptionRequired?: boolean;
  isNarcotic?: boolean;
  active: boolean;             // Indexed
  version?: number;
  updatedAt: string;
}

/**
 * Customers Store
 * Local customer cache & offline-created customers.
 */
export interface CustomerRecord {
  customerId: string;          // Primary Key
  organisationId: string;      // Indexed
  name: string;                // Indexed
  phone: string;               // Indexed
  email?: string;
  address?: string;
  doctorName?: string;
  gstin?: string;
  category?: string;
  outstandingBalance?: number;
  creditLimit?: number;
  isLocallyCreated: boolean;
  syncStatus: SyncStatus;
  updatedAt: string;
}

/**
 * Inventory Batches Store
 * Local batch projection scoped to organisation + branch.
 */
export interface InventoryBatchRecord {
  id: string;                  // Primary Key (e.g. `${branchId}_${batchNumber}_${productId}`)
  organisationId: string;      // Indexed
  branchId: string;            // Indexed
  productId: string;           // Indexed
  batchNumber: string;         // Indexed
  expiryDate: string;          // Indexed (YYYY-MM-DD)
  availableQuantity: number;
  costPrice?: number;
  mrp: number;
  sellingPrice: number;
  updatedAt: string;
}

/**
 * Transactions Store
 * Append-only business transactions committed on this device.
 */
export interface TransactionRecord {
  transactionId: string;       // Primary Key (UUID)
  mutationId: string;          // Indexed (matches sync_outbox idempotency key)
  type: TransactionType;       // Indexed
  organisationId: string;      // Indexed
  branchId: string;            // Indexed
  userId: string;              // Indexed
  deviceId: string;            // Indexed
  invoiceNumber?: string;
  payload: SaleTransactionPayload | any;
  occurredAt: string;          // Indexed (ISO timestamp)
  status: TransactionStatus;   // Indexed
  syncStatus: SyncStatus;      // Indexed
  errorMessage?: string;
  conflictDetails?: any;
  createdAt: string;           // Indexed (ISO timestamp)
  updatedAt: string;
}

/**
 * Sync Outbox Store
 * Durable outbound mutation queue ordered by auto-increment sequence.
 */
export interface SyncOutboxRecord {
  sequence?: number;           // Primary Key (++sequence)
  mutationId: string;          // Indexed (UUID idempotency key)
  mutationType: MutationType;  // Indexed
  organisationId: string;      // Indexed
  branchId: string;            // Indexed
  deviceId: string;
  userId: string;
  payload: any;
  status: OutboxStatus;        // Indexed
  attemptCount: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;        // Indexed
  errorMessage?: string;
  conflictDetails?: any;
  createdAt: string;           // Indexed
  updatedAt: string;
}

/**
 * Sync Metadata Store
 * Key-value configuration & sync cursor store.
 */
export interface SyncMetadataRecord {
  key: string;                 // Primary Key
  value: any;
  updatedAt: string;
}

// ==========================================
// 3. POS TRANSACTION PAYLOADS
// ==========================================

export interface CartBatchItem {
  id: string;                  // Product ID
  name: string;
  barcode?: string;
  batchNumber?: string;
  expiry?: string;
  qty: number;
  price: number;
  mrp: number;
  discountPercent?: number;
  taxRate?: number;
  taxAmount?: number;
  total: number;
}

export interface PaymentMethodBreakdown {
  method: 'CASH' | 'CARD' | 'UPI' | 'CREDIT' | 'SPLIT';
  amount: number;
  reference?: string;
}

export interface SaleTransactionPayload {
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  customerId?: string;
  items: CartBatchItem[];
  subtotal: number;
  discountAmount?: number;
  discountPercent?: number;
  taxAmount: number;
  totalAmount: number;
  roundOff?: number;
  payments: PaymentMethodBreakdown[];
  cashierName: string;
  branchName?: string;
  note?: string;
  doctorName?: string;
}

export interface SaleCommitResult {
  transactionId: string;
  mutationId: string;
  invoiceNumber: string;
  status: TransactionStatus;
  syncStatus: SyncStatus;
  occurredAt: string;
}


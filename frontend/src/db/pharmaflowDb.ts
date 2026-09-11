/**
 * PharmaFlow Dexie Database Definition
 *
 * Database Name: pharmaflow_local
 * Version: 1
 *
 * Tables:
 * - products: Local catalog replica
 * - customers: Customer cache & locally created customers
 * - inventory: Local batch projection scoped to branch
 * - transactions: Local append-only business transactions
 * - sync_outbox: Durable FIFO queue of pending mutations to push to cloud
 * - sync_metadata: Device ID, sync cursors, timestamps
 */

import Dexie, { Table } from 'dexie';
import {
  ProductRecord,
  CustomerRecord,
  InventoryBatchRecord,
  TransactionRecord,
  SyncOutboxRecord,
  SyncMetadataRecord,
} from './types';

export class PharmaFlowDatabase extends Dexie {
  products!: Table<ProductRecord, string>;
  customers!: Table<CustomerRecord, string>;
  inventory!: Table<InventoryBatchRecord, string>;
  transactions!: Table<TransactionRecord, string>;
  sync_outbox!: Table<SyncOutboxRecord, number>;
  sync_metadata!: Table<SyncMetadataRecord, string>;

  constructor(dbName = 'pharmaflow_local') {
    super(dbName);

    // Schema definition for Version 1
    this.version(1).stores({
      products: 'productId, organisationId, barcode, sku, name, active, [organisationId+barcode], [organisationId+name]',
      customers: 'customerId, organisationId, phone, name, [organisationId+phone]',
      inventory: 'id, organisationId, branchId, productId, batchNumber, expiryDate, [organisationId+branchId], [branchId+productId]',
      transactions: 'transactionId, mutationId, type, organisationId, branchId, userId, deviceId, occurredAt, status, syncStatus, createdAt, [organisationId+branchId]',
      sync_outbox: '++sequence, mutationId, mutationType, organisationId, branchId, status, nextRetryAt, createdAt, [organisationId+branchId]',
      sync_metadata: 'key',
    });
  }
}

// Singleton instance for the application runtime
let dbInstance: PharmaFlowDatabase | null = null;

/**
 * Get or initialize the singleton PharmaFlowDatabase instance.
 * Allows passing an optional custom database name (useful for isolated unit tests).
 */
export function getDb(customName?: string): PharmaFlowDatabase {
  if (customName) {
    return new PharmaFlowDatabase(customName);
  }
  if (!dbInstance) {
    dbInstance = new PharmaFlowDatabase('pharmaflow_local');
  }
  return dbInstance;
}

export const db = getDb();
export default db;


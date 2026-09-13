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
  CashRegisterRecord,
  RegisterSessionRecord,
  CashMovementRecord,
  CashDenominationRecord,
} from './types';

export class PharmaFlowDatabase extends Dexie {
  products!: Table<ProductRecord, string>;
  customers!: Table<CustomerRecord, string>;
  inventory!: Table<InventoryBatchRecord, string>;
  transactions!: Table<TransactionRecord, string>;
  sync_outbox!: Table<SyncOutboxRecord, number>;
  sync_metadata!: Table<SyncMetadataRecord, string>;
  cash_registers!: Table<CashRegisterRecord, string>;
  register_sessions!: Table<RegisterSessionRecord, string>;
  cash_movements!: Table<CashMovementRecord, string>;
  cash_denominations!: Table<CashDenominationRecord, string>;

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

    // Schema definition for Version 2: Cash Register & Movements
    this.version(2).stores({
      cash_registers: 'id, organisationId, branchId, identifier, [organisationId+branchId]',
      register_sessions: 'id, organisationId, branchId, cashRegisterId, status, sessionNumber, [organisationId+branchId], [branchId+status]',
      cash_movements: 'id, organisationId, branchId, cashRegisterSessionId, movementType, movementNumber, occurredAt, [organisationId+branchId], [cashRegisterSessionId+movementType]',
      cash_denominations: 'id, organisationId, cashRegisterSessionId, denominationValue, [cashRegisterSessionId+denominationValue]',
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


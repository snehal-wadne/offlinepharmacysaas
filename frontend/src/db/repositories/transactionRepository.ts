/**
 * Transaction Repository
 *
 * Append-only business transaction aggregates (sales, returns, register sessions) in IndexedDB.
 */

import { PharmaFlowDatabase, db as defaultDb } from '../pharmaflowDb';
import { TransactionRecord, SyncStatus } from '../types';

export class TransactionRepository {
  private db: PharmaFlowDatabase;

  constructor(database: PharmaFlowDatabase = defaultDb) {
    this.db = database;
  }

  /**
   * Save a transaction record
   */
  async saveTransaction(transaction: TransactionRecord): Promise<string> {
    const record: TransactionRecord = {
      ...transaction,
      createdAt: transaction.createdAt || new Date().toISOString(),
      updatedAt: transaction.updatedAt || new Date().toISOString(),
    };
    await this.db.transactions.put(record);
    return record.transactionId;
  }

  /**
   * Get transaction by its primary key (transactionId)
   */
  async getTransactionById(transactionId: string): Promise<TransactionRecord | undefined> {
    return this.db.transactions.get(transactionId);
  }

  /**
   * Look up transaction by its mutationId
   */
  async getTransactionByMutationId(mutationId: string): Promise<TransactionRecord | undefined> {
    return this.db.transactions.where('mutationId').equals(mutationId).first();
  }

  /**
   * Get recent completed transactions for a branch, ordered by occurredAt descending
   */
  async getRecentTransactions(
    branchId: string,
    limit = 50,
    organisationId?: string
  ): Promise<TransactionRecord[]> {
    let query;
    if (organisationId) {
      query = this.db.transactions
        .where('[organisationId+branchId]')
        .equals([organisationId, branchId]);
    } else {
      query = this.db.transactions
        .where('branchId')
        .equals(branchId);
    }

    const records = await query.toArray();

    return records
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit);
  }

  /**
   * Get transactions waiting to be synchronized
   */
  async getPendingTransactions(branchId: string, organisationId?: string): Promise<TransactionRecord[]> {
    let query;
    if (organisationId) {
      query = this.db.transactions
        .where('[organisationId+branchId]')
        .equals([organisationId, branchId]);
    } else {
      query = this.db.transactions
        .where('branchId')
        .equals(branchId);
    }

    return query
      .filter((tx) => tx.syncStatus === 'PENDING' || tx.syncStatus === 'FAILED')
      .toArray();
  }

  /**
   * Update sync status of a transaction (e.g. from PENDING to SYNCED or FAILED)
   * Preserves error message and conflict details without deleting the transaction record.
   */
  async updateTransactionSyncStatus(
    transactionId: string,
    syncStatus: SyncStatus,
    errorMessage?: string,
    conflictDetails?: any
  ): Promise<void> {
    const tx = await this.db.transactions.get(transactionId);
    if (!tx) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const updated: TransactionRecord = {
      ...tx,
      syncStatus,
      errorMessage: errorMessage ?? tx.errorMessage,
      conflictDetails: conflictDetails ?? tx.conflictDetails,
      updatedAt: new Date().toISOString(),
    };

    await this.db.transactions.put(updated);
  }

  /**
   * Retrieve all transactions (for testing/diagnostics)
   */
  async getAllTransactions(): Promise<TransactionRecord[]> {
    return this.db.transactions.toArray();
  }
}

export const transactionRepo = new TransactionRepository();

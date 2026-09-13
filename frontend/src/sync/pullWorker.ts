/**
 * Pull Worker
 *
 * Handles incremental pull synchronization from backend to local IndexedDB.
 *
 * CRITICAL RULE:
 * `lastPullCursor` is updated in `sync_metadata` ONLY AFTER all changes
 * returned in the pull response have been successfully applied and committed to IndexedDB.
 * If local application fails, the cursor remains unchanged so no changes are missed.
 */

import { PharmaFlowDatabase, db as defaultDb } from '../db/pharmaflowDb';
import { SyncMetadataRepository } from '../db/repositories/syncMetadataRepository';
import { ProductRepository } from '../db/repositories/productRepository';
import { InventoryRepository } from '../db/repositories/inventoryRepository';
import { CustomerRepository } from '../db/repositories/customerRepository';
import { API_URL } from '../config';
import { PullChangesResponse, ServerChangeItem } from './types';
import { logSyncEvent } from './syncLogger';

export class PullWorker {
  private db: PharmaFlowDatabase;
  private syncMetaRepo: SyncMetadataRepository;
  private productRepo: ProductRepository;
  private inventoryRepo: InventoryRepository;
  private customerRepo: CustomerRepository;
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(database: PharmaFlowDatabase = defaultDb, customBaseUrl?: string) {
    this.db = database;
    this.syncMetaRepo = new SyncMetadataRepository(database);
    this.productRepo = new ProductRepository(database);
    this.inventoryRepo = new InventoryRepository(database);
    this.customerRepo = new CustomerRepository(database);
    this.baseUrl = customBaseUrl || API_URL;
  }

  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  /**
   * Execute an incremental pull cycle
   */
  async pull(
    organisationId = 'ORG-DEFAULT',
    branchId = 'BRANCH-MAIN',
    stream = 'main'
  ): Promise<{ changesApplied: number; cursor: string }> {
    let currentCursor = (await this.syncMetaRepo.getLastPullCursor(stream)) || '0';
    let totalChangesApplied = 0;
    let iteration = 0;
    let hasMore = false;

    logSyncEvent('pull_started', { stream, cursor: currentCursor });

    do {
      iteration++;
      const url = `${this.baseUrl}/api/sync/pull?cursor=${encodeURIComponent(
        currentCursor
      )}&organisationId=${encodeURIComponent(organisationId)}&branchId=${encodeURIComponent(
        branchId
      )}&limit=50`;

      const headers: Record<string, string> = {
        'x-organisation-id': organisationId,
        'x-branch-id': branchId,
      };
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const response = await fetch(url, { method: 'GET', headers });
      if (!response.ok) {
        throw new Error(`Pull request failed with status HTTP ${response.status}`);
      }

      const data: PullChangesResponse = await response.json();
      const changes = data.changes || [];

      if (changes.length > 0) {
        // Apply changes atomically inside IndexedDB
        await this.applyChangesLocally(changes);
        totalChangesApplied += changes.length;
      }

      // ONLY AFTER successful local commit (or 0 changes applied), advance cursor
      currentCursor = data.nextCursor !== undefined ? data.nextCursor : currentCursor;
      await this.syncMetaRepo.setLastPullCursor(currentCursor, stream);
      
      hasMore = Boolean(data.hasMore);

    } while (hasMore && iteration < 10);

    logSyncEvent('pull_completed', {
      stream,
      changesApplied: totalChangesApplied,
      nextCursor: currentCursor,
    });

    return {
      changesApplied: totalChangesApplied,
      cursor: currentCursor,
    };
  }

  /**
   * Apply incoming server change records to IndexedDB
   * CRITICAL: Preserves unsynced local mutations and prevents overwriting pending local records.
   */
  async applyChangesLocally(changes: ServerChangeItem[]): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.products, this.db.inventory, this.db.customers, this.db.transactions, this.db.sync_metadata],
      async () => {
        for (const change of changes) {
          if (!change) continue;
          const itemData = change.payload || change.data;
          const appliedKey =
            change.sequence !== undefined && change.sequence !== null
              ? `applied_change_seq_${change.sequence}`
              : `applied_change_ent_${change.entityType}_${change.entityId}_${change.operation}`;
          const alreadyApplied = await this.db.sync_metadata.get(appliedKey);

          switch (change.entityType) {
            case 'PRODUCT':
              if (change.operation === 'DELETE') {
                await this.db.products.delete(change.entityId);
              } else if (itemData) {
                await this.db.products.put(itemData);
              }
              break;

            case 'INVENTORY':
              if (change.operation === 'DELETE') {
                await this.db.inventory.delete(change.entityId);
              } else if (itemData) {
                await this.db.inventory.put(itemData);
              }
              break;

            case 'CUSTOMER':
              // Do NOT overwrite locally created customers that are still PENDING sync
              const existingCust = await this.db.customers.get(change.entityId);
              if (existingCust && existingCust.isLocallyCreated && existingCust.syncStatus === 'PENDING') {
                // Preserve unsynced local customer mutation
                continue;
              }
              if (change.operation === 'DELETE') {
                await this.db.customers.delete(change.entityId);
              } else if (itemData) {
                await this.db.customers.put({
                  customerId: itemData.customerId || itemData.id || change.entityId,
                  organisationId: itemData.organisationId || itemData.organisation_id || change.organisationId,
                  name: itemData.name || itemData.fullName || itemData.full_name || '',
                  phone: itemData.phone || '',
                  email: itemData.email || undefined,
                  address: itemData.address || undefined,
                  doctorName: itemData.doctorName || itemData.doctor_name || undefined,
                  gstin: itemData.gstin || undefined,
                  category: itemData.category || undefined,
                  isLocallyCreated: false,
                  syncStatus: 'SYNCED',
                  updatedAt: itemData.updatedAt || itemData.updated_at || new Date().toISOString(),
                });
              }
              break;

            case 'INVOICE':
              // If invoice exists locally with PENDING sync status, do not overwrite local draft
              const existingTx = await this.db.transactions.get(change.entityId);
              if (existingTx && existingTx.syncStatus === 'PENDING') {
                continue;
              }

              // Peer Sale Inventory Projection:
              // Decrement local inventory batch projection for sold items idempotently
              if (!alreadyApplied && itemData && Array.isArray(itemData.items)) {
                for (const it of itemData.items) {
                  const branch = itemData.branchId || change.branchId || '';
                  let existingBatch: any = null;
                  if (it.productId && it.batchNumber && branch) {
                    existingBatch = await this.db.inventory
                      .where('[branchId+productId]')
                      .equals([branch, it.productId])
                      .filter((b) => b.batchNumber === it.batchNumber)
                      .first();
                  }
                  if (!existingBatch && it.batchNumber) {
                    existingBatch = await this.db.inventory
                      .where('batchNumber')
                      .equals(it.batchNumber)
                      .filter((b) => !branch || b.branchId === branch)
                      .first();
                  }
                  if (!existingBatch && it.productId) {
                    existingBatch = await this.db.inventory
                      .where('productId')
                      .equals(it.productId)
                      .filter((b) => !branch || b.branchId === branch)
                      .first();
                  }

                  if (existingBatch) {
                    const qty = Number(it.quantity || it.qty || 1);
                    await this.db.inventory.put({
                      ...existingBatch,
                      availableQuantity: Math.max(0, existingBatch.availableQuantity - qty),
                      updatedAt: new Date().toISOString(),
                    });
                  }
                }
              }
              break;

            case 'PAYMENT':
              if (!alreadyApplied && itemData && itemData.customerId) {
                const existingCustPay = await this.db.customers.get(itemData.customerId);
                if (existingCustPay && existingCustPay.syncStatus !== 'PENDING') {
                  const payAmount = Number(itemData.amount || 0);
                  const curBal = Number(existingCustPay.outstandingBalance || 0);
                  await this.db.customers.put({
                    ...existingCustPay,
                    outstandingBalance: curBal - payAmount,
                    updatedAt: new Date().toISOString(),
                  });
                }
              }
              break;

            case 'RETURN':
              if (!alreadyApplied) {
                // Reconcile customer ledger balance
                if (itemData && itemData.customerId) {
                  const existingCustRet = await this.db.customers.get(itemData.customerId);
                  if (existingCustRet && existingCustRet.syncStatus !== 'PENDING') {
                    const refundAmount = Number(itemData.refundAmount || 0);
                    const curBal = Number(existingCustRet.outstandingBalance || 0);
                    await this.db.customers.put({
                      ...existingCustRet,
                      outstandingBalance: curBal - refundAmount,
                      updatedAt: new Date().toISOString(),
                    });
                  }
                }

                // Peer Return Inventory Projection:
                // Restock local inventory batches for returned items
                if (itemData && Array.isArray(itemData.items)) {
                  for (const it of itemData.items) {
                    const restockQty = Number(it.restockQuantity !== undefined ? it.restockQuantity : (it.quantityReturned || 0));
                    if (restockQty > 0) {
                      const branch = itemData.branchId || change.branchId || '';
                      let existingBatch: any = null;
                      if (it.productId && it.batchNumber && branch) {
                        existingBatch = await this.db.inventory
                          .where('[branchId+productId]')
                          .equals([branch, it.productId])
                          .filter((b) => b.batchNumber === it.batchNumber)
                          .first();
                      }
                      if (!existingBatch && it.batchNumber) {
                        existingBatch = await this.db.inventory
                          .where('batchNumber')
                          .equals(it.batchNumber)
                          .filter((b) => !branch || b.branchId === branch)
                          .first();
                      }
                      if (!existingBatch && it.productId) {
                        existingBatch = await this.db.inventory
                          .where('productId')
                          .equals(it.productId)
                          .filter((b) => !branch || b.branchId === branch)
                          .first();
                      }

                      if (existingBatch) {
                        await this.db.inventory.put({
                          ...existingBatch,
                          availableQuantity: existingBatch.availableQuantity + restockQty,
                          updatedAt: new Date().toISOString(),
                        });
                      }
                    }
                  }
                }
              }
              break;

            case 'PURCHASE':
              if (!alreadyApplied && itemData && Array.isArray(itemData.items)) {
                for (const it of itemData.items) {
                  if (it.productId && it.batchNumber) {
                    const branch = itemData.branchId || change.branchId || '';
                    const existingBatch = await this.db.inventory
                      .where('[branchId+productId]')
                      .equals([branch, it.productId])
                      .filter((b) => b.batchNumber === it.batchNumber)
                      .first();
                    if (existingBatch) {
                      await this.db.inventory.put({
                        ...existingBatch,
                        availableQuantity: existingBatch.availableQuantity + Number(it.quantity || 0),
                        updatedAt: new Date().toISOString(),
                      });
                    }
                  }
                }
              }
              break;

            case 'EXPENSE':
              break;

            default:
              break;
          }

          // Durably record change application key to guarantee projection idempotency
          await this.db.sync_metadata.put({
            key: appliedKey,
            value: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    );
  }
}

export const pullWorker = new PullWorker();

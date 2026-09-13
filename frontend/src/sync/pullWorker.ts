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
      [
        this.db.products,
        this.db.inventory,
        this.db.customers,
        this.db.transactions,
        this.db.sync_metadata,
        this.db.cash_registers,
        this.db.register_sessions,
        this.db.cash_movements,
      ],
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
                    const org = itemData.organisationId || change.organisationId || '';
                    const existingBatch = await this.db.inventory
                      .where('[branchId+productId]')
                      .equals([branch, it.productId])
                      .filter((b) => b.batchNumber === it.batchNumber)
                      .first();
                    const qty = Number(it.quantity || 0);
                    if (existingBatch) {
                      await this.db.inventory.put({
                        ...existingBatch,
                        availableQuantity: existingBatch.availableQuantity + qty,
                        updatedAt: new Date().toISOString(),
                      });
                    } else {
                      const costPrice = Number(it.unitCost || it.costPrice || 0);
                      const mrp = Number(it.mrp || (costPrice ? costPrice * 1.3 : 100));
                      const sellingPrice = Number(it.sellingPrice || mrp);
                      await this.db.inventory.put({
                        id: `${branch}_${it.batchNumber}_${it.productId}`,
                        organisationId: org,
                        branchId: branch,
                        productId: it.productId,
                        batchNumber: it.batchNumber,
                        expiryDate: it.expiryDate || '2028-12-31',
                        availableQuantity: qty,
                        costPrice,
                        mrp,
                        sellingPrice,
                        updatedAt: new Date().toISOString(),
                      });
                    }
                  }
                }
              }
              break;

            case 'EXPENSE':
              break;

            case 'ADJUSTMENT':
              if (!alreadyApplied && itemData) {
                // Avoid double-applying on originating device that already applied locally
                const localTx = await this.db.transactions.get(itemData.adjustmentId || change.entityId);
                if (!localTx) {
                  const branch = itemData.branchId || change.branchId || '';
                  let existingBatch: any = null;
                  if (itemData.productId && itemData.batchNumber && branch) {
                    existingBatch = await this.db.inventory
                      .where('[branchId+productId]')
                      .equals([branch, itemData.productId])
                      .filter((b) => b.batchNumber === itemData.batchNumber)
                      .first();
                  }
                  if (!existingBatch && itemData.batchNumber) {
                    existingBatch = await this.db.inventory
                      .where('batchNumber')
                      .equals(itemData.batchNumber)
                      .filter((b) => !branch || b.branchId === branch)
                      .first();
                  }

                  if (existingBatch) {
                    const delta = Number(itemData.deltaQuantity || 0);
                    const newQty = Math.max(0, existingBatch.availableQuantity + delta);
                    await this.db.inventory.put({
                      ...existingBatch,
                      availableQuantity: newQty,
                      updatedAt: new Date().toISOString(),
                    });
                  }
                }
              }
              break;

            case 'TRANSFER':
              if (!alreadyApplied && itemData) {
                const localTx = await this.db.transactions.get(itemData.transferId || change.entityId);

                // Source branch peer: decrement stock if this device wasn't the origin
                if (!localTx && itemData.fromBranchId && Array.isArray(itemData.items)) {
                  for (const it of itemData.items) {
                    if (it.productId && it.batchNumber) {
                      const sourceBatch = await this.db.inventory
                        .where('[branchId+productId]')
                        .equals([itemData.fromBranchId, it.productId])
                        .filter((b) => b.batchNumber === it.batchNumber)
                        .first();
                      if (sourceBatch) {
                        const qty = Number(it.quantity || 0);
                        await this.db.inventory.put({
                          ...sourceBatch,
                          availableQuantity: Math.max(0, sourceBatch.availableQuantity - qty),
                          updatedAt: new Date().toISOString(),
                        });
                      }
                    }
                  }
                }

                // Destination branch peer: restock/create batch when transfer is completed or received
                if (
                  (itemData.status === 'COMPLETED' || itemData.status === 'RECEIVED') &&
                  itemData.toBranchId &&
                  Array.isArray(itemData.items)
                ) {
                  for (const it of itemData.items) {
                    if (it.productId && it.batchNumber) {
                      const destBatch = await this.db.inventory
                        .where('[branchId+productId]')
                        .equals([itemData.toBranchId, it.productId])
                        .filter((b) => b.batchNumber === it.batchNumber)
                        .first();
                      const qty = Number(it.quantity || 0);
                      if (destBatch) {
                        await this.db.inventory.put({
                          ...destBatch,
                          availableQuantity: destBatch.availableQuantity + qty,
                          updatedAt: new Date().toISOString(),
                        });
                      } else {
                        await this.db.inventory.put({
                          id: `${itemData.toBranchId}_${it.batchNumber}_${it.productId}`,
                          organisationId: itemData.organisationId || change.organisationId || '',
                          branchId: itemData.toBranchId,
                          productId: it.productId,
                          batchNumber: it.batchNumber,
                          expiryDate: it.expiryDate || '2028-12-31',
                          availableQuantity: qty,
                          costPrice: Number(it.costPrice || 100),
                          mrp: Number(it.mrp || 130),
                          sellingPrice: Number(it.mrp || 130),
                          updatedAt: new Date().toISOString(),
                        });
                      }
                    }
                  }
                }
              }
              break;

            case 'REGISTER':
            case 'CASH_REGISTER':
              if (itemData) {
                const regId = itemData.id || change.entityId;
                await this.db.cash_registers.put({
                  id: regId,
                  organisationId: itemData.organisationId || itemData.organisation_id || change.organisationId,
                  branchId: itemData.branchId || itemData.branch_id || change.branchId,
                  name: itemData.name || 'Main Register',
                  identifier: itemData.identifier || itemData.registerNumber || itemData.register_number || 'POS-01',
                  isActive:
                    itemData.isActive !== undefined
                      ? itemData.isActive
                      : itemData.is_active !== undefined
                      ? itemData.is_active
                      : true,
                  createdAt: itemData.createdAt || itemData.created_at || new Date().toISOString(),
                  updatedAt: itemData.updatedAt || itemData.updated_at || new Date().toISOString(),
                });
              }
              break;

            case 'REGISTER_SESSION':
              if (itemData) {
                const sessionId = itemData.id || itemData.sessionId || change.entityId;
                const existing = await this.db.register_sessions.get(sessionId);
                const incomingStatus = itemData.status || (change.operation === 'DELETE' ? 'CLOSED' : 'OPEN');
                // If local session is PENDING close or open, only overwrite if incoming is authoritative CLOSED or matches
                if (existing && existing.syncStatus === 'PENDING' && incomingStatus !== 'CLOSED') {
                  break;
                }
                await this.db.register_sessions.put({
                  id: sessionId,
                  organisationId: itemData.organisationId || itemData.organisation_id || change.organisationId,
                  branchId: itemData.branchId || itemData.branch_id || change.branchId,
                  cashRegisterId: itemData.cashRegisterId || itemData.cash_register_id || itemData.registerId || 'REG-1',
                  cashierId: itemData.cashierId || itemData.cashier_id || itemData.openedByUserId || '',
                  sessionNumber: itemData.sessionNumber || itemData.session_number || `REG-${sessionId.slice(0, 6)}`,
                  shiftName: itemData.shiftName || itemData.shift_name || 'Day Shift',
                  openingBalance: Number(itemData.openingBalance ?? itemData.opening_balance ?? itemData.openingCashBalance ?? 0),
                  expectedCash:
                    itemData.expectedCash !== undefined || itemData.expected_cash !== undefined
                      ? Number(itemData.expectedCash ?? itemData.expected_cash)
                      : undefined,
                  countedCash:
                    itemData.countedCash !== undefined || itemData.counted_cash !== undefined
                      ? Number(itemData.countedCash ?? itemData.counted_cash)
                      : undefined,
                  variance:
                    itemData.variance !== undefined
                      ? Number(itemData.variance)
                      : undefined,
                  status: incomingStatus as any,
                  varianceStatus: itemData.varianceStatus || itemData.variance_status || undefined,
                  openingNotes: itemData.openingNotes || itemData.opening_notes || itemData.notes || undefined,
                  closingNotes: itemData.closingNotes || itemData.closing_notes || undefined,
                  openedAt: itemData.openedAt || itemData.opened_at || new Date().toISOString(),
                  closedAt: itemData.closedAt || itemData.closed_at || undefined,
                  syncStatus: 'SYNCED',
                  updatedAt: itemData.updatedAt || itemData.updated_at || new Date().toISOString(),
                });
              }
              break;

            case 'CASH_MOVEMENT':
              if (itemData) {
                const movementId = itemData.id || itemData.movementId || change.entityId;
                const existingMov = await this.db.cash_movements.get(movementId);
                if (existingMov && existingMov.syncStatus === 'PENDING') {
                  break;
                }
                await this.db.cash_movements.put({
                  id: movementId,
                  organisationId: itemData.organisationId || itemData.organisation_id || change.organisationId,
                  branchId: itemData.branchId || itemData.branch_id || change.branchId,
                  cashRegisterSessionId: itemData.cashRegisterSessionId || itemData.cash_register_session_id || itemData.sessionId || '',
                  cashierId: itemData.cashierId || itemData.cashier_id || itemData.performedByUserId || '',
                  movementNumber: itemData.movementNumber || itemData.movement_number || `PC-${movementId.slice(0, 6)}`,
                  movementType: (itemData.movementType || itemData.movement_type || 'IN').toUpperCase() as any,
                  amount: Number(itemData.amount || 0),
                  reason: itemData.reason || '',
                  occurredAt: itemData.occurredAt || itemData.occurred_at || itemData.createdAt || itemData.created_at || new Date().toISOString(),
                  syncStatus: 'SYNCED',
                  updatedAt: itemData.updatedAt || itemData.updated_at || new Date().toISOString(),
                });
              }
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

/**
 * Frontend Sync Engine
 *
 * Coordinates durable, resilient, offline-first synchronization between local
 * IndexedDB and the cloud backend.
 *
 * Core principles:
 * - "PUSH WHAT HAPPENED. PULL WHAT IS NOW TRUE."
 * - Single-flight / mutex: concurrent sync triggers share the same active loop.
 * - Idempotency: mutationId is never regenerated during retries.
 * - Independent mutation processing: one failure does not block unrelated mutations.
 * - Multi-tenant isolation: organisationId and branchId are strictly preserved.
 */

import { PharmaFlowDatabase, db as defaultDb } from '../db/pharmaflowDb';
import { OutboxRepository } from '../db/repositories/outboxRepository';
import { TransactionRepository } from '../db/repositories/transactionRepository';
import { SyncMetadataRepository } from '../db/repositories/syncMetadataRepository';
import { API_URL } from '../config';
import {
  SyncEngineState,
  SyncStateListener,
  PushBatchRequest,
  PushBatchResponse,
  OutboxMutationPayload,
} from './types';
import { classifySyncError, calculateBackoff } from './errorClassification';
import { logSyncEvent } from './syncLogger';
import { ConnectivityService, connectivityService as defaultConnService } from './connectivityService';
import { PullWorker, pullWorker as defaultPullWorker } from './pullWorker';

const DEFAULT_BATCH_SIZE = 25;

export class SyncEngine {
  private db: PharmaFlowDatabase;
  private outboxRepo: OutboxRepository;
  private txRepo: TransactionRepository;
  private syncMetaRepo: SyncMetadataRepository;
  private connService: ConnectivityService;
  private pullWorker: PullWorker;
  private baseUrl: string;

  private isSyncing = false;
  private activeSyncPromise: Promise<void> | null = null;
  private stateListeners: Set<SyncStateListener> = new Set();
  private authToken: string | null = null;
  private activeOrganisationId: string | null = null;
  private activeBranchId: string | null = null;
  private started = false;

  private state: SyncEngineState = {
    status: 'IDLE',
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    lastSuccessfulSyncAt: null,
    lastError: null,
  };

  constructor(
    database: PharmaFlowDatabase = defaultDb,
    customConnService?: ConnectivityService,
    customPullWorker?: PullWorker,
    customBaseUrl?: string
  ) {
    this.db = database;
    this.outboxRepo = new OutboxRepository(database);
    this.txRepo = new TransactionRepository(database);
    this.syncMetaRepo = new SyncMetadataRepository(database);
    this.connService = customConnService || defaultConnService;
    this.pullWorker = customPullWorker || defaultPullWorker;
    this.baseUrl = customBaseUrl || API_URL;

    // Listen to network status transitions
    this.connService.onConnectivityChange((isOnline) => {
      const prevOnline = this.state.isOnline;
      this.updateState({
        isOnline,
        status: isOnline ? (this.isSyncing ? 'SYNCING' : 'ONLINE') : 'OFFLINE',
      });

      // If transitioning from offline to online, trigger automatic sync
      if (!prevOnline && isOnline && this.started) {
        this.sync().catch(() => {});
      }
    });
  }

  /**
   * Set or update authentication token for sync requests
   */
  setAuthToken(token: string | null): void {
    this.authToken = token;
    this.pullWorker.setAuthToken(token);
  }

  /**
   * Set or update active tenant / branch context
   */
  setTenantContext(organisationId: string | null, branchId: string | null = null): void {
    this.activeOrganisationId = organisationId;
    this.activeBranchId = branchId;
    this.refreshCounts().catch(() => {});
  }

  /**
   * Start the Sync Engine
   * Restores metadata, monitors connectivity, and syncs on launch
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // 1. Restore last successful sync timestamp
    const lastSync = await this.syncMetaRepo.getLastSuccessfulSyncAt();
    await this.refreshCounts();
    this.updateState({
      lastSuccessfulSyncAt: lastSync,
      isOnline: this.connService.getIsOnline(),
    });

    // 2. Start heartbeat connectivity monitoring
    this.connService.startMonitoring();

    // 3. Initial sync pass if online
    if (this.connService.getIsOnline()) {
      this.sync().catch((err) => {
        logSyncEvent('sync_failed', { errorMessage: err.message });
      });
    }
  }

  /**
   * Stop the Sync Engine
   */
  stop(): void {
    this.started = false;
    this.connService.destroy();
  }

  /**
   * Manual Sync Now trigger
   * @param resetRetries If true, resets nextRetryAt for retryable items
   */
  async syncNow(resetRetries = false): Promise<void> {
    if (resetRetries) {
      await this.resetRetryTimers();
    }
    return this.sync();
  }

  /**
   * Reset retry schedules so retryable failed mutations become immediately eligible
   */
  private async resetRetryTimers(): Promise<void> {
    const all = await this.outboxRepo.getAllOutbox();
    const now = new Date().toISOString();
    for (const item of all) {
      if (item.status === 'FAILED_RETRYABLE' && item.sequence) {
        await this.db.sync_outbox.update(item.sequence, {
          nextRetryAt: now,
          updatedAt: now,
        });
      }
    }
    await this.refreshCounts();
  }

  /**
   * Primary Synchronization Cycle (Single-flight Mutex)
   */
  async sync(): Promise<void> {
    // If sync is already running, return the active sync promise
    if (this.isSyncing && this.activeSyncPromise) {
      return this.activeSyncPromise;
    }

    this.isSyncing = true;
    this.updateState({ isSyncing: true, status: 'SYNCING' });

    this.activeSyncPromise = this.runSyncLoop()
      .finally(() => {
        this.isSyncing = false;
        this.activeSyncPromise = null;
        this.updateState({
          isSyncing: false,
          status: this.connService.getIsOnline() ? 'ONLINE' : 'OFFLINE',
        });
      });

    return this.activeSyncPromise;
  }

  /**
   * Internal sync processing loop
   * Exhausts eligible mutations in FIFO sequence order batches
   */
  private async runSyncLoop(): Promise<void> {
    logSyncEvent('sync_started');

    // Check connectivity first
    const isOnline = await this.connService.checkConnectivityNow();
    if (!isOnline) {
      logSyncEvent('sync_failed', { errorMessage: 'Cannot sync while offline' });
      await this.refreshCounts();
      return;
    }

    const deviceId = await this.syncMetaRepo.getDeviceId();
    let hasMore = true;

    while (hasMore) {
      // 1. Peek next batch of eligible mutations in sequence order (scoped to active organisation if set)
      const eligibleBatch = await this.outboxRepo.peekPendingMutations(
        DEFAULT_BATCH_SIZE,
        this.activeOrganisationId || undefined
      );
      if (!eligibleBatch || eligibleBatch.length === 0) {
        hasMore = false;
        break;
      }

      logSyncEvent('sync_batch_started', {
        batchSize: eligibleBatch.length,
        firstSequence: eligibleBatch[0].sequence,
      });

      // 2. Mark in-flight
      for (const item of eligibleBatch) {
        if (item.sequence) {
          await this.outboxRepo.markInFlight(item.sequence);
        }
        const txId = item.payload?.clientTransactionId || item.payload?.transactionId;
        if (txId) {
          await this.txRepo.updateTransactionSyncStatus(txId, 'SYNCING').catch(() => {});
        }
      }

      // 3. Dispatch batch to backend
      const pushPayload: PushBatchRequest = {
        deviceId,
        mutations: eligibleBatch.map((item) => ({
          sequence: item.sequence!,
          mutationId: item.mutationId,
          mutationType: item.mutationType,
          organisationId: item.organisationId,
          branchId: item.branchId,
          userId: item.userId,
          deviceId: item.deviceId,
          occurredAt: item.createdAt,
          payload: item.payload,
        })),
      };

      let response: PushBatchResponse | null = null;
      let transportError: any = null;

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (this.authToken) {
          headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        if (this.activeOrganisationId) {
          headers['x-organisation-id'] = this.activeOrganisationId;
        }
        if (this.activeBranchId) {
          headers['x-branch-id'] = this.activeBranchId;
        }

        const res = await fetch(`${this.baseUrl}/api/sync/push`, {
          method: 'POST',
          headers,
          body: JSON.stringify(pushPayload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw {
            status: res.status,
            message: errData.error || `HTTP ${res.status} error`,
          };
        }

        response = await res.json();
      } catch (err: any) {
        transportError = err;
      }

      // 4. Handle Transport Failure (Entire Batch failed to reach server)
      if (transportError || !response) {
        const classified = classifySyncError(transportError, transportError?.status);
        logSyncEvent('sync_failed', {
          errorCode: classified.code,
          errorMessage: classified.message,
        });

        for (const item of eligibleBatch) {
          if (item.sequence) {
            const delay = calculateBackoff((item.attemptCount || 0) + 1);
            await this.outboxRepo.markFailed(
              item.sequence,
              classified.message,
              classified.isRetryable,
              delay
            );
            logSyncEvent('mutation_retry_scheduled', {
              mutationId: item.mutationId,
              attemptCount: (item.attemptCount || 0) + 1,
            });
          }
          const txId = item.payload?.clientTransactionId || item.payload?.transactionId;
          if (txId) {
            await this.txRepo.updateTransactionSyncStatus(txId, 'PENDING', classified.message).catch(() => {});
          }
        }

        this.updateState({
          lastError: classified.message,
          status: classified.category === 'AUTHENTICATION' ? 'ERROR' : 'OFFLINE',
        });
        await this.refreshCounts();
        break; // Stop loop on transport failure
      }

      // 5. Handle Individual Mutation Results
      const resultMap = new Map(response.results.map((r) => [r.mutationId, r]));

      for (const item of eligibleBatch) {
        const result = resultMap.get(item.mutationId);
        const txId = item.payload?.clientTransactionId || item.payload?.transactionId;

        if (!result) {
          // Unacknowledged mutation: treat as retryable
          if (item.sequence) {
            const delay = calculateBackoff((item.attemptCount || 0) + 1);
            await this.outboxRepo.markFailed(
              item.sequence,
              'Server omitted result for this mutation in push response',
              true,
              delay
            );
          }
          if (txId) {
            await this.txRepo.updateTransactionSyncStatus(txId, 'PENDING').catch(() => {});
          }
          continue;
        }

        const custId = item.payload?.customerId || item.payload?.id;

        if (result.status === 'SUCCESS') {
          // Success: Mark completed & synced
          if (item.sequence) {
            await this.outboxRepo.markCompleted(item.sequence);
          }
          if (txId) {
            await this.txRepo.updateTransactionSyncStatus(txId, 'SYNCED');
          }
          if (item.mutationType === 'CREATE_CUSTOMER' && custId) {
            const cust = await this.db.customers.get(custId);
            if (cust) {
              await this.db.customers.put({
                ...cust,
                isLocallyCreated: false,
                syncStatus: 'SYNCED',
                updatedAt: new Date().toISOString(),
              });
            }
          }
          logSyncEvent('mutation_succeeded', {
            mutationId: item.mutationId,
            idempotentReplay: result.idempotentReplay,
          });
        } else if (result.status === 'CONFLICT') {
          // Business conflict: Do not delete! Preserve diagnostics
          if (item.sequence) {
            await this.outboxRepo.markConflict(item.sequence, result.error?.conflictDetails);
          }
          if (txId) {
            await this.txRepo.updateTransactionSyncStatus(
              txId,
              'CONFLICT',
              result.error?.message,
              result.error?.conflictDetails
            );
          }
          if (item.mutationType === 'CREATE_CUSTOMER' && custId) {
            const cust = await this.db.customers.get(custId);
            if (cust) {
              await this.db.customers.put({
                ...cust,
                syncStatus: 'CONFLICT',
                updatedAt: new Date().toISOString(),
              });
            }
          }
          logSyncEvent('mutation_conflict', {
            mutationId: item.mutationId,
            errorMessage: result.error?.message,
          });
        } else if (result.status === 'FAILED') {
          // Permanent failure: Do not retry automatically
          if (item.sequence) {
            await this.outboxRepo.markFailed(item.sequence, result.error?.message || 'Permanent failure', false);
          }
          if (txId) {
            await this.txRepo.updateTransactionSyncStatus(txId, 'FAILED', result.error?.message);
          }
          if (item.mutationType === 'CREATE_CUSTOMER' && custId) {
            const cust = await this.db.customers.get(custId);
            if (cust) {
              await this.db.customers.put({
                ...cust,
                syncStatus: 'FAILED',
                updatedAt: new Date().toISOString(),
              });
            }
          }
          logSyncEvent('mutation_failed', {
            mutationId: item.mutationId,
            errorMessage: result.error?.message,
          });
        } else {
          // Retryable error
          if (item.sequence) {
            const delay = calculateBackoff((item.attemptCount || 0) + 1);
            await this.outboxRepo.markFailed(
              item.sequence,
              result.error?.message || 'Server requested retry',
              true,
              delay
            );
            logSyncEvent('mutation_retry_scheduled', {
              mutationId: item.mutationId,
              attemptCount: (item.attemptCount || 0) + 1,
            });
          }
          if (txId) {
            await this.txRepo.updateTransactionSyncStatus(txId, 'PENDING', result.error?.message);
          }
        }
      }

      // Record successful push timestamp
      const now = new Date().toISOString();
      await this.syncMetaRepo.setLastSuccessfulSyncAt(now);
      this.updateState({ lastSuccessfulSyncAt: now, lastError: null });

      await this.refreshCounts();
    }

    logSyncEvent('sync_completed');
  }

  /**
   * Refresh counts from IndexedDB (scoped to active organisation if set)
   */
  async refreshCounts(): Promise<void> {
    const counts = await this.outboxRepo.getOutboxCounts(this.activeOrganisationId || undefined);
    const allOutbox = await this.outboxRepo.getAllOutbox();
    const filteredOutbox = this.activeOrganisationId
      ? allOutbox.filter((i) => i.organisationId === this.activeOrganisationId)
      : allOutbox;
    const conflictCount = filteredOutbox.filter((i) => i.status === 'CONFLICT').length;

    this.updateState({
      pendingCount: counts.pending,
      failedCount: counts.failed,
      conflictCount,
    });
  }

  private updateState(partial: Partial<SyncEngineState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
    this.stateListeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (e) {
        console.error('[SyncEngine] State listener error:', e);
      }
    });
  }

  getState(): SyncEngineState {
    return { ...this.state };
  }

  subscribe(listener: SyncStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => {
      this.stateListeners.delete(listener);
    };
  }
}

export const syncEngine = new SyncEngine();


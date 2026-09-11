/**
 * Outbox Repository
 *
 * Durable FIFO mutation queue for outbound mutations to be pushed to the cloud.
 */

import { PharmaFlowDatabase, db as defaultDb } from '../pharmaflowDb';
import { SyncOutboxRecord } from '../types';

export class OutboxRepository {
  private db: PharmaFlowDatabase;

  constructor(database: PharmaFlowDatabase = defaultDb) {
    this.db = database;
  }

  /**
   * Enqueue a new mutation into the outbox
   */
  async enqueueMutation(
    mutation: Omit<SyncOutboxRecord, 'sequence' | 'status' | 'attemptCount' | 'createdAt' | 'updatedAt'>
  ): Promise<number> {
    const now = new Date().toISOString();
    const record: SyncOutboxRecord = {
      ...mutation,
      status: 'PENDING',
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    return this.db.sync_outbox.add(record);
  }

  /**
   * Peek next pending mutations in FIFO order (by auto-increment sequence)
   * Filters out mutations scheduled for future retry and strictly isolates by organisationId.
   */
  async peekPendingMutations(limit = 10, organisationId?: string): Promise<SyncOutboxRecord[]> {
    const now = new Date().toISOString();
    return this.db.sync_outbox
      .orderBy('sequence')
      .filter((m) => {
        if (organisationId && m.organisationId !== organisationId) {
          return false;
        }
        if (m.status === 'PENDING') return true;
        if (m.status === 'FAILED_RETRYABLE') {
          return !m.nextRetryAt || m.nextRetryAt <= now;
        }
        return false;
      })
      .limit(limit)
      .toArray();
  }

  /**
   * Mark a mutation as currently in-flight
   */
  async markInFlight(sequence: number): Promise<void> {
    const item = await this.db.sync_outbox.get(sequence);
    if (!item) return;

    await this.db.sync_outbox.update(sequence, {
      status: 'IN_FLIGHT',
      lastAttemptAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Mark a mutation as successfully pushed to cloud
   */
  async markCompleted(sequence: number): Promise<void> {
    const item = await this.db.sync_outbox.get(sequence);
    if (!item) return;

    await this.db.sync_outbox.update(sequence, {
      status: 'COMPLETED',
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Mark a mutation as failed with error details and exponential backoff
   */
  async markFailed(
    sequence: number,
    errorMessage: string,
    isRetryable = true,
    customRetryDelayMs?: number
  ): Promise<void> {
    const item = await this.db.sync_outbox.get(sequence);
    if (!item) return;

    const newAttemptCount = (item.attemptCount || 0) + 1;
    const now = new Date();

    // Exponential backoff: base 2s * 2^(attempts-1) up to max 5 minutes (300,000 ms)
    const delayMs = customRetryDelayMs ?? Math.min(2000 * Math.pow(2, newAttemptCount - 1), 300000);
    const nextRetryAt = new Date(now.getTime() + delayMs).toISOString();

    await this.db.sync_outbox.update(sequence, {
      status: isRetryable ? 'FAILED_RETRYABLE' : 'FAILED_FATAL',
      attemptCount: newAttemptCount,
      lastAttemptAt: now.toISOString(),
      nextRetryAt: isRetryable ? nextRetryAt : undefined,
      errorMessage,
      updatedAt: now.toISOString(),
    });
  }

  /**
   * Mark a mutation as conflicted
   */
  async markConflict(sequence: number, conflictDetails: any): Promise<void> {
    const item = await this.db.sync_outbox.get(sequence);
    if (!item) return;

    await this.db.sync_outbox.update(sequence, {
      status: 'CONFLICT',
      conflictDetails,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Count outbox items by status, optionally filtered by organisationId
   */
  async getOutboxCounts(organisationId?: string): Promise<{ total: number; pending: number; failed: number; completed: number }> {
    let all = await this.db.sync_outbox.toArray();
    if (organisationId) {
      all = all.filter((i) => i.organisationId === organisationId);
    }
    return {
      total: all.length,
      pending: all.filter((i) => i.status === 'PENDING' || i.status === 'FAILED_RETRYABLE').length,
      failed: all.filter((i) => i.status === 'FAILED_FATAL' || i.status === 'CONFLICT').length,
      completed: all.filter((i) => i.status === 'COMPLETED').length,
    };
  }

  /**
   * Get all outbox records (for tests / inspection)
   */
  async getAllOutbox(): Promise<SyncOutboxRecord[]> {
    return this.db.sync_outbox.orderBy('sequence').toArray();
  }
}

export const outboxRepo = new OutboxRepository();


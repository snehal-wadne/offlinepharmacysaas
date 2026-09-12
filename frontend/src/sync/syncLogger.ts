/**
 * Structured Sync Logger
 *
 * Emits observable, structured events during synchronization cycles.
 * Never logs sensitive patient credentials or raw payment tokens.
 */

export type SyncLogEvent =
  | 'sync_started'
  | 'sync_batch_started'
  | 'mutation_sent'
  | 'mutation_succeeded'
  | 'mutation_failed'
  | 'mutation_conflict'
  | 'mutation_retry_scheduled'
  | 'sync_completed'
  | 'sync_failed'
  | 'pull_started'
  | 'pull_completed';

export interface SyncLogData {
  mutationId?: string;
  mutationType?: string;
  sequence?: number;
  deviceId?: string;
  attemptCount?: number;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
  batchSize?: number;
  [key: string]: any;
}

export function logSyncEvent(event: SyncLogEvent, data: SyncLogData = {}): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    ...data,
  };

  // Structured console output with event tag
  if (event.includes('failed') || event.includes('conflict')) {
    console.warn(`[SyncEngine:${event}]`, JSON.stringify(logEntry));
  } else {
    console.log(`[SyncEngine:${event}]`, JSON.stringify(logEntry));
  }
}


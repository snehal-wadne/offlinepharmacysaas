/**
 * Sync Engine Types and Interfaces
 *
 * Core domain types for offline-first push/pull synchronization between
 * IndexedDB and backend PostgreSQL.
 */

import { MutationType, SyncStatus, OutboxStatus } from '../db/types';

export type SyncStatusState = 'IDLE' | 'SYNCING' | 'ONLINE' | 'OFFLINE' | 'ERROR';

export type ErrorCategory =
  | 'RETRYABLE_NETWORK'
  | 'RETRYABLE_SERVER'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'VALIDATION'
  | 'BUSINESS_CONFLICT'
  | 'UNKNOWN';

export interface SyncEngineState {
  status: SyncStatusState;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
}

export type SyncStateListener = (state: SyncEngineState) => void;

export interface OutboxMutationPayload {
  sequence: number;
  mutationId: string;
  mutationType: MutationType;
  organisationId: string;
  branchId: string;
  userId: string;
  deviceId: string;
  occurredAt: string;
  payload: any;
}

export interface PushBatchRequest {
  deviceId: string;
  mutations: OutboxMutationPayload[];
}

export type ServerMutationStatus = 'SUCCESS' | 'CONFLICT' | 'FAILED' | 'RETRYABLE_ERROR';

export interface IndividualMutationResult {
  mutationId: string;
  status: ServerMutationStatus;
  result?: any;
  error?: {
    code: string;
    message: string;
    conflictDetails?: any;
  };
  idempotentReplay?: boolean;
}

export interface PushBatchResponse {
  success: boolean;
  deviceId: string;
  processedCount: number;
  results: IndividualMutationResult[];
  serverTime: string;
}

export interface ClassifiedError {
  category: ErrorCategory;
  isRetryable: boolean;
  message: string;
  code?: string;
  suggestedDelayMs: number;
}

export interface ServerChangeItem {
  sequence: string | number;
  organisationId: string;
  branchId?: string;
  entityType: 'PRODUCT' | 'CUSTOMER' | 'INVENTORY' | 'INVOICE' | 'PAYMENT' | 'RETURN' | 'PURCHASE' | 'EXPENSE' | 'ADJUSTMENT' | 'TRANSFER';
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  changedAt: string;
  payload?: any;
  data?: any;
}

export interface PullChangesResponse {
  success: boolean;
  cursor: string;
  nextCursor: string;
  changes: ServerChangeItem[];
  hasMore: boolean;
  serverTime: string;
}


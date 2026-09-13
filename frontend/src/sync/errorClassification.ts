/**
 * Sync Error Classification & Exponential Backoff Utilities
 */

import { ClassifiedError, ErrorCategory } from './types';

const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 300000; // 5 minutes

/**
 * Calculates exponential backoff with conservative jitter.
 * Formula: min(maxMs, baseMs * 2^(attempts - 1)) + jitter (0 - 500ms)
 */
export function calculateBackoff(
  attemptCount: number,
  baseMs = BASE_RETRY_DELAY_MS,
  maxMs = MAX_RETRY_DELAY_MS
): number {
  const attempts = Math.max(1, attemptCount);
  const exponentialDelay = baseMs * Math.pow(2, attempts - 1);
  const cappedDelay = Math.min(maxMs, exponentialDelay);
  const jitter = Math.floor(Math.random() * 500);
  return cappedDelay + jitter;
}

/**
 * Classifies an error into a structured category with retry instructions
 */
export function classifySyncError(error: any, httpStatus?: number): ClassifiedError {
  const message = error?.message || (typeof error === 'string' ? error : 'Unknown sync error');
  const code = error?.code || error?.status || (httpStatus ? `HTTP_${httpStatus}` : 'UNKNOWN_ERROR');

  // 1. Network / Connection Failures
  if (
    message.includes('Network request failed') ||
    message.includes('Failed to fetch') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT') ||
    message.includes('timeout') ||
    message.includes('AbortError') ||
    code === 'NETWORK_ERROR'
  ) {
    return {
      category: 'RETRYABLE_NETWORK',
      isRetryable: true,
      message: 'Network connectivity failure. Mutation will retry when online.',
      code: 'NETWORK_TIMEOUT',
      suggestedDelayMs: calculateBackoff(1),
    };
  }

  // 2. HTTP Status Code Mapping
  if (httpStatus) {
    if (httpStatus === 401) {
      return {
        category: 'AUTHENTICATION',
        isRetryable: false,
        message: 'Authentication required or session expired. Please log in again.',
        code: 'AUTH_REQUIRED',
        suggestedDelayMs: 0,
      };
    }

    if (httpStatus === 404) {
      return {
        category: 'FATAL',
        isRetryable: false,
        message: 'Resource not found on server.',
        code: 'NOT_FOUND',
        suggestedDelayMs: 0,
      };
    }

    if (httpStatus === 403) {
      return {
        category: 'AUTHORIZATION',
        isRetryable: false,
        message: 'Unauthorized branch or organisation access.',
        code: 'FORBIDDEN',
        suggestedDelayMs: 0,
      };
    }

    if (httpStatus === 409) {
      return {
        category: 'BUSINESS_CONFLICT',
        isRetryable: false,
        message: message || 'Business conflict occurred on server.',
        code: 'CONFLICT',
        suggestedDelayMs: 0,
      };
    }

    if (httpStatus === 400 || httpStatus === 422) {
      return {
        category: 'VALIDATION',
        isRetryable: false,
        message: message || 'Validation failed for mutation payload.',
        code: 'VALIDATION_FAILED',
        suggestedDelayMs: 0,
      };
    }

    if (httpStatus >= 500) {
      return {
        category: 'RETRYABLE_SERVER',
        isRetryable: true,
        message: `Server returned temporary error (HTTP ${httpStatus}).`,
        code: `SERVER_${httpStatus}`,
        suggestedDelayMs: calculateBackoff(1),
      };
    }
  }

  // 3. Fallback
  return {
    category: 'UNKNOWN',
    isRetryable: true,
    message,
    code,
    suggestedDelayMs: calculateBackoff(1),
  };
}


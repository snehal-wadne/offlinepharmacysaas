/**
 * Offline Sync Service
 *
 * Checks connectivity with the backend and synchronizes queued mutations.
 */

import { API_URL } from '../config';
import { getPendingQueue, removeSyncedMutations } from './syncQueue';

/**
 * Checks if the backend server is reachable
 */
export const checkServerConnectivity = async () => {
  // First check browser navigator.onLine
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 2000) : null;

  try {
    const res = await fetch(`${API_URL}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller ? controller.signal : undefined,
    });
    if (timeoutId) clearTimeout(timeoutId);
    return res.ok;
  } catch {
    if (timeoutId) clearTimeout(timeoutId);
    return false;
  }
};

/**
 * Flush all pending offline mutations to the backend
 */
export const flushOfflineQueue = async () => {
  const queue = getPendingQueue();
  if (!queue || queue.length === 0) {
    return { success: true, processedCount: 0, remainingCount: 0 };
  }

  const isConnected = await checkServerConnectivity();
  if (!isConnected) {
    return {
      success: false,
      message: 'Server is currently offline. Mutations remain safely queued locally.',
      processedCount: 0,
      remainingCount: queue.length,
    };
  }

  try {
    const payload = {
      batchId: `batch_${Date.now()}`,
      mutations: queue,
    };

    const res = await fetch(`${API_URL}/sync/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      const syncedIds = data.syncedIds || queue.map((m) => m.id);
      const remaining = removeSyncedMutations(syncedIds);
      return {
        success: true,
        processedCount: syncedIds.length,
        remainingCount: remaining.length,
        message: `Successfully synchronized ${syncedIds.length} offline records.`,
      };
    } else {
      return {
        success: false,
        message: `Server returned error ${res.status}`,
        processedCount: 0,
        remainingCount: queue.length,
      };
    }
  } catch (err) {
    return {
      success: false,
      message: err.message,
      processedCount: 0,
      remainingCount: queue.length,
    };
  }
};

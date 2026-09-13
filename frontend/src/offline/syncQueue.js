/**
 * Offline Sync Queue Manager
 *
 * Persistently stores offline mutations in localStorage so un-synced actions
 * survive browser reloads, page navigation, or system restarts.
 */

const SYNC_QUEUE_KEY = 'pharma_offline_sync_queue_v1';

const getStoredQueue = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(SYNC_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    }
  } catch (e) {}
  return [];
};

const saveStoredQueue = (queue) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch (e) {}
};

/**
 * Add a mutation to the offline sync queue
 */
export const enqueueMutation = (type, data) => {
  const queue = getStoredQueue();
  const mutation = {
    id: `mut_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type,
    data,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: 'pending',
  };

  const updated = [...queue, mutation];
  saveStoredQueue(updated);
  console.log(`📌 Enqueued offline mutation: ${type} (${mutation.id}). Queue size: ${updated.length}`);
  return mutation;
};

/**
 * Get all pending mutations
 */
export const getPendingQueue = () => {
  return getStoredQueue();
};

/**
 * Remove successfully synced mutation IDs
 */
export const removeSyncedMutations = (syncedIds = []) => {
  if (!syncedIds || syncedIds.length === 0) return getStoredQueue();
  const idSet = new Set(syncedIds);
  const queue = getStoredQueue();
  const remaining = queue.filter((m) => !idSet.has(m.id));
  saveStoredQueue(remaining);
  console.log(`✅ Cleared ${syncedIds.length} synced mutations. Remaining: ${remaining.length}`);
  return remaining;
};

/**
 * Clear the entire queue
 */
export const clearSyncQueue = () => {
  saveStoredQueue([]);
};

/**
 * Get pending sync count
 */
export const getPendingCount = () => {
  return getStoredQueue().length;
};

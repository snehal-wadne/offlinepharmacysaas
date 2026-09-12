/**
 * Sync Metadata Repository
 *
 * Manages persistent device identity, sync cursors, and synchronization state.
 */

import { PharmaFlowDatabase, db as defaultDb } from '../pharmaflowDb';
import { SyncMetadataRecord } from '../types';
import { generateUUID } from '../utils/uuid';

const DEVICE_ID_KEY = 'deviceId';
const LAST_SYNC_KEY = 'lastSuccessfulSyncAt';
const PULL_CURSOR_PREFIX = 'lastPullCursor_';

export class SyncMetadataRepository {
  private db: PharmaFlowDatabase;

  constructor(database: PharmaFlowDatabase = defaultDb) {
    this.db = database;
  }

  /**
   * Retrieves persistent device ID or generates a new UUID on first launch.
   */
  async getDeviceId(): Promise<string> {
    const record = await this.db.sync_metadata.get(DEVICE_ID_KEY);
    if (record && record.value) {
      return record.value;
    }

    const newDeviceId = generateUUID();
    await this.setMetadata(DEVICE_ID_KEY, newDeviceId);
    return newDeviceId;
  }

  /**
   * Get metadata entry by key
   */
  async getMetadata<T = any>(key: string): Promise<T | null> {
    const record = await this.db.sync_metadata.get(key);
    return record ? (record.value as T) : null;
  }

  /**
   * Set metadata entry by key
   */
  async setMetadata(key: string, value: any): Promise<void> {
    const record: SyncMetadataRecord = {
      key,
      value,
      updatedAt: new Date().toISOString(),
    };
    await this.db.sync_metadata.put(record);
  }

  /**
   * Get the last pull sync cursor for a given entity stream
   */
  async getLastPullCursor(stream = 'default'): Promise<string | null> {
    return this.getMetadata<string>(`${PULL_CURSOR_PREFIX}${stream}`);
  }

  /**
   * Save the last pull sync cursor
   */
  async setLastPullCursor(cursor: string, stream = 'default'): Promise<void> {
    await this.setMetadata(`${PULL_CURSOR_PREFIX}${stream}`, cursor);
  }

  /**
   * Get timestamp of the last successful full sync
   */
  async getLastSuccessfulSyncAt(): Promise<string | null> {
    return this.getMetadata<string>(LAST_SYNC_KEY);
  }

  /**
   * Save timestamp of the last successful full sync
   */
  async setLastSuccessfulSyncAt(timestamp: string = new Date().toISOString()): Promise<void> {
    await this.setMetadata(LAST_SYNC_KEY, timestamp);
  }
}

export const syncMetadataRepo = new SyncMetadataRepository();


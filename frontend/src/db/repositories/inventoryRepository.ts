/**
 * Inventory Repository
 *
 * Local batch inventory projection per organisation + branch.
 */

import { PharmaFlowDatabase, db as defaultDb } from '../pharmaflowDb';
import { InventoryBatchRecord } from '../types';

export class InventoryRepository {
  private db: PharmaFlowDatabase;

  constructor(database: PharmaFlowDatabase = defaultDb) {
    this.db = database;
  }

  /**
   * Get all active batches for a specific product in a branch
   */
  async getBatchesByProduct(branchId: string, productId: string): Promise<InventoryBatchRecord[]> {
    return this.db.inventory
      .where('[branchId+productId]')
      .equals([branchId, productId])
      .filter((b) => b.availableQuantity > 0)
      .sortBy('expiryDate'); // FIFO / FEFO order
  }

  /**
   * Calculate total available stock for a product across all batches in a branch
   */
  async getAvailableStockForProduct(branchId: string, productId: string): Promise<number> {
    const batches = await this.getBatchesByProduct(branchId, productId);
    return batches.reduce((sum, b) => sum + (b.availableQuantity || 0), 0);
  }

  /**
   * Deduct stock from a specific batch (used during sale finalization)
   * Note: This method can run within an active Dexie transaction.
   */
  async decrementBatchStock(
    branchId: string,
    productId: string,
    batchNumber: string,
    quantityToDeduct: number
  ): Promise<InventoryBatchRecord> {
    const batch = await this.db.inventory
      .where('[branchId+productId]')
      .equals([branchId, productId])
      .filter((b) => b.batchNumber === batchNumber)
      .first();

    if (!batch) {
      throw new Error(`Batch ${batchNumber} for product ${productId} in branch ${branchId} not found`);
    }

    const newQty = Math.max(0, batch.availableQuantity - quantityToDeduct);
    const updatedRecord: InventoryBatchRecord = {
      ...batch,
      availableQuantity: newQty,
      updatedAt: new Date().toISOString(),
    };

    await this.db.inventory.put(updatedRecord);
    return updatedRecord;
  }

  /**
   * Bulk upsert inventory batches (used during initial seed or sync pull)
   */
  async bulkUpsertInventory(batches: InventoryBatchRecord[]): Promise<void> {
    if (!batches || batches.length === 0) return;
    const now = new Date().toISOString();
    const records = batches.map((b) => ({
      ...b,
      updatedAt: b.updatedAt || now,
    }));
    await this.db.inventory.bulkPut(records);
  }

  /**
   * Get all inventory records for a branch
   */
  async getAllBranchBatches(branchId: string): Promise<InventoryBatchRecord[]> {
    return this.db.inventory
      .where('branchId')
      .equals(branchId)
      .toArray();
  }
}

export const inventoryRepo = new InventoryRepository();


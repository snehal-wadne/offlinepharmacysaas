/**
 * Product Repository
 *
 * Local read-optimized product catalog replica in IndexedDB.
 */

import { PharmaFlowDatabase, db as defaultDb } from '../pharmaflowDb';
import { ProductRecord } from '../types';

export class ProductRepository {
  private db: PharmaFlowDatabase;

  constructor(database: PharmaFlowDatabase = defaultDb) {
    this.db = database;
  }

  /**
   * Save or update a single product
   */
  async upsertProduct(product: ProductRecord): Promise<string> {
    return this.db.products.put({
      ...product,
      updatedAt: product.updatedAt || new Date().toISOString(),
    });
  }

  /**
   * Bulk insert or update products (used during sync pull / seeding)
   */
  async bulkUpsertProducts(products: ProductRecord[]): Promise<void> {
    if (!products || products.length === 0) return;
    const now = new Date().toISOString();
    const records = products.map((p) => ({
      ...p,
      updatedAt: p.updatedAt || now,
    }));
    await this.db.products.bulkPut(records);
  }

  /**
   * Get product by primary key (productId)
   */
  async getProductById(productId: string): Promise<ProductRecord | undefined> {
    return this.db.products.get(productId);
  }

  /**
   * Find product by exact barcode within an organisation
   */
  async findProductByBarcode(organisationId: string, barcode: string): Promise<ProductRecord | undefined> {
    if (!barcode) return undefined;
    return this.db.products
      .where('[organisationId+barcode]')
      .equals([organisationId, barcode])
      .first();
  }

  /**
   * Search active products by name, generic name, barcode, or SKU within an organisation
   */
  async searchProducts(organisationId: string, query: string, limit = 50): Promise<ProductRecord[]> {
    const q = query.trim().toLowerCase();
    if (!q) {
      return this.db.products
        .where('organisationId')
        .equals(organisationId)
        .filter((p) => p.active !== false)
        .limit(limit)
        .toArray();
    }

    // Direct indexed prefix search on name if possible, or filter
    return this.db.products
      .where('organisationId')
      .equals(organisationId)
      .filter((p) => {
        if (!p.active) return false;
        const nameMatch = p.name?.toLowerCase().includes(q);
        const genericMatch = p.genericName?.toLowerCase().includes(q);
        const barcodeMatch = p.barcode?.toLowerCase().includes(q);
        const skuMatch = p.sku?.toLowerCase().includes(q);
        return Boolean(nameMatch || genericMatch || barcodeMatch || skuMatch);
      })
      .limit(limit)
      .toArray();
  }

  /**
   * Get all active products for an organisation
   */
  async getAllProducts(organisationId: string): Promise<ProductRecord[]> {
    return this.db.products
      .where('organisationId')
      .equals(organisationId)
      .filter((p) => p.active !== false)
      .toArray();
  }

  /**
   * Count products in the local store
   */
  async countProducts(organisationId?: string): Promise<number> {
    if (organisationId) {
      return this.db.products.where('organisationId').equals(organisationId).count();
    }
    return this.db.products.count();
  }
}

export const productRepo = new ProductRepository();


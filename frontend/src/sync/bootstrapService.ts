/**
 * Tenant & Branch Master Data Bootstrap Service
 *
 * Coordinates authoritative master data downloads from PostgreSQL to IndexedDB
 * for the active organisation + active branch when online.
 *
 * Guarantees:
 * 1. Authenticated & tenant-isolated bootstrap via GET /api/sync/bootstrap
 * 2. Atomic Dexie transaction across [products, inventory, customers, sync_metadata]
 * 3. Preserves locally pending customer mutations (syncStatus === 'PENDING')
 * 4. Never touches or overwrites sync_outbox or transactions stores
 * 5. Advances local sync cursor to serverCursor so subsequent pulls start seamlessly
 * 6. Completely atomic: failure rolls back IndexedDB to previous state
 */

import { PharmaFlowDatabase, db as defaultDb } from '../db/pharmaflowDb';
import { ProductRecord, CustomerRecord, InventoryBatchRecord } from '../db/types';

export interface BootstrapOptions {
  organisationId: string;
  branchId: string;
  authToken?: string | null;
  baseUrl?: string;
}

export interface BootstrapResult {
  success: boolean;
  organisationId: string;
  branchId: string;
  serverCursor: string;
  bootstrappedAt: string;
  productCount: number;
  inventoryCount: number;
  customerCount: number;
  branch?: any;
  taxConfig?: any;
}

export class BootstrapService {
  private db: PharmaFlowDatabase;
  private defaultBaseUrl: string;

  constructor(database: PharmaFlowDatabase = defaultDb, baseUrl = 'http://localhost:5000') {
    this.db = database;
    this.defaultBaseUrl = baseUrl;
  }

  /**
   * Check if the specified organisation and branch have been bootstrapped locally
   */
  async isBootstrapped(organisationId: string, branchId: string): Promise<boolean> {
    const meta = await this.db.sync_metadata.get(`bootstrap_${organisationId}_${branchId}`);
    return Boolean(meta && meta.value && meta.value.bootstrappedAt);
  }

  /**
   * Retrieve cached bootstrap metadata
   */
  async getBootstrapMetadata(organisationId: string, branchId: string): Promise<any | null> {
    const meta = await this.db.sync_metadata.get(`bootstrap_${organisationId}_${branchId}`);
    return meta ? meta.value : null;
  }

  /**
   * Hydrate local IndexedDB with authoritative PostgreSQL master data
   */
  async bootstrap(options: BootstrapOptions): Promise<BootstrapResult> {
    const { organisationId, branchId, authToken, baseUrl = this.defaultBaseUrl } = options;

    if (!organisationId) {
      throw new Error('Bootstrap requires a valid organisationId');
    }
    if (!branchId) {
      throw new Error('Bootstrap requires a valid branchId');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-organisation-id': organisationId,
      'x-branch-id': branchId,
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
      headers['x-sync-auth'] = authToken;
    }

    const url = `${baseUrl}/api/sync/bootstrap?organisationId=${encodeURIComponent(
      organisationId
    )}&branchId=${encodeURIComponent(branchId)}`;

    let response: Response;
    try {
      response = await fetch(url, { method: 'GET', headers });
    } catch (networkError: any) {
      throw new Error(`Bootstrap network request failed: ${networkError?.message || networkError}`);
    }

    if (!response.ok) {
      let errDetail = response.statusText;
      try {
        const body = await response.json();
        errDetail = body?.error || errDetail;
      } catch {
        // Fallback to status text
      }
      throw new Error(`Bootstrap failed (HTTP ${response.status}): ${errDetail}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(`Bootstrap returned unsuccessful status: ${data.error || 'Unknown error'}`);
    }

    const products: ProductRecord[] = data.products || [];
    const inventory: InventoryBatchRecord[] = data.inventory || [];
    const customers: CustomerRecord[] = data.customers || [];
    const serverCursor: string = data.serverCursor || '0';
    const bootstrappedAt: string = data.bootstrappedAt || new Date().toISOString();
    const now = new Date().toISOString();

    // Perform atomic IndexedDB multi-store transaction
    // Strictly modifies only master data and sync metadata.
    // DOES NOT touch sync_outbox or transactions!
    await this.db.transaction(
      'rw',
      [this.db.products, this.db.inventory, this.db.customers, this.db.sync_metadata],
      async () => {
        // 1. Bulk upsert authoritative products
        if (products.length > 0) {
          await this.db.products.bulkPut(products);
        }

        // 2. Bulk upsert authoritative branch inventory
        if (inventory.length > 0) {
          await this.db.inventory.bulkPut(inventory);
        }

        // 3. Upsert customers while strictly preserving locally created / pending edits
        if (customers.length > 0) {
          for (const c of customers) {
            const localCust = await this.db.customers.get(c.customerId);
            if (localCust && localCust.syncStatus === 'PENDING') {
              // Local un-synced customer changes must never be overwritten
              continue;
            }
            await this.db.customers.put({
              ...c,
              syncStatus: 'SYNCED',
              isLocallyCreated: false,
            });
          }
        }

        // 4. Save bootstrap metadata & sync cursor
        await this.db.sync_metadata.put({
          key: `bootstrap_${organisationId}_${branchId}`,
          value: {
            bootstrappedAt,
            serverCursor,
            productCount: products.length,
            inventoryCount: inventory.length,
            customerCount: customers.length,
            branch: data.branch,
            taxConfig: data.taxConfig,
          },
          updatedAt: now,
        });

        // Set lastBootstrapCursor
        await this.db.sync_metadata.put({
          key: `last_bootstrap_cursor_${organisationId}_${branchId}`,
          value: serverCursor,
          updatedAt: now,
        });

        // Advance pull sync cursor to serverCursor so subsequent pulls only process newer events
        await this.db.sync_metadata.put({
          key: `last_sync_cursor_${organisationId}_${branchId}`,
          value: serverCursor,
          updatedAt: now,
        });

        // Cache active branch and tax config for fast offline access
        if (data.branch) {
          await this.db.sync_metadata.put({
            key: `active_branch_config_${branchId}`,
            value: data.branch,
            updatedAt: now,
          });
        }

        if (data.taxConfig) {
          await this.db.sync_metadata.put({
            key: `active_tax_config_${branchId}`,
            value: data.taxConfig,
            updatedAt: now,
          });
        }
      }
    );

    return {
      success: true,
      organisationId,
      branchId,
      serverCursor,
      bootstrappedAt,
      productCount: products.length,
      inventoryCount: inventory.length,
      customerCount: customers.length,
      branch: data.branch,
      taxConfig: data.taxConfig,
    };
  }

  /**
   * Clear local master data for a tenant/branch (useful for tenant switching or testing)
   */
  async clearBootstrapData(organisationId: string, branchId: string): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.products, this.db.inventory, this.db.customers, this.db.sync_metadata],
      async () => {
        // Clear products for organisation
        const orgProducts = await this.db.products
          .where('organisationId')
          .equals(organisationId)
          .primaryKeys();
        await this.db.products.bulkDelete(orgProducts);

        // Clear inventory for branch
        const branchInv = await this.db.inventory
          .where('branchId')
          .equals(branchId)
          .primaryKeys();
        await this.db.inventory.bulkDelete(branchInv);

        // Clear synced customers for organisation (preserve PENDING)
        const orgCustomers = await this.db.customers
          .where('organisationId')
          .equals(organisationId)
          .filter((c) => c.syncStatus !== 'PENDING')
          .primaryKeys();
        await this.db.customers.bulkDelete(orgCustomers);

        // Remove bootstrap metadata keys
        await this.db.sync_metadata.delete(`bootstrap_${organisationId}_${branchId}`);
        await this.db.sync_metadata.delete(`last_bootstrap_cursor_${organisationId}_${branchId}`);
        await this.db.sync_metadata.delete(`active_branch_config_${branchId}`);
        await this.db.sync_metadata.delete(`active_tax_config_${branchId}`);
      }
    );
  }
}

export const bootstrapService = new BootstrapService();
export default bootstrapService;


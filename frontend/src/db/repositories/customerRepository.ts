/**
 * Customer Repository
 *
 * Local customer lookup & offline-created customer management.
 */

import { PharmaFlowDatabase, db as defaultDb } from '../pharmaflowDb';
import { CustomerRecord } from '../types';
import { generateUUID } from '../utils/uuid';

export class CustomerRepository {
  private db: PharmaFlowDatabase;

  constructor(database: PharmaFlowDatabase = defaultDb) {
    this.db = database;
  }

  /**
   * Look up a customer by phone number within an organisation
   */
  async findCustomerByPhone(organisationId: string, phone: string): Promise<CustomerRecord | undefined> {
    if (!phone) return undefined;
    const cleanPhone = phone.trim();
    return this.db.customers
      .where('[organisationId+phone]')
      .equals([organisationId, cleanPhone])
      .first();
  }

  /**
   * Search customers by name or phone within an organisation
   */
  async searchCustomers(organisationId: string, query: string, limit = 20): Promise<CustomerRecord[]> {
    const q = query.trim().toLowerCase();
    if (!q) {
      return this.db.customers
        .where('organisationId')
        .equals(organisationId)
        .limit(limit)
        .toArray();
    }

    return this.db.customers
      .where('organisationId')
      .equals(organisationId)
      .filter((c) => {
        const nameMatch = c.name?.toLowerCase().includes(q);
        const phoneMatch = c.phone?.includes(q);
        return Boolean(nameMatch || phoneMatch);
      })
      .limit(limit)
      .toArray();
  }

  /**
   * Create a new customer locally while offline
   * Marked as isLocallyCreated = true and syncStatus = 'PENDING'
   */
  async createLocalCustomer(
    data: Omit<CustomerRecord, 'customerId' | 'isLocallyCreated' | 'syncStatus' | 'updatedAt'> & {
      customerId?: string;
    }
  ): Promise<CustomerRecord> {
    const customerId = data.customerId || generateUUID();
    const newCustomer: CustomerRecord = {
      ...data,
      customerId,
      phone: data.phone.trim(),
      isLocallyCreated: true,
      syncStatus: 'PENDING',
      updatedAt: new Date().toISOString(),
    };

    await this.db.customers.put(newCustomer);
    return newCustomer;
  }

  /**
   * Bulk upsert customers (used by sync pull worker)
   */
  async bulkUpsertCustomers(customers: CustomerRecord[]): Promise<void> {
    if (!customers || customers.length === 0) return;
    const now = new Date().toISOString();
    const records = customers.map((c) => ({
      ...c,
      updatedAt: c.updatedAt || now,
    }));
    await this.db.customers.bulkPut(records);
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(customerId: string): Promise<CustomerRecord | undefined> {
    return this.db.customers.get(customerId);
  }
}

export const customerRepo = new CustomerRepository();


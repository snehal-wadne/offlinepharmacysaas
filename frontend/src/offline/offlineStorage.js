/**
 * Frontend Offline Storage Engine
 * 
 * Migrated to IndexedDB via Dexie
 */

import { db } from '../db/pharmaflowDb';

export const initOfflineStorage = async () => {
  // Initialization now handled by localPersistenceService seeding
};

export const getOfflineProducts = async () => {
  return await db.products.toArray();
};

export const saveOfflineProducts = async (products) => {
  await db.products.bulkPut(products);
};

export const deductOfflineStock = async (cartItems) => {
  // Handled atomically in localPersistenceService now
  return await getOfflineProducts();
};

// INVOICES
export const getOfflineInvoices = async () => {
  const txs = await db.transactions.where('type').equals('SALE').toArray();
  return txs.map(t => t.payload || {});
};

export const saveOfflineInvoice = async (invoice) => {
  // Handled by localPersistenceService
  return invoice;
};

// HELD BILLS
// For now, keep held bills in memory or a simple IDB store if available
// Since held bills aren't strictly defined in pharmaflowDb schema yet, 
// we will just return empty arrays or use the existing mock
export const getOfflineHeldBills = async () => {
  return [];
};

export const saveOfflineHeldBill = async (bill) => {
  return bill;
};

export const removeOfflineHeldBill = async (draftId) => {
  return [];
};

// CUSTOMERS
export const getOfflineCustomers = async () => {
  return await db.customers.toArray();
};

export const saveOfflineCustomer = async (customer) => {
  if (customer.customerId) {
    await db.customers.put(customer);
  }
  return customer;
};

// PURCHASES
export const getOfflinePurchases = async () => {
  const txs = await db.transactions.where('type').equals('PURCHASE').toArray();
  return txs.map(t => t.payload || {});
};

export const saveOfflinePurchase = async (po) => {
  return po;
};


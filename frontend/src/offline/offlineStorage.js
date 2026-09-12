/**
 * Frontend Offline Storage Engine
 *
 * Provides resilient, zero-network local storage in the browser using localStorage.
 * Pre-seeds initial pharmacy data so the application runs 100% offline out-of-the-box.
 */

import { MOCK_POS_PRODUCTS, MOCK_HELD_BILLS, MOCK_RECENT_INVOICES } from '../data/cashierMockData';
import { MOCK_CUSTOMERS_LIST } from '../data/customersMockData';
import { MOCK_PURCHASE_ORDERS } from '../data/purchasesMockData';

const STORAGE_KEYS = {
  PRODUCTS: 'pharma_offline_products_v1',
  INVOICES: 'pharma_offline_invoices_v1',
  HELD_BILLS: 'pharma_offline_held_bills_v1',
  CUSTOMERS: 'pharma_offline_customers_v1',
  PURCHASES: 'pharma_offline_purchases_v1',
  INITIALIZED: 'pharma_offline_initialized_v1',
};

// Safe localStorage access for both web and non-web environments
const memoryFallback = {};

const safeGetItem = (key) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (e) {
    // Private mode or storage disabled
  }
  return memoryFallback[key] || null;
};

const safeSetItem = (key, value) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch (e) {}
  memoryFallback[key] = value;
};

/**
 * Initialize storage with default master data if empty
 */
export const initOfflineStorage = () => {
  const isInitialized = safeGetItem(STORAGE_KEYS.INITIALIZED);
  if (!isInitialized) {
    safeSetItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(MOCK_POS_PRODUCTS));
    safeSetItem(STORAGE_KEYS.HELD_BILLS, JSON.stringify(MOCK_HELD_BILLS));
    safeSetItem(STORAGE_KEYS.INVOICES, JSON.stringify(MOCK_RECENT_INVOICES));
    safeSetItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(MOCK_CUSTOMERS_LIST));
    safeSetItem(STORAGE_KEYS.PURCHASES, JSON.stringify(MOCK_PURCHASE_ORDERS));
    safeSetItem(STORAGE_KEYS.INITIALIZED, 'true');
    console.log('⚡ Offline Storage initialized with pharmacy master catalog.');
  }
};

// PRODUCTS
export const getOfflineProducts = () => {
  initOfflineStorage();
  try {
    const raw = safeGetItem(STORAGE_KEYS.PRODUCTS);
    return raw ? JSON.parse(raw) : MOCK_POS_PRODUCTS;
  } catch {
    return MOCK_POS_PRODUCTS;
  }
};

export const saveOfflineProducts = (products) => {
  safeSetItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
};

export const deductOfflineStock = (cartItems) => {
  const products = getOfflineProducts();
  const updated = products.map((prod) => {
    const cartItem = cartItems.find((c) => c.id === prod.id || c.sku === prod.sku);
    if (cartItem) {
      const currentStock = Number(prod.stock || 0);
      const deductQty = Number(cartItem.qty || cartItem.quantity || 1);
      return {
        ...prod,
        stock: Math.max(0, currentStock - deductQty),
      };
    }
    return prod;
  });
  saveOfflineProducts(updated);
  return updated;
};

// INVOICES
export const getOfflineInvoices = () => {
  initOfflineStorage();
  try {
    const raw = safeGetItem(STORAGE_KEYS.INVOICES);
    return raw ? JSON.parse(raw) : MOCK_RECENT_INVOICES;
  } catch {
    return MOCK_RECENT_INVOICES;
  }
};

export const saveOfflineInvoice = (invoice) => {
  const invoices = getOfflineInvoices();
  const existingIndex = invoices.findIndex((i) => i.invoiceNo === invoice.invoiceNo);
  let updated;
  if (existingIndex >= 0) {
    updated = [...invoices];
    updated[existingIndex] = invoice;
  } else {
    updated = [invoice, ...invoices];
  }
  safeSetItem(STORAGE_KEYS.INVOICES, JSON.stringify(updated));
  return invoice;
};

// HELD BILLS
export const getOfflineHeldBills = () => {
  initOfflineStorage();
  try {
    const raw = safeGetItem(STORAGE_KEYS.HELD_BILLS);
    return raw ? JSON.parse(raw) : MOCK_HELD_BILLS;
  } catch {
    return MOCK_HELD_BILLS;
  }
};

export const saveOfflineHeldBill = (bill) => {
  const bills = getOfflineHeldBills();
  const draftId = bill.holdId || bill.billNo;
  const existingIndex = bills.findIndex((b) => (b.holdId || b.billNo) === draftId);
  let updated;
  if (existingIndex >= 0) {
    updated = [...bills];
    updated[existingIndex] = bill;
  } else {
    updated = [bill, ...bills];
  }
  safeSetItem(STORAGE_KEYS.HELD_BILLS, JSON.stringify(updated));
  return bill;
};

export const removeOfflineHeldBill = (draftId) => {
  const bills = getOfflineHeldBills();
  const filtered = bills.filter((b) => (b.holdId || b.billNo) !== draftId);
  safeSetItem(STORAGE_KEYS.HELD_BILLS, JSON.stringify(filtered));
  return filtered;
};

// CUSTOMERS
export const getOfflineCustomers = () => {
  initOfflineStorage();
  try {
    const raw = safeGetItem(STORAGE_KEYS.CUSTOMERS);
    return raw ? JSON.parse(raw) : MOCK_CUSTOMERS_LIST;
  } catch {
    return MOCK_CUSTOMERS_LIST;
  }
};

export const saveOfflineCustomer = (customer) => {
  const customers = getOfflineCustomers();
  const existingIndex = customers.findIndex((c) => c.id === customer.id);
  let updated;
  if (existingIndex >= 0) {
    updated = [...customers];
    updated[existingIndex] = customer;
  } else {
    updated = [customer, ...customers];
  }
  safeSetItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(updated));
  return customer;
};

// PURCHASES
export const getOfflinePurchases = () => {
  initOfflineStorage();
  try {
    const raw = safeGetItem(STORAGE_KEYS.PURCHASES);
    return raw ? JSON.parse(raw) : MOCK_PURCHASE_ORDERS;
  } catch {
    return MOCK_PURCHASE_ORDERS;
  }
};

export const saveOfflinePurchase = (po) => {
  const purchases = getOfflinePurchases();
  const existingIndex = purchases.findIndex((p) => p.poNumber === po.poNumber);
  let updated;
  if (existingIndex >= 0) {
    updated = [...purchases];
    updated[existingIndex] = po;
  } else {
    updated = [po, ...purchases];
  }
  safeSetItem(STORAGE_KEYS.PURCHASES, JSON.stringify(updated));
  return po;
};

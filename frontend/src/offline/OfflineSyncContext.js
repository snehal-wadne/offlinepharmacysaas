/**
 * Offline Sync Context & Provider
 *
 * Provides real-time reactive sync status and offline operations across the application.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db } from '../db/pharmaflowDb';
import { LocalPersistenceService } from '../db/services/localPersistenceService';
import { syncEngine } from '../sync/syncEngine';

const localPersistenceService = new LocalPersistenceService(db);
const OfflineSyncContext = createContext(null);

export function OfflineSyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncBanner, setSyncBanner] = useState(null);

  // Reactive state for local offline data
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [heldBills, setHeldBills] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [purchases, setPurchases] = useState([]);

  // Initialize and load local storage data
  useEffect(() => {
    syncEngine.start();
    const unsub = syncEngine.subscribe((state) => {
      setIsOnline(state.isOnline);
      setPendingCount(state.pendingCount);
      setIsSyncing(state.isSyncing);
      if (state.lastSuccessfulSyncAt) {
        setLastSyncedAt(new Date(state.lastSuccessfulSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    });

    const loadData = async () => {
      try {
        const prods = await db.products.toArray();
        setProducts(prods);

        const custs = await db.customers.toArray();
        setCustomers(custs);

        const invRecords = await localPersistenceService.getRecentInvoices();
        setInvoices(invRecords);
      } catch (err) {
        console.warn("[OfflineSyncContext] Local data load warning:", err.message);
      }
    };
    loadData();

    return () => {
      unsub();
      syncEngine.stop();
    };
  }, []);

  // Sync runner function
  const triggerSync = useCallback(async (isAuto = false) => {
    if (isSyncing) return;
    try {
      await syncEngine.syncNow();
      setSyncBanner({
        type: 'success',
        message: `✅ Sync completed successfully.`,
      });
      setTimeout(() => setSyncBanner(null), 4000);
    } catch (e) {
      console.warn('Sync attempt failed:', e.message);
      if (!isAuto) {
        setSyncBanner({
          type: 'warning',
          message: `⚠️ Sync failed: ${e.message}`,
        });
        setTimeout(() => setSyncBanner(null), 4000);
      }
    }
  }, [isSyncing]);

  // ============================================================
  // OFFLINE MUTATION ACTIONS
  // ============================================================

  const recordSaleOffline = useCallback(async (invoiceData, cartItems = []) => {
    const saleData = { ...invoiceData, items: cartItems };
    await localPersistenceService.commitLocalSale(saleData);
    
    // Reload data
    const prods = await db.products.toArray();
    setProducts(prods);
    const invRecords = await localPersistenceService.getRecentInvoices();
    setInvoices(invRecords);

    return invoiceData;
  }, []);

  const recordHoldBillOffline = useCallback(async (billData) => {
    setHeldBills((prev) => {
      const draftId = billData.holdId || billData.billNo;
      return [billData, ...prev.filter((b) => (b.holdId || b.billNo) !== draftId)];
    });
    return billData;
  }, []);

  const deleteHoldBillOffline = useCallback((draftId) => {
    setHeldBills((prev) => prev.filter((b) => (b.holdId || b.billNo) !== draftId));
  }, []);

  const recordPurchaseOffline = useCallback(async (poData) => {
    setPurchases((prev) => [poData, ...prev.filter((p) => p.poNumber !== poData.poNumber)]);
    return poData;
  }, []);

  const recordCustomerOffline = useCallback(async (customerData) => {
    await localPersistenceService.saveCustomer(customerData);
    const custs = await db.customers.toArray();
    setCustomers(custs);
    return customerData;
  }, []);

  const value = {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncedAt,
    syncBanner,
    syncNow: () => triggerSync(false),
    products,
    invoices,
    heldBills,
    customers,
    purchases,
    recordSaleOffline,
    recordHoldBillOffline,
    deleteHoldBillOffline,
    recordPurchaseOffline,
    recordCustomerOffline,
  };

  return (
    <OfflineSyncContext.Provider value={value}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const context = useContext(OfflineSyncContext);
  if (!context) {
    throw new Error('useOfflineSync must be used within an OfflineSyncProvider');
  }
  return context;
}

/**
 * Offline Sync Context & Provider
 *
 * Provides real-time reactive sync status and offline operations across the application.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  initOfflineStorage,
  getOfflineProducts,
  saveOfflineProducts,
  deductOfflineStock,
  getOfflineInvoices,
  saveOfflineInvoice,
  getOfflineHeldBills,
  saveOfflineHeldBill,
  removeOfflineHeldBill,
  getOfflineCustomers,
  saveOfflineCustomer,
  getOfflinePurchases,
  saveOfflinePurchase,
} from './offlineStorage';
import {
  enqueueMutation,
  getPendingQueue,
  removeSyncedMutations,
  getPendingCount,
} from './syncQueue';
import { checkServerConnectivity, flushOfflineQueue } from './syncService';
import { fetchCashierProducts } from '../api/cashierApi';
import { fetchCustomers } from '../api/customerApi';

const OfflineSyncContext = createContext(null);

export function OfflineSyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
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

  // Initialize and load local storage data + hydrate from live backend
  useEffect(() => {
    initOfflineStorage();
    setProducts(getOfflineProducts());
    setInvoices(getOfflineInvoices());
    setHeldBills(getOfflineHeldBills());
    setCustomers(getOfflineCustomers());
    setPurchases(getOfflinePurchases());
    setPendingCount(getPendingCount());

    let active = true;
    (async () => {
      try {
        const reachable = await checkServerConnectivity();
        if (reachable && active) {
          const [liveProds, liveCusts] = await Promise.all([
            fetchCashierProducts(),
            fetchCustomers(),
          ]);
          if (active && liveProds && Array.isArray(liveProds) && liveProds.length > 0) {
            setProducts(liveProds);
            saveOfflineProducts(liveProds);
          }
          if (active && liveCusts && Array.isArray(liveCusts?.data) && liveCusts.data.length > 0) {
            setCustomers(liveCusts.data);
          }
        }
      } catch (err) {
        console.log('[OfflineSync] Server hydration skipped, offline cache active.');
      }
    })();
    return () => { active = false; };
  }, []);

  // Sync runner function
  const triggerSync = useCallback(async (isAuto = false) => {
    if (isSyncing) return;
    const currentPending = getPendingCount();
    if (currentPending === 0) return;

    setIsSyncing(true);
    try {
      const result = await flushOfflineQueue();
      if (result.success && result.processedCount > 0) {
        setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        setPendingCount(result.remainingCount);
        setSyncBanner({
          type: 'success',
          message: `✅ Synchronized ${result.processedCount} offline record${result.processedCount > 1 ? 's' : ''} with server.`,
        });
        setTimeout(() => setSyncBanner(null), 4000);
      } else if (!result.success && !isAuto) {
        setSyncBanner({
          type: 'warning',
          message: `⚠️ Server offline. ${currentPending} record${currentPending > 1 ? 's' : ''} saved locally.`,
        });
        setTimeout(() => setSyncBanner(null), 4000);
      }
    } catch (e) {
      console.warn('Sync attempt failed:', e.message);
    } finally {
      setIsSyncing(false);
      setPendingCount(getPendingCount());
    }
  }, [isSyncing]);

  // Network connectivity listener & heartbeat
  useEffect(() => {
    const handleOnline = async () => {
      console.log('📡 Browser reports online. Probing server...');
      const serverReachable = await checkServerConnectivity();
      setIsOnline(serverReachable);
      if (serverReachable) {
        triggerSync(true);
      }
    };

    const handleOffline = () => {
      console.log('⚠️ Browser reports offline.');
      setIsOnline(false);
      setSyncBanner({
        type: 'warning',
        message: '📡 You are currently offline. All operations will continue running seamlessly offline.',
      });
      setTimeout(() => setSyncBanner(null), 5000);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    // Background heartbeat check every 15 seconds
    const interval = setInterval(async () => {
      const serverReachable = await checkServerConnectivity();
      setIsOnline(serverReachable);
      if (serverReachable && getPendingCount() > 0 && !isSyncing) {
        triggerSync(true);
      }
    }, 15000);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
      clearInterval(interval);
    };
  }, [triggerSync, isSyncing]);

  // ============================================================
  // OFFLINE MUTATION ACTIONS
  // ============================================================

  /**
   * Complete Sale in Offline Mode
   * - Deducts local stock
   * - Saves invoice to local storage
   * - Queues mutation for sync
   */
  const recordSaleOffline = useCallback((invoiceData, cartItems = []) => {
    // 1. Deduct stock in local product catalog
    if (cartItems.length > 0) {
      const updatedProducts = deductOfflineStock(cartItems);
      setProducts(updatedProducts);
    }

    // 2. Persist invoice to local invoices
    saveOfflineInvoice(invoiceData);
    setInvoices((prev) => [invoiceData, ...prev.filter((i) => i.invoiceNo !== invoiceData.invoiceNo)]);

    // 3. Enqueue mutation
    enqueueMutation('CREATE_INVOICE', {
      invoice: invoiceData,
      items: cartItems,
    });
    setPendingCount(getPendingCount());

    // 4. If online, attempt background sync immediately
    if (isOnline) {
      setTimeout(() => triggerSync(true), 500);
    }

    return invoiceData;
  }, [isOnline, triggerSync]);

  /**
   * Hold Bill in Offline Mode
   */
  const recordHoldBillOffline = useCallback((billData) => {
    saveOfflineHeldBill(billData);
    setHeldBills((prev) => {
      const draftId = billData.holdId || billData.billNo;
      return [billData, ...prev.filter((b) => (b.holdId || b.billNo) !== draftId)];
    });

    enqueueMutation('HOLD_BILL', billData);
    setPendingCount(getPendingCount());

    if (isOnline) {
      setTimeout(() => triggerSync(true), 500);
    }

    return billData;
  }, [isOnline, triggerSync]);

  /**
   * Remove / Resume Held Bill Offline
   */
  const deleteHoldBillOffline = useCallback((draftId) => {
    removeOfflineHeldBill(draftId);
    setHeldBills((prev) => prev.filter((b) => (b.holdId || b.billNo) !== draftId));
    enqueueMutation('DELETE_HOLD_BILL', { draftId });
    setPendingCount(getPendingCount());
  }, []);

  /**
   * Create Purchase Order in Offline Mode
   */
  const recordPurchaseOffline = useCallback((poData) => {
    saveOfflinePurchase(poData);
    setPurchases((prev) => [poData, ...prev.filter((p) => p.poNumber !== poData.poNumber)]);

    enqueueMutation('CREATE_PURCHASE', poData);
    setPendingCount(getPendingCount());

    if (isOnline) {
      setTimeout(() => triggerSync(true), 500);
    }

    return poData;
  }, [isOnline, triggerSync]);

  /**
   * Create / Update Customer in Offline Mode
   */
  const recordCustomerOffline = useCallback((customerData) => {
    saveOfflineCustomer(customerData);
    setCustomers((prev) => [customerData, ...prev.filter((c) => c.id !== customerData.id)]);

    enqueueMutation('CREATE_CUSTOMER', customerData);
    setPendingCount(getPendingCount());

    if (isOnline) {
      setTimeout(() => triggerSync(true), 500);
    }

    return customerData;
  }, [isOnline, triggerSync]);

  const value = {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncedAt,
    syncBanner,
    syncNow: () => triggerSync(false),
    // Local Data
    products,
    invoices,
    heldBills,
    customers,
    purchases,
    // Offline Actions
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

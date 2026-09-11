import React, { createContext, useContext, useState, useEffect } from "react";
import {
  MOCK_POS_PRODUCTS,
  MOCK_HELD_BILLS,
  MOCK_RECENT_INVOICES,
} from "../data/cashierMockData";
import { localPersistenceService } from "../db";
import { syncEngine } from "../sync";

const PosContext = createContext(null);

export function PosProvider({ children }) {
  const [products, setProducts] = useState(MOCK_POS_PRODUCTS);
  const [heldBills, setHeldBills] = useState(MOCK_HELD_BILLS);
  const [activeResumedDraft, setActiveResumedDraft] = useState(null);
  const [invoices, setInvoices] = useState(MOCK_RECENT_INVOICES);
  const [syncState, setSyncState] = useState(
    typeof syncEngine?.getState === "function"
      ? syncEngine.getState()
      : { status: "IDLE", isOnline: true }
  );
  const [returnHistory, setReturnHistory] = useState([
    {
      returnNo: "RET-2026-104",
      originalInvoice: "INV-1020",
      date: "27 Aug 2026, 04:30 PM",
      customer: "Suresh Patil",
      amount: 158.0,
      refundMode: "Cash",
      reason: "Doctor altered prescription",
      stockDisposition: "Sellable",
      itemsCount: 1,
      items: [{ name: "Pan 40 Tablets", qty: 1, refundPrice: 158.0 }],
    },
  ]);

  // Initialize local persistence layer and restore recent invoices
  useEffect(() => {
    let isMounted = true;

    // Start Sync Engine in background and listen for status updates
    const subscribeFn =
      typeof syncEngine?.onStateChange === "function"
        ? syncEngine.onStateChange.bind(syncEngine)
        : typeof syncEngine?.subscribe === "function"
        ? syncEngine.subscribe.bind(syncEngine)
        : null;

    const unsubscribeSync = subscribeFn
      ? subscribeFn((newState) => {
          if (isMounted) {
            setSyncState(newState);
          }
        })
      : () => {};

    if (typeof syncEngine?.start === "function") {
      syncEngine.start().catch((err) => {
        console.warn("[PosContext] Sync engine start warning:", err);
      });
    }

    if (typeof localPersistenceService?.initialize === "function") {
      localPersistenceService
        .initialize()
      .then(async () => {
        try {
          const persistedInvoices =
            await localPersistenceService.getRecentInvoices();
          if (isMounted && persistedInvoices && persistedInvoices.length > 0) {
            setInvoices((prev) => {
              const existingNos = new Set(
                persistedInvoices.map((inv) => inv.invoiceNo),
              );
              const unpersisted = prev.filter(
                (inv) => !existingNos.has(inv.invoiceNo),
              );
              return [...persistedInvoices, ...unpersisted];
            });
          }
        } catch (err) {
          console.warn(
            "[PosContext] Could not load persisted invoices from IndexedDB:",
            err,
          );
        }
      })
      .catch((err) => {
        console.warn(
          "[PosContext] Local persistence initialization warning:",
          err,
        );
      });

    return () => {
      isMounted = false;
      unsubscribeSync();
    };
  }, []);

  /**
   * Save or Update a Bill in Hold Bills (Email Draft pattern)
   */
  const holdBill = (billData, existingDraftId = null) => {
    const draftId =
      existingDraftId ||
      activeResumedDraft?.holdId ||
      activeResumedDraft?.billNo;
    const now = new Date();
    const formattedDate =
      now.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }) +
      ", " +
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Generate items summary preview (e.g. "Azithromycin 500mg Tablets (2), Dolo 650 (1)")
    const itemsSummary =
      (billData.items || [])
        .map((item) => `${item.name} (${item.qty})`)
        .slice(0, 2)
        .join(", ") + ((billData.items || []).length > 2 ? "..." : "");

    if (draftId) {
      // Update existing draft
      setHeldBills((prev) =>
        prev.map((b) => {
          if (b.holdId === draftId || b.billNo === draftId) {
            return {
              ...b,
              customerName:
                billData.customerName || b.customerName || "Walk-in Customer",
              customerPhone: billData.customerPhone || b.customerPhone || "",
              itemsCount: (billData.items || []).reduce(
                (acc, it) => acc + (it.qty || 1),
                0,
              ),
              itemsSummary: itemsSummary || b.itemsSummary,
              subtotal: billData.subtotal ?? b.subtotal,
              tax: billData.tax ?? b.tax,
              discountPercent: billData.discountPercent ?? b.discountPercent,
              total: billData.total ?? b.total,
              heldAt: formattedDate,
              items: [...(billData.items || [])],
              note: billData.note || b.note || "Draft updated in POS",
            };
          }
          return b;
        }),
      );
      setActiveResumedDraft(null);
      return draftId;
    } else {
      // Create new draft ID (e.g. HB-0009)
      const nextNum =
        heldBills.length > 0
          ? Math.max(
              ...heldBills.map((b) =>
                parseInt(
                  (b.billNo || b.holdId || "HB-0000").replace(/[^0-9]/g, "") ||
                    "0",
                  10,
                ),
              ),
            ) + 1
          : 9;
      const newBillNo = `HB-00${nextNum < 10 ? "0" + nextNum : nextNum}`;

      const newDraft = {
        holdId: newBillNo,
        billNo: newBillNo,
        token: newBillNo,
        customerName: billData.customerName || "Walk-in Customer",
        customerPhone: billData.customerPhone || "",
        itemsCount: (billData.items || []).reduce(
          (acc, it) => acc + (it.qty || 1),
          0,
        ),
        itemsSummary: itemsSummary || "No items",
        subtotal: billData.subtotal || 0,
        tax: billData.tax || 0,
        discountPercent: billData.discountPercent || 0,
        total: billData.total || 0,
        heldAt: formattedDate,
        heldBy: "Cashier 01",
        status: "Hold",
        branch: "Main Branch",
        note: billData.note || "Saved as draft from New Sale",
        items: [...(billData.items || [])],
      };

      setHeldBills((prev) => [newDraft, ...prev]);
      setActiveResumedDraft(null);
      return newBillNo;
    }
  };

  /**
   * Resume a Held Draft into POS
   */
  const resumeDraftBill = (draftIdOrBillNo) => {
    const draft = heldBills.find(
      (b) => b.holdId === draftIdOrBillNo || b.billNo === draftIdOrBillNo,
    );
    if (draft) {
      setActiveResumedDraft(draft);
      return draft;
    }
    return null;
  };

  /**
   * Close/Dismiss the active resumed draft banner
   */
  const closeResumedDraft = () => {
    setActiveResumedDraft(null);
  };

  /**
   * Discard/Delete a single draft
   */
  const discardHeldBill = (draftId) => {
    setHeldBills((prev) =>
      prev.filter((b) => b.holdId !== draftId && b.billNo !== draftId),
    );
    if (
      activeResumedDraft?.holdId === draftId ||
      activeResumedDraft?.billNo === draftId
    ) {
      setActiveResumedDraft(null);
    }
  };

  /**
   * Clear all drafts
   */
  const clearAllHeldBills = () => {
    setHeldBills([]);
    setActiveResumedDraft(null);
  };

  /**
   * Finalize a Sale (Pay Now):
   * - Deducts stock from products
   * - If an active draft was resumed, removes it from heldBills
   * - Adds completed invoice to invoices list
   */
  const finalizeSale = async (saleData) => {
    // 1. Prepare invoice details
    const newInvNo =
      saleData.invoiceNo || `INV-${Math.floor(1026 + Math.random() * 8000)}`;
    const now = new Date();
    const dateStr =
      now.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }) +
      ", " +
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const newInvoice = {
      invoiceNo: newInvNo,
      date: dateStr,
      customer: saleData.customer || "Walk-in Customer",
      phone: saleData.customerPhone || "—",
      paymentMode: saleData.paymentMode || "Cash",
      subtotal: saleData.subtotal || 0,
      tax: saleData.tax || 0,
      total: saleData.total || 0,
      status: "Completed",
      cashier: saleData.cashier || "Cashier 01",
      branch: saleData.branch || "Main Branch",
      items: saleData.items || [],
    };

    // 2. AWAIT ATOMIC LOCAL COMMIT:
    // transactions write + sync_outbox write + local inventory projection
    // ONLY THEN is sale considered locally completed!
    await localPersistenceService.commitLocalSale({
      ...saleData,
      invoiceNo: newInvNo,
    });

    // Opportunistically push to server if online (non-blocking)
    syncEngine?.sync?.().catch(() => {});

    // 3. Update React UI state (stock, drafts, invoices) ONLY after local DB succeeds
    setProducts((prev) => {
      const copy = [...prev];
      (saleData.items || []).forEach((cartItem) => {
        const pIdx = copy.findIndex(
          (p) => p.id === cartItem.id || p.name === cartItem.name,
        );
        if (pIdx > -1) {
          copy[pIdx] = {
            ...copy[pIdx],
            stock: Math.max(0, (copy[pIdx].stock || 0) - (cartItem.qty || 1)),
          };
        }
      });
      return copy;
    });

    const draftIdToRemove =
      saleData.draftId ||
      activeResumedDraft?.holdId ||
      activeResumedDraft?.billNo;
    if (draftIdToRemove) {
      setHeldBills((prev) =>
        prev.filter(
          (b) => b.holdId !== draftIdToRemove && b.billNo !== draftIdToRemove,
        ),
      );
      setActiveResumedDraft(null);
    }

    setInvoices((prev) => [newInvoice, ...prev]);
    return newInvoice;
  };

  /**
   * Process a Return and refund:
   * - Adds credit note / return entry to returnHistory
   * - Restores stock if stockDisposition is 'Sellable'
   */
  const processReturnRefund = async (returnData) => {
    const returnNo = `RET-2026-${Math.floor(105 + Math.random() * 800)}`;
    const now = new Date();
    const dateStr =
      now.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }) +
      ", " +
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const newReturnRecord = {
      returnNo,
      originalInvoice: returnData.originalInvoice,
      customer: returnData.customer,
      date: dateStr,
      amount: returnData.refundAmount,
      refundMode: returnData.refundMode,
      reason: returnData.reason,
      stockDisposition: returnData.stockDisposition,
      itemsCount: returnData.returnedItems?.length || 0,
      items: returnData.returnedItems || [],
    };

    // 1. AWAIT ATOMIC LOCAL COMMIT:
    // transactions write + sync_outbox write + local inventory projection
    // ONLY THEN is return considered locally completed!
    await localPersistenceService.recordLocalReturn({
      returnNumber: returnNo,
      invoiceId: returnData.invoiceId,
      customerId: returnData.customerId,
      refundAmount: Number(returnData.refundAmount || 0),
      refundMethod:
        returnData.refundMode === "Store Credit" ||
        returnData.refundMode === "STORE_CREDIT"
          ? "STORE_CREDIT"
          : "CASH",
      reason: returnData.reason,
      notes:
        returnData.notes ||
        `Return for ${returnData.originalInvoice || "invoice"}`,
      items: (returnData.returnedItems || []).map((it) => ({
        invoiceItemId: it.invoiceItemId,
        productId: it.productId || it.id,
        batchNumber: it.batchNumber || it.batch || "BAT-RET",
        quantityReturned: Number(it.qty || it.quantity || 1),
        refundAmount:
          Number(it.refundPrice || it.price || 0) * Number(it.qty || 1),
        returnCondition:
          returnData.stockDisposition === "Sellable" ? "SEALED" : "DAMAGED",
        restockQuantity:
          returnData.stockDisposition === "Sellable" ? Number(it.qty || 1) : 0,
      })),
    });

    // Opportunistically push to server if online (non-blocking)
    syncEngine?.sync?.().catch(() => {});

    // 2. Update React UI state (stock, return history) ONLY after local DB succeeds
    if (returnData.stockDisposition === "Sellable") {
      setProducts((prev) => {
        const copy = [...prev];
        (returnData.returnedItems || []).forEach((item) => {
          const pIdx = copy.findIndex((p) => p.name === item.name);
          if (pIdx > -1) {
            copy[pIdx] = {
              ...copy[pIdx],
              stock: (copy[pIdx].stock || 0) + (item.qty || 1),
            };
          }
        });
        return copy;
      });
    }

    setReturnHistory((prev) => [newReturnRecord, ...prev]);
    return newReturnRecord;
  };

  return (
    <PosContext.Provider
      value={{
        products,
        setProducts,
        heldBills,
        activeResumedDraft,
        invoices,
        returnHistory,
        holdBill,
        resumeDraftBill,
        closeResumedDraft,
        discardHeldBill,
        clearAllHeldBills,
        finalizeSale,
        processReturnRefund,
        syncState,
        triggerSync: (resetRetries = false) =>
          typeof syncEngine?.syncNow === "function"
            ? syncEngine.syncNow(resetRetries)
            : Promise.resolve(),
        setSyncAuthToken: (token) =>
          typeof syncEngine?.setAuthToken === "function"
            ? syncEngine.setAuthToken(token)
            : undefined,
        setSyncTenantContext: (orgId, branchId) =>
          typeof syncEngine?.setTenantContext === "function"
            ? syncEngine.setTenantContext(orgId, branchId)
            : undefined,
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

export function usePos() {
  const context = useContext(PosContext);
  if (!context) {
    throw new Error("usePos must be used within a PosProvider");
  }
  return context;
}

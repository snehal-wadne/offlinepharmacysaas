import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  MOCK_POS_PRODUCTS,
  MOCK_HELD_BILLS,
  MOCK_RECENT_INVOICES,
} from '../data/cashierMockData';
import {
  fetchCashierProducts,
  fetchHeldBills,
  fetchRecentInvoices,
  createPosSale,
} from '../api/cashierApi';

const PosContext = createContext(null);

export function PosProvider({ children }) {
  const [products, setProducts] = useState(MOCK_POS_PRODUCTS);
  const [heldBills, setHeldBills] = useState(MOCK_HELD_BILLS);
  const [activeResumedDraft, setActiveResumedDraft] = useState(null);
  const [invoices, setInvoices] = useState(MOCK_RECENT_INVOICES);

  // Hydrate live products, held bills, and recent invoices from PostgreSQL backend
  useEffect(() => {
    let isMounted = true;
    async function hydratePosData() {
      try {
        const [liveProds, liveHeld, liveInvs] = await Promise.all([
          fetchCashierProducts(),
          fetchHeldBills(),
          fetchRecentInvoices(),
        ]);
        if (isMounted) {
          if (liveProds && Array.isArray(liveProds) && liveProds.length > 0) {
            setProducts(liveProds);
          }
          if (liveHeld && Array.isArray(liveHeld) && liveHeld.length > 0) {
            setHeldBills(liveHeld);
          }
          if (liveInvs && Array.isArray(liveInvs) && liveInvs.length > 0) {
            setInvoices(liveInvs);
          }
        }
      } catch (err) {
        console.warn('POS live hydration fallback to offline cache:', err.message);
      }
    }
    hydratePosData();
    return () => { isMounted = false; };
  }, []);
  const [returnHistory, setReturnHistory] = useState([
    {
      returnNo: 'RET-2026-104',
      originalInvoice: 'INV-1020',
      date: '27 Aug 2026, 04:30 PM',
      customer: 'Suresh Patil',
      amount: 158.0,
      refundMode: 'Cash',
      reason: 'Doctor altered prescription',
      stockDisposition: 'Sellable',
      itemsCount: 1,
      items: [{ name: 'Pan 40 Tablets', qty: 1, refundPrice: 158.0 }],
    },
  ]);

  /**
   * Save or Update a Bill in Hold Bills (Email Draft pattern)
   */
  const holdBill = (billData, existingDraftId = null) => {
    const draftId = existingDraftId || activeResumedDraft?.holdId || activeResumedDraft?.billNo;
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }) + ', ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Generate items summary preview (e.g. "Azithromycin 500mg Tablets (2), Dolo 650 (1)")
    const itemsSummary = (billData.items || [])
      .map((item) => `${item.name} (${item.qty})`)
      .slice(0, 2)
      .join(', ') + ((billData.items || []).length > 2 ? '...' : '');

    if (draftId) {
      // Update existing draft
      setHeldBills((prev) =>
        prev.map((b) => {
          if (b.holdId === draftId || b.billNo === draftId) {
            return {
              ...b,
              customerName: billData.customerName || b.customerName || 'Walk-in Customer',
              customerPhone: billData.customerPhone || b.customerPhone || '',
              itemsCount: (billData.items || []).reduce((acc, it) => acc + (it.qty || 1), 0),
              itemsSummary: itemsSummary || b.itemsSummary,
              subtotal: billData.subtotal ?? b.subtotal,
              tax: billData.tax ?? b.tax,
              discountPercent: billData.discountPercent ?? b.discountPercent,
              total: billData.total ?? b.total,
              heldAt: formattedDate,
              items: [...(billData.items || [])],
              note: billData.note || b.note || 'Draft updated in POS',
            };
          }
          return b;
        })
      );
      setActiveResumedDraft(null);
      return draftId;
    } else {
      // Create new draft ID (e.g. HB-0009)
      const nextNum = heldBills.length > 0
        ? Math.max(...heldBills.map((b) => parseInt((b.billNo || b.holdId || 'HB-0000').replace(/[^0-9]/g, '') || '0', 10))) + 1
        : 9;
      const newBillNo = `HB-00${nextNum < 10 ? '0' + nextNum : nextNum}`;

      const newDraft = {
        holdId: newBillNo,
        billNo: newBillNo,
        token: newBillNo,
        customerName: billData.customerName || 'Walk-in Customer',
        customerPhone: billData.customerPhone || '',
        itemsCount: (billData.items || []).reduce((acc, it) => acc + (it.qty || 1), 0),
        itemsSummary: itemsSummary || 'No items',
        subtotal: billData.subtotal || 0,
        tax: billData.tax || 0,
        discountPercent: billData.discountPercent || 0,
        total: billData.total || 0,
        heldAt: formattedDate,
        heldBy: 'Cashier 01',
        status: 'Hold',
        branch: 'Main Branch',
        note: billData.note || 'Saved as draft from New Sale',
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
      (b) => b.holdId === draftIdOrBillNo || b.billNo === draftIdOrBillNo
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
    setHeldBills((prev) => prev.filter((b) => b.holdId !== draftId && b.billNo !== draftId));
    if (activeResumedDraft?.holdId === draftId || activeResumedDraft?.billNo === draftId) {
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
  const finalizeSale = (saleData) => {
    // 1. Deduct stock
    setProducts((prev) => {
      const copy = [...prev];
      (saleData.items || []).forEach((cartItem) => {
        const pIdx = copy.findIndex((p) => p.id === cartItem.id || p.name === cartItem.name);
        if (pIdx > -1) {
          copy[pIdx] = {
            ...copy[pIdx],
            stock: Math.max(0, (copy[pIdx].stock || 0) - (cartItem.qty || 1)),
          };
        }
      });
      return copy;
    });

    // 2. Remove draft if this was completing a held draft
    const draftIdToRemove = saleData.draftId || activeResumedDraft?.holdId || activeResumedDraft?.billNo;
    if (draftIdToRemove) {
      setHeldBills((prev) => prev.filter((b) => b.holdId !== draftIdToRemove && b.billNo !== draftIdToRemove));
      setActiveResumedDraft(null);
    }

    // 3. Create completed invoice
    const newInvNo = saleData.invoiceNo || `INV-${Math.floor(1026 + Math.random() * 8000)}`;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }) + ', ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newInvoice = {
      invoiceNo: newInvNo,
      date: dateStr,
      customer: saleData.customer || 'Walk-in Customer',
      phone: saleData.customerPhone || '—',
      paymentMode: saleData.paymentMode || 'Cash',
      subtotal: saleData.subtotal || 0,
      tax: saleData.tax || 0,
      total: saleData.total || 0,
      status: 'Completed',
      cashier: 'Cashier 01',
      branch: 'Main Branch',
      items: saleData.items || [],
    };

    setInvoices((prev) => [newInvoice, ...prev]);
    return newInvoice;
  };

  /**
   * Process a Return and refund:
   * - Adds credit note / return entry to returnHistory
   * - Restores stock if stockDisposition is 'Sellable'
   */
  const processReturnRefund = (returnData) => {
    const returnNo = `RET-2026-${Math.floor(105 + Math.random() * 800)}`;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }) + ', ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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

    // If Sellable, restore stock
    if (returnData.stockDisposition === 'Sellable') {
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
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

export function usePos() {
  const context = useContext(PosContext);
  if (!context) {
    throw new Error('usePos must be used within a PosProvider');
  }
  return context;
}

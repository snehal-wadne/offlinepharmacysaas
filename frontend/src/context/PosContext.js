import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  fetchCashierProducts,
  fetchHeldBills,
  removeHeldBillRemote,
  fetchRecentInvoices,
  fetchReturnHistory,
  createPosSale,
} from "../api/cashierApi";
import { fetchCustomers } from "../api/customerApi";
import { localPersistenceService } from "../db";
import { syncEngine, bootstrapService } from "../sync";
import { getAccessToken } from "../api/supabaseClient";

const PosContext = createContext(null);

export function PosProvider({
  children,
  currentUser,
  selectedBranch = "All Branches",
}) {
  const effectiveOrgId = currentUser?.organisationId || null;
  const effectiveBranchId = currentUser?.branchId || null;
  const effectiveUserId = currentUser?.id || null;
  const effectiveToken = currentUser?.token || null;

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [activeBranch, setActiveBranch] = useState(
    selectedBranch && selectedBranch !== "All Branches" ? selectedBranch : null,
  );
  const [taxConfig, setTaxConfig] = useState(null);
  const [heldBills, setHeldBills] = useState(() => {
    try {
      const raw = window.localStorage?.getItem("pharma_local_held_bills");
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  });
  const [activeResumedDraft, setActiveResumedDraft] = useState(null);

  // Keep parked bills across refreshes and offline sessions.
  useEffect(() => {
    try {
      window.localStorage?.setItem("pharma_local_held_bills", JSON.stringify(heldBills));
    } catch (e) {}
  }, [heldBills]);
  const [invoices, setInvoices] = useState([]);
  const [returnHistory, setReturnHistory] = useState([]);
  const [syncState, setSyncState] = useState(
    typeof syncEngine?.getState === "function"
      ? syncEngine.getState()
      : { status: "IDLE", isOnline: true },
  );

  // Sync activeBranch with selectedBranch from navigation
  useEffect(() => {
    if (selectedBranch && selectedBranch !== "All Branches") {
      setActiveBranch(selectedBranch);
    } else {
      setActiveBranch(null);
    }
  }, [selectedBranch]);

  // Hydrate live products, held bills, and recent invoices from PostgreSQL backend
  useEffect(() => {
    // Zero-branch guard: do NOT make cashier API calls if user has no branch or branch is not active
    if (
      !currentUser ||
      currentUser.hasBranch === false ||
      !currentUser.branchId
    ) {
      return;
    }
    if (selectedBranch === "No Active Branch") {
      return;
    }

    let isMounted = true;
    async function hydratePosData() {
      try {
        // selectedBranch is the header's explicit choice (null/"All Branches"
        // means show every branch) — it must NOT silently fall back to the
        // user's own assigned branch, or "All Branches" would keep scoping
        // to a single branch behind the scenes.
        const rawBranch =
          typeof selectedBranch === "object" && selectedBranch !== null
            ? selectedBranch.id
            : selectedBranch;
        const branchParam =
          rawBranch &&
          rawBranch !== "All Branches" &&
          rawBranch !== "all" &&
          rawBranch !== "No Active Branch"
            ? rawBranch
            : "";
        const [liveProds, liveHeld, liveInvs, liveReturns, liveCustomers] = await Promise.all([
          fetchCashierProducts("", "", branchParam),
          fetchHeldBills(),
          fetchRecentInvoices(20, branchParam),
          fetchReturnHistory ? fetchReturnHistory() : Promise.resolve([]),
          fetchCustomers ? fetchCustomers() : Promise.resolve([]),
        ]);
        if (isMounted) {
          let prodsToSet = Array.isArray(liveProds) ? liveProds : [];
          if (prodsToSet.length === 0) {
            try {
              const cachedProds = await localPersistenceService.getCatalogForPos(
                effectiveOrgId,
                branchParam || "BRANCH-MAIN",
              );
              if (cachedProds && cachedProds.length > 0) {
                prodsToSet = cachedProds;
              }
            } catch (_) {}
          }
          setProducts(prodsToSet);

          const rawCusts = Array.isArray(liveCustomers?.data?.data)
            ? liveCustomers.data.data
            : Array.isArray(liveCustomers?.data)
              ? liveCustomers.data
              : Array.isArray(liveCustomers)
                ? liveCustomers
                : [];
          setCustomers(
            rawCusts.map((c) => ({
              id: c.id,
              name: c.name || c.full_name || "Customer",
              phone: c.phone || c.mobile || "",
              currentBalance:
                c.currentBalance ||
                `₹${parseFloat(c.balance || c.outstandingBalance || 0).toFixed(2)}`,
              category: c.category || "Regular",
            })),
          );
          const serverHeld = (Array.isArray(liveHeld) ? liveHeld : []).map(mapServerHeld);
          setHeldBills((prev) => mergeHeld(prev, serverHeld));

          let invsToSet = Array.isArray(liveInvs) ? liveInvs : [];
          if (invsToSet.length === 0) {
            try {
              const cachedInvs = await localPersistenceService.getRecentInvoices(
                branchParam || "BRANCH-MAIN",
                20,
                effectiveOrgId,
              );
              if (cachedInvs && cachedInvs.length > 0) {
                invsToSet = cachedInvs;
              }
            } catch (_) {}
          }
          setInvoices(
            invsToSet.map((inv) => ({
              ...inv,
              total: parseFloat(inv.total) || Number(inv.total) || 0,
              subtotal:
                parseFloat(inv.subtotal) || Number(inv.subtotal) || 0,
              tax: parseFloat(inv.tax) || Number(inv.tax) || 0,
              discount:
                parseFloat(inv.discount) || Number(inv.discount) || 0,
            })),
          );
          setReturnHistory(Array.isArray(liveReturns) ? liveReturns : []);
        }
      } catch (err) {
        console.warn(
          "POS live hydration fallback to offline cache:",
          err.message,
        );
        if (isMounted) {
          try {
            const cachedProds = await localPersistenceService.getCatalogForPos(
              effectiveOrgId,
              branchParam || "BRANCH-MAIN",
            );
            if (cachedProds && cachedProds.length > 0) {
              setProducts(cachedProds);
            }
            const cachedInvs = await localPersistenceService.getRecentInvoices(
              branchParam || "BRANCH-MAIN",
              20,
              effectiveOrgId,
            );
            if (cachedInvs && cachedInvs.length > 0) {
              setInvoices(cachedInvs);
            }
          } catch (_) {}
        }
      }
    }
    hydratePosData();
    return () => {
      isMounted = false;
    };
  }, [selectedBranch]);

  // Initialize local persistence layer and restore recent invoices
  useEffect(() => {
    let isMounted = true;

    // If an authenticated user tenant exists, configure persistence and sync engine for that tenant
    if (effectiveOrgId) {
      if (typeof localPersistenceService?.setTenantContext === "function") {
        localPersistenceService.setTenantContext(
          effectiveOrgId,
          effectiveBranchId || "BRANCH-MAIN",
          effectiveUserId || "USER-CASHIER-01",
        );
      }
      if (typeof syncEngine?.setTenantContext === "function") {
        syncEngine.setTenantContext(
          effectiveOrgId,
          effectiveBranchId || "BRANCH-MAIN",
        );
      }
      (async () => {
        const tokenToUse =
          effectiveToken || (await getAccessToken().catch(() => null));
        if (tokenToUse && typeof syncEngine?.setAuthToken === "function") {
          syncEngine.setAuthToken(tokenToUse);
        }

        // Background online master data bootstrap for this authenticated tenant
        if (typeof bootstrapService?.bootstrap === "function") {
          bootstrapService
            .bootstrap({
              organisationId: effectiveOrgId,
              branchId: effectiveBranchId,
              authToken: tokenToUse,
            })
            .then(async (result) => {
              if (isMounted && result && result.success) {
                const freshProducts =
                  await localPersistenceService.getCatalogForPos?.(
                    effectiveOrgId,
                    effectiveBranchId,
                  );
                if (isMounted && freshProducts && freshProducts.length > 0) {
                  setProducts(freshProducts);
                  setIsOfflineReady(true);
                }
                const freshCustomers =
                  await localPersistenceService.getCustomersForPos?.(
                    effectiveOrgId,
                  );
                if (isMounted && freshCustomers && freshCustomers.length > 0) {
                  setCustomers(
                    freshCustomers.map((c) => ({
                      id: c.customerId,
                      name: c.name,
                      phone: c.phone || "",
                      currentBalance: `₹${Number(c.outstandingBalance || 0).toFixed(2)}`,
                      outstandingBalance: Number(c.outstandingBalance || 0),
                    })),
                  );
                }
              }
            })
            .catch((bErr) => {
              console.log(
                "[PosContext] Online bootstrap skipped/offline:",
                bErr?.message,
              );
            });
        }
      })();

      // Load cached offline projection from Dexie for this authenticated tenant
      if (typeof localPersistenceService?.initialize === "function") {
        localPersistenceService
          .initialize(effectiveOrgId, effectiveBranchId, {
            seedMockIfEmpty: false,
          })
          .then(async () => {
            try {
              const persistedInvoices =
                await localPersistenceService.getRecentInvoices(
                  effectiveBranchId,
                  50,
                  effectiveOrgId,
                );
              if (
                isMounted &&
                persistedInvoices &&
                persistedInvoices.length > 0
              ) {
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

              const persistedProducts =
                await localPersistenceService.getCatalogForPos?.(
                  effectiveOrgId,
                  effectiveBranchId,
                );
              if (
                isMounted &&
                persistedProducts &&
                persistedProducts.length > 0
              ) {
                setProducts(persistedProducts);
                setIsOfflineReady(true);
              }

              const persistedCustomers =
                await localPersistenceService.getCustomersForPos?.(
                  effectiveOrgId,
                );
              if (
                isMounted &&
                persistedCustomers &&
                persistedCustomers.length > 0
              ) {
                setCustomers(
                  persistedCustomers.map((c) => ({
                    id: c.customerId,
                    name: c.name,
                    phone: c.phone || "",
                    currentBalance: `₹${Number(c.outstandingBalance || 0).toFixed(2)}`,
                    outstandingBalance: Number(c.outstandingBalance || 0),
                  })),
                );
              }
            } catch (err) {
              console.warn(
                "[PosContext] Could not load persisted data from IndexedDB:",
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
      }
    } else {
      setProducts([]);
      setIsOfflineReady(false);
    }

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

    return () => {
      isMounted = false;
      unsubscribeSync();
    };
  }, [
    effectiveOrgId,
    effectiveBranchId,
    effectiveUserId,
    effectiveToken,
    // Re-load products, invoices and held bills when the header's branch changes
    typeof selectedBranch === "object" && selectedBranch !== null ? selectedBranch.id : selectedBranch,
  ]);

  /**
   * Save or Update a Bill in Hold Bills (Email Draft pattern)
   */
  const holdBill = (billData, existingDraftId = null, meta = {}) => {
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
              customerId: billData.customerId ?? b.customerId ?? null,
              items: [...(billData.items || [])],
              note: billData.note || b.note || "Draft updated in POS",
              localOnly: meta.synced ? false : b.localOnly ?? true,
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
      const newBillNo = meta.id || `HB-00${nextNum < 10 ? "0" + nextNum : nextNum}`;

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
        customerId: billData.customerId || null,
        items: [...(billData.items || [])],
        localOnly: !meta.synced,
      };

      setHeldBills((prev) => [newDraft, ...prev]);
      setActiveResumedDraft(null);
      return newBillNo;
    }
  };

  /** Re-read drafts from the server (merged with those parked on this device). */
  const refreshHeldBills = async () => {
    try {
      const live = await fetchHeldBills();
      setHeldBills((prev) => mergeHeld(prev, (Array.isArray(live) ? live : []).map(mapServerHeld)));
    } catch (e) {
      console.warn("[PosContext] held bills refresh failed:", e?.message);
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
    const target = heldBills.find((b) => b.holdId === draftId || b.billNo === draftId);
    if (target && !target.localOnly) removeHeldBillRemote(target.holdId || target.billNo);
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
    const now = new Date();
    // Date + time-of-day + random digit: unique enough to avoid two offline sales sharing a number.
    const two = (n) => String(n).padStart(2, "0");
    const newInvNo =
      saleData.invoiceNo ||
      `INV-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}${Math.floor(Math.random() * 100)
        .toString()
        .padStart(2, "0")}`;
    const cashierLabel =
      saleData.cashier && saleData.cashier !== "Cashier 01"
        ? saleData.cashier
        : currentUser?.name || "Cashier";
    const branchLabel =
      saleData.branch && saleData.branch !== "Main Branch"
        ? saleData.branch
        : activeBranch?.name || currentUser?.branchName || "Main Branch";
    const dateStr =
      now.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }) +
      ", " +
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const custName =
      saleData.customerName ||
      saleData.customer ||
      "Walk-in Customer";
    const custPhone =
      saleData.customerPhone || saleData.phone || "";

    let newInvoice = {
      invoiceNo: newInvNo,
      date: dateStr,
      customer: custName,
      customerName: custName,
      phone: custPhone,
      customerPhone: custPhone,
      paymentMode: saleData.paymentMode || "Cash",
      subtotal: saleData.subtotal || 0,
      tax: saleData.tax || 0,
      total: saleData.total || 0,
      status: "Completed",
      cashier: cashierLabel,
      branch: branchLabel,
      items: saleData.items || [],
      upiRefNumber: saleData.upiRefNumber || null,
      attachedPrescription: saleData.attachedPrescription || null,
    };

    // 2. Commit Sale Online Directly to Backend if available
    let committedOnline = false;
    try {
      const onlineSaleRes = await createPosSale({
        items: (saleData.items || []).map((it) => ({
          productId: it.productId || it.id,
          batchId: it.batchId,
          name: it.name || it.medicineName,
          batch: it.batch || it.batchNo,
          qty: it.qty || it.quantity || 1,
          price: it.sellingPrice || it.price || it.mrp || 0,
          lineTotal:
            (it.sellingPrice || it.price || it.mrp || 0) *
            (it.qty || it.quantity || 1),
        })),
        customerId: saleData.customerId || null,
        customerName: custName,
        customerPhone: custPhone,
        paymentMethod: saleData.paymentMode || "CASH",
        subtotal: saleData.subtotal,
        discount: saleData.discountAmount || 0,
        tax: saleData.tax,
        total: saleData.total,
        branchId: activeBranch?.id || effectiveBranchId || undefined,
        notes: saleData.notes,
      });

      if (onlineSaleRes) {
        committedOnline = true;
        newInvoice = {
          ...newInvoice,
          invoiceNo:
            onlineSaleRes.invoiceNo ||
            onlineSaleRes.invoiceNumber ||
            newInvNo,
          total: parseFloat(onlineSaleRes.total) || newInvoice.total,
          customer: onlineSaleRes.customerName || custName,
          customerName: onlineSaleRes.customerName || custName,
          phone: onlineSaleRes.customerPhone || custPhone,
          customerPhone: onlineSaleRes.customerPhone || custPhone,
          status: "Completed",
          syncStatus: "SYNCED",
        };
      }
    } catch (onlineErr) {
      console.warn("Online createPosSale failed, proceeding with local offline commit:", onlineErr?.message);
    }

    // 2b. Always commit atomically to local persistence (IndexedDB transactions & local inventory batches)
    // When online: commits locally with alreadySynced: true (updates local ledger & stock without re-queueing)
    // When offline: commits locally with alreadySynced: false (enqueues durable CREATE_SALE mutation in sync_outbox)
    try {
      await localPersistenceService.commitLocalSale(
        {
          ...saleData,
          invoiceNo: newInvoice.invoiceNo,
          total: newInvoice.total,
          customer: custName,
          phone: custPhone,
        },
        {
          organisationId: effectiveOrgId,
          branchId: activeBranch?.id || effectiveBranchId,
          userId: effectiveUserId,
          alreadySynced: committedOnline,
        }
      );
      if (!committedOnline) {
        newInvoice.status = "Local (Pending Sync)";
        newInvoice.syncStatus = "PENDING";
        newInvoice.isOffline = true;
      }
    } catch (localErr) {
      console.warn("Local persistence commit failed:", localErr?.message);
      // Neither the server nor this device has the sale: don't show it as completed.
      if (!committedOnline) {
        throw new Error(`The sale could not be saved on this device (${localErr?.message}). Nothing was deducted.`);
      }
    }

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
      const paidDraft = heldBills.find((b) => b.holdId === draftIdToRemove || b.billNo === draftIdToRemove);
      if (paidDraft && !paidDraft.localOnly) removeHeldBillRemote(draftIdToRemove);
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
    syncEngine?.sync?.().catch((err) => {
      console.error("Sync failed:", err);
    });

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

  const bootstrapTenantData = async ({
    organisationId,
    branchId,
    authToken,
    baseUrl,
  }) => {
    if (!bootstrapService?.bootstrap) {
      throw new Error("Bootstrap service not available");
    }
    const tokenToUse =
      authToken || effectiveToken || (await getAccessToken().catch(() => null));
    const result = await bootstrapService.bootstrap({
      organisationId,
      branchId,
      authToken: tokenToUse,
      baseUrl,
    });
    if (typeof localPersistenceService?.setTenantContext === "function") {
      localPersistenceService.setTenantContext(organisationId, branchId);
    }
    if (typeof syncEngine?.setTenantContext === "function") {
      syncEngine.setTenantContext(organisationId, branchId);
    }
    if (tokenToUse && typeof syncEngine?.setAuthToken === "function") {
      syncEngine.setAuthToken(tokenToUse);
    }
    const loadedProducts = await localPersistenceService.getCatalogForPos(
      organisationId,
      branchId,
    );
    if (loadedProducts && loadedProducts.length > 0) {
      setProducts(loadedProducts);
      setIsOfflineReady(true);
    }
    const loadedCustomers =
      await localPersistenceService.getCustomersForPos(organisationId);
    if (loadedCustomers && loadedCustomers.length > 0) {
      setCustomers(
        loadedCustomers.map((c) => ({
          id: c.customerId,
          name: c.name,
          phone: c.phone || "",
          currentBalance: `₹${Number(c.outstandingBalance || 0).toFixed(2)}`,
          outstandingBalance: Number(c.outstandingBalance || 0),
        })),
      );
    }
    if (result.branch) setActiveBranch(result.branch);
    if (result.taxConfig) setTaxConfig(result.taxConfig);
    return result;
  };

  return (
    <PosContext.Provider
      value={{
        products,
        setProducts,
        customers,
        setCustomers,
        isOfflineReady,
        activeBranch,
        taxConfig,
        bootstrapTenantData,
        heldBills,
        activeResumedDraft,
        invoices,
        returnHistory,
        holdBill,
        resumeDraftBill,
        closeResumedDraft,
        discardHeldBill,
        clearAllHeldBills,
        refreshHeldBills,
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

// Server held-bill row -> the draft shape the screens use.
function mapServerHeld(b) {
  return {
    ...b,
    holdId: b.holdId || b.billNo,
    total: parseFloat(b.total) || Number(b.total) || 0,
    subtotal: parseFloat(b.subtotal) || Number(b.subtotal) || 0,
    tax: parseFloat(b.tax) || Number(b.tax) || 0,
    items: Array.isArray(b.items) ? b.items : Array.isArray(b.cart) ? b.cart : [],
    itemsCount:
      parseInt(b.itemsCount, 10) ||
      (Array.isArray(b.items) ? b.items.length : 0) ||
      (Array.isArray(b.cart) ? b.cart.length : 0) ||
      0,
    customerPhone: b.customerPhone || b.phone || "",
    heldAt:
      b.heldAt ||
      (b.savedAt
        ? new Date(b.savedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
          ", " +
          new Date(b.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "Recently"),
  };
}

// Server drafts + drafts that only exist on this device (never dropped by a refresh).
function mergeHeld(prev, serverHeld) {
  const serverIds = new Set(serverHeld.map((b) => b.holdId || b.billNo));
  const deviceOnly = prev.filter((b) => b.localOnly && !serverIds.has(b.holdId || b.billNo));
  return [...deviceOnly, ...serverHeld];
}

export function usePos() {
  const context = useContext(PosContext);
  if (!context) {
    throw new Error("usePos must be used within a PosProvider");
  }
  return context;
}

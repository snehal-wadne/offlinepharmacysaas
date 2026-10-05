import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Platform,
  Modal,
  Linking,
} from "react-native";
import InventoryStatCard from "../../components/inventory/InventoryStatCard";
import {
  SkeletonKpiCard,
  SkeletonTableRow,
  SkeletonItemCard,
} from "../../components/common/SkeletonLoader";
import PaginationControls from "../../components/common/PaginationControls";
import {
  fetchInventory,
  saveInventoryEntry,
  updateInventoryEntry,
  deleteInventoryEntry,
  recordStockMovementApi,
  fetchItemBarcode,
  updateItemStatusApi,
  updateItemRxApi,
} from "../../api/inventoryApi";
import { fetchBranches } from "../../api/branchApi";
import { fetchCashierProducts } from "../../api/cashierApi";
import { notifySupplierApi, fetchSuppliers } from "../../api/purchaseApi";
import { API_URL } from "../../config";
import { localPersistenceService } from "../../db";
import { syncEngine } from "../../sync";
import { usePos } from "../../context/PosContext";
import BulkImportModal from "../../components/inventory/BulkImportModal";
import BarcodeScannerModal from "../../components/common/BarcodeScannerModal";
import { generateOfflineBarcodeSvg, generateOfflineQRCodeSvg } from "../../utils/qrGenerator";

export default function StockAdjustmentsScreen({
  onShowToast,
  isMultiBranch = true,
  selectedBranch = "All Branches",
}) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Shared POS product catalog so a newly added/edited medicine is
  // searchable in New Sale immediately, without waiting for a reload.
  const { setProducts: setPosProducts } = usePos();
  const refreshPosCatalog = async () => {
    try {
      const rawBranch =
        typeof selectedBranch === "object" && selectedBranch !== null
          ? selectedBranch.id
          : selectedBranch;
      const freshProducts = await fetchCashierProducts("", "", rawBranch);
      if (Array.isArray(freshProducts) && freshProducts.length > 0) {
        setPosProducts(freshProducts);
      }
    } catch (err) {
      console.warn("Failed to refresh POS catalog:", err.message);
    }
  };

  // Stock Items State for Adjustments Table with isActive and rxRequired flags
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);
  // Barcode scanner and scanned product details
  const [scannerOpen, setScannerOpen] = useState(false);
  const [formScannerOpen, setFormScannerOpen] = useState(false);
  const [scannedProducts, setScannedProducts] = useState([]);
  const [scannedCode, setScannedCode] = useState("");
  const [scanError, setScanError] = useState("");

  // Supplier Notification for Low / Limited / Slow Stock
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierModalItem, setSupplierModalItem] = useState(null);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [notificationSuccessModal, setNotificationSuccessModal] = useState(null);
  const [supplierForm, setSupplierForm] = useState({
    supplierId: null,
    supplierName: "",
    supplierEmail: "",
    supplierPhone: "",
    reorderQuantity: "100",
    channel: "PORTAL",
    priority: "URGENT",
    notes: "",
  });
  const [supplierSending, setSupplierSending] = useState(false);
  const [availableSuppliers, setAvailableSuppliers] = useState([]);

  useEffect(() => {
    let isMounted = true;
    loadInventoryData();
    loadBranchesData();

    const subscribeFn =
      typeof syncEngine?.onStateChange === "function"
        ? syncEngine.onStateChange.bind(syncEngine)
        : typeof syncEngine?.subscribe === "function"
          ? syncEngine.subscribe.bind(syncEngine)
          : null;

    const unsubscribe = subscribeFn
      ? subscribeFn(() => {
        if (isMounted) loadInventoryData();
      })
      : null;

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [selectedBranch]);

  const loadInventoryData = async () => {
    try {
      setLoading(true);
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
          : undefined;

      const invRes = await fetchInventory({ branchId: branchParam });
      const invList = Array.isArray(invRes?.data?.data)
        ? invRes.data.data
        : Array.isArray(invRes?.data)
          ? invRes.data
          : Array.isArray(invRes)
            ? invRes
            : null;

      if (invList) {
        setStockItems(
          invList.map((item, idx) => ({
            ...item,
            isActive: item.isActive !== undefined ? item.isActive : true,
            rxRequired:
              item.rxRequired !== undefined ? item.rxRequired : idx % 2 === 0,
          })),
        );
        setIsOfflineMode(Boolean(invRes.isOffline));
      } else {
        setStockItems([]);
        setIsOfflineMode(false);
      }
    } catch (err) {
      console.warn("Failed to load inventory:", err.message);
      setStockItems([]);
    } finally {
      setLoading(false);
    }
  };


  // Quick Filter Toggles State
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);
  const [filterActiveOnly, setFilterActiveOnly] = useState(false);

  // 3-Dots Action Menu State
  const [selectedItemForAction, setSelectedItemForAction] = useState(null);
  const [actionMenuModalOpen, setActionMenuModalOpen] = useState(false);

  // Quick Quantity Adjustment Modal State
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState("10");
  const [adjustSign, setAdjustSign] = useState("+");
  const [adjustType, setAdjustType] = useState("CYCLE_COUNT");
  const [adjustReason, setAdjustReason] = useState(
    "Physical stock count adjustment",
  );
  const [adjustSaving, setAdjustSaving] = useState(false);

  // Edit Medicine Information Modal State (PRD Action Menu)
  const [editMedicineModalOpen, setEditMedicineModalOpen] = useState(false);
  const [editMedicineForm, setEditMedicineForm] = useState({
    id: "",
    productId: "",
    medicineName: "",
    brandName: "",
    genericName: "",
    strength: "",
    packSize: "",
    manufacturer: "",
    supplierName: "",
    amount: "",
    sku: "",
    batchNo: "",
    quantity: "",
    branchId: "",
    shelfLocation: "",
    isRxRequired: false,
    isActive: true,
  });
  const [editMedicineSaving, setEditMedicineSaving] = useState(false);

  // Inter-Branch Transfer Modal State
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [fromBranch, setFromBranch] = useState("");
  const [toBranch, setToBranch] = useState("");
  const [transferQty, setTransferQty] = useState("50");
  const [transferReason, setTransferReason] = useState(
    "Inter-branch stock rebalancing",
  );
  const [transferError, setTransferError] = useState("");
  const [branchesList, setBranchesList] = useState([]);

  // Barcode & Thermal Shelf Tag Modal State
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeItemData, setBarcodeItemData] = useState(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeConfig, setBarcodeConfig] = useState({
    format: "thermal_50x25",
    codeType: "barcode", // "barcode" | "qr" | "both"
    copies: "1",
    showPrice: true,
    showExpiry: true,
    showBatch: true,
    showShelf: true,
    showGeneric: true,
  });

  const loadBranchesData = async () => {
    try {
      const res = await fetchBranches();
      if (res && res.success) {
        const list = Array.isArray(res.data?.data)
          ? res.data.data
          : Array.isArray(res.data)
            ? res.data
            : [];
        const activeOnly = list.filter(
          (b) => b.status === "ACTIVE" || b.status === "Active" || !b.status,
        );
        setBranchesList(
          activeOnly.map((b, idx) => ({
            id: b.id || `BR-0${idx + 1}`,
            name: b.name,
            city: b.city || "",
          })),
        );
      }
    } catch (e) {
      console.warn("Failed to fetch branches from API:", e.message);
    }
  };

  // Add/Edit Medicine Entry Form State
  const [formData, setFormData] = useState({
    medicineName: "",
    brandName: "",
    genericName: "",
    strength: "",
    packSize: "",
    manufacturer: "",
    supplierName: "",
    amount: "",
    sku: "",
    batchNo: "",
    quantity: "",
    branchId: "",
    shelfLocation: "",
  });
  const [formErrors, setFormErrors] = useState({});
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  // Default the Add Medicine form to the currently active branch (a real
  // branch id/name), instead of leaving it on a placeholder that doesn't
  // exist in the tenant's `branches` table and fails the save server-side.
  useEffect(() => {
    if (!editingItemId && !formData.branchId) {
      const activeBranchId =
        typeof selectedBranch === "object" && selectedBranch !== null
          ? selectedBranch.id
          : selectedBranch;
      if (activeBranchId && activeBranchId !== "All Branches") {
        setFormData((prev) => ({ ...prev, branchId: activeBranchId }));
      }
    }
  }, [selectedBranch, editingItemId]);

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleToggleStatus = async (itemId) => {
    let nextActive = false;
    let targetItem = null;

    setStockItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          nextActive = !item.isActive;
          targetItem = item;
          if (onShowToast) {
            onShowToast(
              `${item.brandName || item.medicineName} status: ${
                nextActive ? "Active (Live in billing)" : "Deactivated / Hidden from Sales"
              }`,
            );
          }
          return { ...item, isActive: nextActive };
        }
        return item;
      }),
    );

    if (targetItem) {
      const identifier = targetItem.sku || targetItem.productId || targetItem.id;
      try {
        await updateItemStatusApi(identifier, nextActive);
      } catch (e) {
        console.warn("Could not save status toggle to backend:", e.message);
      }
    }
  };

  const handleToggleRx = async (itemId) => {
    let nextRx = false;
    let targetItem = null;

    setStockItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          nextRx = !item.rxRequired;
          targetItem = item;
          if (onShowToast) {
            onShowToast(
              `${item.brandName || item.medicineName}: Prescription required: ${
                nextRx ? "YES (Rx Needed)" : "NO (OTC)"
              }`,
            );
          }
          return { ...item, rxRequired: nextRx };
        }
        return item;
      }),
    );

    if (targetItem) {
      const identifier = targetItem.sku || targetItem.productId || targetItem.id;
      try {
        await updateItemRxApi(identifier, nextRx);
      } catch (e) {
        console.warn("Could not save Rx toggle to backend:", e.message);
      }
    }
  };

  const handleOpenActionMenu = (item) => {
    setSelectedItemForAction(item);
    setActionMenuModalOpen(true);
  };

  const handleExecuteAction = (actionKey) => {
    const item = selectedItemForAction;
    setActionMenuModalOpen(false);
    if (!item) return;

    if (actionKey === "adjust") {
      setAdjustDelta("10");
      setAdjustSign("+");
      setAdjustType("CYCLE_COUNT");
      setAdjustReason("Physical inventory stock count");
      setAdjustModalOpen(true);
      return;
    }

    if (actionKey === "transfer") {
      if (!isMultiBranch) {
        if (onShowToast)
          onShowToast(
            "Inter-branch transfers are only available in Multi-Branch mode.",
          );
        return;
      }
      const currentBranch =
        item.branchName || item.branchId || "FIT Main Campus Hospital Pharmacy";
      setFromBranch(currentBranch);

      const destCandidate =
        branchesList.find(
          (b) => b.name !== currentBranch && b.id !== currentBranch,
        ) ||
        branchesList[1] ||
        branchesList[0];
      setToBranch(
        destCandidate
          ? destCandidate.name || destCandidate.id
          : "FIT Pune City OPD Pharmacy",
      );
      setTransferQty(
        item.quantity > 50
          ? "50"
          : String(Math.max(1, Math.floor(item.quantity / 2))),
      );
      setTransferReason("Inter-branch stock rebalancing");
      setTransferError("");
      setTransferModalOpen(true);
      return;
    }

    if (actionKey === "barcode") {
      handleOpenBarcodeModal(item);
      return;
    }

    if (actionKey === "edit") {
      setEditMedicineForm({
        id: item.id,
        productId: item.productId || item.id,
        medicineName: item.medicineName || item.genericName || "",
        brandName: item.brandName || item.medicineName || "",
        genericName: item.genericName || item.medicineName || "",
        strength: item.strength || "500mg",
        packSize: item.packSize || "10 Tablets",
        manufacturer: item.manufacturer || "Pharma Lab",
        supplierName: item.supplierName || "Direct Supplier",
        amount: item.amount
          ? String(item.amount).replace(/[^0-9.]/g, "")
          : item.mrp
            ? String(item.mrp).replace(/[^0-9.]/g, "")
            : "15.00",
        sku: item.sku || "",
        batchNo: item.batchNo || item.batchNumber || "B-1001",
        quantity: item.quantity !== undefined ? String(item.quantity) : "100",
        branchId: item.branchId || "",
        shelfLocation: item.shelfLocation || "A1-S1",
        isRxRequired: Boolean(item.isRxRequired ?? item.rxRequired),
        isActive: item.isActive !== undefined ? item.isActive : true,
      });
      setEditMedicineModalOpen(true);
      return;
    }

    if (actionKey === "notify-supplier") {
      handleOpenSupplierModal(item);
      return;
    }

    if (actionKey === "delete") {
      deleteInventoryEntry(item.id)
        .then(() => {
          setStockItems((prev) => prev.filter((i) => i.id !== item.id));
          if (onShowToast) {
            onShowToast(
              `[DELETE /api/inventory/${item.id}] Removed "${item.brandName}" from database.`,
            );
          }
        })
        .catch((err) => {
          console.error("Delete failed:", err);
          setStockItems((prev) => prev.filter((i) => i.id !== item.id));
          if (onShowToast) {
            onShowToast(`Removed "${item.brandName}" from inventory.`);
          }
        });
      return;
    }
  };

  const handleOpenSupplierModal = async (item) => {
    if (!item) return;
    setSupplierModalItem(item);
    const stockQty = Number(item.quantity) || 0;
    const isCritical = stockQty <= 10;

    let supList = availableSuppliers;
    if (!supList || supList.length === 0) {
      try {
        const supRes = await fetchSuppliers();
        supList = Array.isArray(supRes?.data?.data)
          ? supRes.data.data
          : Array.isArray(supRes?.data)
            ? supRes.data
            : [];
        setAvailableSuppliers(supList);
      } catch (e) {
        console.warn("Could not load suppliers:", e.message);
      }
    }

    const itemSupName = item.supplierName || item.supplier || "";
    let matched = (supList || []).find(
      (s) =>
        (itemSupName &&
          (s.name?.toLowerCase().includes(itemSupName.toLowerCase()) ||
            itemSupName.toLowerCase().includes(s.name?.toLowerCase()))) ||
        s.id === item.supplierId,
    );
    if (!matched && supList && supList.length > 0) {
      matched = supList[0];
    }

    setSupplierForm({
      supplierId: matched ? matched.id : (item.supplierId || null),
      supplierName: matched ? matched.name : itemSupName,
      supplierEmail: matched ? (matched.email || "") : (item.supplierEmail || ""),
      supplierPhone: matched ? (matched.phone || "") : (item.supplierPhone || ""),
      reorderQuantity: "100",
      channel: "PORTAL",
      priority: isCritical ? "CRITICAL" : "URGENT",
      notes: `Low stock alert: current stock is ${stockQty} units (Reorder threshold: 50). Please prioritize dispatch of replenishment batch.`,
    });
    setSupplierDropdownOpen(false);
    setSupplierModalOpen(true);
  };

  const handleSendSupplierNotification = async () => {
    if (!supplierModalItem) return;
    if (!supplierForm.reorderQuantity || Number(supplierForm.reorderQuantity) <= 0) {
      if (onShowToast) onShowToast("⚠️ Please enter a valid reorder quantity.");
      return;
    }
    if (!supplierForm.supplierName || !supplierForm.supplierName.trim()) {
      if (onShowToast) onShowToast("⚠️ Please specify a supplier name.");
      return;
    }

    try {
      setSupplierSending(true);
      const rawBranch =
        typeof selectedBranch === "object" && selectedBranch !== null
          ? selectedBranch.id
          : selectedBranch;
      const branchIdParam =
        rawBranch &&
        rawBranch !== "All Branches" &&
        rawBranch !== "all" &&
        rawBranch !== "No Active Branch"
          ? rawBranch
          : supplierModalItem.branchId || null;

      const payload = {
        branchId: branchIdParam,
        supplierId: supplierForm.supplierId || null,
        supplierName: supplierForm.supplierName.trim(),
        recipientEmail: supplierForm.supplierEmail ? supplierForm.supplierEmail.trim() : null,
        recipientPhone: supplierForm.supplierPhone ? supplierForm.supplierPhone.trim() : null,
        productId: supplierModalItem.productId || supplierModalItem.id,
        batchId: supplierModalItem.batchId || null,
        medicineName:
          supplierModalItem.medicineName || supplierModalItem.brandName || "Medicine",
        sku: supplierModalItem.sku || "N/A",
        batchNo:
          supplierModalItem.batchNo || supplierModalItem.batchNumber || "N/A",
        currentStock: Number(supplierModalItem.quantity) || 0,
        reorderQuantity: Number(supplierForm.reorderQuantity) || 100,
        channel: supplierForm.channel || "PORTAL",
        priority: supplierForm.priority || "URGENT",
        message: `LOW STOCK REORDER ALERT (${supplierForm.priority})
Store / Branch: ${rawBranch || "Active Branch"}
Medicine: ${supplierModalItem.brandName || supplierModalItem.medicineName}
SKU: ${supplierModalItem.sku || "N/A"} | Batch: ${supplierModalItem.batchNo || "N/A"}
Current Available Stock: ${supplierModalItem.quantity || 0} units
Requested Reorder Quantity: ${supplierForm.reorderQuantity} units
Note: ${supplierForm.notes || "Urgent stock replenishment requested."}`,
      };

      const res = await notifySupplierApi(payload);

      if (res && (res.success || res.data?.success)) {
        const notifResult = res.data || res;
        setSupplierModalOpen(false);

        // Open Confirmation & Delivery Pop-up Modal
        setNotificationSuccessModal({
          supplierName: supplierForm.supplierName,
          supplierPhone: supplierForm.supplierPhone,
          supplierEmail: supplierForm.supplierEmail,
          medicineName: supplierModalItem.brandName || supplierModalItem.medicineName,
          sku: supplierModalItem.sku || "N/A",
          batchNo: supplierModalItem.batchNo || "N/A",
          currentStock: Number(supplierModalItem.quantity) || 0,
          reorderQuantity: supplierForm.reorderQuantity,
          channel: supplierForm.channel,
          priority: supplierForm.priority,
          message: payload.message,
          referenceNumber: notifResult.referenceNumber || `REF-${Date.now().toString().slice(-6)}`,
        });

        if (onShowToast) {
          onShowToast(
            `📢 Reorder notification delivered to ${supplierForm.supplierName}'s portal!`,
          );
        }
      } else {
        throw new Error(res?.error || res?.data?.error || "Failed to deliver supplier alert");
      }
    } catch (err) {
      console.error("Supplier notification error:", err);
      if (onShowToast) {
        onShowToast(`❌ Error sending notification: ${err.message}`);
      }
    } finally {
      setSupplierSending(false);
    }
  };

  const handleFormBarcodeScanned = async (scannedCode) => {
    const raw = String(scannedCode || "").trim();
    if (!raw) return;

    setFormScannerOpen(false);
    setFormData((prev) => ({ ...prev, sku: raw }));
    setEditMedicineForm((prev) => ({ ...prev, sku: raw }));

    if (onShowToast) {
      onShowToast(`📷 Scanned Barcode: ${raw}`);
    }

    const cleanLower = raw.toLowerCase();
    const cleanWithoutLeadingZero = cleanLower.startsWith("0") ? cleanLower.replace(/^0+/, "") : cleanLower;

    let matchedItem = stockItems.find((item) => {
      const b = String(item.barcode || item.barcodeNumber || item.barcode_number || "").trim().toLowerCase();
      const s = String(item.sku || "").trim().toLowerCase();
      return (
        b === cleanLower ||
        b === cleanWithoutLeadingZero ||
        s === cleanLower ||
        s === cleanWithoutLeadingZero
      );
    });

    if (!matchedItem) {
      try {
        const rawBranch =
          typeof selectedBranch === "object" && selectedBranch !== null
            ? selectedBranch.id
            : selectedBranch;
        const products = await fetchCashierProducts("", raw, rawBranch);
        if (Array.isArray(products) && products.length > 0) {
          const p = products[0];
          matchedItem = {
            medicineName: p.generic || p.name,
            brandName: p.brand || p.brandName || p.name,
            genericName: p.generic || p.name,
            strength: p.strength || "500mg",
            packSize: p.pack || p.packSize || "10 Tablets",
            manufacturer: p.manufacturer || "Pharma Lab",
            amount: p.mrp ? String(p.mrp) : p.price ? String(p.price) : "",
            sku: p.sku || raw,
            shelfLocation: p.shelfLocation || "A1-S1",
          };
        }
      } catch (err) {
        console.warn("Could not check backend for scanned SKU:", err.message);
      }
    }

    if (matchedItem) {
      setFormData((prev) => ({
        ...prev,
        medicineName: matchedItem.medicineName || matchedItem.genericName || prev.medicineName,
        brandName: matchedItem.brandName || matchedItem.name || prev.brandName,
        genericName: matchedItem.genericName || matchedItem.medicineName || prev.genericName,
        strength: matchedItem.strength || prev.strength,
        packSize: matchedItem.packSize || prev.packSize,
        manufacturer: matchedItem.manufacturer || prev.manufacturer,
        supplierName: matchedItem.supplierName || prev.supplierName,
        amount: matchedItem.amount
          ? String(matchedItem.amount).replace(/[^0-9.]/g, "")
          : matchedItem.mrp
            ? String(matchedItem.mrp)
            : prev.amount,
        sku: raw,
        shelfLocation: matchedItem.shelfLocation || prev.shelfLocation,
      }));
      if (onShowToast) {
        onShowToast(`✨ Pre-filled details for "${matchedItem.brandName || matchedItem.medicineName}".`);
      }
    }
  };

  const handleSaveAdjustment = async () => {
    if (!selectedItemForAction) return;

    const rawDelta = Math.abs(parseInt(adjustDelta, 10) || 0);
    if (rawDelta === 0) {
      if (onShowToast)
        onShowToast("Please enter a valid non-zero quantity change number");
      return;
    }

    const effectiveSign = adjustType === "DAMAGE_WRITEOFF" ? "-" : adjustSign;
    const signedDelta = effectiveSign === "-" ? -rawDelta : rawDelta;
    const currentQty = Number(selectedItemForAction.quantity || 0);
    const newQty = currentQty + signedDelta;

    if (newQty < 0) {
      if (onShowToast) {
        onShowToast(
          `Adjustment would cause negative stock (${currentQty} ${signedDelta < 0 ? "-" : "+"} ${rawDelta} = ${newQty})`,
        );
      }
      return;
    }

    try {
      setAdjustSaving(true);

      // 1. Persist directly to backend database (PostgreSQL)
      const updatedPayload = {
        ...selectedItemForAction,
        quantity: newQty,
      };
      await updateInventoryEntry(selectedItemForAction.id, updatedPayload);

      // 2. Record stock movement in backend audit history
      const movementType =
        adjustType === "DAMAGE_WRITEOFF"
          ? "DAMAGE"
          : adjustType === "CORRECTION"
            ? "CORRECTION"
            : "CYCLE_COUNT";

      await recordStockMovementApi({
        branchName:
          selectedItemForAction.branchName ||
          selectedItemForAction.branchId ||
          "Main Dispensary",
        type: movementType,
        item:
          selectedItemForAction.brandName ||
          selectedItemForAction.medicineName,
        quantity: rawDelta,
        reference: `ADJ-${selectedItemForAction.sku || selectedItemForAction.batchNo || "MANUAL"}`,
        status: signedDelta >= 0 ? "STOCK_IN" : "STOCK_OUT",
        notes: adjustReason,
      }).catch((e) => console.warn("Stock movement audit warning:", e.message));

      // 3. Update in-memory table state
      setStockItems((prev) =>
        prev.map((i) => {
          if (i.id === selectedItemForAction.id) {
            return {
              ...i,
              quantity: newQty,
              lastUpdated: new Date().toISOString().split("T")[0],
              status:
                newQty < 50
                  ? newQty === 0
                    ? "Out of Stock"
                    : "Low Stock"
                  : "In Stock",
            };
          }
          return i;
        }),
      );

      refreshPosCatalog();
      setAdjustModalOpen(false);

      // Re-fetch authoritative inventory from server
      await loadInventoryData();

      if (onShowToast) {
        onShowToast(
          `✓ Stock adjustment of ${signedDelta > 0 ? `+${signedDelta}` : signedDelta} units saved to database! (New stock: ${newQty})`,
        );
      }
    } catch (err) {
      console.error("[StockAdjustments] Error adjusting stock:", err);
      if (onShowToast) {
        onShowToast(`Error adjusting stock: ${err.message}`);
      }
    } finally {
      setAdjustSaving(false);
    }
  };

  const handleUpdateMedicineModal = async () => {
    if (!editMedicineForm || !editMedicineForm.id) return;
    if (!editMedicineForm.brandName?.trim()) {
      if (onShowToast) onShowToast("⚠️ Brand name is required");
      return;
    }
    if (!editMedicineForm.sku?.trim()) {
      if (onShowToast) onShowToast("⚠️ SKU / Barcode is required");
      return;
    }

    try {
      setEditMedicineSaving(true);
      const rawBranch =
        typeof selectedBranch === "object" && selectedBranch !== null
          ? selectedBranch.id
          : selectedBranch;
      const branchIdParam =
        rawBranch &&
        rawBranch !== "All Branches" &&
        rawBranch !== "all" &&
        rawBranch !== "No Active Branch"
          ? rawBranch
          : editMedicineForm.branchId || undefined;

      const numAmount =
        parseFloat(
          String(editMedicineForm.amount).replace(/[^0-9.]/g, ""),
        ) || 15.0;
      const numQty =
        parseInt(String(editMedicineForm.quantity), 10) || 0;

      const payload = {
        id: editMedicineForm.id,
        productId: editMedicineForm.productId || editMedicineForm.id,
        medicineName:
          editMedicineForm.medicineName || editMedicineForm.brandName,
        brandName: editMedicineForm.brandName,
        genericName:
          editMedicineForm.genericName ||
          editMedicineForm.medicineName ||
          editMedicineForm.brandName,
        strength: editMedicineForm.strength || "500mg",
        packSize: editMedicineForm.packSize || "10 Tablets",
        manufacturer: editMedicineForm.manufacturer || "Pharma Lab",
        supplierName: editMedicineForm.supplierName || "Direct Supplier",
        amount: `₹${numAmount.toFixed(2)}`,
        mrp: `₹${numAmount.toFixed(2)}`,
        sku: editMedicineForm.sku,
        batchNo: editMedicineForm.batchNo || "B-1001",
        batchNumber: editMedicineForm.batchNo || "B-1001",
        quantity: numQty,
        branchId: branchIdParam,
        shelfLocation: editMedicineForm.shelfLocation || "A1-S1",
        isRxRequired: Boolean(editMedicineForm.isRxRequired),
        rxRequired: Boolean(editMedicineForm.isRxRequired),
        isActive: Boolean(editMedicineForm.isActive),
      };

      const res = await updateInventoryEntry(editMedicineForm.id, payload);

      if (res && res.success === false) {
        throw new Error(
          res.error || "Failed to save medicine update to server",
        );
      }

      setStockItems((prev) =>
        prev.map((i) =>
          i.id === editMedicineForm.id
            ? {
                ...i,
                ...payload,
                status:
                  numQty < 50
                    ? numQty === 0
                      ? "Out of Stock"
                      : "Low Stock"
                    : "In Stock",
                lastUpdated: new Date().toISOString().split("T")[0],
              }
            : i,
        ),
      );

      refreshPosCatalog();
      setEditMedicineModalOpen(false);

      if (onShowToast) {
        onShowToast(
          `✓ Updated medicine "${payload.brandName}" in database!`,
        );
      }
    } catch (err) {
      console.error("[EditMedicine] Error:", err);
      if (onShowToast) {
        onShowToast(`❌ Error saving medicine: ${err.message}`);
      }
    } finally {
      setEditMedicineSaving(false);
    }
  };

  const handleConfirmTransfer = async () => {
    if (!selectedItemForAction) return;

    const qtyNum = parseInt(transferQty, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setTransferError(
        "Please enter a valid transfer quantity greater than 0.",
      );
      return;
    }

    if (qtyNum > selectedItemForAction.quantity) {
      setTransferError(
        `Transfer quantity cannot exceed source branch stock (${selectedItemForAction.quantity} units).`,
      );
      return;
    }

    if (fromBranch === toBranch) {
      setTransferError("Source and Destination branches must be different.");
      return;
    }

    setTransferError("");

    const sourceItem = selectedItemForAction;
    const remainingSourceQty = sourceItem.quantity - qtyNum;

    // 1. Update source branch item quantity
    const updatedSourceItem = {
      ...sourceItem,
      quantity: remainingSourceQty,
      lastUpdated: new Date().toISOString().split("T")[0],
      status:
        remainingSourceQty < 50
          ? remainingSourceQty === 0
            ? "Out of Stock"
            : "Low Stock"
          : "In Stock",
    };

    // 2. Check if item exists in target branch
    const existingDestIndex = stockItems.findIndex(
      (i) =>
        i.sku === sourceItem.sku &&
        i.batchNo === sourceItem.batchNo &&
        (i.branchId === toBranch || i.branchName === toBranch) &&
        i.id !== sourceItem.id,
    );

    let updatedStockList = [];

    if (existingDestIndex >= 0) {
      const destItem = stockItems[existingDestIndex];
      const newDestQty = Number(destItem.quantity) + qtyNum;
      const updatedDestItem = {
        ...destItem,
        quantity: newDestQty,
        lastUpdated: new Date().toISOString().split("T")[0],
        status: newDestQty < 50 ? "Low Stock" : "In Stock",
      };

      updatedStockList = stockItems.map((item, idx) => {
        if (item.id === sourceItem.id) return updatedSourceItem;
        if (idx === existingDestIndex) return updatedDestItem;
        return item;
      });

      try {
        await updateInventoryEntry(sourceItem.id, updatedSourceItem);
        await updateInventoryEntry(destItem.id, updatedDestItem);
      } catch (e) {
        console.warn("Backend transfer sync notice:", e.message);
      }
    } else {
      const newDestItem = {
        ...sourceItem,
        id: `stk-trf-${Date.now()}`,
        branchId: toBranch,
        quantity: qtyNum,
        lastUpdated: new Date().toISOString().split("T")[0],
        status: qtyNum < 50 ? "Low Stock" : "In Stock",
        updatedBy: "Transfer System",
      };

      updatedStockList = stockItems.map((item) =>
        item.id === sourceItem.id ? updatedSourceItem : item,
      );
      updatedStockList.unshift(newDestItem);

      try {
        await updateInventoryEntry(sourceItem.id, updatedSourceItem);
        await saveInventoryEntry(newDestItem);
      } catch (e) {
        console.warn("Backend transfer creation notice:", e.message);
      }
    }

    setStockItems(updatedStockList);
    setTransferModalOpen(false);

    if (onShowToast) {
      onShowToast(
        `✓ Inter-Branch Transfer Success: ${qtyNum} units of "${sourceItem.brandName}" transferred from "${fromBranch}" to "${toBranch}". Stock updated!`,
      );
    }
  };

  const handleOpenBarcodeModal = async (item) => {
    if (!item) return;
    setBarcodeModalOpen(true);
    setBarcodeLoading(true);

    const fallbackBarcode = item.barcode || item.sku || item.barcodeNumber || item.barcode_number || "MED-001";
    const initialSvg = generateOfflineBarcodeSvg(fallbackBarcode, {
      barHeight: 52,
      moduleWidth: 2,
      quietZoneModules: 14,
    });
    const initialQr = generateOfflineQRCodeSvg(fallbackBarcode, 96);

    const initialData = {
      id: item.id,
      productId: item.productId || item.id,
      medicineName: item.medicineName || item.genericName || "Medicine",
      brandName: item.brandName || item.medicineName || "Medicine",
      genericName: item.genericName || item.medicineName || "",
      strength: item.strength || "",
      packSize: item.packSize || "10 Tablets",
      sku: item.sku || fallbackBarcode,
      barcode: fallbackBarcode,
      batchNo: item.batchNo || item.batchNumber || "B-1001",
      expiryDate: item.expiryDate || "2028-12-31",
      mrp: item.amount || item.mrp || "₹0.00",
      shelfLocation: item.shelfLocation || "Rack A1-S1",
      branchName: item.branchName || item.branchId || "Main Store",
      pharmacyName: "Falah Pharmacy",
      svgBarcode: initialSvg,
      qrBarcode: initialQr,
    };
    setBarcodeItemData(initialData);
    // Show the offline-generated barcode immediately — no loading block
    setBarcodeLoading(false);

    // Background: try to enrich with server data (richer barcode, batch info etc.)
    // This is best-effort — if the backend is offline, the offline barcode already works.
    const enrichTimeout = setTimeout(async () => {
      try {
        const res = await fetchItemBarcode(item.id || item.sku);
        if (res?.success && res.data) {
          const apiData = res.data;
          const codeToUse = apiData.barcode || initialData.barcode;
          const validSvg =
            apiData.svgBarcode && apiData.svgBarcode.includes("<svg")
              ? apiData.svgBarcode
              : generateOfflineBarcodeSvg(codeToUse, {
                  barHeight: 52,
                  moduleWidth: 2,
                  quietZoneModules: 14,
                });
          const validQr = generateOfflineQRCodeSvg(codeToUse, 96);

          setBarcodeItemData((prev) => ({
            ...prev,
            ...apiData,
            barcode: codeToUse,
            svgBarcode: validSvg,
            qrBarcode: validQr,
          }));
        }
      } catch (err) {
        // Backend unreachable — offline barcode already displayed, nothing to do
        console.warn("Barcode API enrichment skipped (offline):", err.message);
      }
    }, 100);

    return () => clearTimeout(enrichTimeout);
  };



  const handlePrintBarcodeLabel = () => {
    if (!barcodeItemData) return;
    const copies = parseInt(barcodeConfig.copies, 10) || 1;
    const { format, showPrice, showExpiry, showBatch, showShelf, showGeneric } =
      barcodeConfig;
    const isShelfTag = format === "shelf_70x35";
    const isA4 = format === "sheet_a4";

    if (onShowToast) {
      onShowToast(
        `🖨️ Printing ${copies} label(s) for ${barcodeItemData.brandName}...`,
      );
    }

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const labelWidth = isShelfTag ? "70mm" : isA4 ? "62mm" : "50mm";
      const labelHeight = isShelfTag ? "35mm" : isA4 ? "30mm" : "25mm";
      const pageMargin = isA4 ? "8mm" : "0mm";
      const pageSize = isShelfTag ? "70mm 35mm" : isA4 ? "A4" : "50mm 25mm";

      const singleLabelHtml = `
        <div class="label-card ${isShelfTag ? "shelf-tag" : ""}">
          <div class="pharmacy-title">${barcodeItemData.pharmacyName || "FALAH PHARMACY"}</div>
          <div class="med-name">${barcodeItemData.brandName} ${barcodeItemData.strength || ""}</div>
          ${showGeneric && barcodeItemData.genericName ? `<div class="generic-name">${barcodeItemData.genericName}</div>` : ""}
          <div class="meta-row">
            ${showBatch ? `<span>B: ${barcodeItemData.batchNo}</span>` : ""}
            ${showExpiry ? `<span>EXP: ${barcodeItemData.expiryDate}</span>` : ""}
            ${showPrice ? `<span class="mrp-text">${barcodeItemData.mrp}</span>` : ""}
          </div>
          <div class="meta-row">
            ${showShelf ? `<span>Rack: ${barcodeItemData.shelfLocation || "A1"}</span>` : ""}
            <span>Pack: ${barcodeItemData.packSize || "Units"}</span>
          </div>
          <div class="barcode-container" style="display:flex; justify-content:center; align-items:center; gap: 8px;">
            ${
              barcodeConfig.codeType === "qr"
                ? barcodeItemData.qrBarcode || ""
                : barcodeConfig.codeType === "both"
                  ? `${barcodeItemData.svgBarcode || ""}<div style="width:20mm;height:20mm;">${barcodeItemData.qrBarcode || ""}</div>`
                  : barcodeItemData.svgBarcode || ""
            }
          </div>
        </div>
      `;

      let labelsHtml = "";
      for (let i = 0; i < copies; i++) {
        labelsHtml += singleLabelHtml;
      }

      const printWindow = window.open("", "_blank", "width=680,height=560");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Print Label - ${barcodeItemData.brandName}</title>
            <meta charset="utf-8" />
            <style>
              @page { size: ${pageSize}; margin: ${pageMargin}; }
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                background: #fff;
                color: #28242B;
                ${isA4 ? "display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; padding: 8mm;" : ""}
              }
              .label-card {
                width: ${labelWidth};
                height: ${labelHeight};
                padding: ${isShelfTag ? "3mm 4mm" : "2mm 2.5mm"};
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                page-break-after: ${isA4 ? "auto" : "always"};
                break-after: ${isA4 ? "auto" : "always"};
                border: 0.5px dashed #bbb;
                box-sizing: border-box;
                overflow: hidden;
              }
              .pharmacy-title {
                font-size: ${isShelfTag ? "9px" : "7.5px"};
                font-weight: 800;
                text-align: center;
                letter-spacing: 0.5px;
                border-bottom: 0.5px solid #28242B;
                padding-bottom: 1px;
                text-transform: uppercase;
              }
              .med-name {
                font-size: ${isShelfTag ? "11px" : "9px"};
                font-weight: 800;
                margin-top: 1px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              .generic-name {
                font-size: ${isShelfTag ? "8.5px" : "7px"};
                color: #28242B;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              .meta-row {
                display: flex;
                justify-content: space-between;
                font-size: ${isShelfTag ? "8px" : "6.8px"};
                font-weight: 600;
              }
              .mrp-text {
                font-size: ${isShelfTag ? "9.5px" : "8px"};
                font-weight: 800;
              }
              .barcode-container {
                display: flex;
                justify-content: center;
                align-items: center;
                margin-top: 1px;
              }
              .barcode-container svg {
                width: ${isShelfTag ? "58mm" : "44mm"};
                height: ${isShelfTag ? "13mm" : "10.5mm"};
              }
            </style>
          </head>
          <body>
            ${labelsHtml}
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              };
            </script>
          </body>
          </html>
        `);
        printWindow.document.close();
      }
    }
  };

  const handleCopyBarcode = () => {
    if (!barcodeItemData) return;
    const textToCopy = barcodeItemData.barcode || barcodeItemData.sku;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
    }
    if (onShowToast) {
      onShowToast(`📋 Copied barcode "${textToCopy}" to clipboard!`);
    }
  };

  const handleDownloadSvg = () => {
    console.log("EXPORT BUTTON CLICKED", barcodeItemData);
    if (Platform.OS !== "web") return;

    const isQrMode = barcodeConfig.codeType === "qr";
    const svg = isQrMode
      ? barcodeItemData?.qrBarcode || generateOfflineQRCodeSvg(barcodeItemData?.barcode || barcodeItemData?.sku || "MED-001", 240)
      : barcodeItemData?.svgBarcode || generateOfflineBarcodeSvg(barcodeItemData?.barcode || barcodeItemData?.sku || "MED-001", { barHeight: 60, moduleWidth: 2.5, quietZoneModules: 14 });

    if (!svg || !svg.includes("<svg")) {
      if (onShowToast) {
        onShowToast("Barcode / QR SVG is not available.");
      }
      return;
    }

    let url;

    try {
      const blob = new Blob([svg], {
        type: "image/svg+xml;charset=utf-8",
      });

      url = URL.createObjectURL(blob);

      const prefix = isQrMode ? "QRCode" : "Barcode";
      const a = document.createElement("a");
      a.href = url;
      a.download = `${prefix}-${String(
        barcodeItemData.sku || barcodeItemData.barcode || "MED"
      ).replace(/[^a-zA-Z0-9_-]/g, "_")}.svg`;

      document.body.appendChild(a);
      a.click();
      a.remove();

    if (onShowToast) {
      onShowToast(
        `📥 Downloaded barcode SVG for ${barcodeItemData.brandName}`
      );
    }
  } catch (error) {
    console.error("SVG export failed:", error);

    if (onShowToast) {
      onShowToast("Failed to download barcode SVG.");
    }
  } finally {
    if (url) {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
};

  // Active KPI Filter State
  const [activeKpiFilter, setActiveKpiFilter] = useState("ALL");

  // Dynamic 4 KPI Cards calculated from stockItems
  const uniqueProductIds = new Set(
    stockItems.map((i) => i.productId || i.medicineName),
  );
  const totalProductsCount = uniqueProductIds.size || stockItems.length;
  const lowStockCount = stockItems.filter(
    (i) => Number(i.quantity) < 50,
  ).length;
  const nearExpiryCount = stockItems.filter((i) => {
    if (i.status === "Near Expiry") return true;
    if (i.expiryDate || i.expiry_date) {
      const d = new Date(i.expiryDate || i.expiry_date);
      const now = new Date();
      const diffDays = (d - now) / (1000 * 60 * 60 * 24);
      return diffDays > 0 && diffDays <= 90;
    }
    return false;
  }).length;
  const expiredCount = stockItems.filter((i) => {
    if (i.status === "Expired") return true;
    if (i.expiryDate || i.expiry_date) {
      return new Date(i.expiryDate || i.expiry_date) < new Date();
    }
    return Number(i.quantity) === 0;
  }).length;

  const dynamicKpis = [
    {
      id: "kpi-total-products",
      label: "TOTAL PRODUCTS",
      value: totalProductsCount.toLocaleString(),
      subtext:
        activeKpiFilter === "ALL"
          ? "Showing all products"
          : "Click to view all",
      variant: "teal",
      key: "ALL",
    },
    {
      id: "kpi-low-stock",
      label: "LOW STOCK ITEMS",
      value: lowStockCount.toLocaleString(),
      subtext:
        activeKpiFilter === "LOW_STOCK"
          ? "Filtered: Qty < 50"
          : "Quantity < 50 units",
      variant: "amber",
      key: "LOW_STOCK",
    },
    {
      id: "kpi-near-expiry",
      label: "NEAR EXPIRY ITEMS",
      value: nearExpiryCount.toLocaleString(),
      subtext:
        activeKpiFilter === "NEAR_EXPIRY"
          ? "Filtered: Expiring < 90d"
          : "Expiring < 90 days",
      variant: "blue",
      key: "NEAR_EXPIRY",
    },
    {
      id: "kpi-expired",
      label: "EXPIRED ITEMS",
      value: expiredCount.toLocaleString(),
      subtext:
        activeKpiFilter === "EXPIRED"
          ? "Filtered: Out of stock / expired"
          : "Expired / Out of stock",
      variant: "red",
      key: "EXPIRED",
    },
  ];

  const handleKpiCardPress = (kpiKey, label) => {
    if (activeKpiFilter === kpiKey && kpiKey !== "ALL") {
      setActiveKpiFilter("ALL");
      if (onShowToast) onShowToast(`Reset filter: Showing all products`);
    } else {
      setActiveKpiFilter(kpiKey);
      if (onShowToast) onShowToast(`Filtered: ${label}`);
    }
  };

  const displayedStockItems = stockItems.filter((item) => {
    if (activeKpiFilter === "LOW_STOCK" && Number(item.quantity) >= 50)
      return false;
    if (activeKpiFilter === "NEAR_EXPIRY") {
      if (item.status === "Near Expiry") return true;
      if (item.expiryDate || item.expiry_date) {
        const d = new Date(item.expiryDate || item.expiry_date);
        const now = new Date();
        const diffDays = (d - now) / (1000 * 60 * 60 * 24);
        return diffDays > 0 && diffDays <= 90;
      }
      return false;
    }
    if (activeKpiFilter === "EXPIRED") {
      if (item.status === "Expired") return true;
      if (item.expiryDate || item.expiry_date) {
        return new Date(item.expiryDate || item.expiry_date) < new Date();
      }
      return Number(item.quantity) === 0;
    }
    if (filterLowStockOnly && Number(item.quantity) >= 50) return false;
    if (filterActiveOnly && item.isActive === false) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = (
        item.medicine ||
        item.brandName ||
        item.medicineName ||
        ""
      )
        .toLowerCase()
        .includes(q);
      const matchBatch = (item.batchNo || item.batch || "")
        .toLowerCase()
        .includes(q);
      const matchSku = (item.sku || "").toLowerCase().includes(q);
      if (!matchName && !matchBatch && !matchSku) return false;
    }
    return true;
  });

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isPageLoading, setIsPageLoading] = useState(false);

  // Reset page on filter changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, activeKpiFilter, filterLowStockOnly, filterActiveOnly]);

  const totalItems = displayedStockItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (page - 1) * pageSize;
  const paginatedStockItems = displayedStockItems.slice(
    startIndex,
    startIndex + pageSize,
  );

  const handlePageChange = (newPage) => {
    setIsPageLoading(true);
    setPage(newPage);
    setTimeout(() => setIsPageLoading(false), 200);
  };

  const handlePageSizeChange = (newSize) => {
    setIsPageLoading(true);
    setPageSize(newSize);
    setPage(1);
    setTimeout(() => setIsPageLoading(false), 200);
  };

  const handleAddOrUpdateMedicine = async () => {
    const errors = {};
    if (!formData.medicineName.trim())
      errors.medicineName = "Medicine Name is required (e.g. Paracetamol)";
    if (!formData.brandName.trim())
      errors.brandName = "Brand Name is required (e.g. Crocin 500 / Dolo 650)";
    if (!formData.sku.trim()) errors.sku = "SKU is required";
    if (!formData.batchNo.trim()) errors.batchNo = "Batch No. is required";
    if (
      !formData.quantity.trim() ||
      isNaN(formData.quantity) ||
      Number(formData.quantity) <= 0
    ) {
      errors.quantity = "Valid quantity is required";
    }
    if (isMultiBranch && !formData.branchId) {
      errors.branchId = "Please select a branch";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      if (onShowToast)
        onShowToast("Please fill in required medicine, brand & batch details.");
      return;
    }

    const payload = {
      ...(editingItemId ? { id: editingItemId } : {}),
      medicineName: formData.medicineName,
      brandName: formData.brandName,
      genericName: formData.genericName || formData.medicineName,
      strength: formData.strength || "500mg",
      packSize: formData.packSize || "15 Tablets",
      manufacturer: formData.manufacturer || "GSK",
      supplierName:
        formData.supplierName ||
        (formData.manufacturer
          ? `${formData.manufacturer} Distribution`
          : "GSK Pharmaceuticals"),
      amount: formData.amount
        ? formData.amount.startsWith("₹")
          ? formData.amount
          : `₹${formData.amount}`
        : "₹15.00",
      sku: formData.sku,
      batchNo: formData.batchNo,
      quantity: Number(formData.quantity),
      branchId:
        formData.branchId ||
        (typeof selectedBranch === "object" && selectedBranch !== null
          ? selectedBranch.id
          : selectedBranch) ||
        undefined,
      shelfLocation: formData.shelfLocation || "A1-S1",
    };

    try {
      if (editingItemId) {
        const res = await updateInventoryEntry(editingItemId, payload);

        if (!res || res.success === false) {
          if (onShowToast) {
            onShowToast(
              `✗ Could not update "${payload.brandName}": ${
                res?.error || "Server error, please try again"
              }`,
            );
          }
          return;
        }

        const updatedItem = res.data?.data || payload;

        setStockItems((prev) =>
          prev.map((item) =>
            item.id === editingItemId
              ? {
                ...item,
                ...updatedItem,
                isActive: item.isActive !== undefined ? item.isActive : true,
                rxRequired:
                  item.rxRequired !== undefined ? item.rxRequired : false,
              }
              : item,
          ),
        );

        if (onShowToast) {
          onShowToast(`✓ Updated product "${payload.brandName}" in database!`);
        }
        refreshPosCatalog();
      } else {
        const res = await saveInventoryEntry(payload);

        if (!res || res.success === false) {
          if (onShowToast) {
            onShowToast(
              `✗ Could not save "${payload.brandName}": ${
                res?.error || "Server error, please try again"
              }`,
            );
          }
          return;
        }

        const newItem = res.data?.data || {
          ...payload,
          id: `adj-stk-${Date.now()}`,
          updatedBy: "Manager",
          lastUpdated: new Date().toISOString().split("T")[0],
          status: Number(formData.quantity) < 50 ? "Low Stock" : "In Stock",
          isActive: true,
          rxRequired: false,
        };

        setStockItems((prev) => [newItem, ...prev]);

        if (onShowToast) {
          onShowToast(
            `✓ Added "${newItem.brandName}" to database products table!`,
          );
        }
        refreshPosCatalog();
      }
    } catch (err) {
      console.error("[StockAdjustments] Add/update medicine failed:", err);
      if (onShowToast) {
        onShowToast(
          `✗ Could not save "${payload.brandName}": ${err.message || "Unexpected error"}`,
        );
      }
      return;
    }

    setEditingItemId(null);
    setFormData({
      medicineName: "",
      brandName: "",
      genericName: "",
      strength: "",
      packSize: "",
      manufacturer: "",
      supplierName: "",
      amount: "",
      sku: "",
      batchNo: "",
      quantity: "",
      branchId: "",
      shelfLocation: "",
    });
    setFormErrors({});
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setFormData({
      medicineName: "",
      brandName: "",
      genericName: "",
      strength: "",
      packSize: "",
      manufacturer: "",
      supplierName: "",
      amount: "",
      sku: "",
      batchNo: "",
      quantity: "",
      branchId: "",
      shelfLocation: "",
    });
    setFormErrors({});
  };

  const handleEditOrDelete = (item) => {
    if (onShowToast) {
      onShowToast(
        `Modify / Adjust action for ${item.brandName} (${item.medicineName} - ${item.sku})`,
      );
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        isMobile && styles.contentContainerMobile,
      ]}
      showsVerticalScrollIndicator={true}
    >


      {/* Top 4 KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {loading ? (
          <>
            <SkeletonKpiCard />
            <SkeletonKpiCard />
            <SkeletonKpiCard />
            <SkeletonKpiCard />
          </>
        ) : (
          dynamicKpis.map((kpi) => (
            <InventoryStatCard
              key={kpi.id}
              label={kpi.label}
              value={kpi.value}
              subtext={kpi.subtext}
              variant={kpi.variant}
              onPress={() => handleKpiCardPress(kpi.key, kpi.label)}
            />
          ))
        )}
      </View>

      {/* Stock Information / Adjustments Table Card */}
      <View style={styles.cardContainer}>
        <View style={[styles.cardHeader, isMobile && styles.cardHeaderMobile]}>
          <View style={{ flex: 1, minWidth: 240 }}>
            <Text style={styles.cardTitle}>
              Stock Information & Adjustments
            </Text>
            <Text style={styles.cardSubtitle}>
              Showing {displayedStockItems.length} of {stockItems.length} items
              • Toggle switches for live status & 3 dots (⋮) for actions
            </Text>
          </View>

          {/* Quick Filter Toggles & Search */}
          <View style={styles.headerControlsRow}>
            {/* Search Input */}
            <View
              style={[
                styles.stockSearchBox,
                isMobile && styles.stockSearchBoxMobile,
              ]}
            >
              <Text style={styles.stockSearchIcon}>🔍</Text>
              <TextInput
                style={styles.stockSearchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search product, SKU, batch..."
                placeholderTextColor="#77717A"
              />
              {searchQuery ? (
                <Pressable
                  onPress={() => setSearchQuery("")}
                  style={{ padding: 4 }}
                >
                  <Text style={{ color: "#77717A", fontSize: 13 }}>✕</Text>
                </Pressable>
              ) : null}
            </View>
            {/* Toggle: Low Stock Only */}
            <Pressable
              onPress={() => setFilterLowStockOnly(!filterLowStockOnly)}
              style={[
                styles.filterTogglePill,
                filterLowStockOnly && styles.filterTogglePillActive,
              ]}
              accessibilityRole="switch"
              accessibilityState={{ checked: filterLowStockOnly }}
              accessibilityLabel="Toggle Low Stock Filter"
            >
              <View
                style={[
                  styles.filterToggleDot,
                  filterLowStockOnly && styles.filterToggleDotActive,
                ]}
              />
              <Text
                style={[
                  styles.filterToggleText,
                  filterLowStockOnly && styles.filterToggleTextActive,
                ]}
              >
                Low Stock (&lt;50)
              </Text>
            </Pressable>

            {/* Toggle: Active Only */}
            <Pressable
              onPress={() => setFilterActiveOnly(!filterActiveOnly)}
              style={[
                styles.filterTogglePill,
                filterActiveOnly && styles.filterTogglePillActive,
              ]}
              accessibilityRole="switch"
              accessibilityState={{ checked: filterActiveOnly }}
              accessibilityLabel="Toggle Active Filter"
            >
              <View
                style={[
                  styles.filterToggleDot,
                  filterActiveOnly && styles.filterToggleDotActive,
                ]}
              />
              <Text
                style={[
                  styles.filterToggleText,
                  filterActiveOnly && styles.filterToggleTextActive,
                ]}
              >
                Active Catalog
              </Text>
            </Pressable>

            {/* Bulk CSV Import Button (PRD-10, DAT-01) */}
            <Pressable
              onPress={() => setBulkImportModalOpen(true)}
              style={[
                styles.filterTogglePill,
                {
                  backgroundColor: "#B9829A",
                  borderColor: "#B9829A",
                  flexDirection: "row",
                  alignItems: "center",
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Bulk import medicines from CSV"
            >
              <Text style={{ fontSize: 13, marginRight: 5 }}>📥</Text>
              <Text
                style={[
                  styles.filterToggleText,
                  { color: "#FFFFFF", fontWeight: "700" },
                ]}
              >
                Import CSV
              </Text>
            </Pressable>
            {/* Scan Barcode Button */}
      <Pressable
        onPress={() => setScannerOpen(true)}
        style={[
          styles.filterTogglePill,
          {
            backgroundColor: "#B9829A",
            borderColor: "#B9829A",
            flexDirection: "row",
            alignItems: "center",
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Scan product barcode"
      >
        <Text
          style={[
            styles.filterToggleText,
            { color: "#FFFFFF", fontWeight: "700" },
          ]}
        >
          Scan Barcode
        </Text>
      </Pressable>
                </View>
        </View>

        {loading || isPageLoading ? (
          isMobile ? (
            <View style={styles.mobileCardList}>
              <SkeletonItemCard />
              <SkeletonItemCard />
              <SkeletonItemCard />
            </View>
          ) : (
            <View style={{ padding: 16 }}>
              <SkeletonTableRow columns={12} />
              <SkeletonTableRow columns={12} />
              <SkeletonTableRow columns={12} />
              <SkeletonTableRow columns={12} />
              <SkeletonTableRow columns={12} />
            </View>
          )
        ) : isMobile ? (
          /* Mobile Card List View (No horizontal scrolling on phone screen) */
          <View style={styles.mobileCardList}>
            {paginatedStockItems.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.mobileStockCard,
                  !item.isActive && styles.mobileStockCardInactive,
                ]}
              >
                {/* Header: Brand, Generic Medicine & Status Badge */}
                <View style={styles.mobileStockCardHeader}>
                  <View style={styles.mobileStockTitleCol}>
                    <Text style={styles.mobileBrandName}>{item.brandName}</Text>
                    <Text style={styles.mobileMedName}>
                      {item.medicineName || item.genericName}
                    </Text>
                  </View>

                  <View style={styles.mobileBadgesRow}>
                    {/* Status Badge */}
                    <View
                      style={[
                        styles.mobileStatusBadge,
                        item.quantity < 50
                          ? styles.statusBadgeLow
                          : styles.statusBadgeInStock,
                      ]}
                    >
                      <Text
                        style={[
                          styles.mobileStatusText,
                          item.quantity < 50
                            ? styles.statusTextLow
                            : styles.statusTextInStock,
                        ]}
                      >
                        {item.quantity < 50 ? "Low Stock" : "In Stock"}
                      </Text>
                    </View>

                    {/* Status Toggle Switch */}
                    <Pressable
                      onPress={() => handleToggleStatus(item.id)}
                      style={[
                        styles.miniToggleTrack,
                        item.isActive
                          ? styles.miniToggleTrackActive
                          : styles.miniToggleTrackInactive,
                      ]}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: item.isActive }}
                      accessibilityLabel="Toggle Item Active State"
                    >
                      <View
                        style={[
                          styles.miniToggleThumb,
                          item.isActive
                            ? styles.miniToggleThumbActive
                            : styles.miniToggleThumbInactive,
                        ]}
                      />
                    </Pressable>
                  </View>
                </View>

                {/* 2-Column Details Grid */}
                <View style={styles.mobileGrid}>
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>SKU</Text>
                    <Text style={styles.mobileItemValueBold}>{item.sku}</Text>
                  </View>
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>Batch No.</Text>
                    <Text style={styles.mobileItemValueBold}>
                      {item.batchNo}
                    </Text>
                  </View>
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>Qty Available</Text>
                    <Text
                      style={[styles.mobileItemValueBold, { color: "#B9829A" }]}
                    >
                      {item.quantity} units
                    </Text>
                  </View>
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>MRP Price</Text>
                    <Text
                      style={[styles.mobileItemValueBold, { color: "#28242B" }]}
                    >
                      {item.amount}
                    </Text>
                  </View>
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>Strength & Pack</Text>
                    <Text style={styles.mobileItemValue} numberOfLines={1}>
                      {item.strength
                        ? `${item.strength} • ${item.packSize || ""}`
                        : "500mg • 15 Tabs"}
                    </Text>
                  </View>
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>Shelf Location</Text>
                    <Text style={styles.mobileItemValue}>
                      {item.shelfLocation || "A1-S1"}
                    </Text>
                  </View>
                  {isMultiBranch && (
                    <View style={styles.mobileGridItem}>
                      <Text style={styles.mobileItemLabel}>Branch</Text>
                      <Text style={styles.mobileItemValue}>
                        {item.branchName || item.branchId}
                      </Text>
                    </View>
                  )}
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>Supplier</Text>
                    <Text style={styles.mobileItemValue} numberOfLines={1}>
                      {item.supplierName || item.manufacturer || "GSK"}
                    </Text>
                  </View>
                </View>

                {/* Card Footer: Last Updated & 3-Dots Action Button */}
                <View style={styles.mobileStockFooter}>
                  <Text style={styles.mobileUpdatedText}>
                    Updated: {item.lastUpdated} •{" "}
                    {item.isActive ? "Active" : "Disabled"}
                  </Text>
                  <Pressable
                    onPress={() => handleOpenActionMenu(item)}
                    style={styles.mobileDotsActionBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Item Actions"
                  >
                    <Text style={styles.mobileDotsActionText}>⋮ Actions</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          /* Desktop Horizontal Scroll Data Table */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 130 }]}>
                  Medicine Name
                </Text>
                <Text style={[styles.thCell, { width: 130 }]}>Brand Name</Text>
                <Text style={[styles.thCell, { width: 130 }]}>
                  Strength & Pack
                </Text>
                <Text style={[styles.thCell, { width: 110 }]}>
                  Manufacturer
                </Text>
                <Text style={[styles.thCell, { width: 130 }]}>
                  Supplier Name
                </Text>
                <Text style={[styles.thCell, { width: 100 }]}>SKU</Text>
                <Text style={[styles.thCell, { width: 90 }]}>Batch No.</Text>
                <Text
                  style={[styles.thCell, { width: 100, textAlign: "center" }]}
                >
                  Qty Available
                </Text>
                <Text
                  style={[styles.thCell, { width: 80, textAlign: "right" }]}
                >
                  MRP
                </Text>
                {isMultiBranch && (
                  <Text
                    style={[styles.thCell, { width: 85, textAlign: "center" }]}
                  >
                    Branch ID
                  </Text>
                )}
                <Text
                  style={[styles.thCell, { width: 95, textAlign: "center" }]}
                >
                  Shelf Loc
                </Text>
                <Text
                  style={[styles.thCell, { width: 85, textAlign: "center" }]}
                >
                  STATUS
                </Text>
                <Text
                  style={[styles.thCell, { width: 75, textAlign: "center" }]}
                >
                  RX
                </Text>
                <Text style={[styles.thCell, { width: 95 }]}>Last Updated</Text>
                <Text
                  style={[styles.thCell, { width: 70, textAlign: "center" }]}
                >
                  ACTIONS
                </Text>
              </View>

              {/* Table Rows */}
              {paginatedStockItems.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.tableRow,
                    index % 2 === 1 && styles.tableRowAlt,
                    !item.isActive && styles.tableRowInactive,
                  ]}
                >
                  {/* Medicine Name */}
                  <Text
                    style={[styles.tdCell, styles.medNameCell, { width: 130 }]}
                    numberOfLines={1}
                  >
                    {item.medicineName || item.genericName}
                  </Text>

                  {/* Brand Name */}
                  <Text
                    style={[
                      styles.tdCell,
                      styles.brandNameCell,
                      { width: 130 },
                    ]}
                    numberOfLines={1}
                  >
                    {item.brandName}
                  </Text>

                  {/* Strength & Pack */}
                  <Text
                    style={[styles.tdCell, styles.strengthCell, { width: 130 }]}
                    numberOfLines={1}
                  >
                    {item.strength
                      ? `${item.strength} • ${item.packSize || ""}`
                      : "500mg • 15 Tabs"}
                  </Text>

                  {/* Manufacturer */}
                  <Text
                    style={[styles.tdCell, styles.mfgCell, { width: 110 }]}
                    numberOfLines={1}
                  >
                    {item.manufacturer || "GSK"}
                  </Text>

                  {/* Supplier Name */}
                  <Text
                    style={[styles.tdCell, styles.supplierCell, { width: 130 }]}
                    numberOfLines={1}
                  >
                    {item.supplierName ||
                      `${item.manufacturer || "GSK"} Distribution`}
                  </Text>

                  {/* SKU */}
                  <Text style={[styles.tdCell, styles.skuCell, { width: 100 }]}>
                    {item.sku}
                  </Text>

                  {/* Batch No */}
                  <Text style={[styles.tdCell, { width: 90 }]}>
                    {item.batchNo}
                  </Text>

                  {/* Quantity */}
                  <Text
                    style={[
                      styles.tdCell,
                      { width: 100, textAlign: "center", fontWeight: "700" },
                    ]}
                  >
                    {item.quantity}
                  </Text>

                  {/* Amount / MRP */}
                  <Text
                    style={[
                      styles.tdCell,
                      styles.amountCell,
                      { width: 80, textAlign: "right" },
                    ]}
                  >
                    {item.amount}
                  </Text>

                  {/* Branch ID (Multi-Branch only) */}
                  {isMultiBranch && (
                    <Text
                      style={[
                        styles.tdCell,
                        { width: 85, textAlign: "center" },
                      ]}
                    >
                      {item.branchName || item.branchId}
                    </Text>
                  )}

                  {/* Shelf Location */}
                  <Text
                    style={[styles.tdCell, { width: 95, textAlign: "center" }]}
                  >
                    {item.shelfLocation}
                  </Text>

                  {/* TOGGLE 1: Item Active/Inactive Status Switch */}
                  <View style={[styles.tdCenterCell, { width: 85 }]}>
                    <Pressable
                      onPress={() => handleToggleStatus(item.id)}
                      style={[
                        styles.tableToggleTrack,
                        item.isActive
                          ? styles.tableToggleActive
                          : styles.tableToggleInactive,
                      ]}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: item.isActive }}
                      accessibilityLabel={`Toggle active status for ${item.brandName}`}
                    >
                      <View
                        style={[
                          styles.tableToggleThumb,
                          item.isActive
                            ? styles.tableToggleThumbActive
                            : styles.tableToggleThumbInactive,
                        ]}
                      />
                    </Pressable>
                  </View>

                  {/* TOGGLE 2: Prescription Required (Rx Only / OTC) */}
                  <View style={[styles.tdCenterCell, { width: 75 }]}>
                    <Pressable
                      onPress={() => handleToggleRx(item.id)}
                      style={[
                        styles.rxTagPill,
                        item.rxRequired
                          ? styles.rxTagRequired
                          : styles.rxTagOtc,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Toggle prescription requirement"
                    >
                      <Text
                        style={[
                          styles.rxTagPillText,
                          item.rxRequired
                            ? styles.rxTagTextRequired
                            : styles.rxTagTextOtc,
                        ]}
                      >
                        {item.rxRequired ? "Rx" : "OTC"}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Last Updated */}
                  <Text style={[styles.tdCell, { width: 95 }]}>
                    {item.lastUpdated}
                  </Text>

                  {/* ACTION COLUMN: 3 DOTS (⋮) BUTTON */}
                  <View style={[styles.actionCellWrapper, { width: 70 }]}>
                    <Pressable
                      onPress={() => handleOpenActionMenu(item)}
                      style={styles.actionDotsButton}
                      accessibilityRole="button"
                      accessibilityLabel="Open Action Menu"
                    >
                      <Text style={styles.actionDotsButtonText}>⋮</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Pagination Controls */}
        <PaginationControls
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          isMobile={isMobile}
          isLoading={isPageLoading}
        />
      </View>

      {/* Add / Edit Medicine Entry Form Card */}
      <View style={styles.cardContainer}>
        <View style={styles.formHeader}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={styles.cardTitle}>
              {editingItemId ? "Edit Medicine Entry" : "Add Medicine Entry"}
            </Text>
            {editingItemId && (
              <Pressable
                onPress={handleCancelEdit}
                style={{
                  backgroundColor: "#F8F5F7",
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 6,
                }}
              >
                <Text
                  style={{ color: "#77717A", fontWeight: "600", fontSize: 13 }}
                >
                  Cancel Edit
                </Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.formSubtitle}>
            {editingItemId
              ? "Modify medicine details, brand, supplier, or batch stock. Changes will update the database."
              : "Enter medicine name, brand variant, supplier details, and batch information to adjust inventory."}
          </Text>
        </View>

        {/* Form Fields Grid */}
        <View style={styles.formGrid}>
          {/* Row 1: Medicine Name & Brand Name */}
          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>
              Medicine Name <Text style={styles.reqStar}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.formInput,
                formErrors.medicineName && styles.formInputError,
              ]}
              placeholder="e.g., Paracetamol / Ibuprofen / Amoxicillin"
              placeholderTextColor="#77717A"
              value={formData.medicineName}
              onChangeText={(t) => handleFormChange("medicineName", t)}
            />
            {formErrors.medicineName && (
              <Text style={styles.errorText}>{formErrors.medicineName}</Text>
            )}
          </View>

          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>
              Brand Name <Text style={styles.reqStar}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.formInput,
                formErrors.brandName && styles.formInputError,
              ]}
              placeholder="e.g., Crocin 500 / Calpol 500 / Dolo 650"
              placeholderTextColor="#77717A"
              value={formData.brandName}
              onChangeText={(t) => handleFormChange("brandName", t)}
            />
            {formErrors.brandName && (
              <Text style={styles.errorText}>{formErrors.brandName}</Text>
            )}
          </View>

          {/* Row 2: Strength, Pack Size & Manufacturer */}
          <View style={styles.formFieldThird}>
            <Text style={styles.fieldLabel}>Strength</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., 500mg / 650mg / 400mg"
              placeholderTextColor="#77717A"
              value={formData.strength}
              onChangeText={(t) => handleFormChange("strength", t)}
            />
          </View>

          <View style={styles.formFieldThird}>
            <Text style={styles.fieldLabel}>Pack Size</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., 15 Tablets / 10 Capsules"
              placeholderTextColor="#77717A"
              value={formData.packSize}
              onChangeText={(t) => handleFormChange("packSize", t)}
            />
          </View>

          <View style={styles.formFieldThird}>
            <Text style={styles.fieldLabel}>Manufacturer</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., GSK / Micro Labs / Abbott / Alkem"
              placeholderTextColor="#77717A"
              value={formData.manufacturer}
              onChangeText={(t) => handleFormChange("manufacturer", t)}
            />
          </View>

          {/* Row 3: Supplier Name & MRP */}
          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>Supplier Name / Distributor</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., GSK Pharmaceuticals / Sun Pharma Care / Cipla Ltd"
              placeholderTextColor="#77717A"
              value={formData.supplierName}
              onChangeText={(t) => handleFormChange("supplierName", t)}
            />
          </View>

          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>MRP (₹)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., 15.00 / 24.00"
              placeholderTextColor="#77717A"
              keyboardType="numeric"
              value={formData.amount}
              onChangeText={(t) => handleFormChange("amount", t)}
            />
          </View>

          {/* Row 4: SKU, Batch No & Quantity */}
          <View style={styles.formFieldThird}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>
                SKU / Barcode <Text style={styles.reqStar}>*</Text>
              </Text>
              <Pressable
                onPress={() => setFormScannerOpen(true)}
                style={styles.scanBarcodeInlineBtn}
                accessibilityRole="button"
                accessibilityLabel="Scan barcode for medicine"
              >
                <Text style={styles.scanBarcodeInlineBtnText}>
                  📷 Scan Barcode
                </Text>
              </Pressable>
            </View>
            <TextInput
              style={[
                styles.formInput,
                formErrors.sku && styles.formInputError,
              ]}
              placeholder="Scan or type barcode/SKU"
              placeholderTextColor="#77717A"
              value={formData.sku}
              onChangeText={(t) => handleFormChange("sku", t)}
            />
            {formErrors.sku && (
              <Text style={styles.errorText}>{formErrors.sku}</Text>
            )}
          </View>

          <View style={styles.formFieldThird}>
            <Text style={styles.fieldLabel}>
              Batch No. <Text style={styles.reqStar}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.formInput,
                formErrors.batchNo && styles.formInputError,
              ]}
              placeholder="e.g., B-1001"
              placeholderTextColor="#77717A"
              value={formData.batchNo}
              onChangeText={(t) => handleFormChange("batchNo", t)}
            />
            {formErrors.batchNo && (
              <Text style={styles.errorText}>{formErrors.batchNo}</Text>
            )}
          </View>

          <View style={styles.formFieldThird}>
            <Text style={styles.fieldLabel}>
              Quantity <Text style={styles.reqStar}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.formInput,
                formErrors.quantity && styles.formInputError,
              ]}
              placeholder="e.g., 500"
              placeholderTextColor="#77717A"
              keyboardType="numeric"
              value={formData.quantity}
              onChangeText={(t) => handleFormChange("quantity", t)}
            />
            {formErrors.quantity && (
              <Text style={styles.errorText}>{formErrors.quantity}</Text>
            )}
          </View>

          {/* Row 5: Shelf Location & (Branch ID only in Multi-Branch mode) */}
          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>Shelf Location</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., A1-S1"
              placeholderTextColor="#77717A"
              value={formData.shelfLocation}
              onChangeText={(t) => handleFormChange("shelfLocation", t)}
            />
          </View>

          {isMultiBranch ? (
            <View style={styles.formFieldHalf}>
              <Text style={styles.fieldLabel}>
                Branch <Text style={styles.reqStar}>*</Text>
              </Text>
              {branchesList.length > 0 ? (
                <Pressable
                  onPress={() => setBranchDropdownOpen(true)}
                  style={[
                    styles.branchDropdownButton,
                    formErrors.branchId && styles.formInputError,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Select Branch"
                >
                  <Text
                    style={styles.branchDropdownButtonText}
                    numberOfLines={1}
                  >
                    {branchesList.find((b) => b.id === formData.branchId)
                      ?.name || "Select a branch"}
                  </Text>
                  <Text style={styles.chevronIcon}>▾</Text>
                </Pressable>
              ) : (
                <Text style={styles.formHelperText}>
                  No active branches found — create one under Management &gt;
                  Branches first.
                </Text>
              )}
              {formErrors.branchId && (
                <Text style={styles.errorText}>{formErrors.branchId}</Text>
              )}
            </View>
          ) : null}
        </View>

        {/* Branch Selection Modal (avoids clipping inside the scroll view) */}
        <Modal
          visible={branchDropdownOpen}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setBranchDropdownOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setBranchDropdownOpen(false)}
          >
            <Pressable style={styles.branchModalCard} onPress={() => {}}>
              <Text style={styles.branchModalTitle}>Select Branch</Text>
              <ScrollView style={{ maxHeight: 320 }}>
                {branchesList.map((b) => {
                  const bValue = b.id;
                  const isSelected = formData.branchId === bValue;
                  return (
                    <Pressable
                      key={`form-branch-${bValue}`}
                      onPress={() => {
                        handleFormChange("branchId", bValue);
                        setBranchDropdownOpen(false);
                      }}
                      style={[
                        styles.branchDropdownItem,
                        isSelected && styles.branchDropdownItemActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.branchDropdownItemText,
                          isSelected && styles.branchDropdownItemTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {b.name || b.id}
                      </Text>
                      {isSelected && (
                        <Text style={styles.branchDropdownCheck}>✓</Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Blue Submit / Update Button */}
        <View style={styles.formFooter}>
          <Pressable
            onPress={handleAddOrUpdateMedicine}
            style={styles.blueSubmitButton}
            accessibilityRole="button"
            accessibilityLabel={
              editingItemId ? "Update Product Details" : "Submit Medicine Entry"
            }
          >
            <Text style={styles.blueSubmitButtonText}>
              {editingItemId ? "Update Product" : "Submit"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 1. 3-DOTS ACTION MENU MODAL */}
      <Modal
        visible={actionMenuModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setActionMenuModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.actionMenuCard}>
            <View style={styles.actionMenuHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionMenuTitle}>
                  {selectedItemForAction?.brandName ||
                    selectedItemForAction?.medicineName}
                </Text>
                <Text style={styles.actionMenuSub}>
                  SKU: {selectedItemForAction?.sku} • Batch:{" "}
                  {selectedItemForAction?.batchNo} • Stock:{" "}
                  {selectedItemForAction?.quantity} units
                </Text>
              </View>
              <Pressable
                onPress={() => setActionMenuModalOpen(false)}
                style={styles.closeActionBtn}
              >
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.actionList}>
              <Pressable
                onPress={() => handleExecuteAction("adjust")}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>⚖️</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>
                    Adjust Stock Quantity
                  </Text>
                  <Text style={styles.actionOptionDesc}>
                    Cycle count, damage write-off, or physical correction
                  </Text>
                </View>
              </Pressable>

              {isMultiBranch && (
                <Pressable
                  onPress={() => handleExecuteAction("transfer")}
                  style={styles.actionOptionRow}
                >
                  <Text style={styles.actionOptionIcon}>🔄</Text>
                  <View style={styles.actionOptionTextCol}>
                    <Text style={styles.actionOptionTitle}>
                      Initiate Inter-Branch Transfer
                    </Text>
                    <Text style={styles.actionOptionDesc}>
                      Send stock to another store or hospital dispensary
                    </Text>
                  </View>
                </Pressable>
              )}

              <Pressable
                onPress={() => handleExecuteAction("barcode")}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>🏷️</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>
                    Print Barcode / Shelf Tag
                  </Text>
                  <Text style={styles.actionOptionDesc}>
                    Print thermal label with SKU, batch & MRP
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteAction("notify-supplier")}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>📢</Text>
                <View style={styles.actionOptionTextCol}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Text style={styles.actionOptionTitle}>
                      Notify Supplier (Low Stock Alert)
                    </Text>
                    {(selectedItemForAction?.quantity < 50 ||
                      selectedItemForAction?.status === "Low Stock" ||
                      selectedItemForAction?.status === "Out of Stock") && (
                      <View
                        style={{
                          backgroundColor: "#F7EDEE",
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "700",
                            color: "#B85C64",
                          }}
                        >
                          Reorder Alert
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.actionOptionDesc}>
                    Send automated replenishment order / PO alert to the
                    supplier's dashboard
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteAction("edit")}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>✏️</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>
                    Edit Medicine Information
                  </Text>
                  <Text style={styles.actionOptionDesc}>
                    Load into entry form to update strength, MRP or shelf
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteAction("delete")}
                style={[styles.actionOptionRow, styles.actionOptionRowDanger]}
              >
                <Text style={styles.actionOptionIcon}>🗑️</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text
                    style={[styles.actionOptionTitle, { color: "#B85C64" }]}
                  >
                    Deactivate / Remove Item
                  </Text>
                  <Text style={styles.actionOptionDesc}>
                    Remove from active inventory listing
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. QUICK QUANTITY ADJUSTMENT MODAL */}
      <Modal
        visible={adjustModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setAdjustModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.adjustModalCard}>
            <View style={styles.adjustModalHeader}>
              <View>
                <Text style={styles.adjustModalTitle}>
                  Adjust Stock: {selectedItemForAction?.brandName}
                </Text>
                <Text style={styles.adjustModalSubtitle}>
                  Current Stock: {selectedItemForAction?.quantity} units • SKU:{" "}
                  {selectedItemForAction?.sku}
                </Text>
              </View>
              <Pressable
                onPress={() => setAdjustModalOpen(false)}
                style={styles.closeActionBtn}
              >
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.adjustModalBody}>
              <View style={styles.formGroupModal}>
                <Text style={styles.fieldLabelModal}>Adjustment Type</Text>
                <View style={styles.adjustTypeRow}>
                  {[
                    { key: "CYCLE_COUNT", label: "Cycle Count", icon: "⚖️" },
                    { key: "DAMAGE_WRITEOFF", label: "Damage (-)", icon: "⚠️" },
                    { key: "CORRECTION", label: "Correction (+)", icon: "✏️" },
                  ].map(({ key, label, icon }) => (
                    <Pressable
                      key={key}
                      onPress={() => {
                        setAdjustType(key);
                        if (key === "DAMAGE_WRITEOFF") {
                          setAdjustSign("-");
                          setAdjustReason("Damaged stock write-off");
                        } else if (key === "CORRECTION") {
                          setAdjustSign("+");
                          setAdjustReason("Inventory physical correction");
                        } else {
                          setAdjustReason("Audit cycle count discrepancy");
                        }
                      }}
                      style={[
                        styles.adjustTypeBtn,
                        adjustType === key && styles.adjustTypeBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.adjustTypeBtnText,
                          adjustType === key && styles.adjustTypeBtnTextActive,
                        ]}
                      >
                        {icon} {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Explicit Sign (+ Add / - Subtract) Selector */}
              <View style={styles.formGroupModal}>
                <Text style={styles.fieldLabelModal}>
                  Operation Sign (Add or Subtract)
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => {
                      if (adjustType !== "DAMAGE_WRITEOFF") {
                        setAdjustSign("+");
                      }
                    }}
                    disabled={adjustType === "DAMAGE_WRITEOFF"}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: adjustSign === "+" ? "#4F8A72" : "#E5DFE4",
                      backgroundColor:
                        adjustSign === "+" ? "#EAF2EE" : "#F8F5F7",
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 6,
                      opacity: adjustType === "DAMAGE_WRITEOFF" ? 0.35 : 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: adjustSign === "+" ? "#4F8A72" : "#77717A",
                      }}
                    >
                      ➕ Add Stock (+)
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setAdjustSign("-")}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: adjustSign === "-" ? "#B85C64" : "#E5DFE4",
                      backgroundColor:
                        adjustSign === "-" ? "#F7EDEE" : "#F8F5F7",
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: adjustSign === "-" ? "#B85C64" : "#77717A",
                      }}
                    >
                      ➖ Subtract Stock (-)
                    </Text>
                  </Pressable>
                </View>
                {adjustType === "DAMAGE_WRITEOFF" && (
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#B85C64",
                      marginTop: 4,
                      fontWeight: "600",
                    }}
                  >
                    ℹ️ Damage write-offs automatically deduct (-) stock from
                    available inventory.
                  </Text>
                )}
                {adjustType === "CORRECTION" && (
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#4F8A72",
                      marginTop: 4,
                      fontWeight: "600",
                    }}
                  >
                    ℹ️ Stock corrections default to adding (+) stock to balance
                    physical inventory.
                  </Text>
                )}
              </View>

              {/* Quantity Change Input with Sign Prefix */}
              <View style={styles.formGroupModal}>
                <Text style={styles.fieldLabelModal}>
                  Quantity to {adjustSign === "+" ? "Add" : "Deduct"} (Units)
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1.5,
                    borderColor: adjustSign === "+" ? "#4F8A72" : "#B85C64",
                    borderRadius: 8,
                    overflow: "hidden",
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  <View
                    style={{
                      backgroundColor:
                        adjustSign === "+" ? "#EAF2EE" : "#F7EDEE",
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "900",
                        color: adjustSign === "+" ? "#4F8A72" : "#B85C64",
                      }}
                    >
                      {adjustSign}
                    </Text>
                  </View>
                  <TextInput
                    style={[
                      styles.adjustInput,
                      { flex: 1, borderWidth: 0, paddingVertical: 10 },
                    ]}
                    value={adjustDelta.replace(/[^0-9]/g, "")}
                    onChangeText={(val) =>
                      setAdjustDelta(val.replace(/[^0-9]/g, ""))
                    }
                    keyboardType="numeric"
                    placeholder="e.g. 10"
                    placeholderTextColor="#77717A"
                  />
                </View>
              </View>

              {/* Live Preview: Current vs After */}
              <View
                style={{
                  backgroundColor: "#F8F5F7",
                  padding: 10,
                  borderRadius: 8,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: "#E5DFE4",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#77717A" }}>
                    Current Available Stock:
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#28242B",
                    }}
                  >
                    {selectedItemForAction?.quantity || 0} units
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#77717A" }}>
                    Adjustment Change:
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "800",
                      color: adjustSign === "+" ? "#4F8A72" : "#B85C64",
                    }}
                  >
                    {adjustSign}{" "}
                    {Math.abs(parseInt(adjustDelta, 10) || 0)} units
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    borderTopWidth: 1,
                    borderTopColor: "#E5DFE4",
                    paddingTop: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: "#28242B",
                    }}
                  >
                    New Calculated Stock:
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "900",
                      color:
                        Number(selectedItemForAction?.quantity || 0) +
                          (adjustSign === "-"
                            ? -Math.abs(parseInt(adjustDelta, 10) || 0)
                            : Math.abs(parseInt(adjustDelta, 10) || 0)) <
                        0
                          ? "#B85C64"
                          : "#B9829A",
                    }}
                  >
                    {Math.max(
                      0,
                      Number(selectedItemForAction?.quantity || 0) +
                        (adjustSign === "-"
                          ? -Math.abs(parseInt(adjustDelta, 10) || 0)
                          : Math.abs(parseInt(adjustDelta, 10) || 0)),
                    )}{" "}
                    units
                  </Text>
                </View>
              </View>

              <View style={styles.formGroupModal}>
                <Text style={styles.fieldLabelModal}>
                  Reason for Adjustment
                </Text>
                <TextInput
                  style={styles.adjustInput}
                  value={adjustReason}
                  onChangeText={setAdjustReason}
                  placeholder="Audit count recount..."
                  placeholderTextColor="#77717A"
                />
              </View>
            </View>

            <View style={styles.adjustModalFooter}>
              <Pressable
                onPress={() => setAdjustModalOpen(false)}
                style={styles.cancelBtn}
                disabled={adjustSaving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveAdjustment}
                style={[
                  styles.saveAdjustBtn,
                  adjustSaving && { opacity: 0.6 },
                ]}
                disabled={adjustSaving}
              >
                <Text style={styles.saveAdjustBtnText}>
                  {adjustSaving ? "Saving to Database..." : "Save Adjustment"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2B. EDIT MEDICINE INFORMATION MODAL */}
      <Modal
        visible={editMedicineModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setEditMedicineModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.actionMenuCard,
              { maxWidth: 640, maxHeight: "90%" },
            ]}
          >
            <View style={styles.actionMenuHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionMenuTitle}>
                  ✏️ Edit Medicine Information
                </Text>
                <Text style={styles.actionMenuSub}>
                  Update medicine catalog entry, pricing, batch & rack details
                </Text>
              </View>
              <Pressable
                onPress={() => setEditMedicineModalOpen(false)}
                style={styles.closeActionBtn}
              >
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={{ padding: 16 }}>
              {/* Row 1: Brand & Medicine / Generic Name */}
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>
                    Brand Name <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    value={editMedicineForm.brandName}
                    onChangeText={(v) =>
                      setEditMedicineForm((p) => ({ ...p, brandName: v }))
                    }
                    placeholder="e.g. Crocin 500"
                    placeholderTextColor="#77717A"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>
                    Generic / Salt Name <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    value={editMedicineForm.genericName}
                    onChangeText={(v) =>
                      setEditMedicineForm((p) => ({
                        ...p,
                        genericName: v,
                        medicineName: v,
                      }))
                    }
                    placeholder="e.g. Paracetamol"
                    placeholderTextColor="#77717A"
                  />
                </View>
              </View>

              {/* Row 2: Strength & Pack Size */}
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>Strength / Dosage</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editMedicineForm.strength}
                    onChangeText={(v) =>
                      setEditMedicineForm((p) => ({ ...p, strength: v }))
                    }
                    placeholder="e.g. 500mg, 100ml"
                    placeholderTextColor="#77717A"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>Pack Size</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editMedicineForm.packSize}
                    onChangeText={(v) =>
                      setEditMedicineForm((p) => ({ ...p, packSize: v }))
                    }
                    placeholder="e.g. 10 Tablets, 1 Strip"
                    placeholderTextColor="#77717A"
                  />
                </View>
              </View>

              {/* Row 3: Manufacturer & Supplier */}
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>Manufacturer</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editMedicineForm.manufacturer}
                    onChangeText={(v) =>
                      setEditMedicineForm((p) => ({ ...p, manufacturer: v }))
                    }
                    placeholder="e.g. Cipla, Sun Pharma, GSK"
                    placeholderTextColor="#77717A"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>
                    Supplier / Distributor
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    value={editMedicineForm.supplierName}
                    onChangeText={(v) =>
                      setEditMedicineForm((p) => ({ ...p, supplierName: v }))
                    }
                    placeholder="e.g. Apex Pharma Distributors"
                    placeholderTextColor="#77717A"
                  />
                </View>
              </View>

              {/* Row 4: SKU/Barcode & Batch No */}
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={styles.fieldLabelModal}>
                      SKU / Barcode <Text style={styles.reqStar}>*</Text>
                    </Text>
                    <Pressable
                      onPress={() => {
                        setFormScannerOpen(true);
                      }}
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        backgroundColor: "#E8D5DD",
                        borderRadius: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: "#B9829A",
                          fontWeight: "700",
                        }}
                      >
                        📷 Scan
                      </Text>
                    </Pressable>
                  </View>
                  <TextInput
                    style={styles.formInput}
                    value={editMedicineForm.sku}
                    onChangeText={(v) =>
                      setEditMedicineForm((p) => ({ ...p, sku: v }))
                    }
                    placeholder="e.g. 890123456789"
                    placeholderTextColor="#77717A"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>
                    Batch Number <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    value={editMedicineForm.batchNo}
                    onChangeText={(v) =>
                      setEditMedicineForm((p) => ({ ...p, batchNo: v }))
                    }
                    placeholder="e.g. B-1001"
                    placeholderTextColor="#77717A"
                  />
                </View>
              </View>

              {/* Row 5: Price (MRP), Stock & Shelf Location */}
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>Price / MRP (₹)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editMedicineForm.amount}
                    onChangeText={(v) =>
                      setEditMedicineForm((p) => ({ ...p, amount: v }))
                    }
                    placeholder="e.g. 25.00"
                    placeholderTextColor="#77717A"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>Current Quantity</Text>
                  <TextInput
                    style={styles.formInput}
                    value={String(editMedicineForm.quantity)}
                    onChangeText={(v) =>
                      setEditMedicineForm((p) => ({ ...p, quantity: v }))
                    }
                    placeholder="e.g. 100"
                    placeholderTextColor="#77717A"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>Shelf / Rack</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editMedicineForm.shelfLocation}
                    onChangeText={(v) =>
                      setEditMedicineForm((p) => ({ ...p, shelfLocation: v }))
                    }
                    placeholder="e.g. A1-S1"
                    placeholderTextColor="#77717A"
                  />
                </View>
              </View>

              {/* Row 6: Toggles */}
              <View
                style={{
                  flexDirection: "row",
                  gap: 12,
                  marginTop: 4,
                  marginBottom: 8,
                }}
              >
                <Pressable
                  onPress={() =>
                    setEditMedicineForm((p) => ({
                      ...p,
                      isRxRequired: !p.isRxRequired,
                    }))
                  }
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    padding: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: editMedicineForm.isRxRequired
                      ? "#B85C64"
                      : "#E5DFE4",
                    backgroundColor: editMedicineForm.isRxRequired
                      ? "#F7EDEE"
                      : "#F8F5F7",
                  }}
                >
                  <Text style={{ fontSize: 16 }}>
                    {editMedicineForm.isRxRequired ? "💊" : "⚪"}
                  </Text>
                  <View>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: editMedicineForm.isRxRequired
                          ? "#B85C64"
                          : "#28242B",
                      }}
                    >
                      Prescription Required (Rx)
                    </Text>
                    <Text style={{ fontSize: 11, color: "#77717A" }}>
                      {editMedicineForm.isRxRequired
                        ? "Requires doctor prescription"
                        : "Over-the-counter (OTC)"}
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() =>
                    setEditMedicineForm((p) => ({ ...p, isActive: !p.isActive }))
                  }
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    padding: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: editMedicineForm.isActive
                      ? "#4F8A72"
                      : "#E5DFE4",
                    backgroundColor: editMedicineForm.isActive
                      ? "#EAF2EE"
                      : "#F8F5F7",
                  }}
                >
                  <Text style={{ fontSize: 16 }}>
                    {editMedicineForm.isActive ? "🟢" : "⚪"}
                  </Text>
                  <View>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: editMedicineForm.isActive
                          ? "#4F8A72"
                          : "#77717A",
                      }}
                    >
                      Active in Catalog
                    </Text>
                    <Text style={{ fontSize: 11, color: "#77717A" }}>
                      {editMedicineForm.isActive
                        ? "Visible in POS & store search"
                        : "Hidden from sale"}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </ScrollView>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 12,
                padding: 16,
                borderTopWidth: 1,
                borderTopColor: "#E5DFE4",
                backgroundColor: "#F8F5F7",
              }}
            >
              <Pressable
                onPress={() => setEditMedicineModalOpen(false)}
                style={styles.cancelBtn}
                disabled={editMedicineSaving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleUpdateMedicineModal}
                style={[
                  styles.printBarcodePrimaryBtn,
                  { backgroundColor: "#B9829A" },
                  editMedicineSaving && { opacity: 0.6 },
                ]}
                disabled={editMedicineSaving}
              >
                <Text style={styles.printBarcodePrimaryBtnText}>
                  {editMedicineSaving
                    ? "Saving to Database..."
                    : "💾 Save & Update Medicine"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. INTER-BRANCH STOCK TRANSFER MODAL */}
      <Modal
        visible={transferModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setTransferModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.transferModalCard}>
            {/* Header */}
            <View style={styles.transferModalHeader}>
              <View style={{ flex: 1 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <View style={styles.transferHeaderBadge}>
                    <Text style={styles.transferHeaderBadgeIcon}>🔄</Text>
                  </View>
                  <Text style={styles.transferModalTitle}>
                    Initiate Inter-Branch Stock Transfer
                  </Text>
                </View>
                <Text style={styles.transferModalSubtitle}>
                  Move inventory stock between hospital main store, OPD clinics,
                  and satellite branches
                </Text>
              </View>
              <Pressable
                onPress={() => setTransferModalOpen(false)}
                style={styles.closeActionBtn}
              >
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            {/* Body */}
            <ScrollView
              style={{ maxHeight: 520 }}
              contentContainerStyle={styles.transferModalBody}
            >
              {/* Product Info Card */}
              <View style={styles.transferProductCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.transferMedTitle}>
                    {selectedItemForAction?.brandName ||
                      selectedItemForAction?.medicineName}
                  </Text>
                  <Text style={styles.transferMedMeta}>
                    Generic:{" "}
                    {selectedItemForAction?.medicineName ||
                      selectedItemForAction?.genericName}{" "}
                    • Strength: {selectedItemForAction?.strength || "500mg"}
                  </Text>
                  <View style={styles.transferPillsRow}>
                    <View style={styles.transferPill}>
                      <Text style={styles.transferPillText}>
                        SKU: {selectedItemForAction?.sku}
                      </Text>
                    </View>
                    <View style={styles.transferPill}>
                      <Text style={styles.transferPillText}>
                        Batch: {selectedItemForAction?.batchNo}
                      </Text>
                    </View>
                    <View style={styles.transferPillTeal}>
                      <Text style={styles.transferPillTextTeal}>
                        Source Stock: {selectedItemForAction?.quantity} units
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Error Alert Box if any */}
              {transferError ? (
                <View style={styles.transferErrorAlert}>
                  <Text style={styles.transferErrorText}>
                    ⚠️ {transferError}
                  </Text>
                </View>
              ) : null}

              {/* Branch Selection Section */}
              <View
                style={[
                  styles.branchSelectionGrid,
                  isMobile && styles.branchSelectionGridMobile,
                ]}
              >
                {/* Source Branch (From) */}
                <View
                  style={[styles.branchCol, isMobile && styles.branchColMobile]}
                >
                  <Text style={styles.fieldLabelModal}>
                    From Branch (Source) <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <View style={styles.branchPickerBox}>
                    <ScrollView
                      style={{ maxHeight: 150 }}
                      nestedScrollEnabled={true}
                    >
                      {branchesList.map((b) => {
                        const bName = b.name || b.id;
                        const isSelected = fromBranch === bName;
                        return (
                          <Pressable
                            key={`from-${b.id}`}
                            onPress={() => {
                              setFromBranch(bName);
                              if (toBranch === bName) {
                                const other = branchesList.find(
                                  (x) => (x.name || x.id) !== bName,
                                );
                                if (other) setToBranch(other.name || other.id);
                              }
                            }}
                            style={[
                              styles.branchOptionItem,
                              isSelected && styles.branchOptionItemFromActive,
                            ]}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              <View
                                style={[
                                  styles.branchDot,
                                  isSelected && styles.branchDotFromActive,
                                ]}
                              />
                              <View style={styles.branchOptionTextCol}>
                                <Text
                                  style={[
                                    styles.branchOptionName,
                                    isSelected &&
                                    styles.branchOptionNameFromActive,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {bName}
                                </Text>
                                <Text style={styles.branchOptionCity}>
                                  {b.city || "Pune"}
                                </Text>
                              </View>
                            </View>
                            {isSelected && (
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: "800",
                                  color: "#B9829A",
                                }}
                              >
                                SOURCE
                              </Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>

                {/* Direction Indicator */}
                <View
                  style={[
                    styles.transferDirectionCol,
                    isMobile && styles.transferDirectionColMobile,
                  ]}
                >
                  <View style={styles.transferDirectionCircle}>
                    <Text style={styles.transferDirectionArrow}>
                      {isMobile ? "⬇" : "➔"}
                    </Text>
                  </View>
                </View>

                {/* Destination Branch (To) */}
                <View
                  style={[styles.branchCol, isMobile && styles.branchColMobile]}
                >
                  <Text style={styles.fieldLabelModal}>
                    To Branch (Destination){" "}
                    <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <View style={styles.branchPickerBox}>
                    <ScrollView
                      style={{ maxHeight: 150 }}
                      nestedScrollEnabled={true}
                    >
                      {branchesList.map((b) => {
                        const bName = b.name || b.id;
                        const isSelected = toBranch === bName;
                        const isDisabled = fromBranch === bName;
                        return (
                          <Pressable
                            key={`to-${b.id}`}
                            disabled={isDisabled}
                            onPress={() => setToBranch(bName)}
                            style={[
                              styles.branchOptionItem,
                              isSelected && styles.branchOptionItemToActive,
                              isDisabled && styles.branchOptionDisabled,
                            ]}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              <View
                                style={[
                                  styles.branchDot,
                                  isSelected && styles.branchDotToActive,
                                ]}
                              />
                              <View style={styles.branchOptionTextCol}>
                                <Text
                                  style={[
                                    styles.branchOptionName,
                                    isSelected &&
                                    styles.branchOptionNameToActive,
                                    isDisabled &&
                                    styles.branchOptionNameDisabled,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {bName} {isDisabled ? "(Current Source)" : ""}
                                </Text>
                                <Text style={styles.branchOptionCity}>
                                  {b.city || "Pune"}
                                </Text>
                              </View>
                            </View>
                            {isSelected && (
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: "800",
                                  color: "#B9829A",
                                }}
                              >
                                DESTINATION
                              </Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              </View>

              {/* Quantity Input & Preset Buttons */}
              <View style={styles.formGroupModal}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={styles.fieldLabelModal}>
                    Stock Quantity to Transfer{" "}
                    <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <Text style={{ fontSize: 12, color: "#77717A" }}>
                    Available:{" "}
                    <Text style={{ fontWeight: "700", color: "#B9829A" }}>
                      {selectedItemForAction?.quantity || 0} units
                    </Text>
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <TextInput
                    style={[
                      styles.adjustInput,
                      {
                        flex: 1,
                        minWidth: 140,
                        fontSize: 15,
                        fontWeight: "700",
                        color: "#28242B",
                      },
                    ]}
                    value={transferQty}
                    onChangeText={setTransferQty}
                    keyboardType="numeric"
                    placeholder="Enter units (e.g. 50)"
                  />
                  {/* Preset Buttons */}
                  {["10", "25", "50", "100"].map((preset) => (
                    <Pressable
                      key={preset}
                      onPress={() => setTransferQty(preset)}
                      style={[
                        styles.transferPresetBtn,
                        transferQty === preset &&
                        styles.transferPresetBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.transferPresetText,
                          transferQty === preset &&
                          styles.transferPresetTextActive,
                        ]}
                      >
                        +{preset}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Transfer Stock Calculation Preview */}
              {selectedItemForAction && (
                <View style={styles.transferCalcBox}>
                  <Text style={styles.transferCalcTitle}>
                    Stock Impact Summary:
                  </Text>
                  <View style={styles.transferCalcRow}>
                    <Text style={styles.transferCalcLabel}>
                      • {fromBranch || "Source Branch"}:
                    </Text>
                    <Text
                      style={{
                        color: "#B85C64",
                        fontWeight: "700",
                        fontSize: 12.5,
                      }}
                    >
                      {selectedItemForAction.quantity} ➔{" "}
                      {Math.max(
                        0,
                        selectedItemForAction.quantity -
                        (parseInt(transferQty, 10) || 0),
                      )}{" "}
                      units (-{parseInt(transferQty, 10) || 0})
                    </Text>
                  </View>
                  <View style={styles.transferCalcRow}>
                    <Text style={styles.transferCalcLabel}>
                      • {toBranch || "Destination Branch"}:
                    </Text>
                    <Text
                      style={{
                        color: "#4F8A72",
                        fontWeight: "700",
                        fontSize: 12.5,
                      }}
                    >
                      +{parseInt(transferQty, 10) || 0} units added to target
                      branch stock
                    </Text>
                  </View>
                </View>
              )}

              {/* Reason / Reference Input */}
              <View style={styles.formGroupModal}>
                <Text style={styles.fieldLabelModal}>
                  Transfer Reason / Reference Notes
                </Text>
                <TextInput
                  style={styles.adjustInput}
                  value={transferReason}
                  onChangeText={setTransferReason}
                  placeholder="e.g. Emergency stock transfer to OPD branch"
                />
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={styles.adjustModalFooter}>
              <Pressable
                onPress={() => setTransferModalOpen(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmTransfer}
                style={styles.confirmTransferBtn}
              >
                <Text style={styles.confirmTransferBtnText}>
                  🔄 Confirm & Transfer Stock
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4. BARCODE & SHELF TAG PRINTING MODAL */}
      <Modal
        visible={barcodeModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setBarcodeModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.barcodeModalCard}>
            {/* Header */}
            <View style={styles.barcodeModalHeader}>
              <View style={{ flex: 1 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <View style={styles.barcodeHeaderBadge}>
                    <Text style={{ fontSize: 18 }}>🏷️</Text>
                  </View>
                  <Text style={styles.barcodeModalTitle}>
                    Barcode & Shelf Tag Generator
                  </Text>
                </View>
                <Text style={styles.barcodeModalSubtitle}>
                  Print thermal labels and shelf edge tags for inventory
                  scanning & shelf identification
                </Text>
              </View>
              <Pressable
                onPress={() => setBarcodeModalOpen(false)}
                style={styles.closeActionBtn}
              >
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            {/* Modal Body */}
            <ScrollView
              style={{ maxHeight: 520 }}
              contentContainerStyle={styles.barcodeModalBody}
            >
              {/* Top: Live Print Preview Box */}
              <View style={styles.previewSectionWrapper}>
                <View style={styles.previewSectionHeader}>
                  <Text style={styles.previewSectionTitle}>
                    LIVE LABEL PREVIEW (
                    {barcodeConfig.format === "thermal_50x25"
                      ? "50mm × 25mm Thermal"
                      : barcodeConfig.format === "shelf_70x35"
                        ? "70mm × 35mm Shelf Edge"
                        : "A4 Multi-Grid Sheet"}
                    )
                  </Text>
                  <View style={styles.liveTagBadge}>
                    <View style={styles.liveTagDot} />
                    <Text style={styles.liveTagBadgeText}>
                      {barcodeLoading
                        ? "Fetching from DB..."
                        : "Ready to Print"}
                    </Text>
                  </View>
                </View>

                {/* The Physical Label Preview Card */}
                <View
                  style={[
                    styles.physicalLabelCard,
                    barcodeConfig.format === "shelf_70x35" &&
                    styles.physicalLabelCardShelf,
                    barcodeConfig.format === "sheet_a4" &&
                    styles.physicalLabelCardA4,
                  ]}
                >
                  {/* Pharmacy Banner */}
                  <View style={styles.labelHeaderRow}>
                    <Text style={styles.labelPharmacyName}>
                      🏥 {barcodeItemData?.pharmacyName || "FALAH PHARMACY"}
                    </Text>
                    <Text style={styles.labelBranchText}>
                      {barcodeItemData?.branchName || "Main Store"}
                    </Text>
                  </View>

                  {/* Medicine Name & Strength */}
                  <View style={styles.labelMedInfoRow}>
                    <Text style={styles.labelMedName} numberOfLines={1}>
                      {barcodeItemData?.brandName ||
                        barcodeItemData?.medicineName ||
                        "Medicine Item"}
                    </Text>
                    {barcodeItemData?.strength ? (
                      <Text style={styles.labelMedStrength}>
                        {barcodeItemData.strength}
                      </Text>
                    ) : null}
                  </View>

                  {/* Generic Name */}
                  {barcodeConfig.showGeneric && barcodeItemData?.genericName ? (
                    <Text style={styles.labelGenericName} numberOfLines={1}>
                      {barcodeItemData.genericName}
                    </Text>
                  ) : null}

                  {/* Metadata Row: Batch, Expiry, Price */}
                  <View style={styles.labelMetaRow}>
                    {barcodeConfig.showBatch && (
                      <View style={styles.labelMetaItem}>
                        <Text style={styles.labelMetaLabel}>BATCH:</Text>
                        <Text style={styles.labelMetaValue}>
                          {barcodeItemData?.batchNo || "B-1001"}
                        </Text>
                      </View>
                    )}
                    {barcodeConfig.showExpiry && (
                      <View style={styles.labelMetaItem}>
                        <Text style={styles.labelMetaLabel}>EXP:</Text>
                        <Text style={styles.labelMetaValue}>
                          {barcodeItemData?.expiryDate || "N/A"}
                        </Text>
                      </View>
                    )}
                    {barcodeConfig.showPrice && (
                      <View style={styles.labelMetaItemPrice}>
                        <Text style={styles.labelPriceTag}>
                          MRP {barcodeItemData?.mrp || "₹0.00"}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Second Meta Row: Shelf Location & Pack Size */}
                  <View style={styles.labelShelfRow}>
                    {barcodeConfig.showShelf && (
                      <View style={styles.shelfTagBadge}>
                        <Text style={styles.shelfTagText}>
                          📍 {barcodeItemData?.shelfLocation || "Rack A1"}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.labelPackSizeText}>
                      Pack: {barcodeItemData?.packSize || "10s"}
                    </Text>
                  </View>

                  {/* Barcode & QR Code Visualization */}
                  <View style={styles.labelBarcodeWrapper}>
                    {Platform.OS === "web" ? (
                      <View style={{ alignItems: "center", justifyContent: "center", width: "100%" }}>
                        {barcodeConfig.codeType === "qr" ? (
                          <div
                            style={{
                              backgroundColor: "#FFFFFF",
                              padding: 6,
                              borderRadius: 8,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderWidth: 1,
                              borderStyle: "solid",
                              borderColor: "#E5DFE4",
                            }}
                            dangerouslySetInnerHTML={{
                              __html:
                                barcodeItemData?.qrBarcode ||
                                generateOfflineQRCodeSvg(
                                  barcodeItemData?.barcode || barcodeItemData?.sku || "MED-001",
                                  110,
                                ),
                            }}
                          />
                        ) : barcodeConfig.codeType === "both" ? (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              width: "100%",
                              gap: 10,
                              backgroundColor: "#FFFFFF",
                              padding: 6,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderStyle: "solid",
                              borderColor: "#E5DFE4",
                            }}
                          >
                            <div
                              style={{ flex: 1, overflow: "hidden" }}
                              dangerouslySetInnerHTML={{
                                __html:
                                  barcodeItemData?.svgBarcode ||
                                  generateOfflineBarcodeSvg(
                                    barcodeItemData?.barcode || barcodeItemData?.sku || "MED-001",
                                    { barHeight: 46, moduleWidth: 1.8 },
                                  ),
                              }}
                            />
                            <div
                              dangerouslySetInnerHTML={{
                                __html:
                                  barcodeItemData?.qrBarcode ||
                                  generateOfflineQRCodeSvg(
                                    barcodeItemData?.barcode || barcodeItemData?.sku || "MED-001",
                                    74,
                                  ),
                              }}
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "100%",
                              backgroundColor: "#FFFFFF",
                              borderRadius: 6,
                              padding: 4,
                            }}
                            dangerouslySetInnerHTML={{
                              __html:
                                barcodeItemData?.svgBarcode ||
                                generateOfflineBarcodeSvg(
                                  barcodeItemData?.barcode || barcodeItemData?.sku || "MED-001",
                                  { barHeight: 52, moduleWidth: 2, quietZoneModules: 14 },
                                ),
                            }}
                          />
                        )}
                      </View>
                    ) : (
                      <Text style={styles.barcodeFallbackText}>
                        {barcodeItemData?.barcode || barcodeItemData?.sku || "SKU-001"}
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Bottom: Configuration & Controls */}
              <View style={styles.barcodeConfigGrid}>
                {/* Code Engine Selector: 1D Barcode vs QR Code vs Both */}
                <View style={styles.barcodeConfigCard}>
                  <Text style={styles.barcodeConfigCardTitle}>
                    ⚡ Barcode & QR Code Engine (Scanner Compatible)
                  </Text>
                  <View style={styles.formatOptionsRow}>
                    <Pressable
                      onPress={() =>
                        setBarcodeConfig((prev) => ({
                          ...prev,
                          codeType: "barcode",
                        }))
                      }
                      style={[
                        styles.formatOptionBtn,
                        barcodeConfig.codeType === "barcode" &&
                        styles.formatOptionBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.formatOptionTitle,
                          barcodeConfig.codeType === "barcode" &&
                          styles.formatOptionTitleActive,
                        ]}
                      >
                        🏷️ 1D Barcode (Code-128)
                      </Text>
                      <Text style={styles.formatOptionDesc}>
                        Standard Retail & Pharmacy Scanners
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        setBarcodeConfig((prev) => ({
                          ...prev,
                          codeType: "qr",
                        }))
                      }
                      style={[
                        styles.formatOptionBtn,
                        barcodeConfig.codeType === "qr" &&
                        styles.formatOptionBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.formatOptionTitle,
                          barcodeConfig.codeType === "qr" &&
                          styles.formatOptionTitleActive,
                        ]}
                      >
                        ⚡ Fast QR Code
                      </Text>
                      <Text style={styles.formatOptionDesc}>
                        Instant Mobile & Webcam Detection
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        setBarcodeConfig((prev) => ({
                          ...prev,
                          codeType: "both",
                        }))
                      }
                      style={[
                        styles.formatOptionBtn,
                        barcodeConfig.codeType === "both" &&
                        styles.formatOptionBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.formatOptionTitle,
                          barcodeConfig.codeType === "both" &&
                          styles.formatOptionTitleActive,
                        ]}
                      >
                        🔄 Dual (1D + 2D)
                      </Text>
                      <Text style={styles.formatOptionDesc}>
                        Universal Scan Compatibility
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* 1. Label Format Selector */}
                <View style={styles.barcodeConfigCard}>
                  <Text style={styles.barcodeConfigCardTitle}>
                    📐 Label Format & Size
                  </Text>
                  <View style={styles.formatOptionsRow}>
                    <Pressable
                      onPress={() =>
                        setBarcodeConfig((prev) => ({
                          ...prev,
                          format: "thermal_50x25",
                        }))
                      }
                      style={[
                        styles.formatOptionBtn,
                        barcodeConfig.format === "thermal_50x25" &&
                        styles.formatOptionBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.formatOptionTitle,
                          barcodeConfig.format === "thermal_50x25" &&
                          styles.formatOptionTitleActive,
                        ]}
                      >
                        🏷️ 50 × 25 mm
                      </Text>
                      <Text style={styles.formatOptionDesc}>
                        Thermal Strip (Box/Strip)
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        setBarcodeConfig((prev) => ({
                          ...prev,
                          format: "shelf_70x35",
                        }))
                      }
                      style={[
                        styles.formatOptionBtn,
                        barcodeConfig.format === "shelf_70x35" &&
                        styles.formatOptionBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.formatOptionTitle,
                          barcodeConfig.format === "shelf_70x35" &&
                          styles.formatOptionTitleActive,
                        ]}
                      >
                        📋 70 × 35 mm
                      </Text>
                      <Text style={styles.formatOptionDesc}>
                        Shelf Edge Tag (Bin/Rack)
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        setBarcodeConfig((prev) => ({
                          ...prev,
                          format: "sheet_a4",
                        }))
                      }
                      style={[
                        styles.formatOptionBtn,
                        barcodeConfig.format === "sheet_a4" &&
                        styles.formatOptionBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.formatOptionTitle,
                          barcodeConfig.format === "sheet_a4" &&
                          styles.formatOptionTitleActive,
                        ]}
                      >
                        📄 A4 Sheet
                      </Text>
                      <Text style={styles.formatOptionDesc}>
                        24 Labels Multi-Grid
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* 2. Number of Copies */}
                <View style={styles.barcodeConfigCard}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={styles.barcodeConfigCardTitle}>
                      🔢 Number of Copies to Print
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: "#B9829A",
                      }}
                    >
                      Total: {barcodeConfig.copies} Label
                      {Number(barcodeConfig.copies) > 1 ? "s" : ""}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      alignItems: "center",
                      marginTop: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <TextInput
                      style={styles.copiesInput}
                      value={String(barcodeConfig.copies)}
                      onChangeText={(val) =>
                        setBarcodeConfig((prev) => ({ ...prev, copies: val }))
                      }
                      keyboardType="numeric"
                    />
                    {["1", "2", "5", "10", "25", "50"].map((preset) => (
                      <Pressable
                        key={`preset-${preset}`}
                        onPress={() =>
                          setBarcodeConfig((prev) => ({
                            ...prev,
                            copies: preset,
                          }))
                        }
                        style={[
                          styles.presetPill,
                          String(barcodeConfig.copies) === preset &&
                          styles.presetPillActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.presetPillText,
                            String(barcodeConfig.copies) === preset &&
                            styles.presetPillTextActive,
                          ]}
                        >
                          {preset}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* 3. Include / Toggle Elements */}
                <View style={styles.barcodeConfigCard}>
                  <Text style={styles.barcodeConfigCardTitle}>
                    👁️ Elements to Include on Tag
                  </Text>
                  <View style={styles.togglesWrapRow}>
                    <Pressable
                      onPress={() =>
                        setBarcodeConfig((prev) => ({
                          ...prev,
                          showPrice: !prev.showPrice,
                        }))
                      }
                      style={[
                        styles.toggleChip,
                        barcodeConfig.showPrice && styles.toggleChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.toggleChipText,
                          barcodeConfig.showPrice &&
                          styles.toggleChipTextActive,
                        ]}
                      >
                        {barcodeConfig.showPrice ? "✓" : "+"} MRP (₹)
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        setBarcodeConfig((prev) => ({
                          ...prev,
                          showExpiry: !prev.showExpiry,
                        }))
                      }
                      style={[
                        styles.toggleChip,
                        barcodeConfig.showExpiry && styles.toggleChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.toggleChipText,
                          barcodeConfig.showExpiry &&
                          styles.toggleChipTextActive,
                        ]}
                      >
                        {barcodeConfig.showExpiry ? "✓" : "+"} Expiry Date
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        setBarcodeConfig((prev) => ({
                          ...prev,
                          showBatch: !prev.showBatch,
                        }))
                      }
                      style={[
                        styles.toggleChip,
                        barcodeConfig.showBatch && styles.toggleChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.toggleChipText,
                          barcodeConfig.showBatch &&
                          styles.toggleChipTextActive,
                        ]}
                      >
                        {barcodeConfig.showBatch ? "✓" : "+"} Batch No
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        setBarcodeConfig((prev) => ({
                          ...prev,
                          showShelf: !prev.showShelf,
                        }))
                      }
                      style={[
                        styles.toggleChip,
                        barcodeConfig.showShelf && styles.toggleChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.toggleChipText,
                          barcodeConfig.showShelf &&
                          styles.toggleChipTextActive,
                        ]}
                      >
                        {barcodeConfig.showShelf ? "✓" : "+"} Shelf Location
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        setBarcodeConfig((prev) => ({
                          ...prev,
                          showGeneric: !prev.showGeneric,
                        }))
                      }
                      style={[
                        styles.toggleChip,
                        barcodeConfig.showGeneric && styles.toggleChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.toggleChipText,
                          barcodeConfig.showGeneric &&
                          styles.toggleChipTextActive,
                        ]}
                      >
                        {barcodeConfig.showGeneric ? "✓" : "+"} Generic Name
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* 4. Backend Route Status Alert */}
                <View style={styles.apiPreviewBox}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: "#4F8A72",
                      }}
                    />
                    <Text style={styles.apiPreviewText}>
                      Backend Connected: GET /api/inventory/
                      {barcodeItemData?.id || barcodeItemData?.sku}/barcode
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Footer Actions */}
            <View style={styles.barcodeModalFooter}>
              <View
                style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
              >
                <Pressable
                  onPress={handleCopyBarcode}
                  style={styles.secondaryActionBtn}
                >
                  <Text style={styles.secondaryActionBtnText}>
                    📋 Copy Barcode
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleDownloadSvg}
                  style={styles.secondaryActionBtn}
                >
                  <Text style={styles.secondaryActionBtnText}>
                    💾 Export SVG
                  </Text>
                </Pressable>
              </View>

              <View
                style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
              >
                <Pressable
                  onPress={() => setBarcodeModalOpen(false)}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handlePrintBarcodeLabel}
                  style={styles.printBarcodePrimaryBtn}
                >
                  <Text style={styles.printBarcodePrimaryBtnText}>
                    🖨️ Print Thermal Label ({barcodeConfig.copies})
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bulk Catalog CSV Import Modal (PRD-10, DAT-01) */}
      <BulkImportModal
        visible={bulkImportModalOpen}
        onClose={() => setBulkImportModalOpen(false)}
        onImportComplete={() => loadInventoryData()}
        onShowToast={onShowToast}
        selectedBranch={selectedBranch}
      />
      {/* Table Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={async (code) => {
          const raw = String(code || "").trim();
          if (!raw) return;
          const enteredCode = raw.toLowerCase();
          const cleanWithoutLeadingZero = enteredCode.startsWith("0")
            ? enteredCode.replace(/^0+/, "")
            : enteredCode;
          const cleanWithLeadingZero =
            enteredCode.length === 12 ? "0" + enteredCode : enteredCode;

          setScannerOpen(false);
          setScannedCode(raw);

          // 1. Search in-memory stockItems
          let matches = stockItems.filter((item) =>
            [
              item.barcode,
              item.barcodeNumber,
              item.barcode_number,
              item.sku,
            ].some((value) => {
              if (value == null) return false;
              const v = String(value).trim().toLowerCase();
              return (
                v === enteredCode ||
                v === cleanWithoutLeadingZero ||
                v === cleanWithLeadingZero ||
                (enteredCode.length >= 6 && v.includes(enteredCode))
              );
            }),
          );

          // 2. If not found in current page, query backend database
          if (matches.length === 0) {
            try {
              const rawBranch =
                typeof selectedBranch === "object" && selectedBranch !== null
                  ? selectedBranch.id
                  : selectedBranch;
              const branchIdParam =
                rawBranch &&
                rawBranch !== "All Branches" &&
                rawBranch !== "all" &&
                rawBranch !== "No Active Branch"
                  ? rawBranch
                  : undefined;

              let serverProducts = await fetchCashierProducts(
                "",
                raw,
                branchIdParam,
              );
              if (!Array.isArray(serverProducts) || serverProducts.length === 0) {
                serverProducts = await fetchCashierProducts(
                  raw,
                  "",
                  branchIdParam,
                );
              }
              if (
                (!Array.isArray(serverProducts) || serverProducts.length === 0) &&
                cleanWithoutLeadingZero !== enteredCode
              ) {
                serverProducts = await fetchCashierProducts(
                  "",
                  cleanWithoutLeadingZero,
                  branchIdParam,
                );
              }

              if (Array.isArray(serverProducts) && serverProducts.length > 0) {
                matches = serverProducts.map((p) => ({
                  id: p.id,
                  productId: p.id,
                  medicineName: p.name || p.generic,
                  brandName: p.brandName || p.brand || p.name,
                  genericName: p.generic || p.name,
                  sku: p.sku || raw,
                  barcode: p.barcode || p.sku || raw,
                  batchNo: p.batch || "N/A",
                  batchNumber: p.batch || "N/A",
                  quantity: p.stock ?? 0,
                  amount: p.mrp ? `₹${Number(p.mrp).toFixed(2)}` : "—",
                  mrp: p.mrp ? `₹${Number(p.mrp).toFixed(2)}` : "—",
                  shelfLocation: p.shelfLocation || "Dispensary Rack",
                  status:
                    (p.stock ?? 0) < 50
                      ? (p.stock ?? 0) === 0
                        ? "Out of Stock"
                        : "Low Stock"
                      : "In Stock",
                  supplierName: p.supplierName || "Apex Pharma",
                  supplierEmail: p.supplierEmail || "orders@apexpharma.com",
                  supplierPhone: p.supplierPhone || "+91 98765 43210",
                }));
              }
            } catch (err) {
              console.warn("Backend barcode search failed:", err.message);
            }
          }

          setScannedProducts(matches);
          setScanError(
            matches.length === 0
              ? `No medicine found in database with barcode: ${raw}`
              : "",
          );
        }}
        mode="product"
        title="Scan Product Barcode"
      />

      {/* Form Barcode Scanner Modal (Invoked from SKU input) */}
      <BarcodeScannerModal
        visible={formScannerOpen}
        onClose={() => setFormScannerOpen(false)}
        onScan={handleFormBarcodeScanned}
        mode="product"
        title="Scan Barcode into Medicine Entry"
      />

      {/* Scanned Product Details Modal */}
      <Modal
        visible={scannedProducts.length > 0 || Boolean(scanError)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setScannedProducts([]);
          setScanError("");
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 16,
              padding: 20,
              width: "100%",
              maxWidth: 540,
              maxHeight: "85%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: scanError ? "#B85C64" : "#28242B",
                }}
              >
                {scanError ? "Product Not Found" : "Scanned Medicine Details"}
              </Text>
              <Pressable
                onPress={() => {
                  setScannedProducts([]);
                  setScanError("");
                  setScannedCode("");
                }}
                style={{ padding: 4 }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    color: "#77717A",
                    fontWeight: "700",
                  }}
                >
                  ✕
                </Text>
              </Pressable>
            </View>

            <Text style={{ color: "#77717A", marginBottom: 16 }}>
              Scanned code:{" "}
              <Text style={{ fontWeight: "700", color: "#B9829A" }}>
                {scannedCode}
              </Text>
            </Text>

            <ScrollView>
              {scanError ? (
                <View
                  style={{
                    backgroundColor: "#F7EDEE",
                    borderRadius: 12,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: "#F7EDEE",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>🔍</Text>
                  <Text
                    style={{
                      color: "#B85C64",
                      fontWeight: "700",
                      fontSize: 15,
                      textAlign: "center",
                      marginBottom: 6,
                    }}
                  >
                    {scanError}
                  </Text>
                  <Text
                    style={{
                      color: "#7F1D1D",
                      fontSize: 13,
                      textAlign: "center",
                      marginBottom: 16,
                    }}
                  >
                    Would you like to register this medicine in the database now?
                  </Text>

                  <Pressable
                    onPress={() => {
                      const codeToLoad = scannedCode;
                      setScannedProducts([]);
                      setScanError("");
                      setScannedCode("");
                      setEditingItemId(null);
                      setFormData((prev) => ({
                        ...prev,
                        sku: codeToLoad,
                      }));
                      if (onShowToast) {
                        onShowToast(
                          `➕ Barcode "${codeToLoad}" loaded into Add Medicine form.`,
                        );
                      }
                    }}
                    style={{
                      backgroundColor: "#B9829A",
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 8,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      ➕ Add New Medicine with this Barcode
                    </Text>
                  </Pressable>
                </View>
              ) : (
                scannedProducts.map((item, index) => (
                  <View
                    key={String(item.id || `${item.sku}-${index}`)}
                    style={{
                      borderWidth: 1,
                      borderColor: "#E5DFE4",
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 12,
                      backgroundColor: "#F8F5F7",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 10,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 17,
                            fontWeight: "700",
                            color: "#B9829A",
                          }}
                        >
                          {item.brandName ||
                            item.medicineName ||
                            item.name ||
                            "Medicine"}
                        </Text>
                        <Text style={{ fontSize: 12, color: "#77717A" }}>
                          {item.genericName || item.medicineName}
                        </Text>
                      </View>
                      <View
                        style={{
                          backgroundColor:
                            Number(item.quantity) < 50
                              ? Number(item.quantity) === 0
                                ? "#F7EDEE"
                                : "#F7F0E5"
                              : "#EAF2EE",
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color:
                              Number(item.quantity) < 50
                                ? Number(item.quantity) === 0
                                  ? "#B85C64"
                                  : "#C49752"
                                : "#4F8A72",
                          }}
                        >
                          {item.status ||
                            (Number(item.quantity) < 50
                              ? "Low Stock"
                              : "In Stock")}
                        </Text>
                      </View>
                    </View>

                    {[
                      ["Barcode / SKU", item.barcode || item.sku || "—"],
                      ["Batch No", item.batchNo || item.batchNumber || "—"],
                      ["Available Stock", `${item.quantity ?? 0} units`],
                      ["MRP", item.mrp ?? item.amount ?? "—"],
                      ["Shelf Location", item.shelfLocation || "—"],
                    ].map(([label, value]) => (
                      <View
                        key={label}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          paddingVertical: 5,
                          borderBottomWidth: 1,
                          borderBottomColor: "#F8F5F7",
                        }}
                      >
                        <Text style={{ color: "#77717A", fontSize: 13 }}>
                          {label}
                        </Text>
                        <Text
                          style={{
                            color: "#28242B",
                            fontWeight: "600",
                            fontSize: 13,
                          }}
                        >
                          {String(value)}
                        </Text>
                      </View>
                    ))}

                    {/* Quick Actions for Scanned Item */}
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        marginTop: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <Pressable
                        onPress={() => {
                          setScannedProducts([]);
                          setScanError("");
                          setScannedCode("");
                          setEditingItemId(item.id);
                          setFormData({
                            medicineName:
                              item.medicineName || item.genericName || "",
                            brandName: item.brandName || "",
                            genericName:
                              item.genericName || item.medicineName || "",
                            strength: item.strength || "",
                            packSize: item.packSize || "",
                            manufacturer: item.manufacturer || "",
                            supplierName: item.supplierName || "",
                            amount: item.amount
                              ? String(item.amount).replace(/[^0-9.]/g, "")
                              : item.mrp
                                ? String(item.mrp).replace(/[^0-9.]/g, "")
                                : "",
                            sku: item.sku || "",
                            batchNo: item.batchNo || "",
                            quantity:
                              item.quantity !== undefined
                                ? String(item.quantity)
                                : "",
                            branchId: item.branchId || "",
                            shelfLocation: item.shelfLocation || "",
                          });
                          if (onShowToast) {
                            onShowToast(
                              `✏️ Loaded "${item.brandName || item.medicineName}" into form for editing.`,
                            );
                          }
                        }}
                        style={{
                          backgroundColor: "#F8F5F7",
                          borderWidth: 1,
                          borderColor: "#E5DFE4",
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: "#28242B",
                          }}
                        >
                          ✏️ Edit Form
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          setScannedProducts([]);
                          setScanError("");
                          setScannedCode("");
                          setSelectedItemForAction(item);
                          setAdjustDelta("10");
                          setAdjustModalOpen(true);
                        }}
                        style={{
                          backgroundColor: "#F8F5F7",
                          borderWidth: 1,
                          borderColor: "#E5DFE4",
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: "#28242B",
                          }}
                        >
                          ⚖️ Adjust Stock
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          setScannedProducts([]);
                          setScanError("");
                          setScannedCode("");
                          handleOpenSupplierModal(item);
                        }}
                        style={{
                          backgroundColor: "#F7F0E5",
                          borderWidth: 1,
                          borderColor: "#C49752",
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: "#C49752",
                          }}
                        >
                          📢 Notify Supplier
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <Pressable
              onPress={() => {
                setScannedProducts([]);
                setScanError("");
                setScannedCode("");
              }}
              style={{
                backgroundColor: "#B9829A",
                borderRadius: 10,
                padding: 12,
                alignItems: "center",
                marginTop: 16,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 5. SUPPLIER LOW-STOCK NOTIFICATION MODAL */}
      <Modal
        visible={supplierModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSupplierModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.actionMenuCard,
              { maxWidth: 560, maxHeight: "90%" },
            ]}
          >
            <View style={styles.actionMenuHeader}>
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Text style={styles.actionMenuTitle}>
                    📢 Notify Supplier (Reorder Alert)
                  </Text>
                  <View
                    style={{
                      backgroundColor:
                        (Number(supplierModalItem?.quantity) || 0) <= 10
                          ? "#F7EDEE"
                          : "#F7F0E5",
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color:
                          (Number(supplierModalItem?.quantity) || 0) <= 10
                            ? "#B85C64"
                            : "#C49752",
                      }}
                    >
                      Stock: {supplierModalItem?.quantity || 0} units
                    </Text>
                  </View>
                </View>
                <Text style={styles.actionMenuSub}>
                  Medicine:{" "}
                  {supplierModalItem?.brandName ||
                    supplierModalItem?.medicineName}{" "}
                  • SKU: {supplierModalItem?.sku}
                </Text>
              </View>
              <Pressable
                onPress={() => setSupplierModalOpen(false)}
                style={styles.closeActionBtn}
              >
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={{ padding: 16 }}>
              {/* Medicine Summary Card */}
              <View
                style={{
                  backgroundColor: "#F8F5F7",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: "#E5DFE4",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: "#28242B",
                    marginBottom: 4,
                  }}
                >
                  Medicine Summary
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#77717A" }}>
                    Generic Name:
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#28242B",
                    }}
                  >
                    {supplierModalItem?.genericName ||
                      supplierModalItem?.medicineName ||
                      "N/A"}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#77717A" }}>
                    Batch No:
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#28242B",
                    }}
                  >
                    {supplierModalItem?.batchNo ||
                      supplierModalItem?.batchNumber ||
                      "N/A"}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#77717A" }}>
                    Branch / Store:
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#28242B",
                    }}
                  >
                    {supplierModalItem?.branchName ||
                      supplierModalItem?.branchId ||
                      (typeof selectedBranch === "object"
                        ? selectedBranch?.name
                        : selectedBranch) ||
                      "Active Dispensary"}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#77717A" }}>
                    Current Stock Status:
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color:
                        (Number(supplierModalItem?.quantity) || 0) <= 10
                          ? "#B85C64"
                          : "#C49752",
                    }}
                  >
                    {(Number(supplierModalItem?.quantity) || 0) <= 0
                      ? "Out of Stock (0 units)"
                      : `Limited / Slow Stock (${supplierModalItem?.quantity} units)`}
                  </Text>
                </View>
              </View>

              {/* Channel Selector */}
              <Text style={styles.fieldLabelModal}>Select Delivery Channel</Text>
              <View
                style={{
                  flexDirection: isMobile ? "column" : "row",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {[
                  {
                    id: "PORTAL",
                    label: "🌐 Website / Portal",
                    sub: "Posts directly to Supplier Dashboard",
                    color: "#A66D86",
                  },
                ].map((ch) => {
                  const isSelected = supplierForm.channel === ch.id;
                  return (
                    <Pressable
                      key={ch.id}
                      onPress={() =>
                        setSupplierForm((prev) => ({
                          ...prev,
                          channel: ch.id,
                        }))
                      }
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: isSelected ? ch.color : "#E5DFE4",
                        backgroundColor: isSelected ? "#E8D5DD" : "#FFFFFF",
                        alignItems: "flex-start",
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: "700",
                          fontSize: 13,
                          color: isSelected ? ch.color : "#28242B",
                        }}
                      >
                        {ch.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: isSelected ? "#B9829A" : "#77717A",
                          marginTop: 2,
                        }}
                      >
                        {ch.sub}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Supplier Info */}
              <View style={styles.formGroupModal}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <Text style={styles.fieldLabelModal}>
                    Supplier / Distributor
                  </Text>
                  {availableSuppliers.length > 0 && (
                    <Pressable
                      onPress={() =>
                        setSupplierDropdownOpen(!supplierDropdownOpen)
                      }
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        backgroundColor: "#E8D5DD",
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: "#A66D86",
                        }}
                      >
                        {supplierDropdownOpen
                          ? "Close List ▲"
                          : "Choose from Registered Vendors ▼"}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {supplierDropdownOpen && availableSuppliers.length > 0 && (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: "#E5DFE4",
                      borderRadius: 8,
                      backgroundColor: "#FFFFFF",
                      marginBottom: 10,
                      maxHeight: 180,
                      overflow: "hidden",
                    }}
                  >
                    <ScrollView nestedScrollEnabled={true}>
                      {availableSuppliers.map((s) => {
                        const isMatch =
                          supplierForm.supplierName === s.name ||
                          supplierForm.supplierId === s.id;
                        return (
                          <Pressable
                            key={s.id}
                            onPress={() => {
                              setSupplierForm((prev) => ({
                                ...prev,
                                supplierId: s.id,
                                supplierName: s.name,
                                supplierEmail: s.email || prev.supplierEmail,
                                supplierPhone: s.phone || prev.supplierPhone,
                              }));
                              setSupplierDropdownOpen(false);
                            }}
                            style={{
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: "#F8F5F7",
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              backgroundColor: isMatch ? "#EAF2EE" : "#FFFFFF",
                            }}
                          >
                            <View>
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: "700",
                                  color: "#28242B",
                                }}
                              >
                                {s.name}
                              </Text>
                              <Text style={{ fontSize: 11, color: "#77717A" }}>
                                {s.phone ? `📞 ${s.phone}` : ""}{" "}
                                {s.email ? `✉️ ${s.email}` : ""}
                              </Text>
                            </View>
                            {isMatch && (
                              <Text
                                style={{
                                  color: "#4F8A72",
                                  fontWeight: "700",
                                  fontSize: 12,
                                }}
                              >
                                ✓ Selected
                              </Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                <TextInput
                  style={styles.formInput}
                  value={supplierForm.supplierName}
                  onChangeText={(val) =>
                    setSupplierForm((prev) => ({
                      ...prev,
                      supplierName: val,
                    }))
                  }
                  placeholder="e.g. Sun Pharma Distributors"
                  placeholderTextColor="#77717A"
                />
              </View>

              <View
                style={{
                  flexDirection: isMobile ? "column" : "row",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>Supplier Email</Text>
                  <TextInput
                    style={styles.formInput}
                    value={supplierForm.supplierEmail}
                    onChangeText={(val) =>
                      setSupplierForm((prev) => ({
                        ...prev,
                        supplierEmail: val,
                      }))
                    }
                    placeholder="orders@supplier.com"
                    placeholderTextColor="#77717A"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>
                    Supplier Phone / WhatsApp
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    value={supplierForm.supplierPhone}
                    onChangeText={(val) =>
                      setSupplierForm((prev) => ({
                        ...prev,
                        supplierPhone: val,
                      }))
                    }
                    placeholder="+91 98765 43210"
                    placeholderTextColor="#77717A"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              {/* Reorder Qty & Priority */}
              <View
                style={{
                  flexDirection: isMobile ? "column" : "row",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>
                    Reorder Quantity (Units)
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    value={supplierForm.reorderQuantity}
                    onChangeText={(val) =>
                      setSupplierForm((prev) => ({
                        ...prev,
                        reorderQuantity: val,
                      }))
                    }
                    placeholder="e.g. 100"
                    placeholderTextColor="#77717A"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelModal}>Priority Level</Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                    {["URGENT", "CRITICAL"].map((p) => (
                      <Pressable
                        key={p}
                        onPress={() =>
                          setSupplierForm((prev) => ({
                            ...prev,
                            priority: p,
                          }))
                        }
                        style={{
                          flex: 1,
                          paddingVertical: 9,
                          borderRadius: 6,
                          borderWidth: 1.5,
                          borderColor:
                            supplierForm.priority === p
                              ? p === "CRITICAL"
                                ? "#B85C64"
                                : "#C49752"
                              : "#E5DFE4",
                          backgroundColor:
                            supplierForm.priority === p
                              ? p === "CRITICAL"
                                ? "#F7EDEE"
                                : "#F7F0E5"
                              : "#F8F5F7",
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color:
                              supplierForm.priority === p
                                ? p === "CRITICAL"
                                  ? "#B85C64"
                                  : "#C49752"
                                : "#77717A",
                          }}
                        >
                          {p}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              {/* Optional Notes */}
              <View style={styles.formGroupModal}>
                <Text style={styles.fieldLabelModal}>
                  Notes / Special Instructions
                </Text>
                <TextInput
                  style={[
                    styles.formInput,
                    { height: 60, textAlignVertical: "top" },
                  ]}
                  value={supplierForm.notes}
                  onChangeText={(val) =>
                    setSupplierForm((prev) => ({ ...prev, notes: val }))
                  }
                  placeholder="e.g. Please expedite dispatch via direct courier"
                  placeholderTextColor="#77717A"
                  multiline
                />
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View
              style={{
                flexDirection: isMobile ? "column" : "row",
                justifyContent: "flex-end",
                gap: 12,
                padding: 16,
                borderTopWidth: 1,
                borderTopColor: "#E5DFE4",
                backgroundColor: "#F8F5F7",
              }}
            >
              <Pressable
                onPress={() => setSupplierModalOpen(false)}
                style={styles.cancelBtn}
                disabled={supplierSending}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSendSupplierNotification}
                style={[
                  styles.printBarcodePrimaryBtn,
                  { backgroundColor: "#B9829A" },
                  supplierSending && { opacity: 0.6 },
                ]}
                disabled={supplierSending}
              >
                <Text style={styles.printBarcodePrimaryBtnText}>
                  {supplierSending
                    ? "Publishing Alert..."
                    : "🚀 Send Alert via Website Portal"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmation & WhatsApp Delivery Pop-up Modal */}
      <Modal
        visible={!!notificationSuccessModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setNotificationSuccessModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.actionMenuCard,
              {
                maxWidth: 520,
                width: isMobile ? "92%" : 520,
                backgroundColor: "#FFFFFF",
                borderRadius: 16,
                padding: 0,
                overflow: "hidden",
              },
            ]}
          >
            <View
              style={{
                backgroundColor: "#EAF2EE",
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: "#EAF2EE",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 36, marginBottom: 6 }}>✅</Text>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: "#4F8A72",
                  textAlign: "center",
                }}
              >
                Alert Published to Supplier Portal!
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: "#4F8A72",
                  textAlign: "center",
                  marginTop: 4,
                }}
              >
                {notificationSuccessModal?.supplierName} will immediately see
                this alert in their Supplier Portal dashboard.
              </Text>
            </View>

            <View style={{ padding: 20, gap: 12 }}>
              <View
                style={{
                  backgroundColor: "#F8F5F7",
                  borderRadius: 10,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: "#E5DFE4",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#77717A" }}>
                    Medicine:
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#28242B",
                    }}
                  >
                    {notificationSuccessModal?.medicineName}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#77717A" }}>
                    Batch / SKU:
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#28242B",
                    }}
                  >
                    {notificationSuccessModal?.batchNo} (
                    {notificationSuccessModal?.sku})
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#77717A" }}>
                    Reorder Quantity:
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "800",
                      color: "#B9829A",
                    }}
                  >
                    {notificationSuccessModal?.reorderQuantity} Units
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#77717A" }}>
                    Reference ID:
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: "#77717A",
                    }}
                  >
                    {notificationSuccessModal?.referenceNumber}
                  </Text>
                </View>
              </View>

              {/* WhatsApp Button */}
              <Pressable
                onPress={() => {
                  const cleanPhone = (
                    notificationSuccessModal?.supplierPhone || ""
                  ).replace(/[^0-9]/g, "");
                  const waUrl = cleanPhone
                    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                        notificationSuccessModal?.message || "",
                      )}`
                    : `https://wa.me/?text=${encodeURIComponent(
                        notificationSuccessModal?.message || "",
                      )}`;
                  if (typeof window !== "undefined") {
                    window.open(waUrl, "_blank");
                  }
                }}
                style={{
                  backgroundColor: "#22C55E",
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 18 }}>💬</Text>
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  Send Reorder to Supplier on WhatsApp
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setNotificationSuccessModal(null)}
                style={{
                  backgroundColor: "#F8F5F7",
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: "#77717A",
                    fontWeight: "600",
                    fontSize: 13,
                  }}
                >
                  Done
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 24,
  },
  contentContainerMobile: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  kpiRowCompact: {
    gap: 12,
  },
  cardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow:
          "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
      },
      default: {
        elevation: 1,
      },
    }),
  },
  cardHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#28242B",
  },
  cardSubtitle: {
    fontSize: 12.5,
    color: "#77717A",
    marginTop: 2,
  },
  /* Mobile Card List Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobileStockCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    padding: 14,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
      },
      default: {
        elevation: 1,
      },
    }),
  },
  mobileStockCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
    gap: 8,
  },
  mobileStockTitleCol: {
    flex: 1,
  },
  mobileBrandName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#28242B",
  },
  mobileMedName: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#B9829A",
    marginTop: 2,
  },
  mobileStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeInStock: {
    backgroundColor: "#EAF2EE",
  },
  statusBadgeLow: {
    backgroundColor: "#F7F0E5",
  },
  mobileStatusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusTextInStock: {
    color: "#4F8A72",
  },
  statusTextLow: {
    color: "#C49752",
  },
  mobileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingVertical: 10,
    gap: 10,
  },
  mobileGridItem: {
    width: "47%",
  },
  mobileItemLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#77717A",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  mobileItemValue: {
    fontSize: 12.5,
    fontWeight: "500",
    color: "#28242B",
    marginTop: 1,
  },
  mobileItemValueBold: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
    marginTop: 1,
  },
  mobileStockFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F8F5F7",
    marginTop: 4,
    gap: 8,
  },
  mobileUpdatedText: {
    fontSize: 11,
    color: "#77717A",
    flex: 1,
  },
  mobileEditBtn: {
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    cursor: "pointer",
  },
  mobileEditBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#A66D86",
  },
  tableWrapper: {
    minWidth: 1520,
    paddingHorizontal: 8,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
  },
  thCell: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#77717A",
    paddingHorizontal: 6,
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
  },
  tableRowAlt: {
    backgroundColor: "#F8F5F7",
  },
  tdCell: {
    fontSize: 13,
    color: "#28242B",
    paddingHorizontal: 6,
  },
  medNameCell: {
    fontWeight: "700",
    color: "#B9829A",
  },
  brandNameCell: {
    fontWeight: "700",
    color: "#28242B",
  },
  strengthCell: {
    color: "#77717A",
    fontWeight: "500",
    fontSize: 12.5,
  },
  mfgCell: {
    color: "#28242B",
    fontWeight: "600",
  },
  supplierCell: {
    color: "#A66D86",
    fontWeight: "600",
  },
  skuCell: {
    fontWeight: "600",
    color: "#77717A",
  },
  amountCell: {
    fontWeight: "700",
    color: "#28242B",
  },
  modifyWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  modifyButton: {
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    cursor: "pointer",
  },
  modifyButtonText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#A66D86",
  },
  formHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
  },
  formSubtitle: {
    fontSize: 12.5,
    color: "#77717A",
    marginTop: 3,
  },
  formGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  formFieldHalf: {
    flex: 1,
    minWidth: 260,
  },
  formFieldThird: {
    flex: 1,
    minWidth: 180,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#28242B",
    marginBottom: 6,
  },
  reqStar: {
    color: "#B85C64",
  },
  formInput: {
    height: 40,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#28242B",
    outlineStyle: "none",
  },
  formInputError: {
    borderColor: "#B85C64",
    backgroundColor: "#F7EDEE",
  },
  errorText: {
    fontSize: 11,
    color: "#B85C64",
    marginTop: 3,
    fontWeight: "500",
  },
  branchChipRow: {
    maxHeight: 40,
  },
  branchChip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
  },
  branchChipActive: {
    backgroundColor: "#B9829A",
    borderColor: "#B9829A",
  },
  branchChipText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#28242B",
  },
  branchChipTextActive: {
    color: "#FFFFFF",
  },
  branchModalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    padding: 12,
  },
  branchModalTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#28242B",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  branchDropdownButton: {
    height: 40,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  branchDropdownButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#28242B",
    flex: 1,
    marginRight: 8,
  },
  chevronIcon: {
    fontSize: 12,
    color: "#77717A",
  },
  branchDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  branchDropdownItemActive: {
    backgroundColor: "#E8D5DD",
  },
  branchDropdownItemText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#28242B",
    flex: 1,
    marginRight: 8,
  },
  branchDropdownItemTextActive: {
    color: "#B9829A",
  },
  branchDropdownCheck: {
    color: "#B9829A",
    fontWeight: "700",
  },
  formHelperText: {
    fontSize: 11.5,
    color: "#77717A",
    fontWeight: "500",
    marginTop: 4,
  },
  formFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#F8F5F7",
    backgroundColor: "#F8F5F7",
    alignItems: "flex-start",
  },
  blueSubmitButton: {
    backgroundColor: "#B9829A",
    paddingVertical: 9,
    paddingHorizontal: 28,
    borderRadius: 8,
    cursor: "pointer",
  },
  blueSubmitButtonText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
  },
  headerControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 8,
  },
  filterTogglePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
    cursor: "pointer",
  },
  filterTogglePillActive: {
    backgroundColor: "#E8D5DD",
    borderColor: "#B9829A",
  },
  filterToggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#77717A",
  },
  filterToggleDotActive: {
    backgroundColor: "#B9829A",
  },
  filterToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#77717A",
  },
  filterToggleTextActive: {
    color: "#B9829A",
    fontWeight: "700",
  },
  devGuideHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    cursor: "pointer",
  },
  devGuideHeaderBtnIcon: {
    fontSize: 13,
  },
  devGuideHeaderBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#28242B",
  },
  stockSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
    minWidth: 220,
  },
  stockSearchBoxMobile: {
    width: "100%",
    minWidth: "100%",
  },
  stockSearchIcon: {
    fontSize: 12,
    marginRight: 6,
    color: "#77717A",
  },
  stockSearchInput: {
    flex: 1,
    fontSize: 12.5,
    color: "#28242B",
    ...Platform.select({ web: { outlineStyle: "none" } }),
  },
  cardHeaderMobile: {
    flexDirection: "column",
    gap: 10,
  },
  mobileBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  miniToggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    padding: 2,
    justifyContent: "center",
    cursor: "pointer",
  },
  miniToggleTrackActive: {
    backgroundColor: "#B9829A",
  },
  miniToggleTrackInactive: {
    backgroundColor: "#E5DFE4",
  },
  miniToggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  miniToggleThumbActive: {
    alignSelf: "flex-end",
  },
  miniToggleThumbInactive: {
    alignSelf: "flex-start",
  },
  mobileStockCardInactive: {
    opacity: 0.65,
    backgroundColor: "#F8F5F7",
  },
  mobileDotsActionBtn: {
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    cursor: "pointer",
  },
  mobileDotsActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#28242B",
  },
  tableRowInactive: {
    opacity: 0.65,
    backgroundColor: "#F8F5F7",
  },
  tdCenterCell: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  tableToggleTrack: {
    width: 38,
    height: 20,
    borderRadius: 10,
    padding: 2,
    justifyContent: "center",
    cursor: "pointer",
  },
  tableToggleActive: {
    backgroundColor: "#B9829A",
  },
  tableToggleInactive: {
    backgroundColor: "#E5DFE4",
  },
  tableToggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  tableToggleThumbActive: {
    alignSelf: "flex-end",
  },
  tableToggleThumbInactive: {
    alignSelf: "flex-start",
  },
  rxTagPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    cursor: "pointer",
  },
  rxTagRequired: {
    backgroundColor: "#F7EDEE",
    borderWidth: 1,
    borderColor: "#F7EDEE",
  },
  rxTagOtc: {
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
  },
  rxTagPillText: {
    fontSize: 10.5,
    fontWeight: "800",
  },
  rxTagTextRequired: {
    color: "#B85C64",
  },
  rxTagTextOtc: {
    color: "#77717A",
  },
  actionCellWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  actionDotsButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#F8F5F7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    cursor: "pointer",
    zIndex: 5,
  },
  actionDotsButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#28242B",
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    ...Platform.select({
      web: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
      },
    }),
  },
  actionMenuCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    overflow: "hidden",
  },
  actionMenuHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
  },
  actionMenuTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#28242B",
  },
  actionMenuSub: {
    fontSize: 11.5,
    color: "#77717A",
    marginTop: 2,
  },
  closeActionBtn: {
    padding: 6,
    cursor: "pointer",
  },
  closeActionText: {
    fontSize: 18,
    color: "#77717A",
    fontWeight: "700",
  },
  actionList: {
    padding: 10,
    gap: 4,
  },
  actionOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
  },
  actionOptionRowDanger: {
    backgroundColor: "#F7EDEE",
  },
  actionOptionRowDev: {
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    marginTop: 4,
  },
  actionOptionIcon: {
    fontSize: 20,
  },
  actionOptionTextCol: {
    flex: 1,
  },
  actionOptionTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#28242B",
  },
  actionOptionDesc: {
    fontSize: 11.5,
    color: "#77717A",
    marginTop: 1,
  },
  adjustModalCard: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    overflow: "hidden",
  },
  adjustModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
  },
  adjustModalTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#28242B",
  },
  adjustModalSubtitle: {
    fontSize: 11.5,
    color: "#77717A",
    marginTop: 2,
  },
  adjustModalBody: {
    padding: 20,
    gap: 14,
  },
  formGroupModal: {
    gap: 6,
  },
  fieldLabelModal: {
    fontSize: 12,
    fontWeight: "600",
    color: "#28242B",
  },
  adjustTypeRow: {
    flexDirection: "row",
    gap: 8,
  },
  adjustTypeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
    alignItems: "center",
    cursor: "pointer",
  },
  adjustTypeBtnActive: {
    borderColor: "#B9829A",
    backgroundColor: "#B9829A",
  },
  adjustTypeBtnText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#77717A",
  },
  adjustTypeBtnTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  adjustInput: {
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: "#FFFFFF",
  },
  apiPreviewBox: {
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    padding: 8,
    borderRadius: 6,
  },
  apiPreviewText: {
    fontSize: 11,
    color: "#B9829A",
    fontFamily: Platform.select({ web: "monospace", default: "System" }),
    fontWeight: "600",
  },
  adjustModalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    cursor: "pointer",
  },
  cancelBtnText: {
    fontSize: 12.5,
    color: "#77717A",
    fontWeight: "600",
  },
  saveAdjustBtn: {
    backgroundColor: "#B9829A",
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 6,
    cursor: "pointer",
  },
  saveAdjustBtnText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  devGuideModalCard: {
    width: "100%",
    maxWidth: 780,
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
  },
  devGuideModalCardMobile: {
    maxHeight: "95%",
  },
  devGuideModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
  },
  devGuideTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  devGuideIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#B9829A",
    alignItems: "center",
    justifyContent: "center",
  },
  devGuideIconText: {
    fontSize: 18,
  },
  devGuideModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#28242B",
  },
  devGuideModalSubtitle: {
    fontSize: 12,
    color: "#77717A",
  },
  devGuideModalBody: {
    padding: 20,
  },
  guideSec: {
    marginBottom: 22,
  },
  guideSecTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#B9829A",
    marginBottom: 6,
  },
  guideSecDesc: {
    fontSize: 12,
    color: "#77717A",
    marginBottom: 8,
  },
  codeSnippet: {
    backgroundColor: "#28242B",
    borderRadius: 8,
    padding: 12,
    marginTop: 6,
  },
  codeSnippetText: {
    color: "#A66D86",
    fontSize: 11.5,
    fontFamily: Platform.select({
      web: "Consolas, Monaco, monospace",
      default: "System",
    }),
    lineHeight: 17,
  },
  endpointCard: {
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  endpointHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  methodPatch: {
    backgroundColor: "#B9829A",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  methodPost: {
    backgroundColor: "#4F8A72",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  methodText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  endpointRoute: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
    fontFamily: Platform.select({ web: "monospace", default: "System" }),
  },
  endpointDesc: {
    fontSize: 12,
    color: "#77717A",
  },
  devGuideModalFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
    alignItems: "flex-end",
  },
  closeDevGuideModalBtn: {
    backgroundColor: "#B9829A",
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: "pointer",
  },
  closeDevGuideModalBtnText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  /* Inter-Branch Stock Transfer Modal Styles */
  transferModalCard: {
    width: "100%",
    maxWidth: 680,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    overflow: "hidden",
  },
  transferModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
  },
  transferHeaderBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#E8D5DD",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E8D5DD",
  },
  transferHeaderBadgeIcon: {
    fontSize: 16,
  },
  transferModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#28242B",
  },
  transferModalSubtitle: {
    fontSize: 12,
    color: "#77717A",
    marginTop: 2,
  },
  transferModalBody: {
    padding: 20,
    gap: 14,
  },
  transferProductCard: {
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    borderRadius: 10,
    padding: 14,
  },
  transferMedTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#B9829A",
  },
  transferMedMeta: {
    fontSize: 12,
    color: "#28242B",
    marginTop: 2,
  },
  transferPillsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  transferPill: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  transferPillText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#77717A",
  },
  transferPillTeal: {
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  transferPillTextTeal: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#B9829A",
  },
  transferErrorAlert: {
    backgroundColor: "#F7EDEE",
    borderWidth: 1,
    borderColor: "#F7EDEE",
    padding: 10,
    borderRadius: 8,
  },
  transferErrorText: {
    fontSize: 12,
    color: "#B85C64",
    fontWeight: "600",
  },
  branchSelectionGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  branchSelectionGridMobile: {
    flexDirection: "column",
    gap: 12,
  },
  branchCol: {
    flex: 1,
  },
  branchColMobile: {
    width: "100%",
  },
  branchOptionTextCol: {
    flex: 1,
    minWidth: 0,
  },
  branchPickerBox: {
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    backgroundColor: "#F8F5F7",
    overflow: "hidden",
    marginTop: 4,
  },
  branchOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
  },
  branchOptionItemFromActive: {
    backgroundColor: "#E8D5DD",
    borderLeftWidth: 4,
    borderLeftColor: "#B9829A",
  },
  branchOptionItemToActive: {
    backgroundColor: "#E8D5DD",
    borderLeftWidth: 4,
    borderLeftColor: "#B9829A",
  },
  branchOptionDisabled: {
    opacity: 0.4,
    backgroundColor: "#F8F5F7",
  },
  branchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E5DFE4",
  },
  branchDotFromActive: {
    backgroundColor: "#B9829A",
  },
  branchDotToActive: {
    backgroundColor: "#B9829A",
  },
  branchOptionName: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#28242B",
  },
  branchOptionNameFromActive: {
    color: "#B9829A",
    fontWeight: "800",
  },
  branchOptionNameToActive: {
    color: "#B9829A",
    fontWeight: "800",
  },
  branchOptionNameDisabled: {
    color: "#77717A",
  },
  branchOptionCity: {
    fontSize: 11,
    color: "#77717A",
  },
  transferDirectionCol: {
    justifyContent: "center",
    alignItems: "center",
    width: 28,
    paddingTop: 18,
  },
  transferDirectionColMobile: {
    width: "100%",
    paddingTop: 0,
    marginVertical: 4,
  },
  transferDirectionCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#B9829A",
    alignItems: "center",
    justifyContent: "center",
  },
  transferDirectionArrow: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  transferPresetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
    cursor: "pointer",
  },
  transferPresetBtnActive: {
    backgroundColor: "#B9829A",
    borderColor: "#B9829A",
  },
  transferPresetText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#77717A",
  },
  transferPresetTextActive: {
    color: "#FFFFFF",
  },
  transferCalcBox: {
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  transferCalcTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#28242B",
  },
  transferCalcRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  transferCalcLabel: {
    fontSize: 12,
    color: "#77717A",
    fontWeight: "600",
  },
  confirmTransferBtn: {
    backgroundColor: "#B9829A",
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 6,
    cursor: "pointer",
  },
  confirmTransferBtnText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },

  // Barcode & Thermal Shelf Tag Modal Styles
  barcodeModalCard: {
    width: "92%",
    maxWidth: 680,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow:
          "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
      },
      default: {
        elevation: 8,
      },
    }),
  },
  barcodeModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
    backgroundColor: "#FFFFFF",
  },
  barcodeHeaderBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#EAF2EE",
    borderWidth: 1,
    borderColor: "#EAF2EE",
    justifyContent: "center",
    alignItems: "center",
  },
  barcodeModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#28242B",
  },
  barcodeModalSubtitle: {
    fontSize: 12,
    color: "#77717A",
    marginTop: 2,
  },
  barcodeModalBody: {
    padding: 20,
    gap: 18,
    backgroundColor: "#F8F5F7",
  },
  previewSectionWrapper: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    padding: 16,
    alignItems: "center",
  },
  previewSectionHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  previewSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#77717A",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  liveTagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EAF2EE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EAF2EE",
  },
  liveTagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4F8A72",
  },
  liveTagBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4F8A72",
  },
  physicalLabelCard: {
    width: 320,
    minHeight: 160,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#28242B",
    borderStyle: "dashed",
    padding: 12,
    justifyContent: "space-between",
    ...Platform.select({
      web: {
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.08)",
      },
    }),
  },
  physicalLabelCardShelf: {
    width: 380,
    minHeight: 180,
    padding: 14,
    borderColor: "#B9829A",
  },
  physicalLabelCardA4: {
    width: 300,
    minHeight: 150,
  },
  labelHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#28242B",
    paddingBottom: 4,
    marginBottom: 6,
  },
  labelPharmacyName: {
    fontSize: 10.5,
    fontWeight: "900",
    color: "#28242B",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  labelBranchText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#77717A",
  },
  labelMedInfoRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  labelMedName: {
    fontSize: 13,
    fontWeight: "900",
    color: "#28242B",
    flexShrink: 1,
  },
  labelMedStrength: {
    fontSize: 11,
    fontWeight: "800",
    color: "#B9829A",
  },
  labelGenericName: {
    fontSize: 10,
    color: "#77717A",
    fontStyle: "italic",
    marginTop: 1,
  },
  labelMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 4,
  },
  labelMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  labelMetaLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#77717A",
  },
  labelMetaValue: {
    fontSize: 10,
    fontWeight: "800",
    color: "#28242B",
  },
  labelMetaItemPrice: {
    backgroundColor: "#F7F0E5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: "#C49752",
  },
  labelPriceTag: {
    fontSize: 11,
    fontWeight: "900",
    color: "#C49752",
  },
  labelShelfRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  shelfTagBadge: {
    backgroundColor: "#F8F5F7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: "#E5DFE4",
  },
  shelfTagText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#28242B",
  },
  labelPackSizeText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#77717A",
  },
  labelBarcodeWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: "#E5DFE4",
  },
  labelBarcodeSvgBox: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  labelBarcodeFallback: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  barcodeStripeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  barcodeFallbackText: {
    fontSize: 10,
    fontFamily: Platform.OS === "web" ? "monospace" : "monospace",
    fontWeight: "700",
    color: "#28242B",
    letterSpacing: 2,
    marginTop: 2,
  },
  barcodeConfigGrid: {
    gap: 14,
  },
  barcodeConfigCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    padding: 14,
  },
  barcodeConfigCardTitle: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#28242B",
    marginBottom: 8,
  },
  formatOptionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  formatOptionBtn: {
    flex: 1,
    backgroundColor: "#F8F5F7",
    borderWidth: 1.5,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    cursor: "pointer",
  },
  formatOptionBtnActive: {
    backgroundColor: "#EAF2EE",
    borderColor: "#4F8A72",
  },
  formatOptionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#28242B",
  },
  formatOptionTitleActive: {
    color: "#B9829A",
  },
  formatOptionDesc: {
    fontSize: 10,
    color: "#77717A",
    marginTop: 2,
    textAlign: "center",
  },
  copiesInput: {
    width: 60,
    height: 36,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E5DFE4",
    borderRadius: 6,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    color: "#28242B",
  },
  presetPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
  },
  presetPillActive: {
    backgroundColor: "#B9829A",
    borderColor: "#B9829A",
  },
  presetPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#77717A",
  },
  presetPillTextActive: {
    color: "#FFFFFF",
  },
  togglesWrapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  toggleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
    cursor: "pointer",
  },
  toggleChipActive: {
    backgroundColor: "#E8D5DD",
    borderColor: "#B9829A",
  },
  toggleChipText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#77717A",
  },
  toggleChipTextActive: {
    color: "#A66D86",
  },
  barcodeModalFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#F8F5F7",
    backgroundColor: "#FFFFFF",
    flexWrap: "wrap",
    gap: 10,
  },
  secondaryActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
    cursor: "pointer",
  },
  secondaryActionBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#28242B",
  },
  printBarcodePrimaryBtn: {
    backgroundColor: "#B9829A",
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 6,
    cursor: "pointer",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  printBarcodePrimaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  scanBarcodeInlineBtn: {
    backgroundColor: "#E8D5DD",
    borderColor: "#B9829A",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    cursor: "pointer",
  },
  scanBarcodeInlineBtnText: {
    color: "#A66D86",
    fontSize: 11,
    fontWeight: "700",
  },
});

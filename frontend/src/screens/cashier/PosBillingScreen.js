import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  useWindowDimensions,
  Platform,
  Image,
} from 'react-native';
import { fetchCustomers } from '../../api/customerApi';
import { useOfflineSync } from '../../offline/OfflineSyncContext';
import { SkeletonItemCard } from '../../components/common/SkeletonLoader';
import PaginationControls from '../../components/common/PaginationControls';
import OfflineQRCode from '../../components/common/OfflineQRCode';
import BarcodeScannerModal from '../../components/common/BarcodeScannerModal';
import { generateOfflineQRCode } from '../../utils/qrGenerator';
import { fetchCashierProducts } from '../../api/cashierApi';
import { usePos } from '../../context/PosContext';

export default function PosBillingScreen({
  onNavigate,
  onShowToast,
  isMultiBranch = true,
}) {
  const offlineSync = useOfflineSync();
  let pos = null;
  try {
    pos = usePos();
  } catch (e) {
    pos = null;
  }

  const [liveProducts, setLiveProducts] = useState([]);
  const productsList = useMemo(() => {
    const map = new Map();
    // 1. Add offlineSync.products first (locally cached records from Dexie IndexedDB)
    if (Array.isArray(offlineSync?.products)) {
      for (const p of offlineSync.products) {
        const id = p.id || p.productId || p.sku;
        if (id) map.set(id, p);
      }
    }
    // 2. Add or overwrite with liveProducts (freshest from server or dynamic query)
    if (Array.isArray(liveProducts)) {
      for (const p of liveProducts) {
        const id = p.id || p.productId || p.sku;
        if (id) map.set(id, p);
      }
    }
    return Array.from(map.values());
  }, [liveProducts, offlineSync?.products]);

  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1100;

  const [loading, setLoading] = useState(true);
  const [customersList, setCustomersList] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  useEffect(() => {
    let isMounted = true;

    async function loadCustomers() {
      try {
        const res = await fetchCustomers();
        const rows = Array.isArray(res?.data?.data)
          ? res.data.data
          : Array.isArray(res?.data)
            ? res.data
            : [];
        if (isMounted) setCustomersList(rows);
      } catch (err) {
        console.warn('Failed to load customers for POS:', err.message);
      }
    }

    async function loadCatalog() {
      try {
        const data = await fetchCashierProducts();
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setLiveProducts(data);
        }
      } catch (err) {
        console.warn("[PosBilling] Live catalog fallback:", err?.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadCustomers();
    loadCatalog();

    return () => {
      isMounted = false;
    };
  }, []);

  // Active Tab on Mobile: 'catalog' | 'cart'
  const [mobileTab, setMobileTab] = useState("catalog");

  // Search & Catalog State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Reset pagination to first page when search query or category filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  // Debounced catalog search against backend API (online) or Dexie IndexedDB (offline)
  useEffect(() => {
    const q = (searchQuery || "").trim();
    if (!q) return;

    const timer = setTimeout(async () => {
      try {
        const results = await fetchCashierProducts(q);
        if (Array.isArray(results) && results.length > 0) {
          setLiveProducts((prev) => {
            const map = new Map();
            for (const item of prev) {
              const id = item.id || item.productId || item.sku;
              if (id) map.set(id, item);
            }
            for (const item of results) {
              const id = item.id || item.productId || item.sku;
              if (id) map.set(id, item);
            }
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.warn("[PosBilling] Debounced search query error:", err?.message);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Customer Selection State (BIL-11, RX-04)
  const [selectedCustomer, setSelectedCustomer] = useState({
    id: "WALK-IN",
    name: "Walk-in Customer",
    phone: "",
    creditAllowed: false,
    creditLimit: "0.00",
    currentBalance: "₹0.00",
  });
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

  // Cart State (BIL-03, BIL-04)
  const [cart, setCart] = useState([
    {
      id: "PRD-101",
      name: "Dolo 650 Tablets (15s)",
      generic: "Paracetamol 650mg",
      batch: "BTH-2026-A1",
      expiry: "11/2027",
      sellingPrice: 31.05,
      qty: 2,
      discountPercent: 0,
      gstRate: 12,
    },
    {
      id: "PRD-103",
      name: "Pan 40 Tablets (15s)",
      generic: "Pantoprazole Sodium 40mg",
      batch: "PAN-7419",
      expiry: "04/2027",
      sellingPrice: 158.0,
      qty: 1,
      discountPercent: 5,
      gstRate: 12,
    },
  ]);

  // Overall Discount & Bill Note
  const [billDiscountPercent, setBillDiscountPercent] = useState("0");
  const [billNote, setBillNote] = useState("");

  // Checkout Modal State (BIL-08, BIL-09)
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [paymentMode, setPaymentMode] = useState('Cash'); // 'Cash' | 'UPI' | 'Card' | 'Credit' | 'Split'
  const [cashTendered, setCashTendered] = useState('');
  const [upiTendered, setUpiTendered] = useState('');
  const [storeUpiId, setStoreUpiId] = useState('pharmaflow@okhdfcbank');
  const [upiRefNumber, setUpiRefNumber] = useState('');
  const [isEditingUpiId, setIsEditingUpiId] = useState(false);

  // Receipt Modal State (BIL-10, BIL-19)
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState(null);

  // Filter Catalog
  const categories = [
    "All",
    "Analgesics",
    "Antibiotics",
    "Antacids / PPI",
    "Respiratory",
    "Antidiabetic",
    "OTC Cough & Cold",
    "Hydration",
  ];
  const filteredProducts = productsList.filter((prod) => {
    // Exclude deactivated or inactive items
    if (prod.isActive === false || prod.is_active === false || prod.status === 'Inactive' || prod.status === 'Disabled') {
      return false;
    }
    const q = (searchQuery || "").trim().toLowerCase();
    const matchCat =
      selectedCategory === "All" || prod.category === selectedCategory;

    if (!q) {
      return matchCat;
    }

    const nameStr = String(prod.name || prod.medicineName || prod.brandName || "").toLowerCase();
    const genericStr = String(prod.generic || prod.genericName || "").toLowerCase();
    const barcodeStr = String(prod.barcode || "").toLowerCase();
    const skuStr = String(prod.sku || "").toLowerCase();
    const batchStr = String(prod.batch || prod.batchNumber || "").toLowerCase();

    const matchSearch =
      nameStr.includes(q) ||
      genericStr.includes(q) ||
      barcodeStr.includes(q) ||
      skuStr.includes(q) ||
      batchStr.includes(q);

    return matchSearch && matchCat;
  });

  // Calculate Totals (BIL-05)
  const calculateTotals = () => {
    let subtotal = 0;
    let totalTax = 0;
    let totalItemDiscounts = 0;

    cart.forEach((item) => {
      const itemBase = item.sellingPrice * item.qty;
      const discount = (itemBase * item.discountPercent) / 100;
      const taxable = itemBase - discount;
      const tax = (taxable * item.gstRate) / 100;

      subtotal += itemBase;
      totalItemDiscounts += discount;
      totalTax += tax;
    });

    const billDisc = (subtotal * (parseFloat(billDiscountPercent) || 0)) / 100;
    const grandTotal = Math.max(
      0,
      subtotal - totalItemDiscounts - billDisc + totalTax,
    );

    return {
      subtotal,
      totalDiscounts: totalItemDiscounts + billDisc,
      totalTax,
      grandTotal,
    };
  };

  const totals = calculateTotals();

  // Add Item to Cart
  const handleAddToCart = (product) => {
    const existingIndex = cart.findIndex((item) => item.id === product.id);
    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].qty += 1;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          id: product.id,
          name: product.name,
          generic: product.generic,
          batch: product.batch,
          expiry: product.expiry,
          sellingPrice: product.sellingPrice,
          qty: 1,
          discountPercent: 0,
          gstRate: product.gstRate,
        },
      ]);
    }
    if (onShowToast) onShowToast(`Added ${product.name} to cart.`);
  };

  // Barcode & QR Code Scan Handler
  const handleBarcodeScanned = async (code) => {
    setIsScannerOpen(false);
    if (!code) return;
    const cleanCode = code.trim().toLowerCase();
    let match = productsList.find(
      (p) =>
        (p.barcode && String(p.barcode).toLowerCase() === cleanCode) ||
        (p.code && String(p.code).toLowerCase() === cleanCode) ||
        (p.id && String(p.id).toLowerCase() === cleanCode) ||
        (p.sku && String(p.sku).toLowerCase() === cleanCode) ||
        (p.name && p.name.toLowerCase().includes(cleanCode))
    );

    // If not found in memory, query offline-first catalog (Dexie IndexedDB)
    if (!match) {
      try {
        const found = await fetchCashierProducts("", code);
        if (Array.isArray(found) && found.length > 0) {
          match = found[0];
        }
      } catch (_) {}
    }

    if (match) {
      handleAddToCart(match);
      if (onShowToast) onShowToast(`✓ Scanned & added ${match.name}`);
    } else {
      setSearchQuery(code);
      if (onShowToast) onShowToast(`Searching for barcode: ${code}`);
    }
  };

  // Global Hardware USB / Bluetooth Barcode Scanner Gun Listener
  useEffect(() => {
    if (Platform.OS !== "web") return;

    let scanBuffer = "";
    let lastCharTime = 0;

    const handleWindowKeyDown = (e) => {
      if (isScannerOpen) return;

      const activeEl = typeof document !== "undefined" ? document.activeElement : null;
      const isInputFocused =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable);

      const now = Date.now();
      const diff = now - lastCharTime;
      lastCharTime = now;

      if (e.key === "Enter") {
        if (scanBuffer.length >= 2) {
          e.preventDefault();
          const scannedCode = scanBuffer.trim();
          scanBuffer = "";
          handleBarcodeScanned(scannedCode);
        } else {
          scanBuffer = "";
        }
      } else if (e.key && e.key.length === 1) {
        // Barcode scanner guns type at rapid machine speed (< 60ms between chars)
        if (diff > 200 && !isInputFocused) {
          scanBuffer = e.key;
        } else if (diff <= 100) {
          scanBuffer += e.key;
        } else if (!isInputFocused) {
          scanBuffer += e.key;
        }
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [isScannerOpen, productsList]);

  // Update Item Qty
  const handleUpdateQty = (index, delta) => {
    const updated = [...cart];
    const newQty = updated[index].qty + delta;
    if (newQty <= 0) {
      updated.splice(index, 1);
    } else {
      updated[index].qty = newQty;
    }
    setCart(updated);
  };

  // Hold / Suspend Sale (BIL-12)
  const handleHoldBill = () => {
    if (cart.length === 0) {
      if (onShowToast) onShowToast("⚠️ Cannot hold an empty bill.");
      return;
    }
    const token = `HB-${Math.floor(1000 + Math.random() * 9000)}`;
    const billData = {
      holdId: token,
      billNo: token,
      customerName: selectedCustomer.name,
      customerPhone: selectedCustomer.phone || "",
      subtotal: totals.subtotal,
      tax: totals.totalTax,
      total: totals.grandTotal,
      items: [...cart],
      heldAt:
        new Date().toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }) +
        ", " +
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      heldBy: "Cashier 01",
      status: "Hold",
    };

    // Park it where the Held Bills screen reads from (kept on this device, works offline).
    try {
      pos?.holdBill?.({
        customerName: billData.customerName,
        customerPhone: billData.customerPhone,
        items: billData.items,
        subtotal: billData.subtotal,
        tax: billData.tax,
        total: billData.total,
        note: "Parked from New Sale",
      });
    } catch (e) {
      console.warn("[PosBilling] holdBill failed:", e?.message);
    }
    if (offlineSync?.recordHoldBillOffline) {
      offlineSync.recordHoldBillOffline(billData);
    }

    if (onShowToast) {
      onShowToast(
        `✓ Bill parked successfully under Token #${token} (Saved Offline)`,
      );
    }
    setCart([]);
  };

  // Open Checkout
  const handleOpenCheckout = () => {
    if (cart.length === 0) {
      if (onShowToast) onShowToast("⚠️ Cart is empty. Add products to bill.");
      return;
    }
    setCashTendered(totals.grandTotal.toFixed(2));
    setUpiTendered("0.00");
    setCheckoutModalVisible(true);
  };

  // Finalize Sale (BIL-10): saved on this device first (works with no network), then uploaded.
  const [isSavingSale, setIsSavingSale] = useState(false);
  const handleFinalizeSale = async () => {
    if (isSavingSale) return;
    setIsSavingSale(true);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const invNo = `INV-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${String(
      now.getTime() % 100000,
    ).padStart(5, "0")}${Math.floor(Math.random() * 10)}`;

    let cashierName = "Cashier";
    try {
      const u = JSON.parse(window.localStorage.getItem("cachedAuthUser") || "null");
      cashierName = u?.name || cashierName;
    } catch (e) {}

    const newInv = {
      invoiceNo: invNo,
      date:
        now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
        ", " +
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      customer: selectedCustomer.name,
      customerId: selectedCustomer.id || selectedCustomer.customerId,
      customerPhone: selectedCustomer.phone || "N/A",
      paymentMode,
      subtotal: totals.subtotal,
      totalDiscounts: totals.totalDiscounts,
      tax: totals.totalTax,
      grandTotal: totals.grandTotal,
      items: [...cart],
      cashier: cashierName,
    };

    try {
      if (!offlineSync?.recordSaleOffline) {
        throw new Error("Offline sales storage is not ready. Please reload the app.");
      }
      // Wait for the save: only show "generated" when it really is stored.
      const saved = await offlineSync.recordSaleOffline(newInv, cart);
      const finalInv = { ...newInv, ...(saved || {}) };

      // Stock changed locally: drop stale server-sourced stock so the list shows what is left.
      setLiveProducts([]);
      setCompletedInvoice(finalInv);
      setCheckoutModalVisible(false);
      setReceiptModalVisible(true);
      setCart([]);

      if (onShowToast) {
        onShowToast(
          offlineSync?.isOnline === false
            ? `✓ Invoice ${finalInv.invoiceNo} saved on this device. It will upload when you're back online.`
            : `✓ Invoice ${finalInv.invoiceNo} generated.`,
        );
      }
    } catch (err) {
      console.error("[PosBilling] Sale could not be saved:", err);
      if (onShowToast) {
        onShowToast(`⚠️ Sale not saved: ${err?.message || "unknown error"}. Nothing was deducted.`);
      }
    } finally {
      setIsSavingSale(false);
    }
  };

  const paginatedData = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 16 }}>
        <SkeletonItemCard />
        <SkeletonItemCard />
        <SkeletonItemCard />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Banner / Breadcrumb */}
      <View style={[styles.topBar, isMobile && styles.topBarMobile]}>
        <View
          style={[styles.posTitleBox, isMobile && styles.posTitleBoxMobile]}
        >
          <Text style={styles.posTitle}>POS Billing & Checkout</Text>
          <Text style={styles.posSubtitle}>
            Counter 01 • Fast Prescription & OTC Sales (BIL-01)
          </Text>
        </View>

        {/* Customer Badge Selector */}
        <Pressable
          onPress={() => setCustomerModalVisible(true)}
          style={[
            styles.customerSelectorBtn,
            isMobile && styles.customerSelectorBtnMobile,
          ]}
        >
          <Text style={styles.customerBtnIcon}>👤</Text>
          <View>
            <Text style={styles.customerBtnName}>{selectedCustomer.name}</Text>
            <Text style={styles.customerBtnPhone}>
              {selectedCustomer.phone
                ? selectedCustomer.phone
                : "Tap to select patient"}
            </Text>
          </View>
          <Text style={styles.customerSelectorArrow}>▼</Text>
        </Pressable>
      </View>

      {/* Mobile Tab Switcher */}
      {isMobile && (
        <View style={styles.mobileTabRow}>
          <Pressable
            onPress={() => setMobileTab("catalog")}
            style={[
              styles.mobileTabItem,
              mobileTab === "catalog" && styles.mobileTabItemActive,
            ]}
          >
            <Text
              style={[
                styles.mobileTabItemText,
                mobileTab === "catalog" && styles.mobileTabItemTextActive,
              ]}
              numberOfLines={1}
            >
              💊 Medicines ({filteredProducts.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMobileTab("cart")}
            style={[
              styles.mobileTabItem,
              mobileTab === "cart" && styles.mobileTabItemActive,
            ]}
          >
            <Text
              style={[
                styles.mobileTabItemText,
                mobileTab === "cart" && styles.mobileTabItemTextActive,
              ]}
              numberOfLines={1}
            >
              🛒 Current Bill ({cart.length}) • ₹{totals.grandTotal.toFixed(2)}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Main Dual-Pane Layout */}
      <View style={[styles.layoutGrid, isCompact && styles.layoutGridCompact]}>
        {/* LEFT PANE: Product Search & Catalog */}
        {(!isMobile || mobileTab === "catalog") && (
          <View
            style={[
              styles.leftPane,
              isMobile && { flex: 1, paddingBottom: cart.length > 0 ? 80 : 20 },
            ]}
          >
            {/* Search Input Bar with Integrated Camera Scanner */}
            <View style={styles.searchBarRow}>
              <Text style={styles.searchBarIcon}>🔍</Text>
              <TextInput
                style={styles.searchBarInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Scan barcode or type medicine name, formula, SKU..."
                placeholderTextColor="#77717A"
                autoFocus={true}
              />
              {searchQuery ? (
                <Pressable
                  onPress={() => setSearchQuery("")}
                  style={styles.clearSearchBtn}
                >
                  <Text style={styles.clearSearchText}>✕</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setIsScannerOpen(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: '#B9829A',
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  borderRadius: 6,
                  marginLeft: 6,
                  cursor: 'pointer',
                }}
                accessibilityRole="button"
                accessibilityLabel="Open Barcode & QR Scanner"
              >
                <Text style={{ fontSize: 13 }}>📷</Text>
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Scanner</Text>
              </Pressable>
            </View>

            {/* Category Chips */}
            <ScrollView
              horizontal={true}
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryScrollContent}
            >
              {categories.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  style={[
                    styles.categoryChip,
                    selectedCategory === cat && styles.categoryChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selectedCategory === cat && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Catalog Grid */}
            <ScrollView
              style={styles.catalogScroll}
              showsVerticalScrollIndicator={true}
            >
              <View style={styles.catalogGrid}>
                {filteredProducts.map((prod) => (
                  <Pressable
                    key={prod.id}
                    onPress={() => handleAddToCart(prod)}
                    style={({ hovered }) => [
                      styles.productCard,
                      hovered && styles.productCardHovered,
                    ]}
                  >
                    <View style={styles.productCardTop}>
                      <Text style={styles.productName} numberOfLines={2}>
                        {prod.name}
                      </Text>
                      <View style={styles.gstTag}>
                        <Text style={styles.gstTagText}>
                          {prod.gstRate}% GST
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.productGeneric} numberOfLines={1}>
                      {prod.generic}
                    </Text>

                    <View style={styles.productBatchRow}>
                      <Text style={styles.productMetaText}>
                        Batch: {prod.batch}
                      </Text>
                      <Text style={styles.productMetaText}>
                        Exp: {prod.expiry}
                      </Text>
                    </View>

                    <View style={styles.productCardBottom}>
                      <View>
                        <Text style={styles.productMrp}>
                          MRP ₹{(Number(prod.mrp) || 0).toFixed(2)}
                        </Text>
                        <Text style={styles.productPrice}>
                          ₹{(Number(prod.sellingPrice) || 0).toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.addBtnCircle}>
                        <Text style={styles.addBtnPlus}>+</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* RIGHT PANE: Cart & Checkout Summary */}
        {(!isMobile || mobileTab === "cart") && (
          <View
            style={[
              styles.rightPane,
              isMobile && styles.rightPaneMobile,
            ]}
          >
            {isMobile && (
              <Pressable
                onPress={() => setMobileTab("catalog")}
                style={styles.mobileBackBtn}
              >
                <Text style={styles.mobileBackBtnText}>
                  ← Back to Adding Medicines
                </Text>
              </Pressable>
            )}
            {/* Cart Header */}
            <View style={styles.cartHeader}>
              <Text style={styles.cartTitle}>
                Active Cart ({cart.length} items)
              </Text>
              <Pressable
                onPress={() => setCart([])}
                style={styles.clearCartBtn}
              >
                <Text style={styles.clearCartText}>Clear</Text>
              </Pressable>
            </View>

            {/* Cart Items List */}
            <ScrollView
              style={[
                styles.cartItemsScroll,
                isMobile && styles.cartItemsScrollMobile,
              ]}
            >
              {cart.length === 0 ? (
                <View style={styles.emptyCartBox}>
                  <Text style={styles.emptyCartEmoji}>🛒</Text>
                  <Text style={styles.emptyCartTitle}>Cart is empty</Text>
                  <Text style={styles.emptyCartSub}>
                    Scan a barcode or tap a product from the list
                  </Text>
                </View>
              ) : (
                cart.map((item, idx) => (
                  <View
                    key={item.id + idx}
                    style={[
                      styles.cartItemRow,
                      isMobile && styles.cartItemRowMobile,
                    ]}
                  >
                    <View
                      style={[
                        styles.cartItemDetails,
                        isMobile && styles.cartItemDetailsMobile,
                      ]}
                    >
                      <Text style={styles.cartItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.cartItemMeta}>
                        Batch: {item.batch} • Exp: {item.expiry}
                      </Text>
                      <Text style={styles.cartItemPrice}>
                        ₹{(Number(item.sellingPrice) || 0).toFixed(2)} each
                      </Text>
                    </View>

                    {/* Quantity Controls */}
                    <View
                      style={[
                        styles.qtyControlsRow,
                        isMobile && styles.qtyControlsRowMobile,
                      ]}
                    >
                      <Pressable
                        onPress={() => handleUpdateQty(idx, -1)}
                        style={styles.qtyBtn}
                      >
                        <Text style={styles.qtyBtnText}>−</Text>
                      </Pressable>
                      <Text style={styles.qtyText}>{item.qty}</Text>
                      <Pressable
                        onPress={() => handleUpdateQty(idx, 1)}
                        style={styles.qtyBtn}
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </Pressable>
                    </View>

                    {/* Line Total */}
                    <View
                      style={[
                        styles.cartItemTotalBox,
                        isMobile && styles.cartItemTotalBoxMobile,
                      ]}
                    >
                      <Text style={styles.cartItemTotal}>
                        ₹
                        {(
                          (Number(item.sellingPrice) || 0) *
                          (Number(item.qty) || 1)
                        ).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Bill Summary Calculations */}
            <View
              style={[
                styles.billSummaryBox,
                isMobile && styles.billSummaryBoxMobile,
              ]}
            >
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryVal}>
                  ₹{totals.subtotal.toFixed(2)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total GST / Taxes</Text>
                <Text style={styles.summaryVal}>
                  ₹{totals.totalTax.toFixed(2)}
                </Text>
              </View>
              {totals.totalDiscounts > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total Discounts</Text>
                  <Text style={[styles.summaryVal, styles.discountVal]}>
                    -₹{totals.totalDiscounts.toFixed(2)}
                  </Text>
                </View>
              )}

              <View style={styles.summaryDivider} />

              <View
                style={[
                  styles.grandTotalRow,
                  isMobile && styles.grandTotalRowMobile,
                ]}
              >
                <Text style={styles.grandTotalLabel}>Grand Total</Text>
                <Text style={styles.grandTotalVal}>
                  ₹{totals.grandTotal.toFixed(2)}
                </Text>
              </View>

              {/* Cart Footer Actions */}
              <View
                style={[
                  styles.cartActionButtonsRow,
                  isMobile && styles.cartActionButtonsRowMobile,
                ]}
              >
                <Pressable
                  onPress={handleHoldBill}
                  style={styles.holdBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Hold Bill"
                >
                  <Text style={styles.holdBtnText}>⏸️ Hold Bill</Text>
                </Pressable>

                <Pressable
                  onPress={handleOpenCheckout}
                  style={styles.checkoutBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Proceed to Payment"
                >
                  <Text style={styles.checkoutBtnText}>
                    Pay ₹{totals.grandTotal.toFixed(2)} ➔
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Floating Bottom Bar on Mobile when on Catalog Tab */}
      {isMobile && mobileTab === "catalog" && cart.length > 0 && (
        <Pressable
          onPress={() => setMobileTab("cart")}
          style={styles.mobileFloatingCart}
          accessibilityRole="button"
          accessibilityLabel="View Current Bill"
        >
          <View style={styles.floatingCartLeft}>
            <View style={styles.floatingCartBadge}>
              <Text style={styles.floatingCartBadgeText}>{cart.length}</Text>
            </View>
            <Text style={styles.floatingCartTitle}>Current Bill</Text>
          </View>
          <View style={styles.floatingCartRight}>
            <Text style={styles.floatingCartTotal}>
              ₹{totals.grandTotal.toFixed(2)}
            </Text>
            <Text style={styles.floatingCartArrow}>View Bill ➔</Text>
          </View>
        </Pressable>
      )}

      {/* ========================================================================= */}
      {/* CHECKOUT MODAL (BIL-08, BIL-09 Split Payments)                           */}
      {/* ========================================================================= */}
      <Modal
        visible={checkoutModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCheckoutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.checkoutModalCard,
              isMobile && styles.checkoutModalCardMobile,
            ]}
          >
            <ScrollView
              style={styles.checkoutModalScroll}
              contentContainerStyle={styles.checkoutModalScrollContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Settle Payment</Text>
                <Text style={styles.modalSubtitle}>
                  Grand Total: ₹{totals.grandTotal.toFixed(2)}
                </Text>
              </View>
              <Pressable
                onPress={() => setCheckoutModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </Pressable>
            </View>

            {/* Payment Method Selector */}
            <View style={styles.paymentMethodTabs}>
              {["Cash", "UPI", "Card", "Credit / Ledger", "Split"].map(
                (mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setPaymentMode(mode)}
                    style={[
                      styles.payModeBtn,
                      paymentMode === mode && styles.payModeBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.payModeBtnText,
                        paymentMode === mode && styles.payModeBtnTextActive,
                      ]}
                    >
                      {mode}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>

            {/* Mode-Specific Input */}
            {paymentMode === "Cash" && (
              <View style={styles.paymentInputsSection}>
                <Text style={styles.fieldLabel}>
                  Cash Tendered by Customer (₹)
                </Text>
                <TextInput
                  style={styles.currencyInputBox}
                  value={cashTendered}
                  onChangeText={setCashTendered}
                  keyboardType="numeric"
                />
                <View style={styles.changeDueRow}>
                  <Text style={styles.changeDueLabel}>
                    Change Due to Return:
                  </Text>
                  <Text style={styles.changeDueValue}>
                    ₹
                    {Math.max(
                      0,
                      (parseFloat(cashTendered) || 0) - totals.grandTotal,
                    ).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            {paymentMode === "UPI" && (
              <View style={styles.paymentInputsSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#B9829A' }}>Customer UPI Scanner</Text>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#B9829A' }}>₹{totals.grandTotal.toFixed(2)}</Text>
                </View>

                <View style={{ alignSelf: 'center', backgroundColor: '#FFFFFF', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E5DFE4', marginBottom: 8, alignItems: 'center' }}>
                  <OfflineQRCode
                    value={`upi://pay?pa=${encodeURIComponent(
                      storeUpiId.trim() || 'pharmaflow@okhdfcbank'
                    )}&pn=PharmaFlow%20Pharmacy&am=${totals.grandTotal.toFixed(
                      2
                    )}&cu=INR&tn=POS-BILL`}
                    size={170}
                  />
                  <Text style={{ textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#4F8A72', marginTop: 4 }}>
                    ⚡ Scan to Pay ₹{totals.grandTotal.toFixed(2)}
                  </Text>
                </View>

                {/* VPA and supported apps */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', padding: 6, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#E5DFE4' }}>
                  <Text style={{ fontSize: 11, color: '#77717A' }}>UPI VPA: <Text style={{ fontWeight: '700', color: '#28242B' }}>{storeUpiId}</Text></Text>
                  <Pressable onPress={() => setIsEditingUpiId(!isEditingUpiId)}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#A66D86' }}>{isEditingUpiId ? 'Done' : 'Edit'}</Text>
                  </Pressable>
                </View>

                {isEditingUpiId && (
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#E5DFE4', borderRadius: 6, padding: 6, fontSize: 12, backgroundColor: '#FFFFFF', marginBottom: 8 }}
                    value={storeUpiId}
                    onChangeText={setStoreUpiId}
                    placeholder="Enter UPI ID"
                    autoCapitalize="none"
                  />
                )}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
                  {['GPay', 'PhonePe', 'Paytm', 'BHIM', 'Any App'].map((app) => (
                    <Text key={app} style={{ fontSize: 10, fontWeight: '700', color: '#77717A', backgroundColor: '#F8F5F7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>{app}</Text>
                  ))}
                </View>

                <TextInput
                  style={{ borderWidth: 1, borderColor: '#E5DFE4', borderRadius: 6, paddingHorizontal: 10, height: 36, fontSize: 12, backgroundColor: '#FFFFFF', marginBottom: 6 }}
                  placeholder="Customer UTR / Ref No. (Optional)"
                  placeholderTextColor="#77717A"
                  value={upiRefNumber}
                  onChangeText={setUpiRefNumber}
                  keyboardType="numeric"
                />

                <Text style={{ fontSize: 11, color: '#C49752', backgroundColor: '#F7F0E5', padding: 6, borderRadius: 6 }}>
                  💡 Customer scans QR code above. Once payment is received, click &apos;Complete Sale &amp; Print&apos;.
                </Text>
              </View>
            )}

            {paymentMode === "Credit / Ledger" && (
              <View style={styles.creditWarnBox}>
                <Text style={styles.creditWarnTitle}>
                  Customer Receivable Ledger
                </Text>
                <Text style={styles.creditWarnDesc}>
                  Will add ₹{totals.grandTotal.toFixed(2)} to{" "}
                  {selectedCustomer.name}&apos;s credit account.
                </Text>
              </View>
            )}

            {paymentMode === "Split" && (
              <View style={styles.paymentInputsSection}>
                <Text style={styles.fieldLabel}>Cash Amount (₹)</Text>
                <TextInput
                  style={styles.currencyInputBox}
                  value={cashTendered}
                  onChangeText={setCashTendered}
                  keyboardType="numeric"
                />
                <Text style={styles.fieldLabel}>UPI / Card Amount (₹)</Text>
                <TextInput
                  style={styles.currencyInputBox}
                  value={upiTendered}
                  onChangeText={setUpiTendered}
                  keyboardType="numeric"
                />
              </View>
            )}

            <View
              style={[
                styles.modalFooterRow,
                isMobile && styles.modalFooterRowMobile,
              ]}
            >
              <Pressable
                onPress={() => setCheckoutModalVisible(false)}
                style={[
                  styles.cancelBtn,
                  isMobile && styles.modalActionButtonMobile,
                ]}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleFinalizeSale}
                style={[
                  styles.confirmPayBtn,
                  isMobile && styles.modalActionButtonMobile,
                ]}
              >
                <Text style={styles.confirmPayBtnText}>
                  Complete Sale & Print
                </Text>
              </Pressable>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* THERMAL RECEIPT MODAL (BIL-10, BIL-19)                                    */}
      {/* ========================================================================= */}
      {completedInvoice && (
        <Modal
          visible={receiptModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setReceiptModalVisible(false)}
        >
          <View style={[styles.modalOverlay, isMobile && styles.modalOverlayMobile]}>
            <ScrollView
              style={styles.receiptScroll}
              contentContainerStyle={styles.receiptScrollContent}
              showsVerticalScrollIndicator
            >
            <View style={[styles.receiptCard, isMobile && styles.receiptCardMobile]}>
              <View style={styles.receiptHeader}>
                <Text style={styles.pharmacyName}>PHARMAFLOW PHARMACY</Text>
                <Text style={styles.pharmacyDetails}>
                  Main Branch • GSTIN: 27AABCP1234F1Z9
                </Text>
                <Text style={styles.receiptDividerText}>
                  - - - - - - - - - - - - - - - - - - - - - - -
                </Text>
              </View>

              <View style={styles.receiptMetaRow}>
                <Text style={styles.receiptMeta}>
                  Invoice: {completedInvoice.invoiceNo}
                </Text>
                <Text style={styles.receiptMeta}>{completedInvoice.date}</Text>
              </View>
              <Text style={styles.receiptMeta}>
                Customer: {completedInvoice.customer}
              </Text>
              <Text style={styles.receiptMeta}>
                Payment Mode: {completedInvoice.paymentMode}
              </Text>

              <Text style={styles.receiptDividerText}>
                - - - - - - - - - - - - - - - - - - - - - - -
              </Text>

              <View style={styles.receiptItemsList}>
                {completedInvoice.items.map((it, i) => (
                  <View key={i} style={styles.receiptItemRow}>
                    <Text style={styles.receiptItemName}>
                      {it.name} x{it.qty}
                    </Text>
                    <Text style={styles.receiptItemAmount}>
                      ₹
                      {(
                        (Number(it.sellingPrice) || 0) * (Number(it.qty) || 1)
                      ).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>

              <Text style={styles.receiptDividerText}>
                - - - - - - - - - - - - - - - - - - - - - - -
              </Text>

              <View style={styles.receiptTotalRow}>
                <Text style={styles.receiptTotalLabel}>
                  Grand Total (Incl. GST):
                </Text>
                <Text style={styles.receiptTotalAmount}>
                  ₹{(Number(completedInvoice.grandTotal) || 0).toFixed(2)}
                </Text>
              </View>

              <View style={{ alignItems: 'center', marginVertical: 8 }}>
                <OfflineQRCode
                  value={`INVOICE:${completedInvoice.invoiceNo}|TOTAL:₹${completedInvoice.grandTotal}|DATE:${completedInvoice.date}`}
                  size={100}
                />
                <Text style={{ fontSize: 10, color: '#77717A', marginTop: 4 }}>Digital E-Invoice Verification</Text>
              </View>

              <Text style={styles.receiptFooterNote}>
                Thank you! Get well soon.
              </Text>

              <View
                style={[
                  styles.receiptActionsRow,
                  isMobile && styles.receiptActionsRowMobile,
                ]}
              >
                <Pressable
                  onPress={() => {
                    setReceiptModalVisible(false);
                    if (onShowToast)
                      onShowToast("🖨️ Sent receipt to thermal printer.");
                  }}
                  style={[
                    styles.printThermalBtn,
                    isMobile && styles.receiptActionButtonMobile,
                  ]}
                >
                  <Text style={styles.printThermalText}>🖨️ Print Receipt</Text>
                </Pressable>
                <Pressable
                  onPress={() => setReceiptModalVisible(false)}
                  style={[
                    styles.doneBtn,
                    isMobile && styles.receiptActionButtonMobile,
                  ]}
                >
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            </View>
            </ScrollView>
          </View>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* CUSTOMER PICKER MODAL (BIL-11)                                            */}
      {/* ========================================================================= */}
      <Modal
        visible={customerModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCustomerModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.customerModalCard,
              isMobile && styles.customerModalCardMobile,
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Customer / Patient</Text>
              <Pressable onPress={() => setCustomerModalVisible(false)}>
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.customerSearchInput}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Search by name, phone or patient ID..."
              autoFocus={true}
            />

            {/* Quick Walk-in Option */}
            <Pressable
              onPress={() => {
                setSelectedCustomer({
                  id: "WALK-IN",
                  name: "Walk-in Customer",
                  phone: "",
                  creditAllowed: false,
                });
                setCustomerModalVisible(false);
              }}
              style={styles.walkInOption}
            >
              <Text style={styles.walkInTitle}>
                👤 Walk-in Customer (Default)
              </Text>
              <Text style={styles.walkInSub}>No patient profile linked</Text>
            </Pressable>

            <ScrollView style={{ maxHeight: 300 }}>
              {customersList.filter(
                (c) =>
                  c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
                  (c.phone && String(c.phone).includes(customerSearch))
              ).map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    setSelectedCustomer(c);
                    setCustomerModalVisible(false);
                    if (onShowToast) onShowToast(`Linked customer: ${c.name}`);
                  }}
                  style={styles.customerOptionRow}
                >
                  <View>
                    <Text style={styles.custOptionName}>{c.name}</Text>
                    <Text style={styles.custOptionMeta}>
                      {c.phone} • {c.category || "General"}
                    </Text>
                  </View>
                  <Text style={styles.custOptionCredit}>
                    Dues: ₹{c.currentBalance || 0}
                  </Text>
                </Pressable>
              ))}
              {customersList.length === 0 && (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <Text style={{ color: '#77717A', fontSize: 13 }}>No customers registered yet</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* POS Universal Barcode & QR Code Scanner Modal */}
      <BarcodeScannerModal
        visible={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
        mode="product"
        title="POS Medicine & Barcode Scanner"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F5F7",
    height: "100%",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
  },
  topBarMobile: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  customerSelectorBtnMobile: {
    width: "100%",
    minWidth: 0,
  },
  posTitleBoxMobile: {
    minWidth: 0,
    width: "100%",
  },
  mobileTabRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 8,
  },
  mobileTabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
  },
  mobileTabItemActive: {
    backgroundColor: "#B9829A",
    borderColor: "#B9829A",
  },
  mobileTabItemText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#77717A",
    textAlign: "center",
    flexShrink: 1,
  },
  mobileTabItemTextActive: {
    color: "#FFFFFF",
  },
  mobileBackBtn: {
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: "center",
  },
  mobileBackBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#B9829A",
  },
  mobileFloatingCart: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: "#B9829A",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 8,
    shadowColor: "#28242B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  floatingCartLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    flexShrink: 1,
  },
  floatingCartBadge: {
    backgroundColor: "#FFFFFF",
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  floatingCartBadgeText: {
    color: "#B9829A",
    fontSize: 13,
    fontWeight: "800",
  },
  floatingCartTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  floatingCartRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  floatingCartTotal: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  floatingCartArrow: {
    color: "#E8D5DD",
    fontSize: 13,
    fontWeight: "700",
  },
  posTitleBox: {
    flex: 1,
  },
  posTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#28242B",
  },
  posSubtitle: {
    fontSize: 12,
    color: "#77717A",
  },
  customerSelectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8F5F7",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    cursor: "pointer",
  },
  customerBtnIcon: {
    fontSize: 16,
  },
  customerBtnName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
  },
  customerBtnPhone: {
    fontSize: 11,
    color: "#77717A",
  },
  customerSelectorArrow: {
    fontSize: 10,
    color: "#77717A",
  },

  // Layout Grid
  layoutGrid: {
    flex: 1,
    flexDirection: "row",
  },
  layoutGridCompact: {
    flexDirection: "column",
  },
  leftPane: {
    flex: 1.4,
    padding: 16,
    borderRightWidth: 1,
    borderRightColor: "#E5DFE4",
    backgroundColor: "#FFFFFF",
  },
  rightPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#F8F5F7",
    padding: 16,
  },
  rightPaneMobile: {
    minHeight: 0,
    padding: 12,
  },

  // Search Bar
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
  },
  searchBarIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 14,
    color: "#28242B",
    outlineStyle: "none",
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    color: "#77717A",
    fontSize: 14,
  },

  // Categories
  categoryScroll: {
    maxHeight: 36,
    marginBottom: 12,
  },
  categoryScrollContent: {
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F8F5F7",
    cursor: "pointer",
  },
  categoryChipActive: {
    backgroundColor: "#B9829A",
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#77717A",
  },
  categoryChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  // Catalog
  catalogScroll: {
    flex: 1,
  },
  catalogGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  productCard: {
    width: "48%",
    minWidth: 160,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    padding: 12,
    cursor: "pointer",
    justifyContent: "space-between",
  },
  productCardHovered: {
    borderColor: "#B9829A",
    shadowColor: "#28242B",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  productCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  productName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
    flex: 1,
  },
  gstTag: {
    backgroundColor: "#F8F5F7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gstTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#77717A",
  },
  productGeneric: {
    fontSize: 11,
    color: "#77717A",
    marginBottom: 8,
  },
  productBatchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  productMetaText: {
    fontSize: 10,
    color: "#77717A",
  },
  productCardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F8F5F7",
    paddingTop: 8,
  },
  productMrp: {
    fontSize: 10,
    color: "#77717A",
    textDecorationLine: "line-through",
  },
  productPrice: {
    fontSize: 15,
    fontWeight: "800",
    color: "#B9829A",
  },
  addBtnCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EAF2EE",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnPlus: {
    fontSize: 16,
    fontWeight: "800",
    color: "#4F8A72",
  },

  // Cart
  cartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cartTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#28242B",
  },
  clearCartBtn: {
    padding: 4,
  },
  clearCartText: {
    fontSize: 12,
    color: "#B85C64",
    fontWeight: "600",
  },
  cartItemsScroll: {
    flex: 1,
    minHeight: 180,
  },
  cartItemsScrollMobile: {
    minHeight: 0,
  },
  emptyCartBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyCartEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyCartTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#77717A",
  },
  emptyCartSub: {
    fontSize: 12,
    color: "#77717A",
  },
  cartItemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    marginBottom: 8,
  },
  cartItemRowMobile: {
    flexWrap: "wrap",
    gap: 8,
  },
  cartItemDetails: {
    flex: 1.2,
  },
  cartItemDetailsMobile: {
    flexBasis: "100%",
    minWidth: 0,
  },
  cartItemName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#28242B",
  },
  cartItemMeta: {
    fontSize: 10,
    color: "#77717A",
  },
  cartItemPrice: {
    fontSize: 11,
    color: "#B9829A",
    fontWeight: "600",
  },
  qtyControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 8,
  },
  qtyControlsRowMobile: {
    marginHorizontal: 0,
  },
  qtyBtn: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: "#F8F5F7",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  qtyBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#28242B",
  },
  qtyText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
    minWidth: 18,
    textAlign: "center",
  },
  cartItemTotalBox: {
    minWidth: 60,
    alignItems: "flex-end",
  },
  cartItemTotalBoxMobile: {
    marginLeft: "auto",
  },
  cartItemTotal: {
    fontSize: 13,
    fontWeight: "800",
    color: "#28242B",
  },

  // Bill Summary
  billSummaryBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    padding: 14,
    marginTop: 10,
  },
  billSummaryBoxMobile: {
    padding: 10,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#77717A",
  },
  summaryVal: {
    fontSize: 12,
    fontWeight: "600",
    color: "#28242B",
  },
  discountVal: {
    color: "#C49752",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#E5DFE4",
    marginVertical: 8,
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  grandTotalRowMobile: {
    marginBottom: 8,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#28242B",
  },
  grandTotalVal: {
    fontSize: 20,
    fontWeight: "900",
    color: "#4F8A72",
  },
  cartActionButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  cartActionButtonsRowMobile: {
    flexDirection: "column",
    gap: 8,
  },
  holdBtn: {
    flex: 1,
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    cursor: "pointer",
  },
  holdBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
  },
  checkoutBtn: {
    flex: 1.5,
    backgroundColor: "#4F8A72",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    cursor: "pointer",
  },
  checkoutBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    flexShrink: 1,
    textAlign: "center",
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalOverlayMobile: {
    padding: 8,
    justifyContent: "center",
  },
  checkoutModalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 500,
  },
  checkoutModalCardMobile: {
    padding: 12,
    height: "94%",
    maxHeight: "94%",
    overflow: "hidden",
  },
  checkoutModalScroll: {
    flex: 1,
    maxHeight: "100%",
  },
  checkoutModalScrollContent: {
    paddingBottom: 4,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#28242B",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#77717A",
  },
  modalCloseBtnText: {
    fontSize: 18,
    color: "#77717A",
  },
  paymentMethodTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  payModeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
    cursor: "pointer",
  },
  payModeBtnActive: {
    backgroundColor: "#4F8A72",
    borderColor: "#4F8A72",
  },
  payModeBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#77717A",
  },
  payModeBtnTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  paymentInputsSection: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#28242B",
    marginBottom: 6,
  },
  currencyInputBox: {
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  changeDueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#EAF2EE",
    padding: 10,
    borderRadius: 6,
  },
  changeDueLabel: {
    fontSize: 13,
    color: "#4F8A72",
    fontWeight: "600",
  },
  changeDueValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#4F8A72",
  },
  qrSectionBox: {
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F8F5F7",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    marginBottom: 16,
  },
  qrIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  qrText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
  },
  qrSubText: {
    fontSize: 12,
    color: "#77717A",
  },
  creditWarnBox: {
    padding: 14,
    backgroundColor: "#E8D5DD",
    borderRadius: 8,
    marginBottom: 16,
  },
  creditWarnTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#30243D",
  },
  creditWarnDesc: {
    fontSize: 12,
    color: "#B9829A",
    marginTop: 2,
  },
  modalFooterRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalFooterRowMobile: {
    flexDirection: "column-reverse",
    alignItems: "stretch",
  },
  modalActionButtonMobile: {
    width: "100%",
    alignItems: "center",
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5DFE4",
  },
  cancelBtnText: {
    fontSize: 13,
    color: "#77717A",
  },
  confirmPayBtn: {
    backgroundColor: "#4F8A72",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 6,
  },
  confirmPayBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },

  // Receipt Card
  receiptCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 20,
    width: "100%",
    maxWidth: 380,
    fontFamily: Platform.select({ web: "monospace", default: "System" }),
  },
  receiptScroll: {
    width: "100%",
    maxHeight: "94%",
  },
  receiptScrollContent: {
    alignItems: "center",
    paddingVertical: 4,
  },
  receiptCardMobile: {
    padding: 14,
  },
  receiptHeader: {
    alignItems: "center",
  },
  pharmacyName: {
    fontSize: 16,
    fontWeight: "900",
    color: "#28242B",
  },
  pharmacyDetails: {
    fontSize: 11,
    color: "#77717A",
  },
  receiptDividerText: {
    color: "#77717A",
    marginVertical: 4,
  },
  receiptMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  receiptMeta: {
    fontSize: 11,
    color: "#77717A",
  },
  receiptItemsList: {
    gap: 4,
  },
  receiptItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  receiptItemName: {
    fontSize: 11,
    color: "#28242B",
    flex: 1,
    minWidth: 0,
  },
  receiptItemAmount: {
    fontSize: 11,
    fontWeight: "700",
    color: "#28242B",
  },
  receiptTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 6,
  },
  receiptTotalLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#28242B",
  },
  receiptTotalAmount: {
    fontSize: 15,
    fontWeight: "900",
    color: "#4F8A72",
  },
  receiptFooterNote: {
    fontSize: 11,
    textAlign: "center",
    color: "#77717A",
    marginTop: 6,
  },
  receiptActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  receiptActionsRowMobile: {
    flexDirection: "column",
  },
  receiptActionButtonMobile: {
    width: "100%",
  },
  printThermalBtn: {
    flex: 1,
    backgroundColor: "#B9829A",
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  printThermalText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  doneBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    alignItems: "center",
  },
  doneBtnText: {
    color: "#28242B",
    fontWeight: "600",
    fontSize: 12,
  },

  // Customer Modal
  customerModalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    width: "100%",
    maxWidth: 480,
  },
  customerModalCardMobile: {
    padding: 14,
  },
  customerSearchInput: {
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 12,
  },
  walkInOption: {
    padding: 12,
    backgroundColor: "#F8F5F7",
    borderRadius: 8,
    marginBottom: 10,
  },
  walkInTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
  },
  walkInSub: {
    fontSize: 11,
    color: "#77717A",
  },
  customerOptionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
  },
  custOptionName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
  },
  custOptionMeta: {
    fontSize: 11,
    color: "#77717A",
  },
  custOptionCredit: {
    fontSize: 12,
    fontWeight: "700",
    color: "#C49752",
  },
});

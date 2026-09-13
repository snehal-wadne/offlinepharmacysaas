import React, { useState } from "react";
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
import { MOCK_POS_PRODUCTS } from '../../data/cashierMockData';
import { MOCK_CUSTOMERS_LIST } from '../../data/customersMockData';
import { useOfflineSync } from '../../offline/OfflineSyncContext';
import { SkeletonItemCard } from '../../components/common/SkeletonLoader';
import PaginationControls from '../../components/common/PaginationControls';

export default function PosBillingScreen({
  onNavigate,
  onShowToast,
  isMultiBranch = true,
}) {
  const offlineSync = useOfflineSync();
  const productsList =
    offlineSync?.products && offlineSync.products.length > 0
      ? offlineSync.products
      : MOCK_POS_PRODUCTS;
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1100;
  
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  useEffect(() => {
    // Simulate loading since data is mostly synchronous here
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  // Active Tab on Mobile: 'catalog' | 'cart'
  const [mobileTab, setMobileTab] = useState("catalog");

  // Search & Catalog State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

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
    const q = searchQuery.toLowerCase();
    const matchSearch =
      prod.name.toLowerCase().includes(q) ||
      prod.generic.toLowerCase().includes(q) ||
      (prod.barcode && String(prod.barcode).includes(q)) ||
      prod.sku.toLowerCase().includes(q);
    const matchCat =
      selectedCategory === "All" || prod.category === selectedCategory;
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

  // Finalize Sale (BIL-10)
  const handleFinalizeSale = () => {
    const invNo = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const newInv = {
      invoiceNo: invNo,
      date:
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
      customer: selectedCustomer.name,
      customerPhone: selectedCustomer.phone || "N/A",
      paymentMode,
      subtotal: totals.subtotal,
      totalDiscounts: totals.totalDiscounts,
      tax: totals.totalTax,
      grandTotal: totals.grandTotal,
      items: [...cart],
      cashier: "Cashier 01",
    };

    // Deduct stock, store invoice offline, and enqueue sync mutation
    if (offlineSync?.recordSaleOffline) {
      offlineSync.recordSaleOffline(newInv, cart);
    }

    setCompletedInvoice(newInv);
    setCheckoutModalVisible(false);
    setReceiptModalVisible(true);
    setCart([]);

    if (onShowToast) {
      onShowToast(
        `✓ Invoice ${invNo} generated! Stock deducted offline & queued for sync.`,
      );
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
        <View style={styles.posTitleBox}>
          <Text style={styles.posTitle}>POS Billing & Checkout</Text>
          <Text style={styles.posSubtitle}>
            Counter 01 • Fast Prescription & OTC Sales (BIL-01)
          </Text>
        </View>

        {/* Customer Badge Selector */}
        <Pressable
          onPress={() => setCustomerModalVisible(true)}
          style={styles.customerSelectorBtn}
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
<<<<<<< HEAD
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
          <ScrollView style={styles.catalogScroll} showsVerticalScrollIndicator={true}>
            <View style={styles.catalogGrid}>
              {paginatedData.map((prod) => (
=======
            {/* Search Input Bar */}
            <View style={styles.searchBarRow}>
              <Text style={styles.searchBarIcon}>🔍</Text>
              <TextInput
                style={styles.searchBarInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Scan barcode or type medicine name, formula, SKU..."
                placeholderTextColor="#94A3B8"
                autoFocus={true}
              />
              {searchQuery ? (
>>>>>>> origin/main
                <Pressable
                  onPress={() => setSearchQuery("")}
                  style={styles.clearSearchBtn}
                >
                  <Text style={styles.clearSearchText}>✕</Text>
                </Pressable>
              ) : null}
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
<<<<<<< HEAD
            </View>
          </ScrollView>
          <View style={{ padding: 16 }}>
            <PaginationControls
              currentPage={currentPage}
              totalItems={filteredProducts.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
            />
          </View>
        </View>
=======
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
>>>>>>> origin/main
        )}

        {/* RIGHT PANE: Cart & Checkout Summary */}
        {(!isMobile || mobileTab === "cart") && (
          <View style={[styles.rightPane, isMobile && { flex: 1 }]}>
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
            <ScrollView style={styles.cartItemsScroll}>
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
                  <View key={item.id + idx} style={styles.cartItemRow}>
                    <View style={styles.cartItemDetails}>
                      <Text style={styles.cartItemName}>{item.name}</Text>
                      <Text style={styles.cartItemMeta}>
                        Batch: {item.batch} • Exp: {item.expiry}
                      </Text>
                      <Text style={styles.cartItemPrice}>
                        ₹{(Number(item.sellingPrice) || 0).toFixed(2)} each
                      </Text>
                    </View>

                    {/* Quantity Controls */}
                    <View style={styles.qtyControlsRow}>
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
                    <View style={styles.cartItemTotalBox}>
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
            <View style={styles.billSummaryBox}>
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

              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>Grand Total</Text>
                <Text style={styles.grandTotalVal}>
                  ₹{totals.grandTotal.toFixed(2)}
                </Text>
              </View>

              {/* Cart Footer Actions */}
              <View style={styles.cartActionButtonsRow}>
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
              <View style={styles.qrSectionBox}>
<<<<<<< HEAD
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F766E' }}>Customer UPI Scanner</Text>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F766E' }}>₹{totals.grandTotal.toFixed(2)}</Text>
                </View>

                <View style={{ alignSelf: 'center', backgroundColor: '#FFFFFF', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 }}>
                  <Image
                    source={{
                      uri: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                        `upi://pay?pa=${encodeURIComponent(
                          storeUpiId.trim() || 'pharmaflow@okhdfcbank'
                        )}&pn=PharmaFlow%20Pharmacy&am=${totals.grandTotal.toFixed(
                          2
                        )}&cu=INR&tn=${encodeURIComponent(
                          `POS-${Date.now().toString().slice(-6)}`
                        )}`
                      )}`,
                    }}
                    style={{ width: 160, height: 160 }}
                    resizeMode="contain"
                  />
                  <Text style={{ textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#059669', marginTop: 4 }}>
                    ⚡ Scan to Pay ₹{totals.grandTotal.toFixed(2)}
                  </Text>
                </View>

                {/* VPA and supported apps */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 6, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>UPI VPA: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{storeUpiId}</Text></Text>
                  <Pressable onPress={() => setIsEditingUpiId(!isEditingUpiId)}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#0D9488' }}>{isEditingUpiId ? 'Done' : 'Edit'}</Text>
                  </Pressable>
                </View>

                {isEditingUpiId && (
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 6, padding: 6, fontSize: 12, backgroundColor: '#FFFFFF', marginBottom: 8 }}
                    value={storeUpiId}
                    onChangeText={setStoreUpiId}
                    placeholder="Enter UPI ID"
                    autoCapitalize="none"
                  />
                )}

                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
                  {['GPay', 'PhonePe', 'Paytm', 'BHIM', 'Any App'].map((app) => (
                    <Text key={app} style={{ fontSize: 10, fontWeight: '700', color: '#475569', backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>{app}</Text>
                  ))}
                </View>

                <TextInput
                  style={{ borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 6, paddingHorizontal: 10, height: 36, fontSize: 12, backgroundColor: '#FFFFFF', marginBottom: 6 }}
                  placeholder="Customer UTR / Ref No. (Optional)"
                  placeholderTextColor="#94A3B8"
                  value={upiRefNumber}
                  onChangeText={setUpiRefNumber}
                  keyboardType="numeric"
                />

                <Text style={{ fontSize: 11, color: '#92400E', backgroundColor: '#FEF3C7', padding: 6, borderRadius: 6 }}>
                  💡 Customer scans QR code above. Once payment is received, click &apos;Complete Sale &amp; Print&apos;.
                </Text>
              </View>
            )}

            {paymentMode === 'Credit / Ledger' && (
              <View style={styles.creditWarnBox}>
                <Text style={styles.creditWarnTitle}>Customer Receivable Ledger</Text>
                <Text style={styles.creditWarnDesc}>
                  Will add ₹{totals.grandTotal.toFixed(2)} to {selectedCustomer.name}&apos;s credit account.
=======
                <Text style={styles.qrIcon}>📷</Text>
                <Text style={styles.qrText}>
                  Show Store Dynamic UPI QR to Customer
                </Text>
                <Text style={styles.qrSubText}>
                  Amount: ₹{totals.grandTotal.toFixed(2)}
>>>>>>> origin/main
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

            <View style={styles.modalFooterRow}>
              <Pressable
                onPress={() => setCheckoutModalVisible(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleFinalizeSale}
                style={styles.confirmPayBtn}
              >
                <Text style={styles.confirmPayBtnText}>
                  Complete Sale & Print
                </Text>
              </Pressable>
            </View>
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
          <View style={styles.modalOverlay}>
            <View style={styles.receiptCard}>
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

              <Text style={styles.receiptFooterNote}>
                Thank you! Get well soon.
              </Text>

              <View style={styles.receiptActionsRow}>
                <Pressable
                  onPress={() => {
                    setReceiptModalVisible(false);
                    if (onShowToast)
                      onShowToast("🖨️ Sent receipt to thermal printer.");
                  }}
                  style={styles.printThermalBtn}
                >
                  <Text style={styles.printThermalText}>🖨️ Print Receipt</Text>
                </Pressable>
                <Pressable
                  onPress={() => setReceiptModalVisible(false)}
                  style={styles.doneBtn}
                >
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            </View>
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
              {MOCK_CUSTOMERS_LIST.filter(
                (c) =>
                  c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
<<<<<<< HEAD
                  (c.phone && String(c.phone).includes(customerSearch))
=======
                  c.phone.includes(customerSearch),
>>>>>>> origin/main
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
                      {c.phone} • {c.category}
                    </Text>
                  </View>
                  <Text style={styles.custOptionCredit}>
                    Dues: {c.currentBalance}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
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
    borderBottomColor: "#E2E8F0",
  },
  topBarMobile: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
  },
  mobileTabRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
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
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  mobileTabItemActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  mobileTabItemText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#475569",
  },
  mobileTabItemTextActive: {
    color: "#FFFFFF",
  },
  mobileBackBtn: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: "center",
  },
  mobileBackBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F766E",
  },
  mobileFloatingCart: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: "#0F766E",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 18,
    shadowColor: "#000",
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
    color: "#0F766E",
    fontSize: 13,
    fontWeight: "800",
  },
  floatingCartTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  floatingCartRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  floatingCartTotal: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  floatingCartArrow: {
    color: "#CCFBF1",
    fontSize: 13,
    fontWeight: "700",
  },
  posTitleBox: {
    flex: 1,
  },
  posTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  posSubtitle: {
    fontSize: 12,
    color: "#64748B",
  },
  customerSelectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    cursor: "pointer",
  },
  customerBtnIcon: {
    fontSize: 16,
  },
  customerBtnName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  customerBtnPhone: {
    fontSize: 11,
    color: "#64748B",
  },
  customerSelectorArrow: {
    fontSize: 10,
    color: "#64748B",
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
    borderRightColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  rightPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#F8FAFC",
    padding: 16,
  },

  // Search Bar
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
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
    color: "#0F172A",
    outlineStyle: "none",
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    color: "#94A3B8",
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
    backgroundColor: "#F1F5F9",
    cursor: "pointer",
  },
  categoryChipActive: {
    backgroundColor: "#0F766E",
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
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
    borderColor: "#E2E8F0",
    padding: 12,
    cursor: "pointer",
    justifyContent: "space-between",
  },
  productCardHovered: {
    borderColor: "#0F766E",
    shadowColor: "#000",
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
    color: "#0F172A",
    flex: 1,
  },
  gstTag: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gstTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
  },
  productGeneric: {
    fontSize: 11,
    color: "#64748B",
    marginBottom: 8,
  },
  productBatchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  productMetaText: {
    fontSize: 10,
    color: "#94A3B8",
  },
  productCardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 8,
  },
  productMrp: {
    fontSize: 10,
    color: "#94A3B8",
    textDecorationLine: "line-through",
  },
  productPrice: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F766E",
  },
  addBtnCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E6F4EA",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnPlus: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F5C3E",
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
    color: "#0F172A",
  },
  clearCartBtn: {
    padding: 4,
  },
  clearCartText: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "600",
  },
  cartItemsScroll: {
    flex: 1,
    minHeight: 180,
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
    color: "#64748B",
  },
  emptyCartSub: {
    fontSize: 12,
    color: "#94A3B8",
  },
  cartItemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  cartItemDetails: {
    flex: 1.2,
  },
  cartItemName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  cartItemMeta: {
    fontSize: 10,
    color: "#64748B",
  },
  cartItemPrice: {
    fontSize: 11,
    color: "#0F766E",
    fontWeight: "600",
  },
  qtyControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 8,
  },
  qtyBtn: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  qtyBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  qtyText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    minWidth: 18,
    textAlign: "center",
  },
  cartItemTotalBox: {
    minWidth: 60,
    alignItems: "flex-end",
  },
  cartItemTotal: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },

  // Bill Summary
  billSummaryBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginTop: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#64748B",
  },
  summaryVal: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
  },
  discountVal: {
    color: "#B45309",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 8,
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  grandTotalVal: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F5C3E",
  },
  cartActionButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  holdBtn: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    cursor: "pointer",
  },
  holdBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  checkoutBtn: {
    flex: 1.5,
    backgroundColor: "#0F5C3E",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    cursor: "pointer",
  },
  checkoutBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  checkoutModalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 500,
  },
  checkoutModalCardMobile: {
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#64748B",
  },
  modalCloseBtnText: {
    fontSize: 18,
    color: "#94A3B8",
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
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    cursor: "pointer",
  },
  payModeBtnActive: {
    backgroundColor: "#0F5C3E",
    borderColor: "#0F5C3E",
  },
  payModeBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
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
    color: "#1E293B",
    marginBottom: 6,
  },
  currencyInputBox: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
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
    backgroundColor: "#ECFDF5",
    padding: 10,
    borderRadius: 6,
  },
  changeDueLabel: {
    fontSize: 13,
    color: "#065F46",
    fontWeight: "600",
  },
  changeDueValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#065F46",
  },
  qrSectionBox: {
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  qrIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  qrText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  qrSubText: {
    fontSize: 12,
    color: "#64748B",
  },
  creditWarnBox: {
    padding: 14,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    marginBottom: 16,
  },
  creditWarnTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E40AF",
  },
  creditWarnDesc: {
    fontSize: 12,
    color: "#3B82F6",
    marginTop: 2,
  },
  modalFooterRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cancelBtnText: {
    fontSize: 13,
    color: "#64748B",
  },
  confirmPayBtn: {
    backgroundColor: "#0F5C3E",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 6,
  },
  confirmPayBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
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
  receiptHeader: {
    alignItems: "center",
  },
  pharmacyName: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  pharmacyDetails: {
    fontSize: 11,
    color: "#64748B",
  },
  receiptDividerText: {
    color: "#94A3B8",
    marginVertical: 4,
  },
  receiptMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  receiptMeta: {
    fontSize: 11,
    color: "#475569",
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
    color: "#0F172A",
  },
  receiptItemAmount: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
  },
  receiptTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 6,
  },
  receiptTotalLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  receiptTotalAmount: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0F5C3E",
  },
  receiptFooterNote: {
    fontSize: 11,
    textAlign: "center",
    color: "#64748B",
    marginTop: 6,
  },
  receiptActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  printThermalBtn: {
    flex: 1,
    backgroundColor: "#0F766E",
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
    borderColor: "#CBD5E1",
    alignItems: "center",
  },
  doneBtnText: {
    color: "#334155",
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
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 12,
  },
  walkInOption: {
    padding: 12,
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    marginBottom: 10,
  },
  walkInTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  walkInSub: {
    fontSize: 11,
    color: "#64748B",
  },
  customerOptionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  custOptionName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  custOptionMeta: {
    fontSize: 11,
    color: "#64748B",
  },
  custOptionCredit: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B45309",
  },
});

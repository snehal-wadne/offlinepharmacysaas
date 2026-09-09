import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { usePos } from '../../context/PosContext';
import { MOCK_CUSTOMERS_LIST } from '../../data/customersMockData';
import BarcodeScannerModal from '../../components/common/BarcodeScannerModal';

export default function SalesScreen({ onNavigate, onShowToast, isMultiBranch = true }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1080;

  // Shared POS Context
  const {
    products,
    activeResumedDraft,
    holdBill,
    closeResumedDraft,
    finalizeSale,
  } = usePos();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const searchInputRef = useRef(null);

  // Barcode Scanner Modal State
  const [scannerModalVisible, setScannerModalVisible] = useState(false);

  // Customer Selection State
  const [customers, setCustomers] = useState(MOCK_CUSTOMERS_LIST);
  const [selectedCustomer, setSelectedCustomer] = useState({
    id: 'WALK-IN',
    name: 'Walk-in Customer',
    phone: '',
    currentBalance: '₹0.00',
  });
  const [customCustomerInput, setCustomCustomerInput] = useState('');
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Active Billing Cart State
  const [cart, setCart] = useState([]);

  // Interactive Batch Dropdown State (Product ID whose batch selector is currently expanded)
  const [openBatchDropdownId, setOpenBatchDropdownId] = useState(null);

  // Discounts
  const [billDiscountInput, setBillDiscountInput] = useState('0');
  const [appliedDiscount, setAppliedDiscount] = useState(0);

  // Payment Mode
  const [paymentMode, setPaymentMode] = useState('Cash'); // 'Cash' | 'Card' | 'UPI' | 'Split'
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [cashTendered, setCashTendered] = useState('');

  // Thermal Receipt State
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState(null);

  // Top Draft notification banner
  const [topToastBanner, setTopToastBanner] = useState('');

  // Load Resumed Draft whenever activeResumedDraft is set
  useEffect(() => {
    if (activeResumedDraft) {
      // 1. Populate Customer
      const custName = activeResumedDraft.customerName || 'Walk-in Customer';
      const custPhone = activeResumedDraft.customerPhone || '';
      setSelectedCustomer({
        id: 'DRAFT-CUST',
        name: custName,
        phone: custPhone,
        currentBalance: '₹0.00',
      });
      setCustomCustomerInput(custPhone || custName);

      // 2. Populate Cart Items
      if (activeResumedDraft.items && activeResumedDraft.items.length > 0) {
        setCart(
          activeResumedDraft.items.map((item) => ({
            ...item,
            id: item.id || `PRD-${Math.random().toString().slice(-4)}`,
            stock: item.stock || 100,
            sellingPrice: item.sellingPrice || item.price || 0,
            qty: item.qty || 1,
            gstRate: item.gstRate || 5,
            batch: item.batch || 'B001',
          }))
        );
      }

      // 3. Populate Discount if any
      if (activeResumedDraft.discountPercent) {
        setBillDiscountInput(String(activeResumedDraft.discountPercent));
        setAppliedDiscount(Number(activeResumedDraft.discountPercent));
      }

      // 4. Show top notification banner (Image 4 top banner)
      const bannerText = `Draft ${activeResumedDraft.billNo || activeResumedDraft.holdId} loaded for ${custName}`;
      setTopToastBanner(bannerText);

      if (onShowToast) {
        onShowToast(bannerText);
      }
    }
  }, [activeResumedDraft]);

  // Popular medicines (Image 1 quick add list)
  const popularMedicines = products.slice(0, 5);

  // Filtered Products for Search Results
  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.generic && p.generic.toLowerCase().includes(q)) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.includes(q)) ||
      (p.batch && p.batch.toLowerCase().includes(q))
    );
  });

  // Add medicine to cart (handles specific batch selection from 3 Batches dropdown)
  const handleAddToCart = (product, specificBatch = null) => {
    const batchToUse =
      specificBatch?.batch ||
      (typeof specificBatch === 'string' ? specificBatch : null) ||
      product.batch ||
      'B001';
    const priceToUse = specificBatch?.price || product.sellingPrice;
    const expiryToUse = specificBatch?.expiry || product.expiry || '12/2026';
    const stockToUse = specificBatch?.stock || product.stock || 100;

    const existingIndex = cart.findIndex(
      (item) => (item.id === product.id || item.name === product.name) && item.batch === batchToUse
    );

    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].qty += 1;
      setCart(updated);
      if (onShowToast) onShowToast(`Increased ${product.name} (Batch ${batchToUse}) qty to ${updated[existingIndex].qty}`);
    } else {
      setCart([
        ...cart,
        {
          id: product.id,
          name: product.name,
          generic: product.generic || product.sku || '',
          batch: batchToUse,
          expiry: expiryToUse,
          sellingPrice: priceToUse,
          mrp: product.mrp || priceToUse * 1.1,
          stock: stockToUse,
          qty: 1,
          gstRate: product.gstRate || 5,
          barcode: product.barcode || '',
          sku: product.sku || '',
        },
      ]);
      if (onShowToast) onShowToast(`✓ Added ${product.name} (Batch ${batchToUse}) to cart.`);
    }
  };

  // Quantity Stepper (+ / -)
  const handleUpdateQty = (index, delta) => {
    const updated = [...cart];
    const newQty = updated[index].qty + delta;
    if (newQty <= 0) {
      updated.splice(index, 1);
      setCart(updated);
    } else {
      updated[index].qty = newQty;
      setCart(updated);
    }
  };

  // Remove Item
  const handleRemoveItem = (index) => {
    const updated = [...cart];
    updated.splice(index, 1);
    setCart(updated);
  };

  // Clear Cart
  const handleClearCart = () => {
    setCart([]);
    setBillDiscountInput('0');
    setAppliedDiscount(0);
    if (onShowToast) onShowToast('Cart cleared.');
  };

  // Calculations
  const calculateTotals = () => {
    let subtotal = 0;
    let includedTax = 0;

    cart.forEach((item) => {
      const lineTotal = item.sellingPrice * item.qty;
      subtotal += lineTotal;
      // GST calculation (standard Indian pharmacy POS: GST is included in MRP / selling price)
      const gstRate = item.gstRate || 5;
      const taxComponent = lineTotal - lineTotal / (1 + gstRate / 100);
      includedTax += taxComponent;
    });

    const discountAmount = (subtotal * appliedDiscount) / 100;
    const finalTotal = Math.max(0, subtotal - discountAmount);

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      includedTax: parseFloat(includedTax.toFixed(2)),
      excludedTax: 0.0,
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      grandTotal: parseFloat(finalTotal.toFixed(2)),
    };
  };

  const totals = calculateTotals();

  // Apply discount button
  const handleApplyDiscount = () => {
    const num = parseFloat(billDiscountInput) || 0;
    setAppliedDiscount(num);
    if (onShowToast) onShowToast(`Applied ${num}% discount`);
  };

  // HOLD BILL (Email Draft Concept)
  const handleHoldBillAction = () => {
    if (cart.length === 0) {
      if (onShowToast) onShowToast('⚠️ Cannot hold an empty bill. Add medicines first.');
      return;
    }

    const custName = customCustomerInput.trim() || selectedCustomer.name || 'Walk-in Customer';
    const custPhone = selectedCustomer.phone || (customCustomerInput.includes('+') ? customCustomerInput : '');

    const billData = {
      customerName: custName,
      customerPhone: custPhone,
      items: [...cart],
      subtotal: totals.subtotal,
      tax: totals.includedTax,
      discountPercent: appliedDiscount,
      total: totals.grandTotal,
      note: activeResumedDraft
        ? `Draft updated from New Sale`
        : `Saved as draft from New Sale`,
    };

    const savedDraftId = holdBill(billData, activeResumedDraft?.holdId || activeResumedDraft?.billNo);

    if (onShowToast) {
      onShowToast(`✓ Bill saved as draft #${savedDraftId} in Hold Bills!`);
    }

    // Reset local state
    setCart([]);
    setCustomCustomerInput('');
    setSelectedCustomer({
      id: 'WALK-IN',
      name: 'Walk-in Customer',
      phone: '',
      currentBalance: '₹0.00',
    });
    setTopToastBanner('');
  };

  // PAY NOW / COMPLETE SALE
  const handleOpenCheckout = () => {
    if (cart.length === 0) {
      if (onShowToast) onShowToast('⚠️ Cart is empty. Please add medicines.');
      return;
    }
    setCashTendered(totals.grandTotal.toFixed(2));
    setCheckoutModalVisible(true);
  };

  const handleFinalizeSale = () => {
    const custName = customCustomerInput.trim() || selectedCustomer.name || 'Walk-in Customer';
    const custPhone = selectedCustomer.phone || '';

    const saleData = {
      customer: custName,
      customerPhone: custPhone,
      paymentMode,
      items: [...cart],
      subtotal: totals.subtotal,
      tax: totals.includedTax,
      total: totals.grandTotal,
      draftId: activeResumedDraft?.holdId || activeResumedDraft?.billNo,
    };

    const newInvoice = finalizeSale(saleData);
    setCompletedInvoice(newInvoice);
    setCheckoutModalVisible(false);
    setReceiptModalVisible(true);

    // Clear cart and draft indicators
    setCart([]);
    setCustomCustomerInput('');
    setTopToastBanner('');
    setSelectedCustomer({
      id: 'WALK-IN',
      name: 'Walk-in Customer',
      phone: '',
      currentBalance: '₹0.00',
    });

    if (onShowToast) {
      onShowToast(`✓ Invoice ${newInvoice.invoiceNo} completed! Paid ₹${newInvoice.total.toFixed(2)}`);
    }
  };

  // Handle barcode scanned from camera or gun
  const handleBarcodeScanned = (scannedCode) => {
    const code = scannedCode.trim().toLowerCase();
    const match = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === code) ||
        (p.sku && p.sku.toLowerCase() === code) ||
        p.name.toLowerCase().includes(code)
    );

    if (match) {
      handleAddToCart(match);
      setScannerModalVisible(false);
      if (onShowToast) {
        onShowToast(`📷 Scanned [${scannedCode}]: Added ${match.name}`);
      }
    } else {
      if (onShowToast) {
        onShowToast(`⚠️ No product found with barcode "${scannedCode}".`);
      }
    }
  };

  return (
    <View style={styles.screenContainer}>
      {/* Top Banner (Matches Image 4 dark green banner when draft resumed) */}
      {topToastBanner ? (
        <View style={styles.topDraftBanner}>
          <Text style={styles.topDraftBannerText}>{topToastBanner}</Text>
        </View>
      ) : null}

      {/* DRAFT RESUMED Alert Bar (Matches Image 4 yellow/amber alert bar) */}
      {activeResumedDraft ? (
        <View style={styles.draftResumedAlertBar}>
          <View style={styles.draftResumedLeftGroup}>
            <View style={styles.draftResumedBadge}>
              <Text style={styles.draftResumedBadgeText}>DRAFT RESUMED</Text>
            </View>
            <Text style={styles.draftResumedDescText}>
              Editing Hold Bill #{activeResumedDraft.billNo || activeResumedDraft.holdId} (
              {activeResumedDraft.customerPhone || activeResumedDraft.customerName}) •{' '}
              {cart.length} medicines
            </Text>
          </View>
          <Pressable
            onPress={() => {
              closeResumedDraft();
              setTopToastBanner('');
              if (onShowToast) onShowToast('Draft editing closed.');
            }}
            style={styles.closeDraftBtn}
          >
            <Text style={styles.closeDraftBtnText}>Close Draft</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Main Dual-Pane POS Layout */}
      <View style={[styles.mainLayoutGrid, isCompact && styles.mainLayoutGridCompact]}>
        {/* ========================================================================= */}
        {/* LEFT PANE: Search, Popular Medicines, Search Results                     */}
        {/* ========================================================================= */}
        <View style={styles.leftCatalogPane}>
          {/* Header Title */}
          <View style={styles.posHeaderBox}>
            <Text style={styles.posHeaderTitle}>New Sale</Text>
            <Text style={styles.posHeaderSubtitle}>
              Search and add medicines with 3 batch inventory
            </Text>
          </View>

          {/* Search Bar with Scan Button */}
          <View style={styles.searchBarWrapper}>
            <Text style={styles.searchMagnifier}>🔍</Text>
            <TextInput
              ref={searchInputRef}
              style={styles.searchTextInput}
              placeholder="Search medicine, SKU, batch or barcode..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                <Text style={styles.clearSearchBtnText}>✕</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setScannerModalVisible(true)}
              style={styles.scanBtnInSearch}
              accessibilityLabel="Scan barcode or QR"
            >
              <Text style={styles.scanBtnIcon}>📷</Text>
              <Text style={styles.scanBtnText}>Scan</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.catalogScroll} showsVerticalScrollIndicator={true}>
            {/* 1. Popular Medicines Section */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>Popular Medicines</Text>
            </View>

            <ScrollView
              horizontal={true}
              showsHorizontalScrollIndicator={false}
              style={styles.popularScroll}
              contentContainerStyle={styles.popularScrollContent}
            >
              {popularMedicines.map((item) => (
                <View key={item.id} style={styles.popularCard}>
                  <View style={styles.popularCardTop}>
                    <View style={styles.popularCardPlusIcon}>
                      <Text style={styles.popularPlusText}>+</Text>
                    </View>
                  </View>

                  <Text style={styles.popularMedName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.popularBatchText}>
                    Batch: {item.batch} (Exp: {item.expiry})
                  </Text>

                  <View style={styles.popularCardBottom}>
                    <View>
                      <Text style={styles.popularPriceText}>₹{item.sellingPrice}</Text>
                      <Text style={styles.popularStockText}>Stock: {item.stock}</Text>
                    </View>
                    <Pressable
                      onPress={() => handleAddToCart(item)}
                      style={styles.popularAddBtn}
                    >
                      <Text style={styles.popularAddBtnText}>+ Add</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* 2. Search Results Section */}
            <View style={styles.searchResultsHeaderRow}>
              <Text style={styles.sectionHeading}>Search Results</Text>
              <Text style={styles.resultsCountText}>
                {filteredProducts.length} items found
              </Text>
            </View>

            <View style={styles.searchResultsList}>
              {filteredProducts.map((prod) => {
                const isBatchDropdownOpen = openBatchDropdownId === prod.id;
                const prodBatches =
                  prod.batches && prod.batches.length > 0
                    ? prod.batches
                    : [
                        { batch: prod.batch || 'B001', expiry: prod.expiry || '12/2026', stock: prod.stock || 100, price: prod.sellingPrice },
                        { batch: 'B002', expiry: '06/2027', stock: Math.round((prod.stock || 100) * 0.7), price: prod.sellingPrice },
                        { batch: 'B003', expiry: '11/2027', stock: Math.round((prod.stock || 100) * 1.1), price: prod.sellingPrice },
                      ];

                return (
                  <View
                    key={prod.id}
                    style={[
                      styles.searchResultRowContainer,
                      isBatchDropdownOpen && styles.searchResultRowContainerActive,
                    ]}
                  >
                    <View style={styles.searchResultRow}>
                      {/* Left info */}
                      <View style={styles.resultLeftInfo}>
                        <View style={styles.resultTitleRow}>
                          <Text style={styles.resultMedName}>{prod.name}</Text>
                          {prod.sku ? (
                            <View style={styles.skuBadge}>
                              <Text style={styles.skuBadgeText}>{prod.sku}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.resultMetaText}>
                          Batch: <Text style={styles.metaBold}>{prod.batch}</Text> • Exp:{' '}
                          {prod.expiry} • Stock: {prod.stock} • GST: {prod.gstRate}% (excluded)
                        </Text>
                      </View>

                      {/* Right Price & Actions */}
                      <View style={styles.resultRightActions}>
                        <Text style={styles.resultPriceText}>₹{prod.sellingPrice}</Text>

                        {/* Interactive 3 Batches Dropdown Button */}
                        <Pressable
                          onPress={() => setOpenBatchDropdownId(isBatchDropdownOpen ? null : prod.id)}
                          style={[
                            styles.batchesDropdownBtn,
                            isBatchDropdownOpen && styles.batchesDropdownBtnActive,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Select from ${prodBatches.length} Batches`}
                        >
                          <Text
                            style={[
                              styles.batchesDropdownText,
                              isBatchDropdownOpen && styles.batchesDropdownTextActive,
                            ]}
                          >
                            {prodBatches.length} Batches {isBatchDropdownOpen ? '▴' : '▾'}
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() => handleAddToCart(prod)}
                          style={styles.resultAddBtn}
                        >
                          <Text style={styles.resultAddBtnText}>+ Add</Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* Interactive Batches Selection Popover / Expansion Panel */}
                    {isBatchDropdownOpen && (
                      <View style={styles.batchPickerPanel}>
                        <View style={styles.batchPickerHeader}>
                          <View style={styles.batchPickerTitleGroup}>
                            <Text style={styles.batchPickerIcon}>📦</Text>
                            <Text style={styles.batchPickerTitle}>
                              Select Batch for {prod.name} ({prodBatches.length} Available Batches)
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => setOpenBatchDropdownId(null)}
                            style={styles.closeBatchPanelBtn}
                          >
                            <Text style={styles.closeBatchPanelBtnText}>✕ Close</Text>
                          </Pressable>
                        </View>

                        <View style={styles.batchCardsGrid}>
                          {prodBatches.map((b, bIdx) => (
                            <View key={`${b.batch}-${bIdx}`} style={styles.batchCardItem}>
                              <View style={styles.batchCardTop}>
                                <View style={styles.batchBadgeTag}>
                                  <Text style={styles.batchBadgeTagText}>{b.batch}</Text>
                                </View>
                                <Text style={styles.batchExpText}>Exp: {b.expiry}</Text>
                              </View>

                              <View style={styles.batchCardMid}>
                                <Text style={styles.batchStockPill}>
                                  Stock: <Text style={styles.batchStockBold}>{b.stock} pcs</Text>
                                </Text>
                                <Text style={styles.batchPriceBold}>
                                  ₹{(b.price || prod.sellingPrice).toFixed(2)}
                                </Text>
                              </View>

                              <Pressable
                                onPress={() => {
                                  handleAddToCart(prod, b);
                                  setOpenBatchDropdownId(null);
                                }}
                                style={styles.batchSelectAddBtn}
                              >
                                <Text style={styles.batchSelectAddBtnText}>+ Add Batch {b.batch}</Text>
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* ========================================================================= */}
        {/* RIGHT PANE: Current Bill / Draft Invoice (Cart & Checkout)               */}
        {/* ========================================================================= */}
        <View style={styles.rightBillPane}>
          {/* Bill Header */}
          <View style={styles.billHeaderBar}>
            <View>
              <Text style={styles.billHeaderTitle}>Current Bill</Text>
              <Text style={styles.billHeaderSubtitle}>Draft Invoice</Text>
            </View>
            {cart.length > 0 && (
              <Pressable onPress={handleClearCart}>
                <Text style={styles.billClearText}>Clear</Text>
              </Pressable>
            )}
          </View>

          {/* Customer Dropdown */}
          <View style={styles.customerFieldBox}>
            <Text style={styles.fieldLabelText}>CUSTOMER</Text>
            <Pressable
              onPress={() => setCustomerModalVisible(true)}
              style={styles.customerPickerBtn}
            >
              <Text style={styles.customerPickerName}>
                {customCustomerInput.trim() || selectedCustomer.name}
              </Text>
              <Text style={styles.customerPickerArrow}>▾</Text>
            </Pressable>
          </View>

          {/* Items Section */}
          <View style={styles.itemsSectionBox}>
            <Text style={styles.itemsCountHeading}>ITEMS ({cart.length})</Text>

            {cart.length === 0 ? (
              <View style={styles.emptyItemsBox}>
                <Text style={styles.emptyCartIcon}>🛒</Text>
                <Text style={styles.emptyCartHeading}>No medicines added yet</Text>
                <Text style={styles.emptyCartSubtitle}>
                  Search above or scan a barcode/QR code to add items
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.cartItemsScrollView} showsVerticalScrollIndicator={true}>
                {cart.map((item, idx) => (
                  <View key={`${item.id}-${idx}`} style={styles.cartItemRow}>
                    <View style={styles.cartItemDetails}>
                      <Text style={styles.cartItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.cartItemBatchPrice}>
                        Batch: {item.batch} • ₹{item.sellingPrice} × {item.qty}
                      </Text>
                    </View>

                    {/* Stepper Controls */}
                    <View style={styles.stepperContainer}>
                      <Pressable
                        onPress={() => handleUpdateQty(idx, -1)}
                        style={styles.stepperBtn}
                      >
                        <Text style={styles.stepperBtnText}>−</Text>
                      </Pressable>
                      <Text style={styles.stepperValText}>{item.qty}</Text>
                      <Pressable
                        onPress={() => handleUpdateQty(idx, 1)}
                        style={styles.stepperBtn}
                      >
                        <Text style={styles.stepperBtnText}>+</Text>
                      </Pressable>
                    </View>

                    {/* Line Total */}
                    <Text style={styles.cartItemLineTotal}>
                      ₹{(item.sellingPrice * item.qty).toFixed(2)}
                    </Text>

                    {/* Remove ✕ */}
                    <Pressable
                      onPress={() => handleRemoveItem(idx)}
                      style={styles.cartItemRemoveBtn}
                    >
                      <Text style={styles.cartItemRemoveText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Bill Calculation Totals */}
          <View style={styles.calculationsContainer}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryVal}>₹{totals.subtotal.toFixed(2)}</Text>
            </View>

            <View style={styles.discountRow}>
              <Text style={styles.summaryLabel}>Additional Discount</Text>
              <View style={styles.discountInputWrapper}>
                <TextInput
                  style={styles.discountInputBox}
                  value={billDiscountInput}
                  onChangeText={setBillDiscountInput}
                  keyboardType="numeric"
                />
                <Pressable onPress={handleApplyDiscount} style={styles.discountApplyBtn}>
                  <Text style={styles.discountApplyBtnText}>Apply</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Included Tax (GST)</Text>
              <Text style={styles.summaryVal}>₹{totals.includedTax.toFixed(2)}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Excluded Tax</Text>
              <Text style={styles.summaryVal}>₹{totals.excludedTax.toFixed(2)}</Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalGreenAmount}>₹{totals.grandTotal.toFixed(2)}</Text>
            </View>
          </View>

          {/* Payment Method Tabs */}
          <View style={styles.paymentMethodSection}>
            <Text style={styles.fieldLabelText}>PAYMENT METHOD</Text>
            <View style={styles.paymentTabsRow}>
              {['Cash', 'Card', 'UPI', 'Split'].map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => setPaymentMode(mode)}
                  style={[
                    styles.paymentTabBtn,
                    paymentMode === mode && styles.paymentTabBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.paymentTabText,
                      paymentMode === mode && styles.paymentTabTextActive,
                    ]}
                  >
                    {mode}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Action Buttons: Hold Bill & Pay Now */}
          <View style={styles.billActionsRow}>
            <Pressable
              onPress={handleHoldBillAction}
              style={styles.holdBillBtn}
              accessibilityRole="button"
              accessibilityLabel="Hold Bill (Save as Draft)"
            >
              <Text style={styles.holdBillBtnText}>Hold Bill</Text>
            </Pressable>

            <Pressable
              onPress={handleOpenCheckout}
              style={styles.payNowBtn}
              accessibilityRole="button"
              accessibilityLabel="Pay Now"
            >
              <Text style={styles.payNowBtnText}>Pay Now</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* CHECKOUT MODAL                                                            */}
      {/* ========================================================================= */}
      <Modal
        visible={checkoutModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCheckoutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.checkoutModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Complete POS Sale</Text>
                <Text style={styles.modalSubtitle}>
                  Payment Mode: {paymentMode} • Total: ₹{totals.grandTotal.toFixed(2)}
                </Text>
              </View>
              <Pressable onPress={() => setCheckoutModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {paymentMode === 'Cash' && (
              <View style={styles.tenderSection}>
                <Text style={styles.fieldLabelText}>CASH TENDERED (₹)</Text>
                <TextInput
                  style={styles.tenderInput}
                  value={cashTendered}
                  onChangeText={setCashTendered}
                  keyboardType="numeric"
                  autoFocus={true}
                />
                <View style={styles.changeDueRow}>
                  <Text style={styles.changeDueLabel}>Change Due to Return:</Text>
                  <Text style={styles.changeDueAmount}>
                    ₹{Math.max(0, (parseFloat(cashTendered) || 0) - totals.grandTotal).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            {paymentMode === 'UPI' && (
              <View style={styles.upiQrBox}>
                <Text style={styles.upiQrIcon}>📱</Text>
                <Text style={styles.upiQrText}>Customer scan store UPI QR code</Text>
                <Text style={styles.upiQrAmount}>₹{totals.grandTotal.toFixed(2)}</Text>
              </View>
            )}

            <View style={styles.modalFooterRow}>
              <Pressable
                onPress={() => setCheckoutModalVisible(false)}
                style={styles.cancelModalBtn}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleFinalizeSale}
                style={styles.confirmSaleBtn}
              >
                <Text style={styles.confirmSaleBtnText}>Confirm Payment & Print</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* THERMAL PRINTABLE RECEIPT MODAL                                          */}
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
                <Text style={styles.receiptStoreName}>FALAH PHARMACY POS</Text>
                <Text style={styles.receiptStoreSub}>Main Branch • GSTIN: 27AABCP1234F1Z9</Text>
                <Text style={styles.receiptDashedLine}>--------------------------------------</Text>
              </View>

              <View style={styles.receiptMetaRow}>
                <Text style={styles.receiptMetaText}>Invoice: {completedInvoice.invoiceNo}</Text>
                <Text style={styles.receiptMetaText}>{completedInvoice.date}</Text>
              </View>
              <Text style={styles.receiptMetaText}>Customer: {completedInvoice.customer}</Text>
              <Text style={styles.receiptMetaText}>Payment: {completedInvoice.paymentMode}</Text>

              <Text style={styles.receiptDashedLine}>--------------------------------------</Text>

              <View style={styles.receiptItemsList}>
                {(completedInvoice.items || []).map((it, i) => (
                  <View key={i} style={styles.receiptItemRow}>
                    <Text style={styles.receiptItemName}>
                      {it.name} x{it.qty}
                    </Text>
                    <Text style={styles.receiptItemTotal}>
                      ₹{((it.sellingPrice || it.price || 0) * it.qty).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>

              <Text style={styles.receiptDashedLine}>--------------------------------------</Text>

              <View style={styles.receiptTotalRow}>
                <Text style={styles.receiptTotalLabel}>Grand Total (Incl. GST):</Text>
                <Text style={styles.receiptTotalGreen}>₹{completedInvoice.total.toFixed(2)}</Text>
              </View>

              <Text style={styles.receiptThanksText}>Thank you! Get well soon.</Text>

              <View style={styles.receiptActionsRow}>
                <Pressable
                  onPress={() => {
                    setReceiptModalVisible(false);
                    if (onShowToast) onShowToast('🖨️ Receipt sent to thermal printer.');
                  }}
                  style={styles.printBtn}
                >
                  <Text style={styles.printBtnText}>🖨️ Print Receipt</Text>
                </Pressable>
                <Pressable
                  onPress={() => setReceiptModalVisible(false)}
                  style={styles.doneReceiptBtn}
                >
                  <Text style={styles.doneReceiptBtnText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* CUSTOMER SELECTION MODAL                                                  */}
      {/* ========================================================================= */}
      <Modal
        visible={customerModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCustomerModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.customerModalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Customer</Text>
              <Pressable onPress={() => setCustomerModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.customerSearchInput}
              placeholder="Search by name or phone..."
              placeholderTextColor="#94A3B8"
              value={customerSearchQuery}
              onChangeText={setCustomerSearchQuery}
              autoFocus={true}
            />

            {/* Walk-in Customer Option */}
            <Pressable
              onPress={() => {
                setSelectedCustomer({
                  id: 'WALK-IN',
                  name: 'Walk-in Customer',
                  phone: '',
                  currentBalance: '₹0.00',
                });
                setCustomCustomerInput('Walk-in Customer');
                setCustomerModalVisible(false);
              }}
              style={styles.walkInRow}
            >
              <Text style={styles.walkInText}>👤 Walk-in Customer (Default)</Text>
            </Pressable>

            <ScrollView style={{ maxHeight: 260 }}>
              {customers
                .filter(
                  (c) =>
                    c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                    c.phone.includes(customerSearchQuery)
                )
                .map((cust) => (
                  <Pressable
                    key={cust.id}
                    onPress={() => {
                      setSelectedCustomer(cust);
                      setCustomCustomerInput(cust.phone ? `${cust.name} (${cust.phone})` : cust.name);
                      setCustomerModalVisible(false);
                    }}
                    style={styles.customerOptionRow}
                  >
                    <View>
                      <Text style={styles.custOptionName}>{cust.name}</Text>
                      <Text style={styles.custOptionPhone}>{cust.phone || 'No phone'}</Text>
                    </View>
                    <Text style={styles.custOptionBalance}>{cust.currentBalance}</Text>
                  </Pressable>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* INTERACTIVE QR / BARCODE SCANNER MODAL                                    */}
      {/* ========================================================================= */}
      <BarcodeScannerModal
        visible={scannerModalVisible}
        onClose={() => setScannerModalVisible(false)}
        onScan={handleBarcodeScanned}
        title="Scan Medicine Barcode"
        mode="product"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    height: '100%',
  },

  // Top Draft Notification Banner (Image 4 top dark green banner)
  topDraftBanner: {
    backgroundColor: '#115E59',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topDraftBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // DRAFT RESUMED Alert Bar (Image 4 amber alert bar)
  draftResumedAlertBar: {
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  draftResumedLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  draftResumedBadge: {
    backgroundColor: '#D97706',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  draftResumedBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  draftResumedDescText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
  },
  closeDraftBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    cursor: 'pointer',
  },
  closeDraftBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },

  // Main Layout Grid
  mainLayoutGrid: {
    flex: 1,
    flexDirection: 'row',
  },
  mainLayoutGridCompact: {
    flexDirection: 'column',
  },

  // Left Catalog Pane
  leftCatalogPane: {
    flex: 1.45,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    padding: 20,
  },
  posHeaderBox: {
    marginBottom: 16,
  },
  posHeaderTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  posHeaderSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },

  // Search Bar
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 16,
  },
  searchMagnifier: {
    fontSize: 14,
    marginRight: 8,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  clearSearchBtn: {
    padding: 4,
    marginRight: 6,
  },
  clearSearchBtnText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  scanBtnInSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    cursor: 'pointer',
  },
  scanBtnIcon: {
    fontSize: 13,
  },
  scanBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },

  catalogScroll: {
    flex: 1,
  },

  // Section Headers
  sectionHeaderRow: {
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },

  // Popular Medicines Row (Image 1 cards)
  popularScroll: {
    marginBottom: 20,
  },
  popularScrollContent: {
    flexDirection: 'row',
    gap: 12,
  },
  popularCard: {
    width: 175,
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    padding: 12,
    justifyContent: 'space-between',
  },
  popularCardTop: {
    alignItems: 'center',
    marginBottom: 8,
  },
  popularCardPlusIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popularPlusText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#166534',
  },
  popularMedName: {
    fontSize: 13,
    fontWeight: '750',
    color: '#0F172A',
  },
  popularBatchText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 10,
  },
  popularCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  popularPriceText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  popularStockText: {
    fontSize: 10,
    color: '#64748B',
  },
  popularAddBtn: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    cursor: 'pointer',
  },
  popularAddBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11.5,
  },

  // Search Results List (Image 1 table rows)
  searchResultsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultsCountText: {
    fontSize: 12,
    color: '#64748B',
  },
  searchResultsList: {
    gap: 10,
  },
  searchResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  resultLeftInfo: {
    flex: 1,
  },
  resultTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultMedName: {
    fontSize: 14,
    fontWeight: '750',
    color: '#0F172A',
  },
  skuBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  skuBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  resultMetaText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 3,
  },
  metaBold: {
    fontWeight: '700',
    color: '#334155',
  },
  resultRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultPriceText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    minWidth: 45,
    textAlign: 'right',
  },
  searchResultRowContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
    overflow: 'hidden',
  },
  searchResultRowContainerActive: {
    borderColor: '#0F766E',
    borderWidth: 1.5,
    backgroundColor: '#FAFDFB',
  },
  batchesDropdownBtn: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
    flexDirection: 'row',
    alignItems: 'center',
  },
  batchesDropdownBtnActive: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  batchesDropdownText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
  },
  batchesDropdownTextActive: {
    color: '#0F766E',
    fontWeight: '750',
  },
  resultAddBtn: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    cursor: 'pointer',
  },
  resultAddBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },

  // Batch Picker Panel (Opened from 3 Batches dropdown)
  batchPickerPanel: {
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    padding: 12,
  },
  batchPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  batchPickerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  batchPickerIcon: {
    fontSize: 14,
  },
  batchPickerTitle: {
    fontSize: 12.5,
    fontWeight: '750',
    color: '#0F172A',
  },
  closeBatchPanelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    cursor: 'pointer',
  },
  closeBatchPanelBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  batchCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  batchCardItem: {
    flex: 1,
    minWidth: 170,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    padding: 10,
  },
  batchCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  batchBadgeTag: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  batchBadgeTagText: {
    color: '#1D4ED8',
    fontWeight: '800',
    fontSize: 11,
  },
  batchExpText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  batchCardMid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  batchStockPill: {
    fontSize: 11,
    color: '#64748B',
  },
  batchStockBold: {
    fontWeight: '700',
    color: '#047857',
  },
  batchPriceBold: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  batchSelectAddBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 6,
    borderRadius: 4,
    alignItems: 'center',
    cursor: 'pointer',
  },
  batchSelectAddBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '750',
  },

  // RIGHT BILL PANE (Current Bill - Draft Invoice)
  rightBillPane: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 20,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  billHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  billHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  billHeaderSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  billClearText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '700',
    cursor: 'pointer',
  },

  // Customer Picker
  customerFieldBox: {
    marginBottom: 14,
  },
  fieldLabelText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  customerPickerBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  customerPickerName: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  customerPickerArrow: {
    fontSize: 11,
    color: '#64748B',
  },

  // Items Section
  itemsSectionBox: {
    flex: 1,
    minHeight: 180,
    marginBottom: 14,
  },
  itemsCountHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  emptyItemsBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyCartIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyCartHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  emptyCartSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  cartItemsScrollView: {
    flex: 1,
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  cartItemDetails: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  cartItemBatchPrice: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    overflow: 'hidden',
  },
  stepperBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  stepperValText: {
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 8,
    color: '#0F172A',
  },
  cartItemLineTotal: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    minWidth: 55,
    textAlign: 'right',
  },
  cartItemRemoveBtn: {
    padding: 4,
    cursor: 'pointer',
  },
  cartItemRemoveText: {
    fontSize: 12,
    color: '#94A3B8',
  },

  // Calculations
  calculationsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    marginBottom: 14,
    gap: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  summaryVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  discountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  discountInputBox: {
    width: 44,
    height: 26,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    textAlign: 'center',
    fontSize: 12,
    padding: 2,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  discountApplyBtn: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  discountApplyBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  totalGreenAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F766E',
  },

  // Payment Method Tabs
  paymentMethodSection: {
    marginBottom: 14,
  },
  paymentTabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    cursor: 'pointer',
  },
  paymentTabBtnActive: {
    backgroundColor: '#0F766E',
  },
  paymentTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  paymentTabTextActive: {
    color: '#FFFFFF',
  },

  // Bill Bottom Action Buttons
  billActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  holdBillBtn: {
    flex: 1,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    cursor: 'pointer',
  },
  holdBillBtnText: {
    color: '#B45309',
    fontWeight: '800',
    fontSize: 13,
  },
  payNowBtn: {
    flex: 1.6,
    backgroundColor: '#0F766E',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    cursor: 'pointer',
  },
  payNowBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  checkoutModalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtnText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '750',
  },
  tenderSection: {
    marginBottom: 16,
  },
  tenderInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  changeDueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
  },
  changeDueLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  changeDueAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F766E',
  },
  upiQrBox: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F0FDFA',
    borderRadius: 10,
    marginBottom: 16,
  },
  upiQrIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  upiQrText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F766E',
  },
  upiQrAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F766E',
    marginTop: 4,
  },
  modalFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelModalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  cancelModalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  confirmSaleBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0F766E',
  },
  confirmSaleBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Thermal Receipt
  receiptCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: 10,
  },
  receiptStoreName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  receiptStoreSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  receiptDashedLine: {
    color: '#CBD5E1',
    letterSpacing: 2,
    marginVertical: 6,
    textAlign: 'center',
  },
  receiptMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptMetaText: {
    fontSize: 11.5,
    color: '#475569',
  },
  receiptItemsList: {
    marginVertical: 6,
    gap: 4,
  },
  receiptItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptItemName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  receiptItemTotal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  receiptTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  receiptTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  receiptTotalGreen: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F766E',
  },
  receiptThanksText: {
    textAlign: 'center',
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0F766E',
    marginVertical: 10,
  },
  receiptActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  printBtn: {
    flex: 1,
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  printBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12.5,
  },
  doneReceiptBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  doneReceiptBtnText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 12.5,
  },

  // Customer Modal
  customerModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
  },
  customerSearchInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 13,
    marginBottom: 12,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  walkInRow: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    cursor: 'pointer',
  },
  walkInText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
  customerOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    cursor: 'pointer',
  },
  custOptionName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  custOptionPhone: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  custOptionBalance: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
});

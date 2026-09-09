import React, { useState } from 'react';
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
import BarcodeScannerModal from '../../components/common/BarcodeScannerModal';

export default function SalesReturnsScreen({ onNavigate, onShowToast, isMultiBranch = true }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1100;

  const { invoices, returnHistory, processReturnRefund } = usePos();

  // Active Tab: 'find-invoice' | 'return-history'
  const [activeTab, setActiveTab] = useState('find-invoice');

  // Search & Filter
  const [searchInvoice, setSearchInvoice] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState('All Dates');
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);

  // Dynamic counts for dropdown list
  const dateCounts = {
    all: invoices.length,
    today: invoices.filter((inv) => inv.date && inv.date.includes('29 Aug 2026')).length,
    yesterday: invoices.filter((inv) => inv.date && inv.date.includes('28 Aug 2026')).length,
    last7: invoices.filter(
      (inv) =>
        inv.date &&
        (inv.date.includes('29 Aug 2026') ||
          inv.date.includes('28 Aug 2026') ||
          inv.date.includes('27 Aug 2026'))
    ).length,
    month: invoices.filter((inv) => inv.date && inv.date.includes('Aug 2026')).length,
  };

  const DATE_OPTIONS = [
    { label: 'All Dates', value: 'All Dates', count: dateCounts.all },
    { label: 'Today (29 Aug 2026)', value: 'Today (29 Aug 2026)', count: dateCounts.today },
    { label: 'Yesterday (28 Aug 2026)', value: 'Yesterday (28 Aug 2026)', count: dateCounts.yesterday },
    { label: 'Last 7 Days', value: 'Last 7 Days', count: dateCounts.last7 },
    { label: 'This Month (Aug 2026)', value: 'This Month (Aug 2026)', count: dateCounts.month },
  ];

  // Selected Invoice for inspection in Right Panel (Default to INV-1025 matching Screenshot 3)
  const [selectedInvoice, setSelectedInvoice] = useState(
    invoices.find((inv) => inv.invoiceNo === 'INV-1025') || invoices[0] || null
  );

  // Return Process Modal State
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [returnQtys, setReturnQtys] = useState({});
  const [returnReason, setReturnReason] = useState('Doctor altered prescription');
  const [stockDisposition, setStockDisposition] = useState('Sellable'); // 'Sellable' | 'Quarantine'
  const [refundMode, setRefundMode] = useState('Cash'); // 'Cash' | 'Original Payment' | 'Credit Note'

  // Credit Note Modal State
  const [creditNoteModalVisible, setCreditNoteModalVisible] = useState(false);
  const [completedCreditNote, setCompletedCreditNote] = useState(null);

  // QR / Barcode Scanner Modal State
  const [scannerModalVisible, setScannerModalVisible] = useState(false);

  // Filter invoices list
  const filteredInvoices = invoices.filter((inv) => {
    const q = searchInvoice.toLowerCase().trim();
    const matchSearch =
      !q ||
      inv.invoiceNo.toLowerCase().includes(q) ||
      inv.customer.toLowerCase().includes(q) ||
      (inv.phone && inv.phone.includes(q));

    let matchDate = true;
    if (selectedDateFilter === 'Today (29 Aug 2026)') {
      matchDate = inv.date && inv.date.includes('29 Aug 2026');
    } else if (selectedDateFilter === 'Yesterday (28 Aug 2026)') {
      matchDate = inv.date && inv.date.includes('28 Aug 2026');
    } else if (selectedDateFilter === 'Last 7 Days') {
      matchDate =
        inv.date &&
        (inv.date.includes('29 Aug 2026') ||
          inv.date.includes('28 Aug 2026') ||
          inv.date.includes('27 Aug 2026'));
    } else if (selectedDateFilter === 'This Month (Aug 2026)') {
      matchDate = inv.date && inv.date.includes('Aug 2026');
    }

    return matchSearch && matchDate;
  });

  // Calculate return refund total
  const calculateRefundTotal = () => {
    if (!selectedInvoice || !selectedInvoice.items) return 0;
    let total = 0;
    selectedInvoice.items.forEach((it, idx) => {
      const q = returnQtys[idx] || 0;
      const unitPrice = it.price || it.sellingPrice || 0;
      total += unitPrice * q;
    });
    return total;
  };

  const currentRefundTotal = calculateRefundTotal();

  // Start Return action
  const handleStartReturnClick = () => {
    if (!selectedInvoice) return;
    // Initialize return quantities to 1 for first item, 0 for others
    const initialQtys = {};
    (selectedInvoice.items || []).forEach((it, idx) => {
      initialQtys[idx] = idx === 0 ? 1 : 0;
    });
    setReturnQtys(initialQtys);
    setRefundMode(selectedInvoice.paymentMode === 'Cash' ? 'Cash' : 'Original Payment');
    setReturnModalVisible(true);
  };

  // Submit and Finalize Return
  const handleConfirmReturn = () => {
    if (currentRefundTotal <= 0) {
      if (onShowToast) onShowToast('⚠️ Please specify return quantity for at least one item.');
      return;
    }

    const returnedItemsList = (selectedInvoice.items || [])
      .map((it, idx) => ({
        name: it.name,
        qty: returnQtys[idx] || 0,
        unitPrice: it.price || it.sellingPrice || 0,
        refundTotal: (it.price || it.sellingPrice || 0) * (returnQtys[idx] || 0),
        batch: it.batch,
      }))
      .filter((it) => it.qty > 0);

    const returnData = {
      originalInvoice: selectedInvoice.invoiceNo,
      customer: selectedInvoice.customer,
      refundAmount: currentRefundTotal,
      refundMode,
      stockDisposition,
      reason: returnReason,
      returnedItems: returnedItemsList,
    };

    const creditNote = processReturnRefund(returnData);
    setCompletedCreditNote(creditNote);
    setReturnModalVisible(false);
    setCreditNoteModalVisible(true);

    if (onShowToast) {
      onShowToast(`✓ Processed Return & Credit Note #${creditNote.returnNo}! Amount ₹${creditNote.amount.toFixed(2)}`);
    }
  };

  // Barcode scanned handler (Invoice or Product Barcode)
  const handleBarcodeScanned = (scannedCode) => {
    const code = scannedCode.trim().toLowerCase();

    // 1. Check if invoice number matches directly
    const foundInvoice = invoices.find(
      (inv) =>
        inv.invoiceNo.toLowerCase() === code ||
        inv.invoiceNo.toLowerCase().includes(code) ||
        (inv.phone && inv.phone.includes(code))
    );

    if (foundInvoice) {
      setSelectedInvoice(foundInvoice);
      setSearchInvoice(foundInvoice.invoiceNo);
      setScannerModalVisible(false);
      if (onShowToast) {
        onShowToast(`📷 Scanned: Found invoice ${foundInvoice.invoiceNo} for ${foundInvoice.customer}`);
      }
      return;
    }

    // 2. Check if product barcode matches any item in recent invoices
    const invoiceWithProduct = invoices.find((inv) =>
      (inv.items || []).some(
        (it) =>
          (it.barcode && it.barcode.toLowerCase() === code) ||
          it.name.toLowerCase().includes(code)
      )
    );

    if (invoiceWithProduct) {
      setSelectedInvoice(invoiceWithProduct);
      setSearchInvoice(invoiceWithProduct.invoiceNo);
      setScannerModalVisible(false);
      if (onShowToast) {
        onShowToast(`📷 Scanned Product: Located invoice ${invoiceWithProduct.invoiceNo}`);
      }
      return;
    }

    if (onShowToast) {
      onShowToast(`⚠️ No invoice found matching code "${scannedCode}".`);
    }
  };

  return (
    <View style={styles.screenContainer}>
      {/* Header (Matches Image 3) */}
      <View style={styles.topHeaderBar}>
        <Text style={styles.pageTitle}>Returns</Text>
        <Text style={styles.pageSubtitle}>Process return or refund for a completed sale.</Text>
      </View>

      {/* Tabs Navigation (Find Invoice vs Return History) */}
      <View style={styles.tabsRow}>
        <Pressable
          onPress={() => setActiveTab('find-invoice')}
          style={[styles.tabBtn, activeTab === 'find-invoice' && styles.tabBtnActive]}
        >
          <Text
            style={[styles.tabBtnText, activeTab === 'find-invoice' && styles.tabBtnTextActive]}
          >
            Find Invoice
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('return-history')}
          style={[styles.tabBtn, activeTab === 'return-history' && styles.tabBtnActive]}
        >
          <Text
            style={[styles.tabBtnText, activeTab === 'return-history' && styles.tabBtnTextActive]}
          >
            Return History ({returnHistory.length})
          </Text>
        </Pressable>
      </View>

      {activeTab === 'find-invoice' ? (
        <View style={styles.contentWrapper}>
          {/* Search Bar & Action Controls Row (Matches Image 3) */}
          <View style={styles.searchAndActionsRow}>
            {/* Search Input */}
            <View style={styles.searchBarBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                value={searchInvoice}
                onChangeText={setSearchInvoice}
                placeholder="Search by invoice no. or customer"
                placeholderTextColor="#94A3B8"
              />
              {searchInvoice ? (
                <Pressable onPress={() => setSearchInvoice('')}>
                  <Text style={styles.clearSearchIcon}>✕</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Date Filter Dropdown */}
            <View style={styles.dateFilterWrapper}>
              <Pressable
                onPress={() => setDateDropdownOpen(!dateDropdownOpen)}
                style={[
                  styles.dateFilterBtn,
                  (dateDropdownOpen || selectedDateFilter !== 'All Dates') &&
                    styles.dateFilterBtnActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Filter invoices by date range"
              >
                <Text style={styles.dateFilterIcon}>📅</Text>
                <Text
                  style={[
                    styles.dateFilterText,
                    selectedDateFilter !== 'All Dates' && styles.dateFilterTextActive,
                  ]}
                >
                  {selectedDateFilter}
                </Text>
                <Text style={styles.dateFilterArrow}>{dateDropdownOpen ? '▴' : '▾'}</Text>
              </Pressable>

              {dateDropdownOpen && (
                <View style={styles.dropdownMenuPopover}>
                  <Text style={styles.dropdownSectionLabel}>SELECT DATE RANGE</Text>
                  {DATE_OPTIONS.map((opt) => {
                    const isSelected = selectedDateFilter === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => {
                          setSelectedDateFilter(opt.value);
                          setDateDropdownOpen(false);
                          if (onShowToast) {
                            onShowToast(`Filtered by Date: ${opt.label}`);
                          }
                        }}
                        style={[
                          styles.dropdownMenuItem,
                          isSelected && styles.dropdownMenuItemActive,
                        ]}
                      >
                        <View style={styles.dropdownMenuItemLeft}>
                          <Text
                            style={[
                              styles.dropdownItemCheck,
                              isSelected && styles.dropdownItemCheckActive,
                            ]}
                          >
                            {isSelected ? '✓' : ' '}
                          </Text>
                          <Text
                            style={[
                              styles.dropdownItemLabel,
                              isSelected && styles.dropdownItemLabelActive,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.dropdownCountBadge,
                            isSelected && styles.dropdownCountBadgeActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dropdownCountText,
                              isSelected && styles.dropdownCountTextActive,
                            ]}
                          >
                            {opt.count}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {selectedDateFilter !== 'All Dates' && (
              <Pressable
                onPress={() => {
                  setSelectedDateFilter('All Dates');
                  if (onShowToast) onShowToast('Reset date filter');
                }}
                style={styles.resetDateFilterBtn}
              >
                <Text style={styles.resetDateFilterBtnText}>✕ Reset</Text>
              </Pressable>
            )}

            {/* Prominent Working Scan Barcode Button */}
            <Pressable
              onPress={() => setScannerModalVisible(true)}
              style={styles.scanBarcodeBtn}
              accessibilityRole="button"
              accessibilityLabel="Scan Barcode for Return"
            >
              <Text style={styles.scanBarcodeBtnIcon}>📷</Text>
              <Text style={styles.scanBarcodeBtnText}>Scan Barcode</Text>
            </Pressable>
          </View>

          {/* Split-Screen Main Layout (Matches Image 3) */}
          <View style={[styles.splitLayout, isCompact && styles.splitLayoutCompact]}>
            {/* LEFT: Invoices Table */}
            <View style={styles.leftTableCard}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.th, { flex: 1.3 }]}>INVOICE NO.</Text>
                <Text style={[styles.th, { flex: 1.8 }]}>CUSTOMER</Text>
                <Text style={[styles.th, { flex: 1.6 }]}>DATE & TIME</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>AMOUNT</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'center' }]}>STATUS</Text>
              </View>

              <ScrollView style={styles.tableBodyScroll} showsVerticalScrollIndicator={true}>
                {filteredInvoices.length === 0 ? (
                  <View style={styles.emptyTableBox}>
                    <Text style={styles.emptyTableText}>No invoices found matching query.</Text>
                  </View>
                ) : (
                  filteredInvoices.map((inv) => {
                    const isSelected = selectedInvoice?.invoiceNo === inv.invoiceNo;
                    return (
                      <Pressable
                        key={inv.invoiceNo}
                        onPress={() => setSelectedInvoice(inv)}
                        style={[
                          styles.tableRow,
                          isSelected && styles.tableRowSelected,
                        ]}
                      >
                        <Text style={[styles.tdInvoiceNo, { flex: 1.3 }]}>
                          {inv.invoiceNo}
                        </Text>

                        <View style={{ flex: 1.8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={styles.custIconSmall}>👤</Text>
                          <Text style={styles.tdCustomer} numberOfLines={1}>
                            {inv.customer}
                          </Text>
                        </View>

                        <Text style={[styles.tdDateTime, { flex: 1.6 }]}>
                          {inv.date}
                        </Text>

                        <Text style={[styles.tdAmount, { flex: 1.2, textAlign: 'right' }]}>
                          ₹{(inv.total || 0).toFixed(2)}
                        </Text>

                        <View style={{ flex: 1.2, alignItems: 'center' }}>
                          <View style={styles.statusCompletedBadge}>
                            <Text style={styles.statusCompletedText}>
                              {inv.status || 'Completed'}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>

              <View style={styles.tableFooterRow}>
                <Text style={styles.showingCountText}>
                  Showing {filteredInvoices.length} of {invoices.length} Invoices
                </Text>
              </View>
            </View>

            {/* RIGHT: Invoice Details & Return Action (Matches Image 3) */}
            <View style={styles.rightDetailsCard}>
              {selectedInvoice ? (
                <>
                  <View style={styles.invoiceDetailsHeader}>
                    <Text style={styles.invoiceDetailsTitle}>Invoice Details</Text>
                    <View style={styles.invoiceNoBadge}>
                      <Text style={styles.invoiceNoBadgeText}>{selectedInvoice.invoiceNo}</Text>
                    </View>
                  </View>

                  {/* Metadata Grid */}
                  <View style={styles.invoiceMetaGrid}>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLabel}>Customer</Text>
                      <Text style={styles.metaValue}>{selectedInvoice.customer}</Text>
                    </View>
                    <View style={[styles.metaCol, { alignItems: 'flex-end' }]}>
                      <Text style={styles.metaLabel}>Final Amount</Text>
                      <Text style={[styles.metaValue, styles.metaValueBold]}>
                        ₹{(selectedInvoice.total || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.invoiceMetaGrid}>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLabel}>Date & Time</Text>
                      <Text style={styles.metaValueSub}>{selectedInvoice.date}</Text>
                    </View>
                    <View style={[styles.metaCol, { alignItems: 'flex-end' }]}>
                      <Text style={styles.metaLabel}>Payment</Text>
                      <Text style={styles.metaValueSub}>{selectedInvoice.paymentMode || 'Cash'}</Text>
                    </View>
                  </View>

                  <View style={styles.dividerLine} />

                  {/* Purchased Items List */}
                  <Text style={styles.purchasedItemsHeading}>Purchased Items</Text>
                  <ScrollView style={styles.purchasedItemsScroll} showsVerticalScrollIndicator={true}>
                    {(selectedInvoice.items || []).map((it, idx) => (
                      <View key={idx} style={styles.purchasedItemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.purchasedItemName}>{it.name}</Text>
                          <Text style={styles.purchasedItemUnit}>
                            {it.unit || `Batch: ${it.batch || 'B001'}`}
                          </Text>
                        </View>
                        <Text style={styles.purchasedItemQty}>{it.qty}</Text>
                        <Text style={styles.purchasedItemPrice}>
                          ₹{(it.price || it.sellingPrice || 0).toFixed(2)}
                        </Text>
                        <Text style={styles.purchasedItemTotal}>
                          ₹{((it.price || it.sellingPrice || 0) * (it.qty || 1)).toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>

                  <View style={styles.dividerLine} />

                  {/* Total Summary */}
                  <View style={styles.detailsTotalRow}>
                    <Text style={styles.detailsTotalLabel}>Total</Text>
                    <Text style={styles.detailsTotalAmount}>
                      ₹{(selectedInvoice.total || 0).toFixed(2)}
                    </Text>
                  </View>

                  {/* Start Return Button */}
                  <Pressable
                    onPress={handleStartReturnClick}
                    style={styles.startReturnBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Start Return"
                  >
                    <Text style={styles.startReturnBtnIcon}>↩️</Text>
                    <Text style={styles.startReturnBtnText}>Start Return</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.noInvoiceSelectedBox}>
                  <Text style={styles.noInvoiceIcon}>📄</Text>
                  <Text style={styles.noInvoiceTitle}>No Invoice Selected</Text>
                  <Text style={styles.noInvoiceSub}>
                    Select an invoice on the left or click "Scan Barcode" to search by receipt code.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      ) : (
        /* TAB 2: Return History */
        <ScrollView style={styles.historyScroll} contentContainerStyle={styles.historyContent}>
          <Text style={styles.historyTitle}>Processed Returns & Refunds Log</Text>
          {returnHistory.length === 0 ? (
            <View style={styles.emptyHistoryCard}>
              <Text style={styles.emptyHistoryIcon}>📦</Text>
              <Text style={styles.emptyHistoryText}>No returns processed yet.</Text>
            </View>
          ) : (
            returnHistory.map((ret) => (
              <View key={ret.returnNo} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <View>
                    <Text style={styles.historyReturnNo}>{ret.returnNo}</Text>
                    <Text style={styles.historyMeta}>
                      Original Bill: {ret.originalInvoice} • {ret.date}
                    </Text>
                  </View>
                  <Text style={styles.historyRefundAmount}>₹{(ret.amount || 0).toFixed(2)}</Text>
                </View>

                <View style={styles.historyDetailsRow}>
                  <Text style={styles.historyDetailText}>
                    <Text style={styles.boldLabel}>Customer:</Text> {ret.customer}
                  </Text>
                  <Text style={styles.historyDetailText}>
                    <Text style={styles.boldLabel}>Refund Mode:</Text> {ret.refundMode}
                  </Text>
                  <Text style={styles.historyDetailText}>
                    <Text style={styles.boldLabel}>Disposition:</Text> {ret.stockDisposition}
                  </Text>
                </View>

                <Text style={styles.historyReason}>Reason: {ret.reason}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ========================================================================= */}
      {/* RETURN & REFUND PROCESSING MODAL                                          */}
      {/* ========================================================================= */}
      {selectedInvoice && (
        <Modal
          visible={returnModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setReturnModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.returnModalCard}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    Process Return for {selectedInvoice.invoiceNo}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    Customer: {selectedInvoice.customer} • Total Refund: ₹
                    {currentRefundTotal.toFixed(2)}
                  </Text>
                </View>
                <Pressable onPress={() => setReturnModalVisible(false)}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              {/* Items Return Stepper Table */}
              <Text style={styles.modalSectionLabel}>Select Items & Return Quantity:</Text>
              <ScrollView style={{ maxHeight: 180, marginBottom: 14 }}>
                {(selectedInvoice.items || []).map((it, idx) => {
                  const currentReturnQty = returnQtys[idx] || 0;
                  const price = it.price || it.sellingPrice || 0;
                  return (
                    <View key={idx} style={styles.returnItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.returnItemName}>{it.name}</Text>
                        <Text style={styles.returnItemPrice}>
                          Billed Qty: {it.qty} • Rate: ₹{price.toFixed(2)}
                        </Text>
                      </View>

                      {/* Stepper */}
                      <View style={styles.qtyStepper}>
                        <Pressable
                          onPress={() =>
                            setReturnQtys({
                              ...returnQtys,
                              [idx]: Math.max(0, currentReturnQty - 1),
                            })
                          }
                          style={styles.qtyStepBtn}
                        >
                          <Text style={styles.qtyStepBtnText}>−</Text>
                        </Pressable>
                        <Text style={styles.qtyValText}>{currentReturnQty}</Text>
                        <Pressable
                          onPress={() =>
                            setReturnQtys({
                              ...returnQtys,
                              [idx]: Math.min(it.qty, currentReturnQty + 1),
                            })
                          }
                          style={styles.qtyStepBtn}
                        >
                          <Text style={styles.qtyStepBtnText}>+</Text>
                        </Pressable>
                      </View>

                      <Text style={styles.returnItemLineTotal}>
                        ₹{(price * currentReturnQty).toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>

              {/* Reason Selector */}
              <Text style={styles.modalSectionLabel}>Return Reason:</Text>
              <View style={styles.reasonsChipRow}>
                {[
                  'Doctor altered prescription',
                  'Wrong medicine issued',
                  'Patient recovered / excess',
                  'Packaging damaged',
                ].map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setReturnReason(r)}
                    style={[styles.reasonChip, returnReason === r && styles.reasonChipActive]}
                  >
                    <Text
                      style={[
                        styles.reasonChipText,
                        returnReason === r && styles.reasonChipTextActive,
                      ]}
                    >
                      {r}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Stock Disposition */}
              <Text style={styles.modalSectionLabel}>Stock Disposition:</Text>
              <View style={styles.dispositionRow}>
                <Pressable
                  onPress={() => setStockDisposition('Sellable')}
                  style={[
                    styles.dispBtn,
                    stockDisposition === 'Sellable' && styles.dispBtnActive,
                  ]}
                >
                  <Text style={styles.dispBtnTitle}>📦 Return to Sellable Stock</Text>
                  <Text style={styles.dispBtnSub}>Medicine stock is restored</Text>
                </Pressable>

                <Pressable
                  onPress={() => setStockDisposition('Quarantine')}
                  style={[
                    styles.dispBtn,
                    stockDisposition === 'Quarantine' && styles.dispBtnActiveRed,
                  ]}
                >
                  <Text style={styles.dispBtnTitle}>⚠️ Quarantine / Damaged</Text>
                  <Text style={styles.dispBtnSub}>Stock not returned to shelf</Text>
                </Pressable>
              </View>

              {/* Refund Mode */}
              <Text style={styles.modalSectionLabel}>Refund Mode:</Text>
              <View style={styles.refundModesRow}>
                {['Cash', 'Original Payment', 'Credit Note'].map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setRefundMode(mode)}
                    style={[styles.refundModeChip, refundMode === mode && styles.refundModeChipActive]}
                  >
                    <Text
                      style={[
                        styles.refundModeChipText,
                        refundMode === mode && styles.refundModeChipTextActive,
                      ]}
                    >
                      {mode}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Modal Footer */}
              <View style={styles.modalFooterRow}>
                <Pressable
                  onPress={() => setReturnModalVisible(false)}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleConfirmReturn}
                  style={styles.confirmReturnBtn}
                >
                  <Text style={styles.confirmReturnBtnText}>
                    Process Refund (₹{currentRefundTotal.toFixed(2)})
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* CREDIT NOTE SUCCESS MODAL                                                 */}
      {/* ========================================================================= */}
      {completedCreditNote && (
        <Modal
          visible={creditNoteModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setCreditNoteModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.creditNoteCard}>
              <Text style={styles.cnHeaderTitle}>RETURN CREDIT NOTE</Text>
              <Text style={styles.cnHeaderSub}>FALAH PHARMACY POS • Main Branch</Text>
              <View style={styles.dashedLine} />

              <View style={styles.cnRow}>
                <Text style={styles.cnLabel}>Credit Note #:</Text>
                <Text style={styles.cnValBold}>{completedCreditNote.returnNo}</Text>
              </View>
              <View style={styles.cnRow}>
                <Text style={styles.cnLabel}>Original Bill:</Text>
                <Text style={styles.cnVal}>{completedCreditNote.originalInvoice}</Text>
              </View>
              <View style={styles.cnRow}>
                <Text style={styles.cnLabel}>Customer:</Text>
                <Text style={styles.cnVal}>{completedCreditNote.customer}</Text>
              </View>
              <View style={styles.cnRow}>
                <Text style={styles.cnLabel}>Refund Method:</Text>
                <Text style={styles.cnVal}>{completedCreditNote.refundMode}</Text>
              </View>
              <View style={styles.cnRow}>
                <Text style={styles.cnLabel}>Stock Disposition:</Text>
                <Text style={styles.cnVal}>{completedCreditNote.stockDisposition}</Text>
              </View>

              <View style={styles.dashedLine} />

              <View style={styles.cnTotalRow}>
                <Text style={styles.cnTotalLabel}>Total Refund Amount:</Text>
                <Text style={styles.cnTotalValue}>
                  ₹{(completedCreditNote.amount || 0).toFixed(2)}
                </Text>
              </View>

              <View style={styles.cnActionsRow}>
                <Pressable
                  onPress={() => {
                    setCreditNoteModalVisible(false);
                    if (onShowToast) onShowToast('🖨️ Sent Credit Note to thermal printer.');
                  }}
                  style={styles.printCnBtn}
                >
                  <Text style={styles.printCnText}>🖨️ Print Credit Note</Text>
                </Pressable>
                <Pressable
                  onPress={() => setCreditNoteModalVisible(false)}
                  style={styles.closeCnBtn}
                >
                  <Text style={styles.closeCnBtnText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* INTERACTIVE QR / BARCODE SCANNER MODAL                                    */}
      {/* ========================================================================= */}
      <BarcodeScannerModal
        visible={scannerModalVisible}
        onClose={() => setScannerModalVisible(false)}
        onScan={handleBarcodeScanned}
        title="Scan Invoice or Medicine Barcode"
        mode="invoice"
        sampleInvoices={invoices.map((inv) => inv.invoiceNo)}
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
  topHeaderBar: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },

  // Tabs Row
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 24,
  },
  tabBtn: {
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    cursor: 'pointer',
  },
  tabBtnActive: {
    borderBottomColor: '#0F766E',
  },
  tabBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#0F766E',
    fontWeight: '700',
  },

  contentWrapper: {
    flex: 1,
    padding: 24,
  },

  // Search and Actions Row (Matches Image 3)
  searchAndActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    position: 'relative',
    zIndex: 100,
  },
  searchBarBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  clearSearchIcon: {
    fontSize: 13,
    color: '#94A3B8',
    padding: 4,
  },
  dateFilterWrapper: {
    position: 'relative',
    zIndex: 110,
  },
  dateFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    cursor: 'pointer',
  },
  dateFilterBtnActive: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  dateFilterIcon: {
    fontSize: 12,
  },
  dateFilterText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  dateFilterTextActive: {
    color: '#0F766E',
    fontWeight: '750',
  },
  dateFilterArrow: {
    fontSize: 11,
    color: '#64748B',
  },

  // Dropdown Popover Card
  dropdownMenuPopover: {
    position: 'absolute',
    top: 45,
    left: 0,
    minWidth: 230,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    zIndex: 9999,
  },
  dropdownSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 4,
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    cursor: 'pointer',
  },
  dropdownMenuItemActive: {
    backgroundColor: '#F0FDFA',
  },
  dropdownMenuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownItemCheck: {
    fontSize: 12,
    fontWeight: '800',
    color: 'transparent',
    width: 14,
  },
  dropdownItemCheckActive: {
    color: '#0F766E',
  },
  dropdownItemLabel: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '500',
  },
  dropdownItemLabelActive: {
    color: '#0F766E',
    fontWeight: '750',
  },
  dropdownCountBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  dropdownCountBadgeActive: {
    backgroundColor: '#CCFBF1',
  },
  dropdownCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  dropdownCountTextActive: {
    color: '#0F766E',
  },
  resetDateFilterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    cursor: 'pointer',
  },
  resetDateFilterBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  scanBarcodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#0F766E',
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 8,
    cursor: 'pointer',
  },
  scanBarcodeBtnIcon: {
    fontSize: 13,
  },
  scanBarcodeBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F766E',
  },

  // Split-Screen Layout (Image 3)
  splitLayout: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
  },
  splitLayoutCompact: {
    flexDirection: 'column',
  },

  // Left Table Card
  leftTableCard: {
    flex: 1.5,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  th: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  tableBodyScroll: {
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    cursor: 'pointer',
  },
  tableRowSelected: {
    backgroundColor: '#F0FDFA',
    borderLeftWidth: 3,
    borderLeftColor: '#0F766E',
  },
  tdInvoiceNo: {
    fontSize: 12.5,
    fontWeight: '750',
    color: '#0F172A',
  },
  custIconSmall: {
    fontSize: 11,
  },
  tdCustomer: {
    fontSize: 12.5,
    color: '#334155',
  },
  tdDateTime: {
    fontSize: 11.5,
    color: '#64748B',
  },
  tdAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusCompletedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusCompletedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
  },
  tableFooterRow: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  showingCountText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  emptyTableBox: {
    padding: 30,
    alignItems: 'center',
  },
  emptyTableText: {
    fontSize: 13,
    color: '#94A3B8',
  },

  // Right Details Card (Image 3)
  rightDetailsCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  invoiceDetailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  invoiceDetailsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  invoiceNoBadge: {
    backgroundColor: '#E6F4F1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  invoiceNoBadgeText: {
    fontSize: 11.5,
    fontWeight: '750',
    color: '#0F766E',
  },
  invoiceMetaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metaCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  metaValueBold: {
    fontWeight: '800',
    fontSize: 15,
  },
  metaValueSub: {
    fontSize: 12,
    color: '#334155',
  },
  dividerLine: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  purchasedItemsHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 10,
  },
  purchasedItemsScroll: {
    flex: 1,
    minHeight: 120,
    maxHeight: 220,
  },
  purchasedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    gap: 8,
  },
  purchasedItemName: {
    fontSize: 12.5,
    fontWeight: '650',
    color: '#0F172A',
  },
  purchasedItemUnit: {
    fontSize: 10.5,
    color: '#64748B',
  },
  purchasedItemQty: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    minWidth: 20,
    textAlign: 'center',
  },
  purchasedItemPrice: {
    fontSize: 12,
    color: '#64748B',
    minWidth: 50,
    textAlign: 'right',
  },
  purchasedItemTotal: {
    fontSize: 12.5,
    fontWeight: '750',
    color: '#0F172A',
    minWidth: 55,
    textAlign: 'right',
  },
  detailsTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  detailsTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailsTotalAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  startReturnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0F766E',
    paddingVertical: 12,
    borderRadius: 8,
    cursor: 'pointer',
  },
  startReturnBtnIcon: {
    fontSize: 14,
  },
  startReturnBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  noInvoiceSelectedBox: {
    padding: 30,
    alignItems: 'center',
  },
  noInvoiceIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  noInvoiceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  noInvoiceSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },

  // Return History Tab
  historyScroll: {
    flex: 1,
    padding: 24,
  },
  historyContent: {
    gap: 12,
    maxWidth: 900,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptyHistoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyHistoryIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  emptyHistoryText: {
    fontSize: 13,
    color: '#64748B',
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyReturnNo: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F766E',
  },
  historyMeta: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  historyRefundAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#B91C1C',
  },
  historyDetailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 6,
  },
  historyDetailText: {
    fontSize: 12,
    color: '#475569',
  },
  boldLabel: {
    fontWeight: '700',
  },
  historyReason: {
    fontSize: 11.5,
    color: '#64748B',
    fontStyle: 'italic',
  },

  // Return Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  returnModalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 22,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
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
    fontSize: 16,
    color: '#64748B',
    fontWeight: '700',
  },
  modalSectionLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 6,
    marginTop: 8,
  },
  returnItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  returnItemName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  returnItemPrice: {
    fontSize: 11,
    color: '#64748B',
  },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
  },
  qtyStepBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F8FAFC',
  },
  qtyStepBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  qtyValText: {
    paddingHorizontal: 8,
    fontSize: 12,
    fontWeight: '800',
  },
  returnItemLineTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B91C1C',
    minWidth: 55,
    textAlign: 'right',
  },
  reasonsChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  reasonChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    cursor: 'pointer',
  },
  reasonChipActive: {
    backgroundColor: '#0F766E',
  },
  reasonChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  reasonChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dispositionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dispBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#F8FAFC',
    cursor: 'pointer',
  },
  dispBtnActive: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  dispBtnActiveRed: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  dispBtnTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  dispBtnSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  refundModesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  refundModeChip: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    cursor: 'pointer',
  },
  refundModeChipActive: {
    backgroundColor: '#0F766E',
  },
  refundModeChipText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
  },
  refundModeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  confirmReturnBtn: {
    backgroundColor: '#B91C1C',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 6,
  },
  confirmReturnBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },

  // Credit Note Card
  creditNoteCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 22,
  },
  cnHeaderTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  cnHeaderSub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },
  dashedLine: {
    height: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    borderStyle: 'dashed',
    marginVertical: 12,
  },
  cnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  cnLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  cnVal: {
    fontSize: 12,
    color: '#0F172A',
  },
  cnValBold: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F766E',
  },
  cnTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  cnTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  cnTotalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#B91C1C',
  },
  cnActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  printCnBtn: {
    flex: 1,
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  printCnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  closeCnBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  closeCnBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 12,
  },
});

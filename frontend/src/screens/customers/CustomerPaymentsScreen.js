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
import InventoryStatCard from '../../components/inventory/InventoryStatCard';
import {
  CUSTOMER_PAYMENTS_KPIS,
  PAYMENT_MODE_FILTER,
  MOCK_CUSTOMER_PAYMENTS_LIST,
} from '../../data/customersMockData';

const PAYMENT_MODE_BADGES = {
  'UPI / QR': { bg: '#DBEAFE', text: '#1D4ED8' },
  Cash: { bg: '#FEF3C7', text: '#B45309' },
  'Debit/Credit Card': { bg: '#F3E8FF', text: '#7E22CE' },
  'Net Banking': { bg: '#E0F2FE', text: '#0369A1' },
  Cheque: { bg: '#DCFCE7', text: '#15803D' },
};

const MODE_BADGES = PAYMENT_MODE_BADGES;

export default function CustomerPaymentsScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1100;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModeFilter, setSelectedModeFilter] = useState('All Modes');

  // Payments List State
  const [payments, setPayments] = useState(MOCK_CUSTOMER_PAYMENTS_LIST);

  // Modal 1: Record Payment Modal
  const [recordModalVisible, setRecordModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    customerName: 'Rajesh Verma',
    phone: '+91 98201 44521',
    amount: '2000',
    paymentMode: 'UPI / QR',
    transactionRef: '',
    linkedRef: 'INV-2026-8942 (Ledger Dues)',
  });
  const [formErrors, setFormErrors] = useState({});

  // Modal 2: Receipt Voucher Modal
  const [voucherModalVisible, setVoucherModalVisible] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  // Filtered Receipts
  const filteredPayments = payments.filter((pay) => {
    const query = searchQuery.toLowerCase();
    const id = pay.id || '';
    const name = pay.customerName || '';
    const phone = pay.phone || '';
    const ref = pay.transactionRef || '';
    const linked = pay.linkedRef || pay.linkedInvoices || '';

    const matchesSearch =
      id.toLowerCase().includes(query) ||
      name.toLowerCase().includes(query) ||
      phone.toLowerCase().includes(query) ||
      ref.toLowerCase().includes(query) ||
      linked.toLowerCase().includes(query);

    const matchesMode =
      selectedModeFilter === 'All Modes' || pay.paymentMode === selectedModeFilter;

    return matchesSearch && matchesMode;
  });

  const handleOpenRecordModal = () => {
    setFormData({
      customerName: 'Rajesh Verma',
      phone: '+91 98201 44521',
      amount: '2000',
      paymentMode: 'UPI / QR',
      transactionRef: `UPI/${Math.floor(100000000000 + Math.random() * 900000000000)}`,
      linkedRef: 'INV-2026-8942 (Ledger Dues)',
    });
    setFormErrors({});
    setRecordModalVisible(true);
  };

  const handleSavePayment = () => {
    const errors = {};
    if (!formData.customerName.trim()) errors.customerName = 'Customer Name is required';
    if (!formData.amount.trim() || isNaN(formData.amount) || Number(formData.amount) <= 0) {
      errors.amount = 'Valid payment amount is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const newReceipt = {
      id: `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      customerId: 'CUST-1041',
      customerName: formData.customerName,
      phone: formData.phone,
      amount: `₹${Number(formData.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      paymentMode: formData.paymentMode,
      transactionRef: formData.transactionRef || 'DIRECT-RECEIPT',
      linkedRef: formData.linkedRef,
      receivedBy: 'Pharmacist - Rahul',
      branch: 'Main Branch',
      status: 'Completed',
    };

    setPayments((prev) => [newReceipt, ...prev]);
    setRecordModalVisible(false);

    if (onShowToast) {
      onShowToast(`✓ Logged receipt ${newReceipt.id} of ${newReceipt.amount} for ${newReceipt.customerName}!`);
    }
  };

  const handleViewVoucher = (receipt) => {
    setSelectedReceipt(receipt);
    setVoucherModalVisible(true);
  };

  const handlePrintReceipt = (receipt) => {
    if (onShowToast) {
      onShowToast(`✓ Sent Receipt Voucher ${receipt.id} to Thermal Receipt Printer!`);
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
      {/* Header Row */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View style={styles.headerTitleBox}>
          <View style={styles.titleBadgeRow}>
            <Text style={styles.pageTitle}>Payment Receipts</Text>
            <View style={styles.liveTagBadge}>
              <Text style={styles.liveTagText}>CASH & COLLECTIONS</Text>
            </View>
          </View>
          <Text style={styles.pageSubtitle}>
            Record customer payment vouchers, credit settlements, digital transaction references, and payment receipts.
          </Text>
        </View>

        <Pressable
          onPress={handleOpenRecordModal}
          style={styles.recordPayBtn}
          accessibilityRole="button"
          accessibilityLabel="+ Record Payment"
        >
          <Text style={styles.recordPayIcon}>+</Text>
          <Text style={styles.recordPayText}>Record Payment</Text>
        </Pressable>
      </View>

      {/* Top 4 Responsive KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {CUSTOMER_PAYMENTS_KPIS.map((kpi) => (
          <View
            key={kpi.id}
            style={[styles.kpiCol, isMobile && styles.kpiColMobile]}
          >
            <InventoryStatCard
              label={kpi.label}
              value={kpi.value}
              subtext={kpi.subtext}
              variant={kpi.variant}
              onPress={() => onShowToast && onShowToast(`Filter: ${kpi.label}`)}
            />
          </View>
        ))}
      </View>

      {/* Receipts Table Card */}
      <View style={styles.cardContainer}>
        {/* Search & Mode Filter Bar */}
        <View style={[styles.filtersBar, isCompact && styles.filtersBarCompact]}>
          <View style={[styles.searchBox, isMobile && styles.searchBoxMobile]}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search receipt no, customer name, transaction UTR or linked invoice..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Payment Mode Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipScroll}>
            <View style={styles.filterChipRow}>
              {PAYMENT_MODE_FILTER.map((st) => (
                <Pressable
                  key={st}
                  onPress={() => setSelectedModeFilter(st)}
                  style={[
                    styles.filterChip,
                    selectedModeFilter === st && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedModeFilter === st && styles.filterChipTextActive,
                    ]}
                  >
                    {st}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Directory Subheader */}
        <View style={styles.tableSubheader}>
          <Text style={styles.sectionTitle}>Receipt Vouchers ({filteredPayments.length})</Text>
          <Text style={styles.paginationInfo}>Showing 1-{filteredPayments.length} of {payments.length} receipts</Text>
        </View>

        {isMobile ? (
          /* Mobile Payment Receipt Cards */
          <View style={styles.mobileCardList}>
            {filteredPayments.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No payment receipts found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search terms or payment mode selection.</Text>
              </View>
            ) : (
              filteredPayments.map((rcpt) => {
                const modeStyle = MODE_BADGES[rcpt.paymentMode] || MODE_BADGES.Cash;
                const displayAmount = rcpt.amount || rcpt.amountPaid || '₹0.00';
                const displayDate = rcpt.date || rcpt.paymentDate || '';
                const displayLinked = rcpt.linkedRef || rcpt.linkedInvoices || 'Direct Payment';

                return (
                  <View key={rcpt.id} style={styles.mobileReceiptCard}>
                    <View style={styles.mobileCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.mobileRcptId}>{rcpt.id}</Text>
                        <Text style={styles.mobileRcptCust}>{rcpt.customerName}</Text>
                      </View>
                      <View style={styles.statusBadgeCompleted}>
                        <Text style={styles.statusBadgeTextCompleted}>{rcpt.status || 'Completed'}</Text>
                      </View>
                    </View>

                    <View style={styles.mobileGrid}>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Amount Paid</Text>
                        <Text style={[styles.mobileValBold, { color: '#0F766E', fontSize: 14 }]}>
                          {displayAmount}
                        </Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Payment Mode</Text>
                        <View style={[styles.modeBadge, { backgroundColor: modeStyle.bg, marginTop: 3 }]}>
                          <Text style={[styles.modeBadgeText, { color: modeStyle.text }]}>
                            {rcpt.paymentMode}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Date & Time</Text>
                        <Text style={styles.mobileVal}>{displayDate}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Linked Invoice</Text>
                        <Text style={[styles.mobileValBold, { color: '#334155' }]}>{displayLinked}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Ref / UTR No</Text>
                        <Text style={styles.mobileVal}>{rcpt.transactionRef}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Cashier / Staff</Text>
                        <Text style={styles.mobileVal}>{rcpt.receivedBy}</Text>
                      </View>
                    </View>

                    <View style={[styles.mobileCardFooter, { flexDirection: 'row', gap: 8 }]}>
                      <Pressable
                        onPress={() => handleViewVoucher(rcpt)}
                        style={[styles.mobilePrintBtn, { flex: 1, backgroundColor: '#E0F2FE', borderColor: '#BAE6FD' }]}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.mobilePrintBtnText, { color: '#0369A1', fontWeight: '700' }]}>📄 View Voucher</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handlePrintReceipt(rcpt)}
                        style={[styles.mobilePrintBtn, { flex: 1 }]}
                        accessibilityRole="button"
                      >
                        <Text style={styles.mobilePrintBtnText}>🖨 Print</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          /* Desktop Receipts Table */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 130 }]}>RECEIPT NO</Text>
                <Text style={[styles.thCell, { width: 140 }]}>DATE & TIME</Text>
                <Text style={[styles.thCell, { width: 180 }]}>CUSTOMER NAME</Text>
                <Text style={[styles.thCell, { width: 190 }]}>LINKED REF / INVOICE</Text>
                <Text style={[styles.thCell, { width: 130, textAlign: 'center' }]}>PAYMENT MODE</Text>
                <Text style={[styles.thCell, { width: 170 }]}>TRANSACTION / UTR REF</Text>
                <Text style={[styles.thCell, { width: 110, textAlign: 'right' }]}>AMOUNT PAID</Text>
                <Text style={[styles.thCell, { width: 140 }]}>RECEIVED BY</Text>
                <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>STATUS</Text>
                <Text style={[styles.thCell, { width: 130, textAlign: 'center' }]}>ACTIONS</Text>
              </View>

              {filteredPayments.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No payment receipts found</Text>
                  <Text style={styles.emptySubtitle}>Try changing your search terms or payment mode selection.</Text>
                </View>
              ) : (
                filteredPayments.map((rcpt, index) => {
                  const modeStyle = MODE_BADGES[rcpt.paymentMode] || MODE_BADGES.Cash;
                  const displayAmount = rcpt.amount || rcpt.amountPaid || '₹0.00';
                  const displayDate = rcpt.date || rcpt.paymentDate || '';
                  const displayLinked = rcpt.linkedRef || rcpt.linkedInvoices || 'Direct Payment';

                  return (
                    <View
                      key={rcpt.id}
                      style={[
                        styles.tableRow,
                        index % 2 === 1 && styles.tableRowAlt,
                      ]}
                    >
                      <Text style={[styles.tdCell, styles.receiptNoText, { width: 130 }]}>
                        {rcpt.id}
                      </Text>
                      <Text style={[styles.tdCell, { width: 140 }]}>{displayDate}</Text>
                      <View style={[{ width: 180 }]}>
                        <Text style={[styles.tdCell, styles.customerNameText]} numberOfLines={1}>
                          {rcpt.customerName}
                        </Text>
                        <Text style={styles.customerIdSubtext}>{rcpt.customerId}</Text>
                      </View>
                      <Text style={[styles.tdCell, { width: 190, color: '#334155', fontWeight: '500' }]}>
                        {displayLinked}
                      </Text>

                      {/* Payment Mode Badge */}
                      <View style={[styles.modeCellWrapper, { width: 130 }]}>
                        <View style={[styles.modeBadge, { backgroundColor: modeStyle.bg }]}>
                          <Text style={[styles.modeBadgeText, { color: modeStyle.text }]}>
                            {rcpt.paymentMode}
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.tdCell, styles.utrText, { width: 170 }]}>
                        {rcpt.transactionRef}
                      </Text>

                      <Text style={[styles.tdCell, styles.paidAmountText, { width: 110, textAlign: 'right' }]}>
                        {displayAmount}
                      </Text>

                      <Text style={[styles.tdCell, { width: 140 }]}>{rcpt.receivedBy}</Text>

                      {/* Status */}
                      <View style={[styles.statusCellWrapper, { width: 90 }]}>
                        <View style={styles.statusBadgeCompleted}>
                          <Text style={styles.statusBadgeTextCompleted}>{rcpt.status || 'Completed'}</Text>
                        </View>
                      </View>

                      {/* Actions */}
                      <View style={[styles.actionsCellWrapper, { width: 140 }]}>
                        <Pressable
                          onPress={() => handleViewVoucher(rcpt)}
                          style={styles.voucherBtn}
                          accessibilityRole="button"
                          accessibilityLabel="View Voucher"
                        >
                          <Text style={styles.voucherBtnText}>Voucher</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handlePrintReceipt(rcpt)}
                          style={styles.printBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Print Receipt"
                        >
                          <Text style={styles.printBtnText}>Print</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Modal 1: Record Customer Payment Modal */}
      <Modal
        visible={recordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRecordModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setRecordModalVisible(false)}>
          <Pressable style={[styles.modalCard, isMobile && styles.modalCardMobile]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Record Payment Receipt</Text>
                <Text style={styles.modalSubtitle}>
                  Log direct payments, POS receipts, or credit account settlements.
                </Text>
              </View>
              <Pressable onPress={() => setRecordModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>
                  Customer Name <Text style={styles.reqStar}>*</Text>
                </Text>
                <TextInput
                  style={[styles.modalInput, formErrors.customerName && styles.inputError]}
                  placeholder="e.g. Rajesh Verma"
                  placeholderTextColor="#94A3B8"
                  value={formData.customerName}
                  onChangeText={(t) => setFormData((p) => ({ ...p, customerName: t }))}
                />
                {formErrors.customerName && <Text style={styles.errorText}>{formErrors.customerName}</Text>}
              </View>

              <View style={[styles.formRow, isMobile && styles.formRowMobile]}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Phone Number</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="+91 98XXX XXXXX"
                    placeholderTextColor="#94A3B8"
                    value={formData.phone}
                    onChangeText={(t) => setFormData((p) => ({ ...p, phone: t }))}
                  />
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Amount Paid (₹) <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.modalInput, formErrors.amount && styles.inputError]}
                    keyboardType="numeric"
                    placeholder="e.g. 2000"
                    placeholderTextColor="#94A3B8"
                    value={formData.amount}
                    onChangeText={(t) => setFormData((p) => ({ ...p, amount: t }))}
                  />
                  {formErrors.amount && <Text style={styles.errorText}>{formErrors.amount}</Text>}
                </View>
              </View>

              <View style={[styles.formRow, isMobile && styles.formRowMobile]}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Payment Mode</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="UPI / QR, Cash, Card"
                    placeholderTextColor="#94A3B8"
                    value={formData.paymentMode}
                    onChangeText={(t) => setFormData((p) => ({ ...p, paymentMode: t }))}
                  />
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Transaction / UTR Ref</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g., UPI/6829103847"
                    placeholderTextColor="#94A3B8"
                    value={formData.transactionRef}
                    onChangeText={(t) => setFormData((p) => ({ ...p, transactionRef: t }))}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Linked Invoice / Ledger Settlement Ref</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., INV-2026-8942 / Ledger Balance"
                  placeholderTextColor="#94A3B8"
                  value={formData.linkedRef}
                  onChangeText={(t) => setFormData((p) => ({ ...p, linkedRef: t }))}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable onPress={() => setRecordModalVisible(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSavePayment} style={styles.submitModalBtn}>
                <Text style={styles.submitModalBtnText}>Save & Issue Receipt</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal 2: Payment Receipt Voucher Modal */}
      {selectedReceipt && (
        <Modal
          visible={voucherModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setVoucherModalVisible(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setVoucherModalVisible(false)}>
            <Pressable style={[styles.modalCard, isMobile && styles.modalCardMobile]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Payment Receipt Voucher</Text>
                  <Text style={styles.modalSubtitle}>{selectedReceipt.id} • PharmaFlow Billing System</Text>
                </View>
                <Pressable onPress={() => setVoucherModalVisible(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.voucherBox}>
                  <Text style={styles.vouchBrand}>PHARMAFLOW PHARMACY ERP</Text>
                  <Text style={styles.vouchSub}>Official Payment Receipt</Text>

                  {/* Top Voucher Summary Badges */}
                  <View style={styles.voucherTopKpiRow}>
                    <View style={styles.voucherKpiPill}>
                      <Text style={styles.voucherKpiPillLabel}>AMOUNT PAID</Text>
                      <Text style={styles.voucherKpiPillVal}>{selectedReceipt.amount}</Text>
                    </View>
                    <View style={styles.voucherKpiPill}>
                      <Text style={styles.voucherKpiPillLabel}>PAYMENT MODE</Text>
                      <Text style={styles.voucherKpiPillVal}>{selectedReceipt.paymentMode}</Text>
                    </View>
                    <View style={styles.voucherKpiPill}>
                      <Text style={styles.voucherKpiPillLabel}>STATUS</Text>
                      <Text style={[styles.voucherKpiPillVal, { color: '#166534' }]}>✓ Completed</Text>
                    </View>
                  </View>

                  <View style={styles.vouchDivider} />

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>Receipt No:</Text>
                    <Text style={styles.vouchValueBold}>{selectedReceipt.id}</Text>
                  </View>

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>Date & Time:</Text>
                    <Text style={styles.vouchValue}>{selectedReceipt.date}</Text>
                  </View>

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>Customer Name:</Text>
                    <Text style={styles.vouchValueBold}>{selectedReceipt.customerName}</Text>
                  </View>

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>Phone Number:</Text>
                    <Text style={styles.vouchValue}>{selectedReceipt.phone}</Text>
                  </View>

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>Payment Method:</Text>
                    <Text style={styles.vouchValue}>{selectedReceipt.paymentMode}</Text>
                  </View>

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>UTR / Ref No:</Text>
                    <Text style={styles.vouchValue}>{selectedReceipt.transactionRef}</Text>
                  </View>

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>Linked Reference:</Text>
                    <Text style={styles.vouchValue}>{selectedReceipt.linkedRef}</Text>
                  </View>

                  <View style={styles.vouchDivider} />

                  <View style={styles.vouchRowBig}>
                    <Text style={styles.vouchTotalLabel}>AMOUNT RECEIVED:</Text>
                    <Text style={styles.vouchTotalValue}>{selectedReceipt.amount}</Text>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable
                  onPress={() => handlePrintReceipt(selectedReceipt)}
                  style={styles.exportBtnSecondary}
                >
                  <Text style={styles.exportBtnTextSecondary}>Print Receipt</Text>
                </Pressable>
                <Pressable onPress={() => setVoucherModalVisible(false)} style={styles.submitModalBtn}>
                  <Text style={styles.submitModalBtnText}>Close</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
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
    paddingBottom: 24,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  headerTitleBox: {
    flex: 1,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  liveTagBadge: {
    backgroundColor: '#CCFBF1',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  liveTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.5,
  },
  pageSubtitle: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 4,
  },
  recordPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  recordPayIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 6,
  },
  recordPayText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  exportBtnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
  },
  exportBtnTextSecondary: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  kpiRowCompact: {
    gap: 12,
  },
  kpiCol: {
    flex: 1,
    minWidth: 220,
  },
  kpiColMobile: {
    minWidth: '47%',
    maxWidth: '48.5%',
  },
  /* Mobile Receipt Card Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobileReceiptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  mobileCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  mobileRcptId: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F766E',
  },
  mobileRcptCust: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  mobileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 10,
    gap: 10,
  },
  mobileGridCol: {
    width: '47%',
  },
  mobileLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  mobileVal: {
    fontSize: 12.5,
    color: '#334155',
    marginTop: 1,
  },
  mobileValBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  mobileCardFooter: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  mobilePrintBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  mobilePrintBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  filtersBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  filtersBarCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
  },
  searchBoxMobile: {
    width: '100%',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    outlineStyle: 'none',
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  filterChipScroll: {
    maxHeight: 44,
  },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    cursor: 'pointer',
  },
  filterChipActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  filterChipTextActive: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tableSubheader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  paginationInfo: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748B',
  },
  tableWrapper: {
    minWidth: 1460,
    paddingHorizontal: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  thCell: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    paddingHorizontal: 6,
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  tdCell: {
    fontSize: 13,
    color: '#334155',
    paddingHorizontal: 6,
  },
  receiptIdText: {
    fontWeight: '700',
    color: '#0F766E',
  },
  custNameText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  phoneSubtext: {
    fontSize: 11,
    color: '#64748B',
    paddingHorizontal: 6,
  },
  linkedRefText: {
    color: '#0284C7',
    fontWeight: '500',
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  modeBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  utrText: {
    fontWeight: '600',
    color: '#475569',
  },
  paidAmountText: {
    fontWeight: '800',
    color: '#16A34A',
  },
  statusBadgeCompleted: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeTextCompleted: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  actionsCellWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  voucherBtn: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    cursor: 'pointer',
  },
  voucherBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  printBtn: {
    backgroundColor: '#0F766E',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    cursor: 'pointer',
  },
  printBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalCardMobile: {
    maxWidth: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '700',
  },
  modalBody: {
    padding: 22,
    maxHeight: 520,
  },
  formGroup: {
    marginBottom: 14,
  },
  formRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  formRowMobile: {
    flexDirection: 'column',
    gap: 10,
  },
  formFieldHalf: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  reqStar: {
    color: '#DC2626',
  },
  modalInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
    outlineStyle: 'none',
  },
  inputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 3,
    fontWeight: '500',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 6,
    cursor: 'pointer',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  submitModalBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 8,
    cursor: 'pointer',
  },
  submitModalBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  voucherBox: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 20,
  },
  vouchBrand: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F766E',
    textAlign: 'center',
  },
  vouchSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },
  voucherTopKpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  voucherKpiPill: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  voucherKpiPillLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  voucherKpiPillVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  vouchDivider: {
    height: 1,
    backgroundColor: '#CBD5E1',
    marginVertical: 14,
  },
  vouchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  vouchLabel: {
    fontSize: 12.5,
    color: '#64748B',
  },
  vouchValue: {
    fontSize: 13,
    color: '#334155',
  },
  vouchValueBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  vouchRowBig: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  vouchTotalLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  vouchTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#16A34A',
  },
});

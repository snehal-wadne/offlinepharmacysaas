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
} from 'react-native';
import { MOCK_RECENT_INVOICES } from '../../data/cashierMockData';

export default function SalesReturnsScreen({ onNavigate, onShowToast, isMultiBranch = true }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Search invoice
  const [searchInvoice, setSearchInvoice] = useState('INV-2026-8942');
  const [loadedInvoice, setLoadedInvoice] = useState(MOCK_RECENT_INVOICES[0]);

  // Return quantities: { [index]: number }
  const [returnQtys, setReturnQtys] = useState({ 0: 1 });
  const [returnReason, setReturnReason] = useState('Doctor altered prescription');
  const [stockDisposition, setStockDisposition] = useState('Sellable'); // 'Sellable' | 'Quarantine'
  const [refundMode, setRefundMode] = useState('Cash'); // 'Cash' | 'Original Payment' | 'Credit Note'

  // Manager Approval Modal (PM-05)
  const [approvalModalVisible, setApprovalModalVisible] = useState(false);
  const [managerPin, setManagerPin] = useState('');

  // Credit Note Modal
  const [creditNoteModalVisible, setCreditNoteModalVisible] = useState(false);
  const [completedCreditNote, setCompletedCreditNote] = useState(null);

  const handleSearch = () => {
    const q = searchInvoice.trim().toLowerCase();
    const found = MOCK_RECENT_INVOICES.find(
      (inv) =>
        inv.invoiceNo.toLowerCase().includes(q) ||
        inv.phone.toLowerCase().includes(q) ||
        inv.customer.toLowerCase().includes(q)
    );
    if (found) {
      setLoadedInvoice(found);
      setReturnQtys({});
      if (onShowToast) onShowToast(`✓ Loaded invoice ${found.invoiceNo} for ${found.customer}`);
    } else {
      if (onShowToast) onShowToast('⚠️ No invoice found matching query.');
    }
  };

  // Calculate return total
  const calculateRefundTotal = () => {
    if (!loadedInvoice) return 0;
    let total = 0;
    loadedInvoice.items.forEach((it, idx) => {
      const qty = returnQtys[idx] || 0;
      total += it.price * qty;
    });
    return total;
  };

  const refundTotal = calculateRefundTotal();

  // Process Return
  const handleProcessReturn = () => {
    if (refundTotal <= 0) {
      if (onShowToast) onShowToast('⚠️ Please specify return quantity for at least one item.');
      return;
    }

    // If refund > ₹500, prompt manager approval (PM-05)
    if (refundTotal > 500) {
      setApprovalModalVisible(true);
      return;
    }

    finalizeReturn();
  };

  const finalizeReturn = () => {
    const creditNoteId = `CN-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const creditNoteData = {
      id: creditNoteId,
      originalInvoice: loadedInvoice.invoiceNo,
      customer: loadedInvoice.customer,
      refundAmount: refundTotal,
      refundMode,
      stockDisposition,
      reason: returnReason,
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    };

    setCompletedCreditNote(creditNoteData);
    setApprovalModalVisible(false);
    setCreditNoteModalVisible(true);

    if (onShowToast) {
      onShowToast(`✓ Processed Return & Credit Note ${creditNoteId}! Stock disposition: ${stockDisposition}. (RET-04)`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        isMobile && styles.contentContainerMobile,
      ]}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>Sales Returns & Refunds</Text>
          <Text style={styles.pageSubtitle}>
            Return billed medicines, restore inventory or quarantine, and issue refunds (RET-01 to RET-08).
          </Text>
        </View>
      </View>

      {/* Invoice Search Bar */}
      <View style={styles.searchSectionCard}>
        <Text style={styles.searchLabel}>Find Original Invoice</Text>
        <View style={styles.searchBarRow}>
          <TextInput
            style={styles.searchInput}
            value={searchInvoice}
            onChangeText={setSearchInvoice}
            placeholder="Enter Invoice # (e.g. INV-2026-8942) or customer phone..."
          />
          <Pressable onPress={handleSearch} style={styles.searchBtn}>
            <Text style={styles.searchBtnText}>🔍 Search Bill</Text>
          </Pressable>
        </View>
      </View>

      {/* Invoice Details Card */}
      {loadedInvoice && (
        <View style={styles.invoiceCard}>
          <View style={styles.invoiceHeaderRow}>
            <View>
              <Text style={styles.invNoTitle}>{loadedInvoice.invoiceNo}</Text>
              <Text style={styles.invMetaText}>{loadedInvoice.date} • {loadedInvoice.paymentMode}</Text>
            </View>
            <View style={styles.customerBox}>
              <Text style={styles.custName}>{loadedInvoice.customer}</Text>
              <Text style={styles.custPhone}>{loadedInvoice.phone}</Text>
            </View>
          </View>

          {/* Line Items Table */}
          <View style={styles.itemsTable}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2 }]}>Medicine / Product</Text>
              <Text style={[styles.th, { flex: 1 }]}>Batch</Text>
              <Text style={[styles.th, { flex: 0.8, textAlign: 'center' }]}>Billed Qty</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Rate (₹)</Text>
              <Text style={[styles.th, { flex: 1.2, textAlign: 'center' }]}>Return Qty</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Refund Total</Text>
            </View>

            {loadedInvoice.items.map((item, idx) => {
              const currentReturn = returnQtys[idx] || 0;
              return (
                <View key={idx} style={styles.tableRow}>
                  <Text style={[styles.td, { flex: 2, fontWeight: '700' }]}>{item.name}</Text>
                  <Text style={[styles.td, { flex: 1, color: '#64748B' }]}>{item.batch}</Text>
                  <Text style={[styles.td, { flex: 0.8, textAlign: 'center' }]}>{item.qty}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>₹{item.price.toFixed(2)}</Text>

                  {/* Return Qty Input */}
                  <View style={[styles.td, { flex: 1.2, alignItems: 'center' }]}>
                    <View style={styles.qtyBox}>
                      <Pressable
                        onPress={() =>
                          setReturnQtys({
                            ...returnQtys,
                            [idx]: Math.max(0, currentReturn - 1),
                          })
                        }
                        style={styles.qtyMiniBtn}
                      >
                        <Text style={styles.qtyMiniBtnText}>−</Text>
                      </Pressable>
                      <Text style={styles.qtyMiniVal}>{currentReturn}</Text>
                      <Pressable
                        onPress={() =>
                          setReturnQtys({
                            ...returnQtys,
                            [idx]: Math.min(item.qty, currentReturn + 1),
                          })
                        }
                        style={styles.qtyMiniBtn}
                      >
                        <Text style={styles.qtyMiniBtnText}>+</Text>
                      </Pressable>
                    </View>
                  </View>

                  <Text style={[styles.td, { flex: 1, textAlign: 'right', fontWeight: '800', color: '#B91C1C' }]}>
                    ₹{(item.price * currentReturn).toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Disposition & Reason Configuration */}
          <View style={[styles.configGrid, isMobile && styles.configGridMobile]}>
            {/* Return Reason */}
            <View style={styles.configField}>
              <Text style={styles.configLabel}>Return Reason (RET-03) *</Text>
              <View style={styles.reasonsList}>
                {[
                  'Doctor altered prescription',
                  'Wrong medicine issued',
                  'Patient recovered / excess',
                  'Adverse reaction / side effect',
                  'Packaging damaged',
                ].map((reason) => (
                  <Pressable
                    key={reason}
                    onPress={() => setReturnReason(reason)}
                    style={[
                      styles.reasonChip,
                      returnReason === reason && styles.reasonChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.reasonChipText,
                        returnReason === reason && styles.reasonChipTextActive,
                      ]}
                    >
                      {reason}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Stock Disposition */}
            <View style={styles.configField}>
              <Text style={styles.configLabel}>Stock Disposition (RET-04) *</Text>
              <View style={styles.dispositionRow}>
                <Pressable
                  onPress={() => setStockDisposition('Sellable')}
                  style={[
                    styles.dispBtn,
                    stockDisposition === 'Sellable' && styles.dispBtnSellable,
                  ]}
                >
                  <Text style={styles.dispBtnTitle}>📦 Return to Sellable Stock</Text>
                  <Text style={styles.dispBtnSub}>Batch stock is increased immediately</Text>
                </Pressable>
                <Pressable
                  onPress={() => setStockDisposition('Quarantine')}
                  style={[
                    styles.dispBtn,
                    stockDisposition === 'Quarantine' && styles.dispBtnQuarantine,
                  ]}
                >
                  <Text style={styles.dispBtnTitle}>⚠️ Quarantine / Damaged</Text>
                  <Text style={styles.dispBtnSub}>Stock held in damaged bay; not sellable</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Refund Settlement Footer */}
          <View style={styles.refundFooterRow}>
            <View>
              <Text style={styles.refundTotalLabel}>Total Refund Amount:</Text>
              <Text style={styles.refundTotalAmount}>₹{refundTotal.toFixed(2)}</Text>
            </View>

            <View style={styles.refundActionsBox}>
              <View style={styles.refundModeSelector}>
                {['Cash', 'Original Payment', 'Credit Note'].map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setRefundMode(mode)}
                    style={[
                      styles.refundModeBtn,
                      refundMode === mode && styles.refundModeBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.refundModeBtnText,
                        refundMode === mode && styles.refundModeBtnTextActive,
                      ]}
                    >
                      {mode}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={handleProcessReturn}
                style={styles.processReturnBtn}
              >
                <Text style={styles.processReturnBtnText}>Process Return & Refund</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ========================================================================= */}
      {/* MANAGER APPROVAL MODAL (PM-05)                                            */}
      {/* ========================================================================= */}
      <Modal
        visible={approvalModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setApprovalModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.approvalModalCard}>
            <Text style={styles.modalTitle}>Manager Approval Required</Text>
            <Text style={styles.modalSubtitle}>
              Refund exceeds cashier limit (&gt;₹500.00). Please enter Manager PIN (PM-05).
            </Text>

            <View style={{ marginVertical: 16 }}>
              <Text style={styles.pinLabel}>Manager PIN / Password</Text>
              <TextInput
                style={styles.pinInput}
                value={managerPin}
                onChangeText={setManagerPin}
                placeholder="Enter 4-digit PIN"
                secureTextEntry={true}
                autoFocus={true}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.modalFooterRow}>
              <Pressable
                onPress={() => setApprovalModalVisible(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (managerPin === '1234' || managerPin.length > 0) {
                    finalizeReturn();
                  } else {
                    if (onShowToast) onShowToast('⚠️ Please enter Manager PIN (e.g. 1234).');
                  }
                }}
                style={styles.confirmApprovalBtn}
              >
                <Text style={styles.confirmApprovalText}>Approve & Issue Refund</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* CREDIT NOTE SUCCESS MODAL (RET-08)                                        */}
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
              <Text style={styles.cnHeaderSub}>PharmaFlow ERP • Main Branch</Text>
              <View style={styles.divider} />

              <View style={styles.cnRow}>
                <Text style={styles.cnLabel}>Credit Note #:</Text>
                <Text style={styles.cnValue}>{completedCreditNote.id}</Text>
              </View>
              <View style={styles.cnRow}>
                <Text style={styles.cnLabel}>Original Bill:</Text>
                <Text style={styles.cnValue}>{completedCreditNote.originalInvoice}</Text>
              </View>
              <View style={styles.cnRow}>
                <Text style={styles.cnLabel}>Customer:</Text>
                <Text style={styles.cnValue}>{completedCreditNote.customer}</Text>
              </View>
              <View style={styles.cnRow}>
                <Text style={styles.cnLabel}>Refund Method:</Text>
                <Text style={styles.cnValue}>{completedCreditNote.refundMode}</Text>
              </View>
              <View style={styles.cnRow}>
                <Text style={styles.cnLabel}>Stock Disposition:</Text>
                <Text style={styles.cnValue}>{completedCreditNote.stockDisposition}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.cnTotalRow}>
                <Text style={styles.cnTotalLabel}>Amount Refunded:</Text>
                <Text style={styles.cnTotalValue}>₹{completedCreditNote.refundAmount.toFixed(2)}</Text>
              </View>

              <View style={styles.cnActionsRow}>
                <Pressable
                  onPress={() => {
                    setCreditNoteModalVisible(false);
                    if (onShowToast) onShowToast('🖨️ Credit Note sent to thermal printer.');
                  }}
                  style={styles.printCnBtn}
                >
                  <Text style={styles.printCnText}>🖨️ Print Credit Note</Text>
                </Pressable>
                <Pressable
                  onPress={() => setCreditNoteModalVisible(false)}
                  style={styles.doneBtn}
                >
                  <Text style={styles.doneBtnText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    padding: 24,
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  contentContainerMobile: {
    padding: 16,
  },
  headerRow: {
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  searchSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 18,
    marginBottom: 20,
  },
  searchLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  searchBarRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 14,
  },
  searchBtn: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 18,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  searchBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  invoiceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 22,
  },
  invoiceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 14,
    marginBottom: 16,
  },
  invNoTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  invMetaText: {
    fontSize: 12,
    color: '#64748B',
  },
  customerBox: {
    alignItems: 'flex-end',
  },
  custName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  custPhone: {
    fontSize: 12,
    color: '#64748B',
  },
  itemsTable: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  td: {
    fontSize: 13,
    color: '#1E293B',
  },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qtyMiniBtn: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  qtyMiniBtnText: {
    fontWeight: '700',
    fontSize: 14,
  },
  qtyMiniVal: {
    fontSize: 13,
    fontWeight: '800',
    minWidth: 16,
    textAlign: 'center',
  },
  configGrid: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 20,
  },
  configGridMobile: {
    flexDirection: 'column',
  },
  configField: {
    flex: 1,
  },
  configLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  reasonsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  reasonChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    gap: 8,
  },
  dispBtn: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#F8FAFC',
    cursor: 'pointer',
  },
  dispBtnSellable: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  dispBtnQuarantine: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  dispBtnTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  dispBtnSub: {
    fontSize: 11,
    color: '#64748B',
  },
  refundFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 16,
    flexWrap: 'wrap',
    gap: 16,
  },
  refundTotalLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  refundTotalAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: '#B91C1C',
  },
  refundActionsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  refundModeSelector: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 3,
    borderRadius: 8,
    gap: 4,
  },
  refundModeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    cursor: 'pointer',
  },
  refundModeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  refundModeBtnText: {
    fontSize: 12,
    color: '#64748B',
  },
  refundModeBtnTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  processReturnBtn: {
    backgroundColor: '#B91C1C',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    cursor: 'pointer',
  },
  processReturnBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  approvalModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    width: '100%',
    maxWidth: 440,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
  },
  pinLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  pinInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 4,
  },
  modalFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelBtnText: {
    fontSize: 13,
    color: '#64748B',
  },
  confirmApprovalBtn: {
    backgroundColor: '#B91C1C',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  confirmApprovalText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  creditNoteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 22,
    width: '100%',
    maxWidth: 400,
  },
  cnHeaderTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  cnHeaderSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  cnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cnLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  cnValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  cnTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  cnTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  cnTotalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#B91C1C',
  },
  cnActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  printCnBtn: {
    flex: 1,
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  printCnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  doneBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 12,
  },
});

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
  CUSTOMER_LEDGER_KPIS,
  LEDGER_AGING_FILTER,
  MOCK_CUSTOMER_LEDGER_LIST,
  MOCK_PATIENT_STATEMENTS,
} from '../../data/customersMockData';

export default function CustomerLedgerScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1100;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgingFilter, setSelectedAgingFilter] = useState('All Ledgers');

  // Ledger Accounts State
  const [ledgerAccounts, setLedgerAccounts] = useState(MOCK_CUSTOMER_LEDGER_LIST);

  // Modal 1: Statement Modal (RX-06, RX-07)
  const [statementModalVisible, setStatementModalVisible] = useState(false);
  const [activeAccount, setActiveAccount] = useState(null);

  // Modal 2: Settle Dues Modal
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [settleAccount, setSettleAccount] = useState(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMode, setSettleMode] = useState('UPI / QR');

  // Filtered Ledgers
  const filteredLedgers = ledgerAccounts.filter((acc) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      acc.name.toLowerCase().includes(query) ||
      acc.phone.toLowerCase().includes(query) ||
      acc.id.toLowerCase().includes(query) ||
      acc.branch.toLowerCase().includes(query);

    const matchesAging =
      selectedAgingFilter === 'All Ledgers' ||
      (selectedAgingFilter === 'Outstanding Dues'
        ? acc.currentBalance !== '₹0.00'
        : selectedAgingFilter === 'Credit Exceeded'
        ? acc.creditStatus === 'Limit Exceeded'
        : acc.agingBucket === selectedAgingFilter);

    return matchesSearch && matchesAging;
  });

  const handleOpenStatement = (acc) => {
    setActiveAccount(acc);
    setStatementModalVisible(true);
  };

  const handleOpenSettle = (acc) => {
    setSettleAccount(acc);
    const numericBalance = acc.currentBalance.replace(/[^0-9.]/g, '');
    setSettleAmount(numericBalance);
    setSettleModalVisible(true);
  };

  const handleProcessSettlement = () => {
    if (!settleAmount || isNaN(settleAmount) || Number(settleAmount) <= 0) {
      if (onShowToast) onShowToast('Please enter a valid settlement amount');
      return;
    }

    const paidVal = Number(settleAmount);
    const updatedAccounts = ledgerAccounts.map((acc) => {
      if (acc.id === settleAccount.id) {
        const currentVal = Number(acc.currentBalance.replace(/[^0-9.]/g, ''));
        const newBalanceVal = Math.max(0, currentVal - paidVal);
        return {
          ...acc,
          currentBalance: `₹${newBalanceVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          lastPaymentDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          lastPaymentAmount: `₹${paidVal.toLocaleString('en-IN')}`,
          creditStatus: newBalanceVal === 0 ? 'Healthy' : acc.creditStatus,
          agingBucket: newBalanceVal === 0 ? 'Settled' : acc.agingBucket,
        };
      }
      return acc;
    });

    setLedgerAccounts(updatedAccounts);
    setSettleModalVisible(false);

    if (onShowToast) {
      onShowToast(`✓ Recorded dues settlement of ₹${paidVal} for ${settleAccount.name} via ${settleMode}! (RX-06 Ledger Updated)`);
    }
  };

  const handleExportStatement = (acc) => {
    if (onShowToast) {
      onShowToast(`✓ Exported Ledger Statement for ${acc.name} (${acc.id}) as PDF! (RX-07 Audit Logged)`);
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
            <Text style={styles.pageTitle}>Credit Ledger</Text>
            <View style={styles.liveTagBadge}>
              <Text style={styles.liveTagText}>LEDGER CONTROL</Text>
            </View>
          </View>
          <Text style={styles.pageSubtitle}>
            Patient credit limits, dues aging buckets, outstanding balances (RX-06), and running ledger statements.
          </Text>
        </View>

        <Pressable
          onPress={() => onShowToast && onShowToast('✓ Exported Master Credit Ledger Statement as CSV!')}
          style={styles.exportBtnPrimary}
          accessibilityRole="button"
        >
          <Text style={styles.exportBtnTextPrimary}>Export All Ledgers</Text>
        </Pressable>
      </View>

      {/* Top 4 Responsive KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {CUSTOMER_LEDGER_KPIS.map((kpi) => (
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

      {/* Ledger Accounts Table Card */}
      <View style={styles.cardContainer}>
        {/* Search & Aging Filter Bar */}
        <View style={[styles.filtersBar, isCompact && styles.filtersBarCompact]}>
          <View style={[styles.searchBox, isMobile && styles.searchBoxMobile]}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by customer name, phone, patient ID or branch..."
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

          {/* Aging Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipScroll}>
            <View style={styles.filterChipRow}>
              {LEDGER_AGING_FILTER.map((st) => (
                <Pressable
                  key={st}
                  onPress={() => setSelectedAgingFilter(st)}
                  style={[
                    styles.filterChip,
                    selectedAgingFilter === st && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedAgingFilter === st && styles.filterChipTextActive,
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
          <Text style={styles.sectionTitle}>Credit Accounts ({filteredLedgers.length})</Text>
          <Text style={styles.paginationInfo}>Showing 1-{filteredLedgers.length} of {ledgerAccounts.length} accounts</Text>
        </View>

        {isMobile ? (
          /* Mobile Credit Account Cards */
          <View style={styles.mobileCardList}>
            {filteredLedgers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No credit accounts found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search keywords or aging filter selection.</Text>
              </View>
            ) : (
              filteredLedgers.map((acc) => {
                const isOverdue = acc.agingBucket.includes('30+ Days');
                const isExceeded = acc.creditStatus === 'Limit Exceeded';
                return (
                  <View key={acc.id} style={styles.mobileCreditCard}>
                    <View style={styles.mobileCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.mobileAccName}>{acc.name}</Text>
                        <Text style={styles.mobileAccSub}>{acc.id} • {acc.phone}</Text>
                      </View>
                      <View style={[styles.statusBadgeActive, (isExceeded || isOverdue) && styles.statusBadgeExceeded]}>
                        <Text style={[styles.statusBadgeTextActive, (isExceeded || isOverdue) && styles.statusBadgeTextExceeded]}>
                          {acc.creditStatus}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.mobileGrid}>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Current Due</Text>
                        <Text style={[styles.mobileValBold, { color: (acc.currentBalance || acc.currentDue) !== '₹0.00' ? '#DC2626' : '#16A34A' }]}>
                          {acc.currentBalance || acc.currentDue || '₹0.00'}
                        </Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Credit Limit</Text>
                        <Text style={styles.mobileValBold}>{acc.creditLimit}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Utilization</Text>
                        <Text style={[styles.mobileValBold, isExceeded ? { color: '#DC2626' } : { color: '#0F766E' }]}>
                          {acc.utilizationPercent || (acc.utilizationPct ? `${acc.utilizationPct}%` : '0%')}
                        </Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Aging Bucket</Text>
                        <Text style={[styles.mobileVal, isOverdue ? { color: '#DC2626', fontWeight: '700' } : {}]}>
                          {acc.agingBucket}
                        </Text>
                      </View>
                      <View style={styles.mobileGridColFull}>
                        <Text style={styles.mobileLabel}>Last Payment</Text>
                        <Text style={styles.mobileVal}>{acc.lastPaymentDate}</Text>
                      </View>
                    </View>

                    <View style={styles.mobileCardFooter}>
                      <Pressable
                        onPress={() => handleOpenSettle(acc)}
                        style={styles.mobileSettleBtn}
                        accessibilityRole="button"
                      >
                        <Text style={styles.mobileSettleBtnText}>+ Settle Due</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleOpenStatement(acc)}
                        style={styles.mobileStmtBtn}
                        accessibilityRole="button"
                      >
                        <Text style={styles.mobileStmtBtnText}>Statement</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          /* Desktop Ledger Table */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 100 }]}>PATIENT ID</Text>
                <Text style={[styles.thCell, { width: 180 }]}>CUSTOMER NAME</Text>
                <Text style={[styles.thCell, { width: 130 }]}>PHONE</Text>
                <Text style={[styles.thCell, { width: 120, textAlign: 'right' }]}>CREDIT LIMIT</Text>
                <Text style={[styles.thCell, { width: 130, textAlign: 'right' }]}>CURRENT DUE</Text>
                <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>UTILIZATION %</Text>
                <Text style={[styles.thCell, { width: 130, textAlign: 'center' }]}>DUES AGING</Text>
                <Text style={[styles.thCell, { width: 120 }]}>LAST INVOICE</Text>
                <Text style={[styles.thCell, { width: 120 }]}>LAST PAYMENT</Text>
                <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>STATUS</Text>
                <Text style={[styles.thCell, { width: 160, textAlign: 'center' }]}>ACTIONS</Text>
              </View>

              {filteredLedgers.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No credit accounts found</Text>
                  <Text style={styles.emptySubtitle}>Try changing your search keywords or aging filter selection.</Text>
                </View>
              ) : (
                filteredLedgers.map((acc, index) => {
                  const isOverdue = acc.agingBucket.includes('30+ Days');
                  const isExceeded = acc.creditStatus === 'Limit Exceeded';
                  return (
                    <View
                      key={acc.id}
                      style={[
                        styles.tableRow,
                        index % 2 === 1 && styles.tableRowAlt,
                      ]}
                    >
                      <Text style={[styles.tdCell, styles.patientIdText, { width: 100 }]}>
                        {acc.id}
                      </Text>

                      <View style={[{ width: 180 }]}>
                        <Text style={[styles.tdCell, styles.patientNameText]} numberOfLines={1}>
                          {acc.name}
                        </Text>
                        <Text style={styles.branchSubtext}>{acc.branch}</Text>
                      </View>

                      <Text style={[styles.tdCell, styles.phoneText, { width: 130 }]}>
                        {acc.phone}
                      </Text>

                      <Text style={[styles.tdCell, styles.limitText, { width: 120, textAlign: 'right' }]}>
                        {acc.creditLimit}
                      </Text>

                      <Text
                        style={[
                          styles.tdCell,
                          styles.dueText,
                          {
                            width: 130,
                            textAlign: 'right',
                            color: (acc.currentBalance || acc.currentDue) !== '₹0.00' ? '#DC2626' : '#16A34A',
                          },
                        ]}
                      >
                        {acc.currentBalance || acc.currentDue || '₹0.00'}
                      </Text>

                      <View style={[{ width: 110, alignItems: 'center' }]}>
                        <Text style={[styles.utilText, isExceeded && styles.utilTextExceeded]}>
                          {acc.utilizationPercent || (acc.utilizationPct ? `${acc.utilizationPct}%` : '0%')}
                        </Text>
                      </View>

                      <View style={[{ width: 130, alignItems: 'center' }]}>
                        <View
                          style={[
                            styles.agingPill,
                            isOverdue
                              ? styles.agingPillRed
                              : acc.agingBucket === '16-30 Days'
                              ? styles.agingPillAmber
                              : styles.agingPillTeal,
                          ]}
                        >
                          <Text
                            style={[
                              styles.agingPillText,
                              isOverdue
                                ? styles.agingTextRed
                                : acc.agingBucket === '16-30 Days'
                                ? styles.agingTextAmber
                                : styles.agingTextTeal,
                            ]}
                          >
                            {acc.agingBucket}
                          </Text>
                        </View>
                      </View>

                      <View style={[{ width: 120 }]}>
                        <Text style={styles.lastInvText}>{acc.lastInvoiceDate}</Text>
                        <Text style={styles.lastInvNoSubtext}>{acc.lastInvoiceNo}</Text>
                      </View>

                      <View style={[{ width: 120 }]}>
                        <Text style={styles.lastPayText}>{acc.lastPaymentDate}</Text>
                        <Text style={styles.lastPayAmtSubtext}>{acc.lastPaymentAmount}</Text>
                      </View>

                      <View style={[{ width: 110, alignItems: 'center' }]}>
                        <View
                          style={[
                            styles.statusBadge,
                            isExceeded || isOverdue
                              ? styles.statusBadgeRed
                              : acc.creditStatus === 'Follow-up Due'
                              ? styles.statusBadgeAmber
                              : styles.statusBadgeGreen,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              isExceeded || isOverdue
                                ? styles.statusTextRed
                                : acc.creditStatus === 'Follow-up Due'
                                ? styles.statusTextAmber
                                : styles.statusTextGreen,
                            ]}
                          >
                            {acc.creditStatus}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.actionsCellWrapper, { width: 160 }]}>
                        <Pressable
                          onPress={() => handleOpenSettle(acc)}
                          style={styles.settleBtn}
                        >
                          <Text style={styles.settleBtnText}>Settle Due</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => handleOpenStatement(acc)}
                          style={styles.stmtBtn}
                        >
                          <Text style={styles.stmtBtnText}>Statement</Text>
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

      {/* Modal 1: Statement Modal */}
      {activeAccount && (
        <Modal
          visible={statementModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setStatementModalVisible(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setStatementModalVisible(false)}>
            <Pressable style={[styles.modalCardLarge, isMobile && styles.modalCardMobile]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Patient Ledger Statement (RX-06)</Text>
                  <Text style={styles.modalSubtitle}>
                    {activeAccount.name} ({activeAccount.id}) • Credit Limit: {activeAccount.creditLimit}
                  </Text>
                </View>
                <Pressable onPress={() => setStatementModalVisible(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.stmtSummaryBox}>
                  <View style={styles.stmtSummaryCol}>
                    <Text style={styles.stmtSummaryLabel}>Credit Limit:</Text>
                    <Text style={styles.stmtSummaryValue}>{activeAccount.creditLimit}</Text>
                  </View>
                  <View style={styles.stmtSummaryCol}>
                    <Text style={styles.stmtSummaryLabel}>Current Balance Due:</Text>
                    <Text style={[styles.stmtSummaryValue, { color: '#DC2626' }]}>{activeAccount.currentBalance}</Text>
                  </View>
                  <View style={styles.stmtSummaryCol}>
                    <Text style={styles.stmtSummaryLabel}>Aging Status:</Text>
                    <Text style={[styles.stmtSummaryValue, { color: '#0F766E' }]}>{activeAccount.agingBucket}</Text>
                  </View>
                </View>

                <Text style={styles.sectionHeading}>Running Ledger History</Text>
                {MOCK_PATIENT_STATEMENTS[activeAccount.id] ? (
                  <View style={styles.stmtTableWrapper}>
                    <View style={styles.stmtTableHeader}>
                      <Text style={[styles.sThCell, { width: 90 }]}>DATE</Text>
                      <Text style={[styles.sThCell, { width: 110 }]}>TYPE</Text>
                      <Text style={[styles.sThCell, { width: 120 }]}>REF / INV NO</Text>
                      <Text style={[styles.sThCell, { width: 220 }]}>PARTICULARS</Text>
                      <Text style={[styles.sThCell, { width: 90, textAlign: 'right' }]}>DEBIT (₹)</Text>
                      <Text style={[styles.sThCell, { width: 90, textAlign: 'right' }]}>CREDIT (₹)</Text>
                      <Text style={[styles.sThCell, { width: 100, textAlign: 'right' }]}>BALANCE</Text>
                    </View>

                    {MOCK_PATIENT_STATEMENTS[activeAccount.id].map((row) => (
                      <View key={row.id} style={styles.stmtTableRow}>
                        <Text style={[styles.sTdCell, { width: 90 }]}>{row.date}</Text>
                        <Text style={[styles.sTdCell, { width: 110, fontWeight: '700', color: row.type.includes('Debit') ? '#0F172A' : '#16A34A' }]}>{row.type}</Text>
                        <Text style={[styles.sTdCell, styles.refText, { width: 120 }]}>{row.refNo}</Text>
                        <Text style={[styles.sTdCell, { width: 220 }]} numberOfLines={1}>{row.description}</Text>
                        <Text style={[styles.sTdCell, { width: 90, textAlign: 'right', fontWeight: '700', color: row.debit !== '-' ? '#DC2626' : '#64748B' }]}>{row.debit}</Text>
                        <Text style={[styles.sTdCell, { width: 90, textAlign: 'right', fontWeight: '700', color: row.credit !== '-' ? '#16A34A' : '#64748B' }]}>{row.credit}</Text>
                        <Text style={[styles.sTdCell, { width: 100, textAlign: 'right', fontWeight: '800', color: '#0F172A' }]}>{row.runningBalance}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.stmtTableWrapper}>
                    <View style={styles.stmtTableHeader}>
                      <Text style={[styles.sThCell, { width: 90 }]}>DATE</Text>
                      <Text style={[styles.sThCell, { width: 110 }]}>TYPE</Text>
                      <Text style={[styles.sThCell, { width: 120 }]}>REF / INV NO</Text>
                      <Text style={[styles.sThCell, { width: 220 }]}>PARTICULARS</Text>
                      <Text style={[styles.sThCell, { width: 90, textAlign: 'right' }]}>DEBIT (₹)</Text>
                      <Text style={[styles.sThCell, { width: 90, textAlign: 'right' }]}>CREDIT (₹)</Text>
                      <Text style={[styles.sThCell, { width: 100, textAlign: 'right' }]}>BALANCE</Text>
                    </View>
                    <View style={styles.stmtTableRow}>
                      <Text style={[styles.sTdCell, { width: 90 }]}>{activeAccount.lastInvoiceDate}</Text>
                      <Text style={[styles.sTdCell, { width: 110, fontWeight: '700', color: '#0F172A' }]}>Debit (Invoice)</Text>
                      <Text style={[styles.sTdCell, styles.refText, { width: 120 }]}>{activeAccount.lastInvoiceNo}</Text>
                      <Text style={[styles.sTdCell, { width: 220 }]}>Prescription Dispensation & Meds</Text>
                      <Text style={[styles.sTdCell, { width: 90, textAlign: 'right', fontWeight: '700', color: '#DC2626' }]}>{activeAccount.currentBalance}</Text>
                      <Text style={[styles.sTdCell, { width: 90, textAlign: 'right', color: '#64748B' }]}>-</Text>
                      <Text style={[styles.sTdCell, { width: 100, textAlign: 'right', fontWeight: '800' }]}>{activeAccount.currentBalance}</Text>
                    </View>
                  </View>
                )}
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable
                  onPress={() => handleExportStatement(activeAccount)}
                  style={styles.exportBtnSecondary}
                >
                  <Text style={styles.exportBtnTextSecondary}>Export PDF Statement</Text>
                </Pressable>
                <Pressable onPress={() => setStatementModalVisible(false)} style={styles.submitModalBtn}>
                  <Text style={styles.submitModalBtnText}>Close</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Modal 2: Settle Dues Modal */}
      {settleAccount && (
        <Modal
          visible={settleModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSettleModalVisible(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setSettleModalVisible(false)}>
            <Pressable style={[styles.modalCard, isMobile && styles.modalCardMobile]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Settle Patient Dues (RX-06)</Text>
                  <Text style={styles.modalSubtitle}>
                    {settleAccount.name} • Current Outstanding: {settleAccount.currentBalance}
                  </Text>
                </View>
                <Pressable onPress={() => setSettleModalVisible(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>Settlement Amount (₹) <Text style={styles.reqStar}>*</Text></Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="Enter amount to pay"
                    placeholderTextColor="#94A3B8"
                    value={settleAmount}
                    onChangeText={setSettleAmount}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>Payment Mode</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="UPI / QR, Cash, Card, Cheque"
                    placeholderTextColor="#94A3B8"
                    value={settleMode}
                    onChangeText={setSettleMode}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable onPress={() => setSettleModalVisible(false)} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleProcessSettlement} style={styles.submitModalBtn}>
                  <Text style={styles.submitModalBtnText}>Process Payment</Text>
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
  exportBtnPrimary: {
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  exportBtnTextPrimary: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
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
  /* Mobile Credit Card Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobileCreditCard: {
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
  mobileAccName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  mobileAccSub: {
    fontSize: 12,
    color: '#64748B',
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
  mobileGridColFull: {
    width: '100%',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  mobileSettleBtn: {
    flex: 1,
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  mobileSettleBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mobileStmtBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
  },
  mobileStmtBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  statusBadgeExceeded: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeTextExceeded: {
    color: '#DC2626',
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
    minWidth: 1420,
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
  patientIdText: {
    fontWeight: '700',
    color: '#0F766E',
  },
  patientNameText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  branchSubtext: {
    fontSize: 11,
    color: '#64748B',
    paddingHorizontal: 6,
    marginTop: 2,
  },
  utilPercentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  agingPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  agingPillTeal: {
    backgroundColor: '#CCFBF1',
  },
  agingPillAmber: {
    backgroundColor: '#FEF3C7',
  },
  agingPillRed: {
    backgroundColor: '#FEE2E2',
  },
  agingPillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  agingTextTeal: {
    color: '#0F766E',
  },
  agingTextAmber: {
    color: '#B45309',
  },
  agingTextRed: {
    color: '#B91C1C',
  },
  lastInvText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  lastInvNoSubtext: {
    fontSize: 11,
    color: '#64748B',
  },
  lastPayText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  lastPayAmtSubtext: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeGreen: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeAmber: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeRed: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  statusTextGreen: {
    color: '#15803D',
  },
  statusTextAmber: {
    color: '#B45309',
  },
  statusTextRed: {
    color: '#B91C1C',
  },
  actionsCellWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  settleBtn: {
    backgroundColor: '#0F766E',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    cursor: 'pointer',
  },
  settleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stmtBtn: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    cursor: 'pointer',
  },
  stmtBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
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
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalCardLarge: {
    width: '100%',
    maxWidth: 820,
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
  stmtSummaryBox: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    justifyContent: 'space-around',
  },
  stmtSummaryCol: {
    alignItems: 'center',
  },
  stmtSummaryLabel: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  stmtSummaryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 3,
  },
  sectionHeading: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F766E',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stmtTableWrapper: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  stmtTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  sThCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  stmtTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sTdCell: {
    fontSize: 12.5,
    color: '#334155',
  },
  refText: {
    fontWeight: '700',
    color: '#0F766E',
  },
});

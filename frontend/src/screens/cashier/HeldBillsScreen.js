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

export default function HeldBillsScreen({ onNavigate, onShowToast, isMultiBranch = true }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const {
    heldBills,
    resumeDraftBill,
    discardHeldBill,
    clearAllHeldBills,
  } = usePos();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState('All Dates');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All Status');
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [selectedBillForDetails, setSelectedBillForDetails] = useState(null);
  const [clearConfirmModalVisible, setClearConfirmModalVisible] = useState(false);
  const [menuBillId, setMenuBillId] = useState(null);

  // Dynamic counts for dropdown lists
  const dateCounts = {
    all: heldBills.length,
    today: heldBills.filter((b) => b.heldAt && b.heldAt.includes('29 Aug 2026')).length,
    yesterday: heldBills.filter((b) => b.heldAt && b.heldAt.includes('28 Aug 2026')).length,
    last7: heldBills.filter((b) => b.heldAt && (b.heldAt.includes('29 Aug 2026') || b.heldAt.includes('28 Aug 2026') || b.heldAt.includes('27 Aug 2026'))).length,
    month: heldBills.filter((b) => b.heldAt && b.heldAt.includes('Aug 2026')).length,
  };

  const statusCounts = {
    all: heldBills.length,
    hold: heldBills.filter((b) => b.status === 'Hold' || b.status === 'Hold (Draft)').length,
    pending: heldBills.filter((b) => b.status === 'Pending Prescription').length,
    awaiting: heldBills.filter((b) => b.status === 'Awaiting Payment').length,
  };

  const DATE_OPTIONS = [
    { label: 'All Dates', value: 'All Dates', count: dateCounts.all },
    { label: 'Today (29 Aug 2026)', value: 'Today (29 Aug 2026)', count: dateCounts.today },
    { label: 'Yesterday (28 Aug 2026)', value: 'Yesterday (28 Aug 2026)', count: dateCounts.yesterday },
    { label: 'Last 7 Days', value: 'Last 7 Days', count: dateCounts.last7 },
    { label: 'This Month (Aug 2026)', value: 'This Month (Aug 2026)', count: dateCounts.month },
  ];

  const STATUS_OPTIONS = [
    { label: 'All Status', value: 'All Status', count: statusCounts.all },
    { label: 'Hold (Draft)', value: 'Hold', count: statusCounts.hold },
    { label: 'Pending Prescription', value: 'Pending Prescription', count: statusCounts.pending },
    { label: 'Awaiting Payment', value: 'Awaiting Payment', count: statusCounts.awaiting },
  ];

  // Filter bills
  const filteredBills = heldBills.filter((b) => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch =
      !q ||
      (b.billNo && b.billNo.toLowerCase().includes(q)) ||
      (b.token && b.token.toLowerCase().includes(q)) ||
      (b.customerName && b.customerName.toLowerCase().includes(q)) ||
      (b.customerPhone && b.customerPhone.includes(q)) ||
      (b.itemsSummary && b.itemsSummary.toLowerCase().includes(q));

    let matchStatus = true;
    if (selectedStatusFilter !== 'All Status') {
      if (selectedStatusFilter === 'Hold' || selectedStatusFilter === 'Hold (Draft)') {
        matchStatus = b.status === 'Hold' || b.status === 'Hold (Draft)';
      } else {
        matchStatus = b.status === selectedStatusFilter;
      }
    }

    let matchDate = true;
    if (selectedDateFilter === 'Today (29 Aug 2026)') {
      matchDate = b.heldAt && b.heldAt.includes('29 Aug 2026');
    } else if (selectedDateFilter === 'Yesterday (28 Aug 2026)') {
      matchDate = b.heldAt && b.heldAt.includes('28 Aug 2026');
    } else if (selectedDateFilter === 'Last 7 Days') {
      matchDate =
        b.heldAt &&
        (b.heldAt.includes('29 Aug 2026') ||
          b.heldAt.includes('28 Aug 2026') ||
          b.heldAt.includes('27 Aug 2026'));
    } else if (selectedDateFilter === 'This Month (Aug 2026)') {
      matchDate = b.heldAt && b.heldAt.includes('Aug 2026');
    }

    return matchSearch && matchStatus && matchDate;
  });

  // Calculate Metrics
  const totalDraftBills = heldBills.length;
  const pendingDraftValue = heldBills.reduce((acc, b) => acc + (b.total || 0), 0);

  // Handle Resume Bill Action (Email Draft pattern)
  const handleResume = (bill) => {
    const resumed = resumeDraftBill(bill.billNo || bill.holdId);
    if (resumed) {
      if (onShowToast) {
        onShowToast(`✓ Resuming draft #${bill.billNo || bill.holdId} for ${bill.customerName}`);
      }
      if (onNavigate) {
        onNavigate('new-sale');
      }
    }
  };

  // Discard draft
  const handleDiscard = (draftId) => {
    discardHeldBill(draftId);
    setMenuBillId(null);
    if (selectedBillForDetails?.holdId === draftId || selectedBillForDetails?.billNo === draftId) {
      setSelectedBillForDetails(null);
    }
    if (onShowToast) {
      onShowToast(`Draft #${draftId} discarded.`);
    }
  };

  // Clear all
  const handleConfirmClearAll = () => {
    clearAllHeldBills();
    setClearConfirmModalVisible(false);
    if (onShowToast) {
      onShowToast('All hold bills have been cleared.');
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
      {/* 1. Header Row (Matches Image 2) */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View>
          <Text style={styles.pageTitle}>Hold Bill</Text>
          <Text style={styles.pageSubtitle}>
            All saved bills that you can resume and complete later. (Like email drafts)
          </Text>
        </View>

        <Pressable
          onPress={() => setClearConfirmModalVisible(true)}
          style={styles.clearAllBtn}
          accessibilityRole="button"
          accessibilityLabel="Clear All Hold Bills"
        >
          <Text style={styles.clearAllBtnIcon}>🗑️</Text>
          <Text style={styles.clearAllBtnText}>Clear All Hold Bills</Text>
        </Pressable>
      </View>

      {/* 2. Top Metric Cards (Matches Image 2 cards) */}
      <View style={styles.metricsCardsGrid}>
        {/* Card 1: Total Draft Bills */}
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Draft Bills</Text>
          <Text style={styles.metricValueLarge}>{totalDraftBills}</Text>
        </View>

        {/* Card 2: Pending Draft Value */}
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Pending Draft Value</Text>
          <Text style={[styles.metricValueLarge, styles.valueGreen]}>
            ₹{pendingDraftValue.toFixed(2)}
          </Text>
        </View>

        {/* Card 3: Active Branch */}
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Active Branch</Text>
          <Text style={styles.metricValueText}>Main Branch</Text>
        </View>
      </View>

      {/* 3. Search and Filters Row (Matches Image 2) */}
      <View style={styles.searchAndFiltersRow}>
        {/* Search Box */}
        <View style={styles.searchBarBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by Bill No., Customer, or Medicine..."
            placeholderTextColor="#94A3B8"
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')}>
              <Text style={styles.clearSearchIcon}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Date Filter Dropdown */}
        <View style={styles.filterDropdownWrapper}>
          <Pressable
            onPress={() => {
              setDateDropdownOpen(!dateDropdownOpen);
              setStatusDropdownOpen(false);
            }}
            style={[
              styles.filterDropdownBtn,
              (dateDropdownOpen || selectedDateFilter !== 'All Dates') &&
                styles.filterDropdownBtnActive,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Filter by date range"
          >
            <Text style={styles.filterDropdownIcon}>📅</Text>
            <Text
              style={[
                styles.filterDropdownText,
                selectedDateFilter !== 'All Dates' && styles.filterDropdownTextActive,
              ]}
            >
              {selectedDateFilter}
            </Text>
            <Text style={styles.filterDropdownArrow}>{dateDropdownOpen ? '▴' : '▾'}</Text>
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

        {/* Status Filter Dropdown */}
        <View style={styles.filterDropdownWrapper}>
          <Pressable
            onPress={() => {
              setStatusDropdownOpen(!statusDropdownOpen);
              setDateDropdownOpen(false);
            }}
            style={[
              styles.filterDropdownBtn,
              (statusDropdownOpen || selectedStatusFilter !== 'All Status') &&
                styles.filterDropdownBtnActive,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Filter by bill status"
          >
            <Text style={styles.filterDropdownIcon}>🏷️</Text>
            <Text
              style={[
                styles.filterDropdownText,
                selectedStatusFilter !== 'All Status' && styles.filterDropdownTextActive,
              ]}
            >
              {selectedStatusFilter}
            </Text>
            <Text style={styles.filterDropdownArrow}>{statusDropdownOpen ? '▴' : '▾'}</Text>
          </Pressable>

          {statusDropdownOpen && (
            <View style={styles.dropdownMenuPopover}>
              <Text style={styles.dropdownSectionLabel}>FILTER BY STATUS</Text>
              {STATUS_OPTIONS.map((opt) => {
                const isSelected = selectedStatusFilter === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      setSelectedStatusFilter(opt.value);
                      setStatusDropdownOpen(false);
                      if (onShowToast) {
                        onShowToast(`Filtered by Status: ${opt.label}`);
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

        {/* Reset Filter Pill (if any filter is active) */}
        {(selectedDateFilter !== 'All Dates' || selectedStatusFilter !== 'All Status') && (
          <Pressable
            onPress={() => {
              setSelectedDateFilter('All Dates');
              setSelectedStatusFilter('All Status');
              if (onShowToast) onShowToast('Reset all filters');
            }}
            style={styles.resetFiltersBtn}
          >
            <Text style={styles.resetFiltersBtnText}>✕ Reset</Text>
          </Pressable>
        )}
      </View>

      {/* 4. Held Bills Table (Matches Image 2) */}
      <View style={styles.tableCard}>
        {/* Table Header */}
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.thText, { flex: 1.1 }]}>BILL NO</Text>
          <Text style={[styles.thText, { flex: 1.8 }]}>CUSTOMER</Text>
          <Text style={[styles.thText, { flex: 2.8 }]}>ITEMS</Text>
          <Text style={[styles.thText, { flex: 1.2, textAlign: 'right' }]}>AMOUNT (₹)</Text>
          <Text style={[styles.thText, { flex: 1.8, textAlign: 'center' }]}>HELD ON</Text>
          <Text style={[styles.thText, { flex: 1.1, textAlign: 'center' }]}>STATUS</Text>
          <Text style={[styles.thText, { flex: 1.3, textAlign: 'center' }]}>ACTION</Text>
        </View>

        {/* Table Rows */}
        {filteredBills.length === 0 ? (
          <View style={styles.emptyTableBox}>
            <Text style={styles.emptyTableIcon}>⏸️</Text>
            <Text style={styles.emptyTableTitle}>No Draft Bills Found</Text>
            <Text style={styles.emptyTableSubtitle}>
              Unpaid carts parked during POS billing will appear here like email drafts.
            </Text>
          </View>
        ) : (
          filteredBills.map((bill, idx) => {
            const isMenuOpen = menuBillId === (bill.billNo || bill.holdId);
            return (
              <View
                key={bill.billNo || bill.holdId}
                style={[
                  styles.tableBodyRow,
                  { zIndex: isMenuOpen ? 9999 : filteredBills.length - idx },
                ]}
              >
                {/* Bill No */}
                <View style={{ flex: 1.1 }}>
                  <Text style={styles.billNoText}>{bill.billNo || bill.holdId}</Text>
                  <Text style={styles.billDraftSub}>Draft</Text>
                </View>

                {/* Customer */}
                <View style={{ flex: 1.8 }}>
                  <View style={styles.customerRow}>
                    <Text style={styles.userIconSmall}>👤</Text>
                    <Text style={styles.custNameText} numberOfLines={1}>
                      {bill.customerName}
                    </Text>
                  </View>
                  <Text style={styles.custPhoneText}>{bill.customerPhone || '—'}</Text>
                </View>

                {/* Items */}
                <View style={{ flex: 2.8 }}>
                  <View style={styles.itemsPreviewRow}>
                    <View style={styles.itemsCountBadge}>
                      <Text style={styles.itemsCountBadgeText}>{bill.itemsCount || bill.items?.length || 1}</Text>
                    </View>
                    <Text style={styles.itemsSummaryDesc} numberOfLines={1}>
                      {bill.itemsSummary || (bill.items || []).map((i) => `${i.name} (${i.qty})`).join(', ')}
                    </Text>
                  </View>
                </View>

                {/* Amount */}
                <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                  <Text style={styles.amountText}>{(bill.total || 0).toFixed(2)}</Text>
                </View>

                {/* Held On */}
                <View style={{ flex: 1.8, alignItems: 'center' }}>
                  <Text style={styles.heldOnDateText}>{bill.heldAt || '29 Aug 2026, 10:20 AM'}</Text>
                </View>

                {/* Status */}
                <View style={{ flex: 1.1, alignItems: 'center' }}>
                  <View style={styles.holdBadge}>
                    <Text style={styles.holdBadgeText}>{bill.status || 'Hold'}</Text>
                  </View>
                </View>

                {/* Action Column with correctly layered and positioned menu */}
                <View
                  style={[
                    styles.actionCellContainer,
                    { zIndex: isMenuOpen ? 9999 : 1 },
                  ]}
                >
                  <Pressable
                    onPress={() => handleResume(bill)}
                    style={styles.resumeActionBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Resume ${bill.billNo}`}
                  >
                    <Text style={styles.resumeActionBtnText}>Resume</Text>
                  </Pressable>

                  <View style={styles.moreOptionsAnchor}>
                    <Pressable
                      onPress={() =>
                        setMenuBillId(isMenuOpen ? null : (bill.billNo || bill.holdId))
                      }
                      style={[styles.moreOptionsBtn, isMenuOpen && styles.moreOptionsBtnActive]}
                      accessibilityRole="button"
                      accessibilityLabel="Options"
                    >
                      <Text style={styles.moreOptionsText}>⋮</Text>
                    </Pressable>

                    {/* Popover options menu with click-outside backdrop */}
                    {isMenuOpen && (
                      <>
                        {Platform.OS === 'web' && (
                          <div
                            onClick={() => setMenuBillId(null)}
                            style={{
                              position: 'fixed',
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              zIndex: 9998,
                              cursor: 'default',
                            }}
                          />
                        )}
                        <View style={styles.optionsMenuPopover}>
                          <Pressable
                            onPress={() => {
                              setSelectedBillForDetails(bill);
                              setMenuBillId(null);
                            }}
                            style={styles.menuItemRow}
                          >
                            <Text style={styles.menuItemText}>👁️ View Details</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              handleResume(bill);
                              setMenuBillId(null);
                            }}
                            style={styles.menuItemRow}
                          >
                            <Text style={styles.menuItemText}>▶ Resume in POS</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleDiscard(bill.billNo || bill.holdId)}
                            style={[styles.menuItemRow, { borderBottomWidth: 0 }]}
                          >
                            <Text style={[styles.menuItemText, { color: '#DC2626' }]}>🗑️ Discard Draft</Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* ========================================================================= */}
      {/* DRAFT DETAILS MODAL                                                       */}
      {/* ========================================================================= */}
      {selectedBillForDetails && (
        <Modal
          visible={!!selectedBillForDetails}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setSelectedBillForDetails(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.detailsModalCard}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    Draft Bill #{selectedBillForDetails.billNo || selectedBillForDetails.holdId}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    Customer: {selectedBillForDetails.customerName} ({selectedBillForDetails.customerPhone})
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedBillForDetails(null)}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              {/* Items list */}
              <Text style={styles.detailsItemsHeading}>Saved Medicines & Quantities:</Text>
              <ScrollView style={{ maxHeight: 220, marginBottom: 14 }}>
                {(selectedBillForDetails.items || []).map((it, i) => (
                  <View key={i} style={styles.detailItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailItemName}>{it.name}</Text>
                      <Text style={styles.detailItemSub}>
                        Batch: {it.batch} • ₹{it.sellingPrice || it.price} each
                      </Text>
                    </View>
                    <Text style={styles.detailItemQty}>x{it.qty}</Text>
                    <Text style={styles.detailItemTotal}>
                      ₹{((it.sellingPrice || it.price || 0) * (it.qty || 1)).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              <View style={styles.detailTotalRow}>
                <Text style={styles.detailTotalLabel}>Pending Draft Total:</Text>
                <Text style={styles.detailTotalAmount}>
                  ₹{(selectedBillForDetails.total || 0).toFixed(2)}
                </Text>
              </View>

              <View style={styles.detailsModalActions}>
                <Pressable
                  onPress={() => handleDiscard(selectedBillForDetails.billNo || selectedBillForDetails.holdId)}
                  style={styles.discardDraftBtn}
                >
                  <Text style={styles.discardDraftText}>Discard</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const b = selectedBillForDetails;
                    setSelectedBillForDetails(null);
                    handleResume(b);
                  }}
                  style={styles.resumeDraftPrimaryBtn}
                >
                  <Text style={styles.resumeDraftPrimaryText}>Resume in POS ➔</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* CLEAR ALL CONFIRMATION MODAL                                              */}
      {/* ========================================================================= */}
      <Modal
        visible={clearConfirmModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setClearConfirmModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalCard}>
            <Text style={styles.confirmTitle}>Clear All Hold Bills?</Text>
            <Text style={styles.confirmSubtitle}>
              This will permanently delete all {totalDraftBills} draft bills. This action cannot be undone.
            </Text>
            <View style={styles.confirmActionsRow}>
              <Pressable
                onPress={() => setClearConfirmModalVisible(false)}
                style={styles.confirmCancelBtn}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmClearAll}
                style={styles.confirmClearBtn}
              >
                <Text style={styles.confirmClearText}>Yes, Clear All</Text>
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
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    padding: 24,
    maxWidth: 1300,
    width: '100%',
    alignSelf: 'center',
  },
  contentContainerMobile: {
    padding: 16,
  },

  // 1. Header Row
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 3,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    cursor: 'pointer',
  },
  clearAllBtnIcon: {
    fontSize: 12,
  },
  clearAllBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },

  // 2. Metrics Cards (Image 2)
  metricsCardsGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  metricValueLarge: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  valueGreen: {
    color: '#0F766E',
  },
  metricValueText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },

  // 3. Search and Filters
  searchAndFiltersRow: {
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
  filterDropdownWrapper: {
    position: 'relative',
    zIndex: 110,
  },
  filterDropdownBtn: {
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
  filterDropdownBtnActive: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  filterDropdownIcon: {
    fontSize: 12,
  },
  filterDropdownText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  filterDropdownTextActive: {
    color: '#0F766E',
    fontWeight: '750',
  },
  filterDropdownArrow: {
    fontSize: 11,
    color: '#64748B',
  },

  // Dropdown Popover Card
  dropdownMenuPopover: {
    position: 'absolute',
    top: 45,
    right: 0,
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
  resetFiltersBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    cursor: 'pointer',
  },
  resetFiltersBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#DC2626',
  },

  // 4. Held Bills Table (Image 2)
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
    zIndex: 1,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  thText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    position: 'relative',
  },
  billNoText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  billDraftSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userIconSmall: {
    fontSize: 11,
  },
  custNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  custPhoneText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  itemsPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemsCountBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemsCountBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  itemsSummaryDesc: {
    fontSize: 12.5,
    color: '#334155',
    flex: 1,
  },
  amountText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  heldOnDateText: {
    fontSize: 12,
    color: '#64748B',
  },
  holdBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  holdBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B45309',
  },
  resumeActionBtn: {
    borderWidth: 1,
    borderColor: '#0F766E',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  resumeActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  actionCellContainer: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    position: 'relative',
  },
  moreOptionsAnchor: {
    position: 'relative',
  },
  moreOptionsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    cursor: 'pointer',
  },
  moreOptionsBtnActive: {
    backgroundColor: '#E2E8F0',
  },
  moreOptionsText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: 'bold',
  },
  optionsMenuPopover: {
    position: 'absolute',
    right: 0,
    top: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 25,
    zIndex: 99999,
    width: 155,
    overflow: 'hidden',
  },
  menuItemRow: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    cursor: 'pointer',
    backgroundColor: '#FFFFFF',
  },
  menuItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },

  // Empty State
  emptyTableBox: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
  },
  emptyTableIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTableTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyTableSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 420,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  detailsModalCard: {
    width: '100%',
    maxWidth: 480,
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
    fontWeight: '750',
    color: '#64748B',
  },
  detailsItemsHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 8,
  },
  detailItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  detailItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  detailItemSub: {
    fontSize: 11,
    color: '#64748B',
  },
  detailItemQty: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    paddingHorizontal: 8,
  },
  detailItemTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
    marginBottom: 16,
  },
  detailTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  detailTotalAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F766E',
  },
  detailsModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  discardDraftBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  discardDraftText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  resumeDraftPrimaryBtn: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  resumeDraftPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },

  // Confirm Modal
  confirmModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 22,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 8,
  },
  confirmSubtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 18,
  },
  confirmActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  confirmCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  confirmCancelText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  confirmClearBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#DC2626',
  },
  confirmClearText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

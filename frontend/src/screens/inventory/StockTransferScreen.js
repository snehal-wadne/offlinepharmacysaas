import React, { useState, useEffect } from 'react';
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
import { SkeletonKpiCard, SkeletonTableRow, SkeletonItemCard } from '../../components/common/SkeletonLoader';
import PaginationControls from '../../components/common/PaginationControls';
import {
  MOCK_TRANSFERS,
  TRANSFER_STATUS_FILTER,
  TRANSFER_BRANCHES,
} from '../../data/stockTransferMockData';

const STATUS_PILLS = {
  Draft: { bg: '#F1F5F9', text: '#475569' },
  'In Transit': { bg: '#DBEAFE', text: '#1D4ED8' },
  Completed: { bg: '#DCFCE7', text: '#15803D' },
  Cancelled: { bg: '#FEE2E2', text: '#B91C1C' },
};

export default function StockTransferScreen({ onShowToast }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All Statuses');
  const [fromBranch, setFromBranch] = useState('All Branches');
  const [toBranch, setToBranch] = useState('All Branches');

  // Transfers List State
  const [transfers, setTransfers] = useState(MOCK_TRANSFERS);

  const [selectedTransferForAction, setSelectedTransferForAction] = useState(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);


  // New Transfer Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    fromBranch: 'Main Branch',
    toBranch: 'Downtown Branch',
    product: 'Paracetamol 500mg',
    batch: 'B-1001',
    // TODO: Should come from inventory lookup
    availableQuantity: typeof item !== 'undefined' ? item?.stock || 0 : 0,
    transferQuantity: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState({});

  // Filtered Transfers
  const filteredTransfers = transfers.filter((tr) => {
    const matchesSearch =
      tr.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tr.fromBranch.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tr.toBranch.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tr.createdBy.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === 'All Statuses' || tr.status === selectedStatus;

    const matchesFrom =
      fromBranch === 'All Branches' || tr.fromBranch === fromBranch;

    const matchesTo =
      toBranch === 'All Branches' || tr.toBranch === toBranch;

    return matchesSearch && matchesStatus && matchesFrom && matchesTo;
  });

  // Loading & Pagination State
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isPageLoading, setIsPageLoading] = useState(false);

  // Dynamic Transfer KPI summary metrics
  const totalTransfers = transfers.length;
  const inTransitCount = transfers.filter((t) => t.status === 'In Transit').length;
  const completedCount = transfers.filter((t) => t.status === 'Completed').length;
  const draftCount = transfers.filter((t) => t.status === 'Draft' || t.status === 'Cancelled').length;

  const transferKpis = [
    { id: 'kpi-1', label: 'TOTAL TRANSFERS', value: String(totalTransfers), subtext: 'Total stock movements', variant: 'default', statusFilter: 'All Statuses' },
    { id: 'kpi-2', label: 'IN TRANSIT', value: String(inTransitCount), subtext: 'Dispatched & en route', variant: 'warning', statusFilter: 'In Transit' },
    { id: 'kpi-3', label: 'COMPLETED', value: String(completedCount), subtext: 'Received at branch', variant: 'success', statusFilter: 'Completed' },
    { id: 'kpi-4', label: 'DRAFT / OTHER', value: String(draftCount), subtext: 'Pending dispatch', variant: 'danger', statusFilter: 'Draft' },
  ];

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedStatus, fromBranch, toBranch]);

  const totalItems = filteredTransfers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (page - 1) * pageSize;
  const paginatedTransfers = filteredTransfers.slice(startIndex, startIndex + pageSize);

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

  const handleOpenActionMenu = (tr) => {
    setSelectedTransferForAction(tr);
    setActionMenuOpen(true);
  };

  const handleExecuteTransferAction = (actionKey) => {
    const tr = selectedTransferForAction;
    setActionMenuOpen(false);
    if (!tr) return;


    if (actionKey === 'in-transit') {
      setTransfers((prev) =>
        prev.map((item) => (item.id === tr.id ? { ...item, status: 'In Transit' } : item))
      );
      if (onShowToast) {
        onShowToast(`[PATCH /api/transfers/${tr.id}/status] Transfer ${tr.id} is now IN TRANSIT.`);
      }
      return;
    }

    if (actionKey === 'complete') {
      setTransfers((prev) =>
        prev.map((item) => (item.id === tr.id ? { ...item, status: 'Completed' } : item))
      );
      if (onShowToast) {
        onShowToast(`[POST /api/transfers/${tr.id}/receive] Transfer ${tr.id} marked as COMPLETED.`);
      }
      return;
    }

    if (actionKey === 'cancel') {
      setTransfers((prev) =>
        prev.map((item) => (item.id === tr.id ? { ...item, status: 'Cancelled' } : item))
      );
      if (onShowToast) {
        onShowToast(`[POST /api/transfers/${tr.id}/cancel] Transfer ${tr.id} has been CANCELLED.`);
      }
      return;
    }

    if (actionKey === 'waybill') {
      if (onShowToast) {
        onShowToast(`🖨️ Generated Inter-Branch Stock Transit Waybill / Gate Pass for ${tr.id}`);
      }
      return;
    }
  };

  const handleOpenModal = () => {
    setFormData({
      fromBranch: 'Main Branch',
      toBranch: 'Downtown Branch',
      product: 'Paracetamol 500mg',
      batch: 'B-1001',
      availableQuantity: 500,
      transferQuantity: '',
      notes: '',
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleCreateTransfer = () => {
    const errors = {};
    if (!formData.fromBranch) errors.fromBranch = 'Source branch required';
    if (!formData.toBranch) errors.toBranch = 'Destination branch required';
    if (formData.fromBranch === formData.toBranch) {
      errors.toBranch = 'Destination branch must be different';
    }
    if (!formData.product.trim()) errors.product = 'Product is required';
    if (!formData.batch.trim()) errors.batch = 'Batch is required';
    if (
      !formData.transferQuantity.trim() ||
      isNaN(formData.transferQuantity) ||
      Number(formData.transferQuantity) <= 0 ||
      Number(formData.transferQuantity) > formData.availableQuantity
    ) {
      errors.transferQuantity = `Enter valid quantity (1 - ${formData.availableQuantity})`;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const newTransfer = {
      id: 'TR-' + Date.now().toString(36).toUpperCase(),
      fromBranch: formData.fromBranch,
      toBranch: formData.toBranch,
      transferDate: '29 Aug 2026',
      items: 1,
      totalQuantity: Number(formData.transferQuantity),
      status: 'In Transit',
      createdBy: 'Manager',
    };

    setTransfers((prev) => [newTransfer, ...prev]);
    setModalVisible(false);

    if (onShowToast) {
      onShowToast(`✓ Created transfer ${newTransfer.id} (${newTransfer.fromBranch} → ${newTransfer.toBranch})`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={true}
    >
      {/* Page Header (Screenshot 3 style) */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>Stock Transfer</Text>
          <Text style={styles.pageSubtitle}>
            Transfer stock between pharmacy branches and distribution nodes.
          </Text>
        </View>
        <View style={styles.headerRightActions}>

          <Pressable
            onPress={handleOpenModal}
            style={styles.newTransferButton}
            accessibilityRole="button"
            accessibilityLabel="+ New Transfer"
          >
            <Text style={styles.newTransferIcon}>+</Text>
            <Text style={styles.newTransferText}>New Transfer</Text>
          </Pressable>
        </View>
      </View>

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
          transferKpis.map((kpi) => (
            <InventoryStatCard
              key={kpi.id}
              label={kpi.label}
              value={kpi.value}
              subtext={kpi.subtext}
              variant={kpi.variant}
              onPress={() => {
                setSelectedStatus(kpi.statusFilter);
                if (onShowToast) onShowToast(`Filtered by: ${kpi.label}`);
              }}
            />
          ))
        )}
      </View>

      {/* Main Table Card (Screenshot 3 style) */}
      <View style={styles.cardContainer}>
        {/* Search & Filter Header */}
        <View style={[styles.filtersBar, isCompact && styles.filtersBarCompact]}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search transfer ID, branch or reference..."
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

          {/* Filter Status & Branch Chips */}
          <View style={styles.filterChipRow}>
            {TRANSFER_STATUS_FILTER.map((st) => (
              <Pressable
                key={st}
                onPress={() => setSelectedStatus(st)}
                style={[
                  styles.filterChip,
                  selectedStatus === st && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedStatus === st && styles.filterChipTextActive,
                  ]}
                >
                  {st}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Section Title & Pagination Subheader */}
        <View style={styles.tableSubheader}>
          <Text style={styles.sectionTitle}>Recent Transfers</Text>
          <Text style={styles.paginationInfo}>
            Showing {totalItems > 0 ? startIndex + 1 : 0}–{Math.min(startIndex + pageSize, totalItems)} of {totalItems}
          </Text>
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
              <SkeletonTableRow columns={9} />
              <SkeletonTableRow columns={9} />
              <SkeletonTableRow columns={9} />
              <SkeletonTableRow columns={9} />
            </View>
          )
        ) : isMobile ? (
          /* Mobile Transfer Cards */
          <View style={styles.mobileCardList}>
            {paginatedTransfers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No transfers found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search keywords or filters.</Text>
              </View>
            ) : (
              paginatedTransfers.map((tr) => {
                const pill = STATUS_PILLS[tr.status] || STATUS_PILLS.Draft;
                return (
                  <View key={tr.id} style={styles.mobileTransferCard}>
                    <View style={styles.mobileTrHeader}>
                      <Text style={styles.mobileTrId}>{tr.id}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
                          <Text style={[styles.statusPillText, { color: pill.text }]}>
                            {tr.status}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => handleOpenActionMenu(tr)}
                          style={styles.mobileTrDotsBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Transfer Actions"
                        >
                          <Text style={styles.mobileTrDotsText}>⋮ Actions</Text>
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.mobileRouteRow}>
                      <Text style={styles.mobileFromBranch}>{tr.fromBranch}</Text>
                      <Text style={styles.mobileArrow}>→</Text>
                      <Text style={styles.mobileToBranch}>{tr.toBranch}</Text>
                    </View>

                    <View style={styles.mobileGrid}>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Date</Text>
                        <Text style={styles.mobileVal}>{tr.transferDate}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Total Qty</Text>
                        <Text style={[styles.mobileValBold, { color: '#0F766E' }]}>{tr.totalQuantity} units</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Item Lines</Text>
                        <Text style={styles.mobileValBold}>{tr.items} items</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Initiated By</Text>
                        <Text style={styles.mobileVal}>{tr.createdBy}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          /* Transfers Table */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Header Row */}
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 110 }]}>TRANSFER ID</Text>
                <Text style={[styles.thCell, { width: 150 }]}>FROM BRANCH</Text>
                <Text style={[styles.thCell, { width: 150 }]}>TO BRANCH</Text>
                <Text style={[styles.thCell, { width: 130 }]}>TRANSFER DATE</Text>
                <Text style={[styles.thCell, { width: 80, textAlign: 'center' }]}>ITEMS</Text>
                <Text style={[styles.thCell, { width: 120, textAlign: 'center' }]}>TOTAL QUANTITY</Text>
                <Text style={[styles.thCell, { width: 120, textAlign: 'center' }]}>STATUS</Text>
                <Text style={[styles.thCell, { width: 120 }]}>CREATED BY</Text>
                <Text style={[styles.thCell, { width: 80, textAlign: 'center' }]}>ACTIONS</Text>
              </View>

              {/* Table Rows */}
              {paginatedTransfers.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No transfers found</Text>
                  <Text style={styles.emptySubtitle}>Try changing your search keywords or filters.</Text>
                </View>
              ) : (
                paginatedTransfers.map((tr, index) => {
                  const pill = STATUS_PILLS[tr.status] || STATUS_PILLS.Draft;
                  return (
                    <View
                      key={tr.id}
                      style={[
                        styles.tableRow,
                        index % 2 === 1 && styles.tableRowAlt,
                      ]}
                    >
                      <Text style={[styles.tdCell, styles.transferId, { width: 110 }]}>
                        {tr.id}
                      </Text>
                      <Text style={[styles.tdCell, { width: 150 }]}>{tr.fromBranch}</Text>
                      <Text style={[styles.tdCell, { width: 150 }]}>{tr.toBranch}</Text>
                      <Text style={[styles.tdCell, { width: 130 }]}>{tr.transferDate}</Text>
                      <Text style={[styles.tdCell, { width: 80, textAlign: 'center', fontWeight: '600' }]}>
                        {tr.items}
                      </Text>
                      <Text style={[styles.tdCell, { width: 120, textAlign: 'center', fontWeight: '700' }]}>
                        {tr.totalQuantity}
                      </Text>

                      {/* Status Pill */}
                      <View style={[styles.statusCell, { width: 120 }]}>
                        <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
                          <Text style={[styles.statusPillText, { color: pill.text }]}>
                            {tr.status}
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.tdCell, { width: 120 }]}>{tr.createdBy}</Text>

                      {/* Actions Menu */}
                      <Pressable
                        onPress={() => handleOpenActionMenu(tr)}
                        style={[styles.actionDotsBtn, { width: 80 }]}
                        accessibilityRole="button"
                        accessibilityLabel="Transfer Actions"
                      >
                        <Text style={styles.actionDotsText}>⋮</Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        )}

        {/* Dynamic Pagination Controls */}
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

      {/* New Transfer Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Stock Transfer</Text>
              <Pressable onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Branch Selection Row */}
              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    From Branch <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.fromBranch}
                    onChangeText={(t) => setFormData((p) => ({ ...p, fromBranch: t }))}
                  />
                  {formErrors.fromBranch && (
                    <Text style={styles.errorText}>{formErrors.fromBranch}</Text>
                  )}
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    To Branch <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.toBranch}
                    onChangeText={(t) => setFormData((p) => ({ ...p, toBranch: t }))}
                  />
                  {formErrors.toBranch && (
                    <Text style={styles.errorText}>{formErrors.toBranch}</Text>
                  )}
                </View>
              </View>

              {/* Product & Batch Row */}
              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Product <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.product}
                    onChangeText={(t) => setFormData((p) => ({ ...p, product: t }))}
                  />
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Batch <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.batch}
                    onChangeText={(t) => setFormData((p) => ({ ...p, batch: t }))}
                  />
                </View>
              </View>

              {/* Quantities Row */}
              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Available Quantity</Text>
                  <TextInput
                    style={[styles.modalInput, styles.inputReadOnly]}
                    editable={false}
                    value={`${formData.availableQuantity} units`}
                  />
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Transfer Quantity <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.modalInput, formErrors.transferQuantity && styles.inputError]}
                    keyboardType="numeric"
                    placeholder="Enter units to send"
                    placeholderTextColor="#94A3B8"
                    value={formData.transferQuantity}
                    onChangeText={(t) => setFormData((p) => ({ ...p, transferQuantity: t }))}
                  />
                  {formErrors.transferQuantity && (
                    <Text style={styles.errorText}>{formErrors.transferQuantity}</Text>
                  )}
                </View>
              </View>

              {/* Notes */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Transfer Notes / Reference</Text>
                <TextInput
                  style={[styles.modalInput, styles.textArea]}
                  multiline
                  numberOfLines={3}
                  placeholder="Reference notes for logistics staff..."
                  placeholderTextColor="#94A3B8"
                  value={formData.notes}
                  onChangeText={(t) => setFormData((p) => ({ ...p, notes: t }))}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateTransfer}
                style={styles.submitModalButton}
              >
                <Text style={styles.submitModalButtonText}>Create Transfer</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 2. TRANSFER 3-DOTS ACTION MENU MODAL */}
      <Modal
        visible={actionMenuOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setActionMenuOpen(false)}
      >
        <View style={styles.modalOverlayAction}>
          <View style={styles.actionMenuCard}>
            <View style={styles.actionMenuHeader}>
              <View>
                <Text style={styles.actionMenuTitle}>Transfer {selectedTransferForAction?.id}</Text>
                <Text style={styles.actionMenuRoute}>
                  {selectedTransferForAction?.fromBranch} ➔ {selectedTransferForAction?.toBranch}
                </Text>
              </View>
              <Pressable onPress={() => setActionMenuOpen(false)} style={styles.closeActionBtn}>
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.actionList}>
              <Pressable
                onPress={() => handleExecuteTransferAction('in-transit')}
                style={styles.actionItem}
              >
                <Text style={styles.actionItemIcon}>🚚</Text>
                <View style={styles.actionItemTextCol}>
                  <Text style={styles.actionItemTitle}>Mark as In-Transit</Text>
                  <Text style={styles.actionItemSubtitle}>Dispatched with courier / van for delivery</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteTransferAction('complete')}
                style={styles.actionItem}
              >
                <Text style={styles.actionItemIcon}>✅</Text>
                <View style={styles.actionItemTextCol}>
                  <Text style={styles.actionItemTitle}>Receive & Complete</Text>
                  <Text style={styles.actionItemSubtitle}>Accept incoming stock at destination pharmacy</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteTransferAction('waybill')}
                style={styles.actionItem}
              >
                <Text style={styles.actionItemIcon}>🖨️</Text>
                <View style={styles.actionItemTextCol}>
                  <Text style={styles.actionItemTitle}>Print Transfer Gate Pass</Text>
                  <Text style={styles.actionItemSubtitle}>Official pharmacy transit manifesto</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteTransferAction('cancel')}
                style={[styles.actionItem, styles.actionItemDanger]}
              >
                <Text style={styles.actionItemIcon}>❌</Text>
                <View style={styles.actionItemTextCol}>
                  <Text style={[styles.actionItemTitle, { color: '#DC2626' }]}>Cancel Transfer</Text>
                  <Text style={styles.actionItemSubtitle}>Release locked stock back to source branch</Text>
                </View>
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
    gap: 12,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 4,
  },
  newTransferButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  newTransferButtonHovered: {
    backgroundColor: '#0D9488',
  },
  newTransferIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 6,
  },
  newTransferText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  kpiRowCompact: {
    gap: 12,
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
  /* Mobile Transfer Card Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobileTransferCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  mobileTrHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  mobileTrId: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F766E',
  },
  mobileRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  mobileFromBranch: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  mobileArrow: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  mobileToBranch: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F766E',
    flex: 1,
    textAlign: 'right',
  },
  mobileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
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
  filterChipRow: {
    flexDirection: 'row',
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
    minWidth: 1050,
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
  transferId: {
    fontWeight: '700',
    color: '#0F172A',
  },
  statusCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  actionDotsBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  actionDotsText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
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
  paginationFooter: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
    alignItems: 'flex-end',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  pageBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  pageBtnActive: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnTextActive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pageBtnDisabled: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
  },
  pageBtnTextDisabled: {
    fontSize: 12,
    color: '#94A3B8',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 580,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
    }),
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
    maxHeight: 480,
  },
  formRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  formFieldHalf: {
    flex: 1,
  },
  fieldGroup: {
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
  inputReadOnly: {
    backgroundColor: '#F8FAFC',
    color: '#64748B',
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
  textArea: {
    height: 70,
    paddingTop: 8,
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
  cancelButton: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 6,
    cursor: 'pointer',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  submitModalButton: {
    backgroundColor: '#0F766E',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 8,
    cursor: 'pointer',
  },
  submitModalButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  devGuideBtnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    cursor: 'pointer',
  },
  devGuideBtnTopIcon: {
    fontSize: 13,
  },
  devGuideBtnTopText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  filterTogglesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  filterTogglePillActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0F766E',
  },
  filterToggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#94A3B8',
  },
  filterToggleDotActive: {
    backgroundColor: '#0F766E',
  },
  filterToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  filterToggleTextActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  mobileTrDotsBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    cursor: 'pointer',
  },
  mobileTrDotsText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  modalOverlayAction: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  actionMenuCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  actionMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  actionMenuTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionMenuRoute: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  closeActionBtn: {
    padding: 6,
    cursor: 'pointer',
  },
  closeActionText: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '700',
  },
  actionList: {
    padding: 10,
    gap: 4,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  actionItemDanger: {
    backgroundColor: '#FEF2F2',
  },
  actionItemDev: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    marginTop: 4,
  },
  actionItemIcon: {
    fontSize: 18,
  },
  actionItemTextCol: {
    flex: 1,
  },
  actionItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionItemSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  devGuideModalCard: {
    width: '100%',
    maxWidth: 780,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  devGuideModalCardMobile: {
    maxHeight: '95%',
  },
  devGuideModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  devGuideTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  devGuideIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  devGuideIconText: {
    fontSize: 18,
  },
  devGuideModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  devGuideModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  devGuideModalBody: {
    padding: 20,
  },
  guideSec: {
    marginBottom: 20,
  },
  guideSecTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F766E',
    marginBottom: 6,
  },
  guideSecDesc: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 8,
  },
  codeSnippet: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
    marginTop: 6,
  },
  codeSnippetText: {
    color: '#38BDF8',
    fontSize: 11.5,
    fontFamily: Platform.select({ web: 'Consolas, Monaco, monospace', default: 'System' }),
    lineHeight: 17,
  },
  endpointCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  endpointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  methodPatch: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  methodPost: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  methodText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  endpointRoute: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: Platform.select({ web: 'monospace', default: 'System' }),
  },
  endpointDesc: {
    fontSize: 12,
    color: '#475569',
  },
  devGuideModalFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'flex-end',
  },
  closeDevGuideModalBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  closeDevGuideModalBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});

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

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All Statuses');
  const [fromBranch, setFromBranch] = useState('All Branches');
  const [toBranch, setToBranch] = useState('All Branches');

  // Transfers List State
  const [transfers, setTransfers] = useState(MOCK_TRANSFERS);

  // New Transfer Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    fromBranch: 'Main Branch',
    toBranch: 'Downtown Branch',
    product: 'Paracetamol 500mg',
    batch: 'B-1001',
    availableQuantity: 500,
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
      id: `TR-0${transfers.length + 1}`,
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
          <Text style={styles.paginationInfo}>Showing 1-{filteredTransfers.length} of 29</Text>
        </View>

        {/* Transfers Table */}
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
            {filteredTransfers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No transfers found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search keywords or filters.</Text>
              </View>
            ) : (
              filteredTransfers.map((tr, index) => {
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
                      onPress={() => onShowToast && onShowToast(`Options for ${tr.id}`)}
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

        {/* Bottom Pagination */}
        <View style={styles.paginationFooter}>
          <View style={styles.paginationRow}>
            <Pressable style={styles.pageBtnDisabled}>
              <Text style={styles.pageBtnTextDisabled}>‹</Text>
            </Pressable>
            <View style={styles.pageBtnActive}>
              <Text style={styles.pageBtnTextActive}>1</Text>
            </View>
            <Pressable style={styles.pageBtn}>
              <Text style={styles.pageBtnText}>2</Text>
            </Pressable>
            <Pressable style={styles.pageBtn}>
              <Text style={styles.pageBtnText}>3</Text>
            </Pressable>
            <Pressable style={styles.pageBtn}>
              <Text style={styles.pageBtnText}>›</Text>
            </Pressable>
          </View>
        </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
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
});

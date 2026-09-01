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
  GRN_KPIS,
  MOCK_GRN_LIST,
  GRN_STATUS_FILTER,
} from '../../data/goodsReceivingMockData';

const GRN_STATUS_BADGES = {
  Verified: { bg: '#DCFCE7', text: '#15803D' },
  'Pending Inspection': { bg: '#FEF3C7', text: '#B45309' },
  Discrepancy: { bg: '#FEE2E2', text: '#B91C1C' },
};

export default function GoodsReceivingScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All Statuses');
  const [grnList, setGrnList] = useState(MOCK_GRN_LIST);

  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    poReference: 'PO-1024',
    supplier: 'Cipla Healthcare',
    invoiceNo: 'INV-CIP-8821',
    packagesCount: '4 Boxes',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState({});

  const filteredGRNs = grnList.filter((grn) => {
    const matchesSearch =
      grn.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      grn.poReference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      grn.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      grn.invoiceNo.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === 'All Statuses' || grn.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  const handleOpenModal = () => {
    setFormData({
      poReference: 'PO-1024',
      supplier: 'Cipla Healthcare',
      invoiceNo: 'INV-CIP-8821',
      packagesCount: '4 Boxes',
      notes: '',
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleReceiveShipment = () => {
    const errors = {};
    if (!formData.poReference.trim()) errors.poReference = 'PO Reference is required';
    if (!formData.supplier.trim()) errors.supplier = 'Supplier is required';
    if (!formData.invoiceNo.trim()) errors.invoiceNo = 'Invoice No is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const newGRN = {
      id: `GRN-2026-${8826 + grnList.length}`,
      poReference: formData.poReference,
      supplier: formData.supplier,
      receivedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      receivedBy: 'Manager',
      itemsCount: 1,
      packagesCount: formData.packagesCount || '1 Box',
      invoiceNo: formData.invoiceNo,
      status: 'Verified',
    };

    setGrnList((prev) => [newGRN, ...prev]);
    setModalVisible(false);

    if (onShowToast) {
      onShowToast(`✓ Successfully generated ${newGRN.id} for ${newGRN.supplier}! Stock added.`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, isMobile && styles.contentContainerMobile]}
      showsVerticalScrollIndicator={true}
    >
      {/* Header Row */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View>
          <Text style={styles.pageTitle}>Goods Receiving (GRN)</Text>
          <Text style={styles.pageSubtitle}>
            Inspect, verify packages and record batch goods receipt notes against vendor purchase orders.
          </Text>
        </View>
        <Pressable
          onPress={handleOpenModal}
          style={styles.receiveButton}
          accessibilityRole="button"
          accessibilityLabel="Receive New Shipment"
        >
          <Text style={styles.receiveText}>+ Receive Shipment</Text>
        </Pressable>
      </View>

      {/* Top 4 KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {GRN_KPIS.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext={kpi.subtext}
            variant={kpi.variant}
            onPress={() => onShowToast && onShowToast(`Filter: ${kpi.label}`)}
          />
        ))}
      </View>

      {/* Main GRN Table Card */}
      <View style={styles.cardContainer}>
        {/* Filters Bar */}
        <View style={[styles.filtersBar, isCompact && styles.filtersBarCompact]}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search GRN, PO reference, supplier, invoice..."
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

          {/* Status Filter Chips */}
          <View style={styles.filterChipRow}>
            {GRN_STATUS_FILTER.map((st) => (
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

        {isMobile ? (
          /* Mobile GRN Cards */
          <View style={styles.mobileCardList}>
            {filteredGRNs.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No goods received records found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search filters.</Text>
              </View>
            ) : (
              filteredGRNs.map((grn) => {
                const badge = GRN_STATUS_BADGES[grn.status] || GRN_STATUS_BADGES.Verified;
                return (
                  <View key={grn.id} style={styles.mobileGRNCard}>
                    <View style={styles.mobileGRNHeader}>
                      <View>
                        <Text style={styles.mobileGRNId}>{grn.id}</Text>
                        <Text style={styles.mobileSupplierName}>{grn.supplier}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                          {grn.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.mobileGrid}>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>PO Reference</Text>
                        <Text style={styles.mobileValBold}>{grn.poReference}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Invoice No.</Text>
                        <Text style={styles.mobileValBold}>{grn.invoiceNo}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Received Date</Text>
                        <Text style={styles.mobileVal}>{grn.receivedDate}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Packages / Items</Text>
                        <Text style={styles.mobileVal}>{grn.packagesCount} • {grn.itemsCount} items</Text>
                      </View>
                      <View style={styles.mobileGridColFull}>
                        <Text style={styles.mobileLabel}>Inspected & Received By</Text>
                        <Text style={styles.mobileVal}>{grn.receivedBy}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          /* Desktop GRN Table */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 140 }]}>GRN NUMBER</Text>
                <Text style={[styles.thCell, { width: 110 }]}>PO REF</Text>
                <Text style={[styles.thCell, { width: 170 }]}>SUPPLIER</Text>
                <Text style={[styles.thCell, { width: 120 }]}>RECEIVED DATE</Text>
                <Text style={[styles.thCell, { width: 130 }]}>RECEIVED BY</Text>
                <Text style={[styles.thCell, { width: 80, textAlign: 'center' }]}>ITEMS</Text>
                <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>PACKAGES</Text>
                <Text style={[styles.thCell, { width: 130 }]}>INVOICE NO</Text>
                <Text style={[styles.thCell, { width: 140, textAlign: 'center' }]}>STATUS</Text>
              </View>

              {/* Table Rows */}
              {filteredGRNs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No goods received records found</Text>
                  <Text style={styles.emptySubtitle}>Try changing your search filters.</Text>
                </View>
              ) : (
                filteredGRNs.map((grn, index) => {
                  const badge = GRN_STATUS_BADGES[grn.status] || GRN_STATUS_BADGES.Verified;
                  return (
                    <View
                      key={grn.id}
                      style={[
                        styles.tableRow,
                        index % 2 === 1 && styles.tableRowAlt,
                      ]}
                    >
                      <Text style={[styles.tdCell, styles.grnId, { width: 140 }]}>{grn.id}</Text>
                      <Text style={[styles.tdCell, styles.poRef, { width: 110 }]}>{grn.poReference}</Text>
                      <Text style={[styles.tdCell, styles.supplierText, { width: 170 }]} numberOfLines={1}>
                        {grn.supplier}
                      </Text>
                      <Text style={[styles.tdCell, { width: 120 }]}>{grn.receivedDate}</Text>
                      <Text style={[styles.tdCell, { width: 130 }]}>{grn.receivedBy}</Text>
                      <Text style={[styles.tdCell, { width: 80, textAlign: 'center', fontWeight: '600' }]}>
                        {grn.itemsCount}
                      </Text>
                      <Text style={[styles.tdCell, { width: 90, textAlign: 'center' }]}>
                        {grn.packagesCount}
                      </Text>
                      <Text style={[styles.tdCell, { width: 130 }]}>{grn.invoiceNo}</Text>

                      {/* Status Badge */}
                      <View style={[styles.statusWrapper, { width: 140 }]}>
                        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                            {grn.status}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Receive Shipment Modal */}
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
              <Text style={styles.modalTitle}>Receive Goods Shipment</Text>
              <Pressable onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    PO Reference <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.poReference}
                    onChangeText={(t) => setFormData((p) => ({ ...p, poReference: t }))}
                  />
                  {formErrors.poReference && (
                    <Text style={styles.errorText}>{formErrors.poReference}</Text>
                  )}
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Supplier <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.supplier}
                    onChangeText={(t) => setFormData((p) => ({ ...p, supplier: t }))}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Supplier Invoice No. <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.invoiceNo}
                    onChangeText={(t) => setFormData((p) => ({ ...p, invoiceNo: t }))}
                  />
                  {formErrors.invoiceNo && (
                    <Text style={styles.errorText}>{formErrors.invoiceNo}</Text>
                  )}
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Packages / Cartons Count</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={formData.packagesCount}
                    onChangeText={(t) => setFormData((p) => ({ ...p, packagesCount: t }))}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Receiving Inspection Notes</Text>
                <TextInput
                  style={[styles.modalInput, styles.textArea]}
                  multiline
                  numberOfLines={3}
                  placeholder="Note package seal conditions, temperature logs..."
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
                onPress={handleReceiveShipment}
                style={styles.submitModalButton}
              >
                <Text style={styles.submitModalButtonText}>Confirm & Add to Stock</Text>
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
  receiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  receiveShipmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  btnIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  receiveButtonHovered: {
    backgroundColor: '#0D9488',
  },
  receiveText: {
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
  /* Mobile GRN Card Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobileGRNCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  mobileGRNHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  mobileGRNId: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F766E',
  },
  mobileSupplierName: {
    fontSize: 13,
    fontWeight: '600',
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
  tableWrapper: {
    minWidth: 1100,
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
  grnId: {
    fontWeight: '700',
    color: '#0F766E',
  },
  poRef: {
    fontWeight: '600',
    color: '#2563EB',
  },
  supplierText: {
    fontWeight: '600',
    color: '#0F172A',
  },
  statusWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
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

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
  PURCHASES_KPIS,
  MOCK_PURCHASE_ORDERS_LIST,
  PO_STATUS_FILTER,
} from '../../data/purchasesMockData';

const PO_STATUS_BADGES = {
  Pending: { bg: '#FEF3C7', text: '#B45309' },
  Approved: { bg: '#DBEAFE', text: '#1D4ED8' },
  Received: { bg: '#DCFCE7', text: '#15803D' },
  'Partially Received': { bg: '#F3E8FF', text: '#7E22CE' },
  Cancelled: { bg: '#FEE2E2', text: '#B91C1C' },
};

export default function PurchasesScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All Statuses');

  // Purchase Orders List
  const [orders, setOrders] = useState(MOCK_PURCHASE_ORDERS_LIST);

  // New PO Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    supplier: 'Sun Pharma Care',
    expectedDate: '05 Sep 2026',
    branch: 'Main Branch',
    medicine: 'Paracetamol 500mg (Box of 100)',
    quantity: '10',
    unitPrice: '120.00',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState({});

  // Filtered List
  const filteredOrders = orders.filter((po) => {
    const matchesSearch =
      po.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.branch.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === 'All Statuses' || po.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  const handleOpenModal = () => {
    setFormData({
      supplier: 'Sun Pharma Care',
      expectedDate: '05 Sep 2026',
      branch: 'Main Branch',
      medicine: 'Paracetamol 500mg (Box of 100)',
      quantity: '10',
      unitPrice: '120.00',
      notes: '',
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleCreatePO = () => {
    const errors = {};
    if (!formData.supplier.trim()) errors.supplier = 'Supplier is required';
    if (!formData.medicine.trim()) errors.medicine = 'Medicine/Product is required';
    if (!formData.quantity.trim() || isNaN(formData.quantity) || Number(formData.quantity) <= 0) {
      errors.quantity = 'Valid quantity is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const calculatedTotal = (Number(formData.quantity) * Number(formData.unitPrice || 100)).toFixed(2);
    const newPO = {
      id: `PO-${1026 + orders.length}`,
      supplier: formData.supplier,
      orderDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      expectedDate: formData.expectedDate || '05 Sep 2026',
      amount: `₹${Number(calculatedTotal).toLocaleString('en-IN')}`,
      itemsCount: Number(formData.quantity),
      status: 'Pending',
      branch: formData.branch || 'Main Branch',
      createdBy: 'Manager',
    };

    setOrders((prev) => [newPO, ...prev]);
    setModalVisible(false);

    if (onShowToast) {
      onShowToast(`✓ Created Purchase Order ${newPO.id} for ${newPO.supplier}!`);
    }
  };

  const handleReceiveStockShortcut = (po) => {
    if (onNavigate) {
      onNavigate('goods-receiving');
    }
    if (onShowToast) {
      onShowToast(`Switched to Goods Receiving for ${po.id}`);
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
          <Text style={styles.pageTitle}>Purchases</Text>
          <Text style={styles.pageSubtitle}>
            Create, track and manage vendor purchase orders and incoming supply lines.
          </Text>
        </View>
        <Pressable
          onPress={handleOpenModal}
          style={styles.newPOButton}
          accessibilityRole="button"
          accessibilityLabel="New Purchase Order"
        >
          <Text style={styles.newPOIcon}>+</Text>
          <Text style={styles.newPOText}>New Purchase Order</Text>
        </Pressable>
      </View>

      {/* Top 4 KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {PURCHASES_KPIS.map((kpi) => (
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

      {/* Main Table Card */}
      <View style={styles.cardContainer}>
        {/* Search & Filter Header */}
        <View style={[styles.filtersBar, isCompact && styles.filtersBarCompact]}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search PO number, supplier or branch..."
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
            {PO_STATUS_FILTER.map((st) => (
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
          /* Mobile Purchase Order Cards (No horizontal scroll) */
          <View style={styles.mobileCardList}>
            {filteredOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No purchase orders found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search keywords.</Text>
              </View>
            ) : (
              filteredOrders.map((po) => {
                const badge = PO_STATUS_BADGES[po.status] || PO_STATUS_BADGES.Pending;
                return (
                  <View key={po.id} style={styles.mobilePOCard}>
                    {/* Header: PO ID & Status Badge */}
                    <View style={styles.mobilePOHeader}>
                      <View>
                        <Text style={styles.mobilePOId}>{po.id}</Text>
                        <Text style={styles.mobilePOSupplier}>{po.supplier}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                          {po.status}
                        </Text>
                      </View>
                    </View>

                    {/* PO Details Grid */}
                    <View style={styles.mobileGrid}>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Order Date</Text>
                        <Text style={styles.mobileVal}>{po.orderDate}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Expected Delivery</Text>
                        <Text style={styles.mobileVal}>{po.expectedDate}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Total Amount</Text>
                        <Text style={[styles.mobileValBold, { color: '#0F172A' }]}>{po.amount}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Items Count</Text>
                        <Text style={styles.mobileValBold}>{po.itemsCount} units</Text>
                      </View>
                      <View style={styles.mobileGridColFull}>
                        <Text style={styles.mobileLabel}>Destination Branch</Text>
                        <Text style={styles.mobileVal}>{po.branch}</Text>
                      </View>
                    </View>

                    {/* Action */}
                    <View style={styles.mobilePOFooter}>
                      <Pressable
                        onPress={() => handleReceiveStockShortcut(po)}
                        style={styles.mobileReceiveBtn}
                        accessibilityRole="button"
                      >
                        <Text style={styles.mobileReceiveBtnText}>Receive Stock →</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          /* Desktop Table View */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 110 }]}>PO NUMBER</Text>
                <Text style={[styles.thCell, { width: 180 }]}>SUPPLIER</Text>
                <Text style={[styles.thCell, { width: 120 }]}>ORDER DATE</Text>
                <Text style={[styles.thCell, { width: 120 }]}>EXPECTED</Text>
                <Text style={[styles.thCell, { width: 120, textAlign: 'right' }]}>AMOUNT</Text>
                <Text style={[styles.thCell, { width: 80, textAlign: 'center' }]}>ITEMS</Text>
                <Text style={[styles.thCell, { width: 130 }]}>BRANCH</Text>
                <Text style={[styles.thCell, { width: 130, textAlign: 'center' }]}>STATUS</Text>
                <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>ACTION</Text>
              </View>

              {/* Rows */}
              {filteredOrders.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No purchase orders found</Text>
                  <Text style={styles.emptySubtitle}>Try changing your search keywords.</Text>
                </View>
              ) : (
                filteredOrders.map((po, index) => {
                  const badge = PO_STATUS_BADGES[po.status] || PO_STATUS_BADGES.Pending;
                  return (
                    <View
                      key={po.id}
                      style={[
                        styles.tableRow,
                        index % 2 === 1 && styles.tableRowAlt,
                      ]}
                    >
                      <Text style={[styles.tdCell, styles.poId, { width: 110 }]}>{po.id}</Text>
                      <Text style={[styles.tdCell, styles.supplierName, { width: 180 }]} numberOfLines={1}>
                        {po.supplier}
                      </Text>
                      <Text style={[styles.tdCell, { width: 120 }]}>{po.orderDate}</Text>
                      <Text style={[styles.tdCell, { width: 120 }]}>{po.expectedDate}</Text>
                      <Text style={[styles.tdCell, styles.amountText, { width: 120, textAlign: 'right' }]}>
                        {po.amount}
                      </Text>
                      <Text style={[styles.tdCell, { width: 80, textAlign: 'center', fontWeight: '600' }]}>
                        {po.itemsCount}
                      </Text>
                      <Text style={[styles.tdCell, { width: 130 }]}>{po.branch}</Text>

                      {/* Status Badge */}
                      <View style={[styles.statusWrapper, { width: 130 }]}>
                        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                            {po.status}
                          </Text>
                        </View>
                      </View>

                      {/* Action Button */}
                      <View style={[styles.actionCell, { width: 110 }]}>
                        <Pressable
                          onPress={() => handleReceiveStockShortcut(po)}
                          style={styles.receiveBtn}
                        >
                          <Text style={styles.receiveBtnText}>Receive</Text>
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

      {/* New Purchase Order Modal */}
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
              <Text style={styles.modalTitle}>Create Purchase Order</Text>
              <Pressable onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Supplier <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.supplier}
                    onChangeText={(t) => setFormData((p) => ({ ...p, supplier: t }))}
                  />
                  {formErrors.supplier && (
                    <Text style={styles.errorText}>{formErrors.supplier}</Text>
                  )}
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Expected Delivery Date</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.expectedDate}
                    onChangeText={(t) => setFormData((p) => ({ ...p, expectedDate: t }))}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Branch</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.branch}
                    onChangeText={(t) => setFormData((p) => ({ ...p, branch: t }))}
                  />
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Medicine / Product <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.medicine}
                    onChangeText={(t) => setFormData((p) => ({ ...p, medicine: t }))}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Quantity (Boxes/Units) <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={formData.quantity}
                    onChangeText={(t) => setFormData((p) => ({ ...p, quantity: t }))}
                  />
                  {formErrors.quantity && (
                    <Text style={styles.errorText}>{formErrors.quantity}</Text>
                  )}
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Unit Purchase Price (₹)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={formData.unitPrice}
                    onChangeText={(t) => setFormData((p) => ({ ...p, unitPrice: t }))}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Order Notes / Instructions</Text>
                <TextInput
                  style={[styles.modalInput, styles.textArea]}
                  multiline
                  numberOfLines={3}
                  placeholder="Payment terms, delivery instructions..."
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
                onPress={handleCreatePO}
                style={styles.submitModalButton}
              >
                <Text style={styles.submitModalButtonText}>Create PO</Text>
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
  newPOButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  newPOButtonHovered: {
    backgroundColor: '#0D9488',
  },
  newPOIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 6,
  },
  newPOText: {
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
  /* Mobile Purchase Order Card Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobilePOCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  mobilePOHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  mobilePOId: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F766E',
  },
  mobilePOSupplier: {
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
  mobilePOFooter: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'flex-end',
  },
  mobileReceiveBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 6,
    cursor: 'pointer',
    width: '100%',
    alignItems: 'center',
  },
  mobileReceiveBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
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
    flexWrap: 'wrap',
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
  poId: {
    fontWeight: '700',
    color: '#0F766E',
  },
  supplierName: {
    fontWeight: '600',
    color: '#0F172A',
  },
  amountText: {
    fontWeight: '700',
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
  actionCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiveBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#2563EB',
    cursor: 'pointer',
  },
  receiveBtnText: {
    fontSize: 11.5,
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
